"""Tests for draw variance detection — 4 rules, thresholds, and edge cases."""
from decimal import Decimal

from app.services.draw_variance import (
    _check_burn_rate,
    _check_overbill,
    _check_overbudget,
    _check_percent_deviation,
    Severity,
)


class TestOverbillDetection:
    def test_no_flag_under_90_pct(self):
        line = {"cost_code": "03-300", "scheduled_value": "100000", "total_completed": "80000", "current_draw": "10000"}
        assert _check_overbill(line) is None

    def test_warning_at_95_pct(self):
        line = {"cost_code": "03-300", "scheduled_value": "100000", "total_completed": "95000", "current_draw": "15000"}
        flag = _check_overbill(line)
        assert flag is not None
        assert flag.severity == Severity.WARNING.value

    def test_critical_over_100_pct(self):
        line = {"cost_code": "03-300", "scheduled_value": "100000", "total_completed": "110000", "current_draw": "20000"}
        flag = _check_overbill(line)
        assert flag is not None
        assert flag.severity == Severity.CRITICAL.value
        assert flag.amount_at_risk == Decimal("10000.00")

    def test_zero_scheduled_no_flag(self):
        line = {"cost_code": "03-300", "scheduled_value": "0", "total_completed": "0", "current_draw": "0"}
        assert _check_overbill(line) is None

    def test_exactly_90_pct_no_flag(self):
        line = {"cost_code": "03-300", "scheduled_value": "100000", "total_completed": "90000", "current_draw": "5000"}
        assert _check_overbill(line) is None


class TestBurnRateCheck:
    def test_normal_burn_no_flag(self):
        line = {"cost_code": "03-300", "current_draw": "10000"}
        avg = Decimal("10000")
        assert _check_burn_rate(line, avg) is None

    def test_elevated_burn_warning(self):
        line = {"cost_code": "03-300", "current_draw": "15000"}
        avg = Decimal("10000")
        flag = _check_burn_rate(line, avg)
        assert flag is not None
        assert flag.severity == Severity.WARNING.value

    def test_extreme_burn_critical(self):
        line = {"cost_code": "03-300", "current_draw": "25000"}
        avg = Decimal("10000")
        flag = _check_burn_rate(line, avg)
        assert flag is not None
        assert flag.severity == Severity.CRITICAL.value

    def test_zero_average_no_flag(self):
        line = {"cost_code": "03-300", "current_draw": "10000"}
        assert _check_burn_rate(line, Decimal("0")) is None

    def test_zero_current_no_flag(self):
        line = {"cost_code": "03-300", "current_draw": "0"}
        assert _check_burn_rate(line, Decimal("10000")) is None

    def test_at_120_pct_no_flag(self):
        line = {"cost_code": "03-300", "current_draw": "12000"}
        avg = Decimal("10000")
        assert _check_burn_rate(line, avg) is None


class TestOverbudgetDetection:
    def test_under_budget_no_flag(self):
        line = {"cost_code": "03-300", "scheduled_value": "100000", "total_completed": "80000"}
        assert _check_overbudget(line) is None

    def test_at_budget_no_flag(self):
        line = {"cost_code": "03-300", "scheduled_value": "100000", "total_completed": "100000"}
        assert _check_overbudget(line) is None

    def test_over_budget_warning(self):
        line = {"cost_code": "03-300", "scheduled_value": "100000", "total_completed": "103000"}
        flag = _check_overbudget(line)
        assert flag is not None
        assert flag.severity == Severity.WARNING.value
        assert flag.amount_at_risk == Decimal("3000.00")

    def test_over_budget_critical(self):
        line = {"cost_code": "03-300", "scheduled_value": "100000", "total_completed": "110000"}
        flag = _check_overbudget(line)
        assert flag is not None
        assert flag.severity == Severity.CRITICAL.value


class TestPercentDeviation:
    def test_aligned_no_flag(self):
        line = {"cost_code": "03-300", "percent_complete": "50", "scheduled_value": "100000", "total_completed": "50000"}
        assert _check_percent_deviation(line, Decimal("45")) is None

    def test_small_divergence_no_flag(self):
        line = {"cost_code": "03-300", "percent_complete": "60", "scheduled_value": "100000", "total_completed": "60000"}
        assert _check_percent_deviation(line, Decimal("50")) is None

    def test_warning_at_20pp(self):
        line = {"cost_code": "03-300", "percent_complete": "70", "scheduled_value": "100000", "total_completed": "70000"}
        flag = _check_percent_deviation(line, Decimal("50"))
        assert flag is not None
        assert flag.severity == Severity.WARNING.value

    def test_critical_at_30pp(self):
        line = {"cost_code": "03-300", "percent_complete": "80", "scheduled_value": "100000", "total_completed": "80000"}
        flag = _check_percent_deviation(line, Decimal("50"))
        assert flag is not None
        assert flag.severity == Severity.CRITICAL.value

    def test_zero_project_pct_no_flag(self):
        line = {"cost_code": "03-300", "percent_complete": "50", "scheduled_value": "100000", "total_completed": "50000"}
        assert _check_percent_deviation(line, Decimal("0")) is None
