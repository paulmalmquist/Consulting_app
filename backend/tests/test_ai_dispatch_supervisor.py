"""Supervisor: dispatch states, anti-fabrication, receipts + redaction. No network."""
from __future__ import annotations

import pytest

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
from app.services.ai_dispatch.providers.base import ProviderCallError
from app.services.ai_dispatch.supervisor import run_dispatch


class SpyAdapter:
    def __init__(self, name: ProviderName, text: str = "ok", raises: Exception | None = None):
        self.name = name
        self.text = text
        self.raises = raises
        self.called = False

    def complete(self, req, model):
        self.called = True
        if self.raises is not None:
            raise self.raises
        return ProviderCompletion(
            text=self.text,
            model=model,
            usage=Usage(prompt_tokens=5, completion_tokens=7),
        )


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "ak-test")
    yield


def _req(mode: str, risk: str = "medium", **kw) -> AIRequest:
    return AIRequest(task="hello", mode=TaskMode(mode), risk_level=RiskLevel(risk), **kw)


def test_success_with_mock_openai():
    spy = SpyAdapter(ProviderName.OPENAI, text="hi there")
    r = run_dispatch(_req("code", "high"), adapters={ProviderName.OPENAI: spy}, write_receipt=False)
    assert r.status == DispatchStatus.SUCCESS
    assert r.provider == ProviderName.OPENAI
    assert r.answer == "hi there"
    assert r.usage.prompt_tokens == 5
    assert spy.called is True


def test_gemma_unavailable_makes_no_provider_call():
    gemma_spy = SpyAdapter(ProviderName.GEMMA_GCP)
    openai_spy = SpyAdapter(ProviderName.OPENAI)
    r = run_dispatch(
        _req("summarization", "low"),
        adapters={ProviderName.GEMMA_GCP: gemma_spy, ProviderName.OPENAI: openai_spy},
        write_receipt=False,
    )
    assert r.status == DispatchStatus.UNAVAILABLE
    assert r.null_reason == DispatchNullReason.PROVIDER_NOT_CONFIGURED
    assert gemma_spy.called is False
    assert openai_spy.called is False  # no silent fallback


def test_provider_call_error_is_degraded():
    spy = SpyAdapter(ProviderName.OPENAI, raises=ProviderCallError("boom"))
    r = run_dispatch(_req("code", "high"), adapters={ProviderName.OPENAI: spy}, write_receipt=False)
    assert r.status == DispatchStatus.DEGRADED
    assert r.null_reason == DispatchNullReason.PROVIDER_CALL_FAILED


def test_unexpected_error_is_degraded_and_never_raises():
    spy = SpyAdapter(ProviderName.OPENAI, raises=ValueError("weird"))
    r = run_dispatch(_req("code", "high"), adapters={ProviderName.OPENAI: spy}, write_receipt=False)
    assert r.status == DispatchStatus.DEGRADED
    assert r.null_reason == DispatchNullReason.PROVIDER_CALL_FAILED


def test_empty_task_blocked_invalid_inputs():
    req = AIRequest(task="   ", mode=TaskMode.CODE, risk_level=RiskLevel.LOW)
    r = run_dispatch(req, adapters={}, write_receipt=False)
    assert r.status == DispatchStatus.BLOCKED
    assert r.null_reason == DispatchNullReason.INVALID_INPUTS


def test_receipt_written_sets_id(monkeypatch):
    monkeypatch.setattr("app.services.ai_dispatch.receipts.record_decision", lambda **kw: "rid-123")
    spy = SpyAdapter(ProviderName.OPENAI, text="x")
    r = run_dispatch(_req("code", "high"), adapters={ProviderName.OPENAI: spy}, write_receipt=True)
    assert r.receipt_id == "rid-123"
    assert r.receipt_status == "written"
    assert r.status == DispatchStatus.SUCCESS


def test_receipt_failure_degrades_and_nulls_id(monkeypatch):
    monkeypatch.setattr("app.services.ai_dispatch.receipts.record_decision", lambda **kw: None)
    spy = SpyAdapter(ProviderName.OPENAI, text="kept")
    r = run_dispatch(_req("code", "high"), adapters={ProviderName.OPENAI: spy}, write_receipt=True)
    assert r.receipt_status == "failed"
    assert r.receipt_id is None
    assert r.null_reason == DispatchNullReason.RECEIPT_WRITE_FAILED
    assert r.status == DispatchStatus.DEGRADED
    assert r.answer == "kept"  # the answer is retained, not hidden


def test_receipt_uses_provider_dispatch_decision_type(monkeypatch):
    captured: dict = {}

    def fake_record(**kw):
        captured.update(kw)
        return "rid"

    monkeypatch.setattr("app.services.ai_dispatch.receipts.record_decision", fake_record)
    spy = SpyAdapter(ProviderName.OPENAI, text="x")
    run_dispatch(_req("code", "high"), adapters={ProviderName.OPENAI: spy}, write_receipt=True)
    assert captured["decision_type"] == "provider_dispatch"
    assert captured["actor"] == "ai_dispatch"
    assert "provider_dispatch" in captured["tags"]
    assert "openai" in captured["tags"]


def test_redaction_contract_keeps_secrets_out_of_input_summary():
    from app.services.ai_dispatch.receipts import build_input_summary
    from app.services.audit import redact_dict

    req = AIRequest(
        task="t",
        mode=TaskMode.SUMMARIZATION,
        risk_level=RiskLevel.LOW,
        metadata={"auth_token": "sk-supersecret"},
    )
    redacted = redact_dict(build_input_summary(req))
    value = str(redacted["metadata"]["auth_token"])
    assert "sk-supersecret" not in value
    assert "REDACT" in value.upper()


def test_output_summary_never_carries_the_answer():
    from app.services.ai_dispatch.receipts import build_output_summary

    out = build_output_summary(
        provider=ProviderName.OPENAI,
        model="gpt-5-mini",
        status=DispatchStatus.SUCCESS,
        routing_reason="x",
        usage=Usage(prompt_tokens=1, completion_tokens=2),
        null_reason=None,
    )
    assert "answer" not in out
    assert "task" not in out
