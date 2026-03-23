"""Pure, stateless math functions for real estate fund valuation.

Every function is deterministic: same inputs → identical outputs.
No database access, no side effects, no global state.
These functions are the ONLY place valuation math lives.
"""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP

# ---------------------------------------------------------------------------
# Type alias for clarity — all monetary/rate values use Decimal for precision
# ---------------------------------------------------------------------------
D = Decimal

TWO_PLACES = Decimal("0.01")
SIX_PLACES = Decimal("0.000001")


def _d(v) -> Decimal:
    """Coerce to Decimal safely."""
    if isinstance(v, Decimal):
        return v
    if v is None:
        return Decimal(0)
    return Decimal(str(v))


# ---------------------------------------------------------------------------
# Operating metrics
# ---------------------------------------------------------------------------

def calculate_gpr(units_or_sqft: D, market_rent_per_unit: D) -> D:
    """Gross Potential Rent = units × market rent per unit."""
    return (_d(units_or_sqft) * _d(market_rent_per_unit)).quantize(TWO_PLACES, ROUND_HALF_UP)


def calculate_vacancy_loss(gpr: D, vacancy_rate: D) -> D:
    """Vacancy & credit loss = GPR × vacancy rate."""
    return (_d(gpr) * _d(vacancy_rate)).quantize(TWO_PLACES, ROUND_HALF_UP)


def calculate_egi(gpr: D, vacancy_loss: D, other_income: D = D(0)) -> D:
    """Effective Gross Income = GPR - vacancy loss + other income."""
    return (_d(gpr) - _d(vacancy_loss) + _d(other_income)).quantize(TWO_PLACES, ROUND_HALF_UP)


