"""Schemas for trading / market intelligence MCP tools."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class GetMarketRegimeInput(BaseModel):
    model_config = {"extra": "forbid"}
    tenant_id: UUID | None = None


class GetRegimeHistoryInput(BaseModel):
    model_config = {"extra": "forbid"}
    tenant_id: UUID | None = None
    days: int = Field(default=90, ge=1, le=365)


class GetBtcSpxCorrelationInput(BaseModel):
    model_config = {"extra": "forbid"}
    tenant_id: UUID | None = None


class GetTradingSignalsInput(BaseModel):
    model_config = {"extra": "forbid"}
    tenant_id: UUID | None = None
    status: str | None = None
    category: str | None = None
    direction: str | None = None
    min_strength: int | None = None


class GetOpenPositionsInput(BaseModel):
    model_config = {"extra": "forbid"}
    tenant_id: UUID | None = None


class GetHypothesisStatusInput(BaseModel):
    model_config = {"extra": "forbid"}
    tenant_id: UUID | None = None
    hypothesis_id: UUID


class CreateTradingSignalInput(BaseModel):
    model_config = {"extra": "forbid"}
    tenant_id: UUID | None = None
    theme_id: str
    name: str
    description: str
    category: str
    direction: str
    strength: int = 50
    source: str = "ai_generated"
    asset_class: str
    tickers: list[str] = Field(default_factory=list)
    evidence: dict | None = None
    expires_at: str | None = None


class UpdatePositionPriceInput(BaseModel):
    model_config = {"extra": "forbid"}
    tenant_id: UUID | None = None
    position_id: UUID
    current_price: float


class GetWatchlistAlertsInput(BaseModel):
    model_config = {"extra": "forbid"}
    tenant_id: UUID | None = None
