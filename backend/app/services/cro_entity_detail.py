"""Consulting Revenue OS – Entity detail service.

Provides detail views for accounts, contacts, and opportunities
with related sub-entities (contacts, opportunities, activities, proposals).
"""
from __future__ import annotations

from uuid import UUID

from app.db import get_cursor
from app.services.reporting_common import resolve_tenant_id


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
    """Get contacts linked to an opportunity's account."""
    with get_cursor() as cur:
        # Get the account_id first
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
                   c.created_at
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
                   a.name AS account_name, a.industry AS account_industry,
                   cp.linkedin_url, cp.relationship_strength, cp.decision_role,
                   cp.last_outreach_at, cp.notes AS profile_notes
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
