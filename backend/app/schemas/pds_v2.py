from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


PdsLens = Literal["market", "account", "project", "resource", "business_line"]
PdsHorizon = Literal["MTD", "QTD", "YTD", "Forecast"]
PdsRolePreset = Literal["executive", "market_leader", "account_director", "project_lead", "business_line_leader"]


class PdsV2ContextOut(BaseModel):
    env_id: str
    business_id: UUID
    workspace_template_key: str
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class PdsV2MetricCardOut(BaseModel):
    key: str
    label: str
    value: Decimal | int | str
    comparison_label: str | None = None
    comparison_value: Decimal | int | str | None = None
    delta_value: Decimal | int | str | None = None
    tone: str = "neutral"
    unit: str | None = None


class PdsV2PerformanceRowOut(BaseModel):
    entity_id: UUID
    entity_label: str
    owner_label: str | None = None
    health_status: str
    fee_plan: Decimal = Decimal("0")
    fee_actual: Decimal = Decimal("0")
    fee_variance: Decimal = Decimal("0")
    gaap_plan: Decimal = Decimal("0")
    gaap_actual: Decimal = Decimal("0")
    gaap_variance: Decimal = Decimal("0")
    ci_plan: Decimal = Decimal("0")
    ci_actual: Decimal = Decimal("0")
    ci_variance: Decimal = Decimal("0")
    backlog: Decimal = Decimal("0")
    forecast: Decimal = Decimal("0")
    red_projects: int = 0
    client_risk_accounts: int = 0
    satisfaction_score: Decimal | None = None
    utilization_pct: Decimal | None = None
    timecard_compliance_pct: Decimal | None = None
    collections_lag: Decimal | None = None
    writeoff_leakage: Decimal | None = None
    reason_codes: list[str] = Field(default_factory=list)
    href: str | None = None


class PdsV2PerformanceTableOut(BaseModel):
    lens: PdsLens
    horizon: PdsHorizon
    columns: list[str] = Field(default_factory=list)
    rows: list[PdsV2PerformanceRowOut] = Field(default_factory=list)


class PdsV2BusinessLineOut(BaseModel):
    business_line_id: UUID
    line_code: str
    line_name: str
    line_category: str | None = None
    sort_order: int = 0
    is_active: bool = True


class PdsV2LeaderCoverageOut(BaseModel):
    leader_coverage_id: UUID
    resource_id: UUID
    resource_name: str
    market_id: UUID
    market_name: str
    business_line_id: UUID
    business_line_name: str
    coverage_role: str
    effective_from: date
    effective_to: date | None = None
    is_primary: bool = True


class PdsV2DeliveryRiskItemOut(BaseModel):
    project_id: UUID
    project_name: str
    account_name: str | None = None
    market_name: str | None = None
    issue_summary: str
    severity: str
    risk_score: Decimal
    reason_codes: list[str] = Field(default_factory=list)
    recommended_action: str
    recommended_owner: str | None = None
    href: str


class PdsV2ResourceHealthItemOut(BaseModel):
    resource_id: UUID
    resource_name: str
    title: str | None = None
    market_name: str | None = None
    utilization_pct: Decimal
    billable_mix_pct: Decimal
    delinquent_timecards: int
    overload_flag: bool
    staffing_gap_flag: bool
    reason_codes: list[str] = Field(default_factory=list)


class PdsV2TimecardHealthItemOut(BaseModel):
    resource_id: UUID | None = None
    resource_name: str
    submitted_pct: Decimal
    delinquent_count: int
    overdue_hours: Decimal
    reason_codes: list[str] = Field(default_factory=list)


class PdsV2ForecastPointOut(BaseModel):
    forecast_month: date
    entity_type: str
    entity_id: UUID
    entity_label: str
    current_value: Decimal
    prior_value: Decimal
    delta_value: Decimal
    override_value: Decimal | None = None
    override_reason: str | None = None
    confidence_score: Decimal


class PdsV2SatisfactionItemOut(BaseModel):
    account_id: UUID
    account_name: str
    client_name: str | None = None
    average_score: Decimal
    trend_delta: Decimal
    response_count: int
    repeat_award_score: Decimal
    risk_state: str
    reason_codes: list[str] = Field(default_factory=list)


class PdsV2CloseoutItemOut(BaseModel):
    project_id: UUID
    project_name: str
    closeout_target_date: date | None = None
    substantial_completion_date: date | None = None
    actual_closeout_date: date | None = None
    closeout_aging_days: int
    blocker_count: int
    final_billing_status: str
    survey_status: str
    lessons_learned_status: str
    risk_state: str
    reason_codes: list[str] = Field(default_factory=list)
    href: str


class PdsV2AccountAlertOut(BaseModel):
    key: str
    label: str
    count: int = 0
    description: str | None = None
    tone: str = "neutral"