def calculate_noi(egi: D, operating_expenses: D) -> D:
    """Net Operating Income = EGI - operating expenses."""
    return (_d(egi) - _d(operating_expenses)).quantize(TWO_PLACES, ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Valuation methods
# ---------------------------------------------------------------------------

def calculate_value_direct_cap(forward_noi: D, cap_rate: D) -> D:
    """Direct capitalization: Value = Forward 12-month NOI / Cap Rate."""
    cap = _d(cap_rate)
    if cap <= 0:
        raise ValueError(f"Cap rate must be positive, got {cap}")
    return (_d(forward_noi) / cap).quantize(TWO_PLACES, ROUND_HALF_UP)


def calculate_value_dcf(
    base_noi: D,
    rent_growth: D,
    expense_growth: D,
    vacancy_assumption: D,
    exit_cap_rate: D,
    discount_rate: D,
    hold_years: int = 10,
    capex_reserve_pct: D = D(0),
    base_expenses: D | None = None,
    base_gpr: D | None = None,
) -> D:
    """Discounted Cash Flow valuation (10-year default hold).

    Forecasts NOI each year with growth assumptions, computes terminal value
    at exit cap rate, and discounts everything to present value.

    If base_expenses and base_gpr are provided, rent and expenses grow
    separately.  Otherwise, NOI grows at rent_growth net of expense_growth.
    """
    dr = _d(discount_rate)
    ec = _d(exit_cap_rate)
    rg = _d(rent_growth)
    eg = _d(expense_growth)
    vac = _d(vacancy_assumption)
    capex_pct = _d(capex_reserve_pct)

    if ec <= 0:
        raise ValueError(f"Exit cap rate must be positive, got {ec}")
    if dr <= 0:
        raise ValueError(f"Discount rate must be positive, got {dr}")

    pv_total = D(0)

    # If we have component-level data, grow each separately
    if base_gpr is not None and base_expenses is not None:
        gpr = _d(base_gpr)
        expenses = _d(base_expenses)
        for year in range(1, hold_years + 1):
            gpr = gpr * (1 + rg)
            expenses = expenses * (1 + eg)
            egi = gpr * (1 - vac)
            noi = egi - expenses
            capex = noi * capex_pct
            cf = noi - capex
            pv = cf / ((1 + dr) ** year)
            pv_total += pv
        # Terminal value based on final year NOI
        terminal_noi = gpr * (1 + rg) * (1 - vac) - expenses * (1 + eg)
    else:
        # Simple: grow NOI directly
        noi = _d(base_noi)
        for year in range(1, hold_years + 1):
            noi = noi * (1 + rg)
            capex = noi * capex_pct
            cf = noi - capex
            pv = cf / ((1 + dr) ** year)
            pv_total += pv
        terminal_noi = noi * (1 + rg)

    terminal_value = terminal_noi / ec
    pv_terminal = terminal_value / ((1 + dr) ** hold_years)
    pv_total += pv_terminal

    return pv_total.quantize(TWO_PLACES, ROUND_HALF_UP)


def calculate_value_blended(
    value_cap: D, value_dcf: D, weight_cap: D, weight_dcf: D
) -> D:
    """Blended value = w_cap × value_cap + w_dcf × value_dcf."""
    wc = _d(weight_cap)
    wd = _d(weight_dcf)
    total_weight = wc + wd
    if total_weight <= 0:
        raise ValueError("Method weights must sum to positive")
    # Normalize weights
    return (
        (_d(value_cap) * wc + _d(value_dcf) * wd) / total_weight
    ).quantize(TWO_PLACES, ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Equity & debt metrics
# ---------------------------------------------------------------------------

def calculate_equity_value(implied_gross_value: D, loan_balance: D) -> D:
    """Implied equity = gross value - outstanding debt."""
    return (_d(implied_gross_value) - _d(loan_balance)).quantize(TWO_PLACES, ROUND_HALF_UP)


def calculate_nav_equity(
    implied_equity_value: D, accrued_pref: D = D(0), deduct_pref: bool = False
) -> D:
    """NAV equity, optionally reduced by accrued preferred return."""
    nav = _d(implied_equity_value)
    if deduct_pref:
        nav -= _d(accrued_pref)
    return nav.quantize(TWO_PLACES, ROUND_HALF_UP)


def calculate_ltv(loan_balance: D, implied_gross_value: D) -> D:
    """Loan-to-Value = loan_balance / implied_gross_value."""
    v = _d(implied_gross_value)
    if v <= 0:
        raise ValueError(f"Implied gross value must be positive, got {v}")
    return (_d(loan_balance) / v).quantize(SIX_PLACES, ROUND_HALF_UP)


def calculate_dscr(noi: D, debt_service: D) -> D:
    """Debt Service Coverage Ratio = NOI / annual debt service."""
    ds = _d(debt_service)
    if ds <= 0:
        raise ValueError(f"Debt service must be positive, got {ds}")
    return (_d(noi) / ds).quantize(Decimal("0.0001"), ROUND_HALF_UP)


def calculate_debt_yield(noi: D, loan_balance: D) -> D:
    """Debt Yield = NOI / loan_balance."""
    lb = _d(loan_balance)
    if lb <= 0:
        raise ValueError(f"Loan balance must be positive, got {lb}")
    return (_d(noi) / lb).quantize(SIX_PLACES, ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# IRR calculation (Newton's method)
# ---------------------------------------------------------------------------

def calculate_irr(
    cashflows: list[tuple[float, float]],
    max_iterations: int = 200,
    tolerance: float = 1e-10,
) -> float | None:
    """Compute IRR from a list of (year_fraction, amount) tuples.

    Uses Newton-Raphson method. Returns None if no convergence.
    Cash flows: contributions are negative, distributions + ending NAV positive.
    year_fraction is the time in years from inception (0.0, 0.25, 0.50, ...).
    """
    if not cashflows or len(cashflows) < 2:
        return None

    def npv(rate: float) -> float:
        return sum(cf / (1 + rate) ** t for t, cf in cashflows)

    def npv_deriv(rate: float) -> float:
        return sum(-t * cf / (1 + rate) ** (t + 1) for t, cf in cashflows)

    # Initial guess
    rate = 0.10
    for _ in range(max_iterations):
        f = npv(rate)
        fp = npv_deriv(rate)
        if abs(fp) < 1e-14:
            break
        new_rate = rate - f / fp
        if abs(new_rate - rate) < tolerance:
            return round(new_rate, 6)
        rate = new_rate
        # Guard against divergence
        if abs(rate) > 10:
            return None
    return round(rate, 6) if abs(npv(rate)) < 0.01 else None


# ---------------------------------------------------------------------------
# Amortization schedule generation
# ---------------------------------------------------------------------------

def generate_amortization_schedule(
    loan_balance: D,
    annual_rate: D,
    amortization_years: int,
    term_years: int,
    io_period_months: int = 0,
) -> list[dict]:
    """Generate monthly amortization schedule.

    Returns list of dicts with: period_number, beginning_balance,
    scheduled_principal, interest_payment, total_payment, ending_balance.
    """
    balance = _d(loan_balance)
    monthly_rate = _d(annual_rate) / 12
    total_months = amortization_years * 12
    term_months = term_years * 12

    # Calculate fully-amortizing monthly payment
    if monthly_rate > 0 and amortization_years > 0:
        r = monthly_rate
        n = total_months
        monthly_payment = balance * (r * (1 + r) ** n) / ((1 + r) ** n - 1)
    else:
        monthly_payment = D(0)

    schedule = []
    for month in range(1, term_months + 1):
        interest = (balance * monthly_rate).quantize(TWO_PLACES, ROUND_HALF_UP)

        if month <= io_period_months:
            # Interest-only period
            principal = D(0)
            payment = interest
        else:
            payment = monthly_payment.quantize(TWO_PLACES, ROUND_HALF_UP)
            principal = (payment - interest).quantize(TWO_PLACES, ROUND_HALF_UP)
            if principal < 0:
                principal = D(0)

        ending = (balance - principal).quantize(TWO_PLACES, ROUND_HALF_UP)

        schedule.append({
            "period_number": month,
            "beginning_balance": balance,
            "scheduled_principal": principal,
            "interest_payment": interest,
            "total_payment": payment,
            "ending_balance": ending,
        })
        balance = ending

    return schedule


# ---------------------------------------------------------------------------
# Sensitivity analysis
# ---------------------------------------------------------------------------

def compute_sensitivities(
    forward_noi: D,
    loan_balance: D,
    debt_service: D,
    base_cap_rate: D,
) -> dict:
    """Compute sensitivity table: NAV/equity/DSCR under cap rate shocks."""
    sensitivities = []
    for delta_bps in [-50, -25, 0, 25, 50, 100]:
        shocked_cap = _d(base_cap_rate) + D(delta_bps) / D(10000)
        if shocked_cap <= 0:
            continue
        val = calculate_value_direct_cap(_d(forward_noi), shocked_cap)
        eq = calculate_equity_value(val, _d(loan_balance))
        ltv = calculate_ltv(_d(loan_balance), val)
        sensitivities.append({
            "cap_rate_delta_bps": delta_bps,
            "cap_rate": str(shocked_cap),
            "implied_value": str(val),
            "equity_value": str(eq),
            "ltv": str(ltv),
        })
    return {"cap_rate_sensitivity": sensitivities}


# ---------------------------------------------------------------------------
# Input hashing for reproducibility
# ---------------------------------------------------------------------------

def compute_input_hash(data: dict) -> str:
    """SHA-256 hash of canonically serialized input dict."""
    canonical = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()
