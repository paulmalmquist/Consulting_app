"""Consulting Revenue OS – Entity detail service.

Provides detail views for accounts, contacts, and opportunities
with related sub-entities (contacts, opportunities, activities, proposals).
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from app.db import get_cursor


def get_account_detail(*, env_id: str, business_id: UUID, account_id: UUID) -> dict:
    """Get a single CRM account with its lead profile extension."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT a.crm_account_id, a.name AS company_name, a.industry, a.website,
                   a.account_type, a.annual_revenue, a.employee_count, a.created_at,
                   p.id AS lead_profile_id, p.ai_maturity, p.pain_category,
                   p.lead_score, p.score_breakdown, p.pipeline_stage,
                   p.lead_source, p.company_size, p.revenue_band, p.erp_system,
                   p.estimated_budget, p.qualified_at, p.disqualified_at
            FROM crm_account a
            LEFT JOIN cro_lead_profile p ON p.crm_account_id = a.crm_account_id
            WHERE a.crm_account_id = %s AND a.business_id = %s
            """,
            (str(account_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Account {account_id} not found")
        return row


def get_account_contacts(*, business_id: UUID, account_id: UUID) -> list[dict]:
    """Get all contacts for a CRM account."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT c.crm_contact_id, c.full_name, c.email, c.phone, c.title,
                   cp.linkedin_url, cp.relationship_strength, cp.decision_role,
                   cp.last_outreach_at, c.created_at
            FROM crm_contact c
            LEFT JOIN cro_contact_profile cp ON cp.crm_contact_id = c.crm_contact_id
            WHERE c.crm_account_id = %s AND c.business_id = %s
            ORDER BY c.created_at DESC
            """,
            (str(account_id), str(business_id)),
        )
        return cur.fetchall()


def get_account_opportunities(*, business_id: UUID, account_id: UUID) -> list[dict]:
    """Get all opportunities for a CRM account."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT o.crm_opportunity_id, o.name, o.amount, o.status,
                   o.expected_close_date, o.created_at,
                   s.key AS stage_key, s.label AS stage_label,
                   s.win_probability
            FROM crm_opportunity o
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            WHERE o.crm_account_id = %s AND o.business_id = %s
            ORDER BY o.created_at DESC
            """,
            (str(account_id), str(business_id)),
        )
        return cur.fetchall()


def get_opportunity_detail(*, business_id: UUID, opportunity_id: UUID) -> dict:
    """Get a single opportunity with account and stage info."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT o.crm_opportunity_id, o.name, o.amount, o.status,
                   o.expected_close_date, o.created_at, o.crm_account_id,
                   o.close_reason, o.competitive_incumbent, o.close_notes, o.closed_at,
                   a.name AS account_name, a.industry AS account_industry,
                   s.key AS stage_key, s.label AS stage_label,
                   s.win_probability, s.stage_order
            FROM crm_opportunity o
            LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            WHERE o.crm_opportunity_id = %s AND o.business_id = %s
            """,
            (str(opportunity_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Opportunity {opportunity_id} not found")
        return row


def get_opportunity_contacts(*, business_id: UUID, opportunity_id: UUID) -> list[dict]:
    """Get contacts linked to an opportunity.

    Prefers explicit cro_opportunity_contact links; falls back to all account
    contacts when no explicit links exist (backward compat).
    """
    with get_cursor() as cur:
        # Try explicit junction links first
        cur.execute(
            """
            SELECT c.crm_contact_id, c.full_name, c.email, c.phone, c.title,
                   cp.linkedin_url, cp.relationship_strength, cp.decision_role,
                   cp.last_outreach_at, c.created_at,
                   oc.role_on_deal, oc.influence_level, oc.is_primary, oc.link_source
            FROM cro_opportunity_contact oc
            JOIN crm_contact c ON c.crm_contact_id = oc.crm_contact_id
            LEFT JOIN cro_contact_profile cp ON cp.crm_contact_id = c.crm_contact_id
            WHERE oc.crm_opportunity_id = %s AND oc.business_id = %s AND oc.is_active = true
            ORDER BY oc.is_primary DESC, c.full_name ASC
            """,
            (str(opportunity_id), str(business_id)),
        )
        explicit = cur.fetchall()
        if explicit:
            return explicit

        # Fallback: all contacts on the account
        cur.execute(
            "SELECT crm_account_id FROM crm_opportunity WHERE crm_opportunity_id = %s AND business_id = %s",
            (str(opportunity_id), str(business_id)),
        )
        opp = cur.fetchone()
        if not opp or not opp["crm_account_id"]:
            return []

        cur.execute(
            """
            SELECT c.crm_contact_id, c.full_name, c.email, c.phone, c.title,
                   cp.linkedin_url, cp.relationship_strength, cp.decision_role,
                   cp.last_outreach_at, c.created_at,
                   NULL::text AS role_on_deal, NULL::text AS influence_level,
                   false AS is_primary, 'account_fallback'::text AS link_source
            FROM crm_contact c
            LEFT JOIN cro_contact_profile cp ON cp.crm_contact_id = c.crm_contact_id
            WHERE c.crm_account_id = %s AND c.business_id = %s
            ORDER BY c.created_at DESC
            """,
            (str(opp["crm_account_id"]), str(business_id)),
        )
        return cur.fetchall()


def get_opportunity_stage_history(*, business_id: UUID, opportunity_id: UUID) -> list[dict]:
    """Get stage transition history for an opportunity."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT h.id, h.changed_at, h.note,
                   fs.key AS from_stage_key, fs.label AS from_stage_label,
                   ts.key AS to_stage_key, ts.label AS to_stage_label
            FROM crm_opportunity_stage_history h
            LEFT JOIN crm_pipeline_stage fs ON fs.crm_pipeline_stage_id = h.from_stage_id
            LEFT JOIN crm_pipeline_stage ts ON ts.crm_pipeline_stage_id = h.to_stage_id
            WHERE h.crm_opportunity_id = %s AND h.business_id = %s
            ORDER BY h.changed_at DESC
            """,
            (str(opportunity_id), str(business_id)),
        )
        return cur.fetchall()


def get_contact_detail(*, business_id: UUID, contact_id: UUID) -> dict:
    """Get a single contact with account and profile extension."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT c.crm_contact_id, c.full_name, c.email, c.phone, c.title,
                   c.crm_account_id, c.created_at,
                   c.execution_status, c.unassigned_reason,
                   a.name AS account_name, a.industry AS account_industry,
                   cp.linkedin_url, cp.relationship_strength, cp.decision_role,
                   cp.last_outreach_at, cp.notes AS profile_notes,
                   cp.preferred_channel, cp.buyer_persona, cp.headline,
                   cp.do_not_contact, cp.contact_owner
            FROM crm_contact c
            LEFT JOIN crm_account a ON a.crm_account_id = c.crm_account_id
            LEFT JOIN cro_contact_profile cp ON cp.crm_contact_id = c.crm_contact_id
            WHERE c.crm_contact_id = %s AND c.business_id = %s
            """,
            (str(contact_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Contact {contact_id} not found")
        return row


def list_contacts(
    *,
    env_id: str,
    business_id: UUID,
    search: str | None = None,
    account_id: UUID | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """List all contacts for a business with optional search and account filter."""
    with get_cursor() as cur:
        conditions = ["c.business_id = %s"]
        params: list = [str(business_id)]

        if account_id is not None:
            conditions.append("c.crm_account_id = %s")
            params.append(str(account_id))

        if search:
            conditions.append(
                "(c.full_name ILIKE %s OR c.email ILIKE %s OR c.title ILIKE %s OR a.name ILIKE %s)"
            )
            term = f"%{search}%"
            params.extend([term, term, term, term])

        where = " AND ".join(conditions)

        cur.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM crm_contact c
            LEFT JOIN crm_account a ON a.crm_account_id = c.crm_account_id
            WHERE {where}
            """,
            params,
        )
        total = cur.fetchone()["total"]

        cur.execute(
            f"""
            SELECT c.crm_contact_id, c.full_name, c.email, c.phone, c.title,
                   c.crm_account_id, c.created_at,
                   c.execution_status, c.unassigned_reason,
                   a.name AS account_name, a.industry AS vertical,
                   cp.linkedin_url, cp.relationship_strength, cp.decision_role,
                   cp.last_outreach_at, cp.notes AS profile_notes,
                   cp.do_not_contact, cp.preferred_channel
            FROM crm_contact c
            LEFT JOIN crm_account a ON a.crm_account_id = c.crm_account_id
            LEFT JOIN cro_contact_profile cp ON cp.crm_contact_id = c.crm_contact_id
            WHERE {where}
            ORDER BY
              CASE c.execution_status WHEN 'needs_action' THEN 0 ELSE 1 END ASC,
              c.created_at DESC
            LIMIT %s OFFSET %s
            """,
            params + [limit, offset],
        )
        rows = cur.fetchall()
        return {"contacts": rows, "total": total}


