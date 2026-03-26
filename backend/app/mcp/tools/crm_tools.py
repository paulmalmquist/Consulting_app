"""CRM + Revenue pipeline MCP tools.

Exposes the full Consulting Revenue OS through MCP so any AI interface
can operate Novendor's sales motion: create accounts, manage pipeline,
log outreach, send proposals, track engagements, and pull scoreboard metrics.
"""

from __future__ import annotations

from decimal import Decimal

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.crm_tools import (
    ListAccountsInput,
    CreateAccountInput,
    GetAccountInput,
    ListPipelineStagesInput,
    ListOpportunitiesInput,
    CreateOpportunityInput,
    MoveOpportunityStageInput,
    ListActivitiesInput,
    CreateActivityInput,
    CreateLeadInput,
    ListLeadsInput,
    CreateProposalInput,
    ListProposalsInput,
    SendProposalInput,
    ListOutreachTemplatesInput,
    CreateOutreachTemplateInput,
    LogOutreachInput,
    RecordReplyInput,
    CreateEngagementInput,
    ListEngagementsInput,
    PipelineScoreboardInput,
)
from app.services import crm as crm_svc


# ── Accounts ────────────────────────────────────────────────────────────

def _list_accounts(ctx: McpContext, inp: ListAccountsInput) -> dict:
    rows = crm_svc.list_accounts(business_id=inp.business_id)
    return {
        "count": len(rows),
        "accounts": [
            {
                "crm_account_id": str(r["crm_account_id"]),
                "name": r["name"],
                "account_type": r["account_type"],
                "industry": r.get("industry"),
                "website": r.get("website"),
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ],
    }


def _create_account(ctx: McpContext, inp: CreateAccountInput) -> dict:
    row = crm_svc.create_account(
        business_id=inp.business_id,
        name=inp.name,
        account_type=inp.account_type,
        industry=inp.industry,
        website=inp.website,
    )
    return {
        "crm_account_id": str(row["crm_account_id"]),
        "name": row["name"],
        "account_type": row["account_type"],
    }


def _get_account(ctx: McpContext, inp: GetAccountInput) -> dict:
    rows = crm_svc.list_accounts(business_id=inp.business_id)
    account = next(
        (r for r in rows if str(r["crm_account_id"]) == str(inp.crm_account_id)),
        None,
    )
    if not account:
        raise LookupError(f"Account {inp.crm_account_id} not found")
    return {
        "crm_account_id": str(account["crm_account_id"]),
        "name": account["name"],
        "account_type": account["account_type"],
        "industry": account.get("industry"),
        "website": account.get("website"),
        "created_at": str(account["created_at"]),
    }


# ── Pipeline Stages ─────────────────────────────────────────────────────

def _list_pipeline_stages(ctx: McpContext, inp: ListPipelineStagesInput) -> dict:
    rows = crm_svc.list_pipeline_stages(business_id=inp.business_id)
    return {
        "stages": [
            {
                "crm_pipeline_stage_id": str(r["crm_pipeline_stage_id"]),
                "key": r["key"],
                "label": r["label"],
                "stage_order": r["stage_order"],
                "win_probability": float(r["win_probability"]),
                "is_closed": r["is_closed"],
                "is_won": r["is_won"],
            }
            for r in rows
        ],
    }


# ── Opportunities ────────────────────────────────────────────────────────

def _list_opportunities(ctx: McpContext, inp: ListOpportunitiesInput) -> dict:
    rows = crm_svc.list_opportunities(business_id=inp.business_id)
    return {
        "count": len(rows),
        "opportunities": [
            {
                "crm_opportunity_id": str(r["crm_opportunity_id"]),
                "name": r["name"],
                "amount": str(r["amount"]) if r.get("amount") else None,
                "status": r["status"],
                "stage_key": r.get("stage_key"),
                "stage_label": r.get("stage_label"),
                "account_name": r.get("account_name"),
                "expected_close_date": str(r["expected_close_date"]) if r.get("expected_close_date") else None,
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ],
    }


def _create_opportunity(ctx: McpContext, inp: CreateOpportunityInput) -> dict:
    row = crm_svc.create_opportunity(
        business_id=inp.business_id,
        name=inp.name,
        amount=inp.amount,
        crm_account_id=inp.crm_account_id,
        crm_pipeline_stage_id=inp.crm_pipeline_stage_id,
        expected_close_date=inp.expected_close_date,
    )
    return {
        "crm_opportunity_id": str(row["crm_opportunity_id"]),
        "name": row["name"],
        "amount": str(row["amount"]) if row.get("amount") else None,
        "status": row["status"],
    }


def _move_opportunity_stage(ctx: McpContext, inp: MoveOpportunityStageInput) -> dict:
    row = crm_svc.move_opportunity_stage(
        business_id=inp.business_id,
        crm_opportunity_id=inp.crm_opportunity_id,
        to_stage_id=inp.to_stage_id,
        note=inp.note,
    )
    return {
        "crm_opportunity_id": str(row["crm_opportunity_id"]),
        "new_stage_key": row.get("stage_key"),
        "moved": True,
    }


# ── Activities ───────────────────────────────────────────────────────────

def _list_activities(ctx: McpContext, inp: ListActivitiesInput) -> dict:
    rows = crm_svc.list_activities(
        business_id=inp.business_id,
        crm_account_id=inp.crm_account_id,
        crm_opportunity_id=inp.crm_opportunity_id,
        limit=inp.limit,
    )
    return {
        "count": len(rows),
        "activities": [
            {
                "crm_activity_id": str(r["crm_activity_id"]),
                "activity_type": r["activity_type"],
                "subject": r["subject"],
                "body": (r.get("payload_json") or {}).get("body") if isinstance(r.get("payload_json"), dict) else None,
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ],
    }


def _create_activity(ctx: McpContext, inp: CreateActivityInput) -> dict:
    row = crm_svc.create_activity(
        business_id=inp.business_id,
        activity_type=inp.activity_type,
        subject=inp.subject,
        body=inp.body,
        crm_account_id=inp.crm_account_id,
        crm_opportunity_id=inp.crm_opportunity_id,
        crm_contact_id=inp.crm_contact_id,
    )
    return {
        "crm_activity_id": str(row["crm_activity_id"]),
        "activity_type": row["activity_type"],
        "subject": row["subject"],
    }


# ── Leads (CRO) ─────────────────────────────────────────────────────────

def _create_lead(ctx: McpContext, inp: CreateLeadInput) -> dict:
    from app.services.cro_leads import create_lead

    row = create_lead(
        env_id=inp.env_id,
        business_id=inp.business_id,
        company_name=inp.company_name,
        industry=inp.industry,
        website=inp.website,
        ai_maturity=inp.ai_maturity,
        pain_category=inp.pain_category,
        lead_source=inp.lead_source,
        company_size=inp.company_size,
        revenue_band=inp.revenue_band,
        estimated_budget=Decimal(inp.estimated_budget) if inp.estimated_budget else None,
        contact_name=inp.contact_name,
        contact_email=inp.contact_email,
        contact_title=inp.contact_title,
        contact_linkedin=inp.contact_linkedin,
    )
    return {
        "crm_account_id": str(row["account"]["crm_account_id"]),
        "lead_profile_id": str(row["lead_profile"]["id"]),
        "lead_score": row["lead_profile"].get("lead_score"),
        "qualification_tier": row["lead_profile"].get("qualification_tier"),
        "name": row["account"]["name"],
    }


def _list_leads(ctx: McpContext, inp: ListLeadsInput) -> dict:
    from app.services.cro_leads import list_leads

    rows = list_leads(
        env_id=inp.env_id,
        business_id=inp.business_id,
        qualification_tier=inp.qualification_tier,
        limit=inp.limit,
    )
    return {
        "count": len(rows),
        "leads": [
            {
                "id": str(r["id"]),
                "crm_account_id": str(r["crm_account_id"]),
                "company_name": r.get("company_name"),
                "lead_score": r.get("lead_score"),
                "qualification_tier": r.get("qualification_tier"),
                "pain_category": r.get("pain_category"),
                "ai_maturity": r.get("ai_maturity"),
                "contact_name": r.get("contact_name"),
                "contact_title": r.get("contact_title"),
                "lead_source": r.get("lead_source"),
                "created_at": str(r.get("created_at")),
            }
            for r in rows
        ],
    }


# ── Proposals (CRO) ─────────────────────────────────────────────────────

def _create_proposal(ctx: McpContext, inp: CreateProposalInput) -> dict:
    from app.services.cro_proposals import create_proposal

    row = create_proposal(
        env_id=inp.env_id,
        business_id=inp.business_id,
        title=inp.title,
        total_value=Decimal(inp.total_value),
        cost_estimate=Decimal(inp.cost_estimate),
        crm_opportunity_id=inp.crm_opportunity_id,
        crm_account_id=inp.crm_account_id,
        pricing_model=inp.pricing_model,
        valid_until=inp.valid_until,
        scope_summary=inp.scope_summary,
        risk_notes=inp.risk_notes,
    )
    return {
        "proposal_id": str(row["id"]),
        "title": row["title"],
        "status": row["status"],
        "total_value": str(row["total_value"]),
        "margin_pct": str(row["margin_pct"]) if row.get("margin_pct") else None,
    }


def _list_proposals(ctx: McpContext, inp: ListProposalsInput) -> dict:
    from app.services.cro_proposals import list_proposals

    rows = list_proposals(
        env_id=inp.env_id,
        business_id=inp.business_id,
        status=inp.status,
    )
    return {
        "count": len(rows),
        "proposals": [
            {
                "id": str(r["id"]),
                "title": r["title"],
                "status": r["status"],
                "total_value": str(r["total_value"]),
                "margin_pct": str(r["margin_pct"]) if r.get("margin_pct") else None,
                "sent_at": str(r["sent_at"]) if r.get("sent_at") else None,
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ],
    }


def _send_proposal(ctx: McpContext, inp: SendProposalInput) -> dict:
    from app.services.cro_proposals import mark_sent

    row = mark_sent(
        env_id=inp.env_id,
        business_id=inp.business_id,
        proposal_id=inp.proposal_id,
    )
    return {
        "proposal_id": str(row["id"]),
        "status": row["status"],
        "sent_at": str(row["sent_at"]),
    }


# ── Outreach (CRO) ──────────────────────────────────────────────────────

def _list_outreach_templates(ctx: McpContext, inp: ListOutreachTemplatesInput) -> dict:
    from app.services.cro_outreach import list_templates

    rows = list_templates(env_id=inp.env_id, business_id=inp.business_id)
    return {
        "count": len(rows),
        "templates": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "channel": r["channel"],
                "category": r.get("category"),
                "use_count": r.get("use_count", 0),
                "reply_count": r.get("reply_count", 0),
            }
            for r in rows
        ],
    }


def _create_outreach_template(ctx: McpContext, inp: CreateOutreachTemplateInput) -> dict:
    from app.services.cro_outreach import create_template

    row = create_template(
        env_id=inp.env_id,
        business_id=inp.business_id,
        name=inp.name,
        channel=inp.channel,
        category=inp.category,
        subject_template=inp.subject_template,
        body_template=inp.body_template,
    )
    return {
        "template_id": str(row["id"]),
        "name": row["name"],
        "channel": row["channel"],
    }


def _log_outreach(ctx: McpContext, inp: LogOutreachInput) -> dict:
    from app.services.cro_outreach import log_outreach

    row = log_outreach(
        env_id=inp.env_id,
        business_id=inp.business_id,
        crm_account_id=inp.crm_account_id,
        channel=inp.channel,
        subject=inp.subject,
        body=inp.body,
        template_id=inp.template_id,
    )
    return {
        "outreach_log_id": str(row["id"]),
        "channel": row["channel"],
        "status": row["status"],
    }


def _record_reply(ctx: McpContext, inp: RecordReplyInput) -> dict:
    from app.services.cro_outreach import record_reply

    row = record_reply(
        env_id=inp.env_id,
        business_id=inp.business_id,
        outreach_log_id=inp.outreach_log_id,
        reply_summary=inp.reply_summary,
        sentiment=inp.sentiment,
    )
    return {
        "outreach_log_id": str(row["id"]),
        "status": row["status"],
        "replied_at": str(row.get("replied_at")),
    }


# ── Engagements (CRO) ───────────────────────────────────────────────────

def _create_engagement(ctx: McpContext, inp: CreateEngagementInput) -> dict:
    from app.services.cro_engagements import create_engagement

    row = create_engagement(
        env_id=inp.env_id,
        business_id=inp.business_id,
        client_id=inp.client_id,
        name=inp.name,
        engagement_type=inp.engagement_type,
        budget=Decimal(inp.budget),
        start_date=inp.start_date,
        end_date=inp.end_date,
        notes=inp.notes,
    )
    return {
        "engagement_id": str(row["id"]),
        "name": row["name"],
        "status": row["status"],
        "engagement_type": row["engagement_type"],
    }


def _list_engagements(ctx: McpContext, inp: ListEngagementsInput) -> dict:
    from app.services.cro_engagements import list_engagements

    rows = list_engagements(
        env_id=inp.env_id,
        business_id=inp.business_id,
        client_id=inp.client_id,
    )
    return {
        "count": len(rows),
        "engagements": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "status": r["status"],
                "engagement_type": r["engagement_type"],
                "budget": str(r["budget"]) if r.get("budget") else None,
                "actual_spend": str(r["actual_spend"]) if r.get("actual_spend") else None,
                "margin_pct": str(r["margin_pct"]) if r.get("margin_pct") else None,
                "start_date": str(r["start_date"]) if r.get("start_date") else None,
                "end_date": str(r["end_date"]) if r.get("end_date") else None,
            }
            for r in rows
        ],
    }


