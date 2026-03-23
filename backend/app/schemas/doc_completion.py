from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Borrower
# ---------------------------------------------------------------------------

class BorrowerInput(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: str | None = None
    mobile: str | None = None
    preferred_channel: str = "email"
    timezone: str = "America/New_York"


class BorrowerOut(BaseModel):
    borrower_id: UUID
    first_name: str
    last_name: str
    email: str | None = None
    mobile: str | None = None
    preferred_channel: str
    timezone: str
    consent_sms: bool
    consent_email: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Application Intake
# ---------------------------------------------------------------------------

class ApplicationIntakeRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None
    external_application_id: str = Field(min_length=1, max_length=200)
    borrower: BorrowerInput
    loan_type: str = "mortgage"
    loan_stage: str = "processing"
    required_documents: list[str] = Field(min_length=1)
    submitted_documents: list[str] = Field(default_factory=list)
    assigned_processor_id: str | None = None
    webhook_url: str | None = None
    max_followups: int = Field(default=3, ge=1, le=10)
    followup_cadence_hours: list[int] = Field(default_factory=lambda: [24, 48, 72])
    allowed_send_start: int = Field(default=8, ge=0, le=23)
    allowed_send_end: int = Field(default=20, ge=0, le=23)
    send_initial_outreach: bool = True
    created_by: str | None = None


# ---------------------------------------------------------------------------
# Document Requirement
# ---------------------------------------------------------------------------

class DocRequirementOut(BaseModel):
    requirement_id: UUID
    doc_type: str
    display_name: str
    is_required: bool
    status: str
    notes: str | None = None
    uploaded_at: datetime | None = None
    accepted_at: datetime | None = None
    rejected_at: datetime | None = None
    waived_at: datetime | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Message Event
# ---------------------------------------------------------------------------

class MessageEventOut(BaseModel):
    message_event_id: UUID
    channel: str
    message_type: str
    subject: str | None = None
    content_snapshot: str
    external_message_id: str | None = None
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    opened_at: datetime | None = None
    failed_at: datetime | None = None
    failure_reason: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Upload Event
# ---------------------------------------------------------------------------

class UploadEventOut(BaseModel):
    upload_event_id: UUID
    requirement_id: UUID
    filename: str
    file_type: str
    file_size_bytes: int | None = None
    upload_status: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Escalation Event
# ---------------------------------------------------------------------------

class EscalationEventOut(BaseModel):
    escalation_event_id: UUID
    reason: str
    priority: str
    assigned_to: str | None = None
    status: str
    resolution_note: str | None = None
    triggered_at: datetime
    resolved_at: datetime | None = None


class EscalationResolveRequest(BaseModel):
    resolution_note: str | None = None
    status: str = "resolved"


# ---------------------------------------------------------------------------
# Loan File
# ---------------------------------------------------------------------------

class LoanFileOut(BaseModel):
    loan_file_id: UUID
    env_id: UUID
    business_id: UUID
    external_application_id: str
    loan_type: str
    loan_stage: str
    status: str
    assigned_processor_id: str | None = None
    followup_count: int
    max_followups: int
    opened_at: datetime
    completed_at: datetime | None = None
    escalated_at: datetime | None = None
    last_activity_at: datetime
    last_outreach_at: datetime | None = None
    created_at: datetime
    # Nested
    borrower: BorrowerOut | None = None
    requirements: list[DocRequirementOut] = Field(default_factory=list)
    messages: list[MessageEventOut] = Field(default_factory=list)
    uploads: list[UploadEventOut] = Field(default_factory=list)
    escalations: list[EscalationEventOut] = Field(default_factory=list)
    # Computed
    total_required: int = 0
    total_received: int = 0
    total_missing: int = 0


class LoanFileListOut(BaseModel):
    loan_file_id: UUID
    external_application_id: str
    borrower_name: str
    loan_type: str
    status: str
    total_required: int = 0
    total_received: int = 0
    total_missing: int = 0
    assigned_processor_id: str | None = None
    escalation_status: str | None = None
    last_activity_at: datetime
    last_outreach_at: datetime | None = None
    opened_at: datetime


class StatusUpdateRequest(BaseModel):
    status: str
    updated_by: str | None = None


class ManualOutreachRequest(BaseModel):
    channel: str = "both"
    message: str | None = None
    sent_by: str | None = None


# ---------------------------------------------------------------------------
# Dashboard Stats
# ---------------------------------------------------------------------------

class DashboardStatsOut(BaseModel):
    total_active: int = 0
    waiting_on_borrower: int = 0
    escalated: int = 0
    completed_today: int = 0
    avg_completion_hours: float | None = None
    total_messages_sent: int = 0
    borrower_response_rate: float | None = None


# ---------------------------------------------------------------------------
# Borrower Portal (public-facing, limited fields)
# ---------------------------------------------------------------------------

class PortalFileOut(BaseModel):
    external_application_id: str
    loan_type: str
    lender_name: str = ""
    borrower_first_name: str
    requirements: list[PortalDocOut] = Field(default_factory=list)


class PortalDocOut(BaseModel):
    requirement_id: UUID
    doc_type: str
    display_name: str
    status: str


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

class AuditLogOut(BaseModel):
    audit_log_id: UUID
    entity_type: str
    entity_id: UUID
    action: str
    actor_type: str
    actor_id: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
