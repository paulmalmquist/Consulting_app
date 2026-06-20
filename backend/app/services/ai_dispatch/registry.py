"""Provider registry — the governed catalog of dispatchable providers.

Mirrors the singleton + frozen-dataclass pattern of ``backend/app/mcp/registry.py``.
Availability is computed from the live environment so the ``/providers`` view never
overclaims: a provider is *available* only when it is implemented AND every required
env var is set. In PR 1 the Gemma adapter is a fail-closed stub, so Gemma is reported
unavailable regardless of credentials.
"""
from __future__ import annotations

import os

from app.services.ai_dispatch.models import (
    Privacy,
    ProviderDef,
    ProviderName,
    RiskLevel,
    TaskMode,
)

# Providers with a real adapter. Gemma's Vertex adapter is wired (PR 3); availability is now
# purely credential-gated — `available()` is True only when GEMMA_VERTEX_* is fully set (and the
# adapter still fails closed at call time if Application Default Credentials are missing).
_IMPLEMENTED: frozenset[ProviderName] = frozenset(
    {ProviderName.OPENAI, ProviderName.ANTHROPIC, ProviderName.GEMMA_GCP}
)

_OPENAI_MODES = frozenset(
    {
        TaskMode.CODE,
        TaskMode.TOOL_EXECUTION,
        TaskMode.SQL_DRAFT,
        TaskMode.EVAL_GRADING,
        TaskMode.CLASSIFICATION,
        TaskMode.SUMMARIZATION,
        TaskMode.LOW_RISK_RAG,
        TaskMode.LOG_EXPLANATION,
        TaskMode.TELEMETRY_NARRATIVE,
    }
)

_ANTHROPIC_MODES = frozenset(
    {
        TaskMode.PLANNING,
        TaskMode.ADVERSARIAL_REVIEW,
        TaskMode.RESEARCH_SYNTHESIS,
        TaskMode.SUMMARIZATION,
        TaskMode.LOG_EXPLANATION,
    }
)

# Gemma may only ever win cheap, low-risk, non-code work. It is structurally barred
# from code/tool/sql, from HIGH risk, and from SENSITIVE data by max_risk/max_privacy
# and the absence of those modes here.
_GEMMA_MODES = frozenset(
    {
        TaskMode.SUMMARIZATION,
        TaskMode.CLASSIFICATION,
        TaskMode.LOW_RISK_RAG,
        TaskMode.LOG_EXPLANATION,
        TaskMode.TELEMETRY_NARRATIVE,
    }
)


class ProviderRegistry:
    """In-memory singleton catalog of ``ProviderDef`` entries."""

    def __init__(self) -> None:
        self._providers: dict[ProviderName, ProviderDef] = {}

    def register(self, provider: ProviderDef) -> None:
        self._providers[provider.name] = provider

    def get(self, name: ProviderName | str) -> ProviderDef | None:
        try:
            return self._providers.get(ProviderName(name))
        except ValueError:
            return None

    def list_all(self) -> list[ProviderDef]:
        return list(self._providers.values())

    def is_implemented(self, name: ProviderName) -> bool:
        return ProviderName(name) in _IMPLEMENTED

    def missing_env(self, name: ProviderName) -> list[str]:
        prov = self.get(name)
        if prov is None:
            return []
        return [v for v in prov.requires_env if not os.getenv(v)]

    def available(self, name: ProviderName) -> bool:
        """True only when the provider is implemented and fully configured."""
        prov = self.get(name)
        if prov is None:
            return False
        if not self.is_implemented(prov.name):
            return False
        return not self.missing_env(prov.name)

    def describe_all(self) -> list[dict]:
        out: list[dict] = []
        for prov in self._providers.values():
            out.append(
                {
                    "name": prov.name.value,
                    "display_name": prov.display_name,
                    "default_model": prov.default_model,
                    "allowed_modes": sorted(m.value for m in prov.allowed_modes),
                    "max_risk": prov.max_risk.value,
                    "max_privacy": prov.max_privacy.value,
                    "fallback_allowed": prov.fallback_allowed,
                    "implemented": self.is_implemented(prov.name),
                    "available": self.available(prov.name),
                    "missing_env": self.missing_env(prov.name),
                }
            )
        return out


def _build_default_registry() -> ProviderRegistry:
    reg = ProviderRegistry()
    reg.register(
        ProviderDef(
            name=ProviderName.OPENAI,
            display_name="OpenAI",
            default_model="gpt-5-mini",
            allowed_modes=_OPENAI_MODES,
            max_risk=RiskLevel.HIGH,
            max_privacy=Privacy.SENSITIVE,
            fallback_allowed=True,
            requires_env=("OPENAI_API_KEY",),
        )
    )
    reg.register(
        ProviderDef(
            name=ProviderName.ANTHROPIC,
            display_name="Claude (Anthropic)",
            default_model="claude-opus-4",
            allowed_modes=_ANTHROPIC_MODES,
            max_risk=RiskLevel.HIGH,
            max_privacy=Privacy.SENSITIVE,
            fallback_allowed=True,
            requires_env=("ANTHROPIC_API_KEY",),
        )
    )
    reg.register(
        ProviderDef(
            name=ProviderName.GEMMA_GCP,
            display_name="Gemma (GCP Vertex)",
            default_model="gemma-2",
            allowed_modes=_GEMMA_MODES,
            max_risk=RiskLevel.MEDIUM,
            max_privacy=Privacy.INTERNAL,
            fallback_allowed=False,
            requires_env=("GEMMA_VERTEX_PROJECT_ID", "GEMMA_VERTEX_ENDPOINT_ID"),
        )
    )
    return reg


provider_registry = _build_default_registry()