# ── Pipeline Scoreboard ─────────────────────────────────────────────────

def _pipeline_scoreboard(ctx: McpContext, inp: PipelineScoreboardInput) -> dict:
    """Compute a live revenue scoreboard from CRM data."""
    opps = crm_svc.list_opportunities(business_id=inp.business_id)
    stages = crm_svc.list_pipeline_stages(business_id=inp.business_id)

    total_pipeline = 0
    weighted_pipeline = 0
    open_deals = 0
    won_deals = 0
    won_revenue = 0
    lost_deals = 0
    deals_by_stage = {}

    for opp in opps:
        amount = float(opp.get("amount") or 0)
        stage_key = opp.get("stage_key", "unknown")

        if opp.get("status") == "open":
            open_deals += 1
            total_pipeline += amount
            # Find win probability
            prob = 0.1
            for s in stages:
                if s["key"] == stage_key:
                    prob = float(s["win_probability"])
                    break
            weighted_pipeline += amount * prob
            deals_by_stage[stage_key] = deals_by_stage.get(stage_key, 0) + 1

        elif stage_key == "closed_won":
            won_deals += 1
            won_revenue += amount

        elif stage_key == "closed_lost":
            lost_deals += 1

    return {
        "scoreboard": {
            "total_pipeline_value": round(total_pipeline, 2),
            "weighted_pipeline_value": round(weighted_pipeline, 2),
            "open_deals": open_deals,
            "won_deals": won_deals,
            "won_revenue": round(won_revenue, 2),
            "lost_deals": lost_deals,
            "deals_by_stage": deals_by_stage,
            "win_rate": round(won_deals / max(won_deals + lost_deals, 1), 2),
        },
    }


