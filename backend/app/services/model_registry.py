"""Centralized model capability registry, request sanitizer, and error mapper.

Every OpenAI API call site MUST use ``sanitize_params()`` to build request
kwargs.  This eliminates scattered prefix-based detection (``_is_gpt5``,
``_is_reasoning_model``) and ensures parameter correctness for any model.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ── Model capabilities ──────────────────────────────────────────────


@dataclass(frozen=True)
class ModelCaps:
    supports_temperature: bool = False
    supports_top_p: bool = False
    supports_reasoning_effort: bool = False
    uses_max_completion_tokens: bool = True
    supports_tools: bool = True
    supports_streaming: bool = True
    max_context_tokens: int = 128_000
    max_output_tokens: int = 16_384


# Explicit registry — add new models here
_REGISTRY: dict[str, ModelCaps] = {
    # GPT-5 family: no temperature, uses max_completion_tokens, supports reasoning_effort
    "gpt-5": ModelCaps(
        supports_reasoning_effort=True,
    ),
    "gpt-5-mini": ModelCaps(
        supports_reasoning_effort=True,
    ),
    # GPT-4o family: supports temperature, uses max_tokens (not max_completion_tokens)
    "gpt-4o": ModelCaps(
        supports_temperature=True,
        supports_top_p=True,
        uses_max_completion_tokens=False,
    ),
    "gpt-4o-mini": ModelCaps(
        supports_temperature=True,
        supports_top_p=True,
        uses_max_completion_tokens=False,
    ),
    # o-series: no temperature, uses max_completion_tokens, supports reasoning_effort
    "o1": ModelCaps(supports_reasoning_effort=True),
    "o1-mini": ModelCaps(supports_reasoning_effort=True),
    "o3": ModelCaps(supports_reasoning_effort=True),
    "o3-mini": ModelCaps(supports_reasoning_effort=True),
}

# Conservative defaults for unknown models — safe choices that work everywhere
_CONSERVATIVE = ModelCaps(
    supports_temperature=False,
    supports_top_p=False,
    supports_reasoning_effort=False,
    uses_max_completion_tokens=True,
    supports_tools=True,
    supports_streaming=True,
)


def get_caps(model: str) -> ModelCaps:
    """Look up model capabilities.  Falls back to prefix match, then conservative defaults."""
    m = model.lower().strip()

    # Exact match first
    if m in _REGISTRY:
        return _REGISTRY[m]

    # Prefix match (handles dated variants like gpt-5-mini-2026-03-01)
    for key in sorted(_REGISTRY, key=len, reverse=True):
        if m.startswith(key):
            return _REGISTRY[key]

    logger.warning("Unknown model '%s' — using conservative defaults (no temperature, max_completion_tokens)", model)
    return _CONSERVATIVE


# ── Request sanitizer ───────────────────────────────────────────────


def sanitize_params(
    model: str,
    *,
    messages: list[dict[str, Any]],
    max_tokens: int = 2048,
    temperature: float | None = None,
    reasoning_effort: str | None = None,
    tools: list[dict] | None = None,
    tool_choice: str | None = None,
    stream: bool = False,
    **extra: Any,
) -> dict[str, Any]:
    """Build a clean kwargs dict for ``client.chat.completions.create()``.

    Only includes parameters the target model actually supports.
    """
    caps = get_caps(model)
    params: dict[str, Any] = {
        "model": model,
        "messages": messages,
    }

    # Token limit
    if caps.uses_max_completion_tokens:
        params["max_completion_tokens"] = max_tokens
    else:
        params["max_tokens"] = max_tokens

    # Temperature — only if model supports it AND a value was explicitly requested
    if caps.supports_temperature and temperature is not None:
        params["temperature"] = temperature

    # Reasoning effort
    if caps.supports_reasoning_effort and reasoning_effort:
        params["reasoning_effort"] = reasoning_effort

    # Tools
    if caps.supports_tools and tools:
        params["tools"] = tools
        params["tool_choice"] = tool_choice or "auto"

    # Streaming
    if stream and caps.supports_streaming:
        params["stream"] = True
        params["stream_options"] = {"include_usage": True}

    return params


# ── Error mapper ────────────────────────────────────────────────────

# Patterns to detect specific OpenAI error sub-types from error messages
_TEMP_RE = re.compile(r"temperature.*does not support|unsupported.*temperature", re.I)
_MAX_TOKENS_RE = re.compile(r"max_tokens.*not supported|max_completion_tokens", re.I)
_MODEL_RE = re.compile(r"model.*not found|does not exist", re.I)
_CONTEXT_RE = re.compile(r"context.length|maximum context|too many tokens", re.I)
_RATE_RE = re.compile(r"rate.limit|too many requests|quota", re.I)


@dataclass
class MappedError:
    """Structured error with user-friendly and debug messages."""
    user_message: str
    debug_message: str
    is_retryable: bool = False
    should_strip_param: str | None = None  # param name to strip on retry
    should_fallback: bool = False


def map_openai_error(err: Exception, model: str) -> MappedError:
    """Map an OpenAI exception to a user-friendly + debug message pair."""
    raw = str(err)
    status = getattr(err, "status_code", None) or getattr(err, "status", 0)

    # 400 — bad parameter
    if status == 400 or "400" in raw[:20]:
        if _TEMP_RE.search(raw):
            return MappedError(
                user_message="Winston is adjusting settings and retrying...",
                debug_message=f"Model {model} rejected temperature param: {raw[:200]}",
                is_retryable=True,
                should_strip_param="temperature",
            )
        if _MAX_TOKENS_RE.search(raw):
            return MappedError(
                user_message="Winston is adjusting settings and retrying...",
                debug_message=f"Model {model} token param mismatch: {raw[:200]}",
                is_retryable=True,
                should_strip_param="max_tokens",
            )
        if _CONTEXT_RE.search(raw):
            return MappedError(
                user_message="This conversation has gotten quite long. Please start a new conversation.",
                debug_message=f"Context overflow for {model}: {raw[:200]}",
            )
        # Generic 400
        return MappedError(
            user_message="Winston encountered a configuration issue. Please try again.",
            debug_message=f"OpenAI 400 for {model}: {raw[:300]}",
        )

    # 404 — model not found
    if status == 404 or _MODEL_RE.search(raw):
        return MappedError(
            user_message="Winston's AI model is temporarily unavailable. Switching to backup...",
            debug_message=f"Model {model} not found: {raw[:200]}",
            is_retryable=True,
            should_fallback=True,
        )

    # 429 — rate limit
    if status == 429 or _RATE_RE.search(raw):
        return MappedError(
            user_message="Winston is experiencing high demand. Trying again in a moment...",
            debug_message=f"Rate limit for {model}: {raw[:200]}",
            is_retryable=True,
        )

    # 500/502/503 — server error
    if status in (500, 502, 503):
        return MappedError(
            user_message="The AI service is temporarily unavailable. Retrying...",
            debug_message=f"OpenAI {status} for {model}: {raw[:200]}",
            is_retryable=True,
        )

    # Unknown
    return MappedError(
        user_message="Something unexpected happened. Please try again.",
        debug_message=f"Unclassified error for {model}: {raw[:300]}",
    )
