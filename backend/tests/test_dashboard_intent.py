"""Tests for INTENT_GENERATE_DASHBOARD classifier and dashboard_composer.py."""
from __future__ import annotations

from app.schemas.ai_gateway import AssistantContextEnvelope, AssistantUiContext, ResolvedAssistantScope
from app.services.repe_intent import classify_repe_intent, INTENT_GENERATE_DASHBOARD
from app.services.dashboard_composer import compose_dashboard_spec


# ── Fixtures ────────────────────────────────────────────────────────────────

ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
BUS_ID = "a1b2c3d4-0001-0001-0001-000000000001"


def _scope() -> ResolvedAssistantScope:
    return ResolvedAssistantScope(
        resolved_scope_type="environment",
        environment_id=ENV_ID,
        business_id=BUS_ID,
        schema_name="public",
        industry="real_estate",
        entity_type="fund",
        entity_id="fund-1",
        entity_name="Fund I",
        confidence=1.0,
        source="test",
    )


def _envelope() -> AssistantContextEnvelope:
    return AssistantContextEnvelope(
        ui=AssistantUiContext(page_entity_type="fund", page_entity_id="fund-1", page_entity_name="Fund I"),
    )


def _classify(msg: str):
    return classify_repe_intent(msg, _scope(), _envelope())


# ── Intent classifier collision matrix ──────────────────────────────────────

def test_build_me_a_dashboard():
    result = _classify("build me a dashboard")
    assert result is not None
    assert result.family == INTENT_GENERATE_DASHBOARD
    assert result.confidence >= 0.65


def test_monthly_operating_report():
    result = _classify("show me a monthly operating report for Cascade")
    assert result is not None
    assert result.family == INTENT_GENERATE_DASHBOARD
    assert result.confidence >= 0.65


def test_fund_quarterly_review():
    result = _classify("fund quarterly review for Q1 2026")
    assert result is not None
    assert result.family == INTENT_GENERATE_DASHBOARD
    assert result.confidence >= 0.65


def test_executive_summary():
    result = _classify("create an executive summary dashboard")
    assert result is not None
    assert result.family == INTENT_GENERATE_DASHBOARD
    assert result.confidence >= 0.65


def test_portfolio_overview():
    result = _classify("portfolio overview for the fund")
    assert result is not None
    assert result.family == INTENT_GENERATE_DASHBOARD
    assert result.confidence >= 0.65


def test_watchlist_dashboard():
    result = _classify("show me a watchlist dashboard")
    assert result is not None
    assert result.family == INTENT_GENERATE_DASHBOARD
    assert result.confidence >= 0.65


def test_run_waterfall_not_dashboard():
    """'run the waterfall' should NOT trigger dashboard intent."""
    result = _classify("run the waterfall for Fund I")
    assert result is None or result.family != INTENT_GENERATE_DASHBOARD


def test_stress_test_not_dashboard():
    """Stress test intent should not be confused with dashboard."""
    result = _classify("stress the cap rate by 50 bps")
    assert result is None or result.family != INTENT_GENERATE_DASHBOARD


def test_pipeline_radar_not_dashboard():
    """Pipeline radar should not trigger dashboard."""
    result = _classify("show me pipeline radar")
    assert result is None or result.family != INTENT_GENERATE_DASHBOARD


def test_portfolio_dashboard_wins_over_waterfall():
    """'portfolio dashboard' should trigger dashboard, not waterfall."""
    result = _classify("show me a portfolio dashboard")
    assert result is not None
    assert result.family == INTENT_GENERATE_DASHBOARD


# ── Dashboard composer ──────────────────────────────────────────────────────

def test_monthly_operating_report_spec():
    spec = compose_dashboard_spec(
        "monthly operating report",
        env_id=ENV_ID,
        business_id=BUS_ID,
    )
    assert spec["archetype"] == "monthly_operating_report"
    assert len(spec["widgets"]) >= 6


def test_executive_summary_spec():
    spec = compose_dashboard_spec(
        "executive summary",
        env_id=ENV_ID,
        business_id=BUS_ID,
    )
    assert spec["archetype"] == "executive_summary"
    assert len(spec["widgets"]) >= 4


def test_watchlist_spec():
    spec = compose_dashboard_spec(
        "watchlist dashboard",
        env_id=ENV_ID,
        business_id=BUS_ID,
    )
    assert spec["archetype"] == "watchlist"
    assert any(w["type"] == "comparison_table" for w in spec["widgets"])


def test_spec_always_has_kpi_strip():
    """kpi_summary section (metrics_strip widget) must always be first."""
    spec = compose_dashboard_spec(
        "show me occupancy trend and dscr",
        env_id=ENV_ID,
        business_id=BUS_ID,
    )
    assert spec["widgets"][0]["type"] == "metrics_strip"


def test_spec_widget_layout_no_overflow():
    """No widget should have x + w > 12."""
    spec = compose_dashboard_spec(
        "monthly operating report",
        env_id=ENV_ID,
        business_id=BUS_ID,
    )
    for w in spec["widgets"]:
        assert w["layout"]["x"] + w["layout"]["w"] <= 12, (
            f"Widget {w['id']} overflows 12-col grid: "
            f"x={w['layout']['x']} w={w['layout']['w']}"
        )


def test_spec_entity_scope_populated():
    spec = compose_dashboard_spec(
        "monthly operating report",
        env_id=ENV_ID,
        business_id=BUS_ID,
        fund_id="fund-123",
        quarter="2026Q1",
    )
    assert spec["entity_scope"]["env_id"] == ENV_ID
    assert spec["entity_scope"]["business_id"] == BUS_ID
    assert spec["entity_scope"]["fund_id"] == "fund-123"
    assert spec["quarter"] == "2026Q1"


