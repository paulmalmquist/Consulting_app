"""Tests for enum/int clamping in podcast extraction writers."""

from __future__ import annotations

import pytest

from app.services.podcast_extraction import (
    _DIRECTIONS_MACRO,
    _TIME_HORIZONS,
    _VIEW_TYPES,
    _clamp,
    _clamp_int,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("macro", "macro"),
        ("MACRO", "macro"),
        ("  sector ", "sector"),
        ("rates", "asset_class"),  # synonym
        ("equities", "asset_class"),
        ("commodities", "asset_class"),
        ("something_weird", "macro"),  # fallback to default
        (None, "macro"),
    ],
)
def test_clamp_view_type(raw, expected):
    assert _clamp(raw, _VIEW_TYPES, "macro") == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("bullish", "bullish"),
        ("Bullish", "bullish"),
        ("bullsih", "neutral"),  # typo falls to default
        (None, "neutral"),
    ],
)
def test_clamp_direction(raw, expected):
    assert _clamp(raw, _DIRECTIONS_MACRO, "neutral") == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("6-12_months", "3-12_months"),  # synonym
        ("short-term", "1-4_weeks"),
        ("structural", "structural"),
        ("made_up", None),
    ],
)
def test_clamp_time_horizon(raw, expected):
    assert _clamp(raw, _TIME_HORIZONS, None) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        (75, 75),
        (0, 0),
        (100, 100),
        (150, 100),  # clipped high
        (-20, 0),    # clipped low
        ("85", 85),  # string coercion
        ("abc", 50), # default
        (None, 50),
    ],
)
def test_clamp_int(raw, expected):
    assert _clamp_int(raw) == expected


def test_clamp_int_custom_default():
    assert _clamp_int(None, default=0) == 0
    assert _clamp_int("bad", default=25) == 25
