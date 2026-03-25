"""Schemas for rate sensitivity MCP tools."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class RunDealRateScenarioInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to analyze")
    quarter: str = Field(description="Quarter for actual metrics (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    rate_shock_bps: list[int] = Field(
        default=[50, 100, 150, 200, 250],
        description="Rate shocks in basis points to model",
    )
    metric: str = Field(
        default="irr",
        description="Target metric: irr, nav, equity_multiple",
    )
