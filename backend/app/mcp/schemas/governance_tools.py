"""Schemas for governance MCP tools."""
from __future__ import annotations

from pydantic import BaseModel, Field


class ListDecisionsInput(BaseModel):
    model_config = {"extra": "ignore"}
    business_id: str = Field(description="Business ID")
    env_id: str | None = Field(default=None, description="Environment ID filter")
    decision_type: str | None = Field(default=None, description="Filter: tool_call, response, classification, fast_path")
    tool_name: str | None = Field(default=None, description="Filter by tool name")
    limit: int = Field(default=50, ge=1, le=500, description="Max rows to return")
    offset: int = Field(default=0, ge=0, description="Pagination offset")


class GetDecisionInput(BaseModel):
    model_config = {"extra": "ignore"}
    decision_id: str = Field(description="Decision audit log ID")


class AuditStatsInput(BaseModel):
    model_config = {"extra": "ignore"}
    business_id: str = Field(description="Business ID")
    env_id: str | None = Field(default=None, description="Environment ID filter")


class ExportAuditReportInput(BaseModel):
    model_config = {"extra": "ignore"}
    business_id: str = Field(description="Business ID")
    env_id: str | None = Field(default=None, description="Environment ID filter")
    limit: int = Field(default=200, ge=1, le=1000, description="Max decisions to include")


class ExportAccuracyReportInput(BaseModel):
    model_config = {"extra": "ignore"}
    business_id: str = Field(description="Business ID")
    env_id: str | None = Field(default=None, description="Environment ID filter")
