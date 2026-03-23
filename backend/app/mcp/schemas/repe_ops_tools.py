"""Schemas for REPE period close and fee accrual MCP tools."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class PeriodCloseStatusInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    fund_id: UUID | None = Field(default=None, description="Filter by fund")
    quarter: str | None = Field(default=None, description="Filter by quarter (e.g. 2026Q1)")


class FundQuarterStateInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: str = Field(description="Fund ID")
    quarter: str = Field(description="Quarter (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class ListFeeScheduleInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    fund_id: UUID | None = Field(default=None, description="Filter by fund")


class ComputeFeesInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: str = Field(description="Fund ID")
    quarter: str = Field(description="Quarter for fee computation (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
