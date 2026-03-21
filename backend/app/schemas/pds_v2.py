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
    account_name: str | None = None
    stage: str
    deal_value: Decimal = Decimal("0")
    probability_pct: Decimal = Decimal("0")
    expected_close_date: date | None = None
    owner_name: str | None = None


class PdsV2PipelineStageOut(BaseModel):
    stage: str
    count: int = 0
    weighted_value: Decimal = Decimal("0")
    unweighted_value: Decimal = Decimal("0")


class PdsV2PipelineSummaryOut(BaseModel):
    stages: list[PdsV2PipelineStageOut] = Field(default_factory=list)
    deals: list[PdsV2PipelineDealOut] = Field(default_factory=list)
    total_pipeline_value: Decimal = Decimal("0")
    total_weighted_value: Decimal = Decimal("0")


class PdsV2ReportPacketOut(BaseModel):
    packet_type: str
    generated_at: datetime
    title: str
    sections: list[dict[str, Any]] = Field(default_factory=list)
    narrative: str | None = None