def create_contact(
    *,
    env_id: str,
    business_id: UUID,
    crm_account_id: UUID | None,
    full_name: str,
    email: str | None = None,
    phone: str | None = None,
    title: str | None = None,
    linkedin_url: str | None = None,
    relationship_strength: str | None = None,
    decision_role: str | None = None,
    notes: str | None = None,
) -> dict:
    from app.services.reporting_common import resolve_tenant_id
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            INSERT INTO crm_contact (tenant_id, business_id, crm_account_id, full_name, email, phone, title)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING crm_contact_id, full_name, email, phone, title, created_at
            """,
            (
                tenant_id, str(business_id),
                str(crm_account_id) if crm_account_id else None,
                full_name, email, phone, title,
            ),
        )
        row = cur.fetchone()
        contact_id = str(row["crm_contact_id"])
        if linkedin_url or relationship_strength or decision_role or notes:
            cur.execute(
                """
                INSERT INTO cro_contact_profile
                  (crm_contact_id, env_id, business_id, linkedin_url, relationship_strength, decision_role, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (crm_contact_id) DO UPDATE
                  SET linkedin_url         = EXCLUDED.linkedin_url,
                      relationship_strength = EXCLUDED.relationship_strength,
                      decision_role         = EXCLUDED.decision_role,
                      notes                 = EXCLUDED.notes
                """,
                (
                    contact_id, env_id, str(business_id),
                    linkedin_url, relationship_strength, decision_role, notes,
                ),
            )
        result = {
            "crm_contact_id": contact_id,
            "full_name": row["full_name"],
            "email": row["email"],
            "phone": row["phone"],
            "title": row["title"],
            "linkedin_url": linkedin_url,
            "relationship_strength": relationship_strength,
            "decision_role": decision_role,
            "created_at": str(row["created_at"]),
        }

    evaluate_contact_execution_status(contact_id=UUID(contact_id), business_id=business_id)
    return result


def get_contact_outreach_history(*, business_id: UUID, contact_id: UUID) -> list[dict]:
    """Get outreach log entries for a specific contact."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT o.id, o.channel, o.direction, o.subject, o.body_preview,
                   o.sent_at, o.replied_at, o.reply_sentiment,
                   o.meeting_booked, o.sent_by
            FROM cro_outreach_log o
            WHERE o.crm_contact_id = %s AND o.business_id = %s
            ORDER BY o.sent_at DESC
            LIMIT 50
            """,
            (str(contact_id), str(business_id)),
        )
        return cur.fetchall()


# ---------------------------------------------------------------------------
# Execution engine — new functions
# ---------------------------------------------------------------------------

def evaluate_contact_execution_status(*, contact_id: UUID, business_id: UUID) -> str:
    """Recompute and persist execution_status for a contact. Returns the new status."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT do_not_contact FROM cro_contact_profile WHERE crm_contact_id = %s",
            (str(contact_id),),
        )
        profile = cur.fetchone()
        do_not_contact = profile["do_not_contact"] if profile else False

        if do_not_contact:
            new_status = "do_not_contact"
        else:
            cur.execute(
                """
                SELECT EXISTS (
                    SELECT 1 FROM cro_opportunity_contact
                    WHERE crm_contact_id = %s AND business_id = %s AND is_active = true
                ) AS has_deal
                """,
                (str(contact_id), str(business_id)),
            )
            has_deal = cur.fetchone()["has_deal"]

            cur.execute(
                """
                SELECT EXISTS (
                    SELECT 1 FROM cro_next_action
                    WHERE entity_type = 'contact' AND entity_id = %s
                      AND business_id = %s AND status IN ('pending', 'in_progress')
                ) AS has_action
                """,
                (str(contact_id), str(business_id)),
            )
            has_action = cur.fetchone()["has_action"]

            new_status = "active" if (has_deal and has_action) else "needs_action"

        cur.execute(
            "UPDATE crm_contact SET execution_status = %s WHERE crm_contact_id = %s AND business_id = %s",
            (new_status, str(contact_id), str(business_id)),
        )
        return new_status


