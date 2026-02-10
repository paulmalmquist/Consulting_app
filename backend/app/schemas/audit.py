from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class AuditEventOut(BaseModel):
    audit_event_id: UUID
    business_id: Optional[UUID] = None
    actor: str
    action: str
    tool_name: str
    object_type: Optional[str] = None
    object_id: Optional[UUID] = None
    success: bool
    latency_ms: int
    input_redacted: dict = {}
    output_redacted: dict = {}
    error_message: Optional[str] = None
    created_at: datetime
