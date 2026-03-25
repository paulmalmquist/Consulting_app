"""Deterministic XIRR implementation for finance runs."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from .utils import to_decimal


def _xnpv(rate: float, cashflows: list[tuple[date, Decimal]]) -> float:
    if rate <= -0.999999999:
        return float("inf")
    d0 = cashflows[0][0]
    total = 0.0
    for dt, amount in cashflows:
        days = (dt - d0).days
        years = days / 365.0
        total += float(amount) / ((1.0 + rate) ** years)
    return total


def xirr(cashflows: list[tuple[date, Decimal]]) -> Decimal | None:
    if len(cashflows) < 2:
        return None

    values = [float(to_decimal(v)) for _, v in cashflows]
    if not any(v < 0 for v in values) or not any(v > 0 for v in values):
        return None

    lo = -0.9999
    hi = 10.0
    f_lo = _xnpv(lo, cashflows)
    f_hi = _xnpv(hi, cashflows)

    if f_lo == 0:
        return to_decimal(lo)
    if f_hi == 0:
        return to_decimal(hi)
    if f_lo * f_hi > 0:
        return None

    for _ in range(200):
        mid = (lo + hi) / 2.0
        f_mid = _xnpv(mid, cashflows)
        if abs(f_mid) < 1e-10:
            return to_decimal(mid)
        if f_lo * f_mid < 0:
            hi = mid
            f_hi = f_mid
        else:
            lo = mid
            f_lo = f_mid

    return to_decimal((lo + hi) / 2.0)
