"""Fetch macro economic rates from FRED (Federal Reserve Economic Data)."""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta

import httpx

from app.connectors.cre.base import ConnectorContext

log = logging.getLogger(__name__)

FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations"

_SERIES = {
    "FEDFUNDS": ("fed_funds_rate", "pct"),
    "DGS10": ("treasury_10y", "pct"),
    "BAMLC0A0CM": ("credit_spread_oas", "bps"),
}


def fetch(context: ConnectorContext) -> dict:
    api_key = os.environ.get("FRED_API_KEY", "")
    if not api_key:
        log.warning("FRED_API_KEY not set — returning 0 rows")
        return {"period": date.today().isoformat(), "rows": []}

    lookback_days = int(context.filters.get("lookback_days", 365))
    start = (date.today() - timedelta(days=lookback_days)).isoformat()

    rows: list[dict] = []
    for series_id, (metric_key, units) in _SERIES.items():
        try:
            resp = httpx.get(FRED_API_BASE, params={
                "series_id": series_id, "api_key": api_key,
                "file_type": "json", "observation_start": start,
            }, timeout=30)
            resp.raise_for_status()
            for obs in resp.json().get("observations", []):
                if obs.get("value") == ".":
                    continue
                rows.append({
                    "geography_type": "national", "geoid": "US",
                    "metric_key": metric_key, "value": float(obs["value"]),
                    "units": units, "source": "fred_rates",
                    "vintage": f"FRED {series_id}", "period": obs["date"],
                })
        except Exception as exc:
            log.warning("FRED %s error: %s", series_id, exc)

    log.info("FRED fetch: %d rows", len(rows))
    return {"period": date.today().isoformat(), "rows": rows}
