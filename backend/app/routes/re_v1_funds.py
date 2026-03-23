from __future__ import annotations

import time
from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query, Request

from app.observability.logger import emit_log
from app.schemas.repe import (
    RepeFundCreateWithContextRequest,
    RepeFundDetailOut,
    RepeFundOut,
)
from app.services import audit as audit_svc
from app.services import repe
from app.services import repe_context

router = APIRouter(prefix="/api/re/v1/funds", tags=["re-v1-funds"])


def _to_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, repe_context.RepeContextError):
        msg = str(exc)
        if "missing" in msg.lower() or "migration" in msg.lower():
            return HTTPException(status_code=503, detail=msg)
        return HTTPException(status_code=400, detail=msg)
    if isinstance(exc, psycopg.errors.UndefinedTable):
        return HTTPException(
            status_code=503,
            detail="REPE schema not migrated. Run migrations 265/266/267 on this database.",
        )
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


def _raise_error(exc: Exception, action: str, context: dict | None = None):
    emit_log(
        level="error",
        service="backend",
        action="re.v1.funds.error",
        message="RE v1 funds route failed",
        context={
            "failed_action": action,
            "error_type": exc.__class__.__name__,
            **(context or {}),
        },
    )
    raise _to_http_error(exc)


@router.get("", response_model=list[RepeFundOut])
def list_funds(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        target_business_id = business_id
        if target_business_id is None:
            resolved = repe_context.resolve_repe_business_context(
                request=request,
                env_id=env_id,
                allow_create=True,
            )
            target_business_id = UUID(resolved.business_id)
        rows = repe.list_funds(business_id=target_business_id)
        return [RepeFundOut(**row) for row in rows]
    except Exception as exc:
        _raise_error(
            exc,
            action="re.v1.funds.list",
            context={"env_id": env_id, "business_id": str(business_id) if business_id else None},
        )


@router.post("", response_model=RepeFundOut)
def create_fund(req: RepeFundCreateWithContextRequest, request: Request):
    started = time.monotonic()
    try:
        target_business_id = req.business_id
        resolved_env_id = req.env_id
        if target_business_id is None:
            resolved = repe_context.resolve_repe_business_context(
                request=request,
                env_id=req.env_id,
                allow_create=True,
            )
            target_business_id = UUID(resolved.business_id)
            resolved_env_id = resolved.env_id

        payload = req.model_dump(exclude={"business_id", "env_id"})
        row = repe.create_fund(business_id=target_business_id, payload=payload)

        audit_svc.record_event(
            actor="api_user",
            action="fund.created",
            tool_name="re.v1.funds.create",
            success=True,
            latency_ms=int((time.monotonic() - started) * 1000),
            business_id=target_business_id,
            object_type="fund",
            object_id=row["fund_id"],
            input_data={
                "env_id": resolved_env_id,
                "name": req.name,
                "strategy": req.strategy,
            },
            output_data={"fund_id": str(row["fund_id"])},
        )

        return RepeFundOut(**row)
    except Exception as exc:
        _raise_error(
            exc,
            action="re.v1.funds.create",
            context={"env_id": req.env_id, "business_id": str(req.business_id) if req.business_id else None},
        )


@router.get("/{fund_id}", response_model=RepeFundDetailOut)
def get_fund(fund_id: UUID):
    try:
        fund, terms = repe.get_fund(fund_id=fund_id)
        return RepeFundDetailOut(
            fund=RepeFundOut(**fund),
            terms=terms,
        )
    except Exception as exc:
        _raise_error(exc, action="re.v1.funds.get", context={"fund_id": str(fund_id)})
