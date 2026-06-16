"""FRED connector config (self-contained, flat env reads + _FILE secrets)."""

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


def fred_api_key() -> str:
    """Live FRED key: env var first, then the GCP Secret Manager _FILE mount."""
    return _clean(os.getenv("FRED_API_KEY")) or _read_secret_file("FRED_API_KEY_FILE")


@dataclass(frozen=True)
class FredSettings:
    base_url: str = "https://api.stlouisfed.org/fred"
    enabled: bool = False
    timeout_seconds: float = 20.0

    @classmethod
    def from_env(cls) -> "FredSettings":
        return cls(
            base_url=_clean(os.getenv("FS_FRED_BASE_URL")) or "https://api.stlouisfed.org/fred",
            enabled=(os.getenv("FS_FRED_ENABLED", "false").lower() == "true"),
            timeout_seconds=float(os.getenv("FS_FRED_TIMEOUT_SECONDS", "20") or "20"),
        )
