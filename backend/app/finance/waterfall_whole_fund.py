"""
Whole-fund (European-style) waterfall engine.

Pure function — no DB reads, no side effects.
Takes the full fund cash flow timeline + terminal NAV + assumptions,
returns LP/GP allocations with audit receipt.

Waterfall tiers:
  1. Return of Capital (LP 100%)
  2. Preferred Return (time-weighted, LP 100%)
  3. GP Catch-up (GP 100% until GP has promote_pct of total profit)
  4. Residual Split (LP/GP per promote terms)

Conservation law:
  lp_total + gp_total = total_gross_value (within $1 tolerance)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")
ONE = Decimal("1")
CENTS = Decimal("0.01")
BPS4 = Decimal("0.0001")
ANNUAL_DAYS = Decimal("365.25")


@dataclass(frozen=True)
class WholeFundAssumptions:
    pref_rate: Decimal
    promote_pct: Decimal
    lp_residual: Decimal
    gp_residual: Decimal


@dataclass(frozen=True)
class DatedCashFlow:
    dt: date
    amount: Decimal


class WaterfallInputError(ValueError):
    pass


class ConservationError(RuntimeError):
    pass


def _q(v: Decimal) -> Decimal:
    return v.quantize(CENTS, rounding=ROUND_HALF_UP)


def _accrue_pref(
    events: list[tuple[date, Decimal]],
    pref_rate: Decimal,
    terminal_date: date,
) -> Decimal:
    """Time-weighted preferred return on LP unreturned capital."""
    if not events:
        return ZERO
    balance = ZERO
    total_pref = ZERO
    prev = events[0][0]
    for dt, change in events:
        if dt > prev and balance > ZERO:
            days = Decimal(str((dt - prev).days))
            total_pref += balance * pref_rate * days / ANNUAL_DAYS
        balance = max(balance + change, ZERO)
        prev = dt
    if terminal_date > prev and balance > ZERO:
        days = Decimal(str((terminal_date - prev).days))
        total_pref += balance * pref_rate * days / ANNUAL_DAYS
    return _q(total_pref)


def run_whole_fund_waterfall(
    cash_flows: list[DatedCashFlow],
    terminal_nav: Decimal,
    terminal_date: date,
    assumptions: WholeFundAssumptions,
) -> dict:
    """Run European-style whole-fund waterfall.

    Returns a dict with all allocations, LP/GP cash flows, net IRR,
    and an audit receipt table.
    """
    if not cash_flows:
        raise WaterfallInputError("empty cash flow series")

    contribs = sorted([cf for cf in cash_flows if cf.amount < ZERO], key=lambda c: c.dt)
    dists = sorted([cf for cf in cash_flows if cf.amount > ZERO], key=lambda c: c.dt)

    if not contribs:
        raise WaterfallInputError("no contributions found")
    if terminal_nav < ZERO:
        raise WaterfallInputError(f"terminal NAV negative: {terminal_nav}")

    total_called = sum(abs(cf.amount) for cf in contribs)
    total_distributed = sum(cf.amount for cf in dists)
    total_value = total_distributed + terminal_nav
    gross_profit = total_value - total_called

    # ── Pref accrual ─────────────────────────────────────────────────
    capital_events: list[tuple[date, Decimal]] = []
    for cf in sorted(cash_flows, key=lambda c: c.dt):
        capital_events.append((cf.dt, -cf.amount))

    pref_accrued = _accrue_pref(capital_events, assumptions.pref_rate, terminal_date)

    # ── Tier 1: Return of Capital ────────────────────────────────────
    pool = total_value
    roc = _q(min(pool, total_called))
    pool -= roc

    # ── Tier 2: Preferred Return ─────────────────────────────────────
    pref_paid = _q(min(pool, pref_accrued))
    pool -= pref_paid

    # ── Tier 3: GP Catch-up ──────────────────────────────────────────
    # GP receives 100% until GP ends at exactly promote_pct of total profit.
    # Total profit = pref_paid + pool (everything above ROC).
    # After catch-up x, residual (pool - x) is split lp_residual / gp_residual.
    # GP total = x + gp_residual × (pool - x) = promote_pct × total_profit
    # Solving: x(1 - gp_residual) = promote_pct × total_profit - gp_residual × pool
    #          x = (promote_pct × total_profit - gp_residual × pool) / (1 - gp_residual)
    total_profit = pref_paid + pool
    gp_target_total = _q(total_profit * assumptions.promote_pct)
    denominator = ONE - assumptions.gp_residual
    if denominator > ZERO:
        raw_catchup = (gp_target_total - assumptions.gp_residual * pool) / denominator
        catchup = _q(max(ZERO, min(pool, raw_catchup)))
    else:
        catchup = _q(min(pool, gp_target_total))
    pool -= catchup

    # ── Tier 4: Residual Split ───────────────────────────────────────
    lp_residual = _q(pool * assumptions.lp_residual)
    gp_residual = _q(pool - lp_residual)

    # ── Totals ───────────────────────────────────────────────────────
    lp_total = _q(roc + pref_paid + lp_residual)
    gp_total = _q(catchup + gp_residual)

    # ── Conservation ─────────────────────────────────────────────────
    delta = abs(lp_total + gp_total - total_value)
    if delta > ONE:
        raise ConservationError(
            f"LP({lp_total}) + GP({gp_total}) = {lp_total + gp_total} "
            f"vs gross value {total_value}, delta {delta}"
        )

    # ── LP cash flows for net IRR ────────────────────────────────────
    lp_cfs = [DatedCashFlow(dt=cf.dt, amount=cf.amount) for cf in contribs]
    lp_cfs.append(DatedCashFlow(dt=terminal_date, amount=lp_total))

    net_irr = _xirr(lp_cfs)
    net_tvpi = _q(lp_total / total_called) if total_called > ZERO else None

    gross_cfs = list(cash_flows) + [DatedCashFlow(dt=terminal_date, amount=terminal_nav)]
    gross_irr = _xirr(gross_cfs)
    spread = _q(gross_irr - net_irr) if gross_irr is not None and net_irr is not None else None

    # ── Receipt ──────────────────────────────────────────────────────
    receipt = [
        {"tier": "Total Contributions", "amount": str(total_called)},
        {"tier": "Total Gross Value (dists + NAV)", "amount": str(_q(total_value))},
        {"tier": "Gross Profit", "amount": str(_q(gross_profit))},
        {"tier": "Tier 1: Return of Capital (LP 100%)", "amount": str(roc), "lp": str(roc), "gp": "0"},
        {"tier": f"Tier 2: Pref ({assumptions.pref_rate * 100}%) — accrued {pref_accrued}", "amount": str(pref_paid), "lp": str(pref_paid), "gp": "0"},
        {"tier": f"Tier 3: GP Catch-up ({assumptions.promote_pct * 100}% target)", "amount": str(catchup), "lp": "0", "gp": str(catchup)},
        {"tier": f"Tier 4: Residual ({assumptions.lp_residual * 100}/{assumptions.gp_residual * 100})", "amount": str(_q(lp_residual + gp_residual)), "lp": str(lp_residual), "gp": str(gp_residual)},
        {"tier": "LP Total", "amount": str(lp_total)},
        {"tier": "GP Total (Carry)", "amount": str(gp_total)},
        {"tier": "Conservation: LP + GP", "amount": str(_q(lp_total + gp_total)), "check": "✓" if delta <= ONE else "✗"},
    ]

    return {
        "total_called": total_called,
        "total_distributed": total_distributed,
        "terminal_nav": terminal_nav,
        "total_value": _q(total_value),
        "gross_profit": _q(gross_profit),
        "pref_accrued": pref_accrued,
        "pref_paid": pref_paid,
        "roc": roc,
        "gp_catchup": catchup,
        "lp_residual": lp_residual,
        "gp_residual": gp_residual,
        "lp_total": lp_total,
        "gp_total": gp_total,
        "lp_cash_flows": lp_cfs,
        "gp_cash_flows": [DatedCashFlow(dt=terminal_date, amount=gp_total)],
        "net_irr": net_irr,
        "net_tvpi": net_tvpi,
        "gross_irr": gross_irr,
        "gross_net_spread": spread,
        "receipt": receipt,
    }


def _xirr(cfs: list[DatedCashFlow]) -> Decimal | None:
    if len(cfs) < 2:
        return None
    if not (any(cf.amount < ZERO for cf in cfs) and any(cf.amount > ZERO for cf in cfs)):
        return None
    s = sorted(cfs, key=lambda c: c.dt)
    t0 = s[0].dt
    amounts = [float(cf.amount) for cf in s]
    years = [float((cf.dt - t0).days) / 365.25 for cf in s]
    rate = 0.10
    for _ in range(300):
        npv = sum(a / ((1 + rate) ** t) for a, t in zip(amounts, years))
        dnpv = sum(-t * a / ((1 + rate) ** (t + 1)) for a, t in zip(amounts, years))
        if abs(dnpv) < 1e-14:
            break
        new_rate = rate - npv / dnpv
        if abs(new_rate - rate) < 1e-10:
            rate = new_rate
            break
        rate = new_rate
    else:
        return None
    if rate < -0.99 or rate > 10.0:
        return None
    return Decimal(str(round(rate, 6)))
