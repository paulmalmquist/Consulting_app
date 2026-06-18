"""OpenAI adapter — reuses the instrumented client and the model sanitizer.

This is the one provider that is real and configured by default in production.
It does not touch ``ai_gateway``; it goes through the shared instrumented client.
"""
from __future__ import annotations

from app.services.ai_dispatch.models import (
    AIRequest,
    ProviderCompletion,
    ProviderName,
    Usage,
)
from app.services.ai_dispatch.providers.base import ProviderCallError, ProviderUnavailable


class OpenAIProvider:
    name = ProviderName.OPENAI

    def complete(self, req: AIRequest, model: str) -> ProviderCompletion:
        from app.config import OPENAI_API_KEY

        if not OPENAI_API_KEY:
            raise ProviderUnavailable("OPENAI_API_KEY is not set")

        from app.services.ai_client import get_instrumented_sync_client
        from app.services.model_registry import map_openai_error, sanitize_params

        client = get_instrumented_sync_client()
        params = sanitize_params(
            model,
            messages=[{"role": "user", "content": req.task}],
            max_tokens=req.max_tokens,
        )
        try:
            resp = client.chat.completions.create(**params)
        except Exception as exc:  # noqa: BLE001 — map to a typed call error
            mapped = map_openai_error(exc, model)
            raise ProviderCallError(mapped.debug_message) from exc

        choice = resp.choices[0] if getattr(resp, "choices", None) else None
        text = ""
        finish = None
        if choice is not None:
            text = (getattr(choice.message, "content", None) or "") if choice.message else ""
            finish = getattr(choice, "finish_reason", None)

        usage = Usage()
        if getattr(resp, "usage", None) is not None:
            usage = Usage(
                prompt_tokens=getattr(resp.usage, "prompt_tokens", None),
                completion_tokens=getattr(resp.usage, "completion_tokens", None),
            )

        return ProviderCompletion(
            text=text,
            model=getattr(resp, "model", model) or model,
            usage=usage,
            finish_reason=finish,
        )
