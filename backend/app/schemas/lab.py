from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class EnvironmentOut(BaseModel):
    env_id: UUID
    client_name: str
    industry: str
    schema_name: str
    is_active: bool


class CreateEnvironmentRequest(BaseModel):
    client_name: str
    industry: str = "general"
    notes: Optional[str] = None


class CreateEnvironmentResponse(BaseModel):
    env_id: UUID
    client_name: str
    industry: str
    schema_name: str


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
