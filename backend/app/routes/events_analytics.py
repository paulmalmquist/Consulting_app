"""Event Analytics Dashboard routes (Plan 0004 observability surface).

Read-only. Serves the BigQuery analytics layer (winston_events_analytics views)
for the dashboard. NOT an operational read path — BigQuery is never authoritative
for execution status, REPE/finance KPIs, HR ledger/state, or task state (those
stay Postgres/Supabase-authoritative). Fails closed: when BQ is unconfigured the
service returns {"available": false, "reason": ...} with HTTP 200, so the UI can
render a clear "Not available" state rather than erroring.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.services import events_analytics as svc

router = APIRouter(prefix="/api/events/v1", tags=["events-analytics"])


@router.get("/analytics/dashboard")
def dashboard() -> dict:
    """Event Analytics Dashboard payload.

    Always 200. ``available: false`` (+ reason) when BigQuery analytics is off
    or unreachable; the full observability payload otherwise. The payload
    carries ``observability_only: true``.
    """
    return svc.get_dashboard()