class PdsV2AccountDashboardRowOut(BaseModel):
    account_id: UUID
    account_name: str
    owner_name: str | None = None
    health_score: int = 0
    health_band: Literal["healthy", "watch", "at_risk"] = "watch"
    trend: Literal["improving", "stable", "deteriorating"] = "stable"
    fee_plan: Decimal = Decimal("0")
    fee_actual: Decimal = Decimal("0")
    plan_variance_pct: Decimal = Decimal("0")
    ytd_revenue: Decimal = Decimal("0")
    staffing_score: int = 0
    team_utilization_pct: Decimal | None = None
    overloaded_resources: int = 0
    staffing_gap_resources: int = 0
    timecard_compliance_pct: Decimal | None = None
    satisfaction_score: Decimal | None = None
    satisfaction_trend_delta: Decimal | None = None
    red_projects: int = 0
    collections_lag: Decimal = Decimal("0")
    writeoff_leakage: Decimal = Decimal("0")
    reason_codes: list[str] = Field(default_factory=list)
    primary_issue_code: str | None = None
    impact_label: str | None = None
    recommended_action: str | None = None
    recommended_owner: str | None = None


class PdsV2AccountActionItemOut(BaseModel):
    account_id: UUID
    account_name: str
    owner_name: str | None = None
    health_score: int = 0
    health_band: Literal["healthy", "watch", "at_risk"] = "watch"
    issue: str
    impact_label: str
    recommended_action: str
    recommended_owner: str | None = None
    severity_rank: int = 0


class PdsV2AccountDashboardOut(BaseModel):
    alerts: list[PdsV2AccountAlertOut] = Field(default_factory=list)
    distribution: dict[str, int] = Field(default_factory=dict)
    accounts: list[PdsV2AccountDashboardRowOut] = Field(default_factory=list)
    actions: list[PdsV2AccountActionItemOut] = Field(default_factory=list)


class PdsV2AccountPreviewProjectRiskOut(BaseModel):
    project_id: UUID
    project_name: str
    severity: str
    risk_score: Decimal = Decimal("0")
    issue_summary: str
    recommended_action: str | None = None
    href: str


class PdsV2AccountPreviewOut(BaseModel):
    account_id: UUID
    account_name: str
    owner_name: str | None = None
    health_score: int = 0
    health_band: Literal["healthy", "watch", "at_risk"] = "watch"
    trend: Literal["improving", "stable", "deteriorating"] = "stable"
    fee_plan: Decimal = Decimal("0")
    fee_actual: Decimal = Decimal("0")
    plan_variance_pct: Decimal = Decimal("0")
    ytd_revenue: Decimal = Decimal("0")
    score_breakdown: dict[str, Decimal | int] = Field(default_factory=dict)
    team_utilization_pct: Decimal | None = None
    staffing_score: int = 0
    overloaded_resources: int = 0
    staffing_gap_resources: int = 0
    timecard_compliance_pct: Decimal | None = None
    satisfaction_score: Decimal | None = None
    satisfaction_trend_delta: Decimal | None = None
    red_projects: int = 0
    collections_lag: Decimal = Decimal("0")
    writeoff_leakage: Decimal = Decimal("0")
    primary_issue_code: str | None = None
    impact_label: str | None = None
    recommended_action: str | None = None
    recommended_owner: str | None = None
    reason_codes: list[str] = Field(default_factory=list)
    top_project_risks: list[PdsV2AccountPreviewProjectRiskOut] = Field(default_factory=list)


class PdsV2BriefingOut(BaseModel):
    generated_at: datetime
    lens: PdsLens
    horizon: PdsHorizon
    role_preset: PdsRolePreset
    headline: str
    summary_lines: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)


class PdsV2CommandCenterOut(BaseModel):
    env_id: str
    business_id: UUID
    workspace_template_key: str
    lens: PdsLens
    horizon: PdsHorizon
    role_preset: PdsRolePreset
    generated_at: datetime
    metrics_strip: list[PdsV2MetricCardOut] = Field(default_factory=list)
    performance_table: PdsV2PerformanceTableOut
    delivery_risk: list[PdsV2DeliveryRiskItemOut] = Field(default_factory=list)
    resource_health: list[PdsV2ResourceHealthItemOut] = Field(default_factory=list)
    timecard_health: list[PdsV2TimecardHealthItemOut] = Field(default_factory=list)
    forecast_points: list[PdsV2ForecastPointOut] = Field(default_factory=list)
    satisfaction: list[PdsV2SatisfactionItemOut] = Field(default_factory=list)
    closeout: list[PdsV2CloseoutItemOut] = Field(default_factory=list)
    account_dashboard: PdsV2AccountDashboardOut | None = None
    briefing: PdsV2BriefingOut


class PdsV2ReportPacketRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    packet_type: str = Field(default="forecast_pack", min_length=3, max_length=80)
    lens: PdsLens = "market"
    horizon: PdsHorizon = "Forecast"
    role_preset: PdsRolePreset = "executive"
    actor: str | None = None


