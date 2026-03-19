"""Schemas for covenant compliance MCP tools."""
from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID


class CheckCovenantComplianceInput(BaseModel):
    model_config = {"extra": "ignore"}
    asset_id: UUID = Field(description="Asset to check covenant compliance for")
    quarter: str | None = Field(default=None, description="Analysis quarter YYYYQN (defaults to latest)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class ListCovenantAlertsInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID | None = Field(default=None, description="Filter alerts to a specific fund")
    severity: str | None = Field(default=None, description="Filter by severity: warning | breach | critical")
    quarter: str | None = Field(default=None, description="Filter to a specific quarter YYYYQN")
    include_resolved: bool = Field(default=False, description="Include resolved alerts")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
