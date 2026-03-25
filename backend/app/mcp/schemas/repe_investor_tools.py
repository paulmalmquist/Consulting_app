"""Schemas for REPE investor / capital activity MCP tools."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class ListInvestorsInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    fund_id: UUID | None = Field(default=None, description="Optional: filter to investors in this fund")
    partner_type: str | None = Field(default=None, description="Optional: filter by partner type (lp, gp, co_invest)")


class GetInvestorSummaryInput(BaseModel):
    model_config = {"extra": "ignore"}
    partner_id: UUID = Field(description="Partner / investor ID")
    quarter: str = Field(description="Analysis quarter YYYYQN (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class ListCapitalActivityInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    fund_id: UUID | None = Field(default=None, description="Optional: filter to a specific fund")
    partner_id: UUID | None = Field(default=None, description="Optional: filter to a specific partner")
    entry_type: str | None = Field(default=None, description="Optional: contribution, distribution, fee, etc.")
    quarter: str | None = Field(default=None, description="Optional: filter to a specific quarter")
    limit: int = Field(default=50, description="Max rows to return (default 50, max 500)")


class NavRollforwardInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to compute NAV rollforward for")
    quarter_from: str = Field(description="Starting quarter YYYYQN (e.g. 2025Q4)")
    quarter_to: str = Field(description="Ending quarter YYYYQN (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
