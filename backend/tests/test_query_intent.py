"""Tests for analytical query intent extraction."""
from __future__ import annotations


from app.services.query_intent import (
    detect_transform,
    extract_query_intent,
    is_transform_command,
)


# ── Metric extraction ────────────────────────────────────────────────────

class TestMetricExtraction:
    def test_single_metric(self):
        intent = extract_query_intent("Show me NOI over time")
        assert "noi" in intent.metrics

    def test_multiple_metrics(self):
        intent = extract_query_intent("Compare NOI and revenue by investment")
        assert "noi" in intent.metrics
        assert "revenue" in intent.metrics

    def test_irr_tvpi(self):
        intent = extract_query_intent("What are the IRR and TVPI for this fund?")
        assert "irr" in intent.metrics
        assert "tvpi" in intent.metrics

    def test_no_metrics(self):
        intent = extract_query_intent("What funds do we have?")
        assert intent.metrics == []

    def test_compound_metric(self):
        intent = extract_query_intent("Show net operating income by property")
        assert "noi" in intent.metrics

    def test_occupancy(self):
        intent = extract_query_intent("Plot occupancy over time")
        assert "occupancy" in intent.metrics


# ── Group-by extraction ───────────────────────────────────────────────────

class TestGroupByExtraction:
    def test_by_investment(self):
        intent = extract_query_intent("Show NOI by investment")
        assert intent.group_by == "investment"

    def test_by_asset(self):
        intent = extract_query_intent("Revenue by asset")
        assert intent.group_by == "asset"

    def test_by_fund(self):
        intent = extract_query_intent("IRR by fund")
        assert intent.group_by == "fund"

    def test_per_asset(self):
        intent = extract_query_intent("Show NOI per asset")
        assert intent.group_by == "asset"

    def test_across_investments(self):
        intent = extract_query_intent("NOI across investments")
        assert intent.group_by == "investment"

    def test_each_fund(self):
        intent = extract_query_intent("Show metrics for each fund")
        assert intent.group_by == "fund"

    def test_broken_down_by(self):
        intent = extract_query_intent("Show revenue broken down by market")
        assert intent.group_by == "market"

    def test_grouped_by(self):
        intent = extract_query_intent("NOI grouped by region")
        assert intent.group_by == "region"

    def test_by_property_alias(self):
        intent = extract_query_intent("Show occupancy by property")
        assert intent.group_by == "asset"

    def test_no_group_by(self):
        intent = extract_query_intent("What is the total NOI?")
        assert intent.group_by is None

    def test_by_vintage(self):
        intent = extract_query_intent("Show distributions by vintage")
        assert intent.group_by == "vintage"


# ── Time grain extraction ─────────────────────────────────────────────────

class TestTimeGrainExtraction:
    def test_over_time(self):
        intent = extract_query_intent("NOI over time")
        assert intent.time_grain == "quarterly"
        assert intent.is_time_series is True

    def test_trend(self):
        intent = extract_query_intent("Show revenue trend")
        assert intent.is_time_series is True

    def test_monthly(self):
        intent = extract_query_intent("Monthly NOI breakdown")
        assert intent.time_grain == "monthly"

    def test_quarterly(self):
        intent = extract_query_intent("Show quarterly NOI")
        assert intent.time_grain == "quarterly"

    def test_annual(self):
        intent = extract_query_intent("Annual revenue comparison")
        assert intent.time_grain == "annual"

    def test_yoy(self):
        intent = extract_query_intent("YoY NOI comparison")
        assert intent.time_grain == "annual"
        assert intent.comparison == "prior_period"

    def test_no_time_series(self):
        intent = extract_query_intent("Top 5 assets by NOI")
        assert intent.is_time_series is False


# ── Chart preference ──────────────────────────────────────────────────────

