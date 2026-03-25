"""Rate sensitivity analysis for deal pipeline.

Applies interest rate and cap rate shock scenarios to active pipeline deals
and returns IRR/NAV impact estimates per deal.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _d(v) -> Decimal:
    if v is None:
        return Decimal("0")
    return Decimal(str(v))


def run_deal_rate_scenario(
    *,
    fund_id: UUID,
    quarter: str,
    rate_shock_bps: list[int] | None = None,
    metric: str = "irr",
) -> dict:
    """Run rate sensitivity across all deals in a fund.

    Fetches deals from repe_deal joined with re_investment_quarter_state
    for actual IRR, NAV, and debt_balance. Computes linear sensitivity
    per shock level.
    """
    if rate_shock_bps is None:
        rate_shock_bps = [50, 100, 150, 200, 250]

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                d.deal_id,
                d.name AS deal_name,
                d.stage,
                d.deal_type,
                iqs.gross_irr,
                iqs.net_irr,
                iqs.equity_multiple,
                iqs.nav,
                iqs.debt_balance,
                iqs.invested_capital,
                iqs.unrealized_value
            FROM repe_deal d
            LEFT JOIN LATERAL (
                SELECT *
                FROM re_investment_quarter_state
                WHERE investment_id = d.deal_id
                  AND quarter = %s
                  AND scenario_id IS NULL
                ORDER BY created_at DESC
                LIMIT 1
            ) iqs ON true
            WHERE d.fund_id = %s
            ORDER BY d.name
            """,
            (quarter, str(fund_id)),
        )
        deals = cur.fetchall()

    results = []
    for deal in deals:
        deal_result = _compute_deal_sensitivity(deal, rate_shock_bps)
        results.append(deal_result)

    # Sort by worst-case IRR impact (most negative first)
    results.sort(
        key=lambda r: min((s["delta_irr"] for s in r["scenarios"]), default=Decimal("0")),
    )

    # Summary
    worst_deal = results[0] if results else None
    avg_impact_100 = _avg_irr_delta_at_bps(results, 100)

    return _serialize({
        "fund_id": str(fund_id),
        "quarter": quarter,
        "rate_shocks_bps": rate_shock_bps,
        "deal_count": len(results),
        "deals": results,
        "summary": {
            "avg_irr_impact_100bps": avg_impact_100,
            "most_exposed_deal": worst_deal["deal_name"] if worst_deal else None,
            "most_exposed_delta": min((s["delta_irr"] for s in worst_deal["scenarios"]), default=None) if worst_deal else None,
        },
    })


def _compute_deal_sensitivity(deal: dict, shocks: list[int]) -> dict:
    """Estimate IRR sensitivity to rate shocks for a single deal."""
    gross_irr = _d(deal.get("gross_irr"))
    nav = _d(deal.get("nav"))
    debt_balance = _d(deal.get("debt_balance"))

    # Sensitivity coefficient: how much IRR changes per 100bps of rate shock
    # Empirical estimate — higher leverage = more sensitive
    leverage_ratio = debt_balance / nav if nav > 0 else Decimal("0.5")
    # ~50bps IRR impact per 100bps rate shock at 50% leverage, scaled linearly
    irr_sensitivity_per_100bps = Decimal("0.005") * (leverage_ratio / Decimal("0.5"))

    scenarios = []
    for shock_bps in shocks:
        shock_mult = Decimal(str(shock_bps)) / Decimal("100")
        delta_irr = -(irr_sensitivity_per_100bps * shock_mult)
        adjusted_irr = gross_irr + delta_irr

        # NAV impact: increased debt service reduces equity value
        delta_debt_service = debt_balance * Decimal(str(shock_bps)) / Decimal("10000")
        # Capitalized at ~6x (assumes 6-year hold)
        delta_nav = -(delta_debt_service * Decimal("6"))
        adjusted_nav = nav + delta_nav

        risk_rating = "stable"
        if delta_irr < Decimal("-0.020"):
            risk_rating = "elevated"
        elif delta_irr < Decimal("-0.010"):
            risk_rating = "watch"

        scenarios.append({
            "shock_bps": shock_bps,
            "projected_irr": adjusted_irr,
            "delta_irr": delta_irr,
            "projected_nav": adjusted_nav,
            "delta_nav": delta_nav,
            "delta_debt_service": delta_debt_service,
            "risk_rating": risk_rating,
        })

    return {
        "deal_id": str(deal.get("deal_id", "")),
        "deal_name": deal.get("deal_name") or deal.get("name", ""),
        "stage": deal.get("stage"),
        "current_irr": gross_irr,
        "current_nav": nav,
        "debt_balance": debt_balance,
        "leverage_ratio": leverage_ratio,
        "scenarios": scenarios,
    }


def _avg_irr_delta_at_bps(results: list[dict], target_bps: int) -> Decimal | None:
    """Average IRR delta across all deals at a specific shock level."""
    deltas = []
    for r in results:
        for s in r["scenarios"]:
            if s["shock_bps"] == target_bps:
                deltas.append(s["delta_irr"])
    if not deltas:
        return None
    return sum(deltas) / len(deltas)


def _serialize(obj):
    """Convert Decimal/UUID to JSON-safe values."""
    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    if hasattr(obj, "isoformat"):
        return str(obj)
    if hasattr(obj, "hex"):
        return str(obj)
    return obj
