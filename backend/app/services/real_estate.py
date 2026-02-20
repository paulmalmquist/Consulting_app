from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.db import get_cursor


@dataclass
class UnderwriteCalcResult:
    inputs: dict[str, Any]
    outputs: dict[str, Any]


def _json_dumps(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except Exception:
        return None


def _annual_debt_service(balance_cents: int, interest_rate: float | None, amortization_years: int | None) -> float | None:
    if balance_cents <= 0:
        return 0.0
    if interest_rate is None:
        return None
    principal = balance_cents / 100.0
    if not amortization_years:
        return principal * interest_rate
    monthly_rate = interest_rate / 12.0
    periods = amortization_years * 12
    if monthly_rate <= 0:
        return principal / amortization_years
    numerator = principal * monthly_rate
    denominator = 1.0 - (1.0 + monthly_rate) ** (-periods)
    if denominator <= 0:
        return None
    return (numerator / denominator) * 12.0


def compute_underwrite_outputs(
    *,
    loan_row: dict[str, Any],
    latest_surveillance: dict[str, Any] | None,
    requested_inputs: dict[str, Any],
    prior_outputs: dict[str, Any] | None = None,
) -> UnderwriteCalcResult:
    cap_rate = _to_float(requested_inputs.get("cap_rate"))
    stabilized_noi_cents = _to_int(requested_inputs.get("stabilized_noi_cents"))
    if stabilized_noi_cents is None and latest_surveillance:
        stabilized_noi_cents = _to_int(latest_surveillance.get("noi_cents"))
    vacancy_factor = _to_float(requested_inputs.get("vacancy_factor"))
    expense_growth = _to_float(requested_inputs.get("expense_growth"))
    interest_rate = _to_float(requested_inputs.get("interest_rate"))
    if interest_rate is None:
        interest_rate = _to_float(loan_row.get("rate_decimal"))
    amortization_years = _to_int(requested_inputs.get("amortization_years"))
    current_balance_cents = int(loan_row.get("current_balance_cents") or 0)
    occupancy = _to_float(requested_inputs.get("occupancy"))
    if occupancy is None and latest_surveillance:
        occupancy = _to_float(latest_surveillance.get("occupancy"))

    risk_flags: list[str] = []
    if cap_rate is None:
        risk_flags.append("cap_rate_missing")
    if stabilized_noi_cents is None:
        risk_flags.append("noi_missing")

    noi = (stabilized_noi_cents or 0) / 100.0
    value = None
    if cap_rate and cap_rate > 0:
        value = noi / cap_rate

    ltv = None
    if value and value > 0:
        ltv = (current_balance_cents / 100.0) / value

    annual_debt_service = _annual_debt_service(current_balance_cents, interest_rate, amortization_years)
    dscr_est = None
    if annual_debt_service and annual_debt_service > 0:
        dscr_est = noi / annual_debt_service

    if ltv is not None and ltv > 0.85:
        risk_flags.append("ltv_above_85")
    if dscr_est is not None and dscr_est < 1.15:
        risk_flags.append("dscr_below_115")
    if occupancy is not None and occupancy < 0.85:
        risk_flags.append("occupancy_below_85")

    outputs: dict[str, Any] = {
        "value": value,
        "ltv": ltv,
        "dscr_est": dscr_est,
        "annual_debt_service_est": annual_debt_service,
        "risk_flags": risk_flags,
    }

    if prior_outputs:
        diff: dict[str, Any] = {}
        for k in ("value", "ltv", "dscr_est"):
            current = _to_float(outputs.get(k))
            prev = _to_float(prior_outputs.get(k))
            if current is not None and prev is not None:
                diff[f"{k}_delta"] = current - prev
        if diff:
            outputs["diff"] = diff

    normalized_inputs = {
        "cap_rate": cap_rate,
        "stabilized_noi_cents": stabilized_noi_cents,
        "vacancy_factor": vacancy_factor,
        "expense_growth": expense_growth,
        "interest_rate": interest_rate,
        "amortization_years": amortization_years,
    }
    return UnderwriteCalcResult(inputs=normalized_inputs, outputs=outputs)


def _require_business(cur, business_id: UUID) -> None:
    cur.execute("SELECT 1 FROM app.businesses WHERE business_id = %s", (str(business_id),))
    if not cur.fetchone():
        raise LookupError("Business not found")


def _require_trust(cur, *, trust_id: UUID, business_id: UUID) -> dict[str, Any]:
    cur.execute(
        "SELECT * FROM app.re_trusts WHERE trust_id = %s AND business_id = %s",
        (str(trust_id), str(business_id)),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError("Trust not found")
    return row


def _get_loan(cur, *, loan_id: UUID) -> dict[str, Any]:
    cur.execute("SELECT * FROM app.re_loans WHERE loan_id = %s", (str(loan_id),))
    row = cur.fetchone()
    if not row:
        raise LookupError("Loan not found")
    return row


def list_trusts(*, business_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        _require_business(cur, business_id)
        cur.execute(
            """
            SELECT trust_id, business_id, name, external_ids, created_by, created_at
            FROM app.re_trusts
            WHERE business_id = %s
            ORDER BY created_at DESC
            """,
            (str(business_id),),
        )
        return cur.fetchall()


def create_trust(*, business_id: UUID, name: str, external_ids: dict[str, Any], created_by: str | None) -> dict[str, Any]:
    with get_cursor() as cur:
        _require_business(cur, business_id)
        cur.execute(
            """
            INSERT INTO app.re_trusts (business_id, name, external_ids, created_by)
            VALUES (%s, %s, %s::jsonb, %s)
            RETURNING trust_id, business_id, name, external_ids, created_by, created_at
            """,
            (str(business_id), name, _json_dumps(external_ids), created_by),
        )
        return cur.fetchone()


def list_loans(*, business_id: UUID, trust_id: UUID | None = None) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        _require_business(cur, business_id)
        params: list[Any] = [str(business_id)]
        where = "business_id = %s"
        if trust_id:
            where += " AND trust_id = %s"
            params.append(str(trust_id))
        cur.execute(
            f"""
            SELECT loan_id, trust_id, business_id, loan_identifier, external_ids,
                   original_balance_cents, current_balance_cents, rate_decimal,
                   maturity_date, servicer_status::text AS servicer_status, metadata_json,
                   created_by, created_at
            FROM app.re_loans
            WHERE {where}
            ORDER BY created_at DESC
            """,
            params,
        )
        return cur.fetchall()


def create_loan(
    *,
    business_id: UUID,
    trust_id: UUID,
    loan_identifier: str,
    external_ids: dict[str, Any],
    original_balance_cents: int,
    current_balance_cents: int,
    rate_decimal: float | None,
    maturity_date: Any,
    servicer_status: str,
    metadata_json: dict[str, Any],
    borrowers: list[dict[str, Any]],
    properties: list[dict[str, Any]],
    created_by: str | None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        _require_trust(cur, trust_id=trust_id, business_id=business_id)
        cur.execute(
            """
            INSERT INTO app.re_loans (
              trust_id, business_id, loan_identifier, external_ids,
              original_balance_cents, current_balance_cents, rate_decimal, maturity_date,
              servicer_status, metadata_json, created_by
            ) VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s::app.re_servicer_status, %s::jsonb, %s)
            RETURNING loan_id, trust_id, business_id, loan_identifier, external_ids,
                      original_balance_cents, current_balance_cents, rate_decimal,
                      maturity_date, servicer_status::text AS servicer_status, metadata_json,
                      created_by, created_at
            """,
            (
                str(trust_id),
                str(business_id),
                loan_identifier,
                _json_dumps(external_ids),
                original_balance_cents,
                current_balance_cents,
                rate_decimal,
                maturity_date,
                servicer_status,
                _json_dumps(metadata_json),
                created_by,
            ),
        )
        loan = cur.fetchone()

        for b in borrowers:
            cur.execute(
                """
                INSERT INTO app.re_borrowers (loan_id, business_id, name, sponsor, contacts_json, created_by)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                """,
                (
                    str(loan["loan_id"]),
                    str(business_id),
                    b.get("name"),
                    b.get("sponsor"),
                    _json_dumps(b.get("contacts_json", [])),
                    created_by,
                ),
            )
        for p in properties:
            cur.execute(
                """
                INSERT INTO app.re_properties (
                  loan_id, business_id, address_line1, address_line2, city, state, postal_code, country,
                  property_type, square_feet, unit_count, metadata_json, created_by
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                """,
                (
                    str(loan["loan_id"]),
                    str(business_id),
                    p.get("address_line1"),
                    p.get("address_line2"),
                    p.get("city"),
                    p.get("state"),
                    p.get("postal_code"),
                    p.get("country", "US"),
                    p.get("property_type"),
                    p.get("square_feet"),
                    p.get("unit_count"),
                    _json_dumps(p.get("metadata_json", {})),
                    created_by,
                ),
            )
        return loan


def get_loan_detail(*, loan_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        loan = _get_loan(cur, loan_id=loan_id)
        cur.execute(
            """
            SELECT borrower_id, loan_id, business_id, name, sponsor, contacts_json, created_by, created_at
            FROM app.re_borrowers
            WHERE loan_id = %s
            ORDER BY created_at DESC
            """,
            (str(loan_id),),
        )
        borrowers = cur.fetchall()
        cur.execute(
            """
            SELECT property_id, loan_id, business_id, address_line1, address_line2, city, state, postal_code, country,
                   property_type, square_feet, unit_count, metadata_json, created_by, created_at
            FROM app.re_properties
            WHERE loan_id = %s
            ORDER BY created_at DESC
            """,
            (str(loan_id),),
        )
        properties = cur.fetchall()
        cur.execute(
            """
            SELECT surveillance_id, period_end_date, metrics_json, dscr, occupancy, noi_cents, notes, created_by, created_at
            FROM app.re_surveillance_periods
            WHERE loan_id = %s
            ORDER BY period_end_date DESC, created_at DESC
            LIMIT 1
            """,
            (str(loan_id),),
        )
        latest_surveillance = cur.fetchone()
        return {
            "loan": loan,
            "borrowers": borrowers,
            "properties": properties,
            "latest_surveillance": latest_surveillance,
        }


def list_surveillance(*, loan_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        _get_loan(cur, loan_id=loan_id)
        cur.execute(
            """
            SELECT surveillance_id, loan_id, business_id, period_end_date, metrics_json, dscr, occupancy, noi_cents, notes, created_by, created_at
            FROM app.re_surveillance_periods
            WHERE loan_id = %s
            ORDER BY period_end_date DESC, created_at DESC
            """,
            (str(loan_id),),
        )
        return cur.fetchall()


def create_surveillance(
    *,
    loan_id: UUID,
    business_id: UUID,
    period_end_date: Any,
    metrics_json: dict[str, Any],
    dscr: float | None,
    occupancy: float | None,
    noi_cents: int | None,
    notes: str | None,
    created_by: str | None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        loan = _get_loan(cur, loan_id=loan_id)
        if str(loan["business_id"]) != str(business_id):
            raise LookupError("Loan does not belong to business")
        cur.execute(
            """
            INSERT INTO app.re_surveillance_periods
              (loan_id, business_id, period_end_date, metrics_json, dscr, occupancy, noi_cents, notes, created_by)
            VALUES
              (%s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s)
            ON CONFLICT (loan_id, period_end_date)
            DO UPDATE SET metrics_json = EXCLUDED.metrics_json,
                          dscr = EXCLUDED.dscr,
                          occupancy = EXCLUDED.occupancy,
                          noi_cents = EXCLUDED.noi_cents,
                          notes = EXCLUDED.notes,
                          created_by = EXCLUDED.created_by
            RETURNING surveillance_id, loan_id, business_id, period_end_date, metrics_json, dscr, occupancy, noi_cents, notes, created_by, created_at
            """,
            (
                str(loan_id),
                str(business_id),
                period_end_date,
                _json_dumps(metrics_json),
                dscr,
                occupancy,
                noi_cents,
                notes,
                created_by,
            ),
        )
        return cur.fetchone()


def list_underwrite_runs(*, loan_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        _get_loan(cur, loan_id=loan_id)
        cur.execute(
            """
            SELECT underwrite_run_id, loan_id, business_id, execution_id, run_at, inputs_json, outputs_json,
                   document_ids, diff_from_run_id, created_by, version, created_at
            FROM app.re_underwrite_runs
            WHERE loan_id = %s
            ORDER BY version DESC
            """,
            (str(loan_id),),
        )
        return cur.fetchall()


def create_workout_case(
    *,
    loan_id: UUID,
    business_id: UUID,
    case_status: str,
    assigned_to: str | None,
    summary: str | None,
    created_by: str | None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        loan = _get_loan(cur, loan_id=loan_id)
        if str(loan["business_id"]) != str(business_id):
            raise LookupError("Loan does not belong to business")
        cur.execute(
            """
            INSERT INTO app.re_workout_cases (loan_id, business_id, case_status, assigned_to, summary, created_by)
            VALUES (%s, %s, %s::app.re_workout_case_status, %s, %s, %s)
            RETURNING case_id, loan_id, business_id, case_status::text AS case_status, opened_at, closed_at, assigned_to, summary, created_by, created_at
            """,
            (str(loan_id), str(business_id), case_status, assigned_to, summary, created_by),
        )
        row = cur.fetchone()
        row["actions"] = []
        return row


def list_workout_cases(*, loan_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        _get_loan(cur, loan_id=loan_id)
        cur.execute(
            """
            SELECT case_id, loan_id, business_id, case_status::text AS case_status, opened_at, closed_at, assigned_to, summary, created_by, created_at
            FROM app.re_workout_cases
            WHERE loan_id = %s
            ORDER BY opened_at DESC, created_at DESC
            """,
            (str(loan_id),),
        )
        rows = cur.fetchall()
        for row in rows:
            cur.execute(
                """
                SELECT action_id, case_id, business_id, action_type::text AS action_type, status::text AS status,
                       due_date, owner, summary, audit_log_json, document_ids, created_by, created_at
                FROM app.re_workout_actions
                WHERE case_id = %s
                ORDER BY created_at DESC
                """,
                (str(row["case_id"]),),
            )
            row["actions"] = cur.fetchall()
        return rows


def create_workout_action(
    *,
    case_id: UUID,
    business_id: UUID,
    action_type: str,
    status: str,
    due_date: Any,
    owner: str | None,
    summary: str | None,
    audit_log_json: dict[str, Any],
    document_ids: list[str],
    created_by: str | None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT case_id, business_id FROM app.re_workout_cases WHERE case_id = %s",
            (str(case_id),),
        )
        case = cur.fetchone()
        if not case:
            raise LookupError("Workout case not found")
        if str(case["business_id"]) != str(business_id):
            raise LookupError("Workout case does not belong to business")
        cur.execute(
            """
            INSERT INTO app.re_workout_actions
              (case_id, business_id, action_type, status, due_date, owner, summary, audit_log_json, document_ids, created_by)
            VALUES
              (%s, %s, %s::app.re_workout_action_type, %s::app.re_workout_action_status, %s, %s, %s, %s::jsonb, %s::jsonb, %s)
            RETURNING action_id, case_id, business_id, action_type::text AS action_type, status::text AS status,
                      due_date, owner, summary, audit_log_json, document_ids, created_by, created_at
            """,
            (
                str(case_id),
                str(business_id),
                action_type,
                status,
                due_date,
                owner,
                summary,
                _json_dumps(audit_log_json),
                _json_dumps(document_ids),
                created_by,
            ),
        )
        return cur.fetchone()


def create_event(
    *,
    loan_id: UUID,
    business_id: UUID,
    event_type: str,
    event_date: Any,
    severity: str,
    description: str,
    document_ids: list[str],
    created_by: str | None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        loan = _get_loan(cur, loan_id=loan_id)
        if str(loan["business_id"]) != str(business_id):
            raise LookupError("Loan does not belong to business")
        cur.execute(
            """
            INSERT INTO app.re_events (loan_id, business_id, event_type, event_date, severity, description, document_ids, created_by)
            VALUES (%s, %s, %s::app.re_event_type, %s, %s::app.re_event_severity, %s, %s::jsonb, %s)
            RETURNING event_id, loan_id, business_id, event_type::text AS event_type, event_date,
                      severity::text AS severity, description, document_ids, created_by, created_at
            """,
            (
                str(loan_id),
                str(business_id),
                event_type,
                event_date,
                severity,
                description,
                _json_dumps(document_ids),
                created_by,
            ),
        )
        return cur.fetchone()


def list_events(*, loan_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        _get_loan(cur, loan_id=loan_id)
        cur.execute(
            """
            SELECT event_id, loan_id, business_id, event_type::text AS event_type, event_date,
                   severity::text AS severity, description, document_ids, created_by, created_at
            FROM app.re_events
            WHERE loan_id = %s
            ORDER BY event_date DESC, created_at DESC
            """,
            (str(loan_id),),
        )
        return cur.fetchall()


def run_underwrite_execution(
    *,
    cur,
    business_id: UUID,
    loan_id: UUID,
    execution_id: UUID,
    inputs_json: dict[str, Any],
) -> dict[str, Any]:
    loan = _get_loan(cur, loan_id=loan_id)
    if str(loan["business_id"]) != str(business_id):
        raise LookupError("Loan does not belong to business")

    cur.execute(
        """
        SELECT surveillance_id, period_end_date, dscr, occupancy, noi_cents, metrics_json
        FROM app.re_surveillance_periods
        WHERE loan_id = %s
        ORDER BY period_end_date DESC, created_at DESC
        LIMIT 1
        """,
        (str(loan_id),),
    )
    latest_surveillance = cur.fetchone()

    cur.execute(
        """
        SELECT underwrite_run_id, version, outputs_json
        FROM app.re_underwrite_runs
        WHERE loan_id = %s
        ORDER BY version DESC
        LIMIT 1
        """,
        (str(loan_id),),
    )
    prior = cur.fetchone()
    prior_outputs = prior["outputs_json"] if prior else None
    prior_id = prior["underwrite_run_id"] if prior else None
    next_version = int(prior["version"]) + 1 if prior else 1

    calc = compute_underwrite_outputs(
        loan_row=loan,
        latest_surveillance=latest_surveillance,
        requested_inputs=inputs_json,
        prior_outputs=prior_outputs,
    )
    run_inputs = dict(calc.inputs)
    run_inputs["requested_at"] = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        INSERT INTO app.re_underwrite_runs
          (loan_id, business_id, execution_id, inputs_json, outputs_json, document_ids, diff_from_run_id, created_by, version)
        VALUES
          (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s)
        RETURNING underwrite_run_id, loan_id, business_id, execution_id, run_at, inputs_json, outputs_json,
                  document_ids, diff_from_run_id, created_by, version, created_at
        """,
        (
            str(loan_id),
            str(business_id),
            str(execution_id),
            _json_dumps(run_inputs),
            _json_dumps(calc.outputs),
            _json_dumps(inputs_json.get("document_ids", [])),
            str(prior_id) if prior_id else None,
            inputs_json.get("created_by"),
            next_version,
        ),
    )
    row = cur.fetchone()
    return {
        "underwrite_run": row,
        "loan_id": str(loan_id),
        "business_id": str(business_id),
        "version": next_version,
        "outputs": calc.outputs,
    }


def seed_demo(*, business_id: UUID, created_by: str | None = "seed") -> dict[str, Any]:
    with get_cursor() as cur:
        _require_business(cur, business_id)
        cur.execute(
            """
            INSERT INTO app.re_trusts (business_id, name, external_ids, created_by)
            VALUES (%s, %s, %s::jsonb, %s)
            RETURNING trust_id
            """,
            (
                str(business_id),
                "Demo Trust A",
                _json_dumps({"trust_code": "TRUST_A"}),
                created_by,
            ),
        )
        trust_id = cur.fetchone()["trust_id"]

        loans: list[str] = []
        for idx in range(1, 4):
            cur.execute(
                """
                INSERT INTO app.re_loans (
                  trust_id, business_id, loan_identifier, original_balance_cents, current_balance_cents,
                  rate_decimal, maturity_date, servicer_status, metadata_json, created_by
                ) VALUES (
                  %s, %s, %s, %s, %s, %s, current_date + interval '24 months', 'watchlist', '{}'::jsonb, %s
                )
                RETURNING loan_id
                """,
                (
                    str(trust_id),
                    str(business_id),
                    f"LOAN-{idx:03d}",
                    25_000_000_00,
                    23_500_000_00 - idx * 150_000_00,
                    0.0675,
                    created_by,
                ),
            )
            loan_id = cur.fetchone()["loan_id"]
            loans.append(str(loan_id))
            cur.execute(
                """
                INSERT INTO app.re_properties (loan_id, business_id, address_line1, city, state, postal_code, property_type, square_feet, unit_count, metadata_json, created_by)
                VALUES (%s, %s, %s, 'Dallas', 'TX', '75201', 'multifamily', %s, %s, '{}'::jsonb, %s)
                """,
                (str(loan_id), str(business_id), f"{100 + idx} Main St", 150000 + idx * 5000, 210 + idx * 12, created_by),
            )
            for m in range(3):
                cur.execute(
                    """
                    INSERT INTO app.re_surveillance_periods
                      (loan_id, business_id, period_end_date, metrics_json, dscr, occupancy, noi_cents, notes, created_by)
                    VALUES
                      (%s, %s, current_date - (%s * interval '1 month'), '{}'::jsonb, %s, %s, %s, %s, %s)
                    ON CONFLICT (loan_id, period_end_date) DO NOTHING
                    """,
                    (
                        str(loan_id),
                        str(business_id),
                        m,
                        1.18 - (m * 0.03),
                        0.91 - (m * 0.02),
                        1_850_000_00 - (m * 60_000_00),
                        "Seed surveillance snapshot",
                        created_by,
                    ),
                )
        return {"trust_id": str(trust_id), "loan_ids": loans}

