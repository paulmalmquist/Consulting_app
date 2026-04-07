"""Tests for the unified metrics API endpoints (v2)."""

import pytest

from app.schemas.unified_metrics import (
    MetricCatalogEntry,
    MetricResultItem,
    UnifiedMetricQueryRequest,
    UnifiedMetricQueryResponse,
)


class TestSchemaValidation:
    """Test Pydantic schema validation without hitting the DB."""

    def test_query_request_valid(self):
        req = UnifiedMetricQueryRequest(
            business_id="a1b2c3d4-0001-0001-0001-000000000001",
            metric_keys=["gross_irr", "noi"],
            quarter="2026Q1",
        )
        assert len(req.metric_keys) == 2
        assert req.limit == 500

    def test_query_request_empty_keys_rejected(self):
        with pytest.raises(Exception):
            UnifiedMetricQueryRequest(
                business_id="a1b2c3d4-0001-0001-0001-000000000001",
                metric_keys=[],
            )

    def test_query_request_limit_bounds(self):
        req = UnifiedMetricQueryRequest(
            business_id="a1b2c3d4-0001-0001-0001-000000000001",
            metric_keys=["noi"],
            limit=5000,
        )
        assert req.limit == 5000

        with pytest.raises(Exception):
            UnifiedMetricQueryRequest(
                business_id="a1b2c3d4-0001-0001-0001-000000000001",
                metric_keys=["noi"],
                limit=10000,
            )

    def test_response_model(self):
        resp = UnifiedMetricQueryResponse(
            results=[
                MetricResultItem(
                    metric_key="noi",
                    display_name="Net Operating Income",
                    metric_family="income",
                    value="1250000",
                    unit="dollar",
                    format_hint="dollar",
                    polarity="up_good",
                    source="semantic",
                    query_hash="abc123",
                ),
            ],
            query_hash="abc123def456",
            total_latency_ms=45.2,
            strategy_latencies={"semantic": 45.2},
            resolved_count=1,
            unresolved_keys=[],
        )
        assert resp.resolved_count == 1
        assert resp.results[0].metric_key == "noi"

    def test_catalog_entry(self):
        entry = MetricCatalogEntry(
            metric_key="gross_irr",
            display_name="Gross IRR",
            description="Fund gross internal rate of return",
            aliases=["gross irr", "pre-fee irr"],
            metric_family="returns",
            query_strategy="template",
            template_key="repe.fund_returns",
            unit="percent",
            aggregation="latest",
            format_hint_fe="percent",
            polarity="up_good",
            entity_key="fund",
            allowed_breakouts=["quarter", "vintage_year"],
            time_behavior="latest_snapshot",
        )
        assert entry.query_strategy == "template"
        assert len(entry.aliases) == 2


class TestMcpSchema:
    """Test the MCP tool input schema."""

    def test_unified_query_input(self):
        from app.mcp.schemas.metrics_tools import UnifiedMetricsQueryInput
        inp = UnifiedMetricsQueryInput(
            business_id="a1b2c3d4-0001-0001-0001-000000000001",
            metric_keys=["gross_irr", "tvpi"],
            quarter="2026Q1",
        )
        assert len(inp.metric_keys) == 2
        assert inp.entity_type is None
