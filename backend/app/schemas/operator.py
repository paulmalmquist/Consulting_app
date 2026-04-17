from __future__ import annotations

from datetime import date as date_type
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class OperatorContextOut(BaseModel):
    env_id: str
    business_id: UUID
    workspace_template_key: str
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


class OperatorMetricCardOut(BaseModel):
    key: str
    label: str
    value: float | int | str
    comparison_label: str | None = None
    comparison_value: float | int | str | None = None
    delta_value: float | int | str | None = None
    tone: str = "neutral"
    unit: str | None = None
    trend_direction: Literal["up", "down", "flat"] | None = None
    driver_text: str | None = None


class OperatorEntityPerformanceRowOut(BaseModel):
    entity_id: str
    entity_name: str
    industry: str | None = None
    revenue: float = 0
    expenses: float = 0
    margin_pct: float = 0
    prior_margin_pct: float | None = None
    margin_delta_pct: float | None = None
    cash: float = 0
    plan_revenue: float | None = None
    revenue_variance: float | None = None
    trend: Literal["up", "down", "flat"] = "flat"
    status: str = "watch"
    flag: str | None = None
    top_driver: str | None = None
    href: str | None = None


class OperatorDocumentSummaryOut(BaseModel):
    document_id: str
    title: str
    type: str
    entity_id: str
    entity_name: str
    project_id: str | None = None
    project_name: str | None = None
    vendor_id: str | None = None
    vendor_name: str | None = None
    status: str
    created_at: str
    risk_flags: list[str] = Field(default_factory=list)
    key_terms: list[str] = Field(default_factory=list)
    extracted_json: dict[str, Any] = Field(default_factory=dict)


class OperatorCloseTaskRowOut(BaseModel):
    task_id: str
    title: str
    type: str
    entity_id: str
    entity_name: str
    project_id: str | None = None
    project_name: str | None = None
    status: str
    owner: str
    due_date: date_type | None = None
    blocker_reason: str | None = None
    late_flag: bool = False
    priority: str | None = None
    href: str | None = None


class OperatorProjectRowOut(BaseModel):
    project_id: str
    entity_id: str
    entity_name: str
    name: str
    status: str
    owner: str | None = None
    start_date: date_type | None = None
    end_date: date_type | None = None
    budget: float = 0
    actual_cost: float = 0
    variance: float = 0
    revenue: float | None = None
    margin_pct: float | None = None
    risk_score: float = 0
    risk_level: str = "low"
    summary: str | None = None
    blockers: list[str] = Field(default_factory=list)
    primary_vendor: str | None = None
    href: str | None = None


class OperatorBudgetPointOut(BaseModel):
    period: str
    budget: float = 0
    actual: float = 0


class OperatorTimelineItemOut(BaseModel):
    label: str
    date: date_type | None = None
    status: str
    note: str | None = None


class OperatorVendorSpendOut(BaseModel):
    vendor_id: str
    vendor_name: str
    amount: float = 0
    share_pct: float | None = None
    status: str | None = None
    note: str | None = None


class OperatorProjectDetailOut(OperatorProjectRowOut):
    budget_vs_actual: list[OperatorBudgetPointOut] = Field(default_factory=list)
    timeline: list[OperatorTimelineItemOut] = Field(default_factory=list)
    documents: list[OperatorDocumentSummaryOut] = Field(default_factory=list)
    tasks: list[OperatorCloseTaskRowOut] = Field(default_factory=list)
    vendor_breakdown: list[OperatorVendorSpendOut] = Field(default_factory=list)
    root_causes: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)


class OperatorVendorEntitySpendOut(BaseModel):
    entity_id: str
    entity_name: str
    amount: float = 0


class OperatorVendorRowOut(BaseModel):
    vendor_id: str
    name: str
    category: str
    entity_count: int = 0
    entities: list[str] = Field(default_factory=list)
    spend_ytd: float = 0
    contract_value: float | None = None
    overspend_amount: float | None = None
    duplication_flag: bool = False
    risk_flag: str | None = None
    notes: str | None = None
    spend_by_entity: list[OperatorVendorEntitySpendOut] = Field(default_factory=list)
    linked_projects: list[str] = Field(default_factory=list)


