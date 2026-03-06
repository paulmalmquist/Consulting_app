"""Schemas for REPE portfolio data MCP tools."""

from pydantic import BaseModel, Field
from uuid import UUID


class ToolScopeInput(BaseModel):
    model_config = {"extra": "forbid"}

    environment_id: UUID | None = None
    business_id: UUID | None = None
    schema_name: str | None = None
    industry: str | None = None


class ResolvedScopeInput(ToolScopeInput):
    model_config = {"extra": "forbid"}

    resolved_scope_type: str | None = None
    entity_type: str | None = None
    entity_id: UUID | None = None
    entity_name: str | None = None
    confidence: float | None = None
    source: str | None = None


class ListFundsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context — omit unless overriding. This is NOT a fund_id.")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetFundInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID | None = Field(default=None, description="Fund ID to retrieve")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ListDealsInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID | None = Field(default=None, description="Fund ID to list deals for")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class ListAssetsInput(BaseModel):
    model_config = {"extra": "forbid"}
    deal_id: UUID | None = Field(default=None, description="Deal or investment ID to list assets for")
    fund_id: UUID | None = Field(default=None, description="Optional fund scope to list assets across the current fund")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetAssetInput(BaseModel):
    model_config = {"extra": "forbid"}
    asset_id: UUID | None = Field(default=None, description="Asset ID to retrieve")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class GetEnvironmentSnapshotInput(BaseModel):
    model_config = {"extra": "forbid"}

    env_id: UUID | None = Field(default=None, description="Environment scope")
    business_id: UUID | None = Field(default=None, description="Business scope")
    quarter: str | None = Field(default=None, description="Quarter label like 2026Q1")
    max_items: int = Field(default=25, ge=1, le=100)
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None
