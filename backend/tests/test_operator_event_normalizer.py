"""Tests for the Anthropic-event → SSE normalization in
app.services.operator_agent_gateway._anthropic_event_to_sse.

Goals:
  * tool_use boundary flushes any open text block before recording the tool.
  * requires_action stops persist a confirmation row per tool_call_id and
    emit one `confirmation_required` SSE per blocking event_id (proves
    multiple in-flight confirmations are keyed correctly, not cross-wired).
  * session.error becomes an explicit `response_block: error` (recoverable
    flag depends on error type — auth/connection failures are non-recoverable).
"""
from __future__ import annotations

import json
from contextlib import contextmanager
from types import SimpleNamespace
from uuid import uuid4


@contextmanager
def _noop_cursor():
    """No-op cursor for the registry.register call inside requires_action."""
    class _Cur:
        def execute(self, *a, **k):
            pass

        def fetchone(self):
            return {
                "pending_id": uuid4(),
                "anthropic_session_id": "sess-x",
                "tool_call_id": "tc-x",
                "conversation_id": uuid4(),
                "business_id": uuid4(),
                "env_id": None,
                "tool_name": "x",
                "tool_input": "{}",
                "status": "awaiting",
                "decision_reason": None,
                "decided_by": None,
                "expires_at": None,
            }

        def fetchall(self):
            return []

    yield _Cur()


def _ev(event_type, **fields):
    """Synthesize an event object that matches what Anthropic SDK exposes
    (attribute access). Falls back to a dict shape for `content`/`stop_reason`
    structures so sdk_to_dict(...) returns the right thing.
    """
    payload = {"type": event_type, **fields}
    return SimpleNamespace(**payload)


def test_text_then_tool_use_flushes_text_block_first(monkeypatch):
    from app.services import operator_agent_gateway as op
    from app.services import operator_confirm_registry as reg

    monkeypatch.setattr(reg, "get_cursor", _noop_cursor)
    monkeypatch.setattr(op, "get_cursor", _noop_cursor)

    acc = op.TurnAccumulator()
    state = {"dropped_high_freq_count": 0}
    ring: list = []

    text_event = _ev("agent.message", content=[{"type": "text", "text": "Listing your funds…"}])
    tool_event = _ev(
        "agent.mcp_tool_use",
        id="tc-1",
        name="repe.list_funds",
        input={"limit": 10},
    )

    out_text = op._anthropic_event_to_sse(
        text_event,
        accumulator=acc,
        anthropic_session_id="sess-1",
        conversation_id=uuid4(),
        business_id=uuid4(),
        env_id=None,
        state=state,
        last_events_ring=ring,
    )
    out_tool = op._anthropic_event_to_sse(
        tool_event,
        accumulator=acc,
        anthropic_session_id="sess-1",
        conversation_id=uuid4(),
        business_id=uuid4(),
        env_id=None,
        state=state,
        last_events_ring=ring,
    )

    # Text yielded a markdown_text block (because agent.message is a complete
    # message, not a delta — we flush immediately).
    text_blocks = [line for line in out_text if "markdown_text" in line]
    assert len(text_blocks) >= 1

    # tool_use SSE includes the tool_call_id and a tool_activity block.
    joined = "".join(out_tool)
    assert '"tool_call_id": "tc-1"' in joined
    assert '"tool_name": "repe.list_funds"' in joined
    assert "tool_activity" in joined

    # The tool was recorded with status "proposed" initially.
    assert acc.tool_calls["tc-1"].status == "proposed"


