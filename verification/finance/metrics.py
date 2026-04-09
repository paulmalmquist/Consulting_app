"""
Canonical finance functions for truth parity verification.

These are the AUTHORITATIVE truth. Pure math — no database access, no API calls.
Each function takes explicit inputs and returns a Decimal with defined precision.

If SQL says 12.7% and Python says 11.9%, the test fails before it reaches the UI.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Sequence

# ---------------------------------------------------------------------------
# Precision constants
# ---------------------------------------------------------------------------

RATE_PRECISION = Decimal("0.000000000001")   # 12 decimal places (matching DB)
MONEY_PRECISION = Decimal("0.01")            # 2 decimal places
MULTIPLE_PRECISION = Decimal("0.0001")       # 4 decimal places

# ---------------------------------------------------------------------------
# Tolerance thresholds (for verification assertions)
# ---------------------------------------------------------------------------

TOLERANCES = {
    "nav": Decimal("1"),            # $1 tolerance on NAV
    "irr": Decimal("0.0001"),       # 1 basis point
    "tvpi": Decimal("0.0001"),
    "dpi": Decimal("0.0001"),
    "rvpi": Decimal("0.0001"),
    "dscr": Decimal("0.0001"),
    "ltv": Decimal("0.0001"),
    "debt_yield": Decimal("0.0001"),
    "pct": Decimal("0.0001"),       # 0.01%
    "ai": Decimal("0.005"),         # 50 bps for AI (may round for display)
}


# ---------------------------------------------------------------------------
# Cashflow-based IRR (XIRR)
# ---------------------------------------------------------------------------

@dataclass
class Cashflow:
    date: date
    amount: Decimal  # negative = outflow (investment), positive = inflow (distribution)


def compute_irr(cashflows: Sequence[Cashflow], guess: float = 0.1, max_iter: int = 200, tol: float = 1e-10) -> Decimal | None:
    """
    Compute XIRR (annualized internal rate of return) using Newton's method.

    Returns Decimal rate or None if the solver does not converge.
    Cashflows should include the initial investment as a negative amount
    and all distributions as positive amounts.
    """
    if not cashflows or len(cashflows) < 2:
        return None

    dates = [cf.date for cf in cashflows]
    amounts = [float(cf.amount) for cf in cashflows]
    d0 = min(dates)

    # Day fractions
    fracs = [(d - d0).days / 365.25 for d in dates]

    rate = guess
    for _ in range(max_iter):
        npv = sum(a / (1 + rate) ** t for a, t in zip(amounts, fracs))
        dnpv = sum(-t * a / (1 + rate) ** (t + 1) for a, t in zip(amounts, fracs))

        if abs(dnpv) < 1e-15:
            break

        new_rate = rate - npv / dnpv

        if abs(new_rate - rate) < tol:
            return Decimal(str(new_rate)).quantize(RATE_PRECISION)

        rate = new_rate

    return None  # Did not converge


# ---------------------------------------------------------------------------
# Return multiples
# ---------------------------------------------------------------------------

def compute_tvpi(
    total_distributions: Decimal,
    residual_nav: Decimal,
    total_contributions: Decimal,
) -> Decimal | None:
    """Total Value to Paid-In = (Distributions + NAV) / Contributions"""
    if total_contributions <= 0:
        return None
    return ((total_distributions + residual_nav) / total_contributions).quantize(MULTIPLE_PRECISION)


def compute_dpi(
    total_distributions: Decimal,
    total_contributions: Decimal,
) -> Decimal | None:
    """Distributions to Paid-In = Distributions / Contributions"""
    if total_contributions <= 0:
        return None
    return (total_distributions / total_contributions).quantize(MULTIPLE_PRECISION)


def compute_rvpi(
    residual_nav: Decimal,
    total_contributions: Decimal,
) -> Decimal | None:
    """Residual Value to Paid-In = NAV / Contributions"""
    if total_contributions <= 0:
        return None
    return (residual_nav / total_contributions).quantize(MULTIPLE_PRECISION)


# ---------------------------------------------------------------------------
# NAV rollup
# ---------------------------------------------------------------------------

def compute_nav_rollup(asset_navs: Sequence[Decimal]) -> Decimal:
    """
    Sum of asset-level NAVs. The rollup must tie exactly.
    Fund NAV = sum of investment NAVs = sum of asset NAVs.
    """
    return sum(asset_navs, Decimal(0))


# ---------------------------------------------------------------------------
# Debt metrics
# ---------------------------------------------------------------------------

def compute_dscr(noi: Decimal, debt_service: Decimal) -> Decimal | None:
    """Debt Service Coverage Ratio = NOI / Annual Debt Service"""
    if debt_service <= 0:
        return None
    return (noi / debt_service).quantize(MULTIPLE_PRECISION)


def compute_ltv(debt_balance: Decimal, asset_value: Decimal) -> Decimal | None:
    """Loan-to-Value = Debt Balance / Asset Value"""
    if asset_value <= 0:
        return None
    return (debt_balance / asset_value).quantize(MULTIPLE_PRECISION)


def compute_debt_yield(noi: Decimal, debt_balance: Decimal) -> Decimal | None:
    """Debt Yield = NOI / Debt Balance"""
    if debt_balance <= 0:
        return None
    return (noi / debt_balance).quantize(MULTIPLE_PRECISION)


# ---------------------------------------------------------------------------
# Capital deployment
# ---------------------------------------------------------------------------

def compute_pct_invested(called: Decimal, committed: Decimal) -> Decimal | None:
    """Percent invested = Called / Committed"""
    if committed <= 0:
        return None
    return (called / committed).quantize(MULTIPLE_PRECISION)


# ---------------------------------------------------------------------------
# Model overlay delta
# ---------------------------------------------------------------------------

def compute_model_overlay_delta(base_value: Decimal, model_value: Decimal) -> Decimal:
    """Simple delta: model_value - base_value"""
    return model_value - base_value


# ---------------------------------------------------------------------------
# Weighted average (NAV-weighted)
# ---------------------------------------------------------------------------

def compute_nav_weighted_average(
    values: Sequence[Decimal],
    navs: Sequence[Decimal],
) -> Decimal | None:
    """NAV-weighted average of a metric across funds."""
    if len(values) != len(navs):
        raise ValueError("values and navs must have same length")

    total_nav = sum(navs, Decimal(0))
    if total_nav <= 0:
        return None

    weighted_sum = sum(v * n for v, n in zip(values, navs))
    return (weighted_sum / total_nav).quantize(RATE_PRECISION)


# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

def assert_within_tolerance(
    actual: Decimal | None,
    expected: Decimal | None,
    metric_name: str,
    tolerance_key: str | None = None,
) -> tuple[bool, str]:
    """
    Compare two values within the defined tolerance for that metric.
    Returns (passed, message).
    """
    if actual is None and expected is None:
        return True, f"{metric_name}: both None — pass"

    if actual is None or expected is None:
        return False, f"{metric_name}: actual={actual}, expected={expected} — one is None"

    key = tolerance_key or metric_name.lower().replace(" ", "_")
    tol = TOLERANCES.get(key, Decimal("0.0001"))

    diff = abs(actual - expected)
    passed = diff <= tol

    return (
        passed,
        f"{metric_name}: actual={actual}, expected={expected}, diff={diff}, "
        f"tolerance={tol} — {'pass' if passed else 'FAIL'}",
    )
