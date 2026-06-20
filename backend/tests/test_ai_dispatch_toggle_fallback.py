"""Gemma runtime toggle + controlled fallback to the small frontier model."""
from __future__ import annotations

import pytest

from app.services.ai_dispatch import runtime
from app.services.ai_dispatch.models import (
    AIRequest,
    DispatchNullReason,
    DispatchStatus,
    ProviderCompletion,
    ProviderName,
    RiskLevel,
    TaskMode,
    Usage,
)
from app.services.ai_dispatch.supervisor import run_dispatch


class SpyAdapter:
    def __init__(self, name: ProviderName, text: str = "ok"):
        self.name = name
        self.text = text
        self.called = False

    def complete(self, req, model):
        self.called = True
        return ProviderCompletion(text=self.text, model=model, usage=Usage(prompt_tokens=3, completion_tokens=4))


@pytest.fixture(autouse=True)
def _reset_toggle():
    runtime._gemma_enabled = None
    yield
    runtime._gemma_enabled = None


@pytest.fixture
def _openai(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    yield


def _gemma_env(monkeypatch):
    for k, v in {
        "GEMMA_VERTEX_PROJECT_ID": "p",
        "GEMMA_VERTEX_LOCATION": "us-central1",
        "GEMMA_VERTEX_ENDPOINT_ID": "e",
    }.items():
        monkeypatch.setenv(k, v)


def _req(mode="summarization", risk="low", **kw):
    return AIRequest(task="summarize the logs", mode=TaskMode(mode), risk_level=RiskLevel(risk), **kw)


def test_gemma_off_falls_back_to_small_openai(_openai):
    runtime.set_gemma_enabled(False)
    spy = SpyAdapter(ProviderName.OPENAI, text="fallback summary")
    r = run_dispatch(_req("summarization", "low"), adapters={ProviderName.OPENAI: spy}, write_receipt=False)
    assert r.status == DispatchStatus.SUCCESS
    assert r.provider == ProviderName.OPENAI
    assert r.model == "gpt-5-mini"
    assert r.answer == "fallback summary"
    assert r.fallback_used is True
    assert r.rejected.get("gemma_gcp") == "gemma_disabled"
    assert spy.called is True


def test_gemma_on_but_unconfigured_falls_back(_openai, monkeypatch):
    # Toggle on, but no GEMMA_VERTEX_* set → Gemma unavailable → fall back (reason gemma_unavailable).
    for k in ("GEMMA_VERTEX_PROJECT_ID", "GEMMA_VERTEX_LOCATION", "GEMMA_VERTEX_ENDPOINT_ID"):
        monkeypatch.delenv(k, raising=False)
    runtime.set_gemma_enabled(True)
    spy = SpyAdapter(ProviderName.OPENAI)
    r = run_dispatch(_req("summarization", "low"), adapters={ProviderName.OPENAI: spy}, write_receipt=False)
    assert r.status == DispatchStatus.SUCCESS
    assert r.provider == ProviderName.OPENAI
    assert r.fallback_used is True
    assert r.rejected.get("gemma_gcp") == "gemma_unavailable"


def test_gemma_on_and_configured_uses_gemma(_openai, monkeypatch):
    _gemma_env(monkeypatch)
    runtime.set_gemma_enabled(True)
    gemma_spy = SpyAdapter(ProviderName.GEMMA_GCP, text="gemma summary")
    openai_spy = SpyAdapter(ProviderName.OPENAI)
    r = run_dispatch(
        _req("summarization", "low"),
        adapters={ProviderName.GEMMA_GCP: gemma_spy, ProviderName.OPENAI: openai_spy},
        write_receipt=False,
    )
    assert r.status == DispatchStatus.SUCCESS
    assert r.provider == ProviderName.GEMMA_GCP
    assert r.answer == "gemma summary"
    assert r.fallback_used is False
    assert gemma_spy.called is True and openai_spy.called is False


def test_forced_gemma_still_fails_closed_when_off(_openai):
    # A FORCED Gemma request is honored literally — no auto-fallback. With Gemma unconfigured it fails closed.
    runtime.set_gemma_enabled(False)
    spy = SpyAdapter(ProviderName.OPENAI)
    r = run_dispatch(
        _req("summarization", "low", forced_provider=ProviderName.GEMMA_GCP),
        adapters={ProviderName.OPENAI: spy, ProviderName.GEMMA_GCP: SpyAdapter(ProviderName.GEMMA_GCP)},
        write_receipt=False,
    )
    assert r.status == DispatchStatus.UNAVAILABLE
    assert r.null_reason == DispatchNullReason.PROVIDER_NOT_CONFIGURED
    assert spy.called is False  # no silent fallback for a forced request


def test_non_gemma_mode_unaffected_by_toggle(_openai):
    runtime.set_gemma_enabled(False)
    spy = SpyAdapter(ProviderName.OPENAI, text="code answer")
    r = run_dispatch(_req("code", "high"), adapters={ProviderName.OPENAI: spy}, write_receipt=False)
    assert r.status == DispatchStatus.SUCCESS
    assert r.provider == ProviderName.OPENAI
    assert r.fallback_used is False  # code is not a Gemma-home mode; normal routing


def test_fallback_recorded_in_receipt(_openai, monkeypatch):
    captured: dict = {}
    monkeypatch.setattr(
        "app.services.ai_dispatch.receipts.record_decision",
        lambda **kw: (captured.update(kw) or "rid"),
    )
    runtime.set_gemma_enabled(False)
    spy = SpyAdapter(ProviderName.OPENAI, text="x")
    r = run_dispatch(_req("summarization", "low"), adapters={ProviderName.OPENAI: spy}, write_receipt=True)
    assert r.fallback_used is True
    assert captured["output_summary"]["provider"] == "openai"
    assert captured["model_used"] == "gpt-5-mini"
    assert "openai" in captured["tags"]


# ── Config endpoint ─────────────────────────────────────────────────


def test_config_get_and_toggle(client):
    g = client.get("/api/ai/dispatch/config")
    assert g.status_code == 200
    assert "gemma_enabled" in g.json() and "fallback_model" in g.json()

    p = client.post("/api/ai/dispatch/config", json={"gemma_enabled": True})
    assert p.status_code == 200
    assert p.json()["gemma_enabled"] is True
    assert client.get("/api/ai/dispatch/config").json()["gemma_enabled"] is True
