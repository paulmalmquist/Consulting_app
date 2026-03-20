"""Tests for change order impact on draw calculations."""
from decimal import Decimal

from app.services.draw_calculator import _compute_line


class TestChangeOrderImpactOnDraw:
    """When a CO is approved, the scheduled value in the draw should reflect
    the updated budget (original + approved COs)."""

    def test_increased_budget_changes_percent_complete(self):
        # Before CO: 100k budget, 80k drawn = 80%
        before = _compute_line({
            "scheduled_value": "100000",
            "previous_draws": "80000",
            "current_draw": "0",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        assert before["percent_complete"] == Decimal("80.0000")

        # After CO adds 20k: 120k budget, 80k drawn = 66.67%
        after = _compute_line({
            "scheduled_value": "120000",
            "previous_draws": "80000",
            "current_draw": "0",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        assert after["percent_complete"] == Decimal("66.6667")

    def test_co_increases_balance_to_finish(self):
        before = _compute_line({
            "scheduled_value": "100000",
            "previous_draws": "80000",
            "current_draw": "0",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        assert before["balance_to_finish"] == Decimal("20000.00")

        # CO adds 30k
        after = _compute_line({
            "scheduled_value": "130000",
            "previous_draws": "80000",
            "current_draw": "0",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        assert after["balance_to_finish"] == Decimal("50000.00")

    def test_deductive_co_can_create_overbudget(self):
        # CO reduces budget below what's already drawn
        result = _compute_line({
            "scheduled_value": "70000",
            "previous_draws": "80000",
            "current_draw": "0",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        assert result["balance_to_finish"] == Decimal("-10000.00")
        assert result["percent_complete"] > Decimal("100")

    def test_co_retainage_recalculated(self):
        # With higher budget but same draws, retainage stays same (based on drawn)
        result = _compute_line({
            "scheduled_value": "200000",
            "previous_draws": "50000",
            "current_draw": "20000",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        # retainage = (50000 + 20000) * 10% = 7000
        assert result["retainage_amount"] == Decimal("7000.00")
