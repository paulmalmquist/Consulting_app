"""Generic deterministic allocation helpers."""

from __future__ import annotations

from decimal import Decimal
from typing import Mapping

from .utils import qmoney, to_decimal


def allocate_pro_rata(total_amount: Decimal, weights: Mapping[str, Decimal]) -> dict[str, Decimal]:
    total = qmoney(total_amount)
    positive_keys = sorted([k for k, v in weights.items() if to_decimal(v) > 0])
    if total <= 0 or not positive_keys:
        return {}

    weight_sum = sum(to_decimal(weights[k]) for k in positive_keys)
    if weight_sum <= 0:
        return {}

    out: dict[str, Decimal] = {}
    allocated = Decimal("0")
    for idx, key in enumerate(positive_keys):
        if idx == len(positive_keys) - 1:
            amount = qmoney(total - allocated)
        else:
            raw = total * to_decimal(weights[key]) / weight_sum
            amount = qmoney(raw)
            allocated += amount
        out[key] = amount
    return out
