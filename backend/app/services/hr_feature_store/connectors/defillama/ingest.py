"""DefiLlama ingest orchestration (dependency-injected → unit-testable, no network).

Fetches the stablecoin supply chart ONCE and derives every series from it
(supply level + observed growth windows). Fail-soft + dry-run aware.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from app.services.hr_feature_store.freshness import compute_status
from app.services.hr_feature_store.loader import update_pipeline_status, upsert_silver_readings

from . import client as dl_client
from . import normalizer as dl_norm
from .series_registry import CONNECTOR, DEFILLAMA_SERIES, registered_series_keys


def _latest_as_of(rows: list[dict[str, Any]]) -> datetime | None:
    stamps = [r["ts_source"] for r in rows if r.get("ts_source")]
    if not stamps:
        return None
    try:
        return max(datetime.fromisoformat(s.replace("Z", "+00:00")) for s in stamps)
    except ValueError:
        return None


def run_ingest(
    *,
    series: list[str] | None = None,
    limit: int = 60,
    write: bool = False,
    source_quality: str = "live",
    now: datetime | None = None,
    fetch_fn: Callable[..., Any] | None = None,
    upsert_fn: Callable[[list[dict[str, Any]]], dict[str, int]] | None = None,
    status_fn: Callable[..., bool] | None = None,
) -> dict[str, Any]:
    fetch_fn = fetch_fn or dl_client.fetch_stablecoin_chart
    upsert_fn = upsert_fn or upsert_silver_readings
    status_fn = status_fn or update_pipeline_status
    now = now or datetime.now(timezone.utc)
    names = series or registered_series_keys()

    raw: Any = None
    fetch_error: str | None = None
    try:
        raw = fetch_fn(limit=limit)
    except Exception as exc:  # noqa: BLE001 — one fetch, shared by all series
        fetch_error = str(exc)

    summary: list[dict[str, Any]] = []
    for name in names:
        meta = DEFILLAMA_SERIES.get(name)
        if meta is None:
            summary.append({"series": name, "status": "unknown_series"})
            continue
        if fetch_error is not None:
            summary.append({"series": name, "status": "fetch_failed", "reason": fetch_error})
            continue
        try:
            rows = dl_norm.normalize(name, raw, source_quality=source_quality)
        except Exception as exc:  # noqa: BLE001 — shape failure must not crash the run
            summary.append({"series": name, "status": "fetch_failed", "reason": str(exc)})
            continue
        if limit and meta["kind"] == "level":
            rows = rows[-limit:]
        as_of = _latest_as_of(rows)
        status, lag = compute_status(as_of, now, meta["cadence"])
        item: dict[str, Any] = {"series": name, "rows": len(rows), "freshness": status, "lag_seconds": lag}
        if write:
            item["counts"] = upsert_fn(rows)
            status_fn(CONNECTOR, name, status, expected_cadence=meta["cadence"],
                      as_of_ts=as_of.isoformat() if as_of else None, lag_seconds=lag,
                      reason=None if status == "fresh" else f"lag {lag}s exceeds {meta['cadence']} cadence")
        summary.append(item)
    return {"connector": CONNECTOR, "mode": "write" if write else "dry-run", "limit": limit, "series": summary}
