from __future__ import annotations

import os
import sys
from pathlib import Path
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.engine.contracts import load_contracts
from orchestration.engine.pipeline import build_plan, execute_run


def _session(intent: str = "ui_refactor", risk: str = "low") -> dict:
    sid = str(uuid4())
    return {
        "session_id": sid,
        "model": "fast" if intent in {"ui_refactor", "file_move", "test_fix", "documentation", "analytics_query"} else "deep",
        "reasoning_effort": "low",
        "branch": f"feature/{sid}/{intent}",
        "allowed_directories": ["repo-b/src/app"],
        "allowed_tools": ["read", "edit", "shell"],
        "max_files_per_execution": 3,
        "auto_approval": False,
        "created_at": "2026-01-01T00:00:00+00:00",
        "intent": intent,
        "risk_level": risk,
        "status": "active",
    }


def test_plan_is_deterministic_for_same_inputs(monkeypatch):
    contracts = load_contracts()
    s = _session()
    monkeypatch.setattr("orchestration.engine.pipeline.head_sha", lambda: "abc123")
    p1 = build_plan(session=s, prompt="UI refactor card", contracts=contracts)
    p2 = build_plan(session=s, prompt="UI refactor card", contracts=contracts)
    assert p1.plan_id == p2.plan_id


def test_run_requires_confirmation_when_not_auto_approved(monkeypatch, tmp_path):
    os.environ.setdefault("CODEX_MODEL_FAST", "gpt-4o-mini")
    contracts = load_contracts()
    s = _session()

    monkeypatch.setattr("orchestration.engine.pipeline.head_sha", lambda: "abc123")
    monkeypatch.setattr("orchestration.engine.pipeline.ensure_worktree", lambda _sid, _br: tmp_path)
    monkeypatch.setattr("orchestration.engine.pipeline.changed_files", lambda _cwd=None: [])
    monkeypatch.setattr("orchestration.engine.pipeline.diff_numstat", lambda _cwd=None: (0, 0))
    monkeypatch.setattr("orchestration.engine.pipeline.detect_high_risk_requirements", lambda files, plan_preview_id=None: ([], False))

    with pytest.raises(ValueError, match="Approval required"):
        execute_run(session=s, contracts=contracts, prompt="UI refactor card", simulate=True)


def test_scope_enforcement_fails_out_of_scope_changes(monkeypatch, tmp_path):
    os.environ.setdefault("CODEX_MODEL_FAST", "gpt-4o-mini")
    contracts = load_contracts()
    s = _session()

    monkeypatch.setattr("orchestration.engine.pipeline.head_sha", lambda: "abc123")
    monkeypatch.setattr("orchestration.engine.pipeline.ensure_worktree", lambda _sid, _br: tmp_path)

    calls = {"n": 0}

    def _changed(_cwd=None):
        calls["n"] += 1
        return ["backend/app/main.py"] if calls["n"] <= 2 else []

    monkeypatch.setattr("orchestration.engine.pipeline.changed_files", _changed)
    monkeypatch.setattr("orchestration.engine.pipeline.diff_numstat", lambda _cwd=None: (10, 1))
    monkeypatch.setattr("orchestration.engine.pipeline.detect_high_risk_requirements", lambda files, plan_preview_id=None: ([], False))

    out = execute_run(
        session=s,
        contracts=contracts,
        prompt="UI refactor changes",
        simulate=True,
        approval_text="CONFIRM",
    )
    assert out["status"] == "failed"
    assert any("Out-of-scope" in e for e in out["errors"])
