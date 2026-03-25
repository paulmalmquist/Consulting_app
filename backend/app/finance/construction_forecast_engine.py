"""Construction forecast-at-completion (FAC) math."""

from __future__ import annotations

from decimal import Decimal

from .utils import qmoney


def compute_forecast(
    *,
    revised_budget: Decimal,
    committed_cost: Decimal,
    actual_cost: Decimal,
) -> dict:
    revised = qmoney(revised_budget)
    committed = qmoney(committed_cost)
    actual = qmoney(actual_cost)

    etc = qmoney(max(revised - max(committed, actual), Decimal("0")))
    fac = qmoney(actual + etc)
    variance_amount = qmoney(fac - revised)
    variance_pct = qmoney((variance_amount / revised) if revised != 0 else Decimal("0"))

    return {
        "forecast_at_completion": fac,
        "total_budget": revised,
        "total_committed": committed,
        "total_actual": actual,
        "total_remaining": etc,
        "variance_amount": variance_amount,
        "variance_pct": variance_pct,
    }
