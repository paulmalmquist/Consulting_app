from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _q(v: Decimal | None) -> Decimal | None:
    return Decimal(v).quantize(Decimal("0.000000000001")) if v is not None else None


def list_investments(*, fund_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT deal_id AS investment_id, fund_id, name,
                   deal_type AS investment_type, stage, sponsor,
                   target_close_date, committed_capital,
                   invested_capital, realized_distributions, created_at
            FROM repe_deal
            WHERE fund_id = %s
            ORDER BY created_at DESC
            """,
            (str(fund_id),),
        )
        return cur.fetchall()


def get_investment(*, investment_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT deal_id AS investment_id, fund_id, name,
                   deal_type AS investment_type, stage, sponsor,
                   target_close_date, committed_capital,
                   invested_capital, realized_distributions, created_at
            FROM repe_deal
            WHERE deal_id = %s
            """,
            (str(investment_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Investment {investment_id} not found")
        return row


def create_investment(*, fund_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT 1 FROM repe_fund WHERE fund_id = %s", (str(fund_id),)
        )
        if not cur.fetchone():
            raise LookupError(f"Fund {fund_id} not found")

        cur.execute(
            """
            INSERT INTO repe_deal (
                fund_id, name, deal_type, stage, sponsor,
                target_close_date, committed_capital, invested_capital,
                realized_distributions
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING deal_id AS investment_id, fund_id, name,
                      deal_type AS investment_type, stage, sponsor,
                      target_close_date, committed_capital,
                      invested_capital, realized_distributions, created_at
            """,
            (
                str(fund_id),
                payload["name"],
                payload.get("deal_type", "equity"),
                payload.get("stage", "sourcing"),
                payload.get("sponsor"),
                payload.get("target_close_date"),
                _q(payload.get("committed_capital")),
                _q(payload.get("invested_capital")),
                _q(payload.get("realized_distributions")),
            ),
        )
        return cur.fetchone()


def update_investment(*, investment_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        sets = []
        vals = []
        for col in (
            "name", "stage", "sponsor", "target_close_date",
            "committed_capital", "invested_capital", "realized_distributions",
        ):
            if col in payload:
                if col in ("committed_capital", "invested_capital", "realized_distributions"):
                    sets.append(f"{col} = %s")
                    vals.append(_q(payload[col]))
                else:
                    sets.append(f"{col} = %s")
                    vals.append(payload[col])
        if not sets:
            return get_investment(investment_id=investment_id)

        vals.append(str(investment_id))
        cur.execute(
            f"""
            UPDATE repe_deal SET {', '.join(sets)}
            WHERE deal_id = %s
            RETURNING deal_id AS investment_id, fund_id, name,
                      deal_type AS investment_type, stage, sponsor,
                      target_close_date, committed_capital,
                      invested_capital, realized_distributions, created_at
            """,
            vals,
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Investment {investment_id} not found")
        return row
