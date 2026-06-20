"""Go/No-Go orchestration + enforced gate state transitions (DB mocked via fake_cursor).

score_window is monkeypatched to a canned verdict so these tests exercise the runner/approval logic,
not the champion scorer. signing.sign_decision is stubbed for the approve path (the crypto chain has its
own pure + integration tests)."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services import telemetry_serving
from app.services.control_tower import approval, runner, signing

ENV = "env-test"
BIZ = "00000000-0000-0000-0000-000000000000"


def _canned_score(monkeypatch, **over):
    base = {"verdict": "NO_GO", "anomaly_score": 3.1, "threshold": 0.135, "receipt_id": "pred-1"}
    base.update(over)
    monkeypatch.setattr(telemetry_serving, "score_window", lambda **kw: base)


def _decision_row(**over):
    row = {
        "id": "dec-1", "env_id": ENV, "business_id": BIZ, "run_key": "run-1", "channel_name": "D-4",
        "verdict": "NO_GO", "anomaly_score": 3.1, "threshold": 0.135, "tel_prediction_id": "pred-1",
        "triage_summary": None, "privacy": "sensitive", "itar_tagged": True,
        "dispatch_request_id": None, "dispatch_provider": None, "dispatch_model": None,
        "dispatch_status": "unavailable", "routing_reason": "sensitive -> private tier",
        "routing_rejected": {}, "triage_cost_usd": 0.0, "status": "pending_approval",
        "human_decision": None, "human_rationale": None, "requested_evidence": None,
        "resolved_by": None, "resolved_at": None, "signed_receipt_id": None,
        "expires_at": datetime(2026, 6, 19, tzinfo=timezone.utc),
        "created_at": datetime(2026, 6, 18, tzinfo=timezone.utc),
    }
    row.update(over)
    return row


def test_no_go_opens_gate(fake_cursor, monkeypatch):
    _canned_score(monkeypatch, verdict="NO_GO")
    fake_cursor.push_result([_decision_row(status="pending_approval")])  # INSERT ... RETURNING
    out = runner.run_gonogo(
        env_id=ENV, business_id=BIZ, run_key="run-1", channel_name="D-4",
        window=[{"t": 0, "value": 9.9}], itar_tagged=True,
    )
    assert out["status"] == "pending_approval"
    assert out["verdict"] == "NO_GO"


def test_go_auto_passes(fake_cursor, monkeypatch):
    _canned_score(monkeypatch, verdict="GO", anomaly_score=0.2)
    fake_cursor.push_result([_decision_row(status="auto_pass", verdict="GO")])
    out = runner.run_gonogo(
        env_id=ENV, business_id=BIZ, run_key="run-1", channel_name="D-4",
        window=[{"t": 0, "value": 1.0}],
    )
    assert out["status"] == "auto_pass"


def test_not_available_fails_closed(fake_cursor, monkeypatch):
    _canned_score(monkeypatch, verdict="NOT_AVAILABLE", null_reason="model_not_promoted")
    fake_cursor.push_result([
        _decision_row(status="failed", verdict="NOT_AVAILABLE",
                      routing_reason="score_unavailable: model_not_promoted")
    ])
    out = runner.run_gonogo(
        env_id=ENV, business_id=BIZ, run_key="run-1", channel_name="D-4",
        window=[{"t": 0, "value": 1.0}],
    )
    assert out["status"] == "failed"
    assert "model_not_promoted" in out["routing_reason"]


def test_request_more_evidence_holds_without_receipt(fake_cursor):
    fake_cursor.push_result([_decision_row(status="pending_approval")])          # SELECT
    fake_cursor.push_result([_decision_row(status="needs_more_evidence",
                                           human_decision="request_more_evidence",
                                           requested_evidence="need vibration spectra")])  # UPDATE
    out = approval.resolve(
        env_id=ENV, business_id=BIZ, decision_id="dec-1",
        human_decision="request_more_evidence", resolved_by="operator",
        requested_evidence="need vibration spectra",
    )
    assert out["receipt"] is None
    assert out["decision"]["status"] == "needs_more_evidence"


def test_approve_signs_receipt(fake_cursor, monkeypatch):
    monkeypatch.setattr(signing, "sign_decision", lambda **kw: {"id": "rec-1", "chain_seq": 1})
    fake_cursor.push_result([_decision_row(status="pending_approval")])          # SELECT
    fake_cursor.push_result([_decision_row(status="approved",
                                           human_decision="approve",
                                           signed_receipt_id="rec-1")])          # UPDATE
    out = approval.resolve(
        env_id=ENV, business_id=BIZ, decision_id="dec-1",
        human_decision="approve", resolved_by="operator", rationale="cleared",
    )
    assert out["receipt"]["id"] == "rec-1"
    assert out["decision"]["status"] == "approved"


def test_resolve_rejects_unknown_verb(fake_cursor):
    fake_cursor.push_result([_decision_row(status="pending_approval")])
    with pytest.raises(ValueError):
        approval.resolve(env_id=ENV, business_id=BIZ, decision_id="dec-1",
                         human_decision="maybe", resolved_by="op")


def test_resolve_blocks_already_resolved(fake_cursor):
    fake_cursor.push_result([_decision_row(status="approved")])  # already resolved
    with pytest.raises(ValueError):
        approval.resolve(env_id=ENV, business_id=BIZ, decision_id="dec-1",
                         human_decision="approve", resolved_by="op")