def link_contact_to_opportunity(
    *,
    env_id: str,
    business_id: UUID,
    opportunity_id: UUID,
    contact_id: UUID,
    role_on_deal: str | None = None,
    influence_level: str | None = None,
    is_primary: bool = False,
    link_source: str = "manual",
) -> dict:
    """Create or update an explicit contact-deal link in cro_opportunity_contact."""
    with get_cursor() as cur:
        if is_primary:
            cur.execute(
                """
                UPDATE cro_opportunity_contact
                   SET is_primary = false, updated_at = now()
                 WHERE crm_opportunity_id = %s AND business_id = %s AND is_primary = true
                """,
                (str(opportunity_id), str(business_id)),
            )

        cur.execute(
            """
            INSERT INTO cro_opportunity_contact
              (env_id, business_id, crm_opportunity_id, crm_contact_id,
               role_on_deal, influence_level, is_primary, link_source)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (crm_opportunity_id, crm_contact_id) DO UPDATE
              SET role_on_deal    = EXCLUDED.role_on_deal,
                  influence_level = EXCLUDED.influence_level,
                  is_primary      = EXCLUDED.is_primary,
                  link_source     = EXCLUDED.link_source,
                  is_active       = true,
                  updated_at      = now()
            RETURNING id, crm_opportunity_id, crm_contact_id, role_on_deal,
                      influence_level, is_primary, link_source, created_at
            """,
            (
                env_id, str(business_id), str(opportunity_id), str(contact_id),
                role_on_deal, influence_level, is_primary, link_source,
            ),
        )
        row = cur.fetchone()

    evaluate_contact_execution_status(contact_id=contact_id, business_id=business_id)
    return dict(row)


