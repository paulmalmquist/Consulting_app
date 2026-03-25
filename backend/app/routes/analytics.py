"""Analytics workspace routes — query execution, persistence, and visualization."""

from __future__ import annotations

from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.observability.logger import emit_log
from app.services import analytics_workspace as workspace_svc

router = APIRouter(prefix="/api/analytics/v1", tags=["analytics"])


# ── Request models ──────────────────────────────────────────────────


class RunQueryRequest(BaseModel):
    sql: str
    params: dict | None = None
    query_id: str | None = None


class SaveQueryRequest(BaseModel):
    title: str
    sql_text: str
    nl_prompt: str | None = None
    description: str | None = None
    visualization_spec: dict | None = None
    is_public: bool = False


class CreateCollectionRequest(BaseModel):
    name: str
    description: str | None = None
    parent_id: str | None = None


# ── Query execution ─────────────────────────────────────────────────


@router.post("/query/run")
async def run_query(
    request: Request,
    body: RunQueryRequest,
    business_id: str = Query(...),
    env_id: str = Query(...),
):
    actor = request.headers.get("x-bm-actor", "anonymous")
    try:
        # Check cache first
        cached = workspace_svc.get_cached_result(
            business_id=business_id, sql=body.sql, params=body.params
        )
        if cached:
            return {
                "cached": True,
                "result": cached["result_json"],
                "row_count": cached["row_count"],
            }

        result = workspace_svc.run_query(
            business_id=business_id,
            env_id=env_id,
            sql=body.sql,
            params=body.params,
            executed_by=actor,
            query_id=body.query_id,
        )

        if result.get("error"):
            return JSONResponse(status_code=400, content={"error": result["error"]})

        # Auto-suggest visualization
        viz_hint = workspace_svc.suggest_visualization(
            columns=result["columns"],
            row_count=result["row_count"],
        )
        result["visualization_hint"] = viz_hint

        # Cache successful results
        if not result.get("error") and result["row_count"] > 0:
            workspace_svc.set_cached_result(
                business_id=business_id,
                sql=body.sql,
                params=body.params,
                result_json={"columns": result["columns"], "rows": result["rows"]},
                row_count=result["row_count"],
            )

        return result
    except Exception as exc:
        emit_log(level="error", service="analytics", action="run_query",
                 message="Failed to run query", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


# ── Query persistence ───────────────────────────────────────────────


@router.post("/query/save")
async def save_query(
    request: Request,
    body: SaveQueryRequest,
    business_id: str = Query(...),
    env_id: str = Query(...),
):
    actor = request.headers.get("x-bm-actor", "anonymous")
    try:
        result = workspace_svc.save_query(
            business_id=business_id,
            env_id=env_id,
            title=body.title,
            sql_text=body.sql_text,
            nl_prompt=body.nl_prompt,
            description=body.description,
            visualization_spec=body.visualization_spec,
            is_public=body.is_public,
            created_by=actor,
        )
        return result
    except Exception as exc:
        emit_log(level="error", service="analytics", action="save_query",
                 message="Failed to save query", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


@router.get("/query/{query_id}")
async def get_query(request: Request, query_id: str):
    try:
        result = workspace_svc.get_query(query_id=query_id)
        if not result:
            return JSONResponse(status_code=404, content={"error": "Query not found"})
        return result
    except Exception as exc:
        emit_log(level="error", service="analytics", action="get_query",
                 message="Failed to get query", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


@router.get("/queries")
async def list_queries(
    request: Request,
    business_id: str = Query(...),
    env_id: str = Query(...),
    created_by: str | None = Query(None),
    collection_id: str | None = Query(None),
    limit: int = Query(50, le=200),
):
    try:
        rows = workspace_svc.list_queries(
            business_id=business_id,
            env_id=env_id,
            created_by=created_by,
            collection_id=collection_id,
            limit=limit,
        )
        return {"queries": rows, "count": len(rows)}
    except Exception as exc:
        emit_log(level="error", service="analytics", action="list_queries",
                 message="Failed to list queries", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


@router.delete("/query/{query_id}")
async def delete_query(request: Request, query_id: str):
    try:
        deleted = workspace_svc.delete_query(query_id=query_id)
        if not deleted:
            return JSONResponse(status_code=404, content={"error": "Query not found"})
        return {"deleted": True}
    except Exception as exc:
        emit_log(level="error", service="analytics", action="delete_query",
                 message="Failed to delete query", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


# ── Visualization suggestion ────────────────────────────────────────


@router.post("/query/suggest-viz")
async def suggest_viz(
    request: Request,
    columns: list[str] = Body(...),
    row_count: int = Body(...),
):
    try:
        hint = workspace_svc.suggest_visualization(columns=columns, row_count=row_count)
        return hint
    except Exception as exc:
        emit_log(level="error", service="analytics", action="suggest_viz",
                 message="Failed to suggest visualization", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


# ── Collections ─────────────────────────────────────────────────────


@router.get("/collections")
async def list_collections(
    request: Request,
    business_id: str = Query(...),
    env_id: str = Query(...),
):
    try:
        rows = workspace_svc.list_collections(business_id=business_id, env_id=env_id)
        return {"collections": rows, "count": len(rows)}
    except Exception as exc:
        emit_log(level="error", service="analytics", action="list_collections",
                 message="Failed to list collections", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


@router.post("/collections")
async def create_collection(
    request: Request,
    body: CreateCollectionRequest,
    business_id: str = Query(...),
    env_id: str = Query(...),
):
    actor = request.headers.get("x-bm-actor", "anonymous")
    try:
        result = workspace_svc.create_collection(
            business_id=business_id,
            env_id=env_id,
            name=body.name,
            description=body.description,
            parent_id=body.parent_id,
            created_by=actor,
        )
        return result
    except Exception as exc:
        emit_log(level="error", service="analytics", action="create_collection",
                 message="Failed to create collection", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})
