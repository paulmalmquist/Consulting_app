"""Provider adapter protocol + exceptions.

Adapters are synchronous so the supervisor can run from both a sync FastAPI route
and the CLI without an event loop. Each adapter raises:
  * ``ProviderUnavailable`` — the provider is eligible but not usable (no creds, not
    wired). The supervisor turns this into ``UNAVAILABLE / provider_not_configured``.
  * ``ProviderCallError`` — the provider was called but the call failed. The
    supervisor turns this into ``DEGRADED / provider_call_failed``.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.services.ai_dispatch.models import AIRequest, ProviderCompletion, ProviderName


class ProviderUnavailable(RuntimeError):
    """Provider is eligible but not configured/wired (fail closed, never substitute)."""


class ProviderCallError(RuntimeError):
    """Provider was invoked but the call failed."""


@runtime_checkable
class Provider(Protocol):
    name: ProviderName

    def complete(self, req: AIRequest, model: str) -> ProviderCompletion: ...
