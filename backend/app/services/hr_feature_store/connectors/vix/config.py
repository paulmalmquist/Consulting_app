"""VIX connector config. Reuses the FRED key reader (VIXCLS is a FRED series) —
no duplicated secret-handling code — and adds its own enabled/timeout flags.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# Reuse the FRED key reader (VIXCLS is served by FRED); do not duplicate it.
from ..fred.config import fred_api_key  # noqa: F401  (re-exported for the client)


def _clean(value: str | None) -> str:
    return value.strip() if value else ""


@dataclass(frozen=True)
class VixSettings:
    enabled: bool = False
    timeout_seconds: float = 20.0

    @classmethod
    def from_env(cls) -> "VixSettings":
        return cls(
            enabled=(os.getenv("FS_VIX_ENABLED", "false").lower() == "true"),
            timeout_seconds=float(os.getenv("FS_VIX_TIMEOUT_SECONDS", "20") or "20"),
        )