class TestChartPreference:
    def test_explicit_line_chart(self):
        intent = extract_query_intent("Show a line chart of NOI")
        assert intent.chart_preference == "line"

    def test_explicit_bar_chart(self):
        intent = extract_query_intent("Bar chart of revenue by fund")
        assert intent.chart_preference == "bar"

    def test_plot(self):
        intent = extract_query_intent("Plot NOI over time")
        assert intent.chart_preference == "line"

    def test_table(self):
        intent = extract_query_intent("Give me a table of assets")
        assert intent.chart_preference == "table"

    def test_ranked(self):
        intent = extract_query_intent("Show assets ranked by NOI")
        assert intent.chart_preference == "table"

    def test_inferred_line_for_time_series(self):
        intent = extract_query_intent("NOI over time by investment")
        assert intent.chart_preference == "line"

    def test_inferred_bar_for_group_by(self):
        intent = extract_query_intent("NOI by investment")
        assert intent.chart_preference == "bar"

    def test_no_preference_no_context(self):
        intent = extract_query_intent("What is NOI?")
        assert intent.chart_preference is None


# ── Comparison extraction ─────────────────────────────────────────────────

class TestComparison:
    def test_vs_budget(self):
        intent = extract_query_intent("NOI vs budget")
        assert intent.comparison == "budget"

    def test_actual_vs_budget(self):
        intent = extract_query_intent("Actual vs budget NOI by investment")
        assert intent.comparison == "budget"

    def test_budget_vs_actual(self):
        intent = extract_query_intent("Budget vs actual revenue")
        assert intent.comparison == "budget"

    def test_prior_period(self):
        intent = extract_query_intent("NOI vs prior quarter")
        assert intent.comparison == "prior_period"

    def test_uw_vs_actual(self):
        intent = extract_query_intent("Underwriting vs actual NOI")
        assert intent.comparison == "underwriting"


# ── Top-N / limit extraction ─────────────────────────────────────────────

class TestTopN:
    def test_top_5(self):
        intent = extract_query_intent("Top 5 assets by NOI")
        assert intent.limit == 5
        assert intent.sort_dir == "desc"

    def test_top_10(self):
        intent = extract_query_intent("Top 10 investments by revenue")
        assert intent.limit == 10

    def test_bottom_3(self):
        intent = extract_query_intent("Bottom 3 funds by IRR")
        assert intent.limit == 3
        assert intent.sort_dir == "asc"

    def test_top_n_infers_table(self):
        intent = extract_query_intent("Top 5 assets by NOI")
        assert intent.chart_preference == "table"

    def test_top_n_sets_sort_by(self):
        intent = extract_query_intent("Top 5 assets by NOI")
        assert intent.sort_by == "noi"


# ── Combined queries ──────────────────────────────────────────────────────

class TestCombinedQueries:
    def test_full_query(self):
        intent = extract_query_intent("Plot NOI over time by investment")
        assert "noi" in intent.metrics
        assert intent.group_by == "investment"
        assert intent.is_time_series is True
        assert intent.chart_preference == "line"

    def test_ranked_table_query(self):
        intent = extract_query_intent("Top 5 assets ranked by NOI")
        assert intent.limit == 5
        assert intent.chart_preference == "table"
        assert "noi" in intent.metrics

    def test_comparison_grouped(self):
        intent = extract_query_intent("Compare actual vs budget NOI by investment")
        assert intent.comparison == "budget"
        assert intent.group_by == "investment"
        assert "noi" in intent.metrics


# ── Transform detection ──────────────────────────────────────────────────

class TestTransformDetection:
    def test_turn_into_bar_chart(self):
        result = detect_transform("Turn that into a bar chart")
        assert result == {"chart_type": "bar"}

    def test_turn_into_line_chart(self):
        result = detect_transform("Turn this into a line chart")
        assert result == {"chart_type": "line"}

    def test_table_instead(self):
        result = detect_transform("Give me a table instead")
        assert result == {"chart_type": "table"}

    def test_show_as_bar(self):
        result = detect_transform("Show that as a bar chart")
        assert result == {"chart_type": "bar"}

    def test_break_out_by_market(self):
        result = detect_transform("Break that out by market")
        assert result == {"group_by": "market"}

    def test_top_5_only(self):
        result = detect_transform("Top 5 only")
        assert result == {"limit": "5"}

    def test_not_a_transform(self):
        result = detect_transform("What funds do we have?")
        assert result is None

    def test_is_transform_command(self):
        assert is_transform_command("Turn that into a bar chart") is True
        assert is_transform_command("What is NOI?") is False

    def test_table_instead_short(self):
        result = detect_transform("table instead")
        assert result == {"chart_type": "table"}
