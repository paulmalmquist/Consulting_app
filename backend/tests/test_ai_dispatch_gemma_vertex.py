"""Gemma-on-Vertex adapter: fail-closed config, mocked success, errors, policy still enforced.

No real Vertex call — `_vertex_access_token` and `_vertex_predict` are monkeypatched.
"""
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
from app.services.ai_dispatch.providers import gemma_vertex_provider as gv
from app.services.ai_dispatch.providers.base import ProviderCallError, ProviderUnavailable
from app.services.ai_dispatch.providers.gemma_vertex_provider import GemmaVertexProvider
from app.services.ai_dispatch.registry import provider_registry
from app.services.ai_dispatch.supervisor import run_dispatch


def _req(mode: str = "summarization", risk: str = "low", privacy: str = "internal", **kw) -> AIRequest:
    return AIRequest(
        task="summarize these logs",
        mode=TaskMode(mode),
        risk_level=RiskLevel(risk),
        privacy=Privacy(privacy),
        **kw,
    )


@pytest.fixture
def gemma_configured(monkeypatch):
    # registry.available() reads os.environ; the adapter reads app.config — set both.
    for k, v in {
        "GEMMA_VERTEX_PROJECT_ID": "proj-x",
        "GEMMA_VERTEX_LOCATION": "us-central1",
        "GEMMA_VERTEX_ENDPOINT_ID": "endpoint-123",
    }.items():
        monkeypatch.setenv(k, v)
        monkeypatch.setattr(f"app.config.{k}", v, raising=False)
    yield


# ── Adapter unit ────────────────────────────────────────────────────


def test_missing_env_fails_closed(monkeypatch):
    for k in ("GEMMA_VERTEX_PROJECT_ID", "GEMMA_VERTEX_LOCATION", "GEMMA_VERTEX_ENDPOINT_ID"):
        monkeypatch.setattr(f"app.config.{k}", "", raising=False)
    with pytest.raises(ProviderUnavailable):
        GemmaVertexProvider().complete(_req(), "gemma")


def test_auth_unavailable_fails_closed(gemma_configured, monkeypatch):
    def _raise():
        raise RuntimeError("no ADC")

    monkeypatch.setattr(gv, "_vertex_access_token", _raise)
    with pytest.raises(ProviderUnavailable):
        GemmaVertexProvider().complete(_req(), "gemma")


def test_mocked_vertex_success(gemma_configured, monkeypatch):
    seen = {}

    def fake_predict(url, token, payload, timeout=60.0):
        seen["url"] = url
        seen["token"] = token
        seen["payload"] = payload
        return {
            "predictions": [{"content": "Summary: 3 retries, 1 OOM."}],
            "metadata": {"promptTokenCount": 12, "candidatesTokenCount": 8},
        }

    monkeypatch.setattr(gv, "_vertex_access_token", lambda: "fake-token")
    monkeypatch.setattr(gv, "_vertex_predict", fake_predict)

    out = GemmaVertexProvider().complete(_req(), "gemma-2")
    assert out.text.startswith("Summary")
    assert out.model == "gemma-2"
    assert out.usage.prompt_tokens == 12 and out.usage.completion_tokens == 8
    # endpoint :predict URL built from config (endpoint id is a non-secret resource id)
    assert "endpoint-123:predict" in seen["url"]
    assert "us-central1-aiplatform.googleapis.com" in seen["url"]


def test_vertex_http_error_is_call_error(gemma_configured, monkeypatch):
    monkeypatch.setattr(gv, "_vertex_access_token", lambda: "fake-token")

    def boom(url, token, payload, timeout=60.0):
        raise ProviderCallError("vertex returned 500")

    monkeypatch.setattr(gv, "_vertex_predict", boom)
    with pytest.raises(ProviderCallError):
        GemmaVertexProvider().complete(_req(), "gemma")


def test_vertex_timeout_is_call_error(gemma_configured, monkeypatch):
    monkeypatch.setattr(gv, "_vertex_access_token", lambda: "fake-token")

    def timeout(url, token, payload, timeout=60.0):
        raise TimeoutError("deadline exceeded")

    monkeypatch.setattr(gv, "_vertex_predict", timeout)
    with pytest.raises(ProviderCallError):
        GemmaVertexProvider().complete(_req(), "gemma")


# ── Through the supervisor (default real adapter + mocked Vertex) ────


def test_supervisor_success_with_receipt(gemma_configured, monkeypatch):
    monkeypatch.setattr(gv, "_vertex_access_token", lambda: "fake-token")
    monkeypatch.setattr(gv, "_vertex_predict", lambda *a, **k: {"predictions": [{"content": "ok summary"}]})
    monkeypatch.setattr("app.services.ai_dispatch.receipts.record_decision", lambda **kw: "rid-gemma")

    r = run_dispatch(_req("summarization", "low"))
    assert r.status == DispatchStatus.SUCCESS
    assert r.provider == ProviderName.GEMMA_GCP
    assert r.answer == "ok summary"
    assert r.model == "gemma-2"
    assert r.latency_ms is not None
    assert r.receipt_id == "rid-gemma" and r.receipt_status == "written"


