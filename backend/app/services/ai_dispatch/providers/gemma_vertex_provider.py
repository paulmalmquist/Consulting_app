"""Gemma-on-Vertex adapter — fail-closed stub for PR 1.

The real Vertex AI Model Garden / endpoint wiring lands in a later PR. Until then
this adapter makes no network call and always fails closed, so nothing can mistake
an unconfigured Gemma for a working one.
"""
from __future__ import annotations

from app.services.ai_dispatch.models import AIRequest, ProviderCompletion, ProviderName
from app.services.ai_dispatch.providers.base import ProviderUnavailable


class GemmaVertexProvider:
    name = ProviderName.GEMMA_GCP

    def complete(self, req: AIRequest, model: str) -> ProviderCompletion:
        raise ProviderUnavailable(
            "gemma vertex adapter is not wired in PR 1 (provider_not_configured)"
        )
