"""Morning Checklist / Daily Operator Brief (Ticket 6).

Read-time-generated view over cro_execution_task — no persistence, no new
table, no schema change. Pulls real task data via execution_tasks.list_tasks
and buckets it into eight sections with transparent reasons. Honest empty
states throughout; no task or priority is fabricated.

Section taxonomy (matches dispatch 0002 / next-session.md):
  1. top_priorities       — Top priorities today
  2. overdue_follow_ups   — Overdue / stale follow-ups
  3. web_properties       — Website / content moves
  4. outreach_crm         — Outreach / CRM moves
  5. coding_platform      — Coding / Winston Platform moves
  6. admin_ops            — Admin / Accounting reminders
  7. waiting_blocked      — Waiting / blocked items
  8. suggested_prompts    — Suggested Claude / CoWork prompts (display-only)

Suggested prompts are grounded in real board state — only surfaced when
the matching condition is true. They do not execute anything (Ticket 7
will wire assistant retrieval; this ticket is display-only).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from app.services import execution_tasks


_TOP_PRIORITIES_LIMIT = 5
_PER_SECTION_LIMIT = 6
_REVENUE_RANK = {"high": 0, "mid": 1, "low": 2}


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _is_overdue(t: dict, today: date) -> bool:
    """Overdue only counts as a non-done task whose due_date has passed."""
    due = t.get("due_date")
    if not due or t.get("status") == "done":
        return False
    if isinstance(due, str):
        try:
            due = date.fromisoformat(due[:10])
        except ValueError:
            return False
    return due < today


def _is_blocked(t: dict, today: date) -> bool:
    """A waiting task with a blocked_reason, or whose re_engage_at is past."""
    if t.get("status") != "waiting":
        return False
    if t.get("blocked_reason"):
        return True
    re_engage = t.get("re_engage_at")
    if re_engage:
        if isinstance(re_engage, str):
            try:
                d = date.fromisoformat(re_engage[:10])
            except ValueError:
                return False
            return d <= today
        if isinstance(re_engage, datetime):
            return re_engage.date() <= today
    return False


def _project(t: dict, reason: str) -> dict:
    """Compact item shape for the brief. Mirrors the documented response."""
    return {
        "task_id": str(t["id"]),
        "title": t.get("title"),
        "reason": reason,
        "domain_key": t.get("domain_key"),
        "domain_label": t.get("domain_label"),
        "initiative_key": t.get("initiative_key"),
        "initiative_label": t.get("initiative_label"),
        "workstream_key": t.get("workstream_key"),
        "workstream_label": t.get("workstream_label"),
        "next_action": t.get("next_action"),
        "status": t.get("status"),
        "impact": t.get("impact"),
        "due_date": (
            t["due_date"].isoformat()
            if isinstance(t.get("due_date"), date)
            else t.get("due_date")
        ),
        "revenue_tag": t.get("revenue_tag"),
        "blocked_reason": t.get("blocked_reason"),
        "related_url": t.get("related_url"),
    }


def _sort_by_pressure(items: list[dict]) -> list[dict]:
    """Today first → high revenue → impact desc → earliest due_date → created."""

    def key(t: dict) -> tuple:
        st = 0 if t.get("status") == "today" else 1
        rev = _REVENUE_RANK.get(t.get("revenue_tag") or "mid", 2)
        impact = -(t.get("impact") or 0)
        due = str(t.get("due_date") or "9999-99-99")
        created = str(t.get("created_at") or "")
        return (st, rev, impact, due, created)

    return sorted(items, key=key)


def _section(key: str, label: str, items: list[dict]) -> dict:
    """Honest empty state: items=[] when nothing matches, never fabricated."""
    return {"key": key, "label": label, "items": items}


def _suggested_prompts(
    tasks: list[dict],
    overdue: list[dict],
    waiting_blocked: list[dict],
    web_property_tasks: list[dict],
    today: date,
) -> list[dict]:
    """Suggested Claude / CoWork prompts. Display-only this ticket.

    Each prompt is only included when the underlying board state actually
    contains the thing it would ask about — no prompts are fabricated.
    """
    suggestions: list[dict] = []
    today_count = sum(1 for t in tasks if t.get("status") == "today")
    if today_count > 0:
        suggestions.append(
            {
                "key": "what_first",
                "prompt": "What should I do first this morning?",
                "reason": f"{today_count} task(s) in TODAY",
            }
        )
    if overdue:
        suggestions.append(
            {
                "key": "overdue",
                "prompt": "What's overdue and most worth my time?",
                "reason": f"{len(overdue)} overdue follow-up(s)",
            }
        )
    if waiting_blocked:
        suggestions.append(
            {
                "key": "unblock",
                "prompt": "What's waiting on me and what's waiting on someone else?",
                "reason": f"{len(waiting_blocked)} waiting/blocked item(s)",
            }
        )
    if web_property_tasks:
        suggestions.append(
            {
                "key": "flowyorker",
                "prompt": "What FlowYorker / web-property moves are queued?",
                "reason": f"{len(web_property_tasks)} web-property task(s)",
            }
        )
    coding_count = sum(
        1 for t in tasks if t.get("domain_key") == "coding_platform"
    )
    if coding_count > 0:
        suggestions.append(
            {
                "key": "next_coding_ticket",
                "prompt": "What coding ticket is next?",
                "reason": f"{coding_count} coding task(s)",
            }
        )
    # Date-stamp avoids stale-prompt feel; never references content we don't have.
    _ = today  # kept for future date-aware prompt logic; unused for now
    return suggestions


def build_morning_checklist(*, env_id: str, business_id: UUID) -> dict:
    """Compose the Morning Brief from current task data. Read-only, fail-closed
    on empty board: returns sections with items=[] rather than erroring."""
    tasks = execution_tasks.list_tasks(
        env_id=env_id,
        business_id=business_id,
        include_archived_done=False,
    )
    today = _today()

    # ── Bucketing — a task can appear in multiple sections (priorities + its
    # domain section) because the brief is a *view*, not a partition. Honest
    # de-dup: items keep their identity via task_id so the UI can highlight.
    overdue = [t for t in tasks if _is_overdue(t, today)]
    waiting_blocked = [t for t in tasks if _is_blocked(t, today)]
    today_tasks = [t for t in tasks if t.get("status") == "today"]

    # Top priorities: today first, then overdue carried in by sort/pressure.
    top_pool = today_tasks + [t for t in overdue if t.get("status") != "today"]
    top_items: list[dict] = []
    seen: set[str] = set()
    for t in _sort_by_pressure(top_pool):
        tid = str(t["id"])
        if tid in seen:
            continue
        seen.add(tid)
        reason = (
            "Marked Today"
            if t.get("status") == "today"
            else "Due date has passed"
        )
        if (t.get("impact") or 0) >= 5 and t.get("status") == "today":
            reason = "High impact, Today"
        top_items.append(_project(t, reason))
        if len(top_items) >= _TOP_PRIORITIES_LIMIT:
            break

    overdue_items = [_project(t, "Due date has passed") for t in _sort_by_pressure(overdue)][
        :_PER_SECTION_LIMIT
    ]

    def _domain(d_key: str, reason: str) -> list[dict]:
        bucket = [t for t in tasks if t.get("domain_key") == d_key]
        return [
            _project(t, reason) for t in _sort_by_pressure(bucket)[:_PER_SECTION_LIMIT]
        ]

    web_property_items = _domain("web_properties", "FlowYorker / web-property task")
    outreach_items = _domain("outreach_crm", "Outreach follow-up")
    coding_items = _domain("coding_platform", "Coding platform task")
    admin_items = _domain("admin_ops", "Admin / accounting reminder")

    waiting_items: list[dict] = []
    for t in _sort_by_pressure(waiting_blocked):
        reason = (
            f"Waiting: {t.get('blocked_reason')}"
            if t.get("blocked_reason")
            else "Re-engage date reached"
        )
        waiting_items.append(_project(t, reason))
        if len(waiting_items) >= _PER_SECTION_LIMIT:
            break

    web_property_tasks_full = [
        t for t in tasks if t.get("domain_key") == "web_properties"
    ]
    suggested = _suggested_prompts(
        tasks, overdue, waiting_blocked, web_property_tasks_full, today
    )

    sections = [
        _section("top_priorities", "Top priorities today", top_items),
        _section("overdue_follow_ups", "Overdue / stale follow-ups", overdue_items),
        _section("web_properties", "Website / content moves", web_property_items),
        _section("outreach_crm", "Outreach / CRM moves", outreach_items),
        _section("coding_platform", "Coding / Winston Platform moves", coding_items),
        _section("admin_ops", "Admin / Accounting reminders", admin_items),
        _section("waiting_blocked", "Waiting / blocked items", waiting_items),
        _section(
            "suggested_prompts", "Suggested Claude / CoWork prompts", suggested
        ),
    ]

    summary: dict[str, Any] = {
        "total_items": sum(
            len(s["items"]) for s in sections if s["key"] != "suggested_prompts"
        ),
        "overdue_count": len(overdue),
        "blocked_count": len(waiting_blocked),
        "web_properties_count": len(web_property_tasks_full),
        "outreach_count": sum(
            1 for t in tasks if t.get("domain_key") == "outreach_crm"
        ),
        "coding_count": sum(
            1 for t in tasks if t.get("domain_key") == "coding_platform"
        ),
        "admin_count": sum(1 for t in tasks if t.get("domain_key") == "admin_ops"),
    }

    return {
        "date": today.isoformat(),
        "sections": sections,
        "summary": summary,
    }
