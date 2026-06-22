"""FOMC text connector config (public Fed pages; no key required)."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _clean(value: str | None) -> str:
    return value.strip() if value else ""


@dataclass(frozen=True)
class FomcTextSettings:
    base_url: str = "https://www.federalreserve.gov"
    enabled: bool = False
    timeout_seconds: float = 20.0
    max_documents: int = 5

    @classmethod
    def from_env(cls) -> "FomcTextSettings":
        return cls(
            base_url=_clean(os.getenv("FS_FOMC_TEXT_BASE_URL")) or "https://www.federalreserve.gov",
            enabled=(os.getenv("FS_FOMC_TEXT_ENABLED", "false").lower() == "true"),
            timeout_seconds=float(os.getenv("FS_FOMC_TEXT_TIMEOUT_SECONDS", "20") or "20"),
            max_documents=int(os.getenv("FS_FOMC_TEXT_MAX_DOCUMENTS", "5") or "5"),
        )
