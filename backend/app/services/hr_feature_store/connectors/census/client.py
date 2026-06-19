"""Strict live Census client (public, no key required). Lazy httpx; raises on
error (no fixture fallback). `build_params` is pure + unit-tested without network.
"""

from __future__ import annotations

from typing import Any

from .config import CensusSettings, census_api_key


class CensusFetchError(RuntimeError):
    """Census API returned a non-success response or unparseable body."""


def build_params(series_def: dict[str, Any], settings: CensusSettings) -> dict[str, Any]:
    """Pure query-param builder for the eits/resconst time series."""
    params: dict[str, Any] = {
        "get": "cell_value,time",
        "category_code": series_def["category_code"],
        "data_type_code": series_def["data_type_code"],
        "seasonally_adj": series_def["seasonally_adj"],
        "for": "us:*",
        "time": settings.time_from,
    }
    key = census_api_key()
    if key:
        params["key"] = key
    return params


def fetch_series(series_def: dict[str, Any], *, limit: int | None = None, settings: CensusSettings | None = None) -> Any:
    """Fetch the raw Census 2D-array response for a series. Live only; raises on error."""
    settings = settings or CensusSettings.from_env()
    url = f"{settings.base_url}/{series_def['dataset']}"
    params = build_params(series_def, settings)

    import httpx  # noqa: PLC0415 — lazy; only the live path needs it

    try:
        resp = httpx.get(url, params=params, timeout=settings.timeout_seconds)
    except Exception as exc:  # network error
        raise CensusFetchError(f"Census request failed for {series_def['dataset']}: {exc}") from exc
    if resp.status_code != 200:
        raise CensusFetchError(f"Census {series_def['dataset']} → HTTP {resp.status_code}")
    try:
        return resp.json()
    except Exception as exc:
        raise CensusFetchError(f"Census {series_def['dataset']} returned unparseable JSON") from exc
