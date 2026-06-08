"""Morning Brief Assistant — read-only retrieval over the Consulting Tasks
board and Morning Checklist (Ticket 7).

Answers the six canonical operator questions:
  1. "what should I do this morning?"
  2. "show my flowyorker tasks"
  3. "what outreach is overdue?"
  4. "what coding ticket is next?"
  5. "what's waiting or blocked?"
  6. "what should I ask claude code to work on next?"

Design — deliberately small surface:
  * No LLM call. A deterministic intent classifier picks a slice; the slice
    is rendered into a structured payload + a plain-text prose answer that
    is **derived entirely from real task data**. The data layer guarantees
    the facts; if a chat UI wants to polish prose later it can do that on
    top, but it must not fabricate.
  * No writes, no tool calls, no risky-action gating to engineer — there is
    no path for this surface to mutate anything by construction.
  * Fail-closed: env/business context unresolved → typed refusal, never a
    fabricated answer. Underlying brief/list_tasks failure → "unavailable"
    refusal with a safe error message (no stack trace).
  * Does NOT touch app.ai_gateway / `/api/ai/gateway/ask`. That surface is
    streaming + tool-using + 4500 LOC; expanding it for read-only retrieval
    would be the "broad assistant redesign" the ticket forbids.

The shipped contract is the service function `answer()`; the route exposes
it at `POST /api/consulting/execution/brief-assistant/ask`.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import UUID

from app.services import execution_tasks, morning_checklist


# ── Intent classification ───────────────────────────────────────────────────
# Deterministic keyword match. Order matters: most specific first. Falls back
# to the brief if nothing else applies. Never raises — unmatched yields the
# brief intent and the user still gets a useful, grounded answer.

_INTENTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "flowyorker",
        ("flowyorker", "flow yorker", "web propert", "website task"),
    ),
    (
        "outreach_overdue",
        ("outreach overdue", "overdue outreach", "stale outreach", "outreach is overdue"),
    ),
    (
        "next_coding",
        ("coding ticket", "coding task", "next coding", "winston platform task", "platform ticket"),
    ),
    (
        "waiting_blocked",
        ("waiting", "blocked", "stuck", "on hold"),
    ),
    (
        "ask_claude",
        ("ask claude", "ask cowork", "ask co-work", "cowork prompt", "claude code prompt"),
    ),
    (
        "morning_brief",
        (
            "this morning",
            "morning brief",
            "morning checklist",
            "what should i do",
            "what do i do",
            "what's on the board",
            "todays priorities",
            "today's priorities",
            "top priorities",
        ),
    ),
)


def classify_intent(question: str | None) -> str:
    """Return the intent key. Defaults to `morning_brief`."""
    if not question:
        return "morning_brief"
    q = question.strip().lower()
    if not q:
        return "morning_brief"
    for intent, needles in _INTENTS:
        if any(n in q for n in needles):
            return intent
    return "morning_brief"


# ── Slice helpers ───────────────────────────────────────────────────────────


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _is_overdue(t: dict, today: date) -> bool:
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


_REVENUE_RANK = {"high": 0, "mid": 1, "low": 2}


def _pressure_key(t: dict) -> tuple:
    st = 0 if t.get("status") == "today" else 1 if t.get("status") == "this_week" else 2
    rev = _REVENUE_RANK.get(t.get("revenue_tag") or "mid", 2)
    impact = -(t.get("impact") or 0)
    due = str(t.get("due_date") or "9999-99-99")
    created = str(t.get("created_at") or "")
    return (st, rev, impact, due, created)


def _project(t: dict) -> dict:
    """Compact task projection for assistant responses."""
    return {
        "task_id": str(t["id"]),
        "title": t.get("title"),
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


def _crumb(t: dict) -> str | None:
    d = t.get("domain_label") or t.get("domain_key")
    if not d:
        return None
    i = t.get("initiative_label") or t.get("initiative_key")
    if not i:
        return d
    return f"{d} → {i}"


# ── Prose rendering ─────────────────────────────────────────────────────────
# Plain text, no LLM. Each line is built from a real task field; never
# fabricate. Honest empty states; never offer generic productivity advice.


def _render_task_lines(items: list[dict]) -> list[str]:
    lines: list[str] = []
    for idx, t in enumerate(items, start=1):
        title = t.get("title") or "(no title)"
        lines.append(f"{idx}. {title}")
        crumb = _crumb(t)
        if crumb:
            lines.append(f"   {crumb}")
        next_action = t.get("next_action")
        lines.append(
            f"   Next action: {next_action}" if next_action else "   Next action: (none)"
        )
        why_bits: list[str] = []
        if t.get("status") == "today":
            why_bits.append("Marked Today")
        if t.get("status") == "waiting":
            why_bits.append("Waiting")
        if t.get("impact") and t["impact"] >= 4:
            why_bits.append(f"impact {t['impact']}")
        if t.get("due_date"):
            why_bits.append(f"due {t.get('due_date')}")
        if t.get("blocked_reason"):
            why_bits.append(f"blocked: {t['blocked_reason']}")
        if why_bits:
            lines.append(f"   Reason: {', '.join(why_bits)}")
    return lines


def _render_morning_brief(brief: dict) -> str:
    top = next(
        (s["items"] for s in brief["sections"] if s["key"] == "top_priorities"), []
    )
    waiting = next(
        (s["items"] for s in brief["sections"] if s["key"] == "waiting_blocked"), []
    )
    prompts = next(
        (s["items"] for s in brief["sections"] if s["key"] == "suggested_prompts"), []
    )
    parts: list[str] = [f"Morning Brief — {brief.get('date')}", ""]
    parts.append("Top priorities:")
    if top:
        parts.extend(_render_task_lines(top))
    else:
        parts.append("  Nothing in Today. Add a task or accept a Generate suggestion.")
    parts += ["", "Waiting / blocked:"]
    parts.append(
        "  No blocked tasks found."
        if not waiting
        else "\n".join(_render_task_lines(waiting))
    )
    if prompts:
        parts += ["", "Suggested CoWork prompts (display-only):"]
        for p in prompts:
            parts.append(f"  • {p.get('prompt')} ({p.get('reason')})")
    return "\n".join(parts)


def _render_domain_slice(label: str, items: list[dict]) -> str:
    if not items:
        return f"{label}: no matching tasks."
    return f"{label}:\n" + "\n".join(_render_task_lines(items))


# ── Public entrypoint ───────────────────────────────────────────────────────


class BriefAssistantError(RuntimeError):
    """Brief assistant could not produce a grounded answer. Surfaced as a
    clean refusal, never silently swallowed and never patched over with
    fabricated content."""


def answer(*, env_id: str, business_id: UUID, question: str | None) -> dict:
    """Answer a canonical operator question, grounded entirely in real task
    data. Returns a structured payload + a plain-text `answer` field.

    Read-only by construction — pulls via execution_tasks.list_tasks and
    morning_checklist.build_morning_checklist; never writes. Risky-action
    gating is N/A here: the function has no write capability at all.
    """
    intent = classify_intent(question)

    # All retrievals share the same source-of-truth call. If list_tasks
    # raises we let it bubble — the route maps to a clean refusal.
    tasks = execution_tasks.list_tasks(
        env_id=env_id,
        business_id=business_id,
        include_archived_done=False,
    )
    today = _today()

    if intent == "flowyorker":
        items = sorted(
            (
                t
                for t in tasks
                if t.get("domain_key") == "web_properties"
                and t.get("initiative_key") == "flowyorker"
            ),
            key=_pressure_key,
        )
        return _shape(
            intent,
            label="FlowYorker tasks",
            items=items,
            empty_msg=(
                "No FlowYorker tasks queued. Nothing assigned to "
                "Web Properties → FlowYorker.com."
            ),
            question=question,
        )

    if intent == "outreach_overdue":
        items = sorted(
            (
                t
                for t in tasks
                if t.get("domain_key") == "outreach_crm"
                and (_is_overdue(t, today) or _is_blocked(t, today))
            ),
            key=_pressure_key,
        )
        return _shape(
            intent,
            label="Overdue outreach",
            items=items,
            empty_msg="No overdue outreach. Clean follow-up queue.",
            question=question,
        )

    if intent == "next_coding":
        items = sorted(
            (
                t
                for t in tasks
                if t.get("domain_key") == "coding_platform"
                and t.get("status") in ("today", "this_week")
            ),
            key=_pressure_key,
        )
        return _shape(
            intent,
            label="Next coding tasks",
            items=items[:5],
            empty_msg=(
                "No Coding / Winston Platform tasks queued today or this week."
            ),
            question=question,
        )

    if intent == "waiting_blocked":
        items = sorted(
            (t for t in tasks if _is_blocked(t, today)),
            key=_pressure_key,
        )
        return _shape(
            intent,
            label="Waiting / blocked",
            items=items,
            empty_msg="No tasks are waiting or blocked.",
            question=question,
        )

    if intent == "ask_claude":
        # Grounded suggestion: the next coding-platform task (if any). We
        # produce a literal CoWork-style prompt referencing that real task —
        # display-only; this surface does not execute it.
        coding = sorted(
            (t for t in tasks if t.get("domain_key") == "coding_platform"),
            key=_pressure_key,
        )
        if not coding:
            return _refusal(
                intent,
                question=question,
                answer=(
                    "No grounded Claude Code prompt to suggest — there are no "
                    "Coding / Winston Platform tasks on the board right now."
                ),
            )
        t = coding[0]
        items = [t]
        prose = (
            "Suggested Claude Code prompt (display-only):\n"
            f'  "Pick up the next coding task: {t.get("title") or "(no title)"}. '
            f'Next action: {t.get("next_action") or "(none)"}."'
        )
        out = _shape(
            intent,
            label="Suggested Claude Code prompt",
            items=items,
            empty_msg="",  # already gated above
            question=question,
        )
        out["answer"] = prose
        return out

    # Default: full morning brief.
    brief = morning_checklist.build_morning_checklist(
        env_id=env_id, business_id=business_id
    )
    return {
        "intent": intent,
        "question": question,
        "answer": _render_morning_brief(brief),
        "brief": brief,
        "items": [],
        "tool_calls": [],
        "refused": False,
    }


def _shape(
    intent: str,
    *,
    label: str,
    items: list[dict],
    empty_msg: str,
    question: str | None,
) -> dict:
    projected = [_project(t) for t in items]
    if not items:
        prose = empty_msg
    else:
        prose = _render_domain_slice(label, items)
    return {
        "intent": intent,
        "question": question,
        "answer": prose,
        "items": projected,
        "tool_calls": [],  # no tools; explicit for the contract
        "refused": False,
    }


def _refusal(intent: str, *, question: str | None, answer: str) -> dict:
    """A grounded refusal — the brief assistant says it cannot answer without
    fabricating, instead of inventing a plausible-sounding reply."""
    return {
        "intent": intent,
        "question": question,
        "answer": answer,
        "items": [],
        "tool_calls": [],
        "refused": True,
    }
