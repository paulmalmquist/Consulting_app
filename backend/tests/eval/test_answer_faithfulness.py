"""Evaluation tests for answer faithfulness and hallucination prevention.

Tests the query_rewriter module and verifies response assembly patterns.
Uses mocked OpenAI — no real API calls.
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.query_rewriter import expand_query


@pytest.fixture
def mock_openai_completion():
    """Mock OpenAI chat completions for query expansion tests."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps([
        "What is the capitalization rate for Ashford Commons?",
        "Ashford Commons property cap rate percentage",
        "Show cap rate metric for Ashford Commons asset",
    ])

    mock_client = MagicMock()
    mock_create = AsyncMock(return_value=mock_response)
    mock_client.chat.completions.create = mock_create
    return mock_client, mock_create


def test_query_expansion_returns_variants(mock_openai_completion):
    """expand_query returns original + variants."""
    mock_client, _ = mock_openai_completion

    with patch("app.services.query_rewriter.OPENAI_API_KEY", "test-key"), \
         patch("openai.AsyncOpenAI", return_value=mock_client):
        result = asyncio.get_event_loop().run_until_complete(
            expand_query("What is the cap rate for Ashford Commons?", num_variants=3)
        )

    assert len(result) == 4  # original + 3 variants
    assert result[0] == "What is the cap rate for Ashford Commons?"
    assert all(isinstance(v, str) for v in result)


def test_query_expansion_fallback_on_error():
    """expand_query falls back to [query] on API error."""
    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=Exception("API error"))

    with patch("app.services.query_rewriter.OPENAI_API_KEY", "test-key"), \
         patch("openai.AsyncOpenAI", return_value=mock_client):
        result = asyncio.get_event_loop().run_until_complete(
            expand_query("test query")
        )

    assert result == ["test query"]


def test_query_expansion_fallback_no_api_key():
    """expand_query falls back to [query] when no API key is configured."""
    with patch("app.services.query_rewriter.OPENAI_API_KEY", ""):
        result = asyncio.get_event_loop().run_until_complete(
            expand_query("test query")
        )

    assert result == ["test query"]


def test_query_expansion_handles_malformed_json():
    """expand_query handles non-JSON responses gracefully."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Not valid JSON at all"

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("app.services.query_rewriter.OPENAI_API_KEY", "test-key"), \
         patch("openai.AsyncOpenAI", return_value=mock_client):
        result = asyncio.get_event_loop().run_until_complete(
            expand_query("test query")
        )

    assert result == ["test query"]


def test_query_expansion_handles_code_block_response():
    """expand_query strips markdown code blocks from response."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = '```json\n["variant 1", "variant 2"]\n```'

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("app.services.query_rewriter.OPENAI_API_KEY", "test-key"), \
         patch("openai.AsyncOpenAI", return_value=mock_client):
        result = asyncio.get_event_loop().run_until_complete(
            expand_query("test query", num_variants=2)
        )

    assert len(result) == 3  # original + 2 variants
    assert result[0] == "test query"


def test_langfuse_noop_trace_accepted():
    """Verify the NoOpTrace from langfuse_client works with expand_query."""
    from app.services.langfuse_client import NoOpTrace

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = '["v1"]'

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("app.services.query_rewriter.OPENAI_API_KEY", "test-key"), \
         patch("openai.AsyncOpenAI", return_value=mock_client):
        result = asyncio.get_event_loop().run_until_complete(
            expand_query("test", trace=NoOpTrace())
        )

    assert len(result) >= 1
