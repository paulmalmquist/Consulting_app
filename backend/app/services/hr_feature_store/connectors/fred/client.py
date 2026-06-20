"""Strict live FRED client. Raises on missing key / HTTP error — NO fixture
fallback in live mode (fixtures are used only by tests, never here). Never called
in unit/CI tests; the network import (httpx) is lazy.
"""

from __future__ import annotations

from typing import Any

from .config import FredSettings, fred_api_key


class FredConfigError(RuntimeError):
    """FRED key/config is missing — caller must handle (no silent fallback)."""


class FredFetchError(RuntimeError):
    """FRED API returned a non-success response or unparseable body."""


def fetch_observations(
    series_id: str,
    *,
    observation_start: str | None = None,
    limit: int | None = None,
    settings: FredSettings | None = None,
) -> dict[str, Any]:
    """Fetch raw FRED observations JSON for a series. Live only; raises on error."""
    key = fred_api_key()
    if not key:
        raise FredConfigError("FRED_API_KEY not configured (set FRED_API_KEY or FRED_API_KEY_FILE)")

    settings = settings or FredSettings.from_env()
    params: dict[str, Any] = {"series_id": series_id, "api_key": key, "file_type": "json"}
    if observation_start:
        params["observation_start"] = observation_start
    if limit:
        params["limit"] = int(limit)

    import httpx  # noqa: PLC0415 — lazy; only the live path needs it

    try:
        resp = httpx.get(f"{settings.base_url}/series/observations", params=params, timeout=settings.timeout_seconds)
    except Exception as exc:  # network error
        raise FredFetchError(f"FRED request failed for {series_id}: {exc}") from exc
    if resp.status_code != 200:
        raise FredFetchError(f"FRED {series_id} → HTTP {resp.status_code}")
    try:
        body = resp.json()
    except Exception as exc:
        raise FredFetchError(f"FRED {series_id} returned unparseable JSON") from exc
    if "observations" not in body:
        raise FredFetchError(f"FRED {series_id} response missing 'observations'")
    return body
