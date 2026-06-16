"""Typed contracts shared by Polymarket ingestion and materialization."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class MarketDefinition(BaseModel):
    market_id: str
    event_id: str | None = None
    condition_id: str
    question: str
    slug: str | None = None
    category: str | None = None
    tags: list[str] = Field(default_factory=list)
    end_at: datetime
    resolution_source: str | None = None
    yes_token_id: str
    no_token_id: str
    yes_price: float | None = None
    no_price: float | None = None
    liquidity_usd: float
    volume_usd: float = 0.0
    active: bool = True
    closed: bool = False
    accepting_orders: bool = True
    enable_order_book: bool = True
    raw: dict[str, Any] = Field(default_factory=dict)

    @property
    def asset_ids(self) -> tuple[str, str]:
        return self.yes_token_id, self.no_token_id


class DiscoveryResult(BaseModel):
    selected: list[MarketDefinition] = Field(default_factory=list)
    rejection_counts: dict[str, int] = Field(default_factory=dict)
    pages_read: int = 0


class NormalizedMarketEvent(BaseModel):
    event_id: str
    event_type: str
    market_id: str | None = None
    asset_id: str | None = None
    observed_at: datetime
    received_at: datetime
    reconciled: bool = False
    payload: dict[str, Any]
    raw: dict[str, Any]


class FeatureSnapshot(BaseModel):
    market_id: str
    bucket_at: datetime
    observed_at: datetime | None = None
    connection_last_message_at: datetime | None = None
    market_last_event_at: datetime | None = None
    yes_probability: float | None = None
    price_basis: str | None = None
    last_trade_price: float | None = None
    best_bid: float | None = None
    best_ask: float | None = None
    midpoint: float | None = None
    spread: float | None = None
    spread_bps: float | None = None
    bid_notional_1pt: float = 0.0
    ask_notional_1pt: float = 0.0
    bid_notional_5pt: float = 0.0
    ask_notional_5pt: float = 0.0
    book_imbalance: float | None = None
    probability_change_5m: float | None = None
    probability_change_1h: float | None = None
    probability_change_24h: float | None = None
    liquidity_confidence: float = 0.0
    shock_score: float = 0.0
    connection_stale: bool = True
    market_stale: bool = True
    thin_liquidity_flag: bool = True
    ambiguity_flag: bool = False
    null_reason: str | None = None
    source_event_ids: list[str] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)
