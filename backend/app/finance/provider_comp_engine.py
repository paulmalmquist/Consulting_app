"""Healthcare provider compensation formulas."""

from __future__ import annotations

from decimal import Decimal

from .utils import qmoney


def compute_provider_comp(
    *,
    plan_formula: str,
    base_rate: Decimal,
    incentive_rate: Decimal,
    gross_collections: Decimal,
    net_collections: Decimal,
) -> Decimal:
    gross = qmoney(gross_collections)
    net = qmoney(net_collections)
    base = qmoney(base_rate)
    incentive = qmoney(incentive_rate)

    formula = plan_formula.strip().lower()
    if formula == "gross_collections_pct":
        return qmoney(gross * base)
    if formula == "base_plus_incentive":
        threshold = qmoney(gross * Decimal("0.8"))
        bonus_base = max(net - threshold, Decimal("0"))
        return qmoney((net * base) + (bonus_base * incentive))

    # default: net collections percentage
    return qmoney(net * base)
