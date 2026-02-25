from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _q(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(value).quantize(Decimal("0.000000000001"))


def list_cases(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM credit_cases
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def create_case(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO credit_cases
            (env_id, business_id, case_number, borrower_name, facility_type, stage, requested_amount,
             approved_amount, risk_grade, created_by, updated_by)
            VALUES
            (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, 0, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                payload["case_number"],
                payload["borrower_name"],
                payload.get("facility_type"),
                payload.get("stage") or "intake",
                _q(payload.get("requested_amount")),
                payload.get("risk_grade"),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def get_case(*, env_id: UUID, business_id: UUID, case_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM credit_cases
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND case_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(case_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Credit case not found")
        return row


def create_underwriting_version(*, env_id: UUID, business_id: UUID, case_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM credit_underwriting_versions WHERE case_id = %s::uuid",
            (str(case_id),),
        )
        version_no = int(cur.fetchone()["next_version"])

        cur.execute(
            """
            INSERT INTO credit_underwriting_versions
            (env_id, business_id, case_id, version_no, pd, lgd, ead, score, recommendation, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(case_id), version_no,
                _q(payload.get("pd")) if payload.get("pd") is not None else None,
                _q(payload.get("lgd")) if payload.get("lgd") is not None else None,
                _q(payload.get("ead")) if payload.get("ead") is not None else None,
                _q(payload.get("score")) if payload.get("score") is not None else None,
                payload.get("recommendation"),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def create_committee_decision(*, env_id: UUID, business_id: UUID, case_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO credit_committee_decisions
            (env_id, business_id, case_id, decision_status, decision_date, conditions_json, rationale, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s::jsonb, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(case_id),
                payload.get("decision_status") or "pending",
                payload.get("decision_date"),
                json.dumps(payload.get("conditions_json") or []),
                payload.get("rationale"),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        decision = cur.fetchone()

        if decision.get("decision_status") == "approved":
            cur.execute(
                """
                UPDATE credit_cases
                SET stage = 'approved',
                    approved_amount = requested_amount,
                    updated_by = %s,
                    updated_at = now()
                WHERE case_id = %s::uuid
                """,
                (payload.get("created_by"), str(case_id)),
            )
        return decision


def create_facility(*, env_id: UUID, business_id: UUID, case_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO credit_facilities
            (env_id, business_id, case_id, facility_ref, principal_amount, outstanding_amount, maturity_date, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(case_id), payload["facility_ref"],
                _q(payload.get("principal_amount")), _q(payload.get("outstanding_amount")), payload.get("maturity_date"),
                payload.get("status") or "active", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_covenant(*, env_id: UUID, business_id: UUID, case_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO credit_covenants
            (env_id, business_id, case_id, covenant_name, threshold_value, current_value, breached, as_of_date, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                str(case_id),
                payload["covenant_name"],
                _q(payload.get("threshold_value")) if payload.get("threshold_value") is not None else None,
                _q(payload.get("current_value")) if payload.get("current_value") is not None else None,
                bool(payload.get("breached", False)),
                payload.get("as_of_date"),
                payload.get("created_by"),
                payload.get("created_by"),
            ),
        )
        row = cur.fetchone()
        if row.get("breached"):
            cur.execute(
                """
                INSERT INTO credit_monitoring_events
                (env_id, business_id, case_id, event_date, event_type, severity, summary, created_by, updated_by)
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s, 'covenant_breach', 'high', %s, %s, %s)
                """,
                (
                    str(env_id),
                    str(business_id),
                    str(case_id),
                    payload.get("as_of_date") or date.today(),
                    f"Breach detected for {payload['covenant_name']}",
                    payload.get("created_by"),
                    payload.get("created_by"),
                ),
            )
        return row


def create_watchlist_case(*, env_id: UUID, business_id: UUID, case_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO credit_watchlist_cases
            (env_id, business_id, case_id, watch_reason, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(case_id), payload.get("watch_reason"),
                payload.get("status") or "open", payload.get("created_by"), payload.get("created_by")
            ),
        )
        cur.execute(
            "UPDATE credit_cases SET stage = 'watchlist', updated_at = now(), updated_by = %s WHERE case_id = %s::uuid",
            (payload.get("created_by"), str(case_id)),
        )
        return cur.fetchone()


def create_workout_case(*, env_id: UUID, business_id: UUID, case_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO credit_workout_cases
            (env_id, business_id, case_id, strategy, recovery_estimate, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(case_id), payload.get("strategy"), _q(payload.get("recovery_estimate")),
                payload.get("status") or "open", payload.get("created_by"), payload.get("created_by")
            ),
        )
        cur.execute(
            "UPDATE credit_cases SET stage = 'workout', updated_at = now(), updated_by = %s WHERE case_id = %s::uuid",
            (payload.get("created_by"), str(case_id)),
        )
        return cur.fetchone()


def seed_demo_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT case_id FROM credit_cases WHERE env_id = %s::uuid AND business_id = %s::uuid LIMIT 1",
            (str(env_id), str(business_id)),
        )
        existing = cur.fetchone()
        if existing:
            return {"seeded": False, "case_ids": [str(existing["case_id"])]}

    case_a = create_case(
        env_id=env_id,
        business_id=business_id,
        payload={
            "case_number": "CR-1001",
            "borrower_name": "Northline Logistics LLC",
            "facility_type": "term_loan",
            "stage": "underwriting",
            "requested_amount": Decimal("12500000"),
            "risk_grade": "BB+",
            "created_by": actor,
        },
    )
    create_underwriting_version(
        env_id=env_id,
        business_id=business_id,
        case_id=UUID(str(case_a["case_id"])),
        payload={"pd": Decimal("0.038"), "lgd": Decimal("0.44"), "ead": Decimal("12500000"), "score": Decimal("72.4"), "recommendation": "approve_with_conditions", "created_by": actor},
    )
    create_covenant(
        env_id=env_id,
        business_id=business_id,
        case_id=UUID(str(case_a["case_id"])),
        payload={"covenant_name": "DSCR", "threshold_value": Decimal("1.20"), "current_value": Decimal("1.11"), "breached": True, "as_of_date": date.today(), "created_by": actor},
    )
    create_watchlist_case(
        env_id=env_id,
        business_id=business_id,
        case_id=UUID(str(case_a["case_id"])),
        payload={"watch_reason": "Covenant pressure + utilization spike", "status": "open", "created_by": actor},
    )

    case_b = create_case(
        env_id=env_id,
        business_id=business_id,
        payload={
            "case_number": "CR-1002",
            "borrower_name": "Apex Medical Partners",
            "facility_type": "revolver",
            "stage": "committee",
            "requested_amount": Decimal("8600000"),
            "risk_grade": "A-",
            "created_by": actor,
        },
    )

    return {"seeded": True, "case_ids": [str(case_a["case_id"]), str(case_b["case_id"])]}
