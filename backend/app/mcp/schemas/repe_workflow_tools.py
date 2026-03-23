"""Schemas for REPE capital call & distribution workflow MCP tools."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class ListCapitalCallsInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    fund_id: UUID | None = Field(default=None, description="Filter by fund")
    status: str | None = Field(default=None, description="Filter by status (draft/issued/closed/cancelled)")
    limit: int = Field(default=50, description="Max results")


class GetCapitalCallInput(BaseModel):
    model_config = {"extra": "ignore"}
    call_id: str = Field(description="Capital call ID")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class ListDistributionsInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    fund_id: UUID | None = Field(default=None, description="Filter by fund")
    status: str | None = Field(default=None, description="Filter by status (pending/processed/cancelled)")
    event_type: str | None = Field(default=None, description="Filter by event type (sale/partial_sale/refinance/operating_dist)")
    limit: int = Field(default=50, description="Max results")


class GetDistributionInput(BaseModel):
    model_config = {"extra": "ignore"}
    event_id: str = Field(description="Distribution event ID")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