class OperatorSiteRestrictions(BaseModel):
    height_limit_ft: float | None = None
    FAR: float | None = None
    setback_front_ft: float | None = None
    setback_side_ft: float | None = None
    parking_ratio: str | None = None
    historic_overlay: bool = False
    environmental_review_required: bool = False


class OperatorSiteRowOut(BaseModel):
    site_id: str
    name: str
    address: str | None = None
    city: str | None = None
    entity_id: str
    entity_name: str
    zoning_type: str | None = None
    status: str = "scouting"
    predev_cost_to_date: float = 0
    predev_budget: float | None = None
    risk_score: float = 0
    risk_level: str = "low"
    estimated_timeline_days: int | None = None
    owner: str | None = None
    summary: str | None = None
    href: str | None = None


class OperatorSiteDetailOut(OperatorSiteRowOut):
    allowed_uses: list[str] = Field(default_factory=list)
    restrictions: OperatorSiteRestrictions = Field(default_factory=OperatorSiteRestrictions)
    approvals_required: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    linked_project_id: str | None = None
    linked_project_name: str | None = None
    documents: list[OperatorDocumentSummaryOut] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)


class OperatorAssistantFocusOut(BaseModel):
    headline: str
    summary_lines: list[str] = Field(default_factory=list)
    priorities: list[str] = Field(default_factory=list)
    money_leakage: list[str] = Field(default_factory=list)
    close_blockers: list[str] = Field(default_factory=list)
    prompt_suggestions: list[str] = Field(default_factory=list)


class IfIgnoredIn30Out(BaseModel):
    estimated_cost_usd: float = 0
    estimated_delay_days: int = 0
    secondary_effects: list[str] = Field(default_factory=list)


class IfIgnoredOut(BaseModel):
    in_30_days: IfIgnoredIn30Out | None = None


class ImpactOut(BaseModel):
    type: Literal["delay", "cost", "revenue", "risk"] = "delay"
    estimated_cost_usd: float = 0
    estimated_delay_days: int = 0
    estimated_revenue_at_risk_usd: float = 0
    confidence: Literal["high", "medium", "low"] = "medium"
    time_to_failure_days: int | None = None
    if_ignored: IfIgnoredOut | None = None


class ActionQueueTriggerOut(BaseModel):
    type: str
    permit_id: str | None = None
    event_id: str | None = None
    package_id: str | None = None
    vendor_id: str | None = None
    entity_id: str | None = None
    task_id: str | None = None
    site_id: str | None = None


class ActionQueueItemOut(BaseModel):
    id: str
    rank: int
    priority: Literal["critical", "high", "medium", "low"] = "medium"
    category: str
    title: str
    summary: str | None = None
    entity_id: str | None = None
    project_id: str | None = None
    site_id: str | None = None
    municipality_id: str | None = None
    triggered_by: ActionQueueTriggerOut | None = None
    impact: ImpactOut
    escalation_level: int = 0
    owner: str | None = None
    blocking: bool = False
    due_window: str | None = None
    href: str | None = None
    action_label: str | None = None


class WeeklyTopRiskOut(BaseModel):
    label: str
    impact_usd: float | None = None
    impact_days: int | None = None
    time_to_failure_days: int | None = None
    confidence: Literal["high", "medium", "low"] = "medium"


class WeeklySummaryOut(BaseModel):
    week_of: str
    operating_posture: Literal["defensive", "stable", "aggressive"] = "stable"
    critical_path: str
    headline: str
    key_shifts: list[str] = Field(default_factory=list)
    top_risks: list[WeeklyTopRiskOut] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)


class SiteOrdinanceChangeSummaryOut(BaseModel):
    id: str
    summary: str | None = None
    severity: str | None = None
    municipality_id: str | None = None
    municipality_name: str | None = None
    effective_date: date_type | None = None
    impact: ImpactOut | None = None
    affected_site_count: int = 0
    affected_project_count: int = 0
    href: str | None = None


