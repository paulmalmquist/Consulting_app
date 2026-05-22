from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from weather_risk import normalize_fips


def test_normalize_county_fips_to_five_digits() -> None:
    assert normalize_fips("12057") == "12057"
    assert normalize_fips("057") == "00057"
    assert normalize_fips(48113) == "48113"
    assert normalize_fips("48113.0") == "48113"


def test_normalize_fips_rejects_empty_values() -> None:
    assert normalize_fips(None) is None
    assert normalize_fips("") is None