def update_contact(
    *,
    contact_id: UUID,
    business_id: UUID,
    env_id: str,
    full_name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    title: str | None = None,
    unassigned_reason: str | None = None,
    execution_status: str | None = None,
    linkedin_url: str | None = None,
    relationship_strength: str | None = None,
    decision_role: str | None = None,
    notes: str | None = None,
    preferred_channel: str | None = None,
    buyer_persona: str | None = None,
    do_not_contact: bool | None = None,
    contact_owner: str | None = None,
) -> dict:
    """Update editable fields on a contact and its profile."""
    with get_cursor() as cur:
        contact_fields: dict[str, Any] = {}
        if full_name is not None:
            contact_fields["full_name"] = full_name
        if email is not None:
            contact_fields["email"] = email
        if phone is not None:
            contact_fields["phone"] = phone
        if title is not None:
            contact_fields["title"] = title
        if unassigned_reason is not None:
            contact_fields["unassigned_reason"] = unassigned_reason
        if execution_status is not None:
            contact_fields["execution_status"] = execution_status

        if contact_fields:
            set_clause = ", ".join(f"{k} = %s" for k in contact_fields)
            cur.execute(
                f"UPDATE crm_contact SET {set_clause} WHERE crm_contact_id = %s AND business_id = %s",
                list(contact_fields.values()) + [str(contact_id), str(business_id)],
            )

        profile_fields: dict[str, Any] = {}
        if linkedin_url is not None:
            profile_fields["linkedin_url"] = linkedin_url
        if relationship_strength is not None:
            profile_fields["relationship_strength"] = relationship_strength
        if decision_role is not None:
            profile_fields["decision_role"] = decision_role
        if notes is not None:
            profile_fields["notes"] = notes
        if preferred_channel is not None:
            profile_fields["preferred_channel"] = preferred_channel
        if buyer_persona is not None:
            profile_fields["buyer_persona"] = buyer_persona
        if do_not_contact is not None:
            profile_fields["do_not_contact"] = do_not_contact
        if contact_owner is not None:
            profile_fields["contact_owner"] = contact_owner

        if profile_fields:
            cols = ", ".join(profile_fields.keys())
            vals = ", ".join(["%s"] * len(profile_fields))
            update_clause = ", ".join(f"{k} = EXCLUDED.{k}" for k in profile_fields)
            cur.execute(
                f"""
                INSERT INTO cro_contact_profile (crm_contact_id, env_id, business_id, {cols})
                VALUES (%s, %s, %s, {vals})
                ON CONFLICT (crm_contact_id) DO UPDATE SET {update_clause}, updated_at = now()
                """,
                [str(contact_id), env_id, str(business_id)] + list(profile_fields.values()),
            )

    evaluate_contact_execution_status(contact_id=contact_id, business_id=business_id)
    return get_contact_detail(business_id=business_id, contact_id=contact_id)


