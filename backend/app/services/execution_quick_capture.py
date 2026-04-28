"""Quick-capture: free-text → entity-resolved execution task.

Primary add path on the consulting Tasks page. Friction kills capture rate, so
the user types a single line ("Send follow-up to Marcus Partners"), hits Enter,
and the task lands in TODAY linked to the right account/contact when we can
find one.

Resolution pipeline:
  1. verb → action_type    (regex map)
  2. trailing noun phrase  → fuzzy match against crm_account / crm_contact
                              via pg_trgm similarity (>= 0.45)
  3. status='today', due=today, impact=3, revenue_tag='mid'

If TODAY is full, the task lands in THIS_WEEK instead — the user gets the task
captured rather than nothing. Frontend can detect via the returned task.status.
"""
from __future__ import annotations

import re
from datetime import date
from uuid import UUID

from app.db import get_cursor
from app.services import execution_tasks
from app.services.execution_tasks import TodayFullError


# Verb → action_type. First match wins. Default 'task' (which maps to
# cro_execution_task.type='outreach' since the schema's TYPE enum doesn't
# include 'task' — see _ALLOWED_TYPES in execution_tasks).
_VERB_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bfollow.?up\b", re.I), "follow_up"),
    (re.compile(r"\b(send|email|message|reach\s+out|outreach|intro)\b", re.I), "outreach"),
    (re.compile(r"\b(call|dial|phone|ring)\b", re.I), "outreach"),
    (re.compile(r"\b(meet|schedule|book|invite)\b", re.I), "outreach"),
    (re.compile(r"\b(research|investigate|look\s+up|find)\b", re.I), "research"),
    (re.compile(r"\b(draft|write|prepare|build|finish)\b.{0,40}\b(proposal|deck|asset|case)\b", re.I), "proof_asset"),
    (re.compile(r"\b(proposal|quote|estimate|sow)\b", re.I), "follow_up"),
]

# Strip leading verb phrases when extracting the entity name. Conservative —
# we want to leave the rest of the sentence intact for fuzzy matching.
_LEAD_STRIP = re.compile(
    r"^(send|email|call|dial|meet(?:ing)?\s+with|schedule|book|invite|"
    r"follow\s*up|reach\s+out|message|draft|write|prepare|finish|find|"
    r"research|investigate|look\s+up)\s+",
    re.I,
)
# After the verb, the entity usually follows a connector preposition.
_PREP_SPLIT = re.compile(r"\b(?:to|with|on|for|at|about)\b", re.I)


def _classify_action_type(text: str) -> str:
    for pattern, action_type in _VERB_RULES:
        if pattern.search(text):
            return action_type
    return "outreach"


def _extract_entity_query(text: str) -> str | None:
    """Pull the noun phrase that names the target entity, if any."""
    cleaned = _LEAD_STRIP.sub("", text.strip()).strip()
    if not cleaned:
        return None
    parts = _PREP_SPLIT.split(cleaned, maxsplit=1)
    candidate = parts[1].strip(" .,;:!?\"'") if len(parts) > 1 else cleaned.strip(" .,;:!?\"'")
    if len(candidate) < 3:
        return None
    return candidate


def _fuzzy_resolve_entity(*, business_id: UUID, query: str) -> dict | None:
    """Return best matching account or contact, score >= 0.45. None otherwise.

    Both tables are scanned in one round trip and the highest similarity wins.
    """
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")
        if not cur.fetchone():
            return None

        cur.execute(
            """
            SELECT 'account' AS entity_type,
                   crm_account_id AS entity_id,
                   name,
                   similarity(lower(name), lower(%s)) AS sim
              FROM crm_account
             WHERE business_id = %s
               AND similarity(lower(name), lower(%s)) >= 0.45
             UNION ALL
            SELECT 'contact' AS entity_type,
                   crm_contact_id AS entity_id,
                   full_name AS name,
                   similarity(lower(full_name), lower(%s)) AS sim
              FROM crm_contact
             WHERE business_id = %s
               AND similarity(lower(full_name), lower(%s)) >= 0.45
             ORDER BY sim DESC
             LIMIT 1
            """,
            (query, str(business_id), query, query, str(business_id), query),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "entity_type": row["entity_type"],
            "entity_id": str(row["entity_id"]),
            "name": row["name"],
            "confidence": float(row["sim"]),
        }


def _find_open_deal_for_account(*, business_id: UUID, crm_account_id: str) -> str | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT crm_opportunity_id
              FROM crm_opportunity
             WHERE business_id = %s
               AND crm_account_id = %s
               AND status = 'open'
             ORDER BY created_at DESC
             LIMIT 1
            """,
            (str(business_id), crm_account_id),
        )
        row = cur.fetchone()
        return str(row["crm_opportunity_id"]) if row else None


def _find_account_for_contact(*, business_id: UUID, crm_contact_id: str) -> str | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT crm_account_id
              FROM crm_contact
             WHERE crm_contact_id = %s AND business_id = %s
            """,
            (crm_contact_id, str(business_id)),
        )
        row = cur.fetchone()
        return str(row["crm_account_id"]) if row and row.get("crm_account_id") else None


def quick_capture(*, env_id: str, business_id: UUID, text: str) -> dict:
    """Parse the text, resolve entities, create the task. Returns {task, matched_entity}."""
    text = (text or "").strip()
    if not text:
        raise ValueError("text is required")

    action_type = _classify_action_type(text)
    entity_query = _extract_entity_query(text)
    matched: dict | None = (
        _fuzzy_resolve_entity(business_id=business_id, query=entity_query) if entity_query else None
    )

    linked_deal_id: UUID | None = None
    linked_contact_id: UUID | None = None
    if matched:
        if matched["entity_type"] == "account":
            deal = _find_open_deal_for_account(business_id=business_id, crm_account_id=matched["entity_id"])
            if deal:
                linked_deal_id = UUID(deal)
        elif matched["entity_type"] == "contact":
            linked_contact_id = UUID(matched["entity_id"])
            account_id = _find_account_for_contact(business_id=business_id, crm_contact_id=matched["entity_id"])
            if account_id:
                deal = _find_open_deal_for_account(business_id=business_id, crm_account_id=account_id)
                if deal:
                    linked_deal_id = UUID(deal)

    title = text[:140].strip() or "Quick task"
    title = title[0].upper() + title[1:] if title else title
    next_action = text.strip()
    why_now = "Captured from quick-add."
    due = date.today()

    # Try TODAY first, fall back to THIS_WEEK if the cap is hit. The user gets
    # capture either way — better to land in this_week than to lose the input.
    try:
        task = execution_tasks.create_task(
            env_id=env_id,
            business_id=business_id,
            title=title,
            next_action=next_action,
            why_now=why_now,
            type=action_type,
            status="today",
            linked_deal_id=linked_deal_id,
            linked_contact_id=linked_contact_id,
            impact=3,
            revenue_tag="mid",
            due_date=due,
            auto_source="quick_capture",
        )
    except TodayFullError:
        task = execution_tasks.create_task(
            env_id=env_id,
            business_id=business_id,
            title=title,
            next_action=next_action,
            why_now=why_now,
            type=action_type,
            status="this_week",
            linked_deal_id=linked_deal_id,
            linked_contact_id=linked_contact_id,
            impact=3,
            revenue_tag="mid",
            due_date=due,
            auto_source="quick_capture",
        )

    return {"task": task, "matched_entity": matched}
