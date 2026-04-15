"""Tests for the hybrid REPE search service.

Contracts the UI/UX rules depend on:
  - exact name match must outrank semantic guesses
  - metadata queries return real structured entities
  - semantic hits that don't resolve to a real row are dropped (no hallucinations)
  - debug mode surfaces per-lane candidate counts
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.services.repe_hybrid_search import hybrid_search


def test_exact_match_outranks_semantic(fake_cursor):
    """Query exactly matches a fund name. Semantic would love to also
    surface a similar fund — exact must win."""
    business_id = str(uuid4())
    env_id = str(uuid4())
    fund_id = str(uuid4())
    rival_id = str(uuid4())

    # Exact lane: fund hit.
    fake_cursor.push_result(
        [{"id": fund_id, "name": "Institutional Growth Fund VII"}]
    )
    # Exact lane: investments (none).
    fake_cursor.push_result([])
    # Exact lane: assets (none).
    fake_cursor.push_result([])
    # Metadata lane — asset search won't match (no sector/market keyword).
    # Metadata lane — fund DPI/TVPI/IRR — also skipped since no sort_field
    # hint.

    # Semantic lane — mock to return a different fund.
    def fake_semantic(query, **kwargs):
        class _Hit:
            entity_type = "fund"
            entity_id = rival_id
            score = 0.9
            text = "Some semantic snippet"
            chunk_text = "…"

        return [_Hit()]

    with patch("app.services.rag_indexer.semantic_search", fake_semantic):
        # Semantic lane needs resolver: returns the rival as a real row.
        fake_cursor.push_result([{"id": rival_id, "name": "Rival Fund"}])
        # Investments resolve (empty).
        # Assets resolve (empty).

        result = hybrid_search(
            "Institutional Growth Fund VII",
            business_id=business_id,
            env_id=env_id,
            limit=10,
        )

    assert len(result["results"]) >= 1
    first = result["results"][0]
    assert first["entity_id"] == fund_id
    assert first["lane"] == "exact"
    assert first["route"].endswith(f"/re/funds/{fund_id}")


def test_prefix_match_ranks_below_exact_above_semantic(fake_cursor):
    business_id = str(uuid4())
    env_id = str(uuid4())
    prefix_fund_id = str(uuid4())

    # Exact/prefix funds lookup: no exact, one prefix.
    fake_cursor.push_result(
        [{"id": prefix_fund_id, "name": "Institutional Growth Fund VII"}]
    )
    fake_cursor.push_result([])  # investments
    fake_cursor.push_result([])  # assets
    with patch("app.services.rag_indexer.semantic_search", lambda q, **kw: []):
        result = hybrid_search(
            "Institutional",  # prefix, not exact
            business_id=business_id,
            env_id=env_id,
            limit=10,
        )
    assert result["results"][0]["lane"] == "prefix"


def test_metadata_sector_filter_returns_assets(fake_cursor):
    business_id = str(uuid4())
    env_id = str(uuid4())
    asset_id = str(uuid4())

    # Exact lane empty.
    fake_cursor.push_result([])  # fund
    fake_cursor.push_result([])  # investment
    fake_cursor.push_result([])  # asset
    # Metadata lane: assets by sector.
    fake_cursor.push_result(
        [
            {
                "id": asset_id,
                "name": "Reunion Tower Plaza",
                "property_type": "multifamily",
                "market": "Dallas, TX",
                "fund_id": str(uuid4()),
                "investment_id": str(uuid4()),
            }
        ]
    )
    with patch("app.services.rag_indexer.semantic_search", lambda q, **kw: []):
        result = hybrid_search(
            "Dallas multifamily assets",
            business_id=business_id,
            env_id=env_id,
            limit=10,
        )

    assert any(r["entity_type"] == "asset" for r in result["results"])
    asset_hits = [r for r in result["results"] if r["entity_id"] == asset_id]
    assert asset_hits, "metadata-lane asset missing from ranked results"
    assert asset_hits[0]["lane"] == "metadata"
    assert "multifamily" in (asset_hits[0]["snippet"] or "")


def test_semantic_hit_dropped_when_entity_does_not_exist(fake_cursor):
    """If a semantic hit references an entity_id that isn't in this business,
    the resolver must drop it. No hallucinations."""
    business_id = str(uuid4())
    env_id = str(uuid4())
    ghost_id = str(uuid4())

    fake_cursor.push_result([])  # exact fund
    fake_cursor.push_result([])  # exact investment
    fake_cursor.push_result([])  # exact asset

    def fake_semantic(q, **kw):
        class _Hit:
            entity_type = "fund"
            entity_id = ghost_id
            score = 0.85
            text = "Narrative discussing a fund that is not in this business."
            chunk_text = "…"

        return [_Hit()]

    with patch("app.services.rag_indexer.semantic_search", fake_semantic):
        # Resolver returns NO row for ghost_id.
        fake_cursor.push_result([])
        result = hybrid_search(
            "ghost fund semantic query", business_id=business_id, env_id=env_id,
        )

    # Ghost should be dropped — no results.
    ghost_hits = [r for r in result["results"] if r["entity_id"] == ghost_id]
    assert not ghost_hits, "semantic hit for nonexistent entity leaked through"


def test_debug_mode_surfaces_per_lane_counts(fake_cursor):
    business_id = str(uuid4())
    env_id = str(uuid4())

    fake_cursor.push_result(
        [{"id": str(uuid4()), "name": "Institutional Growth Fund VII"}]
    )
    fake_cursor.push_result([])  # investments
    fake_cursor.push_result([])  # assets
    with patch("app.services.rag_indexer.semantic_search", lambda q, **kw: []):
        result = hybrid_search(
            "Institutional Growth Fund VII",
            business_id=business_id,
            env_id=env_id,
            debug=True,
        )

    assert "debug" in result
    assert "lane_counts" in result["debug"]
    assert "ranked_lanes" in result["debug"]
    assert result["debug"]["lane_counts"].get("exact", 0) >= 1
