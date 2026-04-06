"""Tests for SemanticMetricRegistry — DB-aware runtime metric extraction.

Covers:
  - Key normalization (uppercase DB key → lowercase canonical)
  - Display name synonym generation
  - Extract: longest-match-first priority
  - Graceful degradation when DB is unavailable
  - metric_normalizer.extract_metric() DB-first / static-fallback
"""
from __future__ import annotations

import pytest


# ── SemanticMetricRegistry unit tests ────────────────────────────────

class TestSemanticMetricRegistry:
    """Tests using a manually-constructed registry (no DB needed)."""

    def _make_registry(self, metrics: list[dict]) -> object:
        """Build a registry with synthetic metrics injected directly."""
        from app.services.semantic_runtime import SemanticMetricRegistry
        reg = SemanticMetricRegistry.__new__(SemanticMetricRegistry)
        # Bypass _load() and inject synonyms manually
        reg._synonyms = {}
        reg._domain_keywords = frozenset()
        for m in metrics:
            key = m["metric_key"].lower()
            reg._domain_keywords = reg._domain_keywords | {key}
            reg._synonyms[key] = key
            display = m["display_name"].lower()
            reg._synonyms[display] = key
            for word in display.split():
                if len(word) >= 4:
                    reg._synonyms.setdefault(word, key)
        return reg

    def test_key_lowercased(self):
        reg = self._make_registry([{"metric_key": "GROSS_IRR", "display_name": "Gross IRR"}])
        assert "gross_irr" in reg.domain_keywords

    def test_extract_by_canonical_key(self):
        reg = self._make_registry([{"metric_key": "GROSS_IRR", "display_name": "Gross IRR"}])
        result = reg.extract("show me gross_irr by fund")
        assert result is not None
        assert result["normalized"] == "gross_irr"
        assert result["source"] == "db_registry"

    def test_extract_by_display_name(self):
        reg = self._make_registry([{"metric_key": "NOI", "display_name": "Net Operating Income"}])
        result = reg.extract("what is the net operating income for this asset")
        assert result is not None
        assert result["normalized"] == "noi"

    def test_extract_longest_match_wins(self):
        reg = self._make_registry([
            {"metric_key": "IRR", "display_name": "Internal Rate of Return"},
            {"metric_key": "GROSS_IRR", "display_name": "Gross IRR"},
        ])
        result = reg.extract("show gross irr by fund")
        # "gross irr" is longer than "irr" → should win
        assert result is not None
        assert result["normalized"] == "gross_irr"

    def test_extract_returns_none_for_no_match(self):
        reg = self._make_registry([{"metric_key": "NOI", "display_name": "Net Operating Income"}])
        result = reg.extract("show me the occupancy rate")
        assert result is None

    def test_empty_registry_returns_none(self):
        reg = self._make_registry([])
        assert reg.extract("gross irr") is None
        assert not reg.has_data

    def test_has_data_true_when_loaded(self):
        reg = self._make_registry([{"metric_key": "NOI", "display_name": "Net Operating Income"}])
        assert reg.has_data is True

    def test_domain_keywords_populated(self):
        reg = self._make_registry([
            {"metric_key": "NOI", "display_name": "Net Operating Income"},
            {"metric_key": "TVPI", "display_name": "TVPI"},
        ])
        assert "noi" in reg.domain_keywords
        assert "tvpi" in reg.domain_keywords

    def test_load_silently_fails_on_bad_business_id(self):
        """Registry should not raise when DB is unavailable."""
        from app.services.semantic_runtime import SemanticMetricRegistry
        # Using a clearly invalid ID — DB not available in unit tests
        # Should silently create an empty registry
        try:
            SemanticMetricRegistry("nonexistent-business-id")
        except Exception as e:
            pytest.fail(f"SemanticMetricRegistry raised on bad business_id: {e}")


# ── metric_normalizer.extract_metric() DB-first path ─────────────────

class TestExtractMetricWithBusinessId:
    """Tests the optional business_id path in extract_metric().

    These tests verify static fallback still works even when business_id
    is provided but the DB is unavailable (unit test environment).
    """

    def test_static_fallback_when_no_business_id(self):
        from app.assistant_runtime.metric_normalizer import extract_metric
        result = extract_metric("show me gross IRR by fund")
        assert result is not None
        assert result["normalized"] == "gross_irr"

    def test_static_fallback_with_unknown_business_id(self):
        """When DB unavailable, static synonyms must still work."""
        from app.assistant_runtime.metric_normalizer import extract_metric
        result = extract_metric("show me gross IRR by fund", business_id="unknown-id")
        assert result is not None
        assert result["normalized"] == "gross_irr"

    def test_net_irr_static_fallback(self):
        from app.assistant_runtime.metric_normalizer import extract_metric
        result = extract_metric("what is the net IRR across funds")
        assert result is not None
        assert result["normalized"] == "net_irr"

    def test_tvpi_static_fallback(self):
        from app.assistant_runtime.metric_normalizer import extract_metric
        result = extract_metric("rank by TVPI")
        assert result is not None
        assert result["normalized"] == "tvpi"

    def test_debt_yield_static_fallback(self):
        from app.assistant_runtime.metric_normalizer import extract_metric
        result = extract_metric("show debt yield by asset")
        assert result is not None
        assert result["normalized"] == "debt_yield"

    def test_rvpi_static_fallback(self):
        from app.assistant_runtime.metric_normalizer import extract_metric
        result = extract_metric("what is the RVPI for these funds")
        assert result is not None
        assert result["normalized"] == "rvpi"

    def test_ttm_noi_static_fallback(self):
        from app.assistant_runtime.metric_normalizer import extract_metric
        result = extract_metric("what is trailing NOI for this asset")
        assert result is not None
        assert result["normalized"] == "ttm_noi"

    def test_returns_none_for_no_metric(self):
        from app.assistant_runtime.metric_normalizer import extract_metric
        result = extract_metric("show me the portfolio overview")
        assert result is None
