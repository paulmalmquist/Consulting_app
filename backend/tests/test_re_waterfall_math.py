"""Tests for waterfall tier math (pure functions, no DB).

Tests American vs European modes, clawback, allocation invariants.
"""

import pytest
from decimal import Decimal

from app.services.re_waterfall import apply_waterfall_tiers
from app.services.re_math import _d


# Standard tier structure
STANDARD_TIERS = [
    {"tier_order": 1, "tier_type": "return_of_capital"},
    {"tier_order": 2, "tier_type": "preferred_return"},
    {"tier_order": 3, "tier_type": "catch_up", "catchup_rate": 1.0, "split_pct_gp": 0.20},
    {"tier_order": 4, "tier_type": "carry_split", "split_pct_gp": 0.20},
]


class TestEuropeanWaterfall:
    """European mode: all capital + pref returned before any GP carry."""

    def test_full_return_plus_carry(self):
        """Net cash exceeds capital + pref, so GP earns carry."""
        allocations = apply_waterfall_tiers(
            net_cash=Decimal("15000000"),
            total_contributions=Decimal("10000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            pref_is_compound=False,
            quarters_held=8,  # 2 years
        )
        total_alloc = sum(_d(a["amount"]) for a in allocations)
        assert total_alloc == Decimal("15000000.00"), "Allocations must sum to net cash"

        # LP gets capital back in tier 1
        roc = [a for a in allocations if a["tier_type"] == "return_of_capital"][0]
        assert roc["amount"] == Decimal("10000000.00")
        assert roc["lp_amount"] == Decimal("10000000.00")
        assert roc["gp_amount"] == Decimal("0")

    def test_allocations_sum_to_net_cash(self):
        """INVARIANT: allocations must sum exactly to distributable cash."""
        for net_cash in [5_000_000, 10_000_000, 15_000_000, 25_000_000]:
            allocations = apply_waterfall_tiers(
                net_cash=Decimal(str(net_cash)),
                total_contributions=Decimal("10000000"),
                accrued_pref=Decimal("0"),
                tiers=STANDARD_TIERS,
                pref_rate=Decimal("0.08"),
                quarters_held=8,
            )
            total = sum(_d(a["amount"]) for a in allocations)
            assert total == Decimal(str(net_cash)), (
                f"Allocation mismatch: {total} != {net_cash}"
            )

    def test_no_carry_if_capital_not_returned(self):
        """If net cash < contributions, GP gets zero carry."""
        allocations = apply_waterfall_tiers(
            net_cash=Decimal("8000000"),
            total_contributions=Decimal("10000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            quarters_held=8,
        )
        gp_total = sum(_d(a.get("gp_amount", 0)) for a in allocations)
        assert gp_total == Decimal("0"), "GP should get nothing until all capital returned"

    def test_pref_paid_before_carry(self):
        """Pref return paid in full before catch-up or carry."""
        allocations = apply_waterfall_tiers(
            net_cash=Decimal("12000000"),
            total_contributions=Decimal("10000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            pref_is_compound=False,
            quarters_held=8,
        )
        roc = [a for a in allocations if a["tier_type"] == "return_of_capital"][0]
        pref = [a for a in allocations if a["tier_type"] == "preferred_return"][0]
        # Capital returned first
        assert roc["amount"] == Decimal("10000000.00")
        # Pref = 10M * 8% * 2yrs = 1,600,000
        assert pref["amount"] == Decimal("1600000.00")


class TestAmericanWaterfall:
    """American mode: deal-by-deal with clawback potential."""

    def test_deal_level_carry_allowed(self):
        """In American mode, GP can earn carry on individual profitable deals."""
        # Simulate a single profitable deal
        allocations = apply_waterfall_tiers(
            net_cash=Decimal("5000000"),
            total_contributions=Decimal("3000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            quarters_held=4,
        )
        gp_total = sum(_d(a.get("gp_amount", 0)) for a in allocations)
        assert gp_total > 0, "GP should earn carry on profitable deal in American mode"

    def test_clawback_scenario(self):
        """Deal 1 profitable (carry paid), Deal 2 loss => clawback exposure.

        After running both deals independently:
        - Deal 1: GP earns carry
        - Deal 2: loss, GP gets nothing
        - Clawback = GP carry from Deal 1 that shouldn't have been paid if fund-level
        """
        # Deal 1: big profit
        allocs1 = apply_waterfall_tiers(
            net_cash=Decimal("8000000"),
            total_contributions=Decimal("5000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            quarters_held=8,
        )
        gp_deal1 = sum(_d(a.get("gp_amount", 0)) for a in allocs1)

        # Deal 2: total loss
        allocs2 = apply_waterfall_tiers(
            net_cash=Decimal("2000000"),
            total_contributions=Decimal("5000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            quarters_held=8,
        )
        gp_deal2 = sum(_d(a.get("gp_amount", 0)) for a in allocs2)
        assert gp_deal2 == Decimal("0"), "No carry on losing deal"

        # At fund level, total: 10M cash vs 10M contributed
        # No profit => no carry at fund level
        # Clawback = GP carry paid on deal 1
        european = apply_waterfall_tiers(
            net_cash=Decimal("10000000"),
            total_contributions=Decimal("10000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            quarters_held=8,
        )
        gp_european = sum(_d(a.get("gp_amount", 0)) for a in european)
        clawback = gp_deal1 - gp_european
        assert clawback > 0, "Clawback exposure should exist"


class TestWaterfallInvariants:
    """Invariant tests that must always hold."""

    @pytest.mark.parametrize("net_cash", [0, 1_000_000, 10_000_000, 50_000_000])
    def test_lp_plus_gp_equals_net_cash(self, net_cash):
        allocations = apply_waterfall_tiers(
            net_cash=Decimal(str(net_cash)),
            total_contributions=Decimal("10000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            quarters_held=8,
        )
        total_lp = sum(_d(a.get("lp_amount", 0)) for a in allocations)
        total_gp = sum(_d(a.get("gp_amount", 0)) for a in allocations)
        assert total_lp + total_gp == Decimal(str(net_cash))

    def test_no_negative_allocations(self):
        allocations = apply_waterfall_tiers(
            net_cash=Decimal("15000000"),
            total_contributions=Decimal("10000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            quarters_held=8,
        )
        for a in allocations:
            assert _d(a.get("amount", 0)) >= 0
            assert _d(a.get("lp_amount", 0)) >= 0
            assert _d(a.get("gp_amount", 0)) >= 0

    def test_compound_pref_exceeds_simple(self):
        """Compound preferred return should be >= simple for same period."""
        simple = apply_waterfall_tiers(
            net_cash=Decimal("20000000"),
            total_contributions=Decimal("10000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            pref_is_compound=False,
            quarters_held=16,  # 4 years
        )
        compound = apply_waterfall_tiers(
            net_cash=Decimal("20000000"),
            total_contributions=Decimal("10000000"),
            accrued_pref=Decimal("0"),
            tiers=STANDARD_TIERS,
            pref_rate=Decimal("0.08"),
            pref_is_compound=True,
            quarters_held=16,
        )
        simple_pref = [a for a in simple if a["tier_type"] == "preferred_return"][0]
        compound_pref = [a for a in compound if a["tier_type"] == "preferred_return"][0]
        assert _d(compound_pref["amount"]) >= _d(simple_pref["amount"])
