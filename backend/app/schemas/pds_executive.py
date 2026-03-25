from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PdsExecutiveOverviewOut(BaseModel):
    env_id: str
    business_id: str
    decisions_total: int
    open_queue: int
    critical_queue: int
    high_queue: int
    open_signals: int
    high_signals: int
    latest_kpi: dict[str, Any] | None = None


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
    due_at: datetime | None = None
    risk_score: float | None = None
    context_json: dict[str, Any] = Field(default_factory=dict)
    ai_analysis_json: dict[str, Any] = Field(default_factory=dict)
    input_snapshot_json: dict[str, Any] = Field(default_factory=dict)
    outcome_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


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
