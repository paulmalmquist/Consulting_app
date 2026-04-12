"""
American-style (per-distribution) waterfall engine.

Processes each distribution independently against a running state machine.
GP carry crystallizes per-distribution, not at terminal.

State tracks: capital outstanding, pref accrual, cumulative GP carry.
Each distribution mutates state through the standard 4-tier cascade:
  1. Return of Capital
  2. Preferred Return
  3. GP Catch-up
  4. Residual Split

Conservation law (per distribution AND cumulative):
  lp_amount + gp_amount = gross_distribution (per step)
  sum(lp) + sum(gp) = sum(gross) (cumulative)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")
ONE = Decimal("1")
CENTS = Decimal("0.01")
ANNUAL_DAYS = Decimal("365.25")


@dataclass(frozen=True)
class AmericanWaterfallAssumptions:
    pref_rate: Decimal
    promote_pct: Decimal
    lp_residual: Decimal
    gp_residual: Decimal


@dataclass(frozen=True)
class DatedCashFlow:
    dt: date
    amount: Decimal


@dataclass
class WaterfallState:
    capital_outstanding: Decimal = ZERO
    pref_accrued_unpaid: Decimal = ZERO
    gp_carry_paid: Decimal = ZERO
    lp_distributed: Decimal = ZERO
    gp_distributed: Decimal = ZERO
    last_event_date: date | None = None
    total_contributed: Decimal = ZERO
    total_gross_distributed: Decimal = ZERO


@dataclass(frozen=True)
class StepReceipt:
    dt: date
    gross_amount: Decimal
    source_memo: str
    roc: Decimal
    pref_paid: Decimal
    catchup: Decimal
    lp_promote: Decimal
    gp_promote: Decimal
    lp_total: Decimal
    gp_total: Decimal
    capital_remaining: Decimal
    pref_outstanding: Decimal
    cumulative_gp_carry: Decimal


class WaterfallInputError(ValueError):
    pass


class ConservationError(RuntimeError):
    pass


def _q(v: Decimal) -> Decimal:
    return v.quantize(CENTS, rounding=ROUND_HALF_UP)


def _accrue_pref(state: WaterfallState, to_date: date, pref_rate: Decimal) -> None:
    """Accrue preferred return on outstanding capital since last event."""
    if state.last_event_date is None or state.capital_outstanding <= ZERO:
        return
    days = Decimal(str((to_date - state.last_event_date).days))
    if days <= ZERO:
        return
    accrual = state.capital_outstanding * pref_rate * days / ANNUAL_DAYS
    state.pref_accrued_unpaid += _q(accrual)


def _process_contribution(state: WaterfallState, cf: DatedCashFlow) -> None:
    """Record a capital call (increases capital outstanding)."""
    amt = abs(cf.amount)
    state.capital_outstanding += amt
    state.total_contributed += amt
    state.last_event_date = cf.dt


def _process_distribution(
    state: WaterfallState,
    cf: DatedCashFlow,
    assumptions: AmericanWaterfallAssumptions,
    memo: str = "",
) -> StepReceipt:
    """Process one distribution through the 4-tier waterfall."""
    gross = cf.amount
    pool = gross

    # Tier 1: Return of Capital
    roc = _q(min(pool, state.capital_outstanding))
    state.capital_outstanding -= roc
    pool -= roc

    # Tier 2: Preferred Return
    pref_paid = _q(min(pool, state.pref_accrued_unpaid))
    state.pref_accrued_unpaid -= pref_paid
    pool -= pref_paid

    # Tier 3: GP Catch-up
    # GP gets 100% until GP ends at promote_pct of profit distributed so far.
    # Profit = everything above ROC in THIS distribution = pref_paid + pool
    # Plus all prior profit (cumulative GP carry + cumulative LP profit above ROC)
    # Simplified: at this point, pool is pure profit. GP target for this pool:
    #   catchup + gp_residual × (pool - catchup) = promote_pct × (pref_paid + pool)
    #   catchup(1 - gp_residual) = promote_pct × (pref_paid + pool) - gp_residual × pool
    #   catchup = (promote_pct × (pref_paid + pool) - gp_residual × pool) / (1 - gp_residual)
    profit_this_dist = pref_paid + pool
    if profit_this_dist > ZERO and assumptions.gp_residual < ONE:
        gp_target = _q(profit_this_dist * assumptions.promote_pct)
        raw_catchup = (gp_target - assumptions.gp_residual * pool) / (ONE - assumptions.gp_residual)
        catchup = _q(max(ZERO, min(pool, raw_catchup)))
    else:
        catchup = ZERO
    pool -= catchup

    # Tier 4: Residual Split
    lp_promote = _q(pool * assumptions.lp_residual)
    gp_promote = _q(pool - lp_promote)

    # Totals
    lp_total = _q(roc + pref_paid + lp_promote)
    gp_total = _q(catchup + gp_promote)

    # Conservation check
    delta = abs(lp_total + gp_total - gross)
    if delta > ONE:
        raise ConservationError(
            f"Step {cf.dt}: LP({lp_total}) + GP({gp_total}) != gross({gross}), delta={delta}"
        )

    # Update state
    state.lp_distributed += lp_total
    state.gp_distributed += gp_total
    state.gp_carry_paid += gp_total
    state.total_gross_distributed += gross
    state.last_event_date = cf.dt

    return StepReceipt(
        dt=cf.dt,
        gross_amount=gross,
        source_memo=memo,
        roc=roc,
        pref_paid=pref_paid,
        catchup=catchup,
        lp_promote=lp_promote,
        gp_promote=gp_promote,
        lp_total=lp_total,
        gp_total=gp_total,
        capital_remaining=state.capital_outstanding,
        pref_outstanding=state.pref_accrued_unpaid,
        cumulative_gp_carry=state.gp_carry_paid,
    )


def run_american_waterfall(
    cash_flows: list[DatedCashFlow],
    terminal_nav: Decimal,
    terminal_date: date,
    assumptions: AmericanWaterfallAssumptions,
    memos: dict[str, str] | None = None,
) -> dict:
    """Run American-style per-distribution waterfall.

    cash_flows: dated contributions (negative) and distributions (positive).
    terminal_nav: unrealized NAV at terminal_date (distributed as final event).
    memos: optional {iso_date: memo} for receipt annotation.

    Returns full state history, per-distribution receipts, LP/GP cash flows,
    and net metrics.
    """
    if not cash_flows:
        raise WaterfallInputError("empty cash flow series")

    sorted_cfs = sorted(cash_flows, key=lambda c: c.dt)
    contribs = [cf for cf in sorted_cfs if cf.amount < ZERO]
    dists = [cf for cf in sorted_cfs if cf.amount > ZERO]

    if not contribs:
        raise WaterfallInputError("no contributions found")
    if terminal_nav < ZERO:
        raise WaterfallInputError(f"terminal NAV negative: {terminal_nav}")

    memo_map = memos or {}
    state = WaterfallState()
    step_receipts: list[StepReceipt] = []
    lp_cfs: list[DatedCashFlow] = []
    gp_cfs: list[DatedCashFlow] = []

    # Process all events chronologically
    for cf in sorted_cfs:
        if cf.amount < ZERO:
            _accrue_pref(state, cf.dt, assumptions.pref_rate)
            _process_contribution(state, cf)
            lp_cfs.append(DatedCashFlow(dt=cf.dt, amount=cf.amount))
        else:
            _accrue_pref(state, cf.dt, assumptions.pref_rate)
            receipt = _process_distribution(
                state, cf, assumptions,
                memo=memo_map.get(cf.dt.isoformat(), ""),
            )
            step_receipts.append(receipt)
            if receipt.lp_total > ZERO:
                lp_cfs.append(DatedCashFlow(dt=cf.dt, amount=receipt.lp_total))
            if receipt.gp_total > ZERO:
                gp_cfs.append(DatedCashFlow(dt=cf.dt, amount=receipt.gp_total))

    # Terminal NAV distribution
    if terminal_nav > ZERO:
        terminal_cf = DatedCashFlow(dt=terminal_date, amount=terminal_nav)
        _accrue_pref(state, terminal_date, assumptions.pref_rate)
        terminal_receipt = _process_distribution(
            state, terminal_cf, assumptions, memo="Terminal NAV distribution",
        )
        step_receipts.append(terminal_receipt)
        if terminal_receipt.lp_total > ZERO:
            lp_cfs.append(DatedCashFlow(dt=terminal_date, amount=terminal_receipt.lp_total))
        if terminal_receipt.gp_total > ZERO:
            gp_cfs.append(DatedCashFlow(dt=terminal_date, amount=terminal_receipt.gp_total))

    # Cumulative conservation
    total_gross = state.total_gross_distributed
    total_lp = state.lp_distributed
    total_gp = state.gp_distributed
    cum_delta = abs(total_lp + total_gp - total_gross)
    if cum_delta > ONE:
        raise ConservationError(
            f"Cumulative: LP({total_lp}) + GP({total_gp}) != gross({total_gross}), delta={cum_delta}"
        )

    # Net IRR from multi-period LP cash flows
    net_irr = _xirr(lp_cfs)
    net_tvpi = _q(total_lp / state.total_contributed) if state.total_contributed > ZERO else None

    gross_cfs = list(cash_flows) + [DatedCashFlow(dt=terminal_date, amount=terminal_nav)]
    gross_irr = _xirr(gross_cfs)
    spread = _q(gross_irr - net_irr) if gross_irr is not None and net_irr is not None else None

    # GP share of total profit
    total_profit = total_gross - state.total_contributed
    gp_share_of_profit = _q(total_gp / total_profit) if total_profit > ZERO else None

    return {
        "waterfall_type": "american",
        "total_contributed": state.total_contributed,
        "total_gross_distributed": total_gross,
        "total_lp": total_lp,
        "total_gp": total_gp,
        "terminal_nav": terminal_nav,
        "capital_outstanding": state.capital_outstanding,
        "pref_outstanding": state.pref_accrued_unpaid,
        "gp_share_of_profit": gp_share_of_profit,
        "net_irr": net_irr,
        "net_tvpi": net_tvpi,
        "gross_irr": gross_irr,
        "gross_net_spread": spread,
        "lp_cash_flows": lp_cfs,
        "gp_cash_flows": gp_cfs,
        "step_receipts": step_receipts,
        "distribution_count": len(step_receipts),
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
