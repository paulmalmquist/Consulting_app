"""Schemas for resume environment MCP tools."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.mcp.schemas.repe_tools import ResolvedScopeInput, ToolScopeInput


class ListResumeRolesInput(BaseModel):
    model_config = {"extra": "forbid"}
    company: str | None = Field(default=None, description="Filter by company name")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetResumeRoleInput(BaseModel):
    model_config = {"extra": "forbid"}
    role_id: UUID = Field(description="Role ID to retrieve")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ListResumeSkillsInput(BaseModel):
    model_config = {"extra": "forbid"}
    category: str | None = Field(default=None, description="Filter: data_platform, ai_ml, languages, cloud, visualization, domain, leadership")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ListResumeProjectsInput(BaseModel):
    model_config = {"extra": "forbid"}
    status: str | None = Field(default=None, description="Filter: active, completed, concept")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetResumeProjectInput(BaseModel):
    model_config = {"extra": "forbid"}
    project_id: UUID = Field(description="Project ID to retrieve")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ResumeCareerSummaryInput(BaseModel):
    model_config = {"extra": "forbid"}
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ResumeSkillMatrixInput(BaseModel):
    model_config = {"extra": "forbid"}
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None
