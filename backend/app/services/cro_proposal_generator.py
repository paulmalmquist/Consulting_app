"""Consulting Revenue OS -- Template-based proposal generator.

Takes account context (lead profile, proof assets, pipeline data)
and generates a structured proposal using templates. No LLM calls --
deterministic template expansion only.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import cro_proposals


def _fetch_account_context(account_id: UUID, env_id: str, business_id: UUID) -> dict:
    """Gather account, lead profile, and proof assets for proposal generation."""
    with get_cursor() as cur:
        # Account basics
        cur.execute(
            """
            SELECT a.crm_account_id, a.name AS company_name, a.industry, a.website,
                   a.annual_revenue, a.employee_count
            FROM crm_account a
            WHERE a.crm_account_id = %s AND a.business_id = %s
            """,
            (str(account_id), str(business_id)),
        )
        account = cur.fetchone()

        # Lead profile
        cur.execute(
            """
            SELECT lp.lead_profile_id, lp.ai_maturity, lp.pain_category,
                   lp.lead_score, lp.company_size, lp.revenue_band,
                   lp.erp_system, lp.estimated_budget
            FROM cro_lead_profile lp
            WHERE lp.crm_account_id = %s AND lp.env_id = %s AND lp.business_id = %s
            ORDER BY lp.created_at DESC LIMIT 1
            """,
            (str(account_id), env_id, str(business_id)),
        )
        lead_profile = cur.fetchone()

        # Proof assets (ready ones)
        cur.execute(
            """
            SELECT pa.title, pa.asset_type, pa.description
            FROM cro_proof_asset pa
            WHERE pa.env_id = %s AND pa.business_id = %s AND pa.status = 'ready'
            ORDER BY pa.use_count DESC LIMIT 5
            """,
            (env_id, str(business_id)),
        )
        proof_assets = cur.fetchall()

        return {
            "account": dict(account) if account else None,
            "lead_profile": dict(lead_profile) if lead_profile else None,
            "proof_assets": [dict(pa) for pa in proof_assets] if proof_assets else [],
        }


def _build_exec_summary(context: dict) -> str:
    """Build executive summary from account context."""
    account = context.get("account") or {}
    lead = context.get("lead_profile") or {}
    company = account.get("company_name", "the client")
    industry = account.get("industry", "their industry")
    pain = lead.get("pain_category", "operational efficiency")

    return (
        f"This proposal outlines a tailored engagement for {company} "
        f"to address {pain} challenges within {industry}. "
        f"Our approach combines AI-driven diagnostics, process optimization, "
        f"and technology enablement to deliver measurable ROI within the first 90 days."
    )


def _build_scope(context: dict) -> list[dict]:
    """Build scope sections based on pain category and AI maturity."""
    lead = context.get("lead_profile") or {}
    pain = lead.get("pain_category", "operational_efficiency")
    maturity = lead.get("ai_maturity", "exploring")

    phases = [
        {
            "phase": "Discovery & Diagnostic",
            "duration_weeks": 2,
            "description": (
                "Comprehensive assessment of current workflows, data infrastructure, "
                "and operational bottlenecks. Includes stakeholder interviews and "
                "process mapping."
            ),
        },
        {
            "phase": "Strategy & Roadmap",
            "duration_weeks": 2,
            "description": (
                "Develop a prioritized transformation roadmap with clear milestones, "
                "KPIs, and resource requirements. Identify quick wins for immediate impact."
            ),
        },
        {
            "phase": "Implementation Sprint 1",
            "duration_weeks": 4,
            "description": (
                "Execute the highest-priority initiatives from the roadmap. "
                "Deploy initial automation workflows and reporting dashboards."
            ),
        },
    ]

    if maturity in ("exploring", "piloting"):
        phases.append({
            "phase": "AI Enablement",
            "duration_weeks": 4,
            "description": (
                "Introduce AI-powered tools for the identified pain points. "
                "Includes model configuration, data pipeline setup, and user training."
            ),
        })

    if pain in ("reconciliation", "reporting", "data_quality"):
        phases.append({
            "phase": "Data Quality & Governance",
            "duration_weeks": 3,
            "description": (
                "Establish data governance framework, implement validation rules, "
                "and build reconciliation automation to eliminate manual errors."
            ),
        })

    return phases


def _estimate_pricing(context: dict) -> tuple[Decimal, Decimal]:
    """Estimate total value and cost based on scope and budget signals."""
    lead = context.get("lead_profile") or {}
    budget = lead.get("estimated_budget")

    if budget and Decimal(str(budget)) > 0:
        total_value = Decimal(str(budget)) * Decimal("0.8")
    else:
        total_value = Decimal("75000")

    cost_estimate = total_value * Decimal("0.35")
    return total_value, cost_estimate


def _build_timeline(phases: list[dict]) -> str:
    """Build a timeline summary from phases."""
    total_weeks = sum(p["duration_weeks"] for p in phases)
    lines = []
    week = 1
    for phase in phases:
        end_week = week + phase["duration_weeks"] - 1
        lines.append(f"Weeks {week}-{end_week}: {phase['phase']}")
        week = end_week + 1
    lines.append(f"\nTotal duration: {total_weeks} weeks")
    return "\n".join(lines)


def _build_risk_notes(context: dict) -> str:
    """Build risk notes based on context."""
    lead = context.get("lead_profile") or {}
    risks = []

    if lead.get("ai_maturity") in ("none", "exploring"):
        risks.append(
            "Client AI maturity is early-stage; additional change management "
            "support may be required."
        )

    if lead.get("erp_system"):
        risks.append(
            f"Integration with {lead['erp_system']} requires dedicated "
            f"connector development time."
        )

    if not risks:
        risks.append(
            "Standard engagement risk profile. Scope adjustments may be needed "
            "based on discovery findings."
        )

    return " ".join(risks)


def generate_proposal(
    *,
    account_id: UUID,
    env_id: str,
    business_id: UUID,
) -> dict:
    """Generate a structured proposal for the given account.

    Fetches account context (lead profile, proof assets), builds proposal
    sections from templates, and saves as a cro_proposal record.

    Returns the created proposal record.
    """
    emit_log(
        level="info",
        service="backend",
        action="cro.proposal_generator.start",
        message=f"Generating proposal for account {account_id}",
        context={"account_id": str(account_id), "env_id": env_id},
    )

    context = _fetch_account_context(account_id, env_id, business_id)

    if not context["account"]:
        raise LookupError(f"Account {account_id} not found")

    company_name = context["account"]["company_name"]
    exec_summary = _build_exec_summary(context)
    scope_phases = _build_scope(context)
    timeline = _build_timeline(scope_phases)
    total_value, cost_estimate = _estimate_pricing(context)
    risk_notes = _build_risk_notes(context)

    # Build scope summary with phase details
    scope_lines = [exec_summary, "", "## Scope of Work", ""]
    for phase in scope_phases:
        scope_lines.append(f"### {phase['phase']} ({phase['duration_weeks']} weeks)")
        scope_lines.append(phase["description"])
        scope_lines.append("")
    scope_lines.append("## Timeline")
    scope_lines.append(timeline)

    # Build proof asset references
    if context["proof_assets"]:
        scope_lines.append("")
        scope_lines.append("## Supporting Evidence")
        for pa in context["proof_assets"]:
            scope_lines.append(f"- **{pa['title']}** ({pa['asset_type']})")
            if pa.get("description"):
                scope_lines.append(f"  {pa['description']}")

    scope_summary = "\n".join(scope_lines)

    valid_until = date.today() + timedelta(days=30)

    proposal = cro_proposals.create_proposal(
        env_id=env_id,
        business_id=business_id,
        crm_account_id=account_id,
        title=f"{company_name} - AI Consulting Engagement",
        pricing_model="fixed_fee",
        total_value=total_value,
        cost_estimate=cost_estimate,
        valid_until=valid_until,
        scope_summary=scope_summary,
        risk_notes=risk_notes,
    )

    emit_log(
        level="info",
        service="backend",
        action="cro.proposal_generator.complete",
        message=f"Proposal generated for {company_name}",
        context={
            "account_id": str(account_id),
            "proposal_id": str(proposal.get("id", "")),
            "total_value": str(total_value),
        },
    )

    return proposal
