from datetime import date, datetime
from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class ControlOut(BaseModel):
    control_id: str
    description: str
    control_type: str
    system_component: str
    evidence_generated: str
    frequency: str
    status: str


class EvidenceExportRequest(BaseModel):
    control_id: str
    from_date: datetime
    to_date: datetime


class AccessReviewCreateRequest(BaseModel):
    review_period_start: date
    review_period_end: date
    generated_by: str
    tenant_id: Optional[UUID] = None


class AccessReviewSignoffRequest(BaseModel):
    reviewer: str
    signoff_notes: Optional[str] = None


class BackupVerificationRequest(BaseModel):
    environment: str
    backup_tested_at: datetime
    restore_confirmed: bool
    evidence_notes: Optional[str] = None
    recorded_by: str


class IncidentCreateRequest(BaseModel):
    title: str
    severity: str
    created_by: str
    tenant_id: Optional[UUID] = None


class IncidentTimelineRequest(BaseModel):
    actor: str
    note: str


class ConfigChangeRequest(BaseModel):
    changed_by: str
    config_type: str
    config_key: str
    before_state: Optional[dict] = None
    after_state: Optional[dict] = None
    tenant_id: Optional[UUID] = None


class DeploymentLogRequest(BaseModel):
    commit_hash: str
    environment: str
    deployed_by: str
