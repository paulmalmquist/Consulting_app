"""Policy: mode routing, hard Gemma boundaries, and no silent fallback."""
from __future__ import annotations

import pytest

from app.services.ai_dispatch.models import (
    AIRequest,
    DispatchNullReason,
    DispatchStatus,
    Privacy,
    ProviderName,
    RiskLevel,
    TaskMode,
)
from app.services.ai_dispatch.policy import select_provider
from app.services.ai_dispatch.registry import ProviderRegistry, provider_registry


@pytest.fixture(autouse=True)
def _providers_configured(monkeypatch):
    # OpenAI + Anthropic available; Gemma stays unimplemented regardless.
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "ak-test")
    yield


def _req(mode: str, risk: str = "medium", privacy: str = "internal", **kw) -> AIRequest:
    return AIRequest(
        task="t",
        mode=TaskMode(mode),
        risk_level=RiskLevel(risk),
        privacy=Privacy(privacy),
        **kw,
    )


def test_code_routes_to_openai():
    d = select_provider(_req("code", "high"))
    assert d.status == DispatchStatus.SUCCESS
    assert d.selected_provider == ProviderName.OPENAI
    assert d.rejected.get("gemma_gcp") == DispatchNullReason.RISK_TIER_FORBIDDEN.value


def test_adversarial_review_routes_to_anthropic():
    d = select_provider(_req("adversarial_review", "medium"))
    assert d.status == DispatchStatus.SUCCESS
    assert d.selected_provider == ProviderName.ANTHROPIC


def test_planning_routes_to_anthropic():
    d = select_provider(_req("planning", "low"))
    assert d.selected_provider == ProviderName.ANTHROPIC


def test_summarization_prefers_gemma_and_fails_closed_without_fallback():
    d = select_provider(_req("summarization", "low"))
    # Gemma is the home for this mode but is not configured. Even though OpenAI is
    # eligible and available, we do NOT silently substitute it.
    assert d.status == DispatchStatus.UNAVAILABLE
    assert d.selected_provider is None
    assert d.null_reason == DispatchNullReason.PROVIDER_NOT_CONFIGURED


def test_summarization_with_explicit_fallback_uses_openai():
    d = select_provider(_req("summarization", "low", allow_fallback=True))
    assert d.status == DispatchStatus.SUCCESS
    assert d.selected_provider == ProviderName.OPENAI
    assert d.fallback_used is True


def test_high_risk_cannot_route_to_gemma():
    d = select_provider(_req("summarization", "high"))
    assert d.rejected.get("gemma_gcp") == DispatchNullReason.RISK_TIER_FORBIDDEN.value
    assert d.selected_provider == ProviderName.OPENAI


def test_sensitive_privacy_excludes_gemma():
    d = select_provider(_req("summarization", "low", "sensitive"))
    assert d.rejected.get("gemma_gcp") == DispatchNullReason.PRIVACY_FORBIDDEN.value
    assert d.selected_provider == ProviderName.OPENAI


def test_forced_ineligible_provider_blocked_on_capability():
    d = select_provider(_req("code", "low", forced_provider=ProviderName.GEMMA_GCP))
    assert d.status == DispatchStatus.BLOCKED
    assert d.null_reason == DispatchNullReason.CAPABILITY_UNAVAILABLE


def test_forced_gemma_high_risk_blocked_on_risk():
    d = select_provider(_req("summarization", "high", forced_provider=ProviderName.GEMMA_GCP))
    assert d.status == DispatchStatus.BLOCKED
    assert d.null_reason == DispatchNullReason.RISK_TIER_FORBIDDEN


def test_no_eligible_provider_blocked():
    # A registry with only Gemma cannot serve a code request.
    reg = ProviderRegistry()
    gemma = provider_registry.get(ProviderName.GEMMA_GCP)
    assert gemma is not None
    reg.register(gemma)
    d = select_provider(_req("code", "low"), registry=reg)
    assert d.status == DispatchStatus.BLOCKED
    assert d.null_reason == DispatchNullReason.NO_ELIGIBLE_PROVIDER
