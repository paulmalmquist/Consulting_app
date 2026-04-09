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
    amount: float
    account_name: str | None = None
    stage_key: str
    stage_label: str
    expected_close_date: date | None = None
    created_at: datetime
    contact_name: str | None = None
    last_activity_at: datetime | None = None
    next_action_description: str | None = None
    next_action_due: date | None = None
    next_action_type: str | None = None


class PipelineKanbanColumn(BaseModel):
    stage_key: str
    stage_label: str
    stage_order: int
    win_probability: float | None = None
    cards: list[PipelineKanbanCard]
    total_value: float
    weighted_value: float


class PipelineKanbanResult(BaseModel):
    columns: list[PipelineKanbanColumn]
    total_pipeline: float
    weighted_pipeline: float


class ExecutionRankedActionOut(BaseModel):
    action_key: str
    label: str
    description: str
    impact: str
    urgency: str
    reasoning: str


class ExecutionStageSuggestionOut(BaseModel):
    suggested_execution_column: str
    underlying_stage_key: str
    reasoning: str
    confidence: float
    trigger_source: str


class ExecutionDraftOut(BaseModel):
    kind: str
    angle_key: str
    framing: str
    tone: str
    cta: str
    subject: str
    body: str


class MeetingPrepOut(BaseModel):
    company_summary: str
    likely_pain_points: list[str]
    tailored_demo_path: str
    key_questions: list[str]
    risks_to_watch: list[str]


class ExecutionCardOut(BaseModel):
    crm_opportunity_id: UUID
    crm_account_id: UUID | None = None
    name: str
    amount: float
    status: str
    account_name: str | None = None
    industry: str | None = None
    stage_key: str | None = None
    stage_label: str | None = None
    win_probability: float | None = None
    contact_name: str | None = None
    expected_close_date: date | None = None
    created_at: datetime
    last_activity_at: datetime | None = None
    next_action_description: str | None = None
    next_action_due: date | None = None
    next_action_type: str | None = None
    execution_column_key: str
    execution_column_label: str
    personas: list[str] = Field(default_factory=list)
    pain_hypothesis: str | None = None
    value_prop: str | None = None
    demo_angle: str | None = None
    priority_score: int
    engagement_summary: str | None = None
    execution_pressure: str
    momentum_status: str
    risk_flags: list[str] = Field(default_factory=list)
    deal_drift_status: str
    latest_angle_used: str | None = None
    latest_objection: str | None = None
    ranked_next_actions: list[ExecutionRankedActionOut] = Field(default_factory=list)
    stage_suggestions: list[ExecutionStageSuggestionOut] = Field(default_factory=list)
    auto_draft_stack: dict = Field(default_factory=dict)
    execution_state: dict = Field(default_factory=dict)
    narrative_memory: dict = Field(default_factory=dict)


class ExecutionBoardColumnOut(BaseModel):
    execution_column_key: str
    execution_column_label: str
    cards: list[ExecutionCardOut]
    total_value: float
    weighted_value: float


class ExecutionAlertOut(BaseModel):
    level: str
    deal_id: str
    message: str


class ExecutionBoardOut(BaseModel):
    columns: list[ExecutionBoardColumnOut]
    total_pipeline: float
    weighted_pipeline: float
    today_queue: list[ExecutionCardOut]
    critical_deals: list[ExecutionCardOut]
    alerts: list[ExecutionAlertOut]


class ExecutionDetailOut(BaseModel):
    card: ExecutionCardOut
    ranked_next_actions: list[ExecutionRankedActionOut]
    stage_suggestions: list[ExecutionStageSuggestionOut]
    auto_draft_stack: dict


class DailyExecutionActionOut(BaseModel):
    deal_id: UUID
    company_name: str | None = None
    execution_pressure: str
    next_actions: list[ExecutionRankedActionOut]
    drafts: dict


class DailyExecutionBriefOut(BaseModel):
    generated_at: str
    top_deals: list[ExecutionCardOut]
    actions: list[DailyExecutionActionOut]
    critical_count: int


class SimulateActionRequest(BaseModel):
    action: str


class SimulateActionOut(BaseModel):
    audit_id: str | None = None
    action: str
    expected_outcome: str
    reasoning: str
    deal_name: str


class ExecutionCommandRequest(BaseModel):
    env_id: str
    business_id: UUID
    command: str
    confirm: bool = False


class ExecutionCommandResult(BaseModel):
    intent: str
    requires_confirmation: bool
    audit_id: str | None = None
    result: dict | list


class AdvanceStageRequest(BaseModel):
    env_id: str
    business_id: UUID
    opportunity_id: UUID
    to_stage_key: str
    note: str | None = None
    close_reason: str | None = None
    competitive_incumbent: str | None = None
    close_notes: str | None = None


