"""GET /api/re/v2/operator-diagnostics — senior-housing operator diagnostics.

Thin handler over `app.services.re_operator_diagnostics.get_operator_diagnostics`.
Preserves the Authoritative State Lockdown contract: the service calls
`re_authoritative_snapshots.get_authoritative_state` per asset for NOI/occupancy,
never aggregates over `re_authoritative_*`.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.re_operator_diagnostics import OperatorDiagnosticsOut
from app.services import re_operator_diagnostics

router = APIRouter(prefix="/api/re/v2", tags=["re-v2-operator-diagnostics"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(
            status_code=404,
            detail={"error_code": "NOT_FOUND", "message": str(exc)},
        )
    if isinstance(exc, ValueError):
        return HTTPException(
            status_code=400,
            detail={"error_code": "VALIDATION_ERROR", "message": str(exc)},
        )
    return HTTPException(
        status_code=500,
        detail={"error_code": "INTERNAL_ERROR", "message": str(exc)},
    )


@router.get("/operator-diagnostics", response_model=OperatorDiagnosticsOut)
def get_operator_diagnostics(
    env_id: str = Query(..., description="Environment id"),
    quarter: str = Query(..., description="Quarter label e.g. 2026Q2"),
    fund_id: UUID | None = Query(None),
    acuity: str | None = Query(None),
    region: str | None = Query(None),
    operator: str | None = Query(None),
    snapshot_version: str | None = Query(None),
    audit_run_id: UUID | None = Query(None),
):
    try:
        return re_operator_diagnostics.get_operator_diagnostics(
            env_id=env_id,
            quarter=quarter,
            fund_id=fund_id,
            acuity=acuity,
            region=region,
            operator=operator,
            snapshot_version=snapshot_version,
            audit_run_id=audit_run_id,
        )
    except Exception as exc:
        raise _to_http(exc)
