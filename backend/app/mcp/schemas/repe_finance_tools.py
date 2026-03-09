"""Schemas for REPE finance MCP tools — composite tools wrapping deterministic engines."""
from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID


class RunSaleScenarioInput(BaseModel):
    model_config = {"extra": "ignore"}
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
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to run waterfall for")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    scenario_id: UUID | None = Field(default=None, description="Optional scenario identifier")


class FundMetricsInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to retrieve metrics for")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class StressCapRateInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to stress test")
    cap_rate_delta_bps: int = Field(default=50, description="Cap rate expansion in basis points")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class CompareScenariosInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund ID")
    scenario_ids: list[str] = Field(description="Scenario IDs to compare")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class LpSummaryInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to summarize LP data for")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class MonteCarloWaterfallInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to run percentile waterfalls for")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    p10_nav: float = Field(description="P10 NAV / exit value from simulation")
    p50_nav: float = Field(description="P50 NAV / exit value from simulation")
    p90_nav: float = Field(description="P90 NAV / exit value from simulation")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class PortfolioWaterfallInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_ids: list[UUID] = Field(description="Funds to aggregate")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class DealGeoScoreInput(BaseModel):
    model_config = {"extra": "ignore"}
    deal_id: UUID = Field(description="Pipeline deal identifier")
    market_id: str | None = Field(default=None, description="Optional legacy market alias")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class PipelineRadarInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    stage_filter: list[str] | None = Field(default=None, description="Optional pipeline stage filter")


class ListScenarioTemplatesInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class GenerateWaterfallMemoInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund identifier")
    run_id_base: UUID = Field(description="Baseline waterfall run id")
    run_id_scenario: UUID = Field(description="Scenario waterfall run id")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    memo_format: str = Field(default="markdown", description="Requested memo format")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class CapitalCallImpactInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund identifier")
    additional_call_amount: float = Field(description="Synthetic incremental capital call")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class ClawbackRiskInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund identifier")
    scenario_id: UUID | None = Field(default=None, description="Optional scenario identifier")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class UwVsActualWaterfallInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund identifier")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    model_id: UUID | None = Field(default=None, description="Optional underwriting model identifier")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class SensitivityMatrixInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund identifier")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    cap_rate_range_bps: list[int] = Field(description="Cap-rate shifts in bps")
    noi_stress_range_pct: list[float] = Field(description="NOI stress inputs as decimal or percent")
    metric: str = Field(default="net_irr", description="Metric to extract")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class ConstructionWaterfallInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund identifier")
    asset_id: UUID | None = Field(default=None, description="Optional asset identifier")
    quarter: str = Field(description="Analysis quarter YYYYQN")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
