from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _q(v: Decimal | None) -> Decimal | None:
    return Decimal(v).quantize(Decimal("0.000000000001")) if v is not None else None


def record_entry(
    *,
    fund_id: UUID,
    partner_id: UUID,
    entry_type: str,
    amount: Decimal,
    effective_date,
    quarter: str,
    investment_id: UUID | None = None,
    jv_id: UUID | None = None,
    currency: str = "USD",
    fx_rate_to_base: Decimal = Decimal("1.0"),
    memo: str | None = None,
    source: str = "manual",
    source_ref: UUID | None = None,
    run_id: UUID | None = None,
) -> dict:
    amount_base = _q(Decimal(amount) * Decimal(fx_rate_to_base))

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_capital_ledger_entry (
                fund_id, investment_id, jv_id, partner_id,
                entry_type, amount, currency, fx_rate_to_base, amount_base,
                effective_date, quarter, memo, source, source_ref, run_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(fund_id),
                str(investment_id) if investment_id else None,
                str(jv_id) if jv_id else None,
                str(partner_id),
                entry_type,
                _q(amount),
                currency,
                _q(fx_rate_to_base),
                amount_base,
                effective_date,
                quarter,
                memo,
                source,
                str(source_ref) if source_ref else None,
                str(run_id) if run_id else None,
            ),
        )
        return cur.fetchone()


def record_reversal(*, original_entry_id: UUID, memo: str | None = None) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM re_capital_ledger_entry WHERE entry_id = %s",
            (str(original_entry_id),),
        )
        original = cur.fetchone()
        if not original:
            raise LookupError(f"Ledger entry {original_entry_id} not found")

        reversal_memo = memo or f"Reversal of {original_entry_id}"
        reversed_amount = -Decimal(original["amount"])
        reversed_amount_base = -Decimal(original["amount_base"])

        cur.execute(
            """
            INSERT INTO re_capital_ledger_entry (
                fund_id, investment_id, jv_id, partner_id,
                entry_type, amount, currency, fx_rate_to_base, amount_base,
                effective_date, quarter, memo, source, source_ref, run_id
            )
            VALUES (%s, %s, %s, %s, 'reversal', %s, %s, %s, %s, %s, %s, %s, 'generated', %s, %s)
            RETURNING *
            """,
            (
                original["fund_id"],
                original.get("investment_id"),
                original.get("jv_id"),
                original["partner_id"],
                _q(reversed_amount),
                original["currency"],
                original["fx_rate_to_base"],
                _q(reversed_amount_base),
                original["effective_date"],
                original["quarter"],
                reversal_memo,
                str(original_entry_id),
                original.get("run_id"),
            ),
        )
        return cur.fetchone()


def get_ledger(
    *,
    fund_id: UUID,
    quarter: str | None = None,
    partner_id: UUID | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["fund_id = %s"]
        params: list = [str(fund_id)]

        if quarter:
            conditions.append("quarter = %s")
            params.append(quarter)
        if partner_id:
            conditions.append("partner_id = %s")
            params.append(str(partner_id))

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT * FROM re_capital_ledger_entry
            WHERE {where}
            ORDER BY effective_date, created_at
            """,
            params,
        )
        return cur.fetchall()


def compute_balances(
    *,
    fund_id: UUID,
    partner_id: UUID,
    as_of_quarter: str | None = None,
) -> dict:
    with get_cursor() as cur:
        conditions = ["fund_id = %s", "partner_id = %s"]
        params: list = [str(fund_id), str(partner_id)]

        if as_of_quarter:
            conditions.append("quarter <= %s")
            params.append(as_of_quarter)

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT
                COALESCE(SUM(CASE WHEN entry_type = 'commitment' THEN amount_base ELSE 0 END), 0) AS total_committed,
                COALESCE(SUM(CASE WHEN entry_type = 'contribution' THEN amount_base ELSE 0 END), 0) AS total_contributed,
                COALESCE(SUM(CASE WHEN entry_type = 'distribution' THEN amount_base ELSE 0 END), 0) AS total_distributed,
                COALESCE(SUM(CASE WHEN entry_type = 'fee' THEN amount_base ELSE 0 END), 0) AS total_fees,
                COALESCE(SUM(CASE WHEN entry_type = 'reversal' THEN amount_base ELSE 0 END), 0) AS total_reversals,
                COALESCE(SUM(amount_base), 0) AS net_balance
            FROM re_capital_ledger_entry
            WHERE {where}
            """,
            params,
        )
        return cur.fetchone()


def compute_fund_totals(
    *,
    fund_id: UUID,
    as_of_quarter: str | None = None,
) -> dict:
    with get_cursor() as cur:
        conditions = ["fund_id = %s"]
        params: list = [str(fund_id)]

        if as_of_quarter:
            conditions.append("quarter <= %s")
            params.append(as_of_quarter)

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT
                COALESCE(SUM(CASE WHEN entry_type = 'commitment' THEN amount_base ELSE 0 END), 0) AS total_committed,
                COALESCE(SUM(CASE WHEN entry_type = 'contribution' THEN amount_base ELSE 0 END), 0) AS total_called,
                COALESCE(SUM(CASE WHEN entry_type = 'distribution' THEN amount_base ELSE 0 END), 0) AS total_distributed
            FROM re_capital_ledger_entry
            WHERE {where}
            """,
            params,
        )
        return cur.fetchone()
