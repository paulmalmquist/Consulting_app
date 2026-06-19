"""Pure VIX normalizer: raw FRED VIXCLS observations → canonical `vix_spot` silver
readings. Spot ONLY — there is no term-structure normalization here (no source).
Missing values → value=None + null_reason (never zero). Deterministic; no network.
"""

from __future__ import annotations

from typing import Any

from .series_registry import CONNECTOR, VIX_SERIES

_MISSING_MARKERS = {"", ".", "(NA)", "null", "N", "-"}


class VixShapeError(RuntimeError):
    """The VIX/FRED response is not the expected observations shape."""


def normalize_spot(
    series_key: str,
    fred_json: Any,
    *,
    source_quality: str = "live",
) -> list[dict[str, Any]]:
    meta = VIX_SERIES.get(series_key)
    if meta is None:
        raise ValueError(f"unknown vix series: {series_key}")
    if not meta.get("source_available", False):
        # Defensive: callers must not normalize an unsourced series (e.g. term structure).
        raise ValueError(f"{series_key} has no source; do not normalize (report unavailable instead)")
    if not isinstance(fred_json, dict) or not isinstance(fred_json.get("observations"), list):
        raise VixShapeError("vix response is not a FRED observations object")

    series_id = meta["fred_series_id"]
    rows: list[dict[str, Any]] = []
    for obs in fred_json["observations"]:
        if not isinstance(obs, dict):
            continue
        date = obs.get("date")
        raw = obs.get("value")
        if not date:
            continue  # vix_missing_date — cannot key it
        if raw is None or str(raw).strip() in _MISSING_MARKERS:
            value, null_reason, qf = None, "vix_missing_value", "missing"
        else:
            try:
                value, null_reason, qf = float(raw), None, "ok"
            except (TypeError, ValueError):
                value, null_reason, qf = None, "vix_unexpected_value", "missing"
        rows.append({
            "connector": CONNECTOR,
            "series_key": series_key,
            "ts_source": f"{date}T00:00:00+00:00",
            "value": value,
            "quality_flag": qf,
            "null_reason": null_reason,
            "source_quality": source_quality,
            "provenance": {"series_id": series_id, "unit": meta.get("unit"),
                           "cadence": meta["cadence"], "quant_slot": meta.get("quant_slot")},
        })
    return rows
