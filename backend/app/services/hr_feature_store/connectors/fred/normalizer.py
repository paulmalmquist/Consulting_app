"""Pure FRED normalizer: raw observations JSON → canonical silver readings.

FRED encodes a missing observation as the string '.', which becomes
value=None + null_reason='fred_missing_value' — NEVER zero-imputed. Deterministic;
no network. `source_quality` is 'fixture' in tests, 'live' from the ingest script.
"""

from __future__ import annotations

from typing import Any

from .series_registry import CONNECTOR, FRED_SERIES


def normalize_observations(
    canonical_name: str,
    fred_json: dict[str, Any],
    *,
    source_quality: str = "live",
) -> list[dict[str, Any]]:
    meta = FRED_SERIES.get(canonical_name)
    if meta is None:
        raise ValueError(f"unknown canonical FRED series: {canonical_name}")
    series_id = meta["series_id"]
    rows: list[dict[str, Any]] = []
    for obs in fred_json.get("observations", []):
        date = obs.get("date")
        raw = obs.get("value")
        if not date:
            continue
        value: float | None
        null_reason: str | None
        if raw is None or raw == ".":
            value, null_reason = None, "fred_missing_value"  # never 0
        else:
            try:
                value, null_reason = float(raw), None
            except (TypeError, ValueError):
                value, null_reason = None, "fred_unparseable_value"
        rows.append({
            "connector": CONNECTOR,
            "series_key": canonical_name,
            "ts_source": f"{date}T00:00:00+00:00",
            "value": value,
            "quality_flag": "ok" if null_reason is None else "missing",
            "null_reason": null_reason,
            "source_quality": source_quality,
            "provenance": {"series_id": series_id, "cadence": meta["cadence"], "units": meta.get("units")},
        })
    return rows
