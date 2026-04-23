"""Pure-logic tests for prediction extraction."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.podcast_prediction_extractor import (
    _HORIZON_DAYS,
    _MACRO_DIR_TO_PRED,
    _TRADE_DIR_TO_PRED,
    _horizon_to_target_date,
    _pick_asset,
)


@pytest.mark.parametrize(
    "horizon,expected_days",
    [
        ("immediate", 7),
        ("1-4_weeks", 21),
        ("1-3_months", 60),
        ("3-12_months", 180),
        ("1y_plus", 540),
    ],
)
def test_horizon_to_target_date(horizon, expected_days):
    created = datetime(2026, 1, 1, tzinfo=timezone.utc)
    target = _horizon_to_target_date(created, horizon)
    assert target is not None
    assert (target - created).days == expected_days


def test_structural_horizon_returns_none():
    created = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert _horizon_to_target_date(created, "structural") is None
    assert _horizon_to_target_date(created, None) is None
    assert _horizon_to_target_date(created, "unknown") is None


def test_macro_direction_map_covers_enum():
    for d in ("bullish", "bearish", "neutral", "mixed"):
        assert _MACRO_DIR_TO_PRED[d] in ("up", "down", "flat", "range")


def test_trade_direction_maps_spread_and_hedge_to_none():
    assert _TRADE_DIR_TO_PRED["long"] == "up"
    assert _TRADE_DIR_TO_PRED["short"] == "down"
    assert _TRADE_DIR_TO_PRED["spread"] is None
    assert _TRADE_DIR_TO_PRED["hedge"] is None


def test_pick_asset_prefers_ticker_over_asset_class():
    assert _pick_asset(["GLD", "GC=F"], ["commodities"]) == "GLD"
    assert _pick_asset(None, ["fixed_income"]) == "fixed_income"
    assert _pick_asset([], ["commodities"]) == "commodities"
    assert _pick_asset(None, None) is None
    assert _pick_asset([], []) is None
