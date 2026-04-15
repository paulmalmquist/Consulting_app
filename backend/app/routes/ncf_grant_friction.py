"""NCF Grant Friction API routes.

Endpoints:
    GET  /api/v1/ncf/grant-friction/summary?env_id=...
    GET  /api/v1/ncf/grant-friction?env_id=...&band=high&limit=50
    GET  /api/v1/ncf/grant-friction/{grant_id}?env_id=...

Fail-closed: single-grant endpoint always returns 200 with a GrantFrictionScore
envelope. Missing predictions surface as `null_reason='model_not_available'`,
not as 404. This matches the authoritative-state lockdown philosophy: the
shape is constant, the absence is named.
"""

from __future__ import annotations

from dataclasses import asdict
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query

from app.services.ncf_grant_friction_service import (
    get_grant_friction_score,
    get_summary,
    list_grants_at_risk,
)

router = APIRouter(prefix="/api/v1/ncf/grant-friction", tags=["ncf-grant-friction"])


@router.get("/summary")
def summary(env_id: UUID = Query(...)) -> dict:
    """Aggregate band counts + latest prediction timestamp for the KPI tile."""
    try:
        return asdict(get_summary(str(env_id)))
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"summary failed: {exc}") from exc


@router.get("")
def list_at_risk(
    env_id: UUID = Query(...),
    band: str | None = Query(default="high"),
    limit: int = Query(default=50, ge=1, le=500),
) -> dict:
    """List scored grants filtered by band, highest risk first."""
    try:
        scores = list_grants_at_risk(str(env_id), band=band, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"list failed: {exc}") from exc
    return {"count": len(scores), "scores": [asdict(s) for s in scores]}


@router.get("/{grant_id}")
def get_one(
    grant_id: UUID = Path(...),
    env_id: UUID = Query(...),
) -> dict:
    """Return the prediction for a single grant.

    Always 200 with an envelope. `null_reason='model_not_available'` when no
    prediction has been produced for this grant yet.
    """
    try:
        score = get_grant_friction_score(str(env_id), str(grant_id))
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"get failed: {exc}") from exc
    return asdict(score)
