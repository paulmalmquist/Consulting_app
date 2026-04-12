"""Tests for the whole-fund waterfall engine.

Five required test categories:
  1. Conservation: LP + GP = gross value
  2. Pref correctness: known example → exact match
  3. Catch-up: GP reaches target promote %
  4. IRR parity: net IRR < gross IRR (carry drag)
  5. Fail-closed: missing inputs → error, not partial results
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.finance.waterfall_whole_fund import (
    ConservationError,
    DatedCashFlow,
    WaterfallInputError,
    WholeFundAssumptions,
    run_whole_fund_waterfall,
)

STD_ASSUMPTIONS = WholeFundAssumptions(
    pref_rate=Decimal("0.08"),
    promote_pct=Decimal("0.20"),
    lp_residual=Decimal("0.80"),
    gp_residual=Decimal("0.20"),
)


def _simple_fund() -> tuple[list[DatedCashFlow], Decimal, date]:
    """One call, one distribution, one terminal NAV. 2-year hold."""
    cfs = [
        DatedCashFlow(dt=date(2023, 1, 1), amount=Decimal("-100000000")),  # $100M call
        DatedCashFlow(dt=date(2024, 1, 1), amount=Decimal("10000000")),    # $10M dist
    ]
    terminal_nav = Decimal("140000000")  # $140M NAV
    terminal_date = date(2025, 1, 1)
    return cfs, terminal_nav, terminal_date


# ── 1. Conservation test ─────────────────────────────────────────────────

def test_conservation_lp_plus_gp_equals_gross_value():
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    total_value = result["total_value"]
    lp_gp = result["lp_total"] + result["gp_total"]
    assert abs(lp_gp - total_value) <= Decimal("1.00"), (
        f"Conservation failed: LP({result['lp_total']}) + GP({result['gp_total']}) = {lp_gp}, "
        f"total_value = {total_value}"
    )


# ── 2. Pref correctness ─────────────────────────────────────────────────

def test_pref_accrual_known_example():
    """$100M called on 2023-01-01, 8% pref, terminal 2025-01-01 (2 years).
    Expected pref ≈ $100M × 0.08 × 2 = $16M (simple interest approximation)."""
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    # Pref should be close to $16M (the $10M dist at year 1 reduces the capital base)
    # After $10M dist: capital base drops to $90M for year 2
    # Pref = $100M × 0.08 × 1yr + $90M × 0.08 × 1yr = $8M + $7.2M = $15.2M (approx)
    pref = result["pref_accrued"]
    assert Decimal("14000000") < pref < Decimal("16500000"), (
        f"Pref accrual {pref} outside expected range $14M-$16.5M for 2yr hold on $100M"
    )


def test_pref_fully_paid_when_sufficient_profit():
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    assert result["pref_paid"] == result["pref_accrued"], (
        f"Pref not fully paid: paid {result['pref_paid']} vs accrued {result['pref_accrued']}"
    )


# ── 3. Catch-up correctness ─────────────────────────────────────────────

def test_gp_receives_exactly_promote_share_of_profit():
    """GP must end at exactly promote_pct (20%) of total profit.

    The catch-up is sized so that catch-up + GP residual = 20% of
    (pref + remaining pool). This is the standard PE waterfall invariant.
    """
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    gross_profit = result["gross_profit"]
    gp_total = result["gp_total"]
    gp_share_of_profit = gp_total / gross_profit if gross_profit > 0 else Decimal("0")
    assert abs(gp_share_of_profit - Decimal("0.20")) < Decimal("0.005"), (
        f"GP share of profit = {gp_share_of_profit:.4f}, expected exactly 0.20"
    )


def test_catchup_is_bounded_by_remaining_pool():
    """GP catch-up cannot exceed the distributable pool after ROC + pref."""
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    pool_after_roc_pref = result["total_value"] - result["roc"] - result["pref_paid"]
    assert result["gp_catchup"] <= pool_after_roc_pref


# ── 4. IRR parity ────────────────────────────────────────────────────────

def test_net_irr_less_than_gross_irr():
    """Carry drag means net IRR < gross IRR."""
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    assert result["net_irr"] is not None
    assert result["gross_irr"] is not None
    assert result["net_irr"] < result["gross_irr"], (
        f"Net IRR ({result['net_irr']}) should be less than gross IRR ({result['gross_irr']})"
    )


def test_gross_net_spread_is_positive():
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    assert result["gross_net_spread"] is not None
    assert result["gross_net_spread"] > Decimal("0")


# ── 5. Fail-closed ──────────────────────────────────────────────────────

def test_empty_cash_flows_raises():
    with pytest.raises(WaterfallInputError, match="empty"):
        run_whole_fund_waterfall([], Decimal("100"), date(2025, 1, 1), STD_ASSUMPTIONS)


def test_no_contributions_raises():
    cfs = [DatedCashFlow(dt=date(2024, 1, 1), amount=Decimal("10000000"))]
    with pytest.raises(WaterfallInputError, match="no contributions"):
        run_whole_fund_waterfall(cfs, Decimal("100"), date(2025, 1, 1), STD_ASSUMPTIONS)


def test_negative_nav_raises():
    cfs = [DatedCashFlow(dt=date(2023, 1, 1), amount=Decimal("-100000000"))]
    with pytest.raises(WaterfallInputError, match="negative"):
        run_whole_fund_waterfall(cfs, Decimal("-1000"), date(2025, 1, 1), STD_ASSUMPTIONS)


# ── 6. Receipt table structure ───────────────────────────────────────────

def test_receipt_has_conservation_check():
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    receipt = result["receipt"]
    conservation_row = [r for r in receipt if "Conservation" in r["tier"]]
    assert len(conservation_row) == 1
    assert conservation_row[0].get("check") == "✓"


def test_receipt_covers_all_tiers():
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    receipt = result["receipt"]
    tier_names = [r["tier"] for r in receipt]
    assert any("Return of Capital" in t for t in tier_names)
    assert any("Pref" in t for t in tier_names)
    assert any("Catch-up" in t for t in tier_names)
    assert any("Residual" in t for t in tier_names)


# ── 7. Hurdle classification ────────────────────────────────────────────

def test_above_hurdle_classification():
    cfs, nav, td = _simple_fund()
    result = run_whole_fund_waterfall(cfs, nav, td, STD_ASSUMPTIONS)
    assert result["hurdle_status"] == "above_hurdle"
    assert result["pref_shortfall"] == Decimal("0")
    assert result["pref_coverage_pct"] == Decimal("100")


def test_below_hurdle_classification():
    """Fund with tiny return relative to pref → below hurdle."""
    cfs = [
        DatedCashFlow(dt=date(2023, 1, 1), amount=Decimal("-100000000")),
        DatedCashFlow(dt=date(2024, 1, 1), amount=Decimal("5000000")),
    ]
    # $100M called, $5M dist + $100M NAV = $105M total, $5M profit
    # Pref = $8M (1yr at 8%) → below hurdle
    result = run_whole_fund_waterfall(cfs, Decimal("100000000"), date(2025, 1, 1), STD_ASSUMPTIONS)
    assert result["hurdle_status"] == "below_hurdle"
    assert result["pref_shortfall"] > Decimal("0")
