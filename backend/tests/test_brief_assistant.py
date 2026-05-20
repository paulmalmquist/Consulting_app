"""Ticket 7 — Morning Brief Assistant read-only retrieval.

Covers the six canonical questions, honest empty states, intent
classification, and the read-only invariant (no tool calls, no writes).
DB-free: mocks execution_tasks.list_tasks and (when needed)
morning_checklist.build_morning_checklist. Per tips #23, no DB fixtures.
"""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4


from app.services import brief_assistant as ba

_ENV = "envX"
_BIZ = uuid4()


def _t(
    *,
    title: str,
    status: str = "today",
    impact: int = 3,
    revenue_tag: str = "mid",
    due_date=None,
    domain_key: str | None = None,
    domain_label: str | None = None,
    initiative_key: str | None = None,
    initiative_label: str | None = None,
    workstream_key: str | None = None,
    workstream_label: str | None = None,
    next_action: str = "do it",
    blocked_reason: str | None = None,
    re_engage_at=None,
) -> dict:
    return {
        "id": uuid4(),
        "env_id": _ENV,
        "business_id": _BIZ,
        "title": title,
        "status": status,
        "impact": impact,
        "revenue_tag": revenue_tag,
        "due_date": due_date,
        "domain_key": domain_key,
        "domain_label": domain_label,
        "initiative_key": initiative_key,
        "initiative_label": initiative_label,
        "workstream_key": workstream_key,
        "workstream_label": workstream_label,
        "next_action": next_action,
        "blocked_reason": blocked_reason,
        "re_engage_at": re_engage_at,
        "created_at": "2026-05-01T00:00:00Z",
        "related_url": None,
    }


def _ask(question: str | None, tasks: list[dict], *, brief: dict | None = None) -> dict:
    """Call ba.answer with both upstreams mocked. Defaults the brief to an
    empty-shape minimum so morning_brief intent doesn't error."""
    if brief is None:
        brief = {
            "date": date.today().isoformat(),
            "sections": [
                {"key": "top_priorities", "label": "Top priorities today", "items": []},
                {"key": "overdue_follow_ups", "label": "Overdue / stale follow-ups", "items": []},
                {"key": "web_properties", "label": "Website / content moves", "items": []},
                {"key": "outreach_crm", "label": "Outreach / CRM moves", "items": []},
                {"key": "coding_platform", "label": "Coding / Winston Platform moves", "items": []},
                {"key": "admin_ops", "label": "Admin / Accounting reminders", "items": []},
                {"key": "waiting_blocked", "label": "Waiting / blocked items", "items": []},
                {"key": "suggested_prompts", "label": "Suggested Claude / CoWork prompts", "items": []},
            ],
            "summary": {
                "total_items": 0, "overdue_count": 0, "blocked_count": 0,
                "web_properties_count": 0, "outreach_count": 0,
                "coding_count": 0, "admin_count": 0,
            },
        }
    with patch.object(ba.execution_tasks, "list_tasks", return_value=tasks), \
         patch.object(ba.morning_checklist, "build_morning_checklist", return_value=brief):
        return ba.answer(env_id=_ENV, business_id=_BIZ, question=question)


# ── Intent classification ───────────────────────────────────────────────────


def test_classify_intents_routes_canonical_questions():
    assert ba.classify_intent("What should I do this morning?") == "morning_brief"
    assert ba.classify_intent("Show my FlowYorker tasks.") == "flowyorker"
    assert ba.classify_intent("What outreach is overdue?") == "outreach_overdue"
    assert ba.classify_intent("What coding ticket is next?") == "next_coding"
    assert ba.classify_intent("What's waiting or blocked?") == "waiting_blocked"
    assert ba.classify_intent("What should I ask Claude Code next?") == "ask_claude"


def test_classify_intent_empty_question_defaults_to_brief():
    assert ba.classify_intent(None) == "morning_brief"
    assert ba.classify_intent("") == "morning_brief"
    assert ba.classify_intent("   ") == "morning_brief"


def test_classify_intent_unknown_question_defaults_to_brief():
    """An unrecognized question should still produce a grounded answer
    (the brief), not silently misroute or fabricate."""
    assert ba.classify_intent("random unrelated text") == "morning_brief"


# ── FlowYorker slice ────────────────────────────────────────────────────────


