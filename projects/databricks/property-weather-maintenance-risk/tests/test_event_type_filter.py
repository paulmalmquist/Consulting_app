from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from weather_risk import normalize_event_type


def test_supported_event_types_and_aliases() -> None:
    assert normalize_event_type("TSTM WIND") == "thunderstorm wind"
    assert normalize_event_type("Flash Flooding") == "flash flood"
    assert normalize_event_type("HURRICANE") == "hurricane/typhoon"
    assert normalize_event_type("wild fire") == "wildfire"


def test_unsupported_event_type_returns_none() -> None:
    assert normalize_event_type("astronomical low tide") is None
