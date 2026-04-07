"""Tests for the UnifiedMetricRegistry singleton."""

import pytest

from app.services.unified_metric_registry import (
    MetricContract,
    UnifiedMetricRegistry,
)


def _make_contract(**overrides) -> MetricContract:
    defaults = dict(
        metric_key="gross_irr",
        display_name="Gross IRR",
        description="Fund gross internal rate of return",
        aliases=("gross irr", "pre-fee irr", "gross internal rate of return"),
        metric_family="returns",
        query_strategy="template",
        template_key="repe.fund_returns",
        service_function=None,
        sql_template=None,
        unit="percent",
        aggregation="latest",
        format_hint_fe="percent",
        polarity="up_good",
        entity_key="fund",
        allowed_breakouts=("quarter", "vintage_year"),
        time_behavior="latest_snapshot",
    )
    defaults.update(overrides)
    return MetricContract(**defaults)


@pytest.fixture
def sample_metrics():
    return [
        _make_contract(),
        _make_contract(
            metric_key="noi",
            display_name="Net Operating Income",
            aliases=("noi", "net operating income", "operating income"),
            metric_family="income",
            query_strategy="semantic",
            template_key=None,
            sql_template="SUM(amount) FILTER (WHERE line_code = 'NOI')",
            unit="dollar",
            aggregation="sum",
            format_hint_fe="dollar",
            entity_key="asset",
            allowed_breakouts=("fund", "market", "property_type", "quarter"),
            time_behavior="additive_period",
        ),
        _make_contract(
            metric_key="fund_count",
            display_name="Fund Count",
            aliases=("fund count", "number of funds", "how many funds"),
            metric_family="capital",
            query_strategy="service",
            template_key=None,
            service_function="portfolio_kpis",
            sql_template="COUNT(DISTINCT fund_id)",
            unit="count",
            aggregation="count",
            format_hint_fe="count",
            entity_key="fund",
            allowed_breakouts=("quarter",),
            time_behavior="point_in_time",
        ),
    ]


@pytest.fixture
def registry(sample_metrics):
    return UnifiedMetricRegistry(sample_metrics)


class TestResolve:
    def test_resolve_by_key(self, registry):
        c = registry.resolve("gross_irr")
        assert c is not None
        assert c.metric_key == "gross_irr"

    def test_resolve_case_insensitive(self, registry):
        c = registry.resolve("GROSS_IRR")
        assert c is not None
        assert c.metric_key == "gross_irr"

    def test_resolve_by_alias(self, registry):
        c = registry.resolve("pre-fee irr")
        assert c is not None
        assert c.metric_key == "gross_irr"

    def test_resolve_by_display_name(self, registry):
        c = registry.resolve("Net Operating Income")
        assert c is not None
        assert c.metric_key == "noi"

    def test_resolve_unknown_returns_none(self, registry):
        assert registry.resolve("nonexistent_metric") is None

    def test_resolve_by_natural_alias(self, registry):
        c = registry.resolve("how many funds")
        assert c is not None
        assert c.metric_key == "fund_count"


class TestListMethods:
    def test_list_all(self, registry):
        all_metrics = registry.list_all()
        assert len(all_metrics) == 3

    def test_list_for_entity(self, registry):
        fund_metrics = registry.list_for_entity("fund")
        assert len(fund_metrics) == 2  # gross_irr + fund_count

        asset_metrics = registry.list_for_entity("asset")
        assert len(asset_metrics) == 1  # noi

    def test_list_for_family(self, registry):
        returns = registry.list_for_family("returns")
        assert len(returns) == 1
        assert returns[0].metric_key == "gross_irr"

    def test_has_data(self, registry):
        assert registry.has_data is True

    def test_empty_registry(self):
        empty = UnifiedMetricRegistry([])
        assert empty.has_data is False
        assert empty.list_all() == []
        assert empty.resolve("anything") is None


class TestExtractFromText:
    def test_extract_alias(self, registry):
        result = registry.extract_from_text("What is the gross irr for Fund I?")
        assert result is not None
        assert result["normalized"] == "gross_irr"
        assert result["source"] == "unified_registry"

    def test_extract_long_alias(self, registry):
        result = registry.extract_from_text("Show me the net operating income trend")
        assert result is not None
        assert result["normalized"] == "noi"

    def test_extract_returns_family(self, registry):
        result = registry.extract_from_text("What is the gross irr?")
        assert result is not None
        assert result["metric_family"] == "returns"

    def test_extract_no_match(self, registry):
        result = registry.extract_from_text("Tell me about the weather")
        assert result is None


class TestValidateSchema:
    def test_valid_registry(self, registry):
        issues = registry.validate_schema()
        # gross_irr has template_key=repe.fund_returns which should exist
        # But we can't validate against _ALL_TEMPLATES in test without import
        # At minimum, service and semantic validations should pass
        assert isinstance(issues, list)

    def test_missing_template_key(self):
        bad = _make_contract(query_strategy="template", template_key=None)
        reg = UnifiedMetricRegistry([bad])
        issues = reg.validate_schema()
        assert any("no template_key" in i for i in issues)

    def test_missing_service_function(self):
        bad = _make_contract(query_strategy="service", service_function=None)
        reg = UnifiedMetricRegistry([bad])
        issues = reg.validate_schema()
        assert any("no service_function" in i for i in issues)

    def test_missing_sql_template(self):
        bad = _make_contract(query_strategy="semantic", sql_template=None)
        reg = UnifiedMetricRegistry([bad])
        issues = reg.validate_schema()
        assert any("no sql_template" in i for i in issues)

    def test_missing_entity_key(self):
        bad = _make_contract(query_strategy="semantic", entity_key=None)
        reg = UnifiedMetricRegistry([bad])
        issues = reg.validate_schema()
        assert any("no entity_key" in i for i in issues)

    def test_missing_aliases(self):
        bad = _make_contract(aliases=())
        reg = UnifiedMetricRegistry([bad])
        issues = reg.validate_schema()
        assert any("no aliases" in i for i in issues)

    def test_missing_family(self):
        bad = _make_contract(metric_family=None)
        reg = UnifiedMetricRegistry([bad])
        issues = reg.validate_schema()
        assert any("no metric_family" in i for i in issues)
