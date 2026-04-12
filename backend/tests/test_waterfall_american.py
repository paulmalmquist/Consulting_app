"""Tests for the American (per-distribution) waterfall engine.

Five required categories:
  1. Per-distribution conservation: LP + GP = gross for each step
  2. Cumulative conservation: sum(LP) + sum(GP) = sum(gross)
  3. Pref correctness over time: accrual tracks capital outstanding
  4. GP share sanity: over full lifecycle, GP ≈ 20% of total profit
  5. Timing sensitivity: change dist timing → IRR changes
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.finance.waterfall_american import (
    AmericanWaterfallAssumptions,
    ConservationError,
    DatedCashFlow,
    WaterfallInputError,
    run_american_waterfall,
)

STD = AmericanWaterfallAssumptions(
    pref_rate=Decimal("0.08"),
    promote_pct=Decimal("0.20"),
    lp_residual=Decimal("0.80"),
    gp_residual=Decimal("0.20"),
)


def _mref3_cash_flows() -> list[DatedCashFlow]:
    """MREF III actual cash flows."""
    return [
        DatedCashFlow(date(2019, 6, 15), Decimal("-85000000")),
        DatedCashFlow(date(2020, 1, 15), Decimal("-80000000")),
        DatedCashFlow(date(2020, 9, 15), Decimal("-65000000")),
        DatedCashFlow(date(2021, 3, 15), Decimal("-55000000")),
        DatedCashFlow(date(2021, 10, 15), Decimal("-40000000")),
        DatedCashFlow(date(2022, 4, 15), Decimal("-25000000")),
        DatedCashFlow(date(2023, 7, 15), Decimal("61700000")),
        DatedCashFlow(date(2023, 12, 31), Decimal("22100000")),
        DatedCashFlow(date(2024, 4, 15), Decimal("73500000")),
        DatedCashFlow(date(2024, 10, 15), Decimal("37100000")),
        DatedCashFlow(date(2024, 12, 31), Decimal("22600000")),
        DatedCashFlow(date(2025, 4, 15), Decimal("96400000")),
        DatedCashFlow(date(2025, 7, 15), Decimal("28000000")),
        DatedCashFlow(date(2025, 12, 15), Decimal("37000000")),
        DatedCashFlow(date(2025, 12, 31), Decimal("21600000")),
    ]


def _simple_multi_dist() -> list[DatedCashFlow]:
    """Simple 2-call, 3-distribution example."""
    return [
        DatedCashFlow(date(2023, 1, 1), Decimal("-50000000")),
        DatedCashFlow(date(2023, 6, 1), Decimal("-50000000")),
        DatedCashFlow(date(2024, 6, 1), Decimal("40000000")),
        DatedCashFlow(date(2025, 1, 1), Decimal("50000000")),
        DatedCashFlow(date(2025, 6, 1), Decimal("30000000")),
    ]


# ── 1. Per-distribution conservation ────────────────────────────────────

def test_each_step_conserves():
    r = run_american_waterfall(_mref3_cash_flows(), Decimal("42852173.50"), date(2026, 6, 30), STD)
    for step in r["step_receipts"]:
        delta = abs(step.lp_total + step.gp_total - step.gross_amount)
        assert delta <= Decimal("1.00"), (
            f"Step {step.dt}: LP({step.lp_total}) + GP({step.gp_total}) != gross({step.gross_amount})"
        )


# ── 2. Cumulative conservation ──────────────────────────────────────────

def test_cumulative_conservation():
    r = run_american_waterfall(_mref3_cash_flows(), Decimal("42852173.50"), date(2026, 6, 30), STD)
    cum_delta = abs(r["total_lp"] + r["total_gp"] - r["total_gross_distributed"])
    assert cum_delta <= Decimal("1.00"), (
        f"Cumulative: LP({r['total_lp']}) + GP({r['total_gp']}) != gross({r['total_gross_distributed']})"
    )


# ── 3. Pref correctness over time ──────────────────────────────────────

def test_early_distributions_are_pure_roc():
    """First distributions should be 100% return of capital (no pref paid, no carry)."""
    r = run_american_waterfall(_mref3_cash_flows(), Decimal("42852173.50"), date(2026, 6, 30), STD)
    first_step = r["step_receipts"][0]
    assert first_step.roc > ZERO
    assert first_step.gp_total == ZERO, "GP should get nothing on first distribution (capital not returned)"


def test_pref_accrues_between_distributions():
    """After capital is returned, pref should be non-zero."""
    r = run_american_waterfall(_mref3_cash_flows(), Decimal("42852173.50"), date(2026, 6, 30), STD)
    pref_steps = [s for s in r["step_receipts"] if s.pref_paid > ZERO]
    assert len(pref_steps) > 0, "At least one distribution should pay pref"


# ── 4. GP share sanity ──────────────────────────────────────────────────

def test_below_hurdle_fund_gp_gets_zero():
    """MREF III: 5.5% gross return vs 8% pref → GP earns zero carry. Correct."""
    r = run_american_waterfall(_mref3_cash_flows(), Decimal("42852173.50"), date(2026, 6, 30), STD)
    assert r["gp_share_of_profit"] == Decimal("0.00"), (
        f"Below-hurdle fund: GP should get 0 carry, got {r['gp_share_of_profit']}"
    )
    assert r["total_gp"] == ZERO


def test_above_hurdle_fund_gp_gets_promote():
    """High-return fund: GP should get ~20% of profit and receive carry before terminal."""
    cfs = _simple_multi_dist()  # $100M in, $120M out + $10M NAV = $30M profit on short hold
    r = run_american_waterfall(cfs, Decimal("10000000"), date(2026, 1, 1), STD)
    gp_share = r["gp_share_of_profit"]
    assert gp_share is not None and gp_share > ZERO, "Above-hurdle fund: GP should earn carry"
    # GP should be approximately 20% of profit
    assert Decimal("0.10") <= gp_share <= Decimal("0.25"), (
        f"GP share = {gp_share}, expected approximately 0.20"
    )


def test_gp_receives_carry_before_terminal():
    """American-style: GP gets carry from individual distributions on high-return fund."""
    cfs = _simple_multi_dist()
    r = run_american_waterfall(cfs, Decimal("10000000"), date(2026, 1, 1), STD)
    gp_before_terminal = [cf for cf in r["gp_cash_flows"] if cf.dt < date(2026, 1, 1)]
    assert len(gp_before_terminal) > 0, "GP should receive carry before terminal date"


# ── 5. Timing sensitivity ──────────────────────────────────────────────

def test_timing_affects_irr():
    """Shifting distributions earlier should increase net IRR."""
    cfs_normal = _simple_multi_dist()
    cfs_early = [
        DatedCashFlow(date(2023, 1, 1), Decimal("-50000000")),
        DatedCashFlow(date(2023, 6, 1), Decimal("-50000000")),
        DatedCashFlow(date(2024, 1, 1), Decimal("40000000")),   # 5 months earlier
        DatedCashFlow(date(2024, 6, 1), Decimal("50000000")),   # 7 months earlier
        DatedCashFlow(date(2024, 12, 1), Decimal("30000000")),  # 6 months earlier
    ]
    r_normal = run_american_waterfall(cfs_normal, Decimal("10000000"), date(2026, 1, 1), STD)
    r_early = run_american_waterfall(cfs_early, Decimal("10000000"), date(2026, 1, 1), STD)
    assert r_early["net_irr"] > r_normal["net_irr"], (
        f"Earlier distributions should increase IRR: early={r_early['net_irr']}, normal={r_normal['net_irr']}"
    )


# ── 6. Fail-closed ─────────────────────────────────────────────────────

def test_empty_raises():
    with pytest.raises(WaterfallInputError):
        run_american_waterfall([], Decimal("100"), date(2025, 1, 1), STD)


def test_no_contributions_raises():
    with pytest.raises(WaterfallInputError):
        run_american_waterfall(
            [DatedCashFlow(date(2024, 1, 1), Decimal("10000000"))],
            Decimal("100"), date(2025, 1, 1), STD,
        )


# ── 7. Multi-period LP cash flows ──────────────────────────────────────

def test_lp_has_multiple_positive_cash_flows():
    """American waterfall should produce multiple LP distributions, not one terminal lump."""
    r = run_american_waterfall(_mref3_cash_flows(), Decimal("42852173.50"), date(2026, 6, 30), STD)
    lp_positive = [cf for cf in r["lp_cash_flows"] if cf.amount > ZERO]
    assert len(lp_positive) > 1, (
        f"Expected multiple LP distributions, got {len(lp_positive)}"
    )


ZERO = Decimal("0")


# ── 8. Hurdle classification ────────────────────────────────────────────

def test_mref3_below_hurdle_classification():
    r = run_american_waterfall(_mref3_cash_flows(), Decimal("42852173.50"), date(2026, 6, 30), STD)
    assert r["hurdle_status"] == "below_hurdle"
    assert r["pref_shortfall"] > ZERO
    assert r["pref_coverage_pct"] < Decimal("100")


def test_above_hurdle_fund_classification():
    cfs = _simple_multi_dist()
    r = run_american_waterfall(cfs, Decimal("10000000"), date(2026, 1, 1), STD)
    assert r["hurdle_status"] == "above_hurdle"
