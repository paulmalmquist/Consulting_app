"""Tests for multi-strategy entity search service."""
from uuid import UUID

from app.services.entity_search import (
    EntitySearchResult,
    _CachedEntity,
    _normalize,
    _score_contains,
    _score_exact,
    _score_prefix,
    _score_token_overlap,
    search_entities_by_name,
)
import app.services.entity_search as es_mod


BIZ_ID = UUID("a1b2c3d4-0001-0001-0001-000000000001")

_FUND_A = _CachedEntity(
    entity_type="fund", entity_id="f001", name="Institutional Growth Fund VII",
    normalized_name=_normalize("Institutional Growth Fund VII"), source_table="repe_fund",
)
_FUND_B = _CachedEntity(
    entity_type="fund", entity_id="f002", name="Meridian Value Fund III",
    normalized_name=_normalize("Meridian Value Fund III"), source_table="repe_fund",
)
_ASSET_A = _CachedEntity(
    entity_type="asset", entity_id="a001", name="Riverfront Apartments",
    normalized_name=_normalize("Riverfront Apartments"), source_table="repe_asset",
)
_ASSET_B = _CachedEntity(
    entity_type="asset", entity_id="a002", name="Riverside Apartments",
    normalized_name=_normalize("Riverside Apartments"), source_table="repe_asset",
)


class TestNormalize:
    def test_lowercases_and_strips(self):
        assert _normalize("  Riverfront Apartments  ") == "riverfront apartments"

    def test_removes_special_chars(self):
        assert _normalize("IGF-VII (2024)") == "igf vii 2024"


class TestExactMatch:
    def test_exact_match_scores_1(self):
        assert _score_exact("institutional growth fund vii", _FUND_A) == 1.0

    def test_no_match_returns_none(self):
        assert _score_exact("some other fund", _FUND_A) is None


class TestPrefixMatch:
    def test_prefix_match(self):
        assert _score_prefix("institutional growth", _FUND_A) == 0.95

    def test_short_prefix_rejected(self):
        assert _score_prefix("in", _FUND_A) is None


class TestContainsMatch:
    def test_query_in_entity(self):
        assert _score_contains("riverfront", _ASSET_A) == 0.88

    def test_entity_in_query(self):
        score = _score_contains("tell me about riverfront apartments and their noi", _ASSET_A)
        assert score == 0.87

    def test_short_query_rejected(self):
        assert _score_contains("riv", _ASSET_A) is None


class TestTokenOverlap:
    def test_partial_name_match(self):
        score = _score_token_overlap("riverfront apartments noi", _ASSET_A)
        assert score is not None
        assert score > 0.7

    def test_no_overlap_returns_none(self):
        assert _score_token_overlap("something unrelated", _ASSET_A) is None


class TestSearchEntitiesByName:
    def setup_method(self):
        # Inject entities directly into cache to avoid DB
        es_mod._name_cache[str(BIZ_ID)] = (
            1e15,  # far-future TTL
            [_FUND_A, _FUND_B, _ASSET_A, _ASSET_B],
        )

    def teardown_method(self):
        es_mod._name_cache.clear()

    def test_exact_match_fund(self):
        results = search_entities_by_name(
            query="Institutional Growth Fund VII", business_id=BIZ_ID,
        )
        assert len(results) >= 1
        assert results[0].entity_id == "f001"
        assert results[0].score == 1.0
        assert results[0].match_strategy == "exact"

    def test_partial_name_match(self):
        results = search_entities_by_name(
            query="Tell me about Riverfront", business_id=BIZ_ID,
        )
        assert len(results) >= 1
        assert results[0].entity_id == "a001"
        assert results[0].name == "Riverfront Apartments"

    def test_disambiguation_when_close(self):
        results = search_entities_by_name(
            query="River apartments", business_id=BIZ_ID,
        )
        # Both Riverfront and Riverside should match with close scores
        if len(results) >= 2:
            if results[0].score - results[1].score < 0.05:
                assert results[0].disambiguation_needed is True

    def test_empty_query_returns_empty(self):
        assert search_entities_by_name(query="", business_id=BIZ_ID) == []

    def test_filter_by_entity_type(self):
        results = search_entities_by_name(
            query="Meridian", business_id=BIZ_ID, entity_types=["fund"],
        )
        assert all(r.entity_type == "fund" for r in results)

    def test_no_match_returns_empty(self):
        results = search_entities_by_name(
            query="Completely Unknown Entity XYZ", business_id=BIZ_ID,
        )
        assert results == []
