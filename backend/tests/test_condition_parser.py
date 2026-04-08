"""Tests for condition parser, asset count routing, grain awareness, and template integrity."""
from __future__ import annotations

import pytest

from app.sql_agent.query_classifier import (
    QueryType,
    classify_query,
    extract_conditions,
)
from app.sql_agent.query_templates import get_template, list_templates
from app.sql_agent.catalog import ALLOWED_TABLES


# ── Condition parser unit tests ─────────────────────────────────────


class TestExtractConditions:
    def test_noi_variance_worse_than(self):
        conds = extract_conditions("which assets have noi variance of -5% or worse")
        assert len(conds) == 1
        assert conds[0].field == "variance_pct"
        assert conds[0].operator == "<="
        assert conds[0].value == pytest.approx(-0.05)

    def test_occupancy_above(self):
        conds = extract_conditions("assets with occupancy above 90%")
        assert len(conds) == 1
        assert conds[0].field == "occupancy"
        assert conds[0].operator == ">"
        assert conds[0].value == pytest.approx(0.90)

    def test_ltv_below(self):
        conds = extract_conditions("loans with ltv below 75%")
        assert len(conds) == 1
        assert conds[0].field == "ltv"
        assert conds[0].operator == "<"
        assert conds[0].value == pytest.approx(0.75)

    def test_dscr_at_least(self):
        conds = extract_conditions("assets with dscr at least 120%")
        assert len(conds) == 1
        assert conds[0].field == "dscr"
        assert conds[0].operator == ">="
        assert conds[0].value == pytest.approx(1.20)

    def test_no_condition(self):
        conds = extract_conditions("show me all funds")
        assert len(conds) == 0

    def test_no_condition_plain_variance(self):
        """A question about variance without a threshold should not parse a condition."""
        conds = extract_conditions("what is the noi variance for Meridian")
        assert len(conds) == 0


# ── Routing regression tests ────────────────────────────────────────


class TestRoutingRules:
    def test_asset_count_routing(self):
        r = classify_query("how many total assets are there in the portfolio")
        assert r.suggested_template_key == "repe.asset_count"

    def test_asset_count_how_many(self):
        r = classify_query("how many assets do we have")
        assert r.suggested_template_key == "repe.asset_count"

    def test_noi_variance_filter_routing(self):
        r = classify_query("which have an noi variance of -5% or worse")
        assert r.query_type == QueryType.FILTERED_LIST
        assert r.suggested_template_key == "repe.noi_variance_filtered"
        assert len(r.conditions) >= 1

    def test_irr_ranked_still_works(self):
        r = classify_query("which fund has the best IRR")
        assert r.suggested_template_key == "repe.irr_ranked"

    def test_noi_movers_still_works(self):
        r = classify_query("biggest NOI movers this quarter")
        assert r.suggested_template_key == "repe.noi_movers"

    def test_noi_ranked_still_works(self):
        r = classify_query("top 5 assets by NOI")
        assert r.suggested_template_key == "repe.noi_ranked"

    def test_noi_trend_still_works(self):
        r = classify_query("show NOI trend for Meridian Park")
        assert r.suggested_template_key == "repe.noi_trend"

    def test_debt_maturity_still_works(self):
        r = classify_query("show loans maturing in the next 12 months")
        assert r.suggested_template_key == "repe.debt_maturity"

    def test_occupancy_ranked_still_works(self):
        r = classify_query("which assets have the highest occupancy")
        assert r.suggested_template_key == "repe.occupancy_ranked"


# ── Grain awareness tests ──────────────────────────────────────────


class TestGrainAwareness:
    def test_investment_irr_still_routes_to_fund_template(self):
        """IRR at investment level should still route to irr_ranked (fund level)."""
        r = classify_query("list investments by gross IRR descending")
        assert r.suggested_template_key == "repe.irr_ranked"


# ── Template integrity tests ───────────────────────────────────────


# CRM tables are not yet in the catalog — known gap, not a regression.
_CRM_SKIP = {"crm.stale_opportunities", "crm.pipeline_summary", "crm.win_rate"}


class TestTemplateIntegrity:
    """Verify every template references only tables in the catalog allowlist."""

    @pytest.mark.parametrize(
        "template",
        [t for t in list_templates() if t.key not in _CRM_SKIP],
        ids=lambda t: t.key,
    )
    def test_template_tables_in_allowlist(self, template):
        """All FROM/JOIN tables in template SQL must exist in ALLOWED_TABLES."""
        import re as regex
        # Extract CTE names so we don't flag them as missing tables
        cte_names: set[str] = set()
        cte_matches = regex.findall(r"(\w+)\s+AS\s*\(", template.sql, regex.IGNORECASE)
        cte_names.update(cte_matches)

        table_refs = regex.findall(
            r"(?:FROM|JOIN)\s+(\w+)", template.sql, regex.IGNORECASE
        )
        for table_name in table_refs:
            if table_name in cte_names:
                continue
            assert table_name in ALLOWED_TABLES, (
                f"Template {template.key} references table '{table_name}' "
                f"which is not in ALLOWED_TABLES"
            )

    def test_all_classifier_template_keys_exist(self):
        """Every template key returned by the classifier must resolve to a real template."""
        test_queries = [
            "how many total assets",
            "biggest NOI movers this quarter",
            "top 5 assets by NOI",
            "show NOI trend for Meridian Park",
            "which fund has the best IRR",
            "rank funds by TVPI",
            "which fund has the highest NAV",
            "which assets have the highest DSCR",
            "show me the lowest LTV assets",
            "show loans maturing in the next 12 months",
            "occupancy trend for Oakbrook",
            "which assets have the highest occupancy",
            "which have an noi variance of -5% or worse",
            "show stale opportunities",
            "pipeline summary",
            "utilization by service line",
            "revenue vs budget this quarter",
        ]
        for query_text in test_queries:
            result = classify_query(query_text)
            if result.suggested_template_key:
                template = get_template(result.suggested_template_key)
                assert template is not None, (
                    f"Classifier returned '{result.suggested_template_key}' "
                    f"for '{query_text}' but no such template exists"
                )
