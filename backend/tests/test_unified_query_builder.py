"""Tests for the UnifiedQueryBuilder."""

import pytest

from app.services.unified_query_builder import (
    JoinDef,
    JoinPathError,
    MetricQuery,
    MetricResult,
    _compute_query_hash,
    _format_value,
    resolve_join_path,
)
from decimal import Decimal


# ── Hash computation ─────────────────────────────────────────────────

class TestQueryHash:
    def test_deterministic(self):
        q = MetricQuery(metric_keys=["noi", "irr"], business_id="abc")
        h1 = _compute_query_hash(q, ["irr", "noi"])
        h2 = _compute_query_hash(q, ["noi", "irr"])
        assert h1 == h2  # sorted, so order doesn't matter

    def test_different_inputs(self):
        q1 = MetricQuery(metric_keys=["noi"], business_id="abc")
        q2 = MetricQuery(metric_keys=["irr"], business_id="abc")
        h1 = _compute_query_hash(q1, ["noi"])
        h2 = _compute_query_hash(q2, ["irr"])
        assert h1 != h2

    def test_hash_is_16_chars(self):
        q = MetricQuery(metric_keys=["noi"], business_id="abc")
        h = _compute_query_hash(q, ["noi"])
        assert len(h) == 16


# ── Join path resolution ─────────────────────────────────────────────

class TestJoinPathResolution:
    @pytest.fixture
    def join_graph(self):
        """Build a simple entity graph: asset → deal → fund"""
        graph = {
            "asset": [
                JoinDef("asset", "deal", "repe_asset.deal_id = repe_deal.deal_id", "many_to_one", True),
            ],
            "deal": [
                JoinDef("deal", "asset", "repe_asset.deal_id = repe_deal.deal_id", "many_to_one", True),
                JoinDef("deal", "fund", "repe_deal.fund_id = repe_fund.fund_id", "many_to_one", True),
            ],
            "fund": [
                JoinDef("fund", "deal", "repe_deal.fund_id = repe_fund.fund_id", "many_to_one", True),
            ],
        }
        return graph

    def test_direct_join(self, join_graph):
        path = resolve_join_path("asset", "deal", join_graph)
        assert len(path) == 1
        assert path[0].to_entity == "deal"

    def test_two_hop_join(self, join_graph):
        path = resolve_join_path("asset", "fund", join_graph)
        assert len(path) == 2
        assert path[0].to_entity == "deal"
        assert path[1].to_entity == "fund"

    def test_same_entity(self, join_graph):
        path = resolve_join_path("asset", "asset", join_graph)
        assert path == []

    def test_no_path_raises(self, join_graph):
        with pytest.raises(JoinPathError):
            resolve_join_path("asset", "nonexistent", join_graph)


# ── Value formatting ─────────────────────────────────────────────────

class TestFormatValue:
    def test_none(self):
        assert _format_value(None) is None

    def test_decimal(self):
        assert _format_value(Decimal("12.345")) == "12.345"

    def test_float(self):
        result = _format_value(12.345)
        assert result == "12.345"

    def test_int(self):
        assert _format_value(42) == "42"

    def test_string(self):
        assert _format_value("hello") == "hello"


# ── MetricResult shape ───────────────────────────────────────────────

class TestMetricResultShape:
    def test_all_fields_present(self):
        r = MetricResult(
            metric_key="noi",
            display_name="Net Operating Income",
            metric_family="income",
            value="1250000.00",
            unit="dollar",
            format_hint="dollar",
            polarity="up_good",
            dimension_value=None,
            entity_id="abc-123",
            entity_name="Main St Tower",
            quarter="2026Q1",
            source="semantic",
            query_hash="abc123def456",
            latency_ms=12.5,
        )
        assert r.metric_key == "noi"
        assert r.source == "semantic"
        assert r.latency_ms == 12.5

    def test_default_source(self):
        r = MetricResult(
            metric_key="noi",
            display_name="NOI",
            metric_family=None,
            value=None,
            unit="dollar",
            format_hint=None,
            polarity="up_good",
        )
        assert r.source == "unknown"
        assert r.sql_used is None
