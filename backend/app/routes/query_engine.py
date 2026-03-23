from uuid import UUID

from fastapi import APIRouter, Body, HTTPException

from app.services import winston_demo as svc

router = APIRouter(prefix="/api/query", tags=["query-engine"])


@router.post("/run")
def run_query(payload: dict = Body(...)):
    try:
        env_id = payload.get("env_id")
        if not env_id:
            raise ValueError("env_id is required")
        return svc.run_structured_query(
            env_id=UUID(str(env_id)),
            view_key=str(payload.get("view_key") or "").strip(),
            select=payload.get("select"),
            filters=payload.get("filters"),
            sort=payload.get("sort"),
            limit=int(payload.get("limit") or 25),
            actor=str(payload.get("actor") or "anonymous"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
