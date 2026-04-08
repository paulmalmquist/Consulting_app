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


class OperatorAssistantFocusOut(BaseModel):
    headline: str
    summary_lines: list[str] = Field(default_factory=list)
    priorities: list[str] = Field(default_factory=list)
    money_leakage: list[str] = Field(default_factory=list)
    close_blockers: list[str] = Field(default_factory=list)
    prompt_suggestions: list[str] = Field(default_factory=list)


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
    assistant_focus: OperatorAssistantFocusOut
    demo_script: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
