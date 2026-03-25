"""Schemas for report MCP tools."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ReportsCreateInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    title: str
    description: str | None = None
    query: dict[str, Any] = Field(default_factory=dict)
    is_draft: bool = True
    confirm: bool = Field(False, description="Must be true to execute write")


class ReportsListInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID


class ReportsGetInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    report_id: UUID


class ReportsRunInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    report_id: UUID
    refresh: bool = True
    confirm: bool = Field(False, description="Must be true to execute write")


class ReportsExplainInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    report_id: UUID
    report_run_id: UUID
