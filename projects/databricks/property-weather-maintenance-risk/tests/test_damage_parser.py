from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from weather_risk import parse_damage_amount


def test_parse_noaa_damage_suffixes() -> None:
    assert parse_damage_amount("25K") == 25_000
    assert parse_damage_amount("1.5M") == 1_500_000
    assert parse_damage_amount("2B") == 2_000_000_000
    assert parse_damage_amount("0") == 0


def test_parse_noaa_damage_unknowns_fail_closed() -> None:
    assert parse_damage_amount("") is None
    assert parse_damage_amount("UNK") is None
    assert parse_damage_amount("not money") is None
