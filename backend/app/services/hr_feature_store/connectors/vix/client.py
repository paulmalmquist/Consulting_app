"""Strict live VIX client. Spot VIX is a FRED series (VIXCLS), so the live fetch
reuses the FRED client (key-gated, strict, no fixture fallback) rather than
duplicating httpx/secret code. Never called in unit/CI tests.
"""

from __future__ import annotations

from typing import Any

from ..fred.client import FredConfigError, FredFetchError, fetch_observations


class VixFetchError(RuntimeError):
    """VIX live fetch failed (config or upstream)."""


def fetch_spot(series_def: dict[str, Any], *, limit: int | None = None) -> dict[str, Any]:
    """Fetch raw spot-VIX observations (FRED VIXCLS). Live only; raises on error."""
    series_id = series_def.get("fred_series_id")
    if not series_id:
        raise VixFetchError("vix_spot has no fred_series_id configured")
    try:
        return fetch_observations(series_id, limit=limit)
    except (FredConfigError, FredFetchError) as exc:
        raise VixFetchError(f"vix spot fetch failed: {exc}") from exc