def test_requires_action_emits_one_confirmation_per_tool_call_id(monkeypatch):
    from app.services import operator_agent_gateway as op
    from app.services import operator_confirm_registry as reg

    monkeypatch.setattr(reg, "get_cursor", _noop_cursor)
    monkeypatch.setattr(op, "get_cursor", _noop_cursor)

    acc = op.TurnAccumulator()
    # Pre-record two tools, then issue a requires_action stop naming both ids.
    acc.record_tool_use(
        tool_call_id="tc-A",
        tool_name="repe.update_deal",
        tool_input={"deal_id": "d1", "stage": "won"},
        is_write=True,
    )
    acc.record_tool_use(
        tool_call_id="tc-B",
        tool_name="repe.update_deal",
        tool_input={"deal_id": "d2", "stage": "won"},
        is_write=True,
    )

    state = {}
    ring: list = []

    # Anthropic emits the stop_reason as a nested structure; sdk_to_dict on
    # a SimpleNamespace flattens via __dict__.
    stop_event = _ev(
        "session.status_idle",
        stop_reason={"type": "requires_action", "event_ids": ["tc-A", "tc-B"]},
    )

    lines = op._anthropic_event_to_sse(
        stop_event,
        accumulator=acc,
        anthropic_session_id="sess-1",
        conversation_id=uuid4(),
        business_id=uuid4(),
        env_id=None,
        state=state,
        last_events_ring=ring,
    )

    confirmations = [ln for ln in lines if ln.startswith("event: confirmation_required\n")]
    assert len(confirmations) == 2, f"expected 2 confirmation events, got {len(confirmations)}"

    # Each confirmation_required SSE carries its own tool_call_id (no cross-wiring).
    payloads = [json.loads(ln.split("data: ", 1)[1].strip()) for ln in confirmations]
    tcids = sorted([p["tool_call_id"] for p in payloads])
    assert tcids == ["tc-A", "tc-B"]

    # Both tool states flipped to awaiting_approval.
    assert acc.tool_calls["tc-A"].status == "awaiting_approval"
    assert acc.tool_calls["tc-B"].status == "awaiting_approval"


def test_session_error_is_non_recoverable_for_mcp_auth(monkeypatch):
    from app.services import operator_agent_gateway as op

    acc = op.TurnAccumulator()
    state = {}
    ring: list = []

    err_event = _ev(
        "session.error",
        error={"type": "mcp_authentication_failed_error", "message": "401 from MCP"},
    )

    lines = op._anthropic_event_to_sse(
        err_event,
        accumulator=acc,
        anthropic_session_id="sess-1",
        conversation_id=uuid4(),
        business_id=uuid4(),
        env_id=None,
        state=state,
        last_events_ring=ring,
    )

    payload_line = next(ln for ln in lines if "response_block" in ln)
    payload = json.loads(payload_line.split("data: ", 1)[1].strip())
    assert payload["block"]["type"] == "error"
    assert payload["block"]["recoverable"] is False
    assert state["session_error"]["type"] == "mcp_authentication_failed_error"


def test_session_error_is_recoverable_for_generic_error(monkeypatch):
    from app.services import operator_agent_gateway as op

    acc = op.TurnAccumulator()
    state = {}
    ring: list = []

    err_event = _ev(
        "session.error",
        error={"type": "transient_glitch", "message": "Try again"},
    )

    lines = op._anthropic_event_to_sse(
        err_event,
        accumulator=acc,
        anthropic_session_id="sess-1",
        conversation_id=uuid4(),
        business_id=uuid4(),
        env_id=None,
        state=state,
        last_events_ring=ring,
    )

    payload_line = next(ln for ln in lines if "response_block" in ln)
    payload = json.loads(payload_line.split("data: ", 1)[1].strip())
    assert payload["block"]["recoverable"] is True


def test_ring_buffer_caps_at_20_events(monkeypatch):
    from app.services import operator_agent_gateway as op

    acc = op.TurnAccumulator()
    state = {}
    ring: list = []

    for idx in range(35):
        op._anthropic_event_to_sse(
            _ev("session.status_running", id=f"e{idx}"),
            accumulator=acc,
            anthropic_session_id="sess-1",
            conversation_id=uuid4(),
            business_id=uuid4(),
            env_id=None,
            state=state,
            last_events_ring=ring,
        )

    assert len(ring) == 20
    # The ring keeps the most recent events.
    assert ring[-1]["id"] == "e34"
