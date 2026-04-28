"""Execution Board – AI action generator.

Produces a sequenced execution plan (not a brainstorm list) from either a deal
or a free-text goal. Output enforces:
  - at most 6 items total
  - at least one task in 'today'
  - at least one task with due_offset_days >= 2
  - distinct next_action strings across the batch
  - non-empty expected_outcome on every task
  - title contains a time estimate, e.g. "(15 min)"
  - no generic-verb-only titles ("Research", "Think", "Plan")
"""
from __future__ import annotations

import json
import re
from datetime import date, timedelta
from uuid import UUID

import openai

from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL_FAST
from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import execution_tasks


_MASTER_PROMPT = """You are an execution planner for a consulting/sales operator.
Your job is to convert a goal or a deal into a SEQUENCED PLAN of AT MOST 6
tasks that drive revenue, product, or delivery forward TODAY or THIS WEEK.

Hard rules — violating any is a failure:
- Output a sequence, not a brainstorm. Order matters and tasks must build on
  each other (t2 may depend on t1's result, etc.).
- Maximum 6 tasks. Fewer is fine. Five sharp tasks beats six padded ones.
- Every task must be doable in 30 MINUTES OR LESS. Express the estimate in
  the title in parentheses, e.g. "Find CFO email (15 min)".
- Every task MUST have a non-empty expected_outcome that is a concrete,
  measurable result (e.g. "CFO email address recorded in CRM" — NOT
  "better understanding of the contact").
- next_action must be a single concrete operator move (one verb, one object).
- title must include a real action object — never just "Research", "Think",
  "Plan", "Review", "Reflect", "Consider", "Explore", "Investigate" alone.
- At least one task with status='today' and due_offset_days=0.
- At least one task with due_offset_days >= 2.
- No two tasks may share the same next_action text.
- why_now must explain urgency, not restate the title.
- Prefer outreach, follow_up, proof_asset over research/product unless the
  goal explicitly demands the latter.

Allowed values:
- type: outreach | product | proof_asset | research | follow_up
- status: today | this_week
- impact: integer 1–5
- revenue_tag: low | mid | high
"""


_USER_TEMPLATE = """{context}

Generate UP TO 6 sequenced tasks (fewer is fine). Each task must be doable in
30 minutes or less, with the estimate visible in the title. Respond as JSON
only — no markdown, no prose.

Schema:
{{
  "tasks": [
    {{
      "sequence_position": 1,
      "title": "Find CFO email (15 min)",
      "next_action": "single concrete move",
      "why_now": "urgency reason",
      "expected_outcome": "concrete measurable result",
      "type": "outreach|product|proof_asset|research|follow_up",
      "status": "today|this_week",
      "impact": 1-5,
      "revenue_tag": "low|mid|high",
      "due_offset_days": 0
    }}
  ]
}}"""


# Title regex helpers for validation.
_TIME_ESTIMATE_RE = re.compile(r"\(\s*\d+\s*(?:min|m|minute|minutes)\s*\)", re.I)
_GENERIC_VERB_TITLES = {
    "research", "think", "plan", "review", "reflect", "consider",
    "explore", "investigate", "analyze", "brainstorm", "ideate",
    "study", "evaluate", "assess",
}


