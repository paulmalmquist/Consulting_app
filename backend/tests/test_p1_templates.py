"""Tests for P1 Meridian foundation — 6 new SQL templates + classifier routing.

Covers:
  - Template existence and structural correctness
  - Classifier routing for all 6 new templates
  - gross_irr vs net_irr disambiguation (both route to irr_ranked)
  - Metric normalizer entries for new metrics
"""
from __future__ import annotations


# ── Template existence and structure ──────────────────────────────────────────

def test_irr_ranked_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.irr_ranked")
    assert t is not None, "repe.irr_ranked must be registered"


def test_irr_ranked_uses_authoritative_snapshot():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.irr_ranked")
    assert "re_authoritative_fund_state_qtr" in t.sql
    assert "repe_fund" in t.sql
    assert "promotion_state = 'released'" in t.sql
    assert "canonical_metrics->>'gross_irr'" in t.sql
    assert "canonical_metrics->>'net_irr'" in t.sql
    assert "ORDER BY NULLIF(afs.canonical_metrics->>'gross_irr', '')::numeric DESC" in t.sql


def test_irr_ranked_has_latest_quarter_coalesce():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.irr_ranked")
    assert "COALESCE" in t.sql
    assert "MAX(afs2.quarter)" in t.sql


def test_tvpi_ranked_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.tvpi_ranked")
    assert t is not None
    assert "re_authoritative_fund_state_qtr" in t.sql
    assert "canonical_metrics->>'tvpi'" in t.sql
    assert "ORDER BY NULLIF(afs.canonical_metrics->>'tvpi', '')::numeric DESC" in t.sql


def test_nav_ranked_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.nav_ranked")
    assert t is not None
    assert "re_authoritative_fund_state_qtr" in t.sql
    assert "canonical_metrics->>'portfolio_nav'" in t.sql
    # NAV ranking falls back to ending_nav before portfolio_nav
    assert "canonical_metrics->>'ending_nav'" in t.sql
    assert "ORDER BY COALESCE(NULLIF(afs.canonical_metrics->>'ending_nav', '')::numeric, NULLIF(afs.canonical_metrics->>'portfolio_nav', '')::numeric) DESC" in t.sql


def test_dscr_ranked_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.dscr_ranked")
    assert t is not None
    assert "re_loan_detail" in t.sql
    assert "dscr" in t.sql
    assert "ORDER BY ld.dscr DESC" in t.sql
    # re_loan_detail has no quarter column; no COALESCE needed
    assert "re_asset_quarter_state" not in t.sql


def test_ltv_ranked_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.ltv_ranked")
    assert t is not None
    assert "re_loan_detail" in t.sql
    assert "ltv" in t.sql
    assert "ORDER BY ld.ltv ASC" in t.sql


def test_debt_maturity_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.debt_maturity")
    assert t is not None
    assert "re_loan" in t.sql
    # Canonical column names (not maturity_date/loan_amount/interest_rate)
    assert "l.maturity" in t.sql
    assert "l.upb" in t.sql
    assert "l.rate" in t.sql
    assert "ORDER BY l.maturity ASC" in t.sql


def test_all_new_templates_have_business_id_param():
    from app.sql_agent.query_templates import get_template
    for key in ("repe.irr_ranked", "repe.tvpi_ranked", "repe.nav_ranked",
                "repe.dscr_ranked", "repe.ltv_ranked", "repe.debt_maturity"):
        t = get_template(key)
        assert "business_id" in t.required_params, (
            f"{key} must have business_id as required param"
        )


def test_meridian_fund_list_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.fund_list")
    assert t is not None
    assert "FROM repe_fund" in t.sql


def test_meridian_fund_performance_summary_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.fund_performance_summary")
    assert t is not None
    assert "re_authoritative_fund_state_qtr" in t.sql
    assert "promotion_state = 'released'" in t.sql
    assert "canonical_metrics->>'gross_irr'" in t.sql
    assert "canonical_metrics->>'portfolio_nav'" in t.sql


def test_meridian_commitments_breakout_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.commitments_by_fund")
    assert t is not None
    assert "re_partner_commitment" in t.sql
    assert "GROUP BY f.fund_id, f.name" in t.sql


