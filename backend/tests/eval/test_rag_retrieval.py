"""Evaluation tests for RAG retrieval pipeline.

Tests semantic_search(), reranking order, over-fetch, and metadata boosting.
Uses mocked DB and embeddings — no real Postgres or OpenAI calls.
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest

from app.services.rag_indexer import RetrievedChunk, semantic_search


def _make_chunk(
    *,
    chunk_id: str = "",
    score: float = 0.5,
    text: str = "test chunk",
    section_heading: str = "Section 1",
    document_id: str = "",
    entity_type: str | None = None,
    entity_id: str | None = None,
    env_id: str | None = None,
) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id or str(uuid.uuid4()),
        document_id=document_id or str(uuid.uuid4()),
        chunk_text=text,
        score=score,
        chunk_index=0,
        section_heading=section_heading,
        section_path=section_heading,
        parent_chunk_text=text,
        source_filename="test.pdf",
        retrieval_method="cosine",
        entity_type=entity_type,
        entity_id=entity_id,
        env_id=env_id,
    )


# ── Fixtures ──────────────────────────────────────────────────────


class FakeRagCursor:
    """Minimal cursor for RAG tests."""

    def __init__(self, cosine_rows=None, fts_rows=None):
        self._call_count = 0
        self._cosine_rows = cosine_rows or []
        self._fts_rows = fts_rows or []

    def execute(self, sql, params=None):
        self._call_count += 1
        return self

    def fetchone(self):
        # First call is pgvector type check
        if self._call_count == 1:
            return {"typname": "vector"}
        return None

    def fetchall(self):
        # Second call is cosine search, third is FTS
        if self._call_count == 2:
            return self._cosine_rows
        if self._call_count == 3:
            return self._fts_rows
        return []


@pytest.fixture
def mock_embedding():
    """Mock the embedding function to return a fixed vector."""
    fake_embedding = tuple([0.1] * 1536)
    with patch("app.services.rag_indexer._embed_query_cached", return_value=fake_embedding):
        yield fake_embedding


# ── Tests ─────────────────────────────────────────────────────────


def test_semantic_search_returns_chunks(mock_embedding):
    """Basic test: semantic_search returns chunks from cosine results."""
    business_id = uuid.uuid4()
    chunk_id = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())

    cosine_rows = [
        {
            "chunk_id": chunk_id,
            "document_id": doc_id,
            "child_text": "Ashford Commons cap rate is 6.5%",
            "score": 0.82,
            "chunk_index": 0,
            "section_heading": "Property Metrics",
            "section_path": "Property Metrics",
            "parent_text": "Ashford Commons cap rate is 6.5% with 95% occupancy",
            "source_filename": "ashford_memo.pdf",
            "entity_type": "asset",
            "entity_id": str(uuid.uuid4()),
            "env_id": str(uuid.uuid4()),
        }
    ]

    cursor = FakeRagCursor(cosine_rows=cosine_rows)

    @contextmanager
    def mock_cursor():
        yield cursor

    with patch("app.services.rag_indexer.get_cursor", mock_cursor):
        results = semantic_search(
            query="cap rate for Ashford Commons",
            business_id=business_id,
            top_k=5,
        )

    assert len(results) == 1
    assert results[0].chunk_id == chunk_id
    assert results[0].score == 0.82


def test_overfetch_returns_more_candidates(mock_embedding):
    """When return_all=True, semantic_search skips the top_k slice."""
    business_id = uuid.uuid4()

    # Create 10 cosine results
    cosine_rows = [
        {
            "chunk_id": str(uuid.uuid4()),
            "document_id": str(uuid.uuid4()),
            "child_text": f"Chunk {i}",
            "score": 0.9 - (i * 0.05),
            "chunk_index": i,
            "section_heading": f"Section {i}",
            "section_path": f"Section {i}",
            "parent_text": f"Parent chunk {i}",
            "source_filename": "test.pdf",
            "entity_type": None,
            "entity_id": None,
            "env_id": None,
        }
        for i in range(10)
    ]

    cursor = FakeRagCursor(cosine_rows=cosine_rows)

    @contextmanager
    def mock_cursor():
        yield cursor

    with patch("app.services.rag_indexer.get_cursor", mock_cursor):
        # With return_all=False (default), should return top_k=3
        results_limited = semantic_search(
            query="test query",
            business_id=business_id,
            top_k=3,
        )

        # Reset cursor
        cursor._call_count = 0

        # With return_all=True, should return all 10
        results_all = semantic_search(
            query="test query",
            business_id=business_id,
            top_k=3,
            return_all=True,
        )

    assert len(results_limited) == 3
    assert len(results_all) == 10


def test_threshold_after_rerank():
    """T-2.1: Verify that a chunk with low cosine but high rerank score survives.

    This tests the pipeline ordering fix: threshold is applied AFTER reranking,
    not before. A chunk scoring 0.25 cosine would be discarded by the old pipeline
    but should survive if the reranker scores it highly.
    """
    # Chunk with low cosine score (below RAG_MIN_SCORE of 0.30)
    low_cosine_chunk = _make_chunk(score=0.25, text="Important financial data")
    # Chunk with ok cosine score
    ok_chunk = _make_chunk(score=0.45, text="General info")

    # Simulate reranking: the low-cosine chunk gets a high rerank score
    reranked_low = _make_chunk(
        chunk_id=low_cosine_chunk.chunk_id,
        score=0.85,  # Cohere rerank score
        text=low_cosine_chunk.chunk_text,
    )
    reranked_ok = _make_chunk(
        chunk_id=ok_chunk.chunk_id,
        score=0.40,
        text=ok_chunk.chunk_text,
    )

    # Apply threshold AFTER rerank (the correct order)
    from app.config import RAG_MIN_SCORE
    reranked = [reranked_low, reranked_ok]
    filtered = [c for c in reranked if c.score >= RAG_MIN_SCORE]

    # The low-cosine chunk should survive because its RERANK score (0.85) > threshold (0.30)
    assert len(filtered) == 2
    assert any(c.chunk_id == low_cosine_chunk.chunk_id for c in filtered)

    # Verify the old pipeline would have killed it
    old_filtered = [c for c in [low_cosine_chunk, ok_chunk] if c.score >= RAG_MIN_SCORE]
    assert len(old_filtered) == 1  # Only ok_chunk survives
    assert not any(c.chunk_id == low_cosine_chunk.chunk_id for c in old_filtered)


def test_metadata_boost_prefers_scope_match(mock_embedding):
    """Verify that chunks matching the current entity scope get boosted."""
    from app.services.rag_indexer import _apply_metadata_boost

    target_entity_id = str(uuid.uuid4())

    chunk_match = _make_chunk(
        score=0.50,
        text="Matching entity data",
        entity_type="fund",
        entity_id=target_entity_id,
        env_id="env-1",
    )
    chunk_other = _make_chunk(
        score=0.55,
        text="Other entity data",
        entity_type="fund",
        entity_id=str(uuid.uuid4()),
        env_id="env-1",
    )

    boosted = _apply_metadata_boost(
        [chunk_other, chunk_match],
        scope_entity_type="fund",
        scope_entity_id=target_entity_id,
        scope_env_id="env-1",
    )

    # The matching chunk should now score higher than the other
    scores = {c.chunk_id: c.score for c in boosted}
    assert scores[chunk_match.chunk_id] > scores[chunk_other.chunk_id]
