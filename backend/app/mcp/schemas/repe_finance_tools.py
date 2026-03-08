"""Schemas for REPE finance MCP tools — composite tools wrapping deterministic engines."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field
from uuid import UUID


class RunSaleScenarioInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID = Field(description="Fund to run the sale scenario against")
    scenario_id: UUID | None = Field(default=None, description="Existing scenario ID (creates temp if omitted)")
    deal_id: UUID | None = Field(default=None, description="Deal/investment being sold")
    asset_id: UUID | None = Field(default=None, description="Specific asset being sold")
    sale_price: float | None = Field(default=None, description="Sale price in base currency")
    exit_cap_rate: float | None = Field(default=None, description="Exit cap rate as decimal (e.g. 0.0625)")
    sale_date: str | None = Field(default=None, description="Sale date YYYY-MM-DD")
    quarter: str = Field(description="Analysis quarter YYYYQN (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class RunWaterfallInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID = Field(description="Fund to run waterfall for")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class FundMetricsInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID = Field(description="Fund to retrieve metrics for")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class StressCapRateInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID = Field(description="Fund to stress test")
    cap_rate_delta_bps: int = Field(default=50, description="Cap rate expansion in basis points")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class CompareScenariosInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID = Field(description="Fund ID")
    scenario_ids: list[str] = Field(description="Scenario IDs to compare")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class LpSummaryInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID = Field(description="Fund to summarize LP data for")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
