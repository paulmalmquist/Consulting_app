"""Pure Census normalizer: raw 2D-array response → canonical silver readings.

Census returns `[[header...], [row...], ...]`. Missing cell values become
value=None + null_reason='census_missing_value' (never zero-imputed); rows with
no period are dropped (census_missing_period); a structurally invalid response
raises CensusShapeError. Values are scaled (thousands SAAR → millions) to match
the canonical scale. Deterministic; no network.
"""

from __future__ import annotations

from typing import Any

from .series_registry import CONNECTOR, CENSUS_SERIES

_MISSING_MARKERS = {"", ".", "(NA)", "null", "N", "-"}


class CensusShapeError(RuntimeError):
    """The Census response is not the expected header+rows 2D array."""


def _period_to_ts(period: str) -> str | None:
    p = period.strip()
    if not p:
        return None
    parts = p.split("-")
    year = parts[0]
    month = parts[1] if len(parts) > 1 else "01"
    if not (year.isdigit() and month.isdigit()):
        return None
    return f"{int(year):04d}-{int(month):02d}-01T00:00:00+00:00"


def normalize_response(
    series_key: str,
    census_array: Any,
    *,
    source_quality: str = "live",
) -> list[dict[str, Any]]:
    meta = CENSUS_SERIES.get(series_key)
    if meta is None:
        raise ValueError(f"unknown census series: {series_key}")
    if not isinstance(census_array, list) or len(census_array) < 1 or not isinstance(census_array[0], list):
        raise CensusShapeError("census response is not a header+rows array")
    header = census_array[0]
    if "cell_value" not in header or "time" not in header:
        raise CensusShapeError(f"census header missing cell_value/time: {header}")
    vi, ti = header.index("cell_value"), header.index("time")
    scale = meta.get("scale", 1.0)

    rows: list[dict[str, Any]] = []
    for raw in census_array[1:]:
        if not isinstance(raw, list) or len(raw) <= max(vi, ti):
            continue  # skip malformed individual rows defensively
        ts_source = _period_to_ts(str(raw[ti]))
        if ts_source is None:
            continue  # census_missing_period — cannot key it
        cell = raw[vi]
        if cell is None or str(cell).strip() in _MISSING_MARKERS:
            value, null_reason, qf = None, "census_missing_value", "missing"
        else:
            try:
                value, null_reason, qf = float(cell) * scale, None, "ok"
            except (TypeError, ValueError):
                value, null_reason, qf = None, "census_unexpected_value", "missing"
        rows.append({
            "connector": CONNECTOR,
            "series_key": series_key,
            "ts_source": ts_source,
            "value": value,
            "quality_flag": qf,
            "null_reason": null_reason,
            "source_quality": source_quality,
            "provenance": {
                "dataset": meta["dataset"],
                "category_code": meta["category_code"],
                "data_type_code": meta["data_type_code"],
                "seasonally_adj": meta["seasonally_adj"],
                "period": str(raw[ti]),
                "unit": meta.get("unit"),
                "scale": scale,
                "quant_slot": meta.get("quant_slot"),
            },
        })
    return rows
