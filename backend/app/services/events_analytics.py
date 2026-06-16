"""Read-only Event Analytics service (Plan 0004 dashboard surface).

Backend-mediated reads of the BigQuery analytics layer
(``winston_events_analytics`` views) for the Event Analytics Dashboard. This is
an OBSERVABILITY surface, not an operational read path:

  - Reads ONLY the deduped analytics views, NEVER the raw
    winston_events_raw.events table directly (raw is append-only and may carry
    replay duplicates — Plan 0004 Phase 5B/6A).
  - BigQuery is NOT authoritative for any operational app state. Execution
    status, REPE/finance KPIs, HR ledger/state, and task state all remain
    Postgres/Supabase-authoritative and are NOT served from here.
  - Fails closed: when BQ is unconfigured/unavailable, returns an
    ``available=False`` payload with a reason — never raises into the route.

Config mirrors the sink (env): BQ_ENABLED, BQ_PROJECT_ID. The analytics dataset
defaults to ``winston_events_analytics``.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("app.services.events_analytics")


def _clean(v: str | None) -> str:
    return v.strip() if v else ""


BQ_ENABLED: bool = os.getenv("BQ_ENABLED", "false").lower() == "true"
BQ_PROJECT_ID: str = _clean(os.getenv("BQ_PROJECT_ID", ""))
BQ_ANALYTICS_DATASET: str = _clean(os.getenv("BQ_ANALYTICS_DATASET", "")) or "winston_events_analytics"

# The ONLY views this surface may read. A guard (see _assert_allowed_view) makes
# reading anything else — especially the raw events table — a programming error.
ALLOWED_VIEWS: frozenset[str] = frozenset({
    "event_volume_summary",
    "events_deduped",
    "execution_events_daily",
    "execution_run_lifecycle",
    "dead_letter_daily",
    "hr_signals_observed",
    "hr_signal_latest",
    "hr_signal_freshness_summary",
    "hr_signal_counts_daily",
    "hr_dead_letters",
})


class EventsAnalyticsUnavailable(RuntimeError):
    """Internal: BQ not configured/reachable. Never surfaced to the route as a raise."""


def _assert_allowed_view(view: str) -> None:
    """Reject any read target that is not a whitelisted analytics view.

    This is the structural guarantee that the dashboard never queries the raw
    append-only table or an operational source. A raw-table read is a bug, not
    a runtime condition.
    """
    if view not in ALLOWED_VIEWS:
        raise ValueError(
            f"events_analytics may only read whitelisted analytics views, not {view!r}. "
            f"Raw winston_events_raw.events is forbidden here."
        )


def _view_fqn(view: str) -> str:
    _assert_allowed_view(view)
    return f"`{BQ_PROJECT_ID}.{BQ_ANALYTICS_DATASET}.{view}`"


def _get_bq_client():  # type: ignore[return]
    """Lazy-import google-cloud-bigquery. Absent → ImportError (caught upstream).

    Credential resolution, in order:
      1. GOOGLE_APPLICATION_CREDENTIALS_JSON — inline service-account JSON. Used
         on hosts without a persistent filesystem to drop a key file (Railway),
         where the read-only dashboard reads the prod analytics views.
      2. Application Default Credentials — GOOGLE_APPLICATION_CREDENTIALS file
         path (local dev), or Workload Identity (GKE). Unchanged default.
    """
    from google.cloud import bigquery  # noqa: PLC0415

    inline = _clean(os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", ""))
    if inline:
        import json  # noqa: PLC0415
        from google.oauth2 import service_account  # noqa: PLC0415
        creds = service_account.Credentials.from_service_account_info(json.loads(inline))
        return bigquery.Client(project=BQ_PROJECT_ID, credentials=creds)
    return bigquery.Client(project=BQ_PROJECT_ID)


def _unavailable(reason: str) -> dict[str, Any]:
    return {"available": False, "reason": reason}


def _run(client, sql: str) -> list[dict[str, Any]]:
    return [dict(row) for row in client.query(sql).result()]


def get_dashboard() -> dict[str, Any]:
    """Assemble the Event Analytics Dashboard payload from the analytics views.

    Returns ``{"available": False, "reason": ...}`` when BQ is off/misconfigured/
    unreachable (fail closed), or the full observability payload otherwise. The
    payload always carries ``observability_only: True`` so the UI can label it.
    """
    if not BQ_ENABLED:
        return _unavailable("BigQuery analytics is not enabled (BQ_ENABLED is false).")
    if not BQ_PROJECT_ID:
        return _unavailable("BigQuery project is not configured (BQ_PROJECT_ID is unset).")

    try:
        client = _get_bq_client()
    except ImportError:
        return _unavailable("google-cloud-bigquery is not installed.")
    except Exception as exc:  # credentials / network
        logger.warning("events_analytics: BQ client init failed: %s", exc)
        return _unavailable(f"BigQuery client unavailable: {exc}")

    deduped = _view_fqn("events_deduped")

    try:
        # Volume summary comes from the event_volume_summary VIEW — the API never
        # queries the raw table itself. The raw->deduped boundary lives in the
        # analytics layer (the view), keeping this surface analytics-only.
        counts = _run(client, f"SELECT raw_rows, deduped_rows, dead_letter_rows FROM {_view_fqn('event_volume_summary')}")[0]

        by_source = _run(client, f"""
            SELECT source, COUNT(*) AS event_count
            FROM {deduped}
            GROUP BY source ORDER BY event_count DESC
        """)

        execution_daily = _run(client, f"""
            SELECT CAST(event_date AS STRING) AS event_date, event_type, source, event_count
            FROM {_view_fqn("execution_events_daily")}
            ORDER BY event_date DESC, event_type
            LIMIT 50
        """)

        hr_latest = _run(client, f"""
            SELECT signal_name,
                   TO_JSON_STRING(signal_value_json) AS signal_value,
                   staleness_status, CAST(as_of_date AS STRING) AS as_of_date,
                   CAST(ingested_at AS STRING) AS ingested_at
            FROM {_view_fqn("hr_signal_latest")}
            ORDER BY signal_name
        """)

        hr_freshness = _run(client, f"""
            SELECT staleness_status, signal_count
            FROM {_view_fqn("hr_signal_freshness_summary")}
            ORDER BY signal_count DESC
        """)

        dead_letters = _run(client, f"""
            SELECT CAST(ingested_at AS STRING) AS ingested_at, source,
                   dead_letter_reason, raw_payload
            FROM {_view_fqn("hr_dead_letters")}
            ORDER BY ingested_at DESC
            LIMIT 25
        """)
    except Exception as exc:
        logger.warning("events_analytics: query failed: %s", exc)
        return _unavailable(f"BigQuery query failed: {exc}")

    return {
        "available": True,
        "observability_only": True,
        "project": BQ_PROJECT_ID,
        "analytics_dataset": BQ_ANALYTICS_DATASET,
        "volume": {
            "raw_rows": counts["raw_rows"],
            "deduped_rows": counts["deduped_rows"],
            "dead_letter_rows": counts["dead_letter_rows"],
            "replay_duplicates_collapsed": counts["raw_rows"] - counts["deduped_rows"],
        },
        "by_source": by_source,
        "execution_events_daily": execution_daily,
        "hr_signal_latest": hr_latest,
        "hr_signal_freshness": hr_freshness,
        "hr_dead_letters": dead_letters,
    }
