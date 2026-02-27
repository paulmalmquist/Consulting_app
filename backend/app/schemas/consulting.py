"""Pydantic schemas for the Consulting Revenue OS endpoints."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


# ── Lead ────────────────────────────────────────────────────────────────────────

class LeadCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    company_name: str
    industry: str | None = None
    website: str | None = None
    ai_maturity: str | None = None
    pain_category: str | None = None
    lead_source: str | None = None
    company_size: str | None = None
    revenue_band: str | None = None
    erp_system: str | None = None
    estimated_budget: Decimal | None = None
    # Primary contact (optional)
    contact_name: str | None = None
    contact_email: str | None = None
    contact_title: str | None = None
    contact_linkedin: str | None = None


class LeadOut(BaseModel):
    crm_account_id: UUID
    lead_profile_id: UUID
    company_name: str
    industry: str | None = None
    website: str | None = None
    account_type: str
    ai_maturity: str | None = None
    pain_category: str | None = None
    lead_score: int
    lead_source: str | None = None
    company_size: str | None = None
    revenue_band: str | None = None
    erp_system: str | None = None
    estimated_budget: Decimal | None = None
    qualified_at: datetime | None = None
    disqualified_at: datetime | None = None
    stage_key: str | None = None
    stage_label: str | None = None
    created_at: datetime


class LeadScoreUpdate(BaseModel):
    score: int = Field(ge=0, le=100)


# ── Pipeline ────────────────────────────────────────────────────────────────────

class PipelineStageOut(BaseModel):
    crm_pipeline_stage_id: UUID
    key: str
    label: str
    stage_order: int
    win_probability: Decimal | None = None
    is_closed: bool
    is_won: bool
    created_at: datetime


class PipelineKanbanCard(BaseModel):
    crm_opportunity_id: UUID
    name: str
    amount: Decimal
    account_name: str | None = None
    stage_key: str
    stage_label: str
    expected_close_date: date | None = None
    created_at: datetime


class PipelineKanbanColumn(BaseModel):
    stage_key: str
    stage_label: str
    stage_order: int
    win_probability: Decimal | None = None
    cards: list[PipelineKanbanCard]
    total_value: Decimal
    weighted_value: Decimal


class PipelineKanbanResult(BaseModel):
    columns: list[PipelineKanbanColumn]
    total_pipeline: Decimal
    weighted_pipeline: Decimal


class AdvanceStageRequest(BaseModel):
    env_id: str
    business_id: UUID
    opportunity_id: UUID
    to_stage_key: str
    note: str | None = None


# ── Outreach ────────────────────────────────────────────────────────────────────

class OutreachTemplateCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    name: str
    channel: str
    category: str | None = None
    subject_template: str | None = None
    body_template: str


class OutreachTemplateOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    name: str
    channel: str
    category: str | None = None
    subject_template: str | None = None
    body_template: str
    is_active: bool
    use_count: int
    reply_count: int
    created_at: datetime


class OutreachLogCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    crm_account_id: UUID
    crm_contact_id: UUID | None = None
    template_id: UUID | None = None
    channel: str
    direction: str = "outbound"
    subject: str | None = None
    body_preview: str | None = None
    meeting_booked: bool = False
    sent_by: str | None = None


class OutreachLogOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    crm_account_id: UUID | None = None
    crm_contact_id: UUID | None = None
    template_id: UUID | None = None
    channel: str
    direction: str
    subject: str | None = None
    body_preview: str | None = None
    sent_at: datetime
    replied_at: datetime | None = None
    reply_sentiment: str | None = None
    meeting_booked: bool
    bounce: bool
    sent_by: str | None = None
    account_name: str | None = None
    contact_name: str | None = None
    created_at: datetime


class OutreachReplyRequest(BaseModel):
    sentiment: str = Field(pattern=r"^(positive|neutral|negative)$")
    meeting_booked: bool = False


class OutreachAnalyticsOut(BaseModel):
    total_sent_30d: int
    total_replied_30d: int
    response_rate_30d: Decimal | None = None
    meetings_booked_30d: int
    by_channel: list[dict]
    by_template: list[dict]


# ── Proposals ───────────────────────────────────────────────────────────────────

class ProposalCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    crm_opportunity_id: UUID | None = None
    crm_account_id: UUID | None = None
    title: str
    pricing_model: str | None = None
    total_value: Decimal
    cost_estimate: Decimal = Decimal("0")
    valid_until: date | None = None
    scope_summary: str | None = None
    risk_notes: str | None = None


class ProposalOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    crm_opportunity_id: UUID | None = None
    crm_account_id: UUID | None = None
    title: str
    version: int
    status: str
    pricing_model: str | None = None
    total_value: Decimal
    cost_estimate: Decimal
    margin_pct: Decimal | None = None
    valid_until: date | None = None
    sent_at: datetime | None = None
    accepted_at: datetime | None = None
    rejected_at: datetime | None = None
    scope_summary: str | None = None
    risk_notes: str | None = None
    account_name: str | None = None
    created_at: datetime


class ProposalStatusUpdate(BaseModel):
    status: str = Field(pattern=r"^(draft|sent|viewed|accepted|rejected|expired)$")
    rejection_reason: str | None = None


# ── Clients ─────────────────────────────────────────────────────────────────────

class ConvertToClientRequest(BaseModel):
    env_id: str
    business_id: UUID
    crm_account_id: UUID
    crm_opportunity_id: UUID | None = None
    proposal_id: UUID | None = None
    account_owner: str | None = None
    start_date: date | None = None


class ClientOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    crm_account_id: UUID
    company_name: str
    client_status: str
    account_owner: str | None = None
    start_date: date
    lifetime_value: Decimal
    active_engagements: int = 0
    total_revenue: Decimal = Decimal("0")
    created_at: datetime


# ── Engagements ─────────────────────────────────────────────────────────────────

class EngagementCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    client_id: UUID
    name: str
    engagement_type: str
    budget: Decimal = Decimal("0")
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class EngagementOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    client_id: UUID
    name: str
    engagement_type: str
    status: str
    start_date: date | None = None
    end_date: date | None = None
    budget: Decimal
    actual_spend: Decimal
    margin_pct: Decimal | None = None
    notes: str | None = None
    created_at: datetime


# ── Revenue Schedule ────────────────────────────────────────────────────────────

class RevenueEntryCreateRequest(BaseModel):
    engagement_id: UUID
    client_id: UUID
    period_date: date
    amount: Decimal
    notes: str | None = None


class RevenueScheduleCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    entries: list[RevenueEntryCreateRequest]


class RevenueEntryOut(BaseModel):
    id: UUID
    engagement_id: UUID
    client_id: UUID
    period_date: date
    amount: Decimal
    currency: str
    invoice_status: str
    invoiced_at: datetime | None = None
    paid_at: datetime | None = None
    notes: str | None = None
    created_at: datetime


class RevenueInvoiceStatusUpdate(BaseModel):
    invoice_status: str = Field(pattern=r"^(scheduled|invoiced|paid|overdue|written_off)$")


class RevenueSummaryOut(BaseModel):
    revenue_mtd: Decimal
    revenue_qtd: Decimal
    revenue_ytd: Decimal
    scheduled_next_30d: Decimal
    overdue: Decimal


# ── Metrics ─────────────────────────────────────────────────────────────────────

class MetricsSnapshotOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    snapshot_date: date
    weighted_pipeline: Decimal
    unweighted_pipeline: Decimal
    open_opportunities: int
    close_rate_90d: Decimal | None = None
    won_count_90d: int
    lost_count_90d: int
    outreach_count_30d: int
    response_rate_30d: Decimal | None = None
    meetings_30d: int
    revenue_mtd: Decimal
    revenue_qtd: Decimal
    forecast_90d: Decimal
    avg_deal_size: Decimal | None = None
    avg_margin_pct: Decimal | None = None
    active_engagements: int
    active_clients: int
    computed_at: datetime
    input_hash: str | None = None
    created_at: datetime


# ── Seed ────────────────────────────────────────────────────────────────────────

class SeedRequest(BaseModel):
    env_id: str
    business_id: UUID


class SeedResult(BaseModel):
    status: str
    pipeline_stages_seeded: int
    leads_seeded: int
    contacts_seeded: int
    outreach_templates_seeded: int
    outreach_logs_seeded: int
    proposals_seeded: int
    clients_seeded: int
    engagements_seeded: int
    revenue_entries_seeded: int


# ── Strategic Outreach ───────────────────────────────────────────────────────

class StrategicLeadUpsertRequest(BaseModel):
    env_id: str
    business_id: UUID
    lead_profile_id: UUID
    employee_range: str
    multi_entity_flag: bool = False
    pe_backed_flag: bool = False
    estimated_system_stack: list[str] = Field(default_factory=list)
    ai_pressure_score: int = Field(ge=1, le=5)
    reporting_complexity_score: int = Field(ge=1, le=5)
    governance_risk_score: int = Field(ge=1, le=5)
    vendor_fragmentation_score: int = Field(ge=1, le=5)
    status: str = Field(pattern=r"^(Identified|Hypothesis Built|Outreach Drafted|Sent|Engaged|Diagnostic Scheduled|Deliverable Sent|Closed)$")


class StrategicLeadOut(BaseModel):
    id: UUID
    lead_profile_id: UUID
    composite_priority_score: int
    status: str


class LeadHypothesisUpsertRequest(BaseModel):
    env_id: str
    business_id: UUID
    lead_profile_id: UUID
    ai_roi_leakage_notes: str | None = None
    erp_integration_risk_notes: str | None = None
    reconciliation_fragility_notes: str | None = None
    governance_gap_notes: str | None = None
    vendor_fatigue_exposure: int | None = Field(default=None, ge=1, le=5)
    primary_wedge_angle: str | None = None
    top_2_capabilities: list[str] = Field(default_factory=list, max_length=2)


class LeadHypothesisOut(BaseModel):
    id: UUID
    lead_profile_id: UUID
    primary_wedge_angle: str | None = None


class StrategicContactCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    lead_profile_id: UUID
    name: str
    title: str
    linkedin_url: str | None = None
    email: str | None = None
    buyer_type: str = Field(pattern=r"^(CFO|COO|CIO|Other)$")
    authority_level: str = Field(pattern=r"^(High|Medium|Low)$")


class StrategicContactOut(BaseModel):
    id: UUID
    lead_profile_id: UUID
    name: str
    title: str
    buyer_type: str
    authority_level: str
    created_at: datetime


class TriggerSignalCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    lead_profile_id: UUID
    trigger_type: str = Field(pattern=r"^(ERP_Announcement|AI_Initiative|CFO_Hire|Job_Posting|PE_Acquisition|Other)$")
    source_url: str
    summary: str
    detected_at: datetime | None = None


class TriggerSignalOut(BaseModel):
    id: UUID
    lead_profile_id: UUID
    trigger_type: str
    source_url: str
    summary: str
    detected_at: datetime


class OutreachSequenceApproveRequest(BaseModel):
    approved_message: str


class OutreachSequenceOut(BaseModel):
    id: UUID
    lead_profile_id: UUID
    sequence_stage: int
    draft_message: str
    approved_message: str | None = None
    sent_timestamp: datetime | None = None
    response_status: str
    followup_due_date: date | None = None
    created_at: datetime


class DiagnosticSessionCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    lead_profile_id: UUID
    scheduled_date: date
    notes: str | None = None
    governance_findings: str | None = None
    ai_readiness_score: int | None = Field(default=None, ge=1, le=5)
    reconciliation_risk_score: int | None = Field(default=None, ge=1, le=5)
    recommended_first_intervention: str | None = None
    question_responses: dict[str, str] = Field(default_factory=dict)


class DiagnosticSessionOut(BaseModel):
    id: UUID
    lead_profile_id: UUID
    scheduled_date: date
    notes: str | None = None
    governance_findings: str | None = None
    ai_readiness_score: int | None = None
    reconciliation_risk_score: int | None = None
    recommended_first_intervention: str | None = None
    question_responses: dict[str, str]
    created_at: datetime


class DeliverableCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    lead_profile_id: UUID
    file_path: str
    sent_date: date | None = None
    followup_status: str = Field(pattern=r"^(pending|scheduled|completed)$")


class DeliverableOut(BaseModel):
    id: UUID
    lead_profile_id: UUID
    file_path: str
    summary: str
    sent_date: date
    followup_status: str
    content_markdown: str
    created_at: datetime


class StrategicOutreachSeedRequest(BaseModel):
    env_id: str
    business_id: UUID


class StrategicOutreachSeedResult(BaseModel):
    status: str
    leads_seeded: int


class StrategicOutreachMonitorResult(BaseModel):
    status: str
    reviewed_leads: int
    triggered_drafts: int


class StrategicOutreachMetrics(BaseModel):
    high_priority: int
    medium_priority: int
    low_priority: int
    time_in_stage_days: Decimal | None = None
    engagement_rate: Decimal | None = None
    sent_count: int
    diagnostic_questions: list[str]


class StrategicOutreachStatusFunnelItem(BaseModel):
    status: str
    count: int


class StrategicOutreachDashboardLead(BaseModel):
    id: UUID
    lead_profile_id: UUID
    crm_account_id: UUID
    company_name: str
    industry: str | None = None
    employee_range: str
    multi_entity_flag: bool
    pe_backed_flag: bool
    estimated_system_stack: list[str] = Field(default_factory=list)
    ai_pressure_score: int
    reporting_complexity_score: int
    governance_risk_score: int
    vendor_fragmentation_score: int
    composite_priority_score: int
    status: str
    created_at: datetime
    updated_at: datetime
    primary_wedge_angle: str | None = None
    top_2_capabilities: list[str] = Field(default_factory=list)


class StrategicOutreachDashboard(BaseModel):
    metrics: StrategicOutreachMetrics
    status_funnel: list[StrategicOutreachStatusFunnelItem]
    leads: list[StrategicOutreachDashboardLead]
    trigger_signals: list[TriggerSignalOut]
    outreach_queue: list[OutreachSequenceOut]
    diagnostics: list[DiagnosticSessionOut]
    deliverables: list[DeliverableOut]