def test_supervisor_vertex_error_is_degraded(gemma_configured, monkeypatch):
    monkeypatch.setattr(gv, "_vertex_access_token", lambda: "fake-token")

    def boom(*a, **k):
        raise ProviderCallError("vertex 503")

    monkeypatch.setattr(gv, "_vertex_predict", boom)
    r = run_dispatch(_req("summarization", "low"), write_receipt=False)
    assert r.status == DispatchStatus.DEGRADED
    assert r.null_reason == DispatchNullReason.PROVIDER_CALL_FAILED


def test_no_silent_fallback_when_gemma_unconfigured(monkeypatch):
    # Gemma is the home for summarization but unconfigured → fail closed, never substitute OpenAI.
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    for k in ("GEMMA_VERTEX_PROJECT_ID", "GEMMA_VERTEX_LOCATION", "GEMMA_VERTEX_ENDPOINT_ID"):
        monkeypatch.delenv(k, raising=False)

    called = {"openai": False, "gemma": False}

    class OpenAISpy:
        name = ProviderName.OPENAI

        def complete(self, req, model):
            called["openai"] = True
            raise AssertionError("should not be called")

    class GemmaSpy:
        name = ProviderName.GEMMA_GCP

        def complete(self, req, model):
            called["gemma"] = True
            raise AssertionError("should not be called")

    r = run_dispatch(
        _req("summarization", "low"),
        adapters={ProviderName.OPENAI: OpenAISpy(), ProviderName.GEMMA_GCP: GemmaSpy()},
        write_receipt=False,
    )
    assert r.status == DispatchStatus.UNAVAILABLE
    assert r.null_reason == DispatchNullReason.PROVIDER_NOT_CONFIGURED
    assert called["openai"] is False and called["gemma"] is False


# ── Policy is unchanged by the adapter being real ───────────────────


def test_gemma_still_blocked_for_code_high_and_sensitive(gemma_configured):
    forced_code = select_provider(_req("code", "low", forced_provider=ProviderName.GEMMA_GCP))
    assert forced_code.status == DispatchStatus.BLOCKED
    assert forced_code.null_reason == DispatchNullReason.CAPABILITY_UNAVAILABLE

    high = select_provider(_req("summarization", "high"))
    assert high.rejected.get("gemma_gcp") == DispatchNullReason.RISK_TIER_FORBIDDEN.value

    sensitive = select_provider(_req("summarization", "low", "sensitive"))
    assert sensitive.rejected.get("gemma_gcp") == DispatchNullReason.PRIVACY_FORBIDDEN.value


# ── Receipts + admin status ─────────────────────────────────────────


def test_gemma_receipt_redacts_and_excludes_answer(gemma_configured, monkeypatch):
    captured: dict = {}
    monkeypatch.setattr(gv, "_vertex_access_token", lambda: "fake-token")
    monkeypatch.setattr(gv, "_vertex_predict", lambda *a, **k: {"predictions": [{"content": "secret-laden answer"}]})
    monkeypatch.setattr(
        "app.services.ai_dispatch.receipts.record_decision",
        lambda **kw: (captured.update(kw) or "rid"),
    )

    req = _req("summarization", "low")
    req.metadata = {"auth_token": "sk-zzz"}
    run_dispatch(req)

    from app.services.audit import redact_dict

    redacted_input = redact_dict(captured["input_summary"])
    assert "sk-zzz" not in str(redacted_input)
    assert captured["output_summary"].get("provider") == "gemma_gcp"
    assert "answer" not in captured["output_summary"]
    assert "secret-laden answer" not in str(captured["output_summary"])


def test_admin_status_gemma_implemented_and_env_gated(monkeypatch):
    for k in ("GEMMA_VERTEX_PROJECT_ID", "GEMMA_VERTEX_LOCATION", "GEMMA_VERTEX_ENDPOINT_ID"):
        monkeypatch.delenv(k, raising=False)
    assert provider_registry.is_implemented(ProviderName.GEMMA_GCP) is True
    assert provider_registry.available(ProviderName.GEMMA_GCP) is False
    missing = provider_registry.missing_env(ProviderName.GEMMA_GCP)
    assert "GEMMA_VERTEX_PROJECT_ID" in missing and "GEMMA_VERTEX_ENDPOINT_ID" in missing

    monkeypatch.setenv("GEMMA_VERTEX_PROJECT_ID", "p")
    monkeypatch.setenv("GEMMA_VERTEX_LOCATION", "us-central1")
    monkeypatch.setenv("GEMMA_VERTEX_ENDPOINT_ID", "e")
    assert provider_registry.available(ProviderName.GEMMA_GCP) is True