def get_contact_deal_suggestions(*, business_id: UUID, contact_id: UUID) -> list[dict]:
    """Return top 3 open opportunities for the contact's account, ranked by recency."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT crm_account_id FROM crm_contact WHERE crm_contact_id = %s AND business_id = %s",
            (str(contact_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row or not row["crm_account_id"]:
            return []

        cur.execute(
            """
            SELECT o.crm_opportunity_id, o.name, o.amount,
                   s.key AS stage_key, s.label AS stage_label,
                   max(act.activity_at) AS last_activity_at
            FROM crm_opportunity o
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            LEFT JOIN crm_activity act ON act.crm_opportunity_id = o.crm_opportunity_id
            WHERE o.crm_account_id = %s AND o.business_id = %s AND o.status = 'open'
            GROUP BY o.crm_opportunity_id, o.name, o.amount, s.key, s.label
            ORDER BY last_activity_at DESC NULLS LAST
            LIMIT 3
            """,
            (str(row["crm_account_id"]), str(business_id)),
        )
        return cur.fetchall()


def get_contact_linked_deals(*, business_id: UUID, contact_id: UUID) -> list[dict]:
    """Return all deals explicitly linked to this contact via cro_opportunity_contact."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT o.crm_opportunity_id, o.name, o.amount, o.status,
                   s.key AS stage_key, s.label AS stage_label,
                   oc.role_on_deal, oc.influence_level, oc.is_primary,
                   na.description AS next_action_description,
                   na.due_date AS next_action_due
            FROM cro_opportunity_contact oc
            JOIN crm_opportunity o ON o.crm_opportunity_id = oc.crm_opportunity_id
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            LEFT JOIN LATERAL (
                SELECT description, due_date FROM cro_next_action
                WHERE entity_type = 'opportunity' AND entity_id = o.crm_opportunity_id
                  AND status IN ('pending','in_progress')
                ORDER BY due_date ASC LIMIT 1
            ) na ON true
            WHERE oc.crm_contact_id = %s AND oc.business_id = %s AND oc.is_active = true
            ORDER BY oc.is_primary DESC, o.created_at DESC
            """,
            (str(contact_id), str(business_id)),
        )
        return cur.fetchall()


_GOAL_RULES = [
    ("first_touch", "No outreach sent — start here"),
    ("follow_up", "Outreach sent but no reply in 5+ days"),
    ("book_meeting", "Reply received — move to meeting"),
    ("close", "Meeting done — push to proposal/close"),
]

_ANGLE_DEFAULT = "value_prop"


def suggest_contact_next_action(
    *,
    env_id: str,
    business_id: UUID,
    contact_id: UUID,
    dry_run: bool = False,
) -> dict:
    """Deterministic next-action suggestion for a contact.

    Applies rule-based goal detection from outreach history, then returns a
    structured suggestion and optionally creates the next action in cro_next_action.
    """
    from app.services import cro_next_actions

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT max(sent_at) AS last_sent,
                   max(replied_at) AS last_replied,
                   bool_or(meeting_booked) AS meeting_booked
            FROM cro_outreach_log
            WHERE crm_contact_id = %s AND business_id = %s
            """,
            (str(contact_id), str(business_id)),
        )
        history = cur.fetchone()

        cur.execute(
            """
            SELECT COUNT(*) AS pending_count FROM cro_next_action
            WHERE entity_type = 'contact' AND entity_id = %s
              AND business_id = %s AND status IN ('pending','in_progress')
            """,
            (str(contact_id), str(business_id)),
        )
        pending = cur.fetchone()["pending_count"]

        linked_deals = get_contact_linked_deals(business_id=business_id, contact_id=contact_id)
        deal_stage = linked_deals[0]["stage_key"] if linked_deals else None

    last_sent = history["last_sent"] if history else None
    last_replied = history["last_replied"] if history else None
    meeting_done = history["meeting_booked"] if history else False

    if not last_sent:
        goal = "first_touch"
        reason = "No outreach sent yet"
        action_type = "email"
        description = "Send first-touch outreach"
        priority = "high"
    elif last_sent and not last_replied:
        goal = "follow_up"
        reason = "Outreach sent — no reply"
        action_type = "email"
        description = "Follow up on unanswered outreach"
        priority = "high"
    elif last_replied and not meeting_done:
        goal = "book_meeting"
        reason = "Reply received — no meeting yet"
        action_type = "meeting"
        description = "Book discovery or demo call"
        priority = "high"
    else:
        goal = "close"
        reason = "Meeting done — advance to proposal"
        action_type = "task"
        description = "Prepare proposal or next close step"
        priority = "normal"

    tomorrow = date.fromordinal(date.today().toordinal() + 1)
    tomorrow_str = tomorrow.isoformat()

    suggested_next_action = {
        "action_type": action_type,
        "description": description,
        "priority": priority,
        "due_date": tomorrow_str,
    }

    if not dry_run and pending == 0:
        cro_next_actions.create_next_action(
            env_id=env_id,
            business_id=business_id,
            entity_type="contact",
            entity_id=contact_id,
            action_type=action_type,
            description=description,
            priority=priority,
            due_date=tomorrow,
        )
        evaluate_contact_execution_status(contact_id=contact_id, business_id=business_id)

    return {
        "recommended_action": description,
        "reason": reason,
        "goal": goal,
        "angle": _ANGLE_DEFAULT,
        "due_date": tomorrow_str,
        "suggested_next_action": suggested_next_action,
    }