class PdsV2PipelineDealOut(BaseModel):
    deal_id: UUID
    deal_name: str
    account_id: UUID | None = None
    account_name: str | None = None
    stage: str
    deal_value: Decimal = Decimal("0")
    probability_pct: Decimal = Decimal("0")
    expected_close_date: date | None = None
    owner_name: str | None = None
    notes: str | None = None
    lost_reason: str | None = None
    stage_entered_at: datetime | None = None
    last_activity_at: datetime | None = None
    days_in_stage: int = 0
    days_to_close: int | None = None
    health_state: Literal["neutral", "positive", "warn", "danger"] = "neutral"
    attention_reasons: list[str] = Field(default_factory=list)
    is_closed: bool = False


class PdsV2PipelineMetricOut(BaseModel):
    key: str
    label: str
    value: Decimal | int | None = None
    delta_value: Decimal | int | None = None
    delta_label: str | None = None
    tone: Literal["neutral", "positive", "warn", "danger"] = "neutral"
    context: str | None = None
    empty_hint: str | None = None


class PdsV2PipelineAttentionItemOut(BaseModel):
    deal_id: UUID
    deal_name: str
    account_name: str | None = None
    stage: str
    deal_value: Decimal = Decimal("0")
    probability_pct: Decimal = Decimal("0")
    expected_close_date: date | None = None
    issue_type: str
    issue: str
    action: str
    tone: Literal["neutral", "positive", "warn", "danger"] = "neutral"


class PdsV2PipelineTimelinePointOut(BaseModel):
    forecast_month: date
    unweighted_value: Decimal = Decimal("0")
    weighted_value: Decimal = Decimal("0")
    deal_count: int = 0


class PdsV2PipelineLookupOptionOut(BaseModel):
    value: str
    label: str
    meta: str | None = None


class PdsV2PipelineLookupsOut(BaseModel):
    accounts: list[PdsV2PipelineLookupOptionOut] = Field(default_factory=list)
    owners: list[PdsV2PipelineLookupOptionOut] = Field(default_factory=list)
    stages: list[PdsV2PipelineLookupOptionOut] = Field(default_factory=list)


class PdsV2PipelineStageHistoryOut(BaseModel):
    stage_history_id: UUID
    from_stage: str | None = None
    to_stage: str
    changed_at: datetime
    note: str | None = None


class PdsV2PipelineStageOut(BaseModel):
    stage: str
    label: str | None = None
    count: int = 0
    weighted_value: Decimal = Decimal("0")
    unweighted_value: Decimal = Decimal("0")
    avg_days_in_stage: Decimal | None = None
    conversion_to_next_pct: Decimal | None = None
    dropoff_pct: Decimal | None = None
    tone: Literal["neutral", "positive", "warn", "danger"] = "neutral"


class PdsV2PipelineSummaryOut(BaseModel):
    has_deals: bool = False
    empty_state_title: str | None = None
    empty_state_body: str | None = None
    required_fields: list[str] = Field(default_factory=list)
    example_deal: dict[str, Any] | None = None
    metrics: list[PdsV2PipelineMetricOut] = Field(default_factory=list)
    attention_items: list[PdsV2PipelineAttentionItemOut] = Field(default_factory=list)
    stages: list[PdsV2PipelineStageOut] = Field(default_factory=list)
    timeline: list[PdsV2PipelineTimelinePointOut] = Field(default_factory=list)
    deals: list[PdsV2PipelineDealOut] = Field(default_factory=list)
    total_pipeline_value: Decimal = Decimal("0")
    total_weighted_value: Decimal = Decimal("0")


class PdsV2PipelineDealDetailOut(BaseModel):
    deal: PdsV2PipelineDealOut
    history: list[PdsV2PipelineStageHistoryOut] = Field(default_factory=list)


class PdsV2PipelineDealCreateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    deal_name: str = Field(min_length=1, max_length=180)
    account_id: UUID | None = None
    stage: str = Field(default="prospect", min_length=3, max_length=32)
    deal_value: Decimal = Decimal("0")
    probability_pct: Decimal = Decimal("0")
    expected_close_date: date | None = None
    owner_name: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    lost_reason: str | None = None


class PdsV2PipelineDealUpdateRequest(BaseModel):
    deal_name: str | None = Field(default=None, min_length=1, max_length=180)
    account_id: UUID | None = None
    stage: str | None = Field(default=None, min_length=3, max_length=32)
    deal_value: Decimal | None = None
    probability_pct: Decimal | None = None
    expected_close_date: date | None = None
    owner_name: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    lost_reason: str | None = None
    transition_note: str | None = None


class PdsV2ReportPacketOut(BaseModel):
    packet_type: str
    generated_at: datetime
    title: str
    sections: list[dict[str, Any]] = Field(default_factory=list)
    narrative: str | None = None
