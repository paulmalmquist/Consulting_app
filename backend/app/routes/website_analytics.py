"""Website OS — Analytics module routes."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from app.services import website_analytics as svc

router = APIRouter(prefix="/api/website/analytics", tags=["website-analytics"])


class SnapshotUpsertRequest(BaseModel):
    env_id: str
    date: str
    sessions: int = 0
    pageviews: int = 0
    conversions: int = 0
    revenue: float = 0.0
    top_page: Optional[str] = None


@router.get("/snapshots")
def list_snapshots(
    env_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
):
    try:
        return svc.list_snapshots(env_id=env_id, days=days)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/snapshots")
def upsert_snapshot(req: SnapshotUpsertRequest):
    try:
        return svc.upsert_snapshot(
            env_id=req.env_id,
            date=req.date,
            sessions=req.sessions,
            pageviews=req.pageviews,
            conversions=req.conversions,
            revenue=req.revenue,
            top_page=req.top_page,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/summary")
def get_analytics_summary(env_id: str = Query(...)):
    try:
        return svc.get_analytics_summary(env_id=env_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
