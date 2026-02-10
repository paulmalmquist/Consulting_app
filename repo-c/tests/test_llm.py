"""Tests for LLM module (no external API calls)."""

from app.llm import embed_texts, chat_completion, _hash_embedding


def test_hash_embedding_size():
    emb = _hash_embedding("test", size=1536)
    assert len(emb) == 1536
    assert all(isinstance(v, float) for v in emb)
    assert all(0.0 <= v <= 1.0 for v in emb)


def test_hash_embedding_deterministic():
    emb1 = _hash_embedding("test")
    emb2 = _hash_embedding("test")
    assert emb1 == emb2


def test_hash_embedding_different_inputs():
    emb1 = _hash_embedding("test1")
    emb2 = _hash_embedding("test2")
    assert emb1 != emb2


def test_embed_texts_fallback():
    """Without API keys, embed_texts should fall back to hash-based embeddings."""
    embeddings = embed_texts(["hello", "world"])
    assert len(embeddings) == 2
    assert len(embeddings[0]) == 1536
    assert len(embeddings[1]) == 1536


def test_chat_completion_fallback():
    """Without API keys, chat_completion should return a demo response."""
    result = chat_completion("system prompt", "user question")
    assert isinstance(result, str)
    assert len(result) > 0
    assert "not configured" in result.lower() or "demo" in result.lower()
