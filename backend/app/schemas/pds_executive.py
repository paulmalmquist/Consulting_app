from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PdsExecutiveOverviewOut(BaseModel):
    env_id: str
    business_id: str
    grain: str = "portfolio"
    decisions_total: int
    open_queue: int
    critical_queue: int
    high_queue: int
    open_signals: int
    high_signals: int
    latest_kpi: dict[str, Any] | None = None
    metrics: dict[str, dict[str, Any]] = Field(default_factory=dict)


class PdsDataHealthSummaryOut(BaseModel):
    valid_pct: float
    exception_count: int
    tables_with_issues: int
    failed_pipeline_count: int
    pipeline_runs: list[dict[str, Any]] = Field(default_factory=list)
    by_error_type: list[dict[str, Any]] = Field(default_factory=list)


class PdsDataHealthExceptionOut(BaseModel):
    exception_id: UUID
    env_id: UUID
    business_id: UUID
    run_id: UUID | None = None
    source_table: str
    source_row_id: UUID | None = None
    error_type: str
    sample_row_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class PdsMetricDefinitionOut(BaseModel):
    name: str
    definition: str
    supported_grains: list[str]
    source_tables: list[str]
    compute_fn: str
    validation_checks: list[str]
    tolerance_class: str
    tolerance_value: float
    sample_receipt_shape: dict[str, Any] = Field(default_factory=dict)


class PdsExecutiveQueueItemOut(BaseModel):
    queue_item_id: UUID
    env_id: UUID
    business_id: UUID
    decision_code: str
    title: str
    summary: str | None = None
    priority: str
    status: str
    project_id: UUID | None = None
    signal_event_id: UUID | None = None
    recommended_action: str | None = None
    recommended_owner: str | None = None
    assigned_owner: str | None = None
    due_at: datetime | None = None
    risk_score: float | None = None
    variance: float | None = None
    starting_variance: float | None = None
    recovery_value: float | None = None
    resolved_at: datetime | None = None
    priority_score: float | None = None
    context_json: dict[str, Any] = Field(default_factory=dict)
    ai_analysis_json: dict[str, Any] = Field(default_factory=dict)
    input_snapshot_json: dict[str, Any] = Field(default_factory=dict)
    outcome_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class PdsExecutiveQueueItemPatchRequest(BaseModel):
    assigned_owner: str | None = None
    status: str | None = None
    due_at: datetime | None = None
    variance: float | None = None
    recovery_value: float | None = None
    actor: str | None = None


class PdsExecutiveQueueMetricsOut(BaseModel):
    total_recovered_value: float
    median_time_to_fix_hours: float | None = None
    open_variance_exposure: float
    top_five_actions: list[dict[str, Any]] = Field(default_factory=list)


class PdsExecutiveQueueActionRequest(BaseModel):
    action_type: str = Field(pattern=r"^(approve|delegate|escalate|defer|reject|close)$")
    actor: str | None = None
    rationale: str | None = None
    delegate_to: str | None = None
    action_payload_json: dict[str, Any] = Field(default_factory=dict)


class PdsExecutiveQueueActionOut(BaseModel):
    queue_item: dict[str, Any]
    action: dict[str, Any]


class PdsExecutiveMemoryOut(BaseModel):
    items: list[dict[str, Any]]


class PdsExecutiveConnectorRunRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    connector_keys: list[str] = Field(default_factory=list)
    run_mode: str = Field(default="live", pattern=r"^(live|mock|manual)$")
    force_refresh: bool = False
    actor: str | None = None


class PdsExecutiveDecisionRunRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    include_non_triggered: bool = False
    actor: str | None = None


class PdsExecutiveFullRunRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    connector_keys: list[str] = Field(default_factory=list)
    force_refresh: bool = False
    actor: str | None = None


class PdsExecutiveMessagingGenerateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    draft_types: list[str] = Field(default_factory=list)
    actor: str | None = None
    source_run_id: str | None = None


class PdsExecutiveDraftApproveRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    actor: str | None = None
    edited_body_text: str | None = None


class PdsExecutiveBriefingGenerateRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    briefing_type: str = Field(pattern=r"^(board|investor)$")
    period: str | None = None
    actor: str | None = None
    source_run_id: str | None = None