class SiteStripSummaryOut(BaseModel):
    id: str
    name: str | None = None
    municipality_name: str | None = None
    risk_level: str | None = None
    feasibility_score: float | None = None
    confidence: str | None = None
    buildable_units_low: int | None = None
    buildable_units_high: int | None = None
    href: str | None = None


class MunicipalityStripSummaryOut(BaseModel):
    id: str
    name: str | None = None
    state: str | None = None
    friction_score: float | None = None
    median_approval_days: int | None = None
    active_project_count: int | None = None
    recent_changes_30d: int | None = None
    href: str | None = None


class SiteOrdinanceStripOut(BaseModel):
    ordinance_changes: list[SiteOrdinanceChangeSummaryOut] = Field(default_factory=list)
    sites: list[SiteStripSummaryOut] = Field(default_factory=list)
    municipalities: list[MunicipalityStripSummaryOut] = Field(default_factory=list)


class BillingReadinessRowOut(BaseModel):
    project_id: str
    amount_at_risk: float = 0
    missing_artifact: str | None = None
    responsible_party: str | None = None
    days_delayed: int = 0
    retention_at_risk: float = 0
    confidence: Literal["high", "medium", "low"] = "medium"


class CashAtRiskOut(BaseModel):
    total_amount_usd: float = 0
    project_count: int = 0
    rows: list[BillingReadinessRowOut] = Field(default_factory=list)


class ReadinessGateOut(BaseModel):
    key: str
    label: str | None = None
    status: Literal["complete", "at_risk", "incomplete", "unknown"] = "unknown"
    blocker_reason: str | None = None
    owner: str | None = None
    next_action: str | None = None


class PrematureProjectRowOut(BaseModel):
    anomaly_class: Literal["premature_project"] = "premature_project"
    site_id: str
    site_name: str | None = None
    project_id: str
    project_name: str | None = None
    feasibility_score: float | None = None
    risk_level: str | None = None
    summary: str | None = None
    recommended_action: str | None = None
    href: str | None = None
    project_href: str | None = None


class ActiveBeforeReadyRowOut(BaseModel):
    anomaly_class: Literal["active_before_ready"] = "active_before_ready"
    project_id: str
    project_name: str | None = None
    entity_id: str | None = None
    overall_pct: float = 0
    blocking_gate: str | None = None
    incomplete_gate_count: int = 0
    at_risk_gate_count: int = 0
    gates: list[ReadinessGateOut] = Field(default_factory=list)
    next_action: str | None = None
    owner: str | None = None
    href: str | None = None


class HandoffVarianceItemOut(BaseModel):
    key: str
    label: str | None = None
    pursuit: Any = None
    current: Any = None
    diff: Any = None
    severity: str | None = None
    note: str | None = None
    impact: ImpactOut | None = None


class AssumptionDriftRowOut(BaseModel):
    anomaly_class: Literal["assumption_drift"] = "assumption_drift"
    project_id: str
    project_name: str | None = None
    site_id: str | None = None
    site_name: str | None = None
    captured_at_pursuit: date_type | None = None
    top_variance_label: str | None = None
    top_variance_note: str | None = None
    top_variance_impact: ImpactOut | None = None
    variance_count: int = 0
    total_impact_usd: float = 0
    variance_items: list[HandoffVarianceItemOut] = Field(default_factory=list)
    href: str | None = None


class PipelineIntegrityTotalsOut(BaseModel):
    premature_count: int = 0
    active_before_ready_count: int = 0
    drift_count: int = 0
    total_drift_impact_usd: float = 0


class PipelineIntegrityOut(BaseModel):
    premature_projects: list[PrematureProjectRowOut] = Field(default_factory=list)
    active_before_ready: list[ActiveBeforeReadyRowOut] = Field(default_factory=list)
    assumption_drift: list[AssumptionDriftRowOut] = Field(default_factory=list)
    totals: PipelineIntegrityTotalsOut = Field(default_factory=PipelineIntegrityTotalsOut)


class PermitHistoryEntryOut(BaseModel):
    stage: str
    entered_at: date_type | None = None
    exited_at: date_type | None = None


