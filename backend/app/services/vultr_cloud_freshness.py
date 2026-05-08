"""Per-source freshness checker for the Vultr Cloud Intelligence OS surface.

Returns `fresh | stale | unavailable` per source system. Thresholds are
intentionally conservative for a demo dataset that's frozen at apply-time —
"stale" is anything older than 7 days, "unavailable" is no rows at all.

Intent: every endpoint can attach a `FreshnessReport` to the response envelope
so the UI can render a `FreshnessBadge` next to KPIs without a second round-trip.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.schemas.vultr import FreshnessReport, SourceFreshness
from app.services import vultr_cloud_dataset


FRESH_THRESHOLD = timedelta(days=7)
STALE_THRESHOLD = timedelta(days=35)


# Map source-system label → which UI bucket it belongs to.
# (Each fact table tags itself with a source_system at write time.)
_SOURCE_BUCKET = {
    "usage": "usage",
    "billing": "billing",
    "invoice": "netsuite",
    "payment": "netsuite",
    "revrec": "netsuite",
    "support": "support",
    "pipeline": "salesforce",
}


def _classify(last_at: datetime | None, *, now: datetime) -> SourceFreshness:
    if last_at is None:
        return "unavailable"
    age = now - last_at
    if age <= STALE_THRESHOLD:
        return "fresh"
    return "stale"


def report(env_id: str) -> FreshnessReport:
    timestamps = vultr_cloud_dataset.latest_source_timestamps(env_id)
    now = datetime.now(timezone.utc)

    bucket_latest: dict[str, datetime | None] = {
        "usage": None, "billing": None, "netsuite": None,
        "salesforce": None, "support": None,
    }
    for src, last_at in timestamps.items():
        bucket = _SOURCE_BUCKET.get(src)
        if bucket is None:
            continue
        cur = bucket_latest.get(bucket)
        if last_at is not None and (cur is None or last_at > cur):
            bucket_latest[bucket] = last_at

    overall_last = max(
        (t for t in bucket_latest.values() if t is not None),
        default=None,
    )

    return FreshnessReport(
        usage=_classify(bucket_latest["usage"], now=now),
        billing=_classify(bucket_latest["billing"], now=now),
        netsuite=_classify(bucket_latest["netsuite"], now=now),
        salesforce=_classify(bucket_latest["salesforce"], now=now),
        support=_classify(bucket_latest["support"], now=now),
        last_synced_at=overall_last,
    )
