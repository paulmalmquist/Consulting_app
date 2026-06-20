"""VIX ingest orchestration (dependency-injected → unit-testable, no network).

vix_spot is fetched/normalized/upserted. vix_term_structure has no source, so it
is reported `unavailable` with `term_structure_source_not_configured` and is NEVER
fetched, normalized, or written — no fabricated term structure.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from app.services.hr_feature_store.freshness import compute_status
from app.services.hr_feature_store.loader import update_pipeline_status, upsert_silver_readings

from . import client as vix_client
from . import normalizer as vix_norm
from .series_registry import CONNECTOR, VIX_SERIES, registered_series_keys


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
    fetch_fn = fetch_fn or vix_client.fetch_spot
    upsert_fn = upsert_fn or upsert_silver_readings
    status_fn = status_fn or update_pipeline_status
    now = now or datetime.now(timezone.utc)
    names = series or registered_series_keys()

    summary: list[dict[str, Any]] = []
    for name in names:
        vdef = VIX_SERIES.get(name)
        if vdef is None:
            summary.append({"series": name, "status": "unknown_series"})
            continue
        if not vdef.get("source_available", False):
            # e.g. vix_term_structure — honest unavailable, never fabricated.
            summary.append({"series": name, "status": "unavailable",
                            "null_reason": vdef.get("null_reason", "source_not_configured")})
            continue
        try:
            raw = fetch_fn(vdef, limit=limit)
            rows = vix_norm.normalize_spot(name, raw, source_quality=source_quality)
        except Exception as exc:  # noqa: BLE001 — live/shape failure must not crash the run
            summary.append({"series": name, "status": "fetch_failed", "reason": str(exc)})
            continue
        if limit:
            rows = rows[-limit:]
        as_of = _latest_as_of(rows)
        status, lag = compute_status(as_of, now, vdef["cadence"])
        item: dict[str, Any] = {"series": name, "rows": len(rows), "freshness": status, "lag_seconds": lag}
        if write:
            item["counts"] = upsert_fn(rows)
            status_fn(CONNECTOR, name, status, expected_cadence=vdef["cadence"],
                      as_of_ts=as_of.isoformat() if as_of else None, lag_seconds=lag,
                      reason=None if status == "fresh" else f"lag {lag}s exceeds {vdef['cadence']} cadence")
        summary.append(item)
    return {"connector": CONNECTOR, "mode": "write" if write else "dry-run", "limit": limit, "series": summary}
