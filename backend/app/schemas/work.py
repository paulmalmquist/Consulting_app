from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime
from enum import Enum


class WorkItemType(str, Enum):
    request = "request"
    task = "task"
    incident = "incident"
    decision = "decision"
    question = "question"


class WorkItemStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    waiting = "waiting"
    blocked = "blocked"
    resolved = "resolved"
    closed = "closed"


class WorkCommentType(str, Enum):
    clarification = "clarification"
    evidence = "evidence"
    proposal = "proposal"
    status_update = "status_update"


class WorkResolutionOutcome(str, Enum):
    solved = "solved"
    deferred = "deferred"
    rejected = "rejected"


class CreateWorkItemRequest(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    title: str
    owner: str
    type: WorkItemType
    department_id: Optional[UUID] = None
    capability_id: Optional[UUID] = None
    priority: Optional[int] = Field(None, ge=1, le=5)
    description: Optional[str] = None


class CreateWorkItemResponse(BaseModel):
    work_item_id: UUID
    status: str
    created_at: datetime


class AddCommentRequest(BaseModel):
    model_config = {"extra": "forbid"}
    comment_type: WorkCommentType
    author: str
    body: str


class AddCommentResponse(BaseModel):
    comment_id: UUID
    created_at: datetime


class UpdateStatusRequest(BaseModel):
    model_config = {"extra": "forbid"}
    status: WorkItemStatus
    rationale: Optional[str] = None


class UpdateStatusResponse(BaseModel):
    work_item_id: UUID
    new_status: str
    comment_id: UUID


class ResolveItemRequest(BaseModel):
    model_config = {"extra": "forbid"}
    summary: str
    outcome: WorkResolutionOutcome
    linked_documents: Optional[list] = None
    linked_executions: Optional[list] = None


class ResolveItemResponse(BaseModel):
    resolution_id: UUID
    created_at: datetime


class CommentOut(BaseModel):
    comment_id: UUID
    comment_type: str
    author: str
    body: str
    created_at: datetime


class ResolutionOut(BaseModel):
    resolution_id: UUID
    summary: str
    outcome: str
    linked_documents: list = []
    linked_executions: list = []
    created_by: str
    created_at: datetime


class WorkItemOut(BaseModel):
    work_item_id: UUID
    business_id: UUID
    department_id: Optional[UUID] = None
    capability_id: Optional[UUID] = None
    type: str
    status: str
    owner: str
    priority: Optional[int] = None
    title: str
    created_by: str
    created_at: datetime
    updated_at: datetime


class WorkItemDetailOut(WorkItemOut):
    description: Optional[str] = None
    updated_by: Optional[str] = None
    tenant_id: UUID
    comments: list[CommentOut] = []
    resolution: Optional[ResolutionOut] = None
