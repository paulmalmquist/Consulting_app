"""Census connector config (public source; key optional, never required)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _clean(value: str | None) -> str:
    return value.strip() if value else ""


def _read_secret_file(env_name: str) -> str:
    path = _clean(os.getenv(env_name))
    if not path:
        return ""
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def census_api_key() -> str:
    """Optional Census key (raises Census rate limits); empty string is fine."""
    return _clean(os.getenv("CENSUS_API_KEY")) or _read_secret_file("CENSUS_API_KEY_FILE")


@dataclass(frozen=True)
class CensusSettings:
    base_url: str = "https://api.census.gov/data/timeseries/eits"
    enabled: bool = False
    timeout_seconds: float = 20.0
    time_from: str = "from 2015"

    @classmethod
    def from_env(cls) -> "CensusSettings":
        return cls(
            base_url=_clean(os.getenv("FS_CENSUS_BASE_URL")) or "https://api.census.gov/data/timeseries/eits",
            enabled=(os.getenv("FS_CENSUS_ENABLED", "false").lower() == "true"),
            timeout_seconds=float(os.getenv("FS_CENSUS_TIMEOUT_SECONDS", "20") or "20"),
            time_from=_clean(os.getenv("FS_CENSUS_TIME_FROM")) or "from 2015",
        )
