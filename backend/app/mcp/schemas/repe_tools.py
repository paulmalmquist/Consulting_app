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


# ── Write tool schemas ────────────────────────────────────────────────────────


class CreateFundInput(BaseModel):
    model_config = {"extra": "forbid"}

    name: str = Field(description="Fund name")
    vintage_year: int = Field(description="Vintage year (e.g. 2024)")
    fund_type: str = Field(description="Fund type: open-end, closed-end, co-invest, fund-of-funds")
    strategy: str = Field(description="Strategy: core, core-plus, value-add, opportunistic")
    status: str = Field(default="fundraising", description="Status: fundraising, investing, harvesting, closed")
    sub_strategy: str | None = Field(default=None, description="Optional sub-strategy")
    target_size: float | None = Field(default=None, description="Target fund size in base currency")
    term_years: int | None = Field(default=None, description="Fund term in years")
    base_currency: str = Field(default="USD", description="Base currency (ISO 4217)")
    business_id: UUID | None = Field(default=None, description="Auto-resolved from context")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class CreateDealInput(BaseModel):
    model_config = {"extra": "forbid"}

    name: str = Field(description="Deal/investment name")
    deal_type: str = Field(description="Deal type: equity, debt, preferred, mezzanine")
    stage: str = Field(default="screening", description="Stage: screening, due-diligence, closed, exited")
    sponsor: str | None = Field(default=None, description="Deal sponsor name")
    target_close_date: str | None = Field(default=None, description="Target close date (YYYY-MM-DD)")
    fund_id: UUID | None = Field(default=None, description="Fund ID — auto-resolved from scope if omitted")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None


class CreateAssetInput(BaseModel):
    model_config = {"extra": "forbid"}

    name: str = Field(description="Asset name")
    asset_type: str = Field(default="property", description="Asset type: property or cmbs")
    property_type: str | None = Field(default=None, description="Property type: multifamily, office, industrial, retail, etc.")
    units: int | None = Field(default=None, description="Number of units (for property)")
    market: str | None = Field(default=None, description="Market/MSA name")
    current_noi: float | None = Field(default=None, description="Current NOI in base currency")
    occupancy: float | None = Field(default=None, description="Occupancy rate as decimal (0.95 = 95%)")
    deal_id: UUID | None = Field(default=None, description="Deal ID — auto-resolved from scope if omitted")
    scope: ToolScopeInput | None = None
    resolved_scope: ResolvedScopeInput | None = None
