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
