"""Persistence layer for the HR stream spine (PR 12, S5).

Three entry points, each takes a psycopg2-style cursor (or any object with
.execute/.fetchone) so they work with fake_cursor in tests and real DB in
production:

  persist_event   — bronze append + silver newer-only upsert
  commit_offset   — consumer-group offset receipt
  write_health    — singleton health snapshot
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.hr_stream.contracts import HrSignalEvent

logger = logging.getLogger("app.hr_stream.persist")


def persist_event(cursor: Any, event: HrSignalEvent, mode: str) -> bool:
    """Write one signal event to bronze and update the silver latest row.

    Bronze insert is idempotent: ON CONFLICT (idempotency_key) DO NOTHING.
    Silver upsert applies only when the incoming observed_at is strictly
    newer than the current row — older events never overwrite current state.

    Returns True if the bronze row was inserted (new event), False if it was
    a duplicate (idempotency_key already present).
    """
    quality_json = event.quality.model_dump_json()

    dedupe_key = event.dedupe_key

    cursor.execute(
        """
        INSERT INTO public.hr_signal_events (
            idempotency_key, topic, signal_key, domain, source, mode,
            observed_at, ingested_at,
            value_numeric, value_text, unit,
            previous_value, delta, window_label, freshness_ttl_seconds,
            quality, tags, raw
        ) VALUES (
            %(idempotency_key)s, %(topic)s, %(signal_key)s, %(domain)s,
            %(source)s, %(mode)s, %(observed_at)s, %(ingested_at)s,
            %(value_numeric)s, %(value_text)s, %(unit)s,
            %(previous_value)s, %(delta)s, %(window_label)s,
            %(freshness_ttl_seconds)s, %(quality)s::jsonb, %(tags)s, %(raw)s::jsonb
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        """,
        {
            "idempotency_key": dedupe_key,
            "topic": event.topic,
            "signal_key": event.signal_key,
            "domain": event.domain,
            "source": event.source,
            "mode": mode,
            "observed_at": event.observed_at,
            "ingested_at": event.ingested_at,
            "value_numeric": event.value if isinstance(event.value, (int, float)) else None,
            "value_text": event.value if isinstance(event.value, str) else None,
            "unit": event.unit,
            "previous_value": event.previous_value,
            "delta": event.delta,
            "window_label": event.window,  # schema col is window_label; model field is window
            "freshness_ttl_seconds": event.freshness_ttl_seconds,
            "quality": quality_json,
            "tags": list(event.tags),
            "raw": None,
        },
    )

    inserted = cursor.rowcount == 1 if hasattr(cursor, "rowcount") else True

    if not inserted:
        logger.debug("hr persist: duplicate event skipped (idempotency_key=%s)", dedupe_key)
        return False

    # Silver: upsert only when observed_at is strictly newer than the current row.
    # The WHERE clause on the DO UPDATE path handles the newer-only constraint.
    cursor.execute(
        """
        INSERT INTO public.hr_signal_latest (
            signal_key, event_id, domain, source, mode,
            observed_at, ingested_at,
            value_numeric, value_text, unit,
            previous_value, delta, quality, updated_at
        )
        SELECT
            %(signal_key)s, event_id, %(domain)s, %(source)s, %(mode)s,
            %(observed_at)s, %(ingested_at)s,
            %(value_numeric)s, %(value_text)s, %(unit)s,
            %(previous_value)s, %(delta)s, %(quality)s::jsonb, now()
        FROM public.hr_signal_events
        WHERE idempotency_key = %(idempotency_key)s
        ON CONFLICT (signal_key) DO UPDATE
            SET event_id       = EXCLUDED.event_id,
                domain         = EXCLUDED.domain,
                source         = EXCLUDED.source,
                mode           = EXCLUDED.mode,
                observed_at    = EXCLUDED.observed_at,
                ingested_at    = EXCLUDED.ingested_at,
                value_numeric  = EXCLUDED.value_numeric,
                value_text     = EXCLUDED.value_text,
                unit           = EXCLUDED.unit,
                previous_value = EXCLUDED.previous_value,
                delta          = EXCLUDED.delta,
                quality        = EXCLUDED.quality,
                updated_at     = now()
            WHERE EXCLUDED.observed_at > hr_signal_latest.observed_at
        """,
        {
            "idempotency_key": dedupe_key,
            "signal_key": event.signal_key,
            "domain": event.domain,
            "source": event.source,
            "mode": mode,
            "observed_at": event.observed_at,
            "ingested_at": event.ingested_at,
            "value_numeric": event.value if isinstance(event.value, (int, float)) else None,
            "value_text": event.value if isinstance(event.value, str) else None,
            "unit": event.unit,
            "previous_value": event.previous_value,
            "delta": event.delta,
            "quality": quality_json,
        },
    )

    return True


def commit_offset(
    cursor: Any,
    group: str,
    topic: str,
    partition: int,
    offset: int,
) -> None:
    """Record the last committed offset for a consumer-group/topic/partition."""
    cursor.execute(
        """
        INSERT INTO public.hr_stream_offsets (consumer_group, topic, partition, last_offset, committed_at)
        VALUES (%(group)s, %(topic)s, %(partition)s, %(offset)s, now())
        ON CONFLICT (consumer_group, topic, partition) DO UPDATE
            SET last_offset  = EXCLUDED.last_offset,
                committed_at = now()
        """,
        {"group": group, "topic": topic, "partition": partition, "offset": offset},
    )


def write_health(cursor: Any, snapshot: dict) -> None:
    """Overwrite the singleton health row (id=1).

    ``snapshot`` keys map to hr_stream_health columns. Unknown keys are
    ignored. The row always exists (inserted by the migration) so this is
    always an UPDATE path via ON CONFLICT.
    """
    allowed = {
        "mode", "provider", "status", "consumer_group", "topic_prefix",
        "latest_event_at", "lag_seconds", "degraded_reason",
    }
    safe = {k: v for k, v in snapshot.items() if k in allowed}

    # Ensure status is always present and not None (fail-closed default).
    if not safe.get("status"):
        safe["status"] = "disconnected"

    cursor.execute(
        """
        INSERT INTO public.hr_stream_health (
            id, mode, provider, status, consumer_group, topic_prefix,
            latest_event_at, lag_seconds, degraded_reason, updated_at
        ) VALUES (
            1,
            %(mode)s, %(provider)s, %(status)s, %(consumer_group)s, %(topic_prefix)s,
            %(latest_event_at)s, %(lag_seconds)s, %(degraded_reason)s,
            now()
        )
        ON CONFLICT (id) DO UPDATE
            SET mode            = EXCLUDED.mode,
                provider        = EXCLUDED.provider,
                status          = EXCLUDED.status,
                consumer_group  = EXCLUDED.consumer_group,
                topic_prefix    = EXCLUDED.topic_prefix,
                latest_event_at = EXCLUDED.latest_event_at,
                lag_seconds     = EXCLUDED.lag_seconds,
                degraded_reason = EXCLUDED.degraded_reason,
                updated_at      = now()
        """,
        {
            "mode": safe.get("mode"),
            "provider": safe.get("provider"),
            "status": safe["status"],
            "consumer_group": safe.get("consumer_group"),
            "topic_prefix": safe.get("topic_prefix"),
            "latest_event_at": safe.get("latest_event_at"),
            "lag_seconds": safe.get("lag_seconds"),
            "degraded_reason": safe.get("degraded_reason"),
        },
    )
