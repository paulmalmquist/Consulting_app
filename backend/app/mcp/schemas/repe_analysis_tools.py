"""Schemas for REPE analysis MCP tools (waterfall comparison, NOI variance)."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class CompareWaterfallRunsInput(BaseModel):
    model_config = {"extra": "ignore"}
    run_id_a: str = Field(description="First waterfall run ID")
    run_id_b: str = Field(description="Second waterfall run ID")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class NoiVarianceInput(BaseModel):
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    fund_id: UUID | None = Field(default=None, description="Filter by fund")
    quarter: str | None = Field(default=None, description="Filter by quarter (e.g. 2026Q1)")
    asset_id: UUID | None = Field(default=None, description="Filter by specific asset")


class ScanPortfolioUwVsActualInput(BaseModel):
    model_config = {"extra": "ignore"}
    fund_id: UUID = Field(description="Fund to scan")
    quarter: str = Field(description="Comparison quarter (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    baseline: str = Field(default="IO", description="Baseline type: IO (underwriting) or CF (forecast)")
    threshold_bps: int = Field(default=200, ge=0, description="Flag investments with absolute IRR delta above this many basis points")