def test_flowyorker_question_returns_only_flowyorker_tasks():
    fy = _t(
        title="Update FlowYorker homepage",
        domain_key="web_properties",
        domain_label="Web Properties",
        initiative_key="flowyorker",
        initiative_label="FlowYorker.com",
        workstream_key="content_seo",
    )
    other = _t(title="unrelated coding task", domain_key="coding_platform")
    res = _ask("Show my FlowYorker tasks.", [fy, other])
    assert res["intent"] == "flowyorker"
    assert [i["title"] for i in res["items"]] == ["Update FlowYorker homepage"]
    assert "Update FlowYorker homepage" in res["answer"]
    assert "Web Properties → FlowYorker.com" in res["answer"]
    assert res["refused"] is False
    assert res["tool_calls"] == []


def test_flowyorker_empty_state_is_honest_not_fabricated():
    other = _t(title="not a website task", domain_key="outreach_crm")
    res = _ask("Show my FlowYorker tasks.", [other])
    assert res["items"] == []
    assert "No FlowYorker tasks queued" in res["answer"]
    # Must not pull from unrelated domains as a fallback.
    assert "outreach" not in res["answer"].lower()


# ── Outreach overdue slice ──────────────────────────────────────────────────


def test_outreach_overdue_filters_to_overdue_or_blocked_outreach_only():
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    overdue_outreach = _t(
        title="overdue lead reply",
        status="this_week",
        domain_key="outreach_crm",
        due_date=yesterday,
    )
    on_time_outreach = _t(
        title="on-time outreach",
        status="this_week",
        domain_key="outreach_crm",
        due_date=(date.today() + timedelta(days=2)).isoformat(),
    )
    overdue_coding = _t(
        title="overdue coding",
        status="this_week",
        domain_key="coding_platform",
        due_date=yesterday,
    )
    res = _ask("What outreach is overdue?", [overdue_outreach, on_time_outreach, overdue_coding])
    titles = [i["title"] for i in res["items"]]
    assert titles == ["overdue lead reply"]


def test_outreach_overdue_empty_state():
    res = _ask("What outreach is overdue?", [])
    assert res["items"] == []
    assert "No overdue outreach" in res["answer"]


# ── Next coding slice ───────────────────────────────────────────────────────


def test_next_coding_returns_coding_today_or_this_week_only():
    t_today = _t(
        title="fix the bug",
        status="today",
        domain_key="coding_platform",
        impact=4,
    )
    t_this_week = _t(
        title="refactor module",
        status="this_week",
        domain_key="coding_platform",
        impact=3,
    )
    t_waiting = _t(
        title="waiting deploy",
        status="waiting",
        domain_key="coding_platform",
    )
    t_outreach = _t(title="not coding", status="today", domain_key="outreach_crm")
    res = _ask("What coding ticket is next?", [t_today, t_this_week, t_waiting, t_outreach])
    titles = [i["title"] for i in res["items"]]
    # Today first, then this_week. Waiting and non-coding excluded.
    assert titles == ["fix the bug", "refactor module"]


def test_next_coding_empty_state():
    res = _ask("What coding ticket is next?", [])
    assert res["items"] == []
    assert "No Coding / Winston Platform tasks" in res["answer"]


# ── Waiting / blocked slice ─────────────────────────────────────────────────


def test_waiting_blocked_filters_correctly():
    blocked = _t(
        title="waiting on reply",
        status="waiting",
        blocked_reason="waiting_on_reply",
    )
    today_task = _t(title="not waiting", status="today")
    res = _ask("What's waiting or blocked?", [blocked, today_task])
    titles = [i["title"] for i in res["items"]]
    assert titles == ["waiting on reply"]


def test_waiting_blocked_empty_state():
    res = _ask("What's waiting or blocked?", [])
    assert res["items"] == []
    assert "No tasks are waiting or blocked" in res["answer"]


# ── Ask Claude (grounded CoWork prompt) ─────────────────────────────────────


def test_ask_claude_grounds_in_real_coding_task():
    t = _t(
        title="fix consulting bug",
        domain_key="coding_platform",
        next_action="Open consulting.py and patch the off-by-one.",
        impact=4,
    )
    res = _ask("What should I ask Claude Code to work on next?", [t])
    assert res["intent"] == "ask_claude"
    assert res["refused"] is False
    assert "fix consulting bug" in res["answer"]
    # Must echo the real next_action — no fabricated instruction.
    assert "off-by-one" in res["answer"]


