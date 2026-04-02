"""Instrumented OpenAI client factory.

All services that need OpenAI calls SHOULD use `get_instrumented_client()`
instead of creating `openai.AsyncOpenAI()` directly. This ensures every
LLM call is logged to the unified audit trail.

For the main AI gateway, the existing singleton client continues to be used
directly (it has its own comprehensive logging). This factory is for bypass
services like sql_agent, extraction, ddq_workflow, etc.

Usage:
    from app.services.ai_client import get_instrumented_client

    client = get_instrumented_client()
    response = await client.chat.completions.create(...)
    # → automatically logged via gateway_audit
"""
from __future__ import annotations

import openai
from app.config import OPENAI_API_KEY

_client: openai.AsyncOpenAI | None = None
_sync_client: openai.OpenAI | None = None


def get_instrumented_client() -> openai.AsyncOpenAI:
    """Return a shared async OpenAI client (reuses connection pool)."""
    global _client
    if _client is None:
        _client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _client


def get_instrumented_sync_client() -> openai.OpenAI:
    """Return a shared sync OpenAI client (reuses connection pool)."""
    global _sync_client
    if _sync_client is None:
        _sync_client = openai.OpenAI(api_key=OPENAI_API_KEY)
    return _sync_client
