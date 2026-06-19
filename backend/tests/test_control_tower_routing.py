"""Control-Tower-scoped routing posture: sensitive -> in-boundary Gemma only; non-sensitive -> frontier.

These tests need no DB, no API keys, and no GPU — they exercise the scoped registry + the governed
router's eligibility/availability logic. The ITAR-aware posture is the inverse of production: external
APIs (OpenAI/Anthropic) are capped at INTERNAL, the self-hosted Gemma tier may handle SENSITIVE.
"""
from __future__ import annotations

import pytest

from app.services.ai_dispatch.models import DispatchNullReason, DispatchStatus, ProviderName
from app.services.ai_dispatch.supervisor import route_only
from app.services.control_tower.routing import control_tower_registry, run_triage


@pytest.fixture(autouse=True)
def _gemma_cold(monkeypatch):
    # Gemma is cold/unconfigured unless a test says otherwise; keep external keys present so the
    # frontier path can resolve to an available provider.
    monkeypatch.delenv("GEMMA_VERTEX_PROJECT_ID", raising=False)
    monkeypatch.delenv("GEMMA_VERTEX_ENDPOINT_ID", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "ak-test")
    yield


def _triage(itar_tagged: bool, verdict: str = "NO_GO"):
    return run_triage(
        verdict=verdict,
        channel_name="D-4",
        anomaly_score=3.1,
        threshold=0.135,
        env_id="env-test",
        business_id="00000000-0000-0000-0000-000000000000",
        itar_tagged=itar_tagged,
        execute=False,
    )


def test_sensitive_excludes_external_apis():
    """A sensitive/ITAR-demo-tagged request rejects both external APIs with privacy_forbidden."""
    out = _triage(itar_tagged=True)
    assert out.rejected.get("openai") == DispatchNullReason.PRIVACY_FORBIDDEN.value
    assert out.rejected.get("anthropic") == DispatchNullReason.PRIVACY_FORBIDDEN.value
    # External providers must never be selected for sensitive data.
    assert out.selected_provider in (None, ProviderName.GEMMA_GCP.value)


def test_sensitive_only_gemma_eligible():
    """Eligibility (before availability) for a sensitive request is exactly the in-boundary Gemma tier."""
    out = _triage(itar_tagged=True)
    decision = route_only(_sensitive_request(), control_tower_registry())
    assert decision.eligible == [ProviderName.GEMMA_GCP]
    # And with Gemma cold, the request fails closed rather than leaking to an external API.
    assert out.dispatch_status == DispatchStatus.UNAVAILABLE.value


def test_gemma_cold_fails_closed_for_sensitive():
    out = _triage(itar_tagged=True)
    assert out.selected_provider is None
    assert out.rejected.get("gemma_gcp") == DispatchNullReason.PROVIDER_NOT_CONFIGURED.value


def test_nonsensitive_routes_to_frontier():
    """A non-sensitive request routes to the frontier tier; Gemma is barred by capability."""
    out = _triage(itar_tagged=False)
    # Frontier reasoning mode: Anthropic is preferred and available in this test env.
    assert out.selected_provider == ProviderName.ANTHROPIC.value
    assert out.dispatch_status == DispatchStatus.SUCCESS.value
    assert out.rejected.get("gemma_gcp") == DispatchNullReason.CAPABILITY_UNAVAILABLE.value


def _sensitive_request():
    from app.services.ai_dispatch.models import AIRequest, Privacy, RiskLevel, TaskMode

    return AIRequest(
        task="triage",
        mode=TaskMode.TELEMETRY_NARRATIVE,
        risk_level=RiskLevel.HIGH,
        privacy=Privacy.SENSITIVE,
        env_id="env-test",
        business_id="00000000-0000-0000-0000-000000000000",
        max_tokens=512,
    )
