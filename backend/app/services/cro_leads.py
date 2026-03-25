"""Consulting Revenue OS – Lead management service.

Creates leads as crm_account + cro_lead_profile in a single transaction.
Extends the CRM account model with consulting-specific scoring and qualification.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.reporting_common import normalize_key, resolve_tenant_id


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

        # Compute initial lead score
        score = _compute_lead_score(
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
               lead_score, lead_source, company_size, revenue_band, erp_system,
               estimated_budget)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, lead_score, ai_maturity, pain_category, lead_source,
                      company_size, revenue_band, erp_system, estimated_budget, created_at
            """,
            (
                str(account["crm_account_id"]),
                env_id,
                str(business_id),
                ai_maturity,
                pain_category,
                score,
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


def _compute_lead_score(
    *,
    ai_maturity: str | None,
    pain_category: str | None,
    company_size: str | None,
    estimated_budget: Decimal | None,
    lead_source: str | None,
) -> int:
    """Deterministic lead scoring formula.

    Factors (each 0-20, total 0-100):
    - AI maturity: none=4, exploring=8, piloting=12, scaling=16, embedded=20
    - Pain severity: other=4, growth/efficiency=8, revenue/risk=12, ai_roi/erp_failure=16, reporting_chaos/governance_gap=20
    - Company size: 1_10=4, 10_50=8, 50_200=16, 200_1000=20, 1000_plus=12
    - Budget signal: none=0, <25k=4, <100k=10, <500k=16, >=500k=20
    - Source quality: scrape=4, outbound=8, inbound=12, event/partner=16, referral=20
    """
    score = 0

    # AI maturity
    maturity_scores = {"none": 4, "exploring": 8, "piloting": 12, "scaling": 16, "embedded": 20}
    score += maturity_scores.get(ai_maturity or "", 4)

    # Pain category
    pain_scores = {
        "other": 4, "growth": 8, "efficiency": 8, "compliance": 10,
        "revenue": 12, "risk": 12, "ai_roi": 16, "erp_failure": 16,
        "reporting_chaos": 20, "governance_gap": 20,
    }
    score += pain_scores.get(pain_category or "", 4)

    # Company size
    size_scores = {"1_10": 4, "10_50": 8, "50_200": 16, "200_1000": 20, "1000_plus": 12}
    score += size_scores.get(company_size or "", 4)

    # Budget signal
    if estimated_budget is None:
        score += 0
    elif estimated_budget < 25000:
        score += 4
    elif estimated_budget < 100000:
        score += 10
    elif estimated_budget < 500000:
        score += 16
    else:
        score += 20

    # Source quality
    source_scores = {
        "scrape": 4, "manual": 6, "outbound": 8, "research_loop": 10,
        "inbound": 12, "event": 16, "partner": 16, "referral": 20,
    }
    score += source_scores.get(lead_source or "", 4)

    return min(score, 100)
