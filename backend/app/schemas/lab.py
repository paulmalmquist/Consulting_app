from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class EnvironmentOut(BaseModel):
    env_id: UUID
    client_name: str
    industry: str
    industry_type: Optional[str] = None
    schema_name: str
    is_active: bool
    business_id: Optional[UUID] = None
    repe_initialized: bool = False
    created_at: Optional[datetime] = None
    notes: Optional[str] = None


class CreateEnvironmentRequest(BaseModel):
    client_name: str
    industry: str = "general"
    industry_type: Optional[str] = None
    notes: Optional[str] = None


class CreateEnvironmentResponse(BaseModel):
    env_id: UUID
    client_name: str
    industry: str
    schema_name: str
    business_id: Optional[UUID] = None
    repe_initialized: bool = False


class UpdateEnvironmentRequest(BaseModel):
    client_name: Optional[str] = None
    industry: Optional[str] = None
    industry_type: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class EnvironmentHealthResponse(BaseModel):
    env_id: str
    business_exists: bool
    modules_initialized: bool
    repe_status: Optional[str] = None  # "initialized" | "pending" | "not_applicable"
    data_integrity: bool
    details: dict = {}


class QueueItem(BaseModel):
    id: UUID
    created_at: datetime
    status: str
    risk_level: str
    requested_action: dict = {}


class QueueDecisionRequest(BaseModel):
    decision: str  # "approve" | "deny"
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
