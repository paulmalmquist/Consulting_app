from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _q(v: Decimal | None) -> Decimal | None:
    return Decimal(v).quantize(Decimal("0.000000000001")) if v is not None else None


def record_cashflow(
    *,
    fund_id: UUID,
    cashflow_type: str,
    amount_base: Decimal,
    effective_date,
    quarter: str,
    jv_id: UUID | None = None,
    asset_id: UUID | None = None,
    memo: str | None = None,
    run_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_cashflow_ledger_entry (
                fund_id, jv_id, asset_id,
                cashflow_type, amount_base, effective_date,
                quarter, memo, run_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(fund_id),
                str(jv_id) if jv_id else None,
                str(asset_id) if asset_id else None,
                cashflow_type,
                _q(amount_base),
                effective_date,
                quarter,
                memo,
                str(run_id) if run_id else None,
            ),
        )
        return cur.fetchone()


def get_cashflows(
    *,
    fund_id: UUID,
    jv_id: UUID | None = None,
    asset_id: UUID | None = None,
    quarter: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["fund_id = %s"]
        params: list = [str(fund_id)]

        if jv_id:
            conditions.append("jv_id = %s")
            params.append(str(jv_id))
        if asset_id:
            conditions.append("asset_id = %s")
            params.append(str(asset_id))
        if quarter:
            conditions.append("quarter = %s")
            params.append(quarter)

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT * FROM re_cashflow_ledger_entry
            WHERE {where}
            ORDER BY effective_date, created_at
            """,
            params,
        )
        return cur.fetchall()
