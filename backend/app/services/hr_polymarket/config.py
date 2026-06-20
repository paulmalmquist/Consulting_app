"""Configuration for the read-only History Rhymes Polymarket lane."""

from __future__ import annotations

import os
from dataclasses import dataclass

from app.events.topics import Topics


def _clean(name: str, default: str = "") -> str:
    value = os.getenv(name, default)
    return value.strip() if value else default


def _boolean(name: str, default: bool = False) -> bool:
    fallback = "true" if default else "false"
    return _clean(name, fallback).lower() in {"1", "true", "yes", "on"}


def _integer(name: str, default: int, *, minimum: int = 1) -> int:
    try:
        return max(int(_clean(name, str(default))), minimum)
    except ValueError:
        return default


def _number(name: str, default: float, *, minimum: float = 0.0) -> float:
    try:
        return max(float(_clean(name, str(default))), minimum)
    except ValueError:
        return default


def _csv(name: str, default: str = "") -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                item.strip().lower()
                for item in _clean(name, default).split(",")
                if item.strip()
            }
        )
    )


@dataclass(frozen=True)
class PolymarketSettings:
    enabled: bool
    gamma_base_url: str
    clob_base_url: str
    websocket_url: str
    max_markets: int
    discovery_seconds: int
    reconcile_seconds: int
    feature_seconds: int
    connection_stale_seconds: int
    market_stale_seconds: int
    min_liquidity_usd: float
    max_spread_bps: float
    allow_tags: tuple[str, ...]
    block_tags: tuple[str, ...]
    calibration_path: str = ""
    markets_topic: str = Topics.HR_POLYMARKET_MARKETS
    raw_topic: str = Topics.HR_POLYMARKET_RAW
    features_topic: str = Topics.HR_POLYMARKET_FEATURES
    forecasts_topic: str = Topics.HR_POLYMARKET_FORECASTS
    dead_letter_topic: str = Topics.DEAD_LETTER

    @classmethod
    def from_env(cls) -> "PolymarketSettings":
        return cls(
            enabled=_boolean("HR_POLYMARKET_ENABLED"),
            gamma_base_url=_clean(
                "HR_POLYMARKET_GAMMA_BASE_URL",
                "https://gamma-api.polymarket.com",
            ).rstrip("/"),
            clob_base_url=_clean(
                "HR_POLYMARKET_CLOB_BASE_URL",
                "https://clob.polymarket.com",
            ).rstrip("/"),
            websocket_url=_clean(
                "HR_POLYMARKET_WS_URL",
                "wss://ws-subscriptions-clob.polymarket.com/ws/market",
            ),
            max_markets=_integer("HR_POLYMARKET_MAX_MARKETS", 25),
            discovery_seconds=_integer("HR_POLYMARKET_DISCOVERY_SECONDS", 900),
            reconcile_seconds=_integer("HR_POLYMARKET_RECONCILE_SECONDS", 300),
            feature_seconds=_integer("HR_POLYMARKET_FEATURE_SECONDS", 60),
            connection_stale_seconds=_integer(
                "HR_POLYMARKET_CONNECTION_STALE_SECONDS", 30
            ),
            market_stale_seconds=_integer("HR_POLYMARKET_MARKET_STALE_SECONDS", 300),
            min_liquidity_usd=_number(
                "HR_POLYMARKET_MIN_LIQUIDITY_USD", 1000.0
            ),
            max_spread_bps=_number("HR_POLYMARKET_MAX_SPREAD_BPS", 1200.0),
            allow_tags=_csv("HR_POLYMARKET_ALLOW_TAGS"),
            block_tags=_csv(
                "HR_POLYMARKET_BLOCK_TAGS",
                "sports,culture,celebrity,entertainment",
            ),
            calibration_path=_clean("HR_POLYMARKET_CALIBRATION_PATH"),
        )
