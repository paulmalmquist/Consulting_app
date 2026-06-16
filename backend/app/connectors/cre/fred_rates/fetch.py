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


# ── Historical series fetch (History Rhymes Episode Feature Store, ticket 0.2) ──
# The connector `fetch()` above pulls a fixed recent window for the CRE pipeline.
# The episode builder needs arbitrary historical windows for specific series, so
# this helper exposes a date-windowed, multi-series pull. It is best-effort: with
# no FRED_API_KEY it returns {} (the builder then fails closed per feature/target).

# Series the episode feature store can request. FRED has deep history for the
# treasury/macro series; SP500 (price index) only goes back ~10y on FRED, so
# targets for older episodes fail closed live and are exercised via fixtures.
HR_FRED_SERIES = (
    "DGS10", "DGS2", "FEDFUNDS", "BAMLC0A0CM",
    "UNRATE", "HOUST", "USREC", "SP500",
)


def fetch_series_history(
    series_ids,
    observation_start,
    observation_end=None,
    api_key: str | None = None,
) -> dict[str, list[tuple[str, float]]]:
    """Pull raw FRED observations per series over [start, end].

    Returns {series_id: [(date_iso, value), ...]} sorted ascending by date, with
    FRED's missing-value sentinel '.' dropped. Best-effort: returns {} when no API
    key is available, and omits any series that errors (logged, never raised)."""
    key = api_key or os.environ.get("FRED_API_KEY", "")
    if not key:
        log.warning("FRED_API_KEY not set — fetch_series_history returning {}")
        return {}

    start = observation_start.isoformat() if hasattr(observation_start, "isoformat") else str(observation_start)
    out: dict[str, list[tuple[str, float]]] = {}
    for series_id in series_ids:
        params = {
            "series_id": series_id, "api_key": key,
            "file_type": "json", "observation_start": start,
        }
        if observation_end is not None:
            params["observation_end"] = (
                observation_end.isoformat() if hasattr(observation_end, "isoformat") else str(observation_end)
            )
        try:
            resp = httpx.get(FRED_API_BASE, params=params, timeout=30)
            resp.raise_for_status()
            pts: list[tuple[str, float]] = []
            for obs in resp.json().get("observations", []):
                val = obs.get("value")
                if val in (".", None, ""):
                    continue
                try:
                    pts.append((obs["date"], float(val)))
                except (TypeError, ValueError):
                    continue
            pts.sort(key=lambda p: p[0])
            out[series_id] = pts
        except Exception as exc:  # noqa: BLE001 — best-effort, fail closed
            log.warning("FRED history %s error: %s", series_id, exc)
    return out


FREDGRAPH_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"


def fetch_series_history_csv(
    series_ids, observation_start, observation_end=None,
) -> dict[str, list[tuple[str, float]]]:
    """Pull FRED observations per series over [start, end] via the KEYLESS
    fredgraph CSV endpoint — no FRED_API_KEY required.

    Returns {series_id: [(date_iso, value), ...]} ascending, with FRED's '.'
    missing sentinel dropped. Best-effort: omits any series that errors (logged)."""
    cosd = observation_start.isoformat() if hasattr(observation_start, "isoformat") else str(observation_start)
    out: dict[str, list[tuple[str, float]]] = {}
    for series_id in series_ids:
        params = {"id": series_id, "cosd": cosd}
        if observation_end is not None:
            params["coed"] = (
                observation_end.isoformat() if hasattr(observation_end, "isoformat") else str(observation_end)
            )
        try:
            resp = httpx.get(FREDGRAPH_CSV, params=params, timeout=30)
            resp.raise_for_status()
            pts: list[tuple[str, float]] = []
            for line in resp.text.splitlines()[1:]:  # skip header
                parts = line.split(",")
                if len(parts) != 2:
                    continue
                d, val = parts[0].strip(), parts[1].strip()
                if val in (".", "", None):
                    continue
                try:
                    pts.append((d, float(val)))
                except ValueError:
                    continue
            pts.sort(key=lambda p: p[0])
            out[series_id] = pts
        except Exception as exc:  # noqa: BLE001 — best-effort, fail closed
            log.warning("FRED CSV %s error: %s", series_id, exc)
    return out
