"""Consulting Revenue OS API routes.

Pipeline management, lead scoring, outreach tracking, proposals,
client lifecycle, engagements, revenue scheduling, and metrics.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query

from app.observability.logger import emit_log
from app.schemas.consulting import (
    AdvanceStageRequest,
    ClientOut,
    ConvertToClientRequest,
    DemoReadinessOut,
    DemoReadinessUpdateRequest,
    EngagementCreateRequest,
    EngagementOut,
    LeadCreateRequest,
    LeadOut,
    LeadScoreUpdate,
    MetricsSnapshotOut,
    NextActionCompleteRequest,
    NextActionCreateRequest,
    NextActionOut,
    NextActionSkipRequest,
    ObjectionCreateRequest,
    ObjectionOut,
    ObjectionUpdateRequest,
    OutreachAnalyticsOut,
    OutreachLogCreateRequest,
    OutreachLogOut,
    OutreachReplyRequest,
    OutreachTemplateCreateRequest,
    OutreachTemplateOut,
    PipelineKanbanResult,
    PipelineStageOut,
    ProofAssetCreateRequest,
    ProofAssetOut,
    ProofAssetSummaryOut,
    ProofAssetUpdateRequest,
    ProposalCreateRequest,
    ProposalOut,
    ProposalStatusUpdate,
    RevenueEntryOut,
    RevenueInvoiceStatusUpdate,
    RevenueScheduleCreateRequest,
    RevenueSummaryOut,
    SeedRequest,
    SeedResult,
    StaleRecordsOut,
    TodayOverdueOut,
    UpdateLeadStageRequest,
    LoopCreateRequest,
    LoopDetailOut,
    LoopInterventionCreateRequest,
    LoopInterventionOut,
    LoopOut,
    LoopSummaryOut,
    LoopUpdateRequest,
    DeliverableCreateRequest,
    DeliverableOut,
    DiagnosticSessionCreateRequest,
    DiagnosticSessionOut,
    LeadHypothesisOut,
    LeadHypothesisUpsertRequest,
    OutreachSequenceApproveRequest,
    OutreachSequenceOut,
    StrategicContactCreateRequest,
    StrategicContactOut,
    StrategicLeadOut,
    StrategicLeadUpsertRequest,
    StrategicOutreachDashboard,
    StrategicOutreachMonitorResult,
    StrategicOutreachSeedRequest,
    StrategicOutreachSeedResult,
    TriggerSignalCreateRequest,
    TriggerSignalOut,
)
from app.schemas.local_training import (
    LocalTrainingActivityCreateRequest,
    LocalTrainingCheckInRequest,
    LocalTrainingContactCreateRequest,
    LocalTrainingEventCreateRequest,
    LocalTrainingRegistrationUpsertRequest,
    LocalTrainingSeedRequest,
    LocalTrainingTaskStatusRequest,
)
from app.services import (
    cro_clients,
    cro_demo_readiness,
    cro_engagements,
    cro_entity_detail,
    cro_leads,
    cro_metrics_engine,
    cro_next_actions,
    cro_objections,
    cro_outreach,
    cro_pipeline,
    cro_proof_assets,
    cro_proposals,
    cro_revenue,
    cro_seed,
    cro_loops,
    cro_strategic_outreach,
    local_training_crm,
)

router = APIRouter(prefix="/api/consulting", tags=["consulting-revenue-os"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn)):
        return HTTPException(
            503,
            {
                "error_code": "SCHEMA_NOT_MIGRATED",
                "message": "Consulting Revenue OS schema not migrated.",
                "detail": "Check /bos/api/consulting/health for full status. Required: migrations 260, 280, 281, 302, 311, 431.",
                "health_check_url": "/bos/api/consulting/health",
            },
        )
    if isinstance(exc, LookupError):
        return HTTPException(404, {"error_code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    return HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": str(exc)})


def _log(action: str, msg: str, **ctx):
    emit_log(level="info", service="backend", action=action, message=msg, context=ctx)


# ── Pipeline ────────────────────────────────────────────────────────────────────

@router.get("/pipeline/stages", response_model=list[PipelineStageOut])
def list_pipeline_stages(
    business_id: UUID = Query(...),
):
    try:
        return cro_pipeline.list_consulting_pipeline_stages(business_id=business_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/pipeline/kanban", response_model=PipelineKanbanResult)
def get_pipeline_kanban(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_pipeline.get_pipeline_kanban(env_id=env_id, business_id=business_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/pipeline/advance")
def advance_stage(body: AdvanceStageRequest):
    try:
        result = cro_pipeline.advance_opportunity_stage(
            business_id=body.business_id,
            opportunity_id=body.opportunity_id,
            to_stage_key=body.to_stage_key,
            note=body.note,
            close_reason=body.close_reason,
            competitive_incumbent=body.competitive_incumbent,
            close_notes=body.close_notes,
        )
        _log("cro.pipeline.advanced", f"Opportunity advanced to {body.to_stage_key}")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Leads ───────────────────────────────────────────────────────────────────────

@router.get("/leads", response_model=list[LeadOut])
def list_leads(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    min_score: int | None = Query(None, ge=0, le=100),
):
    try:
        return cro_leads.list_leads(
            env_id=env_id,
            business_id=business_id,
            min_score=min_score,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/leads", response_model=LeadOut, status_code=201)
def create_lead(body: LeadCreateRequest):
    try:
        result = cro_leads.create_lead(
            env_id=body.env_id,
            business_id=body.business_id,
            company_name=body.company_name,
            industry=body.industry,
            website=body.website,
            ai_maturity=body.ai_maturity,
            pain_category=body.pain_category,
            lead_source=body.lead_source,
            company_size=body.company_size,
            revenue_band=body.revenue_band,
            erp_system=body.erp_system,
            estimated_budget=body.estimated_budget,
            contact_name=body.contact_name,
            contact_email=body.contact_email,
            contact_title=body.contact_title,
            contact_linkedin=body.contact_linkedin,
        )
        _log("cro.lead.created", f"Lead created: {body.company_name}")
        # Auto-generate first next action for any new lead
        import datetime as _dt
        try:
            cro_next_actions.create_next_action(
                env_id=body.env_id,
                business_id=body.business_id,
                entity_type="account",
                entity_id=result["crm_account_id"],
                action_type="research",
                description=f"Find contact and send Touch 1 outreach to {body.company_name}",
                due_date=(_dt.date.today() + _dt.timedelta(days=1)),
                priority="high",
            )
        except Exception:
            pass  # Don't fail the lead creation if next action fails
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/leads/{lead_profile_id}/score")
def update_lead_score(lead_profile_id: UUID, body: LeadScoreUpdate):
    try:
        return cro_leads.update_lead_score(lead_profile_id=lead_profile_id, score=body.score)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/leads/{lead_profile_id}/qualify")
def qualify_lead(lead_profile_id: UUID):
    try:
        return cro_leads.qualify_lead(lead_profile_id=lead_profile_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/leads/{lead_profile_id}/disqualify")
def disqualify_lead(lead_profile_id: UUID, reason: str = Query(...)):
    try:
        return cro_leads.disqualify_lead(lead_profile_id=lead_profile_id, reason=reason)
    except Exception as exc:
        raise _to_http(exc)


# ── Outreach Templates ────────────────────────────────────────────────────────

@router.get("/outreach/templates", response_model=list[OutreachTemplateOut])
def list_outreach_templates(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    active_only: bool = Query(True),
):
    try:
        return cro_outreach.list_templates(env_id=env_id, business_id=business_id, active_only=active_only)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/outreach/templates", response_model=OutreachTemplateOut, status_code=201)
def create_outreach_template(body: OutreachTemplateCreateRequest):
    try:
        result = cro_outreach.create_template(
            env_id=body.env_id, business_id=body.business_id,
            name=body.name, channel=body.channel, category=body.category,
            subject_template=body.subject_template, body_template=body.body_template,
        )
        _log("cro.outreach.template_created", f"Template created: {body.name}")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Outreach Log ──────────────────────────────────────────────────────────────

@router.get("/outreach/log", response_model=list[OutreachLogOut])
def list_outreach_log(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    crm_account_id: UUID | None = Query(None),
    channel: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    try:
        return cro_outreach.list_outreach_log(
            env_id=env_id, business_id=business_id,
            crm_account_id=crm_account_id, channel=channel, limit=limit,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/outreach/log", response_model=OutreachLogOut, status_code=201)
def log_outreach(body: OutreachLogCreateRequest):
    try:
        result = cro_outreach.log_outreach(
            env_id=body.env_id, business_id=body.business_id,
            crm_account_id=body.crm_account_id,
            crm_contact_id=body.crm_contact_id,
            template_id=body.template_id,
            channel=body.channel, direction=body.direction,
            subject=body.subject, body_preview=body.body_preview,
            meeting_booked=body.meeting_booked, sent_by=body.sent_by,
        )
        _log("cro.outreach.logged", f"Outreach logged: {body.channel}")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.post("/outreach/log/{outreach_log_id}/reply")
def record_outreach_reply(outreach_log_id: UUID, body: OutreachReplyRequest):
    try:
        return cro_outreach.record_reply(
            outreach_log_id=outreach_log_id,
            sentiment=body.sentiment,
            meeting_booked=body.meeting_booked,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/outreach/analytics", response_model=OutreachAnalyticsOut)
def get_outreach_analytics(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_outreach.get_outreach_analytics(env_id=env_id, business_id=business_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Proposals ─────────────────────────────────────────────────────────────────

@router.get("/proposals", response_model=list[ProposalOut])
def list_proposals(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    status: str | None = Query(None),
    crm_account_id: UUID | None = Query(None),
):
    try:
        return cro_proposals.list_proposals(
            env_id=env_id, business_id=business_id,
            status=status, crm_account_id=crm_account_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/proposals", response_model=ProposalOut, status_code=201)
def create_proposal(body: ProposalCreateRequest):
    try:
        result = cro_proposals.create_proposal(
            env_id=body.env_id, business_id=body.business_id,
            crm_opportunity_id=body.crm_opportunity_id,
            crm_account_id=body.crm_account_id,
            title=body.title, pricing_model=body.pricing_model,
            total_value=body.total_value, cost_estimate=body.cost_estimate,
            valid_until=body.valid_until,
            scope_summary=body.scope_summary, risk_notes=body.risk_notes,
        )
        _log("cro.proposal.created", f"Proposal created: {body.title}")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/proposals/{proposal_id}", response_model=ProposalOut)
def get_proposal(proposal_id: UUID):
    try:
        return cro_proposals.get_proposal(proposal_id=proposal_id)
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/proposals/{proposal_id}/status")
def update_proposal_status(proposal_id: UUID, body: ProposalStatusUpdate):
    try:
        return cro_proposals.update_proposal_status(
            proposal_id=proposal_id,
            status=body.status,
            rejection_reason=body.rejection_reason,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/proposals/{proposal_id}/version", response_model=ProposalOut, status_code=201)
def create_proposal_version(proposal_id: UUID):
    try:
        result = cro_proposals.create_new_version(proposal_id=proposal_id)
        _log("cro.proposal.versioned", f"Proposal {proposal_id} new version created")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Loop Intelligence ────────────────────────────────────────────────────────

@router.get("/loops", response_model=list[LoopOut])
def list_loops(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    client_id: UUID | None = Query(None),
    status: str | None = Query(None),
    domain: str | None = Query(None),
    min_cost: Decimal | None = Query(None, ge=0),
):
    try:
        return cro_loops.list_loops(
            env_id=env_id,
            business_id=business_id,
            client_id=client_id,
            status=status,
            domain=domain,
            min_cost=min_cost,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/loops", response_model=LoopDetailOut, status_code=201)
def create_loop(body: LoopCreateRequest):
    try:
        result = cro_loops.create_loop(
            env_id=body.env_id,
            business_id=body.business_id,
            client_id=body.client_id,
            name=body.name,
            process_domain=body.process_domain,
            description=body.description,
            trigger_type=body.trigger_type,
            frequency_type=body.frequency_type,
            frequency_per_year=body.frequency_per_year,
            status=body.status,
            control_maturity_stage=body.control_maturity_stage,
            automation_readiness_score=body.automation_readiness_score,
            avg_wait_time_minutes=body.avg_wait_time_minutes,
            rework_rate_percent=body.rework_rate_percent,
            roles=[role.model_dump() for role in body.roles],
        )
        _log("cro.loop.created", f"Loop created: {body.name}")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/loops/summary", response_model=LoopSummaryOut)
def get_loop_summary(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    client_id: UUID | None = Query(None),
    status: str | None = Query(None),
    domain: str | None = Query(None),
    min_cost: Decimal | None = Query(None, ge=0),
):
    try:
        return cro_loops.get_loop_summary(
            env_id=env_id,
            business_id=business_id,
            client_id=client_id,
            status=status,
            domain=domain,
            min_cost=min_cost,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/loops/{loop_id}", response_model=LoopDetailOut)
def get_loop(loop_id: UUID, env_id: str = Query(...), business_id: UUID = Query(...)):
    try:
        return cro_loops.get_loop_detail(loop_id=loop_id, env_id=env_id, business_id=business_id)
    except Exception as exc:
        raise _to_http(exc)


@router.put("/loops/{loop_id}", response_model=LoopDetailOut)
def update_loop(
    loop_id: UUID,
    body: LoopUpdateRequest,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        result = cro_loops.update_loop(
            loop_id=loop_id,
            env_id=env_id,
            business_id=business_id,
            client_id=body.client_id,
            name=body.name,
            process_domain=body.process_domain,
            description=body.description,
            trigger_type=body.trigger_type,
            frequency_type=body.frequency_type,
            frequency_per_year=body.frequency_per_year,
            status=body.status,
            control_maturity_stage=body.control_maturity_stage,
            automation_readiness_score=body.automation_readiness_score,
            avg_wait_time_minutes=body.avg_wait_time_minutes,
            rework_rate_percent=body.rework_rate_percent,
            roles=[role.model_dump() for role in body.roles] if body.roles is not None else None,
        )
        _log("cro.loop.updated", f"Loop updated: {loop_id}")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.post("/loops/{loop_id}/interventions", response_model=LoopInterventionOut, status_code=201)
def create_loop_intervention(
    loop_id: UUID,
    body: LoopInterventionCreateRequest,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        result = cro_loops.create_intervention(
            loop_id=loop_id,
            env_id=env_id,
            business_id=business_id,
            intervention_type=body.intervention_type,
            notes=body.notes,
            after_snapshot=body.after_snapshot,
            observed_delta_percent=body.observed_delta_percent,
        )
        _log("cro.loop.intervention_created", f"Loop intervention created: {loop_id}")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Clients ───────────────────────────────────────────────────────────────────

@router.get("/clients", response_model=list[ClientOut])
def list_clients(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    status: str | None = Query(None),
):
    try:
        return cro_clients.list_clients(env_id=env_id, business_id=business_id, status=status)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/clients/convert", response_model=ClientOut, status_code=201)
def convert_to_client(body: ConvertToClientRequest):
    try:
        result = cro_clients.convert_to_client(
            env_id=body.env_id, business_id=body.business_id,
            crm_account_id=body.crm_account_id,
            crm_opportunity_id=body.crm_opportunity_id,
            proposal_id=body.proposal_id,
            account_owner=body.account_owner,
            start_date=body.start_date,
        )
        _log("cro.client.converted", "Account converted to client")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/clients/{client_id}", response_model=ClientOut)
def get_client(client_id: UUID):
    try:
        return cro_clients.get_client(client_id=client_id)
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/clients/{client_id}/status")
def update_client_status(client_id: UUID, status: str = Query(...)):
    try:
        return cro_clients.update_client_status(client_id=client_id, status=status)
    except Exception as exc:
        raise _to_http(exc)


# ── Engagements ───────────────────────────────────────────────────────────────

@router.get("/engagements", response_model=list[EngagementOut])
def list_engagements(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    client_id: UUID | None = Query(None),
    status: str | None = Query(None),
):
    try:
        return cro_engagements.list_engagements(
            env_id=env_id, business_id=business_id,
            client_id=client_id, status=status,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/engagements", response_model=EngagementOut, status_code=201)
def create_engagement(body: EngagementCreateRequest):
    try:
        result = cro_engagements.create_engagement(
            env_id=body.env_id, business_id=body.business_id,
            client_id=body.client_id, name=body.name,
            engagement_type=body.engagement_type, budget=body.budget,
            start_date=body.start_date, end_date=body.end_date,
            notes=body.notes,
        )
        _log("cro.engagement.created", f"Engagement created: {body.name}")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/engagements/{engagement_id}", response_model=EngagementOut)
def get_engagement(engagement_id: UUID):
    try:
        return cro_engagements.get_engagement(engagement_id=engagement_id)
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/engagements/{engagement_id}/spend")
def update_engagement_spend(engagement_id: UUID, actual_spend: str = Query(...)):
    try:
        from decimal import Decimal
        return cro_engagements.update_engagement_spend(
            engagement_id=engagement_id,
            actual_spend=Decimal(actual_spend),
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/engagements/{engagement_id}/complete")
def complete_engagement(engagement_id: UUID):
    try:
        return cro_engagements.complete_engagement(engagement_id=engagement_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Revenue Schedule ──────────────────────────────────────────────────────────

@router.get("/revenue/entries", response_model=list[RevenueEntryOut])
def list_revenue_entries(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    client_id: UUID | None = Query(None),
    engagement_id: UUID | None = Query(None),
    invoice_status: str | None = Query(None),
):
    try:
        return cro_revenue.list_revenue_entries(
            env_id=env_id, business_id=business_id,
            client_id=client_id, engagement_id=engagement_id,
            invoice_status=invoice_status,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/revenue/entries", response_model=list[RevenueEntryOut], status_code=201)
def create_revenue_entries(body: RevenueScheduleCreateRequest):
    try:
        entries = [e.model_dump() for e in body.entries]
        result = cro_revenue.create_revenue_entries(
            env_id=body.env_id, business_id=body.business_id, entries=entries,
        )
        _log("cro.revenue.entries_created", f"Created {len(entries)} revenue entries")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/revenue/entries/{entry_id}/status")
def update_revenue_invoice_status(entry_id: UUID, body: RevenueInvoiceStatusUpdate):
    try:
        return cro_revenue.update_invoice_status(
            entry_id=entry_id, invoice_status=body.invoice_status,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/revenue/summary", response_model=RevenueSummaryOut)
def get_revenue_summary(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_revenue.get_revenue_summary(env_id=env_id, business_id=business_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Metrics ───────────────────────────────────────────────────────────────────

@router.post("/metrics/compute", response_model=MetricsSnapshotOut, status_code=201)
def compute_metrics(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        result = cro_metrics_engine.compute_all_metrics(env_id=env_id, business_id=business_id)
        _log("cro.metrics.computed", "Metrics snapshot computed")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.get("/metrics/latest", response_model=MetricsSnapshotOut)
def get_latest_metrics(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        snapshot = cro_metrics_engine.get_latest_snapshot(env_id=env_id, business_id=business_id)
        if not snapshot:
            raise LookupError("No metrics snapshot found. Run /metrics/compute first.")
        return snapshot
    except Exception as exc:
        raise _to_http(exc)


# ── Seed ──────────────────────────────────────────────────────────────────────

@router.post("/seed", response_model=SeedResult, status_code=201)
def seed_consulting_environment(body: SeedRequest):
    try:
        result = cro_seed.seed_consulting_environment(env_id=body.env_id, business_id=body.business_id)
        _log("cro.seed.completed", "Consulting environment seeded")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.post("/seed/reset", response_model=SeedResult, status_code=201)
def reset_and_reseed(body: SeedRequest):
    """Wipe all CRM data for this env and reseed with current client-hunting targets."""
    try:
        result = cro_seed.reset_and_reseed(env_id=body.env_id, business_id=body.business_id)
        _log("cro.seed.reset", "Consulting environment reset and reseeded")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ── Local training CRM ───────────────────────────────────────────────────────

@router.get("/local-training/workspace")
def get_local_training_workspace(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return local_training_crm.get_workspace(env_id=env_id, business_id=business_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/local-training/seed", status_code=201)
def seed_local_training_workspace(body: LocalTrainingSeedRequest):
    try:
        result = local_training_crm.seed_local_training_workspace(
            env_id=body.env_id,
            business_id=body.business_id,
        )
        _log("cro.local_training.seeded", "Local training CRM workspace seeded")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.post("/local-training/contacts", status_code=201)
def create_local_training_contact(body: LocalTrainingContactCreateRequest):
    try:
        return local_training_crm.create_contact(
            env_id=body.env_id,
            business_id=body.business_id,
            payload=body.model_dump(mode="json"),
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/local-training/events", status_code=201)
def create_local_training_event(body: LocalTrainingEventCreateRequest):
    try:
        return local_training_crm.create_event(
            env_id=body.env_id,
            business_id=body.business_id,
            payload=body.model_dump(mode="json"),
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/local-training/activities", status_code=201)
def create_local_training_activity(body: LocalTrainingActivityCreateRequest):
    try:
        return local_training_crm.create_activity(
            env_id=body.env_id,
            business_id=body.business_id,
            payload=body.model_dump(mode="json"),
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/local-training/registrations", status_code=201)
def upsert_local_training_registration(body: LocalTrainingRegistrationUpsertRequest):
    try:
        return local_training_crm.create_registration(
            env_id=body.env_id,
            business_id=body.business_id,
            payload=body.model_dump(mode="json"),
        )
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/local-training/registrations/{registration_id}/check-in")
def check_in_local_training_registration(registration_id: UUID, body: LocalTrainingCheckInRequest):
    try:
        return local_training_crm.check_in_registration(
            registration_id=registration_id,
            attended_flag=body.attended_flag,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/local-training/tasks/{task_id}")
def update_local_training_task(task_id: UUID, body: LocalTrainingTaskStatusRequest):
    try:
        return local_training_crm.toggle_task(task_id=task_id, status=body.status)
    except Exception as exc:
        raise _to_http(exc)


# ── Strategic Outreach ───────────────────────────────────────────────────────

@router.get("/strategic-outreach/dashboard", response_model=StrategicOutreachDashboard)
def get_strategic_outreach_dashboard(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_strategic_outreach.get_dashboard(env_id=env_id, business_id=business_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/strategic-outreach/leads", response_model=StrategicLeadOut, status_code=201)
def upsert_strategic_lead(body: StrategicLeadUpsertRequest):
    try:
        return cro_strategic_outreach.upsert_strategic_lead(
            env_id=body.env_id,
            business_id=body.business_id,
            lead_profile_id=body.lead_profile_id,
            employee_range=body.employee_range,
            multi_entity_flag=body.multi_entity_flag,
            pe_backed_flag=body.pe_backed_flag,
            estimated_system_stack=body.estimated_system_stack,
            ai_pressure_score=body.ai_pressure_score,
            reporting_complexity_score=body.reporting_complexity_score,
            governance_risk_score=body.governance_risk_score,
            vendor_fragmentation_score=body.vendor_fragmentation_score,
            status=body.status,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/strategic-outreach/hypotheses", response_model=LeadHypothesisOut, status_code=201)
def upsert_strategic_hypothesis(body: LeadHypothesisUpsertRequest):
    try:
        return cro_strategic_outreach.upsert_hypothesis(
            env_id=body.env_id,
            business_id=body.business_id,
            lead_profile_id=body.lead_profile_id,
            ai_roi_leakage_notes=body.ai_roi_leakage_notes,
            erp_integration_risk_notes=body.erp_integration_risk_notes,
            reconciliation_fragility_notes=body.reconciliation_fragility_notes,
            governance_gap_notes=body.governance_gap_notes,
            vendor_fatigue_exposure=body.vendor_fatigue_exposure,
            primary_wedge_angle=body.primary_wedge_angle,
            top_2_capabilities=body.top_2_capabilities,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/strategic-outreach/contacts", response_model=StrategicContactOut, status_code=201)
def create_strategic_contact(body: StrategicContactCreateRequest):
    try:
        return cro_strategic_outreach.create_contact(
            env_id=body.env_id,
            business_id=body.business_id,
            lead_profile_id=body.lead_profile_id,
            name=body.name,
            title=body.title,
            linkedin_url=body.linkedin_url,
            email=body.email,
            buyer_type=body.buyer_type,
            authority_level=body.authority_level,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/strategic-outreach/triggers", response_model=TriggerSignalOut, status_code=201)
def create_strategic_trigger(body: TriggerSignalCreateRequest):
    try:
        return cro_strategic_outreach.create_trigger_signal(
            env_id=body.env_id,
            business_id=body.business_id,
            lead_profile_id=body.lead_profile_id,
            trigger_type=body.trigger_type,
            source_url=body.source_url,
            summary=body.summary,
            detected_at=body.detected_at,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/strategic-outreach/outreach/{sequence_id}/approve", response_model=OutreachSequenceOut)
def approve_strategic_outreach(sequence_id: UUID, body: OutreachSequenceApproveRequest):
    try:
        return cro_strategic_outreach.approve_outreach_sequence(
            sequence_id=sequence_id,
            approved_message=body.approved_message,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/strategic-outreach/diagnostics", response_model=DiagnosticSessionOut, status_code=201)
def create_strategic_diagnostic(body: DiagnosticSessionCreateRequest):
    try:
        return cro_strategic_outreach.create_diagnostic_session(
            env_id=body.env_id,
            business_id=body.business_id,
            lead_profile_id=body.lead_profile_id,
            scheduled_date=body.scheduled_date,
            notes=body.notes,
            governance_findings=body.governance_findings,
            ai_readiness_score=body.ai_readiness_score,
            reconciliation_risk_score=body.reconciliation_risk_score,
            recommended_first_intervention=body.recommended_first_intervention,
            question_responses=body.question_responses,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/strategic-outreach/deliverables", response_model=DeliverableOut, status_code=201)
def create_strategic_deliverable(body: DeliverableCreateRequest):
    try:
        return cro_strategic_outreach.generate_deliverable(
            env_id=body.env_id,
            business_id=body.business_id,
            lead_profile_id=body.lead_profile_id,
            file_path=body.file_path,
            sent_date=body.sent_date,
            followup_status=body.followup_status,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/strategic-outreach/monitor", response_model=StrategicOutreachMonitorResult, status_code=201)
def run_strategic_outreach_monitor(body: StrategicOutreachSeedRequest):
    try:
        result = cro_strategic_outreach.run_daily_monitor(env_id=body.env_id, business_id=body.business_id)
        _log("cro.strategic_outreach.monitor", "Strategic outreach monitor completed")
        return result
    except Exception as exc:
        raise _to_http(exc)


@router.post("/strategic-outreach/seed", response_model=StrategicOutreachSeedResult, status_code=201)
def seed_strategic_outreach(body: StrategicOutreachSeedRequest):
    try:
        result = cro_strategic_outreach.seed_novendor_strategic_outreach(
            env_id=body.env_id,
            business_id=body.business_id,
        )
        _log("cro.strategic_outreach.seed", "Strategic outreach targets seeded")
        return result
    except Exception as exc:
        raise _to_http(exc)


# ─── Next Actions ──────────────────────────────────────────────────────────

@router.post("/next-actions", response_model=NextActionOut, status_code=201)
def create_next_action(body: NextActionCreateRequest):
    try:
        return cro_next_actions.create_next_action(
            env_id=body.env_id,
            business_id=body.business_id,
            entity_type=body.entity_type,
            entity_id=body.entity_id,
            action_type=body.action_type,
            description=body.description,
            due_date=body.due_date,
            owner=body.owner,
            priority=body.priority,
            notes=body.notes,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/next-actions", response_model=list[NextActionOut])
def list_next_actions(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    status: str | None = Query("pending"),
    entity_type: str | None = Query(None),
    entity_id: UUID | None = Query(None),
):
    try:
        return cro_next_actions.list_next_actions(
            env_id=env_id,
            business_id=business_id,
            status=status,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/next-actions/today-overdue", response_model=TodayOverdueOut)
def get_today_overdue(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_next_actions.get_today_overdue(
            env_id=env_id,
            business_id=business_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/next-actions/{action_id}/complete", response_model=NextActionOut)
def complete_next_action(action_id: UUID, body: NextActionCompleteRequest, business_id: UUID = Query(...)):
    try:
        return cro_next_actions.complete_next_action(
            business_id=business_id,
            action_id=action_id,
            notes=body.notes,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/next-actions/{action_id}/skip", response_model=NextActionOut)
def skip_next_action(action_id: UUID, body: NextActionSkipRequest, business_id: UUID = Query(...)):
    try:
        return cro_next_actions.skip_next_action(
            business_id=business_id,
            action_id=action_id,
            reason=body.reason,
        )
    except Exception as exc:
        raise _to_http(exc)


# ─── Lead Pipeline Stage ───────────────────────────────────────────────────

@router.post("/leads/{lead_id}/stage", response_model=LeadOut)
def update_lead_stage(lead_id: UUID, body: UpdateLeadStageRequest, env_id: str = Query(...), business_id: UUID = Query(...)):
    try:
        result = cro_leads.update_lead_pipeline_stage(
            env_id=env_id,
            business_id=business_id,
            lead_id=lead_id,
            stage=body.stage,
        )
        # Convert database result to LeadOut schema
        return {
            "crm_account_id": result["crm_account_id"],
            "lead_profile_id": result["id"],
            "company_name": None,
            "industry": None,
            "website": None,
            "account_type": None,
            "ai_maturity": None,
            "pain_category": None,
            "lead_score": result["lead_score"],
            "lead_source": None,
            "company_size": None,
            "revenue_band": None,
            "erp_system": None,
            "estimated_budget": None,
            "qualified_at": None,
            "disqualified_at": None,
            "stage_key": result["pipeline_stage"],
            "stage_label": result["pipeline_stage"],
            "created_at": result["updated_at"],
        }
    except Exception as exc:
        raise _to_http(exc)


# ─���─ Activities ──────────────────────────────────────────────────────────

@router.get("/activities")
def list_activities(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    account_id: UUID | None = Query(None),
    contact_id: UUID | None = Query(None),
    opportunity_id: UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List CRM activities with optional entity filters."""
    try:
        from app.services import crm
        return crm.list_activities(
            business_id=business_id,
            crm_account_id=account_id,
            crm_opportunity_id=opportunity_id,
            limit=limit,
        )
    except Exception as exc:
        raise _to_http(exc)


