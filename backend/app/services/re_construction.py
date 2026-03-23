"""Construction schedule helpers for development-stage waterfall analysis."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.finance.construction_forecast_engine import compute_forecast


def _quarter_end(quarter: str) -> date:
    year = int(quarter[:4])
    q = int(quarter[-1])
    month = q * 3
    if month == 3:
        return date(year, 3, 31)
    if month == 6:
        return date(year, 6, 30)
    if month == 9:
        return date(year, 9, 30)
    return date(year, 12, 31)


def load_construction_schedule(*, fund_id: UUID, asset_id: UUID | None = None) -> list[dict]:
    conditions = ["fund_id = %s"]
    params: list[str] = [str(fund_id)]
    if asset_id:
        conditions.append("asset_id = %s")
        params.append(str(asset_id))
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT draw_id, fund_id, asset_id, draw_date, amount, draw_type, status
            FROM re_construction_draw
            WHERE {' AND '.join(conditions)}
            ORDER BY draw_date
            """,
            params,
        )
        return cur.fetchall()


def project_stabilization(
    *,
    budget: Decimal,
    committed: Decimal,
    actual: Decimal,
    monthly_draw_rate: Decimal,
    as_of_date: date,
) -> dict:
    forecast = compute_forecast(
        revised_budget=budget,
        committed_cost=committed,
        actual_cost=actual,
    )
    remaining = Decimal(str(forecast["total_remaining"]))
    draw_rate = monthly_draw_rate if monthly_draw_rate > 0 else Decimal("1")
    months_to_stabilization = int((remaining / draw_rate).quantize(Decimal("1"))) if remaining > 0 else 0
    if months_to_stabilization < 0:
        months_to_stabilization = 0
    projected_month = as_of_date.month + months_to_stabilization
    projected_year = as_of_date.year + ((projected_month - 1) // 12)
    projected_month = ((projected_month - 1) % 12) + 1
    stabilization_date = date(projected_year, projected_month, min(as_of_date.day, 28))
    return {
        **forecast,
        "months_to_stabilization": months_to_stabilization,
        "stabilization_date": stabilization_date.isoformat(),
    }


def adjust_waterfall_timing(
    *,
    fund_id: UUID,
    quarter: str,
    construction_projections: dict,
) -> dict:
    months = int(construction_projections.get("months_to_stabilization") or 0)
    delay_months = max(months, 0)
    timing_discount = max(Decimal("0.80"), Decimal("1") - (Decimal(delay_months) * Decimal("0.005")))
    return {
        "fund_id": str(fund_id),
        "quarter": quarter,
        "exit_shift_applied": delay_months,
        "timing_discount_factor": timing_discount,
        "noi_ramp_schedule": {
            "stabilization_date": construction_projections.get("stabilization_date"),
            "ramp_months": delay_months,
        },
    }


def load_budget_summary(*, fund_id: UUID, asset_id: UUID | None = None, quarter: str | None = None) -> dict:
    params: list[str] = [str(fund_id)]
    asset_clause = ""
    if asset_id:
        asset_clause = "AND a.asset_id = %s"
        params.append(str(asset_id))
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                COALESCE(SUM(b.revised_budget), 0) AS revised_budget,
                COALESCE(SUM(b.total_committed), 0) AS committed_cost,
                COALESCE(SUM(b.total_actual), 0) AS actual_cost
            FROM re_budget_summary b
            JOIN repe_asset a ON a.asset_id = b.asset_id
            JOIN repe_deal d ON d.deal_id = a.deal_id
            WHERE d.fund_id = %s
              {asset_clause}
            """,
            params,
        )
        row = cur.fetchone() or {}
    return {
        "revised_budget": Decimal(str(row.get("revised_budget") or 0)),
        "committed_cost": Decimal(str(row.get("committed_cost") or 0)),
        "actual_cost": Decimal(str(row.get("actual_cost") or 0)),
        "as_of_date": _quarter_end(quarter or date.today().strftime("%YQ1")),
    }
