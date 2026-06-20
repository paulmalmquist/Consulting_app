"""Provider adapters for the dispatch layer.

``default_adapters()`` builds one instance per provider. The supervisor accepts an
override mapping so tests can inject spies/mocks and make no real network calls.
"""
from __future__ import annotations

from app.services.ai_dispatch.models import ProviderName
from app.services.ai_dispatch.providers.base import (
    Provider,
    ProviderCallError,
    ProviderUnavailable,
)


def default_adapters() -> dict[ProviderName, Provider]:
    from app.services.ai_dispatch.providers.anthropic_provider import AnthropicProvider
    from app.services.ai_dispatch.providers.gemma_vertex_provider import GemmaVertexProvider
    from app.services.ai_dispatch.providers.openai_provider import OpenAIProvider

    adapters: dict[ProviderName, Provider] = {}
    for adapter in (OpenAIProvider(), AnthropicProvider(), GemmaVertexProvider()):
        adapters[adapter.name] = adapter
    return adapters


__all__ = [
    "Provider",
    "ProviderCallError",
    "ProviderUnavailable",
    "default_adapters",
]