class PermitRowOut(BaseModel):
    permit_id: str
    project_id: str | None = None
    project_name: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    municipality_id: str | None = None
    municipality_name: str | None = None
    municipality_friction_score: float | None = None
    permit_type: str | None = None
    title: str | None = None
    applicant: str | None = None
    current_stage: str | None = None
    stage_index: int = -1
    stage_count: int = 0
    stage_entered_at: date_type | None = None
    median_stage_days: int = 0
    days_in_stage: int = 0
    days_over_median: int = 0
    over_median_pct: int = 0
    delay_flag: bool = False
    expected_completion: date_type | None = None
    impact: ImpactOut | None = None
    history: list[PermitHistoryEntryOut] = Field(default_factory=list)
    href_project: str | None = None
    href_municipality: str | None = None


class PermitFunnelRowOut(BaseModel):
    stage: str
    count: int = 0


class PermitTotalsOut(BaseModel):
    permit_count: int = 0
    delayed_count: int = 0
    total_days_over_median: int = 0
    delayed_impact_usd: float = 0


class PermitBoardOut(BaseModel):
    permits: list[PermitRowOut] = Field(default_factory=list)
    funnel: list[PermitFunnelRowOut] = Field(default_factory=list)
    totals: PermitTotalsOut = Field(default_factory=PermitTotalsOut)


class CloseoutMissingItemOut(BaseModel):
    id: str
    type: str
    title: str | None = None
    owner: str | None = None
    blocking: bool = False
    due_date: date_type | None = None
    note: str | None = None
    impact: ImpactOut | None = None


class CloseoutMissingTypeCountOut(BaseModel):
    type: str
    count: int


class CloseoutPackageRowOut(BaseModel):
    project_id: str
    project_name: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    target_close_date: date_type | None = None
    days_to_close: int | None = None
    completion_pct: float = 0
    missing_count: int = 0
    blocking_count: int = 0
    impact_total_usd: float = 0
    earliest_due_date: date_type | None = None
    missing_by_type: list[CloseoutMissingTypeCountOut] = Field(default_factory=list)
    missing_items: list[CloseoutMissingItemOut] = Field(default_factory=list)
    href: str | None = None


class CloseoutTotalsOut(BaseModel):
    package_count: int = 0
    missing_item_count: int = 0
    blocking_missing_count: int = 0
    impact_total_usd: float = 0
    earliest_due_date: date_type | None = None
    cash_at_risk_usd: float = 0
    cash_at_risk_project_count: int = 0


class CloseoutBoardOut(BaseModel):
    packages: list[CloseoutPackageRowOut] = Field(default_factory=list)
    totals: CloseoutTotalsOut = Field(default_factory=CloseoutTotalsOut)
    cash_at_risk: CashAtRiskOut | None = None


class SiteRowOut(BaseModel):
    site_id: str
    name: str | None = None
    municipality_id: str | None = None
    municipality_name: str | None = None
    state: str | None = None
    zoning: str | None = None
    status: str | None = None
    acreage: float | None = None
    buildable_units_low: int | None = None
    buildable_units_high: int | None = None
    feasibility_score: float | None = None
    confidence: str | None = None
    risk_level: str | None = None
    approval_timeline_days_low: int | None = None
    approval_timeline_days_high: int | None = None
    known_blocker_count: int = 0
    target_project_type: str | None = None
    linked_project_id: str | None = None
    summary: str | None = None
    href: str | None = None


class SiteLinkedProjectOut(BaseModel):
    project_id: str
    name: str | None = None
    status: str | None = None
    risk_level: str | None = None
    href: str | None = None


class SiteConstraintOut(BaseModel):
    rule_id: str | None = None
    rule_title: str | None = None
    rule_summary: str | None = None
    severity: str | None = None
    effective_date: date_type | None = None
    impact: str | None = None
    note: str | None = None
    confidence: str | None = None


class SiteComparableOut(BaseModel):
    id: str
    name: str | None = None
    municipality_name: str | None = None
    outcome: str | None = None
    cycle_days: int | None = None
    matched_on: list[str] = Field(default_factory=list)
    notes: str | None = None