def test_meridian_noi_variance_ranked_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.noi_variance_ranked")
    assert t is not None
    assert "re_asset_variance_qtr" in t.sql
    assert "variance_pct" in t.sql


def test_meridian_occupancy_filtered_template_exists():
    from app.sql_agent.query_templates import get_template
    t = get_template("repe.occupancy_filtered")
    assert t is not None
    assert "repe_property_asset" in t.sql
    assert "occupancy" in t.sql


# ── Classifier routing ────────────────────────────────────────────────────────

def test_classifier_routes_best_irr_fund_to_irr_ranked():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("which fund has the best IRR")
    assert result.suggested_template_key == "repe.irr_ranked", (
        f"Expected repe.irr_ranked, got {result.suggested_template_key!r}"
    )


def test_classifier_routes_gross_irr_to_irr_ranked():
    """'best funds by gross irr' must route to irr_ranked (not fund_returns)."""
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("best funds by gross irr")
    assert result.suggested_template_key == "repe.irr_ranked", (
        f"Expected repe.irr_ranked, got {result.suggested_template_key!r}"
    )


def test_classifier_routes_net_irr_to_irr_ranked():
    """'best funds by net irr' must also route to irr_ranked (contains net_irr column)."""
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("best funds by net irr")
    assert result.suggested_template_key == "repe.irr_ranked", (
        f"Expected repe.irr_ranked, got {result.suggested_template_key!r}"
    )


def test_classifier_routes_rank_funds_tvpi_to_tvpi_ranked():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("rank funds by TVPI")
    assert result.suggested_template_key == "repe.tvpi_ranked"


def test_classifier_routes_fund_nav_to_nav_ranked():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("which fund has the highest NAV")
    assert result.suggested_template_key == "repe.nav_ranked"


def test_classifier_routes_highest_dscr_to_dscr_ranked():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("which assets have the highest DSCR")
    assert result.suggested_template_key == "repe.dscr_ranked"


def test_classifier_routes_lowest_ltv_to_ltv_ranked():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("show me the lowest LTV assets")
    assert result.suggested_template_key == "repe.ltv_ranked"


def test_classifier_routes_loans_maturing_to_debt_maturity():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("show loans maturing in the next 12 months")
    assert result.suggested_template_key == "repe.debt_maturity"


def test_classifier_routes_debt_maturity_schedule():
    from app.sql_agent.query_classifier import classify_query
    result = classify_query("what is the debt maturity schedule")
    assert result.suggested_template_key == "repe.debt_maturity"


# ── Metric normalizer ─────────────────────────────────────────────────────────

def test_normalizer_recognizes_gross_irr():
    from app.assistant_runtime.metric_normalizer import extract_metric
    result = extract_metric("show me gross IRR by fund")
    assert result is not None
    assert result["normalized"] == "gross_irr"


def test_normalizer_recognizes_net_irr():
    from app.assistant_runtime.metric_normalizer import extract_metric
    result = extract_metric("what is the net IRR across funds")
    assert result is not None
    assert result["normalized"] == "net_irr"


def test_normalizer_recognizes_debt_yield():
    from app.assistant_runtime.metric_normalizer import extract_metric
    result = extract_metric("show debt yield by asset")
    assert result is not None
    assert result["normalized"] == "debt_yield"


def test_normalizer_recognizes_rvpi():
    from app.assistant_runtime.metric_normalizer import extract_metric
    result = extract_metric("what is the RVPI for these funds")
    assert result is not None
    assert result["normalized"] == "rvpi"


def test_normalizer_recognizes_ttm_noi():
    from app.assistant_runtime.metric_normalizer import extract_metric
    result = extract_metric("what is trailing NOI for this asset")
    assert result is not None
    assert result["normalized"] == "ttm_noi"


# ── Registry ──────────────────────────────────────────────────────────────────

def test_new_templates_registered_in_registry():
    """Spot-check that template registry has all 6 new keys."""
    from app.sql_agent.query_templates import get_template
    for key in ("repe.irr_ranked", "repe.tvpi_ranked", "repe.nav_ranked",
                "repe.dscr_ranked", "repe.ltv_ranked", "repe.debt_maturity"):
        assert get_template(key) is not None, f"{key} not found in registry"
