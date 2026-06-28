"""Relativity MES Sandbox API (Phase 10) — display-only reads over the rel_* serving tables.

Mounted under /api/telemetry/relativity-mes so it rides the existing telemetry frontend proxy
(repo-b/src/app/api/telemetry/[...path]). Every route reads Postgres/Lakebase serving rows and fails
closed with a null_reason when the serving layer is empty/missing — no fabricated fallback. All data
is SYNTHETIC (shaped like Manufacturo MES + a generic ERP/PLM facsimile).
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query

from app.services import relativity_mes as svc

router = APIRouter(prefix="/api/telemetry/relativity-mes", tags=["relativity-mes"])


@router.get("/overview")
def overview(env_id: str = Query(...), business_id: UUID = Query(...)):
    return svc.overview(env_id=env_id, business_id=business_id)


@router.get("/genealogy")
def genealogy(env_id: str = Query(...), business_id: UUID = Query(...),
              vehicle_serial: str | None = Query(None)):
    return svc.genealogy(env_id=env_id, business_id=business_id, vehicle_serial=vehicle_serial)


@router.get("/where-used")
def where_used(env_id: str = Query(...), business_id: UUID = Query(...), lot_no: str = Query(...)):
    return svc.where_used(env_id=env_id, business_id=business_id, lot_no=lot_no)


@router.get("/ncr")
def ncr(env_id: str = Query(...), business_id: UUID = Query(...)):
    return svc.ncr(env_id=env_id, business_id=business_id)


@router.get("/cost")
def cost(env_id: str = Query(...), business_id: UUID = Query(...),
         vehicle_serial: str | None = Query(None)):
    return svc.cost(env_id=env_id, business_id=business_id, vehicle_serial=vehicle_serial)


@router.get("/lineage")
def lineage(env_id: str = Query(...), business_id: UUID = Query(...)):
    return svc.lineage(env_id=env_id, business_id=business_id)


@router.get("/analytics")
def analytics(env_id: str = Query(...), business_id: UUID = Query(...),
              vehicle_serial: str | None = Query(None)):
    """Build Analytics simulation-analysis blocks. vehicle_serial refilters readiness+bridge only."""
    return svc.analytics(env_id=env_id, business_id=business_id, vehicle_serial=vehicle_serial)


@router.get("/source/{table}")
def source(table: str, env_id: str = Query(...), business_id: UUID = Query(...),
           key: str | None = Query(None), value: str | None = Query(None),
           limit: int = Query(200)):
    return svc.source_rows(env_id=env_id, business_id=business_id, table=table, key=key,
                           value=value, limit=limit)
