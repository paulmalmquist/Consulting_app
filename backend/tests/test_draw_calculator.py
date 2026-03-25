"""Tests for draw calculator — line item computation, retainage, and totals."""
from decimal import Decimal

from app.services.draw_calculator import _compute_line, _d


class TestComputeLine:
    def test_total_completed_sums_all_components(self):
        result = _compute_line({
            "scheduled_value": "500000",
            "previous_draws": "200000",
            "current_draw": "50000",
            "materials_stored": "10000",
            "retainage_pct": "10.0000",
        })
        assert result["total_completed"] == Decimal("260000.00")

    def test_percent_complete_correct(self):
        result = _compute_line({
            "scheduled_value": "400000",
            "previous_draws": "200000",
            "current_draw": "0",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        assert result["percent_complete"] == Decimal("50.0000")

    def test_retainage_computed_from_total(self):
        result = _compute_line({
            "scheduled_value": "100000",
            "previous_draws": "50000",
            "current_draw": "20000",
            "materials_stored": "5000",
            "retainage_pct": "10.0000",
        })
        # total = 75000, retainage = 75000 * 10% = 7500
        assert result["retainage_amount"] == Decimal("7500.00")

    def test_balance_to_finish_correct(self):
        result = _compute_line({
            "scheduled_value": "100000",
            "previous_draws": "50000",
            "current_draw": "20000",
            "materials_stored": "5000",
            "retainage_pct": "10.0000",
        })
        # balance = 100000 - 75000 = 25000
        assert result["balance_to_finish"] == Decimal("25000.00")

    def test_zero_scheduled_value(self):
        result = _compute_line({
            "scheduled_value": "0",
            "previous_draws": "0",
            "current_draw": "0",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        assert result["percent_complete"] == Decimal("0")
        assert result["total_completed"] == Decimal("0.00")

    def test_full_completion(self):
        result = _compute_line({
            "scheduled_value": "100000",
            "previous_draws": "80000",
            "current_draw": "20000",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        assert result["percent_complete"] == Decimal("100.0000")
        assert result["balance_to_finish"] == Decimal("0.00")

    def test_over_budget(self):
        result = _compute_line({
            "scheduled_value": "100000",
            "previous_draws": "90000",
            "current_draw": "20000",
            "materials_stored": "0",
            "retainage_pct": "10.0000",
        })
        assert result["total_completed"] == Decimal("110000.00")
        assert result["balance_to_finish"] == Decimal("-10000.00")

    def test_custom_retainage_pct(self):
        result = _compute_line({
            "scheduled_value": "100000",
            "previous_draws": "0",
            "current_draw": "50000",
            "materials_stored": "0",
            "retainage_pct": "5.0000",
        })
        # retainage = 50000 * 5% = 2500
        assert result["retainage_amount"] == Decimal("2500.00")


class TestDecimalHelper:
    def test_none_returns_zero(self):
        assert _d(None) == Decimal("0.00")

    def test_string_conversion(self):
        assert _d("123.456") == Decimal("123.46")

    def test_integer_conversion(self):
        assert _d(100) == Decimal("100.00")