def _load_deal_context(*, deal_id: UUID, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT o.crm_opportunity_id AS deal_id, o.name AS deal_name,
                   o.amount, o.status, o.expected_close_date,
                   a.name AS account_name, a.industry,
                   ps.label AS stage_label, ps.key AS stage_key
              FROM crm_opportunity o
         LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
         LEFT JOIN crm_pipeline_stage ps ON ps.crm_pipeline_stage_id = o.crm_pipeline_stage_id
             WHERE o.crm_opportunity_id = %s
               AND o.business_id = %s
            """,
            (str(deal_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"deal {deal_id} not found")
        deal = dict(row)

        cur.execute(
            """
            SELECT MAX(activity_at) AS last_activity_at
              FROM crm_activity
             WHERE crm_opportunity_id = %s
            """,
            (str(deal_id),),
        )
        deal["last_activity_at"] = (cur.fetchone() or {}).get("last_activity_at")

        cur.execute(
            """
            SELECT MAX(ol.sent_at) AS last_outreach_at
              FROM cro_outreach_log ol
              JOIN crm_opportunity o ON o.crm_account_id = ol.crm_account_id
             WHERE o.crm_opportunity_id = %s
               AND ol.business_id = %s
            """,
            (str(deal_id), str(business_id)),
        )
        deal["last_outreach_at"] = (cur.fetchone() or {}).get("last_outreach_at")
        return deal


def _format_deal_context(deal: dict) -> str:
    return (
        f"DEAL CONTEXT\n"
        f"Name: {deal.get('deal_name', '?')}\n"
        f"Account: {deal.get('account_name', '?')}\n"
        f"Industry: {deal.get('industry', 'unknown')}\n"
        f"Stage: {deal.get('stage_label') or deal.get('stage_key') or 'unknown'}\n"
        f"Amount: ${float(deal.get('amount') or 0):,.0f}\n"
        f"Expected close: {deal.get('expected_close_date') or 'unknown'}\n"
        f"Last activity: {deal.get('last_activity_at') or 'none recorded'}\n"
        f"Last outreach: {deal.get('last_outreach_at') or 'none recorded'}\n"
    )


def _format_goal_context(goal: str) -> str:
    return f"GOAL\n{goal.strip()}"


def _coerce_due_date(offset_days) -> date | None:
    try:
        days = int(offset_days)
    except (TypeError, ValueError):
        return None
    if days < 0:
        days = 0
    return date.today() + timedelta(days=days)


def _normalize_items(raw_items: list[dict], *, linked_deal_id: UUID | None) -> list[dict]:
    """Ensure required fields, dedupe next_action, enforce sequence rules.

    Drops items that fail the tightened bar: missing expected_outcome,
    generic-verb-only title, or no time estimate.
    """
    items: list[dict] = []
    seen_next: set[str] = set()
    for idx, raw in enumerate(raw_items, start=1):
        title = str(raw.get("title") or "").strip()
        next_action = str(raw.get("next_action") or "").strip()
        why_now = str(raw.get("why_now") or "").strip()
        expected_outcome = str(raw.get("expected_outcome") or "").strip()
        if not (title and next_action and why_now and expected_outcome):
            continue

        # Reject titles that are only a generic verb (case-insensitive,
        # ignoring trailing punctuation/parens).
        title_core = re.sub(r"[\s\W_]+", " ", title).strip().lower()
        if title_core in _GENERIC_VERB_TITLES:
            continue

        # Require a time estimate. If the model forgot it, append a default.
        if not _TIME_ESTIMATE_RE.search(title):
            title = f"{title} (20 min)"

        key = next_action.lower()
        if key in seen_next:
            continue
        seen_next.add(key)

        type_ = str(raw.get("type") or "outreach").lower()
        if type_ not in {"outreach", "product", "proof_asset", "research", "follow_up"}:
            type_ = "outreach"
        status = str(raw.get("status") or "this_week").lower()
        if status not in {"today", "this_week"}:
            status = "this_week"

        impact_raw = raw.get("impact", 3)
        try:
            impact = int(impact_raw)
        except (TypeError, ValueError):
            impact = 3
        impact = max(1, min(5, impact))

        revenue_tag = str(raw.get("revenue_tag") or "mid").lower()
        if revenue_tag not in {"low", "mid", "high"}:
            revenue_tag = "mid"

        due_date_value = _coerce_due_date(raw.get("due_offset_days", 0))

        items.append({
            "sequence_position": int(raw.get("sequence_position", idx)),
            "title": title[:240],
            "next_action": next_action,
            "why_now": why_now,
            "expected_outcome": expected_outcome,
            "type": type_,
            "status": status,
            "impact": impact,
            "revenue_tag": revenue_tag,
            "due_date": due_date_value,
            "linked_deal_id": linked_deal_id,
        })

    items.sort(key=lambda x: x["sequence_position"])
    items = items[:6]
    if len(items) < 1:
        return []

    has_today = any(i["status"] == "today" for i in items)
    if not has_today:
        items[0]["status"] = "today"
        items[0]["due_date"] = date.today()

    has_later = any(
        i["due_date"] is not None and (i["due_date"] - date.today()).days >= 2
        for i in items
    )
    if not has_later and len(items) > 1:
        items[-1]["due_date"] = date.today() + timedelta(days=2)
        items[-1]["status"] = "this_week"

    return items


def generate_actions(
    *,
    env_id: str,
    business_id: UUID,
    deal_id: UUID | None = None,
    goal_text: str | None = None,
) -> dict:
    if deal_id is None and not (goal_text and goal_text.strip()):
        raise ValueError("either deal_id or goal_text is required")

    if deal_id is not None:
        deal = _load_deal_context(deal_id=deal_id, business_id=business_id)
        context = _format_deal_context(deal)
    else:
        context = _format_goal_context(goal_text or "")

    user_message = _USER_TEMPLATE.format(context=context)

    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_CHAT_MODEL_FAST,
        messages=[
            {"role": "system", "content": _MASTER_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_completion_tokens=1500,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {}

    raw_items = parsed.get("tasks") or []
    if not isinstance(raw_items, list):
        raw_items = []

    items = _normalize_items(raw_items, linked_deal_id=deal_id)
    if not items:
        raise ValueError("AI did not return any usable tasks")

    sequence_group, created = execution_tasks.create_ai_batch(
        env_id=env_id,
        business_id=business_id,
        items=items,
        linked_deal_id=deal_id,
    )

    emit_log(
        level="info",
        service="backend",
        action="execution.actions.generated",
        message=f"Generated {len(created)} sequenced tasks",
        context={
            "env_id": env_id,
            "deal_id": str(deal_id) if deal_id else None,
            "sequence_group": str(sequence_group),
            "task_count": len(created),
        },
    )

    return {"sequence_group": sequence_group, "tasks": created}