# ── Winston Assist ────────────────────────────────────────────────────────────

class WinstonAssistRequest(BaseModel):
    deal_id: UUID
    env_id: str
    business_id: UUID


class WinstonAssistResult(BaseModel):
    state: list[str]
    problem: str
    next_step: str
    category: str
    confidence: int
    copyable_prompt: str
    deal_id: str
    deal_name: str
    deal_score: int


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


class ProposalGenerateRequest(BaseModel):
    env_id: str
    business_id: UUID
    crm_account_id: UUID


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


# ── Loop Intelligence ─────────────────────────────────────────────────────────

class LoopRoleInput(BaseModel):
    role_name: str
    loaded_hourly_rate: Decimal = Field(ge=0)
    active_minutes: Decimal = Field(ge=0)
    notes: str | None = None


class LoopRoleOut(BaseModel):
    id: UUID
    loop_id: UUID
    role_name: str
    loaded_hourly_rate: Decimal
    active_minutes: Decimal
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class LoopMetricsOut(BaseModel):
    role_count: int
    loop_cost_per_run: Decimal
    annual_estimated_cost: Decimal


class LoopInterventionCreateRequest(BaseModel):
    intervention_type: str = Field(
        pattern=r"^(remove_step|consolidate_role|automate_step|policy_rewrite|data_standardize|other)$"
    )
    notes: str | None = None
    after_snapshot: dict[str, object] | None = None
    observed_delta_percent: Decimal | None = None


class LoopInterventionOut(BaseModel):
    id: UUID
    loop_id: UUID
    intervention_type: str
    notes: str | None = None
    before_snapshot: dict[str, object]
    after_snapshot: dict[str, object] | None = None
    observed_delta_percent: Decimal | None = None
    created_at: datetime
    updated_at: datetime
    loop_metrics: LoopMetricsOut | None = None


class LoopOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    client_id: UUID | None = None
    name: str
    process_domain: str
    description: str | None = None
    trigger_type: str = Field(pattern=r"^(scheduled|event|manual)$")
    frequency_type: str = Field(pattern=r"^(daily|weekly|monthly|quarterly|ad_hoc)$")
    frequency_per_year: Decimal = Field(ge=0)
    status: str = Field(pattern=r"^(observed|simplifying|automating|stabilized)$")
    control_maturity_stage: int = Field(ge=1, le=5)
    automation_readiness_score: int = Field(ge=0, le=100)
    avg_wait_time_minutes: Decimal = Field(ge=0)
    rework_rate_percent: Decimal = Field(ge=0, le=100)
    role_count: int
    loop_cost_per_run: Decimal
    annual_estimated_cost: Decimal
    created_at: datetime
    updated_at: datetime


class LoopDetailOut(LoopOut):
    roles: list[LoopRoleOut]
    interventions: list[LoopInterventionOut]


class LoopCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    client_id: UUID | None = None
    name: str
    process_domain: str
    description: str | None = None
    trigger_type: str = Field(pattern=r"^(scheduled|event|manual)$")
    frequency_type: str = Field(pattern=r"^(daily|weekly|monthly|quarterly|ad_hoc)$")
    frequency_per_year: Decimal = Field(ge=0)
    status: str = Field(pattern=r"^(observed|simplifying|automating|stabilized)$")
    control_maturity_stage: int = Field(ge=1, le=5)
    automation_readiness_score: int = Field(ge=0, le=100)
    avg_wait_time_minutes: Decimal = Field(ge=0)
    rework_rate_percent: Decimal = Field(ge=0, le=100)
    roles: list[LoopRoleInput] = Field(min_length=1)


class LoopUpdateRequest(BaseModel):
    client_id: UUID | None = None
    name: str
    process_domain: str
    description: str | None = None
    trigger_type: str = Field(pattern=r"^(scheduled|event|manual)$")
    frequency_type: str = Field(pattern=r"^(daily|weekly|monthly|quarterly|ad_hoc)$")
    frequency_per_year: Decimal = Field(ge=0)
    status: str = Field(pattern=r"^(observed|simplifying|automating|stabilized)$")
    control_maturity_stage: int = Field(ge=1, le=5)
    automation_readiness_score: int = Field(ge=0, le=100)
    avg_wait_time_minutes: Decimal = Field(ge=0)
    rework_rate_percent: Decimal = Field(ge=0, le=100)
    roles: list[LoopRoleInput] | None = Field(default=None, min_length=1)


class LoopTopCostDriverOut(BaseModel):
    id: UUID
    name: str
    annual_estimated_cost: Decimal


class LoopSummaryOut(BaseModel):
    total_annual_cost: Decimal
    loop_count: int
    avg_maturity_stage: Decimal
    top_5_by_cost: list[LoopTopCostDriverOut]
    status_counts: dict[str, int]


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
    loops_seeded: int = 0


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