# ─── Entity Detail Views ──────────────────────────────────────────────────

@router.get("/accounts/{account_id}")
def get_account_detail(
    account_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_entity_detail.get_account_detail(
            env_id=env_id, business_id=business_id, account_id=account_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/accounts/{account_id}/contacts")
def get_account_contacts(
    account_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_entity_detail.get_account_contacts(
            business_id=business_id, account_id=account_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/accounts/{account_id}/opportunities")
def get_account_opportunities(
    account_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_entity_detail.get_account_opportunities(
            business_id=business_id, account_id=account_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/opportunities/{opportunity_id}")
def get_opportunity_detail(
    opportunity_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_entity_detail.get_opportunity_detail(
            business_id=business_id, opportunity_id=opportunity_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/opportunities/{opportunity_id}/contacts")
def get_opportunity_contacts(
    opportunity_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_entity_detail.get_opportunity_contacts(
            business_id=business_id, opportunity_id=opportunity_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/opportunities/{opportunity_id}/stage-history")
def get_opportunity_stage_history(
    opportunity_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_entity_detail.get_opportunity_stage_history(
            business_id=business_id, opportunity_id=opportunity_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/contacts/{contact_id}")
def get_contact_detail(
    contact_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_entity_detail.get_contact_detail(
            business_id=business_id, contact_id=contact_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/contacts/{contact_id}/outreach")
def get_contact_outreach(
    contact_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_entity_detail.get_contact_outreach_history(
            business_id=business_id, contact_id=contact_id,
        )
    except Exception as exc:
        raise _to_http(exc)


# ═══════════════════════════════════════════════════════════════════════
# Proof Assets
# ═══════════════════════════════════════════════════════════════════════

@router.get("/proof-assets", response_model=list[ProofAssetOut])
def list_proof_assets_route(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    status: str | None = Query(None),
):
    try:
        return cro_proof_assets.list_proof_assets(
            env_id=env_id, business_id=business_id, status_filter=status,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/proof-assets/summary", response_model=ProofAssetSummaryOut)
def proof_asset_summary_route(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_proof_assets.get_proof_asset_summary(
            env_id=env_id, business_id=business_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/proof-assets", response_model=ProofAssetOut, status_code=201)
def create_proof_asset_route(body: ProofAssetCreateRequest):
    try:
        return cro_proof_assets.create_proof_asset(
            env_id=body.env_id,
            business_id=body.business_id,
            asset_type=body.asset_type,
            title=body.title,
            description=body.description,
            status=body.status,
            linked_offer_type=body.linked_offer_type,
            file_path=body.file_path,
            content_markdown=body.content_markdown,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/proof-assets/{asset_id}", response_model=ProofAssetOut)
def update_proof_asset_route(asset_id: UUID, body: ProofAssetUpdateRequest):
    try:
        result = cro_proof_assets.update_proof_asset(
            asset_id=asset_id,
            status=body.status,
            title=body.title,
            description=body.description,
            content_markdown=body.content_markdown,
            file_path=body.file_path,
        )
        if not result:
            raise HTTPException(404, "Proof asset not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise _to_http(exc)


# ═══════════════════════════════════════════════════════════════════════
# Objections
# ═══════════════════════════════════════════════════════════════════════

@router.get("/objections", response_model=list[ObjectionOut])
def list_objections_route(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    outcome: str | None = Query(None),
):
    try:
        return cro_objections.list_objections(
            env_id=env_id, business_id=business_id, outcome_filter=outcome,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/objections", response_model=ObjectionOut, status_code=201)
def create_objection_route(body: ObjectionCreateRequest):
    try:
        return cro_objections.create_objection(
            env_id=body.env_id,
            business_id=body.business_id,
            objection_type=body.objection_type,
            summary=body.summary,
            crm_account_id=body.crm_account_id,
            crm_opportunity_id=body.crm_opportunity_id,
            source_conversation=body.source_conversation,
            response_strategy=body.response_strategy,
            confidence=body.confidence,
            linked_feature_gap=body.linked_feature_gap,
            linked_offer_type=body.linked_offer_type,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/objections/{objection_id}", response_model=ObjectionOut)
def update_objection_route(objection_id: UUID, body: ObjectionUpdateRequest):
    try:
        result = cro_objections.update_objection(
            objection_id=objection_id,
            outcome=body.outcome,
            response_strategy=body.response_strategy,
            confidence=body.confidence,
        )
        if not result:
            raise HTTPException(404, "Objection not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise _to_http(exc)


@router.get("/objections/top")
def top_objections_route(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    limit: int = Query(5, ge=1, le=20),
):
    try:
        return cro_objections.get_top_objections(
            env_id=env_id, business_id=business_id, limit=limit,
        )
    except Exception as exc:
        raise _to_http(exc)


# ═══════════════════════════════════════════════════════════════════════
# Demo Readiness
# ═══════════════════════════════════════════════════════════════════════

@router.get("/demo-readiness", response_model=list[DemoReadinessOut])
def list_demo_readiness_route(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return cro_demo_readiness.list_demo_readiness(
            env_id=env_id, business_id=business_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/demo-readiness/{demo_id}", response_model=DemoReadinessOut)
def update_demo_readiness_route(demo_id: UUID, body: DemoReadinessUpdateRequest):
    try:
        result = cro_demo_readiness.update_demo_readiness(
            demo_id=demo_id,
            status=body.status,
            blockers=body.blockers,
            notes=body.notes,
            last_tested_at=body.last_tested_at,
        )
        if not result:
            raise HTTPException(404, "Demo readiness record not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise _to_http(exc)


# ═══════════════════════════════════════════════════════════════════════
# Stale Records
# ═══════════════════════════════════════════════════════════════════════

@router.get("/health/stale", response_model=StaleRecordsOut)
def stale_records_route(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    stale_days: int = Query(14, ge=1, le=90),
):
    try:
        return cro_metrics_engine.get_stale_records(
            env_id=env_id, business_id=business_id, stale_days=stale_days,
        )
    except Exception as exc:
        raise _to_http(exc)
