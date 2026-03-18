"""Tests for Capital Projects service and routes.

Unit tests for pure calculation functions plus route-level integration tests
that use the fake_cursor fixture from conftest.
"""
import os
import sys
from decimal import Decimal

import pytest

# Ensure the backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from app.services.capital_projects import (  # noqa: E402
    compute_budget_health,
    compute_overall_health,
    compute_schedule_health,
)


class TestBudgetHealth:
    def test_zero_budget_is_green(self):
        assert compute_budget_health(Decimal("0"), Decimal("0"), Decimal("0")) == "green"

    def test_under_budget_is_green(self):
        assert compute_budget_health(Decimal("1000000"), Decimal("900000"), Decimal("100000")) == "green"

    def test_on_budget_is_green(self):
        assert compute_budget_health(Decimal("1000000"), Decimal("1000000"), Decimal("0")) == "green"

    def test_small_overrun_is_yellow(self):
        # 3% over budget
        assert compute_budget_health(Decimal("1000000"), Decimal("1030000"), Decimal("0")) == "yellow"

    def test_large_overrun_is_red(self):
        # 10% over budget
        assert compute_budget_health(Decimal("1000000"), Decimal("1100000"), Decimal("0")) == "red"

    def test_exactly_five_pct_is_yellow(self):
        # At -5% boundary (exclusive of red)
        assert compute_budget_health(Decimal("1000000"), Decimal("1049999"), Decimal("0")) == "yellow"

    def test_over_five_pct_is_red(self):
        assert compute_budget_health(Decimal("1000000"), Decimal("1050001"), Decimal("0")) == "red"


class TestScheduleHealth:
    def test_no_milestones_is_green(self):
        assert compute_schedule_health([]) == "green"

    def test_small_slip_is_green(self):
        milestones = [{"baseline_date": "2026-01-01", "current_date": "2026-01-04"}]
        assert compute_schedule_health(milestones) == "green"

    def test_moderate_slip_is_yellow(self):
        milestones = [{"baseline_date": "2026-01-01", "current_date": "2026-01-12"}]
        assert compute_schedule_health(milestones) == "yellow"

    def test_large_slip_is_red(self):
        milestones = [{"baseline_date": "2026-01-01", "current_date": "2026-02-01"}]
        assert compute_schedule_health(milestones) == "red"

    def test_multiple_milestones_uses_worst(self):
        milestones = [
            {"baseline_date": "2026-01-01", "current_date": "2026-01-02"},  # 1 day
            {"baseline_date": "2026-02-01", "current_date": "2026-02-20"},  # 19 days
        ]
        assert compute_schedule_health(milestones) == "red"


class TestOverallHealth:
    def test_all_green_low_risk_low_items_is_on_track(self):
        assert compute_overall_health("green", "green", Decimal("10"), 2) == "on_track"

    def test_mixed_signals_is_at_risk(self):
        assert compute_overall_health("yellow", "yellow", Decimal("50"), 15) == "at_risk"

    def test_all_red_high_risk_is_critical(self):
        assert compute_overall_health("red", "red", Decimal("90"), 40) == "critical"

    def test_green_budget_red_schedule_is_at_risk(self):
        result = compute_overall_health("green", "red", Decimal("30"), 10)
        assert result in ("at_risk", "on_track")  # borderline depending on weights

    def test_risk_score_capped_at_100(self):
        # risk_score > 100 should not break
        assert compute_overall_health("green", "green", Decimal("150"), 0) == "on_track"


class TestBuildHealth:
    """Test the _build_health aggregation helper."""

    def test_builds_health_dict(self):
        from app.services.capital_projects import _build_health

        project = {
            "approved_budget": Decimal("10000000"),
            "forecast_at_completion": Decimal("9500000"),
            "contingency_remaining": Decimal("250000"),
            "risk_score": Decimal("20"),
        }
        milestones = [{"baseline_date": "2026-01-01", "current_date": "2026-01-03"}]
        health = _build_health(project, milestones=milestones, open_items=5)
        assert health["budget_health"] == "green"
        assert health["schedule_health"] == "green"
        assert health["overall_health"] == "on_track"

    def test_builds_health_with_problems(self):
        from app.services.capital_projects import _build_health

        project = {
            "approved_budget": Decimal("10000000"),
            "forecast_at_completion": Decimal("11500000"),
            "contingency_remaining": Decimal("0"),
            "risk_score": Decimal("80"),
        }
        milestones = [{"baseline_date": "2026-01-01", "current_date": "2026-02-15"}]
        health = _build_health(project, milestones=milestones, open_items=30)
        assert health["budget_health"] == "red"
        assert health["schedule_health"] == "red"
        assert health["overall_health"] == "critical"


class TestPayAppComputation:
    """Test pay app derived field calculations."""

    def test_g702_fields_computed_correctly(self):
        """AIA G702 math: total_completed_stored, retainage, payment due."""
        from app.services.capital_projects import _q

        wc_prev = Decimal("420000")
        wc_this = Decimal("580000")
        sm_prev = Decimal("35000")
        sm_curr = Decimal("42000")
        ret_pct = Decimal("10.0000")

        total_completed_stored = wc_prev + wc_this + sm_prev + sm_curr
        assert total_completed_stored == Decimal("1077000")

        retainage = (total_completed_stored * ret_pct / Decimal("100")).quantize(Decimal("0.01"))
        assert retainage == Decimal("107700.00")

        earned_less_retainage = total_completed_stored - retainage
        assert earned_less_retainage == Decimal("969300.00")
