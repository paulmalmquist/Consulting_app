"""Consulting Revenue OS – Lead management service.

Creates leads as crm_account + cro_lead_profile in a single transaction.
Extends the CRM account model with consulting-specific scoring and qualification.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.reporting_common import normalize_key, resolve_tenant_id


# Stage → default next action mapping
_STAGE_NEXT_ACTIONS: dict[str, tuple[str, str, int]] = {
    "research": ("research", "Identify decision maker and validate fit", 2),
    "identified": ("email", "Enrich contact and find outreach angle", 2),
    "contacted": ("follow_up", "Send first outreach message", 3),
    "engaged": ("meeting", "Schedule discovery call or demo", 3),
    "meeting": ("proposal", "Prepare diagnostic or proof asset", 2),
    "qualified": ("proposal", "Draft and send proposal", 3),
    "proposal": ("follow_up", "Follow up and address objections", 3),
    "closed_won": ("task", "Schedule kickoff and convert to client", 1),
    "closed_lost": ("task", "Log objection and post-mortem", 7),
}


def create_lead(
    *,
    env_id: str,
    business_id: UUID,
    company_name: str,
    industry: str | None = None,
    website: str | None = None,
    ai_maturity: str | None = None,
    pain_category: str | None = None,
    lead_source: str | None = None,
    company_size: str | None = None,
    revenue_band: str | None = None,
    erp_system: str | None = None,
    estimated_budget: Decimal | None = None,
    contact_name: str | None = None,
    contact_email: str | None = None,
    contact_title: str | None = None,
    contact_linkedin: str | None = None,
) -> dict:
    """Create a lead (crm_account + cro_lead_profile) in one transaction."""
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)

        # Create CRM account as prospect
        cur.execute(
            """
            INSERT INTO crm_account
              (tenant_id, business_id, external_key, name, account_type, industry, website)
            VALUES (%s, %s, %s, %s, 'prospect', %s, %s)
            RETURNING crm_account_id, name, account_type, industry, website, created_at
            """,
            (
                tenant_id,
                str(business_id),
                normalize_key(company_name),
                company_name,
                industry,
                website,
            ),
        )
        account = cur.fetchone()

        # Compute initial lead score with breakdown
        score, breakdown = _compute_lead_score_with_breakdown(
            ai_maturity=ai_maturity,
            pain_category=pain_category,
            company_size=company_size,
            estimated_budget=estimated_budget,
            lead_source=lead_source,
        )

        # Create lead profile extension
        cur.execute(
            """
            INSERT INTO cro_lead_profile
              (crm_account_id, env_id, business_id, ai_maturity, pain_category,
               lead_score, score_breakdown, pipeline_stage, lead_source, company_size, revenue_band, erp_system,
               estimated_budget)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, lead_score, score_breakdown, pipeline_stage, ai_maturity, pain_category, lead_source,
                      company_size, revenue_band, erp_system, estimated_budget, created_at
            """,
            (
                str(account["crm_account_id"]),
                env_id,
                str(business_id),
                ai_maturity,
                pain_category,
                score,
                json.dumps(breakdown),
                'research',
                lead_source,
                company_size,
                revenue_band,
                erp_system,
                str(estimated_budget) if estimated_budget is not None else None,
            ),
        )
        profile = cur.fetchone()

        # Optionally create a primary contact
        if contact_name:
            cur.execute(
                """
                INSERT INTO crm_contact
                  (tenant_id, business_id, crm_account_id, full_name, email, title)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING crm_contact_id
                """,
                (
                    tenant_id,
                    str(business_id),
                    str(account["crm_account_id"]),
                    contact_name,
                    contact_email,
                    contact_title,
                ),
            )
            contact = cur.fetchone()

            if contact_linkedin:
                cur.execute(
                    """
                    INSERT INTO cro_contact_profile
                      (crm_contact_id, env_id, business_id, linkedin_url, relationship_strength)
                    VALUES (%s, %s, %s, %s, 'cold')
                    """,
                    (str(contact["crm_contact_id"]), env_id, str(business_id), contact_linkedin),
                )

    emit_log(
        level="info",
        service="backend",
        action="cro.lead.created",
        message=f"Lead created: {company_name}",
        context={"crm_account_id": str(account["crm_account_id"]), "lead_score": score},
    )

    # Auto-generate next action for the new lead
    try:
        from app.services import cro_next_actions
        action_type, description, days = _STAGE_NEXT_ACTIONS.get(
            "research", ("research", "Research company background", 3)
        )
        priority = "high" if score > 70 else ("normal" if score > 50 else "low")
        cro_next_actions.create_next_action(
            env_id=env_id,
            business_id=business_id,
            entity_type="account",
            entity_id=account["crm_account_id"],
            action_type=action_type,
            description=description,
            due_date=date.today() + timedelta(days=days),
            priority=priority,
        )
    except Exception:
        pass  # non-critical; don't fail lead creation

    # Auto-log creation activity
    try:
        with get_cursor() as cur:
            tenant_id = resolve_tenant_id(cur, business_id)
            cur.execute(
                """
                INSERT INTO crm_activity
                  (tenant_id, business_id, crm_account_id, activity_type, subject, notes, activity_date)
                VALUES (%s, %s, %s, 'note', %s, %s, %s)
                """,
                (tenant_id, str(business_id), str(account["crm_account_id"]),
                 f"Lead created: {company_name}",
                 f"Score: {score}/100. Stage: research.",
                 datetime.now(timezone.utc)),
            )
    except Exception:
        pass

    return {
        "crm_account_id": account["crm_account_id"],
        "lead_profile_id": profile["id"],
        "company_name": account["name"],
        "industry": account["industry"],
        "website": account["website"],
        "account_type": account["account_type"],
        "ai_maturity": profile["ai_maturity"],
        "pain_category": profile["pain_category"],
        "lead_score": profile["lead_score"],
        "lead_source": profile["lead_source"],
        "company_size": profile["company_size"],
        "revenue_band": profile["revenue_band"],
        "erp_system": profile["erp_system"],
        "estimated_budget": profile["estimated_budget"],
        "qualified_at": None,
        "disqualified_at": None,
        "stage_key": None,
        "stage_label": None,
        "created_at": account["created_at"],
    }


def list_leads(
    *,
    env_id: str,
    business_id: UUID,
    stage: str | None = None,
    min_score: int | None = None,
) -> list[dict]:
    """List leads with their profile data, optionally filtering by stage and score."""
    with get_cursor() as cur:
        sql = """
            SELECT a.crm_account_id, p.id AS lead_profile_id,
                   a.name AS company_name, a.industry, a.website, a.account_type,
                   p.ai_maturity, p.pain_category, p.lead_score, p.lead_source,
                   p.company_size, p.revenue_band, p.erp_system, p.estimated_budget,
                   p.qualified_at, p.disqualified_at,
                   s.key AS stage_key, s.label AS stage_label,
                   a.created_at
            FROM crm_account a
            JOIN cro_lead_profile p ON p.crm_account_id = a.crm_account_id
            LEFT JOIN crm_opportunity o ON o.crm_account_id = a.crm_account_id AND o.status = 'open'
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            WHERE p.env_id = %s AND p.business_id = %s
        """
        params: list = [env_id, str(business_id)]

        if min_score is not None:
            sql += " AND p.lead_score >= %s"
            params.append(min_score)

        sql += " ORDER BY p.lead_score DESC, a.created_at DESC"

        cur.execute(sql, tuple(params))
        return cur.fetchall()


def update_lead_score(*, lead_profile_id: UUID, score: int) -> dict:
    """Manually update a lead's score."""
    if score < 0 or score > 100:
        raise ValueError("Lead score must be between 0 and 100")

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_lead_profile SET lead_score = %s, updated_at = now()
            WHERE id = %s
            RETURNING id, crm_account_id, lead_score
            """,
            (score, str(lead_profile_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Lead profile {lead_profile_id} not found")
        return row


def qualify_lead(*, lead_profile_id: UUID) -> dict:
    """Mark a lead as qualified."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_lead_profile
            SET qualified_at = %s, disqualified_at = NULL, disqualified_reason = NULL, updated_at = now()
            WHERE id = %s
            RETURNING id, crm_account_id, qualified_at
            """,
            (datetime.now(timezone.utc), str(lead_profile_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Lead profile {lead_profile_id} not found")
        return row


def disqualify_lead(*, lead_profile_id: UUID, reason: str) -> dict:
    """Disqualify a lead with reason."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_lead_profile
            SET disqualified_at = %s, disqualified_reason = %s, qualified_at = NULL, updated_at = now()
            WHERE id = %s
            RETURNING id, crm_account_id, disqualified_at, disqualified_reason
            """,
            (datetime.now(timezone.utc), reason, str(lead_profile_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Lead profile {lead_profile_id} not found")
        return row


def update_lead_pipeline_stage(
    *,
    env_id: str,
    business_id: UUID,
    lead_id: UUID,
    stage: str,
) -> dict:
    """Update a lead's pipeline stage."""
    valid_stages = [
        "research", "identified", "contacted", "engaged", "meeting",
        "qualified", "proposal", "closed_won", "closed_lost"
    ]
    if stage not in valid_stages:
        raise ValueError(f"Invalid stage: {stage}. Must be one of {valid_stages}")

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_lead_profile
            SET pipeline_stage = %s, updated_at = now()
            WHERE crm_account_id = %s AND env_id = %s AND business_id = %s
            RETURNING id, crm_account_id, pipeline_stage, lead_score, updated_at
            """,
            (stage, str(lead_id), env_id, str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Lead profile for account {lead_id} not found")

    emit_log(level="info", service="backend", action="cro.lead.stage_updated",
             message=f"Lead {lead_id} moved to stage {stage}",
             context={"lead_id": str(lead_id), "stage": stage})

    # Auto-create opportunity when lead advances past "contacted"
    advanced_stages = {"engaged", "meeting", "qualified", "proposal", "closed_won"}
    if stage in advanced_stages:
        try:
            with get_cursor() as cur:
                tenant_id = resolve_tenant_id(cur, business_id)

                # Check if an opportunity already exists for this account
                cur.execute(
                    "SELECT crm_opportunity_id FROM crm_opportunity WHERE crm_account_id = %s AND business_id = %s LIMIT 1",
                    (str(lead_id), str(business_id)),
                )
                existing = cur.fetchone()
                if not existing:
                    # Get account name and budget
                    cur.execute(
                        "SELECT a.name, p.estimated_budget FROM crm_account a JOIN cro_lead_profile p ON p.crm_account_id = a.crm_account_id WHERE a.crm_account_id = %s",
                        (str(lead_id),),
                    )
                    info = cur.fetchone()
                    company_name_resolved = info["name"] if info else "Unknown"
                    budget = info["estimated_budget"] if info else None

                    # Get the pipeline stage ID for this stage
                    cur.execute(
                        "SELECT crm_pipeline_stage_id FROM crm_pipeline_stage WHERE tenant_id = %s AND business_id = %s AND key = %s",
                        (tenant_id, str(business_id), stage),
                    )
                    stage_row = cur.fetchone()
                    stage_id = stage_row["crm_pipeline_stage_id"] if stage_row else None

                    if stage_id:
                        cur.execute(
                            """
                            INSERT INTO crm_opportunity
                              (tenant_id, business_id, crm_account_id, crm_pipeline_stage_id,
                               name, status, amount, expected_close_date)
                            VALUES (%s, %s, %s, %s, %s, 'open', %s, %s)
                            """,
                            (tenant_id, str(business_id), str(lead_id), str(stage_id),
                             f"{company_name_resolved} - Consulting Engagement",
                             str(budget) if budget else "0",
                             (date.today() + timedelta(days=90)).isoformat()),
                        )
        except Exception:
            pass

    # Auto-generate next action for new stage
    try:
        from app.services import cro_next_actions

        action_info = _STAGE_NEXT_ACTIONS.get(stage)
        if action_info:
            action_type, description, days = action_info

            # Mark previous pending actions for this account as completed
            with get_cursor() as cur:
                cur.execute(
                    """
                    UPDATE cro_next_action
                    SET status = 'completed', completed_at = %s, updated_at = %s
                    WHERE entity_type = 'account' AND entity_id = %s
                      AND status IN ('pending', 'in_progress')
                    """,
                    (datetime.now(timezone.utc), datetime.now(timezone.utc), str(lead_id)),
                )

            cro_next_actions.create_next_action(
                env_id=env_id,
                business_id=business_id,
                entity_type="account",
                entity_id=lead_id,
                action_type=action_type,
                description=description,
                due_date=date.today() + timedelta(days=days),
                priority="high" if stage in ("proposal", "closed_won", "meeting") else "normal",
            )
    except Exception:
        pass

    # Log stage change activity
    try:
        with get_cursor() as cur:
            tenant_id = resolve_tenant_id(cur, business_id)
            cur.execute(
                """
                INSERT INTO crm_activity
                  (tenant_id, business_id, crm_account_id, activity_type, subject, notes, activity_date)
                VALUES (%s, %s, %s, 'note', %s, %s, %s)
                """,
                (tenant_id, str(business_id), str(lead_id),
                 f"Lead stage advanced to {stage}",
                 f"Pipeline stage updated to {stage}",
                 datetime.now(timezone.utc)),
            )
    except Exception:
        pass

    return row


def _compute_lead_score_with_breakdown(
    *,
    ai_maturity: str | None,
    pain_category: str | None,
    company_size: str | None,
    estimated_budget: Decimal | None,
    lead_source: str | None,
) -> tuple[int, dict]:
    """Deterministic lead scoring formula with detailed breakdown.

    Factors (each 0-20, total 0-100):
    - AI maturity: none=4, exploring=8, piloting=12, scaling=16, embedded=20
    - Pain severity: other=4, growth/efficiency=8, revenue/risk=12, ai_roi/erp_failure=16, reporting_chaos/governance_gap=20
    - Company size: 1_10=4, 10_50=8, 50_200=16, 200_1000=20, 1000_plus=12
    - Budget signal: none=0, <25k=4, <100k=10, <500k=16, >=500k=20
    - Source quality: scrape=4, outbound=8, inbound=12, event/partner=16, referral=20

    Returns: (total_score, breakdown_dict)
    """
    score = 0
    breakdown = {}

    # AI maturity
    maturity_scores = {"none": 4, "exploring": 8, "piloting": 12, "scaling": 16, "embedded": 20}
    maturity_score = maturity_scores.get(ai_maturity or "", 4)
    breakdown["ai_maturity"] = {"value": maturity_score, "label": ai_maturity or "unknown"}
    score += maturity_score

    # Pain category
    pain_scores = {
        "other": 4, "growth": 8, "efficiency": 8, "compliance": 10,
        "revenue": 12, "risk": 12, "ai_roi": 16, "erp_failure": 16,
        "reporting_chaos": 20, "governance_gap": 20,
    }
    pain_score = pain_scores.get(pain_category or "", 4)
    breakdown["pain_category"] = {"value": pain_score, "label": pain_category or "unknown"}
    score += pain_score

    # Company size
    size_scores = {"1_10": 4, "10_50": 8, "50_200": 16, "200_1000": 20, "1000_plus": 12}
    size_score = size_scores.get(company_size or "", 4)
    breakdown["company_size"] = {"value": size_score, "label": company_size or "unknown"}
    score += size_score

    # Budget signal
    if estimated_budget is None:
        budget_score = 0
        budget_label = "not_provided"
    elif estimated_budget < 25000:
        budget_score = 4
        budget_label = "under_25k"
    elif estimated_budget < 100000:
        budget_score = 10
        budget_label = "25k_100k"
    elif estimated_budget < 500000:
        budget_score = 16
        budget_label = "100k_500k"
    else:
        budget_score = 20
        budget_label = "500k_plus"

    breakdown["estimated_budget"] = {"value": budget_score, "label": budget_label}
    score += budget_score

    # Source quality
    source_scores = {
        "scrape": 4, "manual": 6, "outbound": 8, "research_loop": 10,
        "inbound": 12, "event": 16, "partner": 16, "referral": 20,
    }
    source_score = source_scores.get(lead_source or "", 4)
    breakdown["lead_source"] = {"value": source_score, "label": lead_source or "unknown"}
    score += source_score

    return (min(score, 100), breakdown)


def _compute_lead_score(
    *,
    ai_maturity: str | None,
    pain_category: str | None,
    company_size: str | None,
    estimated_budget: Decimal | None,
    lead_source: str | None,
) -> int:
    """Deterministic lead scoring formula (legacy, returns score only).

    For new code, use _compute_lead_score_with_breakdown instead.
    """
    score, _ = _compute_lead_score_with_breakdown(
        ai_maturity=ai_maturity,
        pain_category=pain_category,
        company_size=company_size,
        estimated_budget=estimated_budget,
        lead_source=lead_source,
    )
    return score
