"""REPE finance domain service with deterministic waterfall execution."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.finance.capital_account_engine import compute_cashflows_for_irr, compute_rollforward
from app.finance.clawback_engine import compute_clawback, compute_promote_position
from app.finance.irr_engine import xirr
from app.finance.posting_engine import post_batch
from app.finance.utils import deterministic_hash, parse_date, qmoney
from app.finance.waterfall_engine import (
    ParticipantState,
    WaterfallContract,
    WaterfallInput,
    lines_total,
    run_us_waterfall,
)
from app.services.finance_common import get_partition_context


def _ensure_capital_account(
    cur,
    *,
    tenant_id: str,
    business_id: str,
    partition_id: str,
    fin_entity_id: str,
    fin_participant_id: str,
    opened_at: date,
) -> str:
    cur.execute(
        """SELECT fin_capital_account_id
           FROM fin_capital_account
           WHERE tenant_id = %s
             AND business_id = %s
             AND partition_id = %s
             AND fin_entity_id = %s
             AND fin_participant_id = %s
             AND currency_code = 'USD'""",
        (tenant_id, business_id, partition_id, fin_entity_id, fin_participant_id),
    )
    row = cur.fetchone()
    if row:
        return row["fin_capital_account_id"]

    cur.execute(
        """INSERT INTO fin_capital_account
           (tenant_id, business_id, partition_id, fin_entity_id, fin_participant_id, currency_code, status, opened_at)
           VALUES (%s, %s, %s, %s, %s, 'USD', 'open', %s)
           RETURNING fin_capital_account_id""",
        (tenant_id, business_id, partition_id, fin_entity_id, fin_participant_id, opened_at),
    )
    return cur.fetchone()["fin_capital_account_id"]


def create_fund(
    *,
    business_id: UUID,
    partition_id: UUID,
    fund_code: str,
    name: str,
    strategy: str,
    vintage_date: date | None,
    term_years: int | None,
    pref_rate: Decimal,
    pref_is_compound: bool,
    catchup_rate: Decimal,
    carry_rate: Decimal,
    waterfall_style: str,
) -> dict:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, partition_id)

        cur.execute("SELECT fin_entity_type_id FROM fin_entity_type WHERE key = 'fund'")
        et = cur.fetchone()
        if not et:
            raise LookupError("fin_entity_type 'fund' is not seeded")

        cur.execute(
            """INSERT INTO fin_entity
               (tenant_id, business_id, partition_id, fin_entity_type_id, code, name, status, currency_code)
               VALUES (%s, %s, %s, %s, %s, %s, 'active', 'USD')
               RETURNING fin_entity_id""",
            (
                ctx["tenant_id"],
                str(business_id),
                str(partition_id),
                et["fin_entity_type_id"],
                fund_code,
                name,
            ),
        )
        fund_entity_id = cur.fetchone()["fin_entity_id"]

        cur.execute(
            """INSERT INTO fin_fund
               (tenant_id, business_id, partition_id, fin_entity_id, fund_code, name, strategy,
                vintage_date, term_years, pref_rate, pref_is_compound, catchup_rate, carry_rate, waterfall_style, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
               RETURNING *""",
            (
                ctx["tenant_id"],
                str(business_id),
                str(partition_id),
                fund_entity_id,
                fund_code,
                name,
                strategy,
                vintage_date,
                term_years,
                qmoney(pref_rate),
                pref_is_compound,
                qmoney(catchup_rate),
                qmoney(carry_rate),
                waterfall_style,
            ),
        )
        return cur.fetchone()


def list_funds(*, business_id: UUID, partition_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        get_partition_context(cur, business_id, partition_id)
        cur.execute(
            """SELECT *
               FROM fin_fund
               WHERE business_id = %s AND partition_id = %s
               ORDER BY created_at DESC""",
            (str(business_id), str(partition_id)),
        )
        return cur.fetchall()


def create_participant(
    *,
    business_id: UUID,
    name: str,
    participant_type: str,
    external_key: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT tenant_id FROM business WHERE business_id = %s",
            (str(business_id),),
        )
        biz = cur.fetchone()
        if not biz:
            raise LookupError("Business not found")

        cur.execute(
            """INSERT INTO fin_participant
               (tenant_id, business_id, external_key, name, participant_type)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING *""",
            (biz["tenant_id"], str(business_id), external_key, name, participant_type),
        )
        return cur.fetchone()


def list_participants(*, business_id: UUID, participant_type: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        if participant_type:
            cur.execute(
                """SELECT *
                   FROM fin_participant
                   WHERE business_id = %s AND participant_type = %s
                   ORDER BY created_at DESC""",
                (str(business_id), participant_type),
            )
        else:
            cur.execute(
                """SELECT *
                   FROM fin_participant
                   WHERE business_id = %s
                   ORDER BY created_at DESC""",
                (str(business_id),),
            )
        return cur.fetchall()


def _get_fund(cur, fund_id: UUID) -> dict:
    cur.execute("SELECT * FROM fin_fund WHERE fin_fund_id = %s", (str(fund_id),))
    row = cur.fetchone()
    if not row:
        raise LookupError("Fund not found")
    return row


def create_commitment(
    *,
    fund_id: UUID,
    fin_participant_id: UUID,
    commitment_role: str,
    commitment_date: date,
    committed_amount: Decimal,
    fin_entity_id: UUID | None = None,
    fin_run_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        fund = _get_fund(cur, fund_id)

        cur.execute(
            """INSERT INTO fin_commitment
               (tenant_id, business_id, partition_id, fin_fund_id, fin_participant_id, fin_entity_id,
                commitment_role, commitment_date, committed_amount, currency_code, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'USD', 'active')
               ON CONFLICT (tenant_id, business_id, partition_id, fin_fund_id, fin_participant_id)
               DO UPDATE SET
                 commitment_role = EXCLUDED.commitment_role,
                 commitment_date = EXCLUDED.commitment_date,
                 committed_amount = EXCLUDED.committed_amount,
                 fin_entity_id = EXCLUDED.fin_entity_id
               RETURNING *""",
            (
                fund["tenant_id"],
                fund["business_id"],
                fund["partition_id"],
                str(fund_id),
                str(fin_participant_id),
                str(fin_entity_id) if fin_entity_id else None,
                commitment_role,
                commitment_date,
                qmoney(committed_amount),
            ),
        )
        commitment = cur.fetchone()

        if fund.get("fin_entity_id"):
            account_id = _ensure_capital_account(
                cur,
                tenant_id=str(fund["tenant_id"]),
                business_id=str(fund["business_id"]),
                partition_id=str(fund["partition_id"]),
                fin_entity_id=str(fund["fin_entity_id"]),
                fin_participant_id=str(fin_participant_id),
                opened_at=commitment_date,
            )
            cur.execute(
                """INSERT INTO fin_capital_event
                   (tenant_id, business_id, partition_id, fin_capital_account_id, fin_entity_id,
                    fin_participant_id, event_type, event_date, amount, direction, source_table, source_id, fin_run_id)
                   VALUES (%s, %s, %s, %s, %s, %s, 'commitment', %s, %s, 'credit', 'fin_commitment', %s, %s)""",
                (
                    fund["tenant_id"],
                    fund["business_id"],
                    fund["partition_id"],
                    account_id,
                    fund["fin_entity_id"],
                    str(fin_participant_id),
                    commitment_date,
                    qmoney(committed_amount),
                    commitment["fin_commitment_id"],
                    str(fin_run_id) if fin_run_id else None,
                ),
            )

        return commitment


def list_commitments(*, fund_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fund(cur, fund_id)
        cur.execute(
            """SELECT c.*, p.name AS participant_name, p.participant_type
               FROM fin_commitment c
               JOIN fin_participant p ON p.fin_participant_id = c.fin_participant_id
               WHERE c.fin_fund_id = %s
               ORDER BY c.created_at""",
            (str(fund_id),),
        )
        return cur.fetchall()


def create_capital_call(
    *,
    fund_id: UUID,
    call_date: date,
    due_date: date | None,
    amount_requested: Decimal,
    purpose: str | None,
) -> dict:
    with get_cursor() as cur:
        fund = _get_fund(cur, fund_id)
        cur.execute(
            "SELECT COALESCE(MAX(call_number), 0) + 1 AS next_no FROM fin_capital_call WHERE fin_fund_id = %s",
            (str(fund_id),),
        )
        call_number = cur.fetchone()["next_no"]

        cur.execute(
            """INSERT INTO fin_capital_call
               (tenant_id, business_id, partition_id, fin_fund_id, call_number, call_date, due_date,
                amount_requested, purpose, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'issued')
               RETURNING *""",
            (
                fund["tenant_id"],
                fund["business_id"],
                fund["partition_id"],
                str(fund_id),
                call_number,
                call_date,
                due_date,
                qmoney(amount_requested),
                purpose,
            ),
        )
        return cur.fetchone()


def list_capital_calls(*, fund_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fund(cur, fund_id)
        cur.execute(
            """SELECT *
               FROM fin_capital_call
               WHERE fin_fund_id = %s
               ORDER BY call_number""",
            (str(fund_id),),
        )
        return cur.fetchall()


def create_asset_investment(
    *,
    fund_id: UUID,
    asset_name: str,
    acquisition_date: date | None,
    cost_basis: Decimal,
    current_valuation: Decimal | None = None,
) -> dict:
    with get_cursor() as cur:
        fund = _get_fund(cur, fund_id)
        cur.execute(
            """INSERT INTO fin_asset_investment
               (tenant_id, business_id, partition_id, fin_fund_id, asset_name, acquisition_date,
                cost_basis, current_valuation, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active')
               RETURNING *""",
            (
                fund["tenant_id"],
                fund["business_id"],
                fund["partition_id"],
                str(fund_id),
                asset_name,
                acquisition_date,
                qmoney(cost_basis),
                qmoney(current_valuation) if current_valuation is not None else None,
            ),
        )
        return cur.fetchone()


def list_assets(*, fund_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fund(cur, fund_id)
        cur.execute(
            """SELECT *
               FROM fin_asset_investment
               WHERE fin_fund_id = %s
               ORDER BY created_at DESC""",
            (str(fund_id),),
        )
        return cur.fetchall()


def create_contribution(
    *,
    fund_id: UUID,
    fin_capital_call_id: UUID | None,
    fin_participant_id: UUID,
    contribution_date: date,
    amount_contributed: Decimal,
    status: str = "collected",
    fin_run_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        fund = _get_fund(cur, fund_id)

        cur.execute(
            """INSERT INTO fin_contribution
               (tenant_id, business_id, partition_id, fin_fund_id, fin_capital_call_id, fin_participant_id,
                contribution_date, amount_contributed, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                fund["tenant_id"],
                fund["business_id"],
                fund["partition_id"],
                str(fund_id),
                str(fin_capital_call_id) if fin_capital_call_id else None,
                str(fin_participant_id),
                contribution_date,
                qmoney(amount_contributed),
                status,
            ),
        )
        contribution = cur.fetchone()

        if fund.get("fin_entity_id"):
            account_id = _ensure_capital_account(
                cur,
                tenant_id=str(fund["tenant_id"]),
                business_id=str(fund["business_id"]),
                partition_id=str(fund["partition_id"]),
                fin_entity_id=str(fund["fin_entity_id"]),
                fin_participant_id=str(fin_participant_id),
                opened_at=contribution_date,
            )
            cur.execute(
                """INSERT INTO fin_capital_event
                   (tenant_id, business_id, partition_id, fin_capital_account_id, fin_entity_id,
                    fin_participant_id, event_type, event_date, amount, direction, source_table, source_id, fin_run_id)
                   VALUES (%s, %s, %s, %s, %s, %s, 'contribution', %s, %s, 'credit', 'fin_contribution', %s, %s)""",
                (
                    fund["tenant_id"],
                    fund["business_id"],
                    fund["partition_id"],
                    account_id,
                    fund["fin_entity_id"],
                    str(fin_participant_id),
                    contribution_date,
                    qmoney(amount_contributed),
                    contribution["fin_contribution_id"],
                    str(fin_run_id) if fin_run_id else None,
                ),
            )

        return contribution


def create_distribution_event(
    *,
    fund_id: UUID,
    event_date: date,
    gross_proceeds: Decimal,
    net_distributable: Decimal | None,
    event_type: str,
    reference: str | None,
    fin_asset_investment_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        fund = _get_fund(cur, fund_id)
        nd = qmoney(net_distributable if net_distributable is not None else gross_proceeds)

        cur.execute(
            """INSERT INTO fin_distribution_event
               (tenant_id, business_id, partition_id, fin_fund_id, fin_asset_investment_id,
                event_date, gross_proceeds, net_distributable, event_type, reference, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
               RETURNING *""",
            (
                fund["tenant_id"],
                fund["business_id"],
                fund["partition_id"],
                str(fund_id),
                str(fin_asset_investment_id) if fin_asset_investment_id else None,
                event_date,
                qmoney(gross_proceeds),
                nd,
                event_type,
                reference,
            ),
        )
        return cur.fetchone()


def list_distribution_events(*, fund_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fund(cur, fund_id)
        cur.execute(
            """SELECT de.*, ai.asset_name
               FROM fin_distribution_event de
               LEFT JOIN fin_asset_investment ai
                 ON ai.fin_asset_investment_id = de.fin_asset_investment_id
               WHERE de.fin_fund_id = %s
               ORDER BY de.event_date DESC, de.created_at DESC""",
            (str(fund_id),),
        )
        return cur.fetchall()


def list_distribution_payouts(*, fund_id: UUID, distribution_event_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fund(cur, fund_id)
        cur.execute(
            """SELECT *
               FROM fin_distribution_event
               WHERE fin_distribution_event_id = %s
                 AND fin_fund_id = %s""",
            (str(distribution_event_id), str(fund_id)),
        )
        if not cur.fetchone():
            raise LookupError("Distribution event not found for fund")

        cur.execute(
            """SELECT dp.*, p.name AS participant_name
               FROM fin_distribution_payout dp
               LEFT JOIN fin_participant p ON p.fin_participant_id = dp.fin_participant_id
               WHERE dp.fin_distribution_event_id = %s
               ORDER BY dp.created_at, dp.fin_distribution_payout_id""",
            (str(distribution_event_id),),
        )
        return cur.fetchall()


def _build_waterfall_participants(cur, fund: dict, distribution_event: dict, as_of_date: date) -> tuple[list[ParticipantState], Decimal, Decimal]:
    cur.execute(
        """SELECT
                c.fin_participant_id::text AS participant_id,
                c.commitment_role,
                c.committed_amount,
                COALESCE(ct.contrib_amount, 0) AS contrib_amount,
                ct.first_contribution_date,
                COALESCE(py.roc_paid, 0) AS roc_paid,
                COALESCE(py.pref_paid, 0) AS pref_paid,
                COALESCE(py.profit_paid, 0) AS profit_paid
           FROM fin_commitment c
           LEFT JOIN (
             SELECT
               fin_participant_id,
               SUM(amount_contributed) AS contrib_amount,
               MIN(contribution_date) AS first_contribution_date
             FROM fin_contribution
             WHERE fin_fund_id = %s
               AND partition_id = %s
               AND contribution_date <= %s
               AND status = 'collected'
             GROUP BY fin_participant_id
           ) ct ON ct.fin_participant_id = c.fin_participant_id
           LEFT JOIN (
             SELECT
               dp.fin_participant_id,
               SUM(CASE WHEN dp.payout_type = 'return_of_capital' THEN dp.amount ELSE 0 END) AS roc_paid,
               SUM(CASE WHEN dp.payout_type = 'preferred_return' THEN dp.amount ELSE 0 END) AS pref_paid,
               SUM(CASE WHEN dp.payout_type IN ('catch_up', 'carry') THEN dp.amount ELSE 0 END) AS profit_paid
             FROM fin_distribution_payout dp
             JOIN fin_distribution_event de
               ON de.fin_distribution_event_id = dp.fin_distribution_event_id
             WHERE dp.fin_fund_id = %s
               AND dp.partition_id = %s
               AND de.event_date <= %s
               AND dp.fin_distribution_event_id <> %s
             GROUP BY dp.fin_participant_id
           ) py ON py.fin_participant_id = c.fin_participant_id
           WHERE c.fin_fund_id = %s
             AND c.partition_id = %s
           ORDER BY c.commitment_role, c.fin_participant_id""",
        (
            fund["fin_fund_id"],
            fund["partition_id"],
            as_of_date,
            fund["fin_fund_id"],
            fund["partition_id"],
            as_of_date,
            distribution_event["fin_distribution_event_id"],
            fund["fin_fund_id"],
            fund["partition_id"],
        ),
    )
    rows = cur.fetchall()
    if not rows:
        raise ValueError("Fund has no commitments; waterfall cannot run")

    participants: list[ParticipantState] = []
    gp_profit_prior = Decimal("0")
    lp_profit_prior = Decimal("0")

    pref_rate = qmoney(fund["pref_rate"])
    for row in rows:
        role = row["commitment_role"]
        contributed = qmoney(row["contrib_amount"])
        roc_paid = qmoney(row["roc_paid"])
        pref_paid = qmoney(row["pref_paid"])
        profit_paid = qmoney(row["profit_paid"])

        unreturned = qmoney(max(contributed - roc_paid, Decimal("0")))
        pref_due = Decimal("0")

        if role != "gp" and contributed > 0 and row["first_contribution_date"]:
            first_dt = parse_date(row["first_contribution_date"])
            days = max((as_of_date - first_dt).days, 0)
            if fund["pref_is_compound"]:
                daily_rate = pref_rate / Decimal("365")
                factor = (Decimal("1") + daily_rate) ** days - Decimal("1")
                accrued = qmoney(contributed * factor)
            else:
                accrued = qmoney(contributed * pref_rate * Decimal(days) / Decimal("365"))
            pref_due = qmoney(max(accrued - pref_paid, Decimal("0")))

        if role == "gp":
            gp_profit_prior += profit_paid
        else:
            lp_profit_prior += pref_paid + profit_paid

        participants.append(
            ParticipantState(
                participant_id=row["participant_id"],
                role=role,
                commitment_amount=qmoney(row["committed_amount"]),
                unreturned_capital=unreturned,
                pref_due=pref_due,
            )
        )

    return participants, qmoney(gp_profit_prior), qmoney(lp_profit_prior)


def execute_waterfall_run(
    *,
    fin_run_id: UUID,
    business_id: UUID,
    partition_id: UUID,
    fund_id: UUID,
    distribution_event_id: UUID,
    as_of_date: date,
    idempotency_key: str,
) -> dict:
    with get_cursor() as cur:
        get_partition_context(cur, business_id, partition_id)

        fund = _get_fund(cur, fund_id)
        if str(fund["business_id"]) != str(business_id) or str(fund["partition_id"]) != str(partition_id):
            raise ValueError("Fund does not belong to requested business/partition")

        cur.execute(
            "SELECT * FROM fin_distribution_event WHERE fin_distribution_event_id = %s AND fin_fund_id = %s",
            (str(distribution_event_id), str(fund_id)),
        )
        distribution_event = cur.fetchone()
        if not distribution_event:
            raise LookupError("Distribution event not found for fund")

        cur.execute(
            """SELECT fin_allocation_run_id
               FROM fin_allocation_run
               WHERE tenant_id = %s AND business_id = %s AND partition_id = %s AND idempotency_key = %s""",
            (fund["tenant_id"], fund["business_id"], fund["partition_id"], idempotency_key),
        )
        existing = cur.fetchone()
        if existing:
            return {
                "fin_allocation_run_id": existing["fin_allocation_run_id"],
                "idempotent": True,
            }

        participants, gp_profit_prior, lp_profit_prior = _build_waterfall_participants(
            cur,
            fund,
            distribution_event,
            as_of_date,
        )

        contract = WaterfallContract(
            pref_rate=qmoney(fund["pref_rate"]),
            pref_is_compound=bool(fund["pref_is_compound"]),
            carry_rate=qmoney(fund["carry_rate"]),
            catchup_rate=qmoney(fund["catchup_rate"]),
            style=str(fund["waterfall_style"]),
        )

        wf_input = WaterfallInput(
            as_of_date=as_of_date,
            distribution_amount=qmoney(distribution_event["net_distributable"]),
            gp_profit_paid_to_date=gp_profit_prior,
            lp_profit_paid_to_date=lp_profit_prior,
            participants=tuple(participants),
        )

        wf_hash = deterministic_hash(
            {
                "fund_id": str(fund_id),
                "distribution_event_id": str(distribution_event_id),
                "as_of_date": as_of_date.isoformat(),
                "contract": {
                    "pref_rate": str(contract.pref_rate),
                    "pref_is_compound": contract.pref_is_compound,
                    "carry_rate": str(contract.carry_rate),
                    "catchup_rate": str(contract.catchup_rate),
                    "style": contract.style,
                },
                "participants": [
                    {
                        "participant_id": p.participant_id,
                        "role": p.role,
                        "commitment_amount": str(p.commitment_amount),
                        "unreturned_capital": str(p.unreturned_capital),
                        "pref_due": str(p.pref_due),
                    }
                    for p in participants
                ],
            }
        )

        lines = run_us_waterfall(contract, wf_input)

        cur.execute(
            """INSERT INTO fin_allocation_run
               (tenant_id, business_id, partition_id, engine_kind, source_table, source_id,
                as_of_date, status, deterministic_hash, fin_run_id, idempotency_key, completed_at)
               VALUES (%s, %s, %s, 'waterfall', 'fin_distribution_event', %s,
                       %s, 'completed', %s, %s, %s, now())
               RETURNING fin_allocation_run_id""",
            (
                fund["tenant_id"],
                fund["business_id"],
                fund["partition_id"],
                distribution_event["fin_distribution_event_id"],
                as_of_date,
                wf_hash,
                str(fin_run_id),
                idempotency_key,
            ),
        )
        allocation_run_id = cur.fetchone()["fin_allocation_run_id"]

        line_ids: list[str] = []
        payout_ids: list[str] = []

        role_by_participant = {p.participant_id: p.role for p in participants}
        fund_entity_id = fund.get("fin_entity_id")

        for idx, line in enumerate(lines, start=1):
            cur.execute(
                """INSERT INTO fin_allocation_line
                   (tenant_id, business_id, partition_id, fin_allocation_run_id,
                    fin_allocation_tier_id, line_number, fin_participant_id, fin_entity_id,
                    allocation_label, amount, currency_code)
                   VALUES (%s, %s, %s, %s, NULL, %s, %s, %s, %s, %s, 'USD')
                   RETURNING fin_allocation_line_id""",
                (
                    fund["tenant_id"],
                    fund["business_id"],
                    fund["partition_id"],
                    allocation_run_id,
                    idx,
                    line.participant_id,
                    fund_entity_id,
                    line.tier_code,
                    qmoney(line.amount),
                ),
            )
            line_ids.append(cur.fetchone()["fin_allocation_line_id"])

            cur.execute(
                """INSERT INTO fin_distribution_payout
                   (tenant_id, business_id, partition_id, fin_fund_id, fin_distribution_event_id,
                    fin_participant_id, payout_type, amount, payout_date, currency_code, fin_allocation_run_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'USD', %s)
                   RETURNING fin_distribution_payout_id""",
                (
                    fund["tenant_id"],
                    fund["business_id"],
                    fund["partition_id"],
                    fund["fin_fund_id"],
                    distribution_event["fin_distribution_event_id"],
                    line.participant_id,
                    line.payout_type,
                    qmoney(line.amount),
                    distribution_event["event_date"],
                    allocation_run_id,
                ),
            )
            payout_id = cur.fetchone()["fin_distribution_payout_id"]
            payout_ids.append(payout_id)

            if fund_entity_id:
                account_id = _ensure_capital_account(
                    cur,
                    tenant_id=str(fund["tenant_id"]),
                    business_id=str(fund["business_id"]),
                    partition_id=str(fund["partition_id"]),
                    fin_entity_id=str(fund_entity_id),
                    fin_participant_id=line.participant_id,
                    opened_at=parse_date(distribution_event["event_date"]),
                )
                cur.execute(
                    """INSERT INTO fin_capital_event
                       (tenant_id, business_id, partition_id, fin_capital_account_id,
                        fin_entity_id, fin_participant_id, event_type, event_date,
                        amount, direction, source_table, source_id, fin_run_id)
                       VALUES (%s, %s, %s, %s, %s, %s, 'distribution', %s,
                               %s, 'debit', 'fin_distribution_payout', %s, %s)""",
                    (
                        fund["tenant_id"],
                        fund["business_id"],
                        fund["partition_id"],
                        account_id,
                        fund_entity_id,
                        line.participant_id,
                        distribution_event["event_date"],
                        qmoney(line.amount),
                        payout_id,
                        str(fin_run_id),
                    ),
                )

        total_payout = lines_total(lines)
        posting = post_batch(
            cur,
            tenant_id=str(fund["tenant_id"]),
            business_id=str(fund["business_id"]),
            partition_id=str(fund["partition_id"]),
            posting_date=parse_date(distribution_event["event_date"]),
            source_type="fin_distribution_event",
            source_id=str(distribution_event["fin_distribution_event_id"]),
            idempotency_key=f"{idempotency_key}:posting",
            memo=f"Waterfall distribution for fund {fund['fund_code']}",
            fin_run_id=str(fin_run_id),
            lines=[
                {
                    "gl_account_code": "EQUITY_DISTRIBUTION",
                    "debit": total_payout,
                    "credit": Decimal("0"),
                },
                {
                    "gl_account_code": "CASH",
                    "debit": Decimal("0"),
                    "credit": total_payout,
                },
            ],
        )

        gp_ids = sorted([p.participant_id for p in participants if p.role == "gp"])
        gp_weights = {
            p.participant_id: p.commitment_amount
            for p in participants
            if p.role == "gp"
        }
        gp_weight_sum = qmoney(sum(gp_weights.values(), Decimal("0")))

        gp_paid_current = qmoney(
            sum(
                line.amount
                for line in lines
                if role_by_participant.get(line.participant_id) == "gp"
                and line.payout_type in {"catch_up", "carry"}
            )
        )
        lp_paid_current = qmoney(
            sum(
                line.amount
                for line in lines
                if role_by_participant.get(line.participant_id) != "gp"
                and line.payout_type in {"preferred_return", "carry"}
            )
        )
        gp_total_profit = qmoney(gp_profit_prior + gp_paid_current)
        lp_total_profit = qmoney(lp_profit_prior + lp_paid_current)
        gp_target_profit = qmoney(contract.carry_rate * qmoney(gp_total_profit + lp_total_profit))

        clawback = compute_clawback(gp_total_profit, gp_target_profit)
        promote = compute_promote_position(gp_total_profit, gp_total_profit)

        for gp_id in gp_ids:
            share = Decimal("0")
            if gp_weight_sum > 0:
                share = qmoney(gp_weights[gp_id] / gp_weight_sum)

            cur.execute(
                """INSERT INTO fin_clawback_position
                   (tenant_id, business_id, partition_id, fin_participant_id, fin_entity_id,
                    as_of_date, liability_amount, settled_amount, outstanding_amount, fin_run_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (tenant_id, business_id, partition_id, fin_participant_id, fin_entity_id, as_of_date)
                   DO UPDATE SET
                     liability_amount = EXCLUDED.liability_amount,
                     settled_amount = EXCLUDED.settled_amount,
                     outstanding_amount = EXCLUDED.outstanding_amount,
                     fin_run_id = EXCLUDED.fin_run_id""",
                (
                    fund["tenant_id"],
                    fund["business_id"],
                    fund["partition_id"],
                    gp_id,
                    fund_entity_id,
                    as_of_date,
                    qmoney(clawback["liability_amount"] * share),
                    qmoney(clawback["settled_amount"] * share),
                    qmoney(clawback["outstanding_amount"] * share),
                    str(fin_run_id),
                ),
            )

            cur.execute(
                """INSERT INTO fin_promote_position
                   (tenant_id, business_id, partition_id, fin_participant_id, fin_entity_id,
                    as_of_date, promote_earned, promote_paid, promote_outstanding, fin_run_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (tenant_id, business_id, partition_id, fin_participant_id, fin_entity_id, as_of_date)
                   DO UPDATE SET
                     promote_earned = EXCLUDED.promote_earned,
                     promote_paid = EXCLUDED.promote_paid,
                     promote_outstanding = EXCLUDED.promote_outstanding,
                     fin_run_id = EXCLUDED.fin_run_id""",
                (
                    fund["tenant_id"],
                    fund["business_id"],
                    fund["partition_id"],
                    gp_id,
                    fund_entity_id,
                    as_of_date,
                    qmoney(promote["promote_earned"] * share),
                    qmoney(promote["promote_paid"] * share),
                    qmoney(promote["promote_outstanding"] * share),
                    str(fin_run_id),
                ),
            )

        cur.execute(
            "UPDATE fin_distribution_event SET status = 'processed' WHERE fin_distribution_event_id = %s",
            (distribution_event["fin_distribution_event_id"],),
        )

        return {
            "fin_allocation_run_id": allocation_run_id,
            "fin_distribution_event_id": distribution_event["fin_distribution_event_id"],
            "deterministic_hash": wf_hash,
            "line_count": len(line_ids),
            "payout_count": len(payout_ids),
            "fin_posting_batch_id": posting["fin_posting_batch_id"],
            "result_refs": [
                *(
                    {
                        "result_table": "fin_allocation_line",
                        "result_id": line_id,
                    }
                    for line_id in line_ids
                ),
                *(
                    {
                        "result_table": "fin_distribution_payout",
                        "result_id": payout_id,
                    }
                    for payout_id in payout_ids
                ),
                {
                    "result_table": "fin_allocation_run",
                    "result_id": allocation_run_id,
                },
            ],
        }


def list_waterfall_allocations(*, fund_id: UUID, run_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fund(cur, fund_id)
        cur.execute(
            """SELECT al.fin_allocation_line_id, al.fin_allocation_run_id, al.line_number,
                      al.allocation_label, al.amount, al.currency_code,
                      al.fin_participant_id, p.name AS participant_name,
                      ar.as_of_date, ar.deterministic_hash
               FROM fin_allocation_line al
               JOIN fin_allocation_run ar ON ar.fin_allocation_run_id = al.fin_allocation_run_id
               LEFT JOIN fin_participant p ON p.fin_participant_id = al.fin_participant_id
               WHERE ar.fin_allocation_run_id = %s
                 AND ar.source_table = 'fin_distribution_event'
                 AND ar.source_id IN (
                   SELECT fin_distribution_event_id
                   FROM fin_distribution_event
                   WHERE fin_fund_id = %s
                 )
               ORDER BY al.line_number""",
            (str(run_id), str(fund_id)),
        )
        return cur.fetchall()


def run_capital_rollforward(
    *,
    fin_run_id: UUID,
    business_id: UUID,
    partition_id: UUID,
    fund_id: UUID,
    as_of_date: date,
    idempotency_key: str,
) -> dict:
    with get_cursor() as cur:
        get_partition_context(cur, business_id, partition_id)
        fund = _get_fund(cur, fund_id)
        fund_entity_id = fund.get("fin_entity_id")
        if not fund_entity_id:
            raise ValueError("Fund is missing linked entity for capital rollforward")

        cur.execute(
            """SELECT fin_capital_event_id, fin_entity_id, fin_participant_id, event_type, event_date, amount
               FROM fin_capital_event
               WHERE tenant_id = %s
                 AND business_id = %s
                 AND partition_id = %s
                 AND fin_entity_id = %s
                 AND event_date <= %s
               ORDER BY event_date, fin_capital_event_id""",
            (
                fund["tenant_id"],
                fund["business_id"],
                fund["partition_id"],
                fund_entity_id,
                as_of_date,
            ),
        )
        events = cur.fetchall()

        rows = compute_rollforward(events, as_of_date)
        refs: list[dict] = []

        for row in rows:
            cur.execute(
                """INSERT INTO fin_capital_rollforward
                   (tenant_id, business_id, partition_id, fin_entity_id, fin_participant_id,
                    as_of_date, opening_balance, contributions, distributions, fees,
                    accruals, clawbacks, closing_balance, fin_run_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (tenant_id, business_id, partition_id, fin_entity_id, fin_participant_id, as_of_date)
                   DO UPDATE SET
                     opening_balance = EXCLUDED.opening_balance,
                     contributions = EXCLUDED.contributions,
                     distributions = EXCLUDED.distributions,
                     fees = EXCLUDED.fees,
                     accruals = EXCLUDED.accruals,
                     clawbacks = EXCLUDED.clawbacks,
                     closing_balance = EXCLUDED.closing_balance,
                     fin_run_id = EXCLUDED.fin_run_id
                   RETURNING fin_capital_rollforward_id""",
                (
                    fund["tenant_id"],
                    fund["business_id"],
                    fund["partition_id"],
                    row["fin_entity_id"],
                    row["fin_participant_id"],
                    as_of_date,
                    row["opening_balance"],
                    row["contributions"],
                    row["distributions"],
                    row["fees"],
                    row["accruals"],
                    row["clawbacks"],
                    row["closing_balance"],
                    str(fin_run_id),
                ),
            )
            roll_id = cur.fetchone()["fin_capital_rollforward_id"]
            refs.append({"result_table": "fin_capital_rollforward", "result_id": roll_id})

            cashflows = compute_cashflows_for_irr(
                events,
                entity_id=row["fin_entity_id"],
                participant_id=row["fin_participant_id"],
            )
            irr_val = xirr(cashflows)
            cur.execute(
                """INSERT INTO fin_irr_result
                   (tenant_id, business_id, partition_id, fin_entity_id, fin_participant_id,
                    as_of_date, irr, method, cashflow_count, fin_run_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 'xirr_act_365f', %s, %s)
                   ON CONFLICT (
                     tenant_id, business_id, partition_id, fin_entity_id, fin_participant_id, as_of_date, method
                   )
                   DO UPDATE SET
                     irr = EXCLUDED.irr,
                     cashflow_count = EXCLUDED.cashflow_count,
                     fin_run_id = EXCLUDED.fin_run_id
                   RETURNING fin_irr_result_id""",
                (
                    fund["tenant_id"],
                    fund["business_id"],
                    fund["partition_id"],
                    row["fin_entity_id"],
                    row["fin_participant_id"],
                    as_of_date,
                    irr_val,
                    len(cashflows),
                    str(fin_run_id),
                ),
            )
            irr_id = cur.fetchone()["fin_irr_result_id"]
            refs.append({"result_table": "fin_irr_result", "result_id": irr_id})

        run_hash = deterministic_hash(
            {
                "fund_id": str(fund_id),
                "as_of_date": as_of_date.isoformat(),
                "event_count": len(events),
                "idempotency_key": idempotency_key,
            }
        )

        return {
            "deterministic_hash": run_hash,
            "rollforward_count": len(rows),
            "result_refs": refs,
        }


def list_capital_rollforward(*, fund_id: UUID, as_of_date: date | None = None) -> list[dict]:
    with get_cursor() as cur:
        fund = _get_fund(cur, fund_id)
        fund_entity_id = fund.get("fin_entity_id")
        if not fund_entity_id:
            return []

        if as_of_date:
            cur.execute(
                """SELECT r.*, p.name AS participant_name
                   FROM fin_capital_rollforward r
                   LEFT JOIN fin_participant p ON p.fin_participant_id = r.fin_participant_id
                   WHERE r.fin_entity_id = %s
                     AND r.partition_id = %s
                     AND r.as_of_date = %s
                   ORDER BY p.name NULLS LAST, r.fin_participant_id""",
                (fund_entity_id, fund["partition_id"], as_of_date),
            )
            return cur.fetchall()

        cur.execute(
            """SELECT MAX(as_of_date) AS max_as_of
               FROM fin_capital_rollforward
               WHERE fin_entity_id = %s AND partition_id = %s""",
            (fund_entity_id, fund["partition_id"]),
        )
        max_as_of = cur.fetchone()["max_as_of"]
        if not max_as_of:
            return []

        cur.execute(
            """SELECT r.*, p.name AS participant_name
               FROM fin_capital_rollforward r
               LEFT JOIN fin_participant p ON p.fin_participant_id = r.fin_participant_id
               WHERE r.fin_entity_id = %s
                 AND r.partition_id = %s
                 AND r.as_of_date = %s
               ORDER BY p.name NULLS LAST, r.fin_participant_id""",
            (fund_entity_id, fund["partition_id"], max_as_of),
        )
        return cur.fetchall()
