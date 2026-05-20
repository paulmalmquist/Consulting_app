"""Ticket 6 — Morning Checklist generated view.

Tests bucketing, ranking, honest empty states, and grounded suggested
prompts. The brief is a pure derivation over what execution_tasks.list_tasks
returns, so we mock that one function — no DB, no hang risk (tips #23).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4


from app.services import morning_checklist as mc

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
    """Synthetic task dict matching what list_tasks returns."""
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


def _build(tasks: list[dict]) -> dict:
    with patch.object(mc.execution_tasks, "list_tasks", return_value=tasks):
        return mc.build_morning_checklist(env_id=_ENV, business_id=_BIZ)


def _section(brief: dict, key: str) -> dict:
    return next(s for s in brief["sections"] if s["key"] == key)


# ── Empty board: honest empty state, not an error ───────────────────────────


def test_empty_board_returns_empty_sections_not_error():
    brief = _build([])
    assert brief["date"]  # ISO date string
    assert len(brief["sections"]) == 8  # all 8 sections present
    for s in brief["sections"]:
        assert s["items"] == [], f"section {s['key']} should be empty"
    assert brief["summary"]["total_items"] == 0
    assert brief["summary"]["overdue_count"] == 0


# ── Top priorities: today first, then overdue, deduped, capped ──────────────


def test_top_priorities_prefers_today_over_overdue():
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    today_task = _t(title="today task", status="today", impact=4)
    overdue_task = _t(
        title="overdue task", status="this_week", due_date=yesterday, impact=5
    )
    brief = _build([today_task, overdue_task])
    top = _section(brief, "top_priorities")["items"]
    assert top[0]["title"] == "today task"
    assert top[0]["reason"] == "Marked Today"
    assert top[1]["title"] == "overdue task"
    assert top[1]["reason"] == "Due date has passed"


def test_top_priorities_caps_at_five():
    tasks = [_t(title=f"t{i}", status="today") for i in range(10)]
    brief = _build(tasks)
    assert len(_section(brief, "top_priorities")["items"]) == 5


def test_top_priorities_dedups_when_task_is_both_today_and_overdue():
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    t = _t(title="today and overdue", status="today", due_date=yesterday)
    brief = _build([t])
    top = _section(brief, "top_priorities")["items"]
    # Task is "today" with a past due_date — listed once, reason = Marked Today.
    assert len(top) == 1
    assert top[0]["reason"] == "Marked Today"


# ── Overdue section ─────────────────────────────────────────────────────────


def test_overdue_section_filters_done_and_future_due():
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    overdue_real = _t(title="real overdue", status="this_week", due_date=yesterday)
    done_past = _t(title="done past", status="done", due_date=yesterday)
    future = _t(title="future", status="this_week", due_date=tomorrow)
    brief = _build([overdue_real, done_past, future])
    items = _section(brief, "overdue_follow_ups")["items"]
    titles = [i["title"] for i in items]
    assert titles == ["real overdue"]
    assert brief["summary"]["overdue_count"] == 1


# ── Domain sections: web/outreach/coding/admin ──────────────────────────────


def test_domain_sections_route_by_domain_key():
    tasks = [
        _t(title="flowyorker post", domain_key="web_properties",
           domain_label="Web Properties", initiative_key="flowyorker"),
        _t(title="reply to lead", domain_key="outreach_crm",
           domain_label="Outreach / CRM"),
        _t(title="fix bug", domain_key="coding_platform",
           domain_label="Coding / Winston Platform"),
        _t(title="file receipt", domain_key="admin_ops",
           domain_label="Admin / Accounting / Operations"),
        _t(title="ungrouped", domain_key=None),
    ]
    brief = _build(tasks)
    assert [i["title"] for i in _section(brief, "web_properties")["items"]] == [
        "flowyorker post"
    ]
    assert [i["title"] for i in _section(brief, "outreach_crm")["items"]] == [
        "reply to lead"
    ]
    assert [i["title"] for i in _section(brief, "coding_platform")["items"]] == [
        "fix bug"
    ]
    assert [i["title"] for i in _section(brief, "admin_ops")["items"]] == [
        "file receipt"
    ]
    # Ungrouped tasks DO appear in top_priorities (status=today by default) —
    # this is correct: NULL domain doesn't disqualify priority.
    top_titles = [i["title"] for i in _section(brief, "top_priorities")["items"]]
    assert "ungrouped" in top_titles


# ── Waiting / blocked ───────────────────────────────────────────────────────


def test_waiting_with_blocked_reason_appears_in_waiting_section():
    waiting = _t(
        title="waiting on reply",
        status="waiting",
        blocked_reason="waiting_on_reply",
    )
    not_waiting = _t(title="not waiting", status="today")
    brief = _build([waiting, not_waiting])
    items = _section(brief, "waiting_blocked")["items"]
    assert [i["title"] for i in items] == ["waiting on reply"]
    assert items[0]["reason"].startswith("Waiting:")
    assert brief["summary"]["blocked_count"] == 1


def test_waiting_with_past_re_engage_appears():
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    t = _t(title="re-engage due", status="waiting", re_engage_at=past)
    brief = _build([t])
    items = _section(brief, "waiting_blocked")["items"]
    assert [i["title"] for i in items] == ["re-engage due"]
    assert items[0]["reason"] == "Re-engage date reached"


# ── Suggested prompts: grounded in real state, never fabricated ─────────────


def test_suggested_prompts_only_when_supported_by_data():
    # Pure web-properties task only — should ground the flowyorker prompt
    # and the "what first" prompt (it's status=today), nothing else.
    t = _t(
        title="flowyorker work",
        status="today",
        domain_key="web_properties",
        initiative_key="flowyorker",
    )
    brief = _build([t])
    prompts = _section(brief, "suggested_prompts")["items"]
    keys = {p["key"] for p in prompts}
    assert "what_first" in keys
    assert "flowyorker" in keys
    # No overdue, no waiting/blocked, no coding → those prompts absent.
    assert "overdue" not in keys
    assert "unblock" not in keys
    assert "next_coding_ticket" not in keys


def test_empty_board_produces_no_suggested_prompts():
    brief = _build([])
    assert _section(brief, "suggested_prompts")["items"] == []


# ── Response shape contract ─────────────────────────────────────────────────


def test_response_shape_matches_documented_contract():
    """date + 8 sections + summary keys present; items match documented fields."""
    t = _t(title="x", status="today", impact=4)
    brief = _build([t])
    assert set(brief.keys()) == {"date", "sections", "summary"}
    section_keys = [s["key"] for s in brief["sections"]]
    assert section_keys == [
        "top_priorities",
        "overdue_follow_ups",
        "web_properties",
        "outreach_crm",
        "coding_platform",
        "admin_ops",
        "waiting_blocked",
        "suggested_prompts",
    ]
    expected_summary = {
        "total_items",
        "overdue_count",
        "blocked_count",
        "web_properties_count",
        "outreach_count",
        "coding_count",
        "admin_count",
    }
    assert set(brief["summary"].keys()) == expected_summary
    item = _section(brief, "top_priorities")["items"][0]
    # Documented item fields present
    for field in (
        "task_id",
        "title",
        "reason",
        "domain_key",
        "domain_label",
        "initiative_key",
        "initiative_label",
        "workstream_key",
        "workstream_label",
        "next_action",
        "status",
        "impact",
        "due_date",
    ):
        assert field in item, f"missing item field: {field}"
