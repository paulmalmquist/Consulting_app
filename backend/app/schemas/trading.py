"""Pydantic schemas for Trading Analytics Copilot routes."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class RegressionRequest(BaseModel):
    model_config = {"extra": "forbid"}

    dependent_symbol: str = Field(default="WTI")
    factor_symbols: list[str] = Field(default_factory=lambda: ["DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"])
    lookback_days: int = Field(default=756, ge=120, le=2000)


class ScenarioRequest(BaseModel):
    model_config = {"extra": "forbid"}

    base_symbol: str = Field(default="WTI")
    shocks: dict[str, float] = Field(default_factory=dict)


class MemoRequest(BaseModel):
    model_config = {"extra": "forbid"}

    question: str = Field(default="Generate a trader-facing memo with evidence and caveats.")
    analytics_payload: dict[str, Any] = Field(default_factory=dict)
    run_id: str | None = None


class CopilotRequest(BaseModel):
    model_config = {"extra": "forbid"}

    question: str
    analytics_payload: dict[str, Any] | None = None