class SiteDetailOut(BaseModel):
    site_id: str
    name: str | None = None
    address: str | None = None
    parcel_id: str | None = None
    zoning: str | None = None
    acreage: float | None = None
    status: str | None = None
    target_project_type: str | None = None
    municipality_id: str | None = None
    municipality_name: str | None = None
    municipality_friction_score: float | None = None
    municipality_href: str | None = None
    buildable_units_low: int | None = None
    buildable_units_high: int | None = None
    height_limit_ft: int | None = None
    density_cap_du_per_acre: int | None = None
    feasibility_score: float | None = None
    confidence: str | None = None
    risk_level: str | None = None
    approval_timeline_days_low: int | None = None
    approval_timeline_days_high: int | None = None
    linked_project: SiteLinkedProjectOut | None = None
    summary: str | None = None
    constraints: list[SiteConstraintOut] = Field(default_factory=list)
    comparable_projects: list[SiteComparableOut] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    risk_score: float | None = None


class OrdinanceAffectedSiteOut(BaseModel):
    site_id: str
    name: str | None = None
    risk_level: str | None = None
    href: str | None = None


class OrdinanceAffectedProjectOut(BaseModel):
    project_id: str
    name: str | None = None
    risk_level: str | None = None
    href: str | None = None


class OrdinanceChangeRowOut(BaseModel):
    id: str
    municipality_id: str | None = None
    municipality_name: str | None = None
    rule_id: str | None = None
    rule_title: str | None = None
    change_type: str | None = None
    effective_date: date_type | None = None
    summary: str | None = None
    severity: str | None = None
    confidence: str | None = None
    impact: ImpactOut | None = None
    affected_sites: list[OrdinanceAffectedSiteOut] = Field(default_factory=list)
    affected_projects: list[OrdinanceAffectedProjectOut] = Field(default_factory=list)
    municipality_href: str | None = None


class MunicipalityRowOut(BaseModel):
    id: str
    name: str | None = None
    state: str | None = None
    median_approval_days: int | None = None
    variance_required_rate: float | None = None
    inspection_fail_rate: float | None = None
    ordinance_volatility_score: float | None = None
    comment_loop_frequency: float | None = None
    rework_rate: float | None = None
    overall_friction_score: float | None = None
    active_project_count: int | None = None
    active_site_count: int | None = None
    active_ordinance_count: int | None = None
    recent_changes_30d: int | None = None
    risk_level: str | None = None
    confidence: str | None = None
    href: str | None = None


class MunicipalityDetailOut(MunicipalityRowOut):
    sites: list[SiteLinkedProjectOut] = Field(default_factory=list)
    linked_projects: list[SiteLinkedProjectOut] = Field(default_factory=list)
    recent_changes: list[OrdinanceChangeRowOut] = Field(default_factory=list)


class OperatorCommandCenterOut(BaseModel):
    env_id: str
    business_id: UUID
    workspace_template_key: str
    business_name: str
    period: str
    metrics_strip: list[OperatorMetricCardOut] = Field(default_factory=list)
    entity_performance: list[OperatorEntityPerformanceRowOut] = Field(default_factory=list)
    at_risk_projects: list[OperatorProjectRowOut] = Field(default_factory=list)
    close_tasks: list[OperatorCloseTaskRowOut] = Field(default_factory=list)
    top_documents: list[OperatorDocumentSummaryOut] = Field(default_factory=list)
    vendor_alerts: list[OperatorVendorRowOut] = Field(default_factory=list)
    development_sites: list[OperatorSiteRowOut] = Field(default_factory=list)
    assistant_focus: OperatorAssistantFocusOut
    weekly_summary: WeeklySummaryOut | None = None
    action_queue: list[ActionQueueItemOut] = Field(default_factory=list)
    action_queue_collapsed_count: int = 0
    site_ordinance_strip: SiteOrdinanceStripOut | None = None
    cash_at_risk: CashAtRiskOut | None = None
    demo_script: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
