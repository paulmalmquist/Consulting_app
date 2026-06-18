"""Anthropic (Claude) adapter — raw httpx, mirroring ``psychrag_llm._anthropic_completion``.

Uses httpx rather than the SDK to avoid a hard dependency assumption; the Messages
API contract is stable. Available only when ``ANTHROPIC_API_KEY`` is set.
"""
from __future__ import annotations

from app.services.ai_dispatch.models import (
    AIRequest,
    ProviderCompletion,
    ProviderName,
    Usage,
)
from app.services.ai_dispatch.providers.base import ProviderCallError, ProviderUnavailable

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider:
    name = ProviderName.ANTHROPIC

    def complete(self, req: AIRequest, model: str) -> ProviderCompletion:
        from app.config import ANTHROPIC_API_KEY

        if not ANTHROPIC_API_KEY:
            raise ProviderUnavailable("ANTHROPIC_API_KEY is not set")

        import httpx

        try:
            with httpx.Client(timeout=45.0) as client:
                response = client.post(
                    _ANTHROPIC_URL,
                    headers={
                        "x-api-key": ANTHROPIC_API_KEY,
                        "anthropic-version": _ANTHROPIC_VERSION,
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": req.max_tokens,
                        "messages": [{"role": "user", "content": req.task}],
                    },
                )
        except Exception as exc:  # noqa: BLE001 — network/transport failure
            raise ProviderCallError(f"anthropic request failed: {exc}") from exc

        if response.status_code >= 400:
            raise ProviderCallError(
                f"anthropic returned {response.status_code}: {response.text[:200]}"
            )

        payload = response.json()
        text = "".join(
            block.get("text", "")
            for block in payload.get("content", [])
            if block.get("type") == "text"
        ).strip()
        usage = payload.get("usage") or {}
        return ProviderCompletion(
            text=text,
            model=payload.get("model", model),
            usage=Usage(
                prompt_tokens=usage.get("input_tokens"),
                completion_tokens=usage.get("output_tokens"),
            ),
            finish_reason=payload.get("stop_reason"),
        )
