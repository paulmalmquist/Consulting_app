"""Tests for deterministic asset ranking path.

Verifies that:
1. The repe.noi_ranked SQL template exists and is well-formed.
2. The query classifier routes "best performing assets" to the new template.
3. The template renders correctly with and without an explicit quarter.
4. The noi_movers template is still correctly selected for period-change queries.
"""
from __future__ import annotations


# ── Template existence and structure ────────────────────────────────────

def test_noi_ranked_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.noi_ranked")
    assert t is not None, "repe.noi_ranked template must be registered"


def test_noi_ranked_template_uses_quarter_state():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.noi_ranked")
    assert "re_asset_quarter_state" in t.sql
    assert "repe_asset" in t.sql
    assert "repe_deal" in t.sql
    assert "repe_fund" in t.sql


def test_noi_ranked_template_sorts_descending():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.noi_ranked")
    assert "ORDER BY qs.noi DESC" in t.sql


def test_noi_ranked_template_defaults_to_latest_quarter():
    """Template must use COALESCE so it falls back to MAX(quarter) when none supplied."""
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.noi_ranked")
    assert "COALESCE" in t.sql
    assert "MAX(qs2.quarter)" in t.sql


def test_noi_ranked_template_required_params():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.noi_ranked")
    assert "business_id" in t.required_params


def test_noi_ranked_template_optional_params():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.noi_ranked")
    assert "quarter" in t.optional_params
    assert "limit" in t.optional_params


def test_noi_ranked_template_renders_with_quarter():
    from app.sql_agent.query_templates import render_template
    sql, params = render_template("repe.noi_ranked", {
        "business_id": "00000000-0000-0000-0000-000000000001",
        "quarter": "2025Q4",
        "limit": 5,
    })
    assert "ORDER BY qs.noi DESC" in sql
    assert params["quarter"] == "2025Q4"
    assert params["limit"] == 5


def test_noi_ranked_template_renders_without_quarter():
    """Quarter=None must be accepted (template handles the COALESCE internally)."""
    from app.sql_agent.query_templates import render_template
    sql, params = render_template("repe.noi_ranked", {
        "business_id": "00000000-0000-0000-0000-000000000001",
        "limit": 10,
    })
    assert "ORDER BY qs.noi DESC" in sql
    # quarter not in params means None will be passed → COALESCE picks latest
    assert "quarter" not in params or params.get("quarter") is None


# ── Query classifier routing ──────────────────────────────────────────

def test_classifier_routes_best_performing_to_noi_ranked():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("which are the best performing assets")
    assert result.suggested_template_key == "repe.noi_ranked", (
        f"Expected repe.noi_ranked, got {result.suggested_template_key!r}"
    )


def test_classifier_routes_top_assets_by_noi_to_noi_ranked():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("show me the top 10 assets by NOI")
    assert result.suggested_template_key == "repe.noi_ranked"


def test_classifier_routes_worst_performing_to_noi_ranked():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("worst performing assets in the portfolio")
    assert result.suggested_template_key == "repe.noi_ranked"


def test_classifier_routes_asset_ranking_to_noi_ranked():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("rank assets by performance")
    assert result.suggested_template_key == "repe.noi_ranked"


def test_classifier_still_routes_noi_movers_for_change_query():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("biggest NOI change quarter over quarter")
    assert result.suggested_template_key == "repe.noi_movers", (
        f"Period-change query should route to noi_movers, got {result.suggested_template_key!r}"
    )


def test_classifier_routes_noi_delta_to_noi_movers():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("NOI movers this quarter vs last quarter")
    assert result.suggested_template_key == "repe.noi_movers"


def test_classifier_fund_query_not_overridden_by_ranking_rule():
    """Fund-level queries must NOT route to asset ranking."""
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("which fund has the best IRR")
    # Should route to repe.fund_returns, not repe.noi_ranked
    assert result.suggested_template_key != "repe.noi_ranked"


# ── RankAssetsInput schema ────────────────────────────────────────────

def test_rank_assets_input_schema_defaults():
    from app.mcp.schemas.repe_tools import RankAssetsInput
    inp = RankAssetsInput()
    assert inp.metric == "noi"
    assert inp.sort_dir == "desc"
    assert inp.limit == 10
    assert inp.quarter is None
    assert inp.fund_id is None


def test_rank_assets_input_schema_accepts_asc():
    from app.mcp.schemas.repe_tools import RankAssetsInput
    inp = RankAssetsInput(metric="occupancy", sort_dir="asc", limit=5)
    assert inp.metric == "occupancy"
    assert inp.sort_dir == "asc"
    assert inp.limit == 5


def test_rank_assets_registered_in_registry():
    """repe.rank_assets must be registered and have correct tags."""
    from app.mcp.registry import registry
    tool = registry.get("repe.rank_assets")
    assert tool is not None, "repe.rank_assets must be registered in the MCP registry"
    assert tool.permission == "read"
    assert "ranking" in tool.tags
    assert "repe" in tool.tags
