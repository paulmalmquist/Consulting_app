"""Regression guard — repe_fast_path must never ship an empty 0-tool shell.

Context: docs/ai-testing/2026-03-21.md found that REPE data/dashboard queries
routed to repe_fast_path (Lane F) returned `tools=0, tokens=0` — a "COMPLETED"
dashboard shell with no data, ending in "No response from Winston". Root cause
(ADO #267): the INTENT_GENERATE_DASHBOARD branch composed widget *structure*
with no tool/data step, and the unhandled-intent `else` branch emitted "let me
use the full analysis pipeline instead" while the caller unconditionally
returned — so the promised fallback never ran.

The fix: intents the fast path cannot serve with real data (dashboard
composition, unhandled catch-all, pre-output error) yield
`_FAST_PATH_FALLTHROUGH` and return WITHOUT a `done` event, so the caller falls
through to the full LLM+tools pipeline.

These tests assert the ROUTING behavior (not the composer):
  - dashboard intent  -> fall through, NO `done` with an empty shell
  - unhandled intent  -> fall through
  - a real data intent -> still served by the fast path (no false fall-through)

This is the guard the composer-only test (test_repe_fast_path_nonempty.py)
could not provide: that test passes even when the bug is present, because the
bug was never "the composer returns no widgets" — it was "the fast path ships
those data-less widgets as a final answer".
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services import ai_gateway
from app.services.ai_gateway import _FAST_PATH_FALLTHROUGH, _run_repe_fast_path
from app.services.repe_intent import (
    INTENT_FUND_METRICS,
    INTENT_GENERATE_DASHBOARD,
    RepeIntent,
)


def _intent(family: str, message: str = "show me something") -> RepeIntent:
    return RepeIntent(family=family, confidence=0.95, original_message=message)


async def _drain(gen) -> list[str]:
    out = []
    async for line in gen:
        out.append(line)
    return out


def _events(lines: list[str]) -> list[str]:
    """Extract SSE event names from raw 'event: X\\ndata: {...}' lines."""
    names = []
    for ln in lines:
        for part in ln.split("\n"):
            if part.startswith("event:"):
                names.append(part.split(":", 1)[1].strip())
    return names


def _done_payloads(lines: list[str]) -> list[dict]:
    payloads = []
    for ln in lines:
        segs = ln.split("\n")
        is_done = any(s.strip() == "event: done" for s in segs)
        if not is_done:
            continue
        for s in segs:
            if s.startswith("data:"):
                try:
                    payloads.append(json.loads(s.split(":", 1)[1].strip()))
                except Exception:
                    pass
    return payloads


@pytest.fixture
def _fast_path_stubs():
    """Stub the heavy collaborators so the generator runs without a DB/LLM."""
    scenario = SimpleNamespace(
        env_id="env-1", business_id="biz-1", fund_id="fund-1",
        asset_id=None, quarter="2026Q2",
    )
    # extract_query_intent is imported inside the function from
    # app.services.query_intent and is a pure parser (no DB) — let it run real.
    # build_clarification_question reads scenario.missing_critical; a well-formed
    # scenario needs no clarification, so stub it to None.
    with patch.object(ai_gateway, "resolve_scenario_params", return_value=scenario), \
         patch.object(ai_gateway, "build_clarification_question", return_value=None), \
         patch.object(ai_gateway, "get_session", return_value={}), \
         patch.object(ai_gateway, "update_session", return_value=None):
        yield scenario


def _run(intent: RepeIntent):
    gen = _run_repe_fast_path(
        intent=intent,
        resolved_scope=SimpleNamespace(),
        context_envelope={},
        session_id="sess-1",
        conversation_id=None,
        scope_dump={},
        timings={},
        start=0.0,
        trace=SimpleNamespace(update=lambda **k: None),
        actor="tester",
    )
    import asyncio
    return asyncio.run(_drain(gen))


def test_dashboard_intent_falls_through_not_empty_shell(_fast_path_stubs):
    lines = _run(_intent(INTENT_GENERATE_DASHBOARD, "show me the top 5 assets by NOI"))
    # The control sentinel must be the terminal signal.
    assert _FAST_PATH_FALLTHROUGH in lines, (
        "dashboard intent must signal fall-through to the full pipeline"
    )
    # And it must NOT have emitted a `done` (which would be the empty 0-tool shell).
    assert "done" not in _events(lines), (
        "repe_fast_path regression: dashboard intent emitted a `done` event — "
        "that is the empty 0-tool shell bug (ADO #267 / docs/ai-testing/2026-03-21.md)."
    )
    # No dynamic_dashboard structured_result was shipped as a final answer.
    assert "structured_result" not in _events(lines)


def test_unhandled_intent_falls_through(_fast_path_stubs):
    # An intent with no fast-path branch lands in the catch-all `else`.
    lines = _run(_intent("some_unmapped_intent", "do a thing the fast path can't"))
    assert _FAST_PATH_FALLTHROUGH in lines
    assert "done" not in _events(lines), (
        "unhandled intent must fall through, not ship a 0-tool done event"
    )


def test_handled_data_intent_still_served_by_fast_path(_fast_path_stubs):
    """Guard against over-correction: a real data intent must NOT fall through.

    fund_metrics calls _exec_fast_tool; with a stubbed tool returning rows it
    should emit a `done` with tool_call_count > 0 (the healthy fast path).
    """
    async def _fake_exec(ctx, tool_name, args, tool_timeline, data_sources):
        tool_timeline.append({"tool": tool_name, "ok": True})
        data_sources.append(tool_name)
        return {"fund_id": "fund-1", "net_irr": 0.18, "rows": [{"k": "v"}]}

    with patch.object(ai_gateway, "_exec_fast_tool", side_effect=_fake_exec), \
         patch.object(ai_gateway, "_build_metrics_card", return_value={"metrics": [], "actions": []}), \
         patch.object(ai_gateway, "legacy_structured_result_to_blocks", return_value=[]):
        lines = _run(_intent(INTENT_FUND_METRICS, "what is the net IRR for this fund"))

    assert _FAST_PATH_FALLTHROUGH not in lines, (
        "a handled data intent must be served by the fast path, not fall through"
    )
    dones = _done_payloads(lines)
    assert dones, "handled intent must emit a `done` event"
    assert dones[-1]["trace"]["tool_call_count"] > 0, (
        "healthy fast path must report tool_call_count > 0 (real data fetched)"
    )