def test_ask_claude_refuses_when_no_coding_task_exists():
    """Grounded refusal — no generic productivity advice."""
    other = _t(title="ungrouped", domain_key=None)
    res = _ask("What should I ask Claude Code to work on next?", [other])
    assert res["refused"] is True
    assert res["items"] == []
    # Honest reason, not invented prompt.
    assert "No grounded Claude Code prompt" in res["answer"]


# ── Morning brief intent ────────────────────────────────────────────────────


def test_morning_brief_renders_top_priorities_from_real_brief():
    brief = {
        "date": "2026-05-20",
        "sections": [
            {
                "key": "top_priorities",
                "label": "Top priorities today",
                "items": [
                    {
                        "task_id": "abc",
                        "title": "Check NCF proposal",
                        "reason": "Marked Today",
                        "domain_key": "web_properties",
                        "domain_label": "Web Properties",
                        "initiative_key": "flowyorker",
                        "initiative_label": "FlowYorker.com",
                        "workstream_key": None,
                        "workstream_label": None,
                        "next_action": "Send follow-up email",
                        "status": "today",
                        "impact": 5,
                        "due_date": None,
                        "revenue_tag": "high",
                        "blocked_reason": None,
                        "related_url": None,
                    }
                ],
            },
            {"key": "overdue_follow_ups", "label": "x", "items": []},
            {"key": "web_properties", "label": "x", "items": []},
            {"key": "outreach_crm", "label": "x", "items": []},
            {"key": "coding_platform", "label": "x", "items": []},
            {"key": "admin_ops", "label": "x", "items": []},
            {"key": "waiting_blocked", "label": "x", "items": []},
            {"key": "suggested_prompts", "label": "x", "items": []},
        ],
        "summary": {
            "total_items": 1, "overdue_count": 0, "blocked_count": 0,
            "web_properties_count": 1, "outreach_count": 0,
            "coding_count": 0, "admin_count": 0,
        },
    }
    res = _ask("What should I do this morning?", [], brief=brief)
    assert res["intent"] == "morning_brief"
    assert "Morning Brief — 2026-05-20" in res["answer"]
    assert "Check NCF proposal" in res["answer"]
    assert "Web Properties → FlowYorker.com" in res["answer"]
    assert "Send follow-up email" in res["answer"]
    # Should include the brief payload for clients that want structured data.
    assert res["brief"] is not None
    assert res["brief"]["summary"]["web_properties_count"] == 1


def test_morning_brief_with_empty_brief_says_so_honestly():
    res = _ask("What should I do this morning?", [])
    assert res["intent"] == "morning_brief"
    assert "Nothing in Today" in res["answer"]
    # Never offer generic productivity advice.
    assert "productivity" not in res["answer"].lower()
    assert "best practices" not in res["answer"].lower()


# ── Read-only invariants ────────────────────────────────────────────────────


def test_every_intent_returns_empty_tool_calls_no_writes():
    """No intent path is allowed to emit tool calls (read-only by construction).

    This is the explicit acceptance test for "no mutation/write tool is
    invoked" — the response contract has tool_calls: [] always."""
    samples = [
        ("What should I do this morning?", []),
        ("Show my FlowYorker tasks.", []),
        ("What outreach is overdue?", []),
        ("What coding ticket is next?", []),
        ("What's waiting or blocked?", []),
        ("What should I ask Claude Code next?", []),
        ("random text", []),
    ]
    for q, tasks in samples:
        res = _ask(q, tasks)
        assert res["tool_calls"] == [], f"intent for q={q!r} emitted tool_calls"
        # Also: no field in the projection should be a write directive.
        assert "writes" not in str(res).lower() or "no writes" in str(res).lower()


def test_brief_assistant_module_has_no_writer_imports():
    """Defense-in-depth: the module must not import anything that could
    write to cro_execution_task. If a future refactor accidentally adds one
    we want a loud test failure, not a silent capability expansion."""
    import inspect
    src = inspect.getsource(ba)
    # The service may call list_tasks and build_morning_checklist — both
    # read-only — but must not reference any update/create/delete entrypoint
    # by name.
    forbidden = ("create_task", "update_task", "delete_task", "complete_task")
    for name in forbidden:
        assert name not in src, (
            f"brief_assistant.py references writer `{name}` — Ticket 7 must "
            f"remain read-only. If this is intentional, gate it explicitly."
        )
