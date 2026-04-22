"""Pure-logic tests for the signal promoter."""

from __future__ import annotations

import pytest

from app.services.podcast_signal_promoter import (
    MIN_CREDIBILITY_MULTIPLIER,
    _credibility_multiplier,
    _CATEGORY_MAP,
    _DIRECTION_MAP_MACRO,
    _DIRECTION_MAP_TRADE,
)


@pytest.mark.parametrize(
    "credibility,expected",
    [
        (100.0, 1.0),
        (80.0, 0.8),
        (70.0, 0.7),
        (50.0, MIN_CREDIBILITY_MULTIPLIER),  # clamped at floor
        (30.0, MIN_CREDIBILITY_MULTIPLIER),  # clamped at floor
        (None, MIN_CREDIBILITY_MULTIPLIER),  # default → floor
    ],
)
def test_credibility_multiplier_floor(credibility, expected):
    assert _credibility_multiplier(credibility) == pytest.approx(expected)


def test_direction_maps_complete():
    # Every podcast_macro_views.direction enum maps to a trading_signals.direction
    for d in ("bullish", "bearish", "neutral", "mixed"):
        assert _DIRECTION_MAP_MACRO[d] in ("bullish", "bearish", "neutral")
    # Every podcast_trade_ideas.direction maps too
    for d in ("long", "short", "neutral", "spread", "hedge"):
        assert _DIRECTION_MAP_TRADE[d] in ("bullish", "bearish", "neutral")


def test_category_map_covers_view_types():
    for vt in ("macro", "sector", "asset_class", "geopolitical", "policy"):
        assert _CATEGORY_MAP[vt] in (
            "macro", "sector", "technical", "alt_data", "fundamental", "sentiment", "onchain"
        )