# ── Registration ─────────────────────────────────────────────────────────

def register_crm_tools():
    """Register all CRM + Revenue pipeline tools."""

    # Accounts
    registry.register(ToolDef(
        name="crm.list_accounts",
        description="List all CRM accounts (prospects, clients, partners) for a business",
        module="crm",
        permission="read",
        input_model=ListAccountsInput,
        handler=_list_accounts,
        tags=frozenset({"crm", "accounts", "read"}),
    ))
    registry.register(ToolDef(
        name="crm.create_account",
        description="Create a new CRM account (prospect, client, or partner company)",
        module="crm",
        permission="write",
        input_model=CreateAccountInput,
        handler=_create_account,
        tags=frozenset({"crm", "accounts", "write"}),
    ))
    registry.register(ToolDef(
        name="crm.get_account",
        description="Get details for a specific CRM account by ID",
        module="crm",
        permission="read",
        input_model=GetAccountInput,
        handler=_get_account,
        tags=frozenset({"crm", "accounts", "read"}),
    ))

    # Pipeline
    registry.register(ToolDef(
        name="crm.list_pipeline_stages",
        description="List all pipeline stages with win probabilities for a business",
        module="crm",
        permission="read",
        input_model=ListPipelineStagesInput,
        handler=_list_pipeline_stages,
        tags=frozenset({"crm", "pipeline", "read"}),
    ))
    registry.register(ToolDef(
        name="crm.list_opportunities",
        description="List all sales opportunities with stage, amount, and account info",
        module="crm",
        permission="read",
        input_model=ListOpportunitiesInput,
        handler=_list_opportunities,
        tags=frozenset({"crm", "pipeline", "opportunities", "read"}),
    ))
    registry.register(ToolDef(
        name="crm.create_opportunity",
        description="Create a new sales opportunity linked to an account and pipeline stage",
        module="crm",
        permission="write",
        input_model=CreateOpportunityInput,
        handler=_create_opportunity,
        tags=frozenset({"crm", "pipeline", "opportunities", "write"}),
    ))
    registry.register(ToolDef(
        name="crm.move_opportunity_stage",
        description="Move an opportunity to a different pipeline stage (e.g., qualified → proposal → negotiation)",
        module="crm",
        permission="write",
        input_model=MoveOpportunityStageInput,
        handler=_move_opportunity_stage,
        tags=frozenset({"crm", "pipeline", "opportunities", "write"}),
    ))

    # Activities
    registry.register(ToolDef(
        name="crm.list_activities",
        description="List activities (calls, meetings, emails, notes) for an account or opportunity",
        module="crm",
        permission="read",
        input_model=ListActivitiesInput,
        handler=_list_activities,
        tags=frozenset({"crm", "activities", "read"}),
    ))
    registry.register(ToolDef(
        name="crm.create_activity",
        description="Log a new activity (call, meeting, email, note) against an account or opportunity",
        module="crm",
        permission="write",
        input_model=CreateActivityInput,
        handler=_create_activity,
        tags=frozenset({"crm", "activities", "write"}),
    ))

    # Leads
    registry.register(ToolDef(
        name="crm.create_lead",
        description="Create a qualified lead with company profile, pain scoring, and contact info",
        module="crm",
        permission="write",
        input_model=CreateLeadInput,
        handler=_create_lead,
        tags=frozenset({"crm", "leads", "write"}),
    ))
    registry.register(ToolDef(
        name="crm.list_leads",
        description="List leads with qualification tiers, scores, and contact details",
        module="crm",
        permission="read",
        input_model=ListLeadsInput,
        handler=_list_leads,
        tags=frozenset({"crm", "leads", "read"}),
    ))

    # Proposals
    registry.register(ToolDef(
        name="crm.create_proposal",
        description="Create a new proposal with pricing, scope, and margin calculation",
        module="crm",
        permission="write",
        input_model=CreateProposalInput,
        handler=_create_proposal,
        tags=frozenset({"crm", "proposals", "write"}),
    ))
    registry.register(ToolDef(
        name="crm.list_proposals",
        description="List proposals with status, value, and margin data",
        module="crm",
        permission="read",
        input_model=ListProposalsInput,
        handler=_list_proposals,
        tags=frozenset({"crm", "proposals", "read"}),
    ))
    registry.register(ToolDef(
        name="crm.send_proposal",
        description="Mark a proposal as sent (records sent_at timestamp)",
        module="crm",
        permission="write",
        input_model=SendProposalInput,
        handler=_send_proposal,
        tags=frozenset({"crm", "proposals", "write"}),
    ))

    # Outreach
    registry.register(ToolDef(
        name="crm.list_outreach_templates",
        description="List reusable outreach message templates with performance stats",
        module="crm",
        permission="read",
        input_model=ListOutreachTemplatesInput,
        handler=_list_outreach_templates,
        tags=frozenset({"crm", "outreach", "read"}),
    ))
    registry.register(ToolDef(
        name="crm.create_outreach_template",
        description="Create a reusable outreach template for email, LinkedIn, or phone",
        module="crm",
        permission="write",
        input_model=CreateOutreachTemplateInput,
        handler=_create_outreach_template,
        tags=frozenset({"crm", "outreach", "write"}),
    ))
    registry.register(ToolDef(
        name="crm.log_outreach",
        description="Log an outreach touch (email sent, LinkedIn message, call made) to an account",
        module="crm",
        permission="write",
        input_model=LogOutreachInput,
        handler=_log_outreach,
        tags=frozenset({"crm", "outreach", "write"}),
    ))
    registry.register(ToolDef(
        name="crm.record_reply",
        description="Record that a prospect replied to outreach with sentiment analysis",
        module="crm",
        permission="write",
        input_model=RecordReplyInput,
        handler=_record_reply,
        tags=frozenset({"crm", "outreach", "write"}),
    ))

    # Engagements
    registry.register(ToolDef(
        name="crm.create_engagement",
        description="Create a new client engagement (diagnostic, sprint, pilot, retainer, workshop)",
        module="crm",
        permission="write",
        input_model=CreateEngagementInput,
        handler=_create_engagement,
        tags=frozenset({"crm", "engagements", "write"}),
    ))
    registry.register(ToolDef(
        name="crm.list_engagements",
        description="List active and completed client engagements with budget and margin data",
        module="crm",
        permission="read",
        input_model=ListEngagementsInput,
        handler=_list_engagements,
        tags=frozenset({"crm", "engagements", "read"}),
    ))

    # Scoreboard
    registry.register(ToolDef(
        name="crm.pipeline_scoreboard",
        description="Get a live revenue scoreboard: total pipeline, weighted value, win rate, deals by stage",
        module="crm",
        permission="read",
        input_model=PipelineScoreboardInput,
        handler=_pipeline_scoreboard,
        tags=frozenset({"crm", "pipeline", "analytics", "read"}),
    ))