class StrategicLeadAdvanceRequest(BaseModel):
    status: str = Field(pattern=r"^(Identified|Hypothesis Built|Outreach Drafted|Sent|Engaged|Diagnostic Scheduled|Deliverable Sent|Closed)$")


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


# ─── Next Actions ──────────────────────────────────────────────────────

class NextActionCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    entity_type: str  # 'account', 'contact', 'opportunity', 'lead'
    entity_id: UUID
    action_type: str  # 'email', 'call', 'meeting', 'research', 'follow_up', 'proposal', 'linkedin', 'task', 'other'
    description: str
    due_date: date
    owner: str | None = None
    priority: str = "normal"  # 'low', 'normal', 'high', 'urgent'
    notes: str | None = None


class NextActionOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    entity_type: str
    entity_id: UUID
    entity_name: str | None = None
    action_type: str
    description: str
    due_date: date
    owner: str | None = None
    status: str  # 'pending', 'in_progress', 'completed', 'skipped'
    completed_at: datetime | None = None
    priority: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class NextActionCompleteRequest(BaseModel):
    notes: str | None = None


class NextActionSkipRequest(BaseModel):
    reason: str | None = None


class TodayOverdueOut(BaseModel):
    today: list[NextActionOut]
    overdue: list[NextActionOut]
    today_count: int
    overdue_count: int


class UpdateLeadStageRequest(BaseModel):
    stage: str


# ─── Proof Assets ─────────────────────────────────────────────────────

class ProofAssetCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    asset_type: str
    title: str
    description: str | None = None
    status: str = "draft"
    linked_offer_type: str | None = None
    file_path: str | None = None
    content_markdown: str | None = None


class ProofAssetUpdateRequest(BaseModel):
    status: str | None = None
    title: str | None = None
    description: str | None = None
    content_markdown: str | None = None
    file_path: str | None = None


class ProofAssetOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    asset_type: str
    title: str
    description: str | None = None
    status: str
    linked_offer_type: str | None = None
    file_path: str | None = None
    content_markdown: str | None = None
    last_used_at: datetime | None = None
    use_count: int
    created_at: datetime
    updated_at: datetime


class ProofAssetSummaryOut(BaseModel):
    total: int
    ready: int
    draft: int
    needs_update: int
    archived: int


# ─── Objections ───────────────────────────────────────────────────────

class ObjectionCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    objection_type: str
    summary: str
    crm_account_id: UUID | None = None
    crm_opportunity_id: UUID | None = None
    source_conversation: str | None = None
    response_strategy: str | None = None
    confidence: int | None = Field(None, ge=1, le=5)
    linked_feature_gap: str | None = None
    linked_offer_type: str | None = None


class ObjectionUpdateRequest(BaseModel):
    outcome: str | None = None
    response_strategy: str | None = None
    confidence: int | None = Field(None, ge=1, le=5)


class ObjectionOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    crm_account_id: UUID | None = None
    crm_opportunity_id: UUID | None = None
    account_name: str | None = None
    objection_type: str
    summary: str
    source_conversation: str | None = None
    response_strategy: str | None = None
    confidence: int | None = None
    outcome: str
    linked_feature_gap: str | None = None
    linked_offer_type: str | None = None
    detected_at: datetime
    resolved_at: datetime | None = None
    created_at: datetime


class TopObjectionOut(BaseModel):
    objection_type: str
    freq: int
    examples: list[str]


# ─── Demo Readiness ───────────────────────────────────────────────────

class DemoReadinessUpdateRequest(BaseModel):
    status: str | None = None
    blockers: list[str] | None = None
    notes: str | None = None
    last_tested_at: datetime | None = None


class DemoReadinessOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    demo_name: str
    vertical: str | None = None
    status: str
    blockers: list[str] = Field(default_factory=list)
    last_tested_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ─── Stale Records ────────────────────────────────────────────────────

class StaleAccountOut(BaseModel):
    crm_account_id: UUID
    name: str
    industry: str | None = None
    last_activity_date: datetime | None = None
    days_stale: int


class OrphanOpportunityOut(BaseModel):
    crm_opportunity_id: UUID
    name: str
    account_name: str | None = None
    stage_key: str | None = None
    amount: Decimal | None = None


class StaleRecordsOut(BaseModel):
    stale_accounts: list[StaleAccountOut]
    orphan_opportunities: list[OrphanOpportunityOut]


# ── Daily Outreach Brief ─────────────────────────────────────────────────────

class ReadinessSignals(BaseModel):
    named_contact: bool
    titled_contact: bool
    channel_available: bool
    warm_intro_path: bool
    pain_thesis: bool
    matched_offer: bool
    proof_asset: bool
    next_step_defined: bool


