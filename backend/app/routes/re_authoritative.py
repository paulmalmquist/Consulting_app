from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request

from app.schemas.re_authoritative import (
    ReAuthoritativeGrossToNetOut,
    ReAuthoritativeSnapshotRunOut,
    ReAuthoritativeStateOut,
)
from app.services import re_authoritative_snapshots, repe_context

router = APIRouter(prefix="/api/re/v2", tags=["re-v2-authoritative"])


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


@router.get(
    "/authoritative-state/{entity_type}/{entity_id}/{quarter}",
    response_model=ReAuthoritativeStateOut,
)
def get_authoritative_state(
    entity_type: str,
    entity_id: UUID,
    quarter: str,
    snapshot_version: str | None = Query(None),
    audit_run_id: UUID | None = Query(None),
):
    try:
        payload = re_authoritative_snapshots.get_authoritative_state(
            entity_type=entity_type,
            entity_id=entity_id,
            quarter=quarter,
            snapshot_version=snapshot_version,
            audit_run_id=audit_run_id,
        )
        return payload
    except Exception as exc:
        raise _to_http(exc)


@router.get(
    "/funds/{fund_id}/gross-to-net/{quarter}",
    response_model=ReAuthoritativeGrossToNetOut,
)
def get_authoritative_fund_gross_to_net(
    fund_id: UUID,
    quarter: str,
    snapshot_version: str | None = Query(None),
    audit_run_id: UUID | None = Query(None),
):
    try:
        return re_authoritative_snapshots.get_fund_gross_to_net_bridge(
            fund_id=fund_id,
            quarter=quarter,
            snapshot_version=snapshot_version,
            audit_run_id=audit_run_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get(
    "/audit/runs/{audit_run_id}",
    response_model=ReAuthoritativeSnapshotRunOut,
)
def get_authoritative_snapshot_run(audit_run_id: UUID):
    try:
        return re_authoritative_snapshots.get_snapshot_run(audit_run_id=audit_run_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get(
    "/audit/runs/by-version/{snapshot_version}",
    response_model=ReAuthoritativeSnapshotRunOut,
)
def get_authoritative_snapshot_run_by_version(snapshot_version: str):
    try:
        return re_authoritative_snapshots.get_snapshot_run(snapshot_version=snapshot_version)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/environments/{env_id}/portfolio-states")
def get_portfolio_authoritative_states(
    env_id: UUID,
    request: Request,
    quarter: str = Query(..., description="quarter label e.g. 2026Q2"),
):
    """Batched authoritative-state payload for every released fund in an env.

    Returns a list of per-fund authoritative states in one DB query.
    Replaces N per-fund calls from the portfolio list page.

    Shape per entry matches get_authoritative_state(entity_type='fund', ...)
    so frontend gating helpers work unchanged. gross-to-net bridges are NOT
    attached to avoid N+1 — detail views fetch them separately.
    """
    try:
        resolved = repe_context.resolve_repe_business_context(
            request=request, env_id=str(env_id), allow_create=True,
        )
        states = re_authoritative_snapshots.get_portfolio_authoritative_states(
            env_id=env_id,
            business_id=resolved.business_id,
            quarter=quarter,
        )
        return {
            "env_id": str(env_id),
            "business_id": resolved.business_id,
            "quarter": quarter,
            "count": len(states),
            "states": states,
        }
    except Exception as exc:
        raise _to_http(exc)
