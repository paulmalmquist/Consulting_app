"""Tests for app.services.operator_confirm_registry.

Focus areas:
  * resolve flips status atomically and signals the in-memory slot.
  * abort behaves the same with an "aborted" decision payload.
  * acquire_slot is idempotent per (session, tool_call_id).
  * sweep_expired only touches awaiting rows and signals affected slots.
"""
from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from uuid import uuid4


class FakeCursor:
    def __init__(self):
        self.queries: list[tuple[str, tuple | None]] = []
        self._fetchone_queue: list[dict | None] = []
        self._fetchall_queue: list[list[dict]] = []

    def push_fetchone(self, row):
        self._fetchone_queue.append(row)
        return self

    def push_fetchall(self, rows):
        self._fetchall_queue.append(rows)
        return self

    def execute(self, sql: str, params=None):
        self.queries.append((sql.strip(), params))

    def fetchone(self):
        if self._fetchone_queue:
            return self._fetchone_queue.pop(0)
        return None

    def fetchall(self):
        if self._fetchall_queue:
            return self._fetchall_queue.pop(0)
        return []


@contextmanager
def _ctx(cur):
    yield cur


def _row(*, status="awaiting", session="sess-1", tool_call="tc-1", expires=None):
    return {
        "pending_id": uuid4(),
        "anthropic_session_id": session,
        "tool_call_id": tool_call,
        "conversation_id": uuid4(),
        "business_id": uuid4(),
        "env_id": None,
        "tool_name": "repe.list_funds",
        "tool_input": json.dumps({"limit": 10}),
        "status": status,
        "decision_reason": None,
        "decided_by": None,
        "expires_at": expires or datetime.now(timezone.utc) + timedelta(minutes=5),
    }


def test_register_persists_and_returns_pending(monkeypatch):
    from app.services import operator_confirm_registry as reg

    cur = FakeCursor()
    cur.push_fetchone(_row())
    monkeypatch.setattr(reg, "get_cursor", lambda: _ctx(cur))

    pending = reg.register(
        anthropic_session_id="sess-1",
        tool_call_id="tc-1",
        conversation_id=uuid4(),
        business_id=uuid4(),
        env_id=None,
        tool_name="repe.list_funds",
        tool_input={"limit": 10},
    )

    sql_text = cur.queries[0][0]
    assert "INSERT INTO operator_pending_confirmations" in sql_text
    assert "ON CONFLICT (anthropic_session_id, tool_call_id) DO UPDATE" in sql_text
    assert pending.status == "awaiting"
    assert pending.tool_input == {"limit": 10}


def test_resolve_flips_status_and_returns_post_update(monkeypatch):
    from app.services import operator_confirm_registry as reg

    cur = FakeCursor()
    cur.push_fetchone(_row(status="allowed"))
    monkeypatch.setattr(reg, "get_cursor", lambda: _ctx(cur))

    out = reg.resolve(
        anthropic_session_id="sess-1",
        tool_call_id="tc-1",
        result="allow",
        deny_message=None,
        decided_by="paul@example.com",
    )

    assert out is not None
    assert out.status == "allowed"
    sql, params = cur.queries[0]
    assert "UPDATE operator_pending_confirmations" in sql
    assert "status = %s" in sql
    assert "status = 'awaiting'" in sql  # only flips awaiting rows
    assert params[0] == "allowed"


def test_resolve_returns_none_when_row_missing_or_already_resolved(monkeypatch):
    from app.services import operator_confirm_registry as reg

    cur = FakeCursor()
    cur.push_fetchone(None)
    monkeypatch.setattr(reg, "get_cursor", lambda: _ctx(cur))

    out = reg.resolve(
        anthropic_session_id="sess-1",
        tool_call_id="tc-1",
        result="deny",
        deny_message="user_cancelled",
        decided_by="paul@example.com",
    )
    assert out is None


def test_acquire_slot_is_idempotent_per_key():
    """Acquiring the same (session, tool_call_id) twice returns the same slot."""
    from app.services import operator_confirm_registry as reg

    async def _go():
        # Reset module state so a stale slot from a sibling test doesn't pollute.
        reg._LIVE.clear()
        a = await reg.acquire_slot(anthropic_session_id="sess-x", tool_call_id="tc-x")
        b = await reg.acquire_slot(anthropic_session_id="sess-x", tool_call_id="tc-x")
        assert a is b
        # Different tool_call_id → different slot.
        c = await reg.acquire_slot(anthropic_session_id="sess-x", tool_call_id="tc-y")
        assert c is not a
        reg.cleanup_slot(anthropic_session_id="sess-x", tool_call_id="tc-x")
        reg.cleanup_slot(anthropic_session_id="sess-x", tool_call_id="tc-y")

    asyncio.run(_go())


def test_sweep_expired_marks_and_signals(monkeypatch):
    from app.services import operator_confirm_registry as reg

    expired_now = [
        {"anthropic_session_id": "sess-1", "tool_call_id": "tc-1"},
        {"anthropic_session_id": "sess-2", "tool_call_id": "tc-9"},
    ]

    cur = FakeCursor()
    cur.push_fetchall(expired_now)
    monkeypatch.setattr(reg, "get_cursor", lambda: _ctx(cur))

    async def _go():
        reg._LIVE.clear()
        slot1 = await reg.acquire_slot(anthropic_session_id="sess-1", tool_call_id="tc-1")
        # Note: sess-2 has no waiter — sweep should still complete cleanly.
        count = await reg.sweep_expired()
        assert count == 2
        sql, _ = cur.queries[0]
        assert "UPDATE operator_pending_confirmations" in sql
        assert "status = 'expired'" in sql
        # The signaled slot should have been resolved with deny.
        await asyncio.wait_for(slot1.event.wait(), timeout=1.0)
        assert slot1.decision == {
            "result": "deny",
            "deny_message": "expired_by_sweep",
            "status": "expired",
        }
        reg.cleanup_slot(anthropic_session_id="sess-1", tool_call_id="tc-1")

    asyncio.run(_go())


def test_abort_signals_with_deny_decision(monkeypatch):
    from app.services import operator_confirm_registry as reg

    cur = FakeCursor()
    cur.push_fetchone(_row(status="aborted"))
    monkeypatch.setattr(reg, "get_cursor", lambda: _ctx(cur))

    async def _go():
        reg._LIVE.clear()
        slot = await reg.acquire_slot(anthropic_session_id="sess-9", tool_call_id="tc-9")
        out = reg.abort(anthropic_session_id="sess-9", tool_call_id="tc-9", reason="restart")
        assert out is not None
        await asyncio.wait_for(slot.event.wait(), timeout=1.0)
        assert slot.decision["result"] == "deny"
        assert slot.decision["deny_message"] == "restart"
        reg.cleanup_slot(anthropic_session_id="sess-9", tool_call_id="tc-9")

    asyncio.run(_go())