def generate_contact_outreach_draft(
    *,
    env_id: str,
    business_id: UUID,
    contact_id: UUID,
    opportunity_id: UUID | None = None,
    goal: str = "first_touch",
    angle: str = "value_prop",
) -> dict:
    """Generate an opinionated outreach draft for a contact.

    Wraps pipeline_execution_engine.draft_outreach with contact-scoped context.
    Falls back to the contact's primary linked deal if opportunity_id is not given.
    """
    from app.services import pipeline_execution_engine

    if opportunity_id is None:
        linked = get_contact_linked_deals(business_id=business_id, contact_id=contact_id)
        primary = next((d for d in linked if d["is_primary"]), linked[0] if linked else None)
        if primary:
            opportunity_id = primary["crm_opportunity_id"]

    contact = get_contact_detail(business_id=business_id, contact_id=contact_id)

    if opportunity_id:
        try:
            result = pipeline_execution_engine.draft_outreach(
                env_id=env_id,
                business_id=business_id,
                opportunity_id=opportunity_id,
                contact_context={
                    "contact_id": str(contact_id),
                    "full_name": contact.get("full_name"),
                    "title": contact.get("title"),
                    "decision_role": contact.get("decision_role"),
                    "relationship_strength": contact.get("relationship_strength"),
                    "goal": goal,
                    "angle": angle,
                },
            )
            return result
        except Exception:
            pass

    # Minimal fallback when no deal is linked
    name = contact.get("full_name", "there")
    title = contact.get("title", "")
    subject_map = {
        "first_touch": f"Quick question for {name}",
        "follow_up": f"Following up — {name}",
        "close": f"Next step — {name}",
    }
    body_map = {
        "first_touch": (
            f"Hi {name},\n\nI wanted to reach out directly{' — given your role as ' + title if title else ''}. "
            "We work with firms like yours to [value prop]. Happy to share how.\n\nWorth a quick call?"
        ),
        "follow_up": f"Hi {name},\n\nJust circling back on my last note. Still think this is worth a conversation — let me know if the timing works.",
        "close": f"Hi {name},\n\nFollowing our conversation — happy to put together a proposal. What's the best path forward from your end?",
    }
    return {
        "draft": {
            "subject": subject_map.get(goal, f"Reaching out — {name}"),
            "body": body_map.get(goal, f"Hi {name},\n\nWanted to connect."),
        },
        "recommended_next_action": {
            "action_type": "email",
            "description": "Review and send draft",
        },
    }
