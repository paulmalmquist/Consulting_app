"""Schemas for executions module MCP tools."""

from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class RunExecutionInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    department_id: UUID
    capability_id: UUID
    inputs_json: dict = {}
    dry_run: bool = Field(True, description="Default true; set false + confirm for actual run")
    confirm: bool = Field(False, description="Must be true when dry_run=false")


class ListExecutionsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    department_id: Optional[UUID] = None
    capability_id: Optional[UUID] = None
    limit: int = Field(20, le=100)


class GetExecutionInput(BaseModel):
    model_config = {"extra": "forbid"}
    execution_id: UUID