class BestShotItem(BaseModel):
    crm_account_id: str
    company_name: str
    contact_name: str | None = None
    contact_title: str | None = None
    vertical: str | None = None
    matched_offer: str | None = None
    why_now_trigger: str | None = None
    recommended_channel: str
    cta: str
    readiness_score: int
    readiness_signals: ReadinessSignals
    missing_signals: list[str]
    composite_priority_score: int


class BlockingIssueBucket(BaseModel):
    crm_account_id: str
    company_name: str


class BlockingIssueSummary(BaseModel):
    missing_contact: int
    missing_channel: int
    missing_pain_thesis: int
    missing_matched_offer: int
    missing_proof_asset: int
    no_followup_scheduled: int
    total_blocked: int
    by_bucket: dict[str, list[BlockingIssueBucket]]


class MessageQueueItem(BaseModel):
    lead_profile_id: str
    outreach_sequence_id: str
    company_name: str
    contact_name: str | None = None
    channel: str
    sequence_stage: int
    draft_preview: str
    proof_asset_attached: bool
    send_ready: bool
    followup_due_date: str | None = None


class ObjectionItem(BaseModel):
    id: str
    objection_type: str
    summary: str
    response_strategy: str | None = None
    confidence: int | None = None
    outcome: str | None = None


class ProofReadinessItem(BaseModel):
    asset_type: str
    title: str
    status: str
    action_label: str | None = None
    linked_offer_type: str | None = None
    required_for_outreach: bool


class WeeklyStripItem(BaseModel):
    week_start: str
    touches_target: int
    sent: int
    replies: int
    meetings_booked: int
    proposals_sent: int
    reply_rate_pct: float | None = None


class DailyBriefOut(BaseModel):
    generated_at: str
    env_id: str
    business_id: str
    best_shots: list[BestShotItem]
    blocking_issues: BlockingIssueSummary
    message_queue: list[MessageQueueItem]
    objection_radar: list[ObjectionItem]
    proof_readiness: list[ProofReadinessItem]
    weekly_strip: WeeklyStripItem
    total_active_leads: int
    ready_now_count: int


# ─── Revenue Execution OS — Deal-centric schemas ────────────────────────────


class DealOut(BaseModel):
    crm_opportunity_id: UUID
    name: str
    amount: Decimal
    opp_status: str
    thesis: str | None = None
    pain: str | None = None
    winston_angle: str | None = None
    expected_close_date: date | None = None
    created_at: datetime
    crm_account_id: UUID | None = None
    account_name: str | None = None
    industry: str | None = None
    stage_key: str | None = None
    stage_label: str | None = None
    stage_order: int | None = None
    last_activity_at: datetime | None = None
    last_activity_direction: str | None = None
    last_activity_type: str | None = None
    next_action_id: UUID | None = None
    next_action_due: date | None = None
    next_action_description: str | None = None
    next_action_type: str | None = None
    next_action_status: str | None = None
    computed_status: str  # NeedsAttention | ReadyToAct | Waiting | OnTrack | Closed


class PipelineStripItem(BaseModel):
    stage_key: str
    stage_label: str
    stage_order: int
    deal_count: int
    total_value: Decimal
    stale_count: int


class IndustryBreakdownItem(BaseModel):
    industry: str
    deal_count: int
    total_value: Decimal
    needs_attention_count: int


class StuckMoneyItem(BaseModel):
    crm_opportunity_id: UUID
    name: str
    amount: Decimal
    account_name: str | None = None
    industry: str | None = None
    stage_label: str | None = None
    next_action_due: date | None = None
    next_action_description: str | None = None


class OutreachSnapshotItem(BaseModel):
    sent_7d: int
    replies_7d: int
    meetings_7d: int
    reply_rate_7d: Decimal


class DealSummaryOut(BaseModel):
    pipeline_strip: list[PipelineStripItem]
    industry_breakdown: list[IndustryBreakdownItem]
    stuck_money: list[StuckMoneyItem]
    outreach_7d: OutreachSnapshotItem


class LogActivityRequest(BaseModel):
    env_id: str
    business_id: str
    activity_type: str  # call, email, meeting, note, task, other
    subject: str
    direction: str | None = None  # outbound, inbound
    outcome: str | None = None
    next_step: str | None = None
    create_next_action: bool = False
    next_action_description: str | None = None
    next_action_due: str | None = None  # ISO date


class IngestLeadsRequest(BaseModel):
    env_id: str
    business_id: str
    source_path: str | None = None


class IngestLeadsResult(BaseModel):
    accounts_created: int
    contacts_created: int
    opportunities_created: int
    skipped_dupes: int
    errors: list[str] | None = None
