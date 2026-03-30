from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class EnvironmentOut(BaseModel):
    env_id: UUID
    slug: Optional[str] = None
    client_name: str
    industry: str
    industry_type: Optional[str] = None
    workspace_template_key: Optional[str] = None
    schema_name: str
    is_active: bool
    business_id: Optional[UUID] = None
    repe_initialized: bool = False
    created_at: Optional[datetime] = None
    notes: Optional[str] = None
    pipeline_stage_name: Optional[str] = None


class CreateEnvironmentRequest(BaseModel):
    client_name: str
    industry: str = "general"
    industry_type: Optional[str] = None
    workspace_template_key: Optional[str] = None
    notes: Optional[str] = None


class CreateEnvironmentResponse(BaseModel):
    env_id: UUID
    client_name: str
    industry: str
    industry_type: Optional[str] = None
    workspace_template_key: Optional[str] = None
    schema_name: str
    business_id: Optional[UUID] = None
    repe_initialized: bool = False
    pipeline_stage_name: Optional[str] = None


class UpdateEnvironmentRequest(BaseModel):
    client_name: Optional[str] = None
    industry: Optional[str] = None
    industry_type: Optional[str] = None
    workspace_template_key: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class EnvironmentHealthResponse(BaseModel):
    env_id: str
    business_exists: bool
    modules_initialized: bool
    repe_status: Optional[str] = None
    data_integrity: bool
    content_count: int = 0
    ranking_count: int = 0
    analytics_count: int = 0
    crm_count: int = 0
    details: dict = {}


class QueueItem(BaseModel):
    id: UUID
    created_at: datetime
    status: str
    risk_level: str
    requested_action: dict = {}


class QueueDecisionRequest(BaseModel):
    decision: str
    reason: Optional[str] = None


class AuditItem(BaseModel):
    id: UUID
    at: datetime
    actor: str
    action: str
    entity_type: str
    entity_id: str
    details: dict = {}


class MetricsOut(BaseModel):
    uploads_count: int = 0
    tickets_count: int = 0
    pending_approvals: int = 0
    approval_rate: float = 0.0
    override_rate: float = 0.0
    avg_time_to_decision_sec: float = 0.0


class ChatRequest(BaseModel):
    message: str
    env_id: Optional[str] = None
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    citations: list = []
    suggested_actions: list = []


class DeleteEnvironmentResponse(BaseModel):
    ok: bool
    env_id: UUID


class PipelineStageOut(BaseModel):
    stage_id: UUID
    stage_key: str
    stage_name: str
    order_index: int
    color_token: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PipelineCardOut(BaseModel):
    card_id: UUID
    stage_id: UUID
    title: str
    account_name: Optional[str] = None
    owner: Optional[str] = None
    value_cents: Optional[int] = None
    priority: str = "medium"
    due_date: Optional[date] = None
    notes: Optional[str] = None
    rank: int
    created_at: datetime
    updated_at: datetime


class PipelineBoardOut(BaseModel):
    env_id: UUID
    client_name: str
    industry: str
    industry_type: str
    stages: list[PipelineStageOut]
    cards: list[PipelineCardOut]


class CreatePipelineStageRequest(BaseModel):
    env_id: UUID
    stage_name: str
    order_index: Optional[int] = None
    color_token: Optional[str] = None


class UpdatePipelineStageRequest(BaseModel):
    stage_name: Optional[str] = None
    order_index: Optional[int] = None
    color_token: Optional[str] = None


class DeletePipelineStageResponse(BaseModel):
    ok: bool
    moved_cards: int
    target_stage_id: UUID


class CreatePipelineCardRequest(BaseModel):
    env_id: UUID
    stage_id: Optional[UUID] = None
    title: str
    account_name: Optional[str] = None
    owner: Optional[str] = None
    value_cents: Optional[int] = None
    priority: Optional[str] = "medium"
    due_date: Optional[date] = None
    notes: Optional[str] = None
    rank: Optional[int] = None


class UpdatePipelineCardRequest(BaseModel):
    stage_id: Optional[UUID] = None
    title: Optional[str] = None
    account_name: Optional[str] = None
    owner: Optional[str] = None
    value_cents: Optional[int] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    rank: Optional[int] = None


class DeletePipelineCardResponse(BaseModel):
    ok: bool
