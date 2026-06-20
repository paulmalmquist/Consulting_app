"""Pure DefiLlama normalizer: total-stablecoin-supply chart → silver readings.

`stablecoin_supply_usd` is a per-day level series. Growth (7d/30d) is computed
from OBSERVED history only — `(cur - past)/past` over the window — and fails
closed (`defillama_growth_window_insufficient`) when there isn't enough history.
Missing supply → value=None + null_reason (never 0). No market-liquidity claims.
Deterministic; no network.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .series_registry import CONNECTOR, DEFILLAMA_SERIES


class DefiLlamaShapeError(RuntimeError):
    """The DefiLlama response is not the expected chart shape."""


def _supply_of(item: dict[str, Any]) -> float | None:
    tc = item.get("totalCirculatingUSD")
    raw = tc.get("peggedUSD") if isinstance(tc, dict) else tc
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _ts_iso(unix: Any) -> str | None:
    try:
        return datetime.fromtimestamp(int(unix), tz=timezone.utc).strftime("%Y-%m-%dT00:00:00+00:00")
    except (TypeError, ValueError, OSError):
        return None


def _parse_points(raw: Any) -> list[dict[str, Any]]:
    """[{ts_iso, supply}] sorted ascending. Raises on a non-chart shape."""
    if not isinstance(raw, list):
        raise DefiLlamaShapeError("DefiLlama chart must be a list of daily points")
    points: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            raise DefiLlamaShapeError("each DefiLlama point must be a dict")
        ts = _ts_iso(item.get("date"))
        if ts is None:
            continue  # defillama_missing_timestamp — cannot key it
        points.append({"ts": ts, "supply": _supply_of(item)})
    points.sort(key=lambda p: p["ts"])
    return points


def _provenance(extra: dict[str, Any]) -> dict[str, Any]:
    base = {"endpoint": "/stablecoincharts/all", "metric": "total_stablecoin_circulating_usd",
            "note": "crypto-liquidity proxy; not market liquidity"}
    base.update(extra)
    return base


def _normalize_supply(raw: Any, source_quality: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for p in _parse_points(raw):
        supply = p["supply"]
        null_reason = None if supply is not None else "defillama_missing_supply"
        rows.append({
            "connector": CONNECTOR,
            "series_key": "stablecoin_supply_usd",
            "ts_source": p["ts"],
            "value": supply,
            "quality_flag": "ok" if supply is not None else "missing",
            "null_reason": null_reason,
            "source_quality": source_quality,
            "provenance": _provenance({"unit": "usd", "kind": "level"}),
        })
    return rows


def _compute_growth(series_key: str, raw: Any, window_days: int, source_quality: str) -> list[dict[str, Any]]:
    points = _parse_points(raw)
    cur_ts = points[-1]["ts"] if points else None
    base_row = {
        "connector": CONNECTOR,
        "series_key": series_key,
        "ts_source": cur_ts,
        "source_quality": source_quality,
    }
    # Need the current point and a point exactly `window_days` daily steps back.
    if len(points) < window_days + 1:
        return [{**base_row, "value": None, "quality_flag": "missing",
                 "null_reason": "defillama_growth_window_insufficient",
                 "provenance": _provenance({"unit": "ratio", "window_days": window_days,
                                            "observed_points": len(points)})}]
    cur = points[-1]
    past = points[-(window_days + 1)]
    if cur["supply"] is None or past["supply"] is None:
        return [{**base_row, "value": None, "quality_flag": "missing",
                 "null_reason": "defillama_missing_supply",
                 "provenance": _provenance({"unit": "ratio", "window_days": window_days})}]
    if past["supply"] == 0:
        return [{**base_row, "value": None, "quality_flag": "missing",
                 "null_reason": "defillama_growth_window_insufficient",
                 "provenance": _provenance({"unit": "ratio", "window_days": window_days,
                                            "reason": "zero_base"})}]
    growth = (cur["supply"] - past["supply"]) / past["supply"]
    return [{**base_row, "value": growth, "quality_flag": "ok", "null_reason": None,
             "provenance": _provenance({
                 "unit": "ratio", "window_days": window_days,
                 "calculation": "(current_supply - past_supply) / past_supply",
                 "current_supply": cur["supply"], "past_supply": past["supply"],
                 "current_ts": cur["ts"], "past_ts": past["ts"]})}]


def normalize(series_key: str, raw: Any, *, source_quality: str = "live") -> list[dict[str, Any]]:
    meta = DEFILLAMA_SERIES.get(series_key)
    if meta is None:
        raise ValueError(f"unknown defillama series: {series_key}")
    if meta["kind"] == "level":
        return _normalize_supply(raw, source_quality)
    return _compute_growth(series_key, raw, meta["window_days"], source_quality)
