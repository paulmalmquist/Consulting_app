from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.services import research_state_service as svc

router = APIRouter(prefix="/api/v1/market/research-state", tags=["market-research-state"])


@router.post("/ingest")
def ingest_research_state(
    source_path: str | None = None,
    scope_type: str = Query("market"),
    scope_key: str = Query("global"),
):
    try:
        if source_path:
            path = Path(source_path)
            if not path.is_absolute():
                path = svc.REPO_ROOT / source_path
            if not path.exists():
                raise HTTPException(status_code=404, detail="Brief file not found")
            return svc.ingest_brief(path, scope_type=scope_type, scope_key=scope_key)
        row = svc.ensure_market_state_synced()
        if row is None:
            raise HTTPException(status_code=404, detail="No market-intelligence briefs found")
        return row
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/latest")
def get_latest_research_state(
    scope_type: str = Query("market"),
    scope_key: str = Query("global"),
):
    row = svc.get_latest_state(scope_type=scope_type, scope_key=scope_key)
    if row is None:
        raise HTTPException(status_code=404, detail="Research state not found")
    return row


@router.get("/history")
def get_research_state_history(
    scope_type: str = Query("market"),
    scope_key: str = Query("global"),
):
    rows = svc.list_state_history(scope_type=scope_type, scope_key=scope_key)
    return {
        "rows": rows,
        "count": len(rows),
    }
