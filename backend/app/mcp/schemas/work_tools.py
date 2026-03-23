"""Schemas for work/ownership module MCP tools."""

from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class ListWorkItemsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    owner: Optional[str] = None
    status: Optional[str] = None
    item_type: Optional[str] = None
    department_id: Optional[UUID] = None
    capability_id: Optional[UUID] = None
    limit: int = Field(50, le=200)
    cursor: Optional[str] = None


class GetWorkItemInput(BaseModel):
    model_config = {"extra": "forbid"}
    work_item_id: UUID


class SearchResolutionsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    outcome: Optional[str] = None
    limit: int = Field(50, le=200)


class ListAuditEventsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: Optional[UUID] = None
    tool_name: Optional[str] = None
    success: Optional[bool] = None
    limit: int = Field(50, le=200)
    cursor: Optional[str] = None


class CreateWorkItemInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    title: str
    owner: str
    type: str
    department_id: Optional[UUID] = None
    capability_id: Optional[UUID] = None
    priority: Optional[int] = Field(None, ge=1, le=5)
    description: Optional[str] = None
    confirm: bool = Field(False, description="Must be true to execute write")


class AddCommentInput(BaseModel):
    model_config = {"extra": "forbid"}
    work_item_id: UUID
    comment_type: str
    body: str
    confirm: bool = Field(False, description="Must be true to execute write")


class UpdateStatusInput(BaseModel):
    model_config = {"extra": "forbid"}
    work_item_id: UUID
    status: str
    rationale: Optional[str] = None
    confirm: bool = Field(False, description="Must be true to execute write")


class ResolveItemInput(BaseModel):
    model_config = {"extra": "forbid"}
    work_item_id: UUID
    summary: str
    outcome: str
    linked_documents: Optional[list] = None
    linked_executions: Optional[list] = None
    confirm: bool = Field(False, description="Must be true to execute write")
