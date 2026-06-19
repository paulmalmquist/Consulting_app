"""FOMC text ingest orchestration (dependency-injected → unit-testable, no network).

Sourced series (statement) are fetched/normalized/upserted. Unsourced series
(minutes) are reported `unavailable`, never fetched. Every item surfaces
`embedding_status="embedding_materializer_not_configured"` — text is stored, NOT
embedded; embedding is a separate deferred step.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from app.services.hr_feature_store.freshness import compute_status
from app.services.hr_feature_store.loader import update_pipeline_status, upsert_silver_readings

from . import client as fomc_client
from . import normalizer as fomc_norm
from .series_registry import CONNECTOR, FOMC_TEXT_SERIES, registered_series_keys

EMBEDDING_STATUS = "embedding_materializer_not_configured"


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
    limit: int = 5,
    write: bool = False,
    source_quality: str = "live",
    now: datetime | None = None,
    fetch_fn: Callable[..., Any] | None = None,
    upsert_fn: Callable[[list[dict[str, Any]]], dict[str, int]] | None = None,
    status_fn: Callable[..., bool] | None = None,
) -> dict[str, Any]:
    fetch_fn = fetch_fn or fomc_client.fetch_documents
    upsert_fn = upsert_fn or upsert_silver_readings
    status_fn = status_fn or update_pipeline_status
    now = now or datetime.now(timezone.utc)
    names = series or registered_series_keys()

    summary: list[dict[str, Any]] = []
    for name in names:
        meta = FOMC_TEXT_SERIES.get(name)
        if meta is None:
            summary.append({"series": name, "status": "unknown_series"})
            continue
        if not meta.get("source_available", False):
            summary.append({"series": name, "status": "unavailable",
                            "null_reason": meta.get("null_reason", "source_not_configured")})
            continue
        try:
            docs = fetch_fn(meta, limit=limit)
            rows = fomc_norm.normalize_documents(name, docs, source_quality=source_quality)
        except Exception as exc:  # noqa: BLE001 — live/shape failure must not crash the run
            summary.append({"series": name, "status": "fetch_failed", "reason": str(exc)})
            continue
        if limit:
            rows = rows[-limit:]
        as_of = _latest_as_of(rows)
        status, lag = compute_status(as_of, now, meta["cadence"])
        item: dict[str, Any] = {
            "series": name, "rows": len(rows), "freshness": status, "lag_seconds": lag,
            "embedding_status": EMBEDDING_STATUS,  # explicit: text stored, not embedded
        }
        if write:
            item["counts"] = upsert_fn(rows)
            status_fn(CONNECTOR, name, status, expected_cadence=meta["cadence"],
                      as_of_ts=as_of.isoformat() if as_of else None, lag_seconds=lag,
                      reason=None if status == "fresh" else f"lag {lag}s exceeds {meta['cadence']} cadence")
        summary.append(item)
    return {"connector": CONNECTOR, "mode": "write" if write else "dry-run", "limit": limit, "series": summary}
