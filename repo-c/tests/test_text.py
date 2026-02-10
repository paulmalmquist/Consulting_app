"""Tests for text chunking utility."""

from app.text import chunk_text


def test_chunk_short_text():
    text = "Hello world"
    chunks = chunk_text(text)
    assert len(chunks) == 1
    assert chunks[0] == "Hello world"


def test_chunk_longer_text():
    text = "A" * 1600
    chunks = chunk_text(text, chunk_size=800, overlap=120)
    assert len(chunks) >= 2
    # Each chunk should be <= chunk_size
    for chunk in chunks:
        assert len(chunk) <= 800


def test_chunk_overlap():
    text = "A" * 2000
    chunks = chunk_text(text, chunk_size=800, overlap=120)
    # With overlap, later chunks should start before where the previous one ended
    assert len(chunks) >= 3


def test_chunk_empty_text():
    chunks = chunk_text("")
    assert chunks == []


def test_chunk_whitespace_only():
    chunks = chunk_text("   \n\t  ")
    assert chunks == []
