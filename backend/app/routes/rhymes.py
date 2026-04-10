"""History Rhymes API routes — the 6th pillar surface.

Implements the FastAPI contract defined in skills/historyrhymes/PLAN.md Section 6.

Endpoints:
    POST /api/v1/rhymes/match               — analog retrieval + scoring + structural alerts
    GET  /api/v1/rhymes/episodes            — list with filters
    GET  /api/v1/rhymes/alerts              — active structural alerts (Section 5.5)
    POST /api/v1/rhymes/alerts/{id}/acknowledge

This route delegates all heavy lifting to backend.app.services.history_rhymes_service.
The service is designed to degrade gracefully when migration 503 hasn't been applied
or the Databricks pipeline hasn't populated episode_embeddings yet — it returns valid
empty responses with a `confidence_meta.degraded_reason` instead of 500-ing.
"""

from __future__ import annotations

import uuid
from dataclasses import asdict
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Body, HTTPException, Path, Query
from pydantic import BaseModel, Field

from app.services.history_rhymes_service import (
    acknowledge_alert,
    list_active_alerts,
    list_episodes,
    match_analogs,
)

router = APIRouter(prefix="/api/v1/rhymes", tags=["history-rhymes"])


# ── Request/response models (Section 6 of PLAN.md) ────────────────────────────


class MatchRequest(BaseModel):
    as_of_date: date | None = Field(default=None, description="Default: today (UTC)")
    scope: str = Field(default="global", description="Match scope: 'global' (Phase 1)")
    k: int = Field(default=5, ge=1, le=20, description="Number of analogs to return")
    include_narrative: bool = Field(
        default=False,
        description="If true, include divergence vectors and Claude narratives (slower)",
    )
    force_refresh: bool = Field(
        default=False,
        description="Bypass the daily cache and recompute on the fly",
    )


class AcknowledgeRequest(BaseModel):
    acknowledged_by: str = Field(default="api", description="Audit identifier")


# ── POST /api/v1/rhymes/match ─────────────────────────────────────────────────


@router.post("/match")
def match(req: MatchRequest = Body(default_factory=MatchRequest)):
    """Run analog retrieval against episode_embeddings and return the structured forecast.

    Per PLAN.md Section 6, the response is always shaped as the contract envelope.
    Empty top_analogs with confidence_meta.degraded_reason set is a VALID response —
    it means the upstream pipeline hasn't populated data yet, not an error.
    """
    request_id = f"req_{uuid.uuid4().hex[:12]}"
    try:
        result = match_analogs(
            as_of_date=req.as_of_date,
            scope=req.scope,
            k=req.k,
            include_narrative=req.include_narrative,
            request_id=request_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"match failed: {exc}") from exc

    # asdict() flattens the dataclasses for JSON serialization
    return {
        "as_of_date": result.as_of_date,
        "scope": result.scope,
        "request_id": result.request_id,
        "latency_ms": result.latency_ms,
        "scenarios": result.scenarios,
        "top_analogs": [asdict(m) for m in result.top_analogs],
        "trap_detector": result.trap_detector,
        "structural_alerts": result.structural_alerts,
        "confidence_meta": result.confidence_meta,
    }


# ── GET /api/v1/rhymes/episodes ───────────────────────────────────────────────


@router.get("/episodes")
def get_episodes(
    asset_class: str | None = Query(default=None),
    is_non_event: bool | None = Query(default=None),
    has_hoyt_peak_tag: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
):
    """List episodes from the History Rhymes library, with filters."""
    try:
        episodes = list_episodes(
            asset_class=asset_class,
            is_non_event=is_non_event,
            has_hoyt_peak_tag=has_hoyt_peak_tag,
            limit=limit,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"list_episodes failed: {exc}") from exc

    return {"episodes": episodes, "count": len(episodes)}


# ── GET /api/v1/rhymes/alerts ─────────────────────────────────────────────────


@router.get("/alerts")
def get_alerts(
    type: str | None = Query(default=None, description="Filter by alert_type"),
    unacknowledged: bool = Query(default=True, description="Only show un-acknowledged alerts"),
):
    """List active structural alerts (Section 5.5 of PLAN.md).

    The `unacknowledged` flag is currently always honored as true (the underlying
    service only returns un-acknowledged rows). Setting it to false would require
    a service extension; flagged for future iteration.
    """
    if not unacknowledged:
        # Phase 1: keep the API surface stable but only return active rows.
        # Acknowledged-history view is a follow-up.
        return {"alerts": [], "count": 0, "note": "acknowledged history not yet exposed"}

    try:
        alerts = list_active_alerts(alert_type=type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"list_alerts failed: {exc}") from exc

    return {"alerts": alerts, "count": len(alerts)}


# ── POST /api/v1/rhymes/alerts/{id}/acknowledge ───────────────────────────────


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge(
    alert_id: UUID = Path(...),
    body: AcknowledgeRequest = Body(default_factory=AcknowledgeRequest),
):
    """Mark a structural alert as acknowledged."""
    try:
        ok = acknowledge_alert(alert_id=alert_id, acknowledged_by=body.acknowledged_by)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"acknowledge failed: {exc}") from exc

    if not ok:
        raise HTTPException(status_code=404, detail="alert not found or already acknowledged")

    return {"status": "acknowledged", "alert_id": str(alert_id)}
