"""Admin read routes for the Winston response-contract enforcer soak dashboard.

Narrow surface — read-only, no mutations:

  GET /api/admin/contract/soak          — hourly enforcement signal (last N hours)
  GET /api/admin/contract/observations  — recent observation rows (paged)
  GET /api/admin/contract/observations/{observation_id}  — single row detail

Intent: let you watch whether enforce mode is firing on real traffic without
touching Supabase directly. Not a replacement for a full observability dashboard —
just enough to complete a manual soak review.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from app.db import get_cursor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/contract", tags=["admin-contract"])


@router.get("/soak")
def soak_summary(
    hours: int = Query(24, ge=1, le=168, description="lookback window in hours"),
) -> dict[str, Any]:
    """Hourly enforcement signal for the current soak window.

    Returns:
      - total observations in the window
      - enforced count + rate
      - fallback_code distribution
      - top_category distribution (for all invalid observations)
      - mode distribution (shadow vs enforce)
      - per-hour bucket for trend plotting
    """
    with get_cursor() as cur:
        # Aggregate counts.
        cur.execute(
            """
            SELECT
              count(*)                                     AS total,
              count(*) FILTER (WHERE enforced)             AS enforced_count,
              count(*) FILTER (WHERE emitted_fallback)     AS fallback_count,
              count(*) FILTER (WHERE NOT valid)            AS invalid_count,
              count(*) FILTER (WHERE mode = 'enforce')     AS enforce_mode_count,
              count(*) FILTER (WHERE mode = 'shadow')      AS shadow_mode_count
            FROM ai_contract_observations
            WHERE created_at >= now() - (%s || ' hours')::interval
            """,
            (str(hours),),
        )
        agg = dict(cur.fetchone())

        # fallback_code distribution.
        cur.execute(
            """
            SELECT fallback_code, count(*) AS n
            FROM ai_contract_observations
            WHERE created_at >= now() - (%s || ' hours')::interval
              AND fallback_code IS NOT NULL
            GROUP BY fallback_code
            ORDER BY n DESC
            """,
            (str(hours),),
        )
        fallback_codes = [{"code": r["fallback_code"], "count": r["n"]} for r in cur.fetchall()]

        # top_category distribution (invalid only).
        cur.execute(
            """
            SELECT top_category, count(*) AS n
            FROM ai_contract_observations
            WHERE created_at >= now() - (%s || ' hours')::interval
              AND top_category IS NOT NULL
              AND NOT valid
            GROUP BY top_category
            ORDER BY n DESC
            LIMIT 15
            """,
            (str(hours),),
        )
        categories = [{"category": r["top_category"], "count": r["n"]} for r in cur.fetchall()]

        # Per-hour bucket (last hours, hourly granularity).
        cur.execute(
            """
            SELECT
              date_trunc('hour', created_at)               AS hour,
              count(*)                                     AS total,
              count(*) FILTER (WHERE enforced)             AS enforced,
              count(*) FILTER (WHERE NOT valid)            AS invalid
            FROM ai_contract_observations
            WHERE created_at >= now() - (%s || ' hours')::interval
            GROUP BY hour
            ORDER BY hour DESC
            """,
            (str(hours),),
        )
        hourly = [
            {
                "hour": str(r["hour"]),
                "total": r["total"],
                "enforced": r["enforced"],
                "invalid": r["invalid"],
            }
            for r in cur.fetchall()
        ]

    total = agg["total"] or 0
    enforced = agg["enforced_count"] or 0
    return {
        "window_hours": hours,
        "total": total,
        "enforced_count": enforced,
        "enforced_rate": round(enforced / total, 4) if total else 0.0,
        "fallback_count": agg["fallback_count"] or 0,
        "invalid_count": agg["invalid_count"] or 0,
        "enforce_mode_count": agg["enforce_mode_count"] or 0,
        "shadow_mode_count": agg["shadow_mode_count"] or 0,
        "fallback_codes": fallback_codes,
        "top_categories": categories,
        "hourly": hourly,
    }


@router.get("/observations")
def list_observations(
    limit: int = Query(50, ge=1, le=500),
    valid: Optional[bool] = Query(None, description="true = valid only, false = invalid only"),
    enforced_only: bool = Query(False, description="only rows where enforce mode fired"),
    mode: Optional[str] = Query(None, description="shadow | enforce"),
    top_category: Optional[str] = Query(None),
) -> list[dict[str, Any]]:
    """List recent contract observations, newest first.

    Shadow soak pattern: ?valid=false  — shows violations observed before enforce is on.
    Post-enforce pattern: ?enforced_only=true  — shows rows where enforcement fired.
    """
    conditions: list[str] = []
    params: list[Any] = []

    if valid is not None:
        conditions.append("valid = %s")
        params.append(valid)
    if enforced_only:
        conditions.append("enforced = true")
    if mode:
        conditions.append("mode = %s")
        params.append(mode)
    if top_category:
        conditions.append("top_category = %s")
        params.append(top_category)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
              observation_id, business_id, request_id, session_id,
              mode, valid, terminal_event, final_state,
              violation_count, critical_violations, top_category,
              runtime_path, runtime_lane,
              enforced, enforcement_reason, emitted_fallback, fallback_code,
              event_count, created_at
            FROM ai_contract_observations
            {where}
            ORDER BY created_at DESC
            LIMIT %s
            """,
            tuple(params),
        )
        return [dict(row) for row in cur.fetchall()]


@router.get("/observations/{observation_id}")
def get_observation(observation_id: str) -> dict[str, Any]:
    """Full detail for a single observation row, including violations jsonb."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM ai_contract_observations
            WHERE observation_id = %s
            """,
            (observation_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"observation {observation_id} not found")
    return dict(row)
