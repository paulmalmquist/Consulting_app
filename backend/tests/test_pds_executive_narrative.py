from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4

import pytest

from app.services.pds_executive import briefing, narrative


class _InsertCursor:
    def __init__(self):
        self.last_params = None
        self.inserts: list[tuple[str, tuple | None]] = []

    def execute(self, sql: str, params=None):
        self.last_params = params
        self.inserts.append((sql, params))
        return self

    def fetchone(self):
        # generate_drafts insert params indices:
        # 2=draft_type, 4=body_text, 8=fallback_used
        if self.last_params and len(self.last_params) >= 9:
            return {
                "draft_id": str(uuid4()),
                "draft_type": self.last_params[2],
                "body_text": self.last_params[4],
                "fallback_used": self.last_params[8],
                "status": "draft",
            }
        return {
            "briefing_pack_id": str(uuid4()),
            "summary_text": "placeholder",
        }


@contextmanager
def _cursor_ctx(cursor):
    yield cursor


def test_guardrail_flags_detect_blacklisted_terms():
    text = "This LLM workflow uses a vector database under the hood."
    flags = narrative._guardrail_flags(text)
    assert "llm" in flags
    assert "vector database" in flags


def test_generate_drafts_fallback_path(monkeypatch: pytest.MonkeyPatch):
    cursor = _InsertCursor()
    monkeypatch.setattr(narrative, "get_cursor", lambda: _cursor_ctx(cursor))
    monkeypatch.setattr(narrative, "_get_metrics", lambda **_: {"open_queue": 3, "risk_events": 2, "hours_saved": 10})
    monkeypatch.setattr(narrative, "_maybe_generate_with_gateway", lambda prompt: (None, "sidecar unavailable"))

    rows = narrative.generate_drafts(
        env_id=uuid4(),
        business_id=uuid4(),
        draft_types=["internal_memo"],
        actor="tester",
    )

    assert len(rows) == 1
    assert rows[0]["fallback_used"] is True
    assert "project leaders" in rows[0]["body_text"].lower()


def test_generate_drafts_llm_path(monkeypatch: pytest.MonkeyPatch):
    cursor = _InsertCursor()
    monkeypatch.setattr(narrative, "get_cursor", lambda: _cursor_ctx(cursor))
    monkeypatch.setattr(narrative, "_get_metrics", lambda **_: {"open_queue": 3, "risk_events": 2, "hours_saved": 10})
    monkeypatch.setattr(
        narrative,
        "_maybe_generate_with_gateway",
        lambda prompt: ("We are improving outcomes and client transparency.", None),
    )

    rows = narrative.generate_drafts(
        env_id=uuid4(),
        business_id=uuid4(),
        draft_types=["press_release"],
        actor="tester",
    )

    assert rows[0]["fallback_used"] is False
    assert "client transparency" in rows[0]["body_text"].lower()


class _BriefingCursor:
    def __init__(self):
        self.mode = ""
        self.summary_text = None

    def execute(self, sql: str, params=None):
        if "SELECT COUNT(*) AS open_queue" in sql:
            self.mode = "metrics_queue"
        elif "SELECT COUNT(*) AS high_signals" in sql:
            self.mode = "metrics_signals"
        elif "SELECT COALESCE(SUM(amount), 0) AS pipeline_value_open" in sql:
            self.mode = "metrics_pipeline"
        elif "INSERT INTO pds_exec_briefing_pack" in sql:
            self.mode = "insert"
            self.summary_text = params[6]
        return self

    def fetchone(self):
        if self.mode == "metrics_queue":
            return {"open_queue": 4}
        if self.mode == "metrics_signals":
            return {"high_signals": 2}
        if self.mode == "metrics_pipeline":
            return {"pipeline_value_open": "12000000"}
        if self.mode == "insert":
            return {
                "briefing_pack_id": str(uuid4()),
                "briefing_type": "board",
                "summary_text": self.summary_text,
            }
        return {}


@contextmanager
def _briefing_ctx(cursor):
    yield cursor


def test_briefing_generation_prefers_llm_summary(monkeypatch: pytest.MonkeyPatch):
    cursor = _BriefingCursor()
    monkeypatch.setattr(briefing, "get_cursor", lambda: _briefing_ctx(cursor))
    monkeypatch.setattr(briefing.narrative, "generate_drafts", lambda **_: [{"body_text": "LLM board summary"}])

    row = briefing.generate_briefing_pack(
        env_id=uuid4(),
        business_id=uuid4(),
        briefing_type="board",
        period="2026-03",
        actor="tester",
    )
    assert row["summary_text"] == "LLM board summary"


def test_briefing_generation_fallback_summary(monkeypatch: pytest.MonkeyPatch):
    cursor = _BriefingCursor()
    monkeypatch.setattr(briefing, "get_cursor", lambda: _briefing_ctx(cursor))

    def _fail(**kwargs):
        raise RuntimeError("llm down")

    monkeypatch.setattr(briefing.narrative, "generate_drafts", _fail)

    row = briefing.generate_briefing_pack(
        env_id=uuid4(),
        business_id=uuid4(),
        briefing_type="investor",
        period="2026-03",
        actor="tester",
    )
    assert "executive" in row["summary_text"].lower()
