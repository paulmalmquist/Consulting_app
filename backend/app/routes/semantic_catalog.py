"""Semantic catalog routes — metric, entity, join, and lineage APIs."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.observability.logger import emit_log
from app.services import semantic_catalog as catalog_svc

router = APIRouter(prefix="/api/semantic/v1", tags=["semantic-catalog"])


# ── Metrics ─────────────────────────────────────────────────────────


@router.get("/catalog/metrics")
async def list_metrics(
    request: Request,
    business_id: str = Query(...),
):
    try:
        rows = catalog_svc.list_metrics(business_id=business_id)
        return {"metrics": rows, "count": len(rows)}
    except Exception as exc:
        emit_log(level="error", service="semantic_catalog", action="list_metrics",
                 message="Failed to list metrics", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


@router.get("/catalog/metrics/{metric_key}")
async def get_metric(
    request: Request,
    metric_key: str,
    business_id: str = Query(...),
):
    try:
        row = catalog_svc.get_metric(business_id=business_id, metric_key=metric_key)
        if not row:
            return JSONResponse(status_code=404, content={"error": f"Metric '{metric_key}' not found"})
        return row
    except Exception as exc:
        emit_log(level="error", service="semantic_catalog", action="get_metric",
                 message="Failed to get metric", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


# ── Entities ────────────────────────────────────────────────────────


@router.get("/catalog/entities")
async def list_entities(
    request: Request,
    business_id: str = Query(...),
):
    try:
        rows = catalog_svc.list_entities(business_id=business_id)
        return {"entities": rows, "count": len(rows)}
    except Exception as exc:
        emit_log(level="error", service="semantic_catalog", action="list_entities",
                 message="Failed to list entities", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


# ── Joins ───────────────────────────────────────────────────────────


@router.get("/catalog/joins")
async def list_joins(
    request: Request,
    business_id: str = Query(...),
):
    try:
        rows = catalog_svc.list_joins(business_id=business_id)
        return {"joins": rows, "count": len(rows)}
    except Exception as exc:
        emit_log(level="error", service="semantic_catalog", action="list_joins",
                 message="Failed to list joins", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


# ── Lineage ─────────────────────────────────────────────────────────


@router.get("/catalog/lineage/{table}/{column}")
async def get_lineage(
    request: Request,
    table: str,
    column: str,
    business_id: str = Query(...),
):
    try:
        edges = catalog_svc.get_lineage(business_id=business_id, table=table, column=column)
        return {"lineage": edges, "count": len(edges)}
    except Exception as exc:
        emit_log(level="error", service="semantic_catalog", action="get_lineage",
                 message="Failed to get lineage", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


# ── Contracts ───────────────────────────────────────────────────────


@router.get("/catalog/contracts")
async def list_contracts(
    request: Request,
    business_id: str = Query(...),
):
    try:
        rows = catalog_svc.list_contracts(business_id=business_id)
        return {"contracts": rows, "count": len(rows)}
    except Exception as exc:
        emit_log(level="error", service="semantic_catalog", action="list_contracts",
                 message="Failed to list contracts", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})


# ── Publish ─────────────────────────────────────────────────────────


@router.post("/catalog/publish")
async def publish_catalog(
    request: Request,
    business_id: str = Query(...),
    publisher: str = Query(...),
    changelog: str | None = Query(None),
):
    try:
        result = catalog_svc.publish_catalog_version(
            business_id=business_id,
            publisher=publisher,
            changelog=changelog,
        )
        return result
    except Exception as exc:
        emit_log(level="error", service="semantic_catalog", action="publish",
                 message="Failed to publish catalog version", error=exc)
        return JSONResponse(status_code=500, content={"error": "Internal error"})