def test_spec_metrics_present_in_widgets():
    """Chart widgets should have at least one metric."""
    spec = compose_dashboard_spec(
        "executive summary with noi trend",
        env_id=ENV_ID,
        business_id=BUS_ID,
    )
    chart_types = {"trend_line", "bar_chart", "waterfall", "metrics_strip"}
    for w in spec["widgets"]:
        if w["type"] in chart_types:
            assert len(w["config"].get("metrics", [])) >= 1, (
                f"Widget {w['id']} ({w['type']}) has no metrics"
            )


def test_fund_entity_type_detection():
    spec = compose_dashboard_spec(
        "fund quarterly review with nav and tvpi",
        env_id=ENV_ID,
        business_id=BUS_ID,
    )
    assert spec["entity_scope"]["entity_type"] == "fund"


def test_asset_entity_type_default():
    spec = compose_dashboard_spec(
        "monthly operating report for Cascade",
        env_id=ENV_ID,
        business_id=BUS_ID,
    )
    assert spec["entity_scope"]["entity_type"] == "asset"


# ── Free-form prompt test suite (15 prompts) ────────────────────────────


def _spec(msg: str) -> dict:
    return compose_dashboard_spec(msg, env_id=ENV_ID, business_id=BUS_ID)


def _widget_types(spec: dict) -> list[str]:
    return [w["type"] for w in spec["widgets"]]


class TestFreeformPrompts:
    """15 natural-language prompts that should produce specific widget specs."""

    # TEST 1: single trend line, no KPI strip
    def test_01_noi_over_time(self):
        spec = _spec("NOI over time")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "trend_line"
        assert any(m["key"] == "NOI" for m in w["config"]["metrics"])
        assert w["config"].get("group_by") is None

    # TEST 2: trend line with group_by
    def test_02_noi_over_time_by_investment(self):
        spec = _spec("NOI over time by investment")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "trend_line"
        assert any(m["key"] == "NOI" for m in w["config"]["metrics"])
        assert w["config"]["group_by"] == "investment"

    # TEST 3: grouped bar chart comparing two metrics
    def test_03_compare_revenue_expenses_by_asset(self):
        spec = _spec("Compare revenue and expenses by asset")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "bar_chart"
        metric_keys = {m["key"] for m in w["config"]["metrics"]}
        assert len(metric_keys) >= 2
        assert w["config"]["group_by"] == "asset"

    # TEST 4: two side-by-side trend lines
    def test_04_side_by_side_trends(self):
        spec = _spec("Show occupancy trend and NOI trend side by side")
        types = _widget_types(spec)
        assert types.count("trend_line") == 2
        assert "metrics_strip" not in types
        # Side-by-side layout: both should be w=6
        for w in spec["widgets"]:
            assert w["layout"]["w"] == 6

    # TEST 5: table ranked by NOI
    def test_05_table_ranked_by_noi(self):
        spec = _spec("Table of assets ranked by NOI")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "comparison_table"

    # TEST 6: scatter plot fallback
    def test_06_scatter_plot(self):
        spec = _spec("Scatter plot of occupancy vs NOI by asset")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        # scatter falls back to trend_line
        assert w["type"] == "trend_line"
        assert w["config"]["group_by"] == "asset"

    # TEST 7: stacked bar chart
    def test_07_stacked_bar(self):
        spec = _spec("Stacked bar chart of revenue vs expenses by month")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "bar_chart"
        assert w["config"].get("stacked") is True

    # TEST 8: heatmap
    def test_08_heatmap(self):
        spec = _spec("Heatmap of occupancy by asset and month")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        # heatmap → sensitivity_heat or bar_chart fallback
        assert w["type"] in ("sensitivity_heat", "bar_chart")

    # TEST 9: top N bar chart
    def test_09_top_5_investments(self):
        spec = _spec("Show top 5 investments by NOI")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "bar_chart"
        assert any(m["key"] == "NOI" for m in w["config"]["metrics"])
        assert w["config"].get("limit") == 5

    # TEST 10: budget vs actual variance
    def test_10_budget_vs_actual(self):
        spec = _spec("Compare budget vs actual NOI")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "bar_chart"
        assert w["config"].get("comparison") == "budget"

    # TEST 11: distribution / histogram
    def test_11_distribution(self):
        spec = _spec("Show NOI distribution across investments")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "bar_chart"
        assert any(m["key"] == "NOI" for m in w["config"]["metrics"])

    # TEST 12: line chart with explicit type + group_by
    def test_12_line_chart_dscr_by_asset(self):
        spec = _spec("Line chart of DSCR by asset")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "trend_line"
        assert any(m["key"] == "DSCR_KPI" for m in w["config"]["metrics"])
        assert w["config"]["group_by"] == "asset"

    # TEST 13: table of debt maturity
    def test_13_table_debt_maturity(self):
        spec = _spec("Table of debt maturity by asset")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "comparison_table"

    # TEST 14: bar chart comparing across markets
    def test_14_compare_noi_margin_across_markets(self):
        spec = _spec("Compare NOI margin across markets")
        assert len(spec["widgets"]) == 1
        w = spec["widgets"][0]
        assert w["type"] == "bar_chart"
        assert w["config"]["group_by"] == "market"

    # TEST 15: multi-widget dashboard
    def test_15_multi_widget_dashboard(self):
        spec = _spec(
            "Dashboard with NOI trend, occupancy trend, and asset ranking table"
        )
        types = _widget_types(spec)
        assert types.count("trend_line") >= 2
        assert "comparison_table" in types
        assert "metrics_strip" not in types
        assert len(spec["widgets"]) >= 3
        # Grid layout validation: no widget overflows
        for w in spec["widgets"]:
            assert w["layout"]["x"] + w["layout"]["w"] <= 12
