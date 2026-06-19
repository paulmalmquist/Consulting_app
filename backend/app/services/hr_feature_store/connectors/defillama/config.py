"""DefiLlama connector config (public, keyless)."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _clean(value: str | None) -> str:
    return value.strip() if value else ""


@dataclass(frozen=True)
class DefiLlamaSettings:
    base_url: str = "https://stablecoins.llama.fi"
    enabled: bool = False
    timeout_seconds: float = 20.0
    max_rows: int = 60

    @classmethod
    def from_env(cls) -> "DefiLlamaSettings":
        return cls(
            base_url=_clean(os.getenv("FS_DEFILLAMA_BASE_URL")) or "https://stablecoins.llama.fi",
            enabled=(os.getenv("FS_DEFILLAMA_ENABLED", "false").lower() == "true"),
            timeout_seconds=float(os.getenv("FS_DEFILLAMA_TIMEOUT_SECONDS", "20") or "20"),
            max_rows=int(os.getenv("FS_DEFILLAMA_MAX_ROWS", "60") or "60"),
        )
