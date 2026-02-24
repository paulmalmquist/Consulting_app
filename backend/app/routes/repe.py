from __future__ import annotations

from datetime import date
import time
from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query
from fastapi import Request

from app.observability.logger import emit_log
from app.schemas.repe import (
    RepeAssetCreateRequest,
    RepeAssetDetailOut,
    RepeAssetOut,
    RepeAssetOwnershipOut,
    RepeDealCreateRequest,
    RepeDealOut,
    RepeEntityCreateRequest,
    RepeEntityOut,
    RepeFundCreateRequest,
    RepeFundCreateWithContextRequest,
    RepeFundDetailOut,
    RepeFundOut,
    RepeContextInitRequest,
    RepeContextOut,
    RepeOwnershipEdgeCreateRequest,
    RepeOwnershipEdgeOut,
    RepeSeedOut,
)
from app.services import repe
from app.services import repe_context
from app.services import audit as audit_svc

router = APIRouter(prefix="/api/repe", tags=["repe"])


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


def _log(action: str, message: str, *, context: dict | None = None, level: str = "info") -> None:
    emit_log(
        level=level,
        service="backend",
        action=action,
        message=message,
        context=context or {},
    )


def _raise_error(exc: Exception, *, action: str, context: dict | None = None):
    _log(
        "repe.db_error",
        "REPE route failed",
        level="error",
        context={
            "failed_action": action,
            "error_type": exc.__class__.__name__,
            **(context or {}),
        },
    )
    raise _to_http_error(exc)


@router.get("/businesses/{business_id}/funds", response_model=list[RepeFundOut])
def list_business_funds(business_id: UUID):
    _log("repe.fund.list.start", "Listing REPE funds", context={"business_id": str(business_id)})
    try:
        rows = repe.list_funds(business_id=business_id)
        _log("repe.fund.list.ok", "Listed REPE funds", context={"count": len(rows)})
        return [RepeFundOut(**row) for row in rows]
    except Exception as exc:
        _raise_error(exc, action="repe.fund.list", context={"business_id": str(business_id)})


@router.get("/funds", response_model=list[RepeFundOut])
def list_funds(
    request: Request,
    business_id: UUID | None = Query(default=None),
    env_id: str | None = Query(default=None),
):
    """List funds for explicit business_id or implicit resolved REPE context."""
    try:
        if business_id is None:
            resolved = repe_context.resolve_repe_business_context(
                request=request,
                env_id=env_id,
                allow_create=True,
            )
            business_id = UUID(resolved.business_id)
        rows = repe.list_funds(business_id=business_id)
        _log("repe.fund.list.ok", "Listed REPE funds (resolved context)", context={"count": len(rows), "business_id": str(business_id)})
        return [RepeFundOut(**row) for row in rows]
    except Exception as exc:
        _raise_error(exc, action="repe.fund.list.implicit", context={"business_id": str(business_id) if business_id else None, "env_id": env_id})


@router.post("/businesses/{business_id}/funds", response_model=RepeFundOut)
def create_business_fund(business_id: UUID, req: RepeFundCreateRequest):
    started = time.monotonic()
    _log("repe.fund.create.start", "Creating REPE fund", context={"business_id": str(business_id), "name": req.name})
    try:
        row = repe.create_fund(business_id=business_id, payload=req.model_dump())
        audit_svc.record_event(
            actor="api_user",
            action="fund.created",
            tool_name="repe.funds.create_business",
            success=True,
            latency_ms=int((time.monotonic() - started) * 1000),
            business_id=business_id,
            object_type="fund",
            object_id=row["fund_id"],
            input_data={"name": req.name, "strategy": req.strategy},
            output_data={"fund_id": str(row["fund_id"])},
        )
        _log("repe.fund.create.ok", "Created REPE fund", context={"fund_id": str(row["fund_id"])})
        return RepeFundOut(**row)
    except Exception as exc:
        _raise_error(exc, action="repe.fund.create", context={"business_id": str(business_id), "name": req.name})


@router.post("/funds", response_model=RepeFundOut)
def create_fund(req: RepeFundCreateWithContextRequest, request: Request):
    """Create fund with explicit business_id or implicit resolved REPE context."""
    started = time.monotonic()
    try:
        if req.business_id:
            target_business_id = req.business_id
        else:
            resolved = repe_context.resolve_repe_business_context(
                request=request,
                env_id=req.env_id,
                allow_create=True,
            )
            target_business_id = UUID(resolved.business_id)
        payload = req.model_dump(exclude={"business_id", "env_id"})
        row = repe.create_fund(business_id=target_business_id, payload=payload)
        audit_svc.record_event(
            actor="api_user",
            action="fund.created",
            tool_name="repe.funds.create",
            success=True,
            latency_ms=int((time.monotonic() - started) * 1000),
            business_id=target_business_id,
            object_type="fund",
            object_id=row["fund_id"],
            input_data={"env_id": req.env_id, "name": req.name, "strategy": req.strategy},
            output_data={"fund_id": str(row["fund_id"])},
        )
        _log("repe.fund.create.ok", "Created REPE fund (resolved context)", context={"fund_id": str(row["fund_id"]), "business_id": str(target_business_id)})
        return RepeFundOut(**row)
    except Exception as exc:
        _raise_error(exc, action="repe.fund.create.implicit", context={"env_id": req.env_id})


@router.get("/funds/{fund_id}", response_model=RepeFundDetailOut)
def get_fund(fund_id: UUID):
    _log("repe.fund.get.start", "Loading REPE fund", context={"fund_id": str(fund_id)})
    try:
        fund, terms = repe.get_fund(fund_id=fund_id)
        _log("repe.fund.get.ok", "Loaded REPE fund", context={"fund_id": str(fund_id), "terms": len(terms)})
        return RepeFundDetailOut(
            fund=RepeFundOut(**fund),
            terms=terms,
        )
    except Exception as exc:
        _raise_error(exc, action="repe.fund.get", context={"fund_id": str(fund_id)})


@router.get("/funds/{fund_id}/deals", response_model=list[RepeDealOut])
def list_fund_deals(fund_id: UUID):
    _log("repe.deal.list.start", "Listing deals", context={"fund_id": str(fund_id)})
    try:
        rows = repe.list_deals(fund_id=fund_id)
        _log("repe.deal.list.ok", "Listed deals", context={"fund_id": str(fund_id), "count": len(rows)})
        return [RepeDealOut(**row) for row in rows]
    except Exception as exc:
        _raise_error(exc, action="repe.deal.list", context={"fund_id": str(fund_id)})


@router.post("/funds/{fund_id}/deals", response_model=RepeDealOut)
def create_fund_deal(fund_id: UUID, req: RepeDealCreateRequest):
    _log("repe.deal.create.start", "Creating deal", context={"fund_id": str(fund_id), "name": req.name})
    try:
        row = repe.create_deal(fund_id=fund_id, payload=req.model_dump())
        _log("repe.deal.create.ok", "Created deal", context={"deal_id": str(row["deal_id"])})
        return RepeDealOut(**row)
    except Exception as exc:
        _raise_error(exc, action="repe.deal.create", context={"fund_id": str(fund_id)})


@router.get("/deals/{deal_id}", response_model=RepeDealOut)
def get_deal(deal_id: UUID):
    _log("repe.deal.get.start", "Loading deal", context={"deal_id": str(deal_id)})
    try:
        row = repe.get_deal(deal_id=deal_id)
        _log("repe.deal.get.ok", "Loaded deal", context={"deal_id": str(deal_id)})
        return RepeDealOut(**row)
    except Exception as exc:
        _raise_error(exc, action="repe.deal.get", context={"deal_id": str(deal_id)})


@router.post("/deals/{deal_id}/assets", response_model=RepeAssetOut)
def create_deal_asset(deal_id: UUID, req: RepeAssetCreateRequest):
    _log("repe.asset.create.start", "Creating asset", context={"deal_id": str(deal_id), "asset_type": req.asset_type})
    try:
        row = repe.create_asset(deal_id=deal_id, payload=req.model_dump())
        _log("repe.asset.create.ok", "Created asset", context={"asset_id": str(row["asset_id"])})
        return RepeAssetOut(**row)
    except Exception as exc:
        _raise_error(exc, action="repe.asset.create", context={"deal_id": str(deal_id)})


@router.get("/deals/{deal_id}/assets", response_model=list[RepeAssetOut])
def list_deal_assets(deal_id: UUID):
    _log("repe.asset.list.start", "Listing assets", context={"deal_id": str(deal_id)})
    try:
        rows = repe.list_assets(deal_id=deal_id)
        _log("repe.asset.list.ok", "Listed assets", context={"deal_id": str(deal_id), "count": len(rows)})
        return [RepeAssetOut(**row) for row in rows]
    except Exception as exc:
        _raise_error(exc, action="repe.asset.list", context={"deal_id": str(deal_id)})


@router.get("/assets/{asset_id}", response_model=RepeAssetDetailOut)
def get_asset(asset_id: UUID):
    _log("repe.asset.get.start", "Loading asset", context={"asset_id": str(asset_id)})
    try:
        asset, details = repe.get_asset(asset_id=asset_id)
        _log("repe.asset.get.ok", "Loaded asset", context={"asset_id": str(asset_id), "asset_type": asset["asset_type"]})
        return RepeAssetDetailOut(asset=RepeAssetOut(**asset), details=details)
    except Exception as exc:
        _raise_error(exc, action="repe.asset.get", context={"asset_id": str(asset_id)})


@router.post("/entities", response_model=RepeEntityOut)
def create_entity(req: RepeEntityCreateRequest):
    _log("repe.entity.create.start", "Creating entity", context={"business_id": str(req.business_id), "entity_type": req.entity_type})
    try:
        row = repe.create_entity(payload=req.model_dump())
        _log("repe.entity.create.ok", "Created entity", context={"entity_id": str(row["entity_id"])})
        return RepeEntityOut(**row)
    except Exception as exc:
        _raise_error(exc, action="repe.entity.create", context={"business_id": str(req.business_id)})


@router.post("/ownership-edges", response_model=RepeOwnershipEdgeOut)
def create_ownership_edge(req: RepeOwnershipEdgeCreateRequest):
    _log("repe.ownership.create.start", "Creating ownership edge")
    try:
        row = repe.create_ownership_edge(payload=req.model_dump())
        _log("repe.ownership.create.ok", "Created ownership edge", context={"ownership_edge_id": str(row["ownership_edge_id"])})
        return RepeOwnershipEdgeOut(**row)
    except Exception as exc:
        _raise_error(exc, action="repe.ownership.create")


@router.get("/assets/{asset_id}/ownership", response_model=RepeAssetOwnershipOut)
def get_asset_ownership(asset_id: UUID, as_of_date: date | None = Query(None)):
    _log("repe.ownership.asset.start", "Loading asset ownership", context={"asset_id": str(asset_id), "as_of_date": str(as_of_date) if as_of_date else None})
    try:
        out = repe.get_asset_ownership(asset_id=asset_id, as_of_date=as_of_date)
        _log("repe.ownership.asset.ok", "Loaded asset ownership", context={"asset_id": str(asset_id), "links": len(out["links"])})
        return RepeAssetOwnershipOut(**out)
    except Exception as exc:
        _raise_error(exc, action="repe.ownership.asset", context={"asset_id": str(asset_id)})


@router.post("/businesses/{business_id}/seed", response_model=RepeSeedOut)
def seed_business_repe(business_id: UUID):
    _log("repe.seed.start", "Seeding REPE demo", context={"business_id": str(business_id)})
    try:
        out = repe.seed_demo(business_id=business_id)
        _log("repe.seed.ok", "Seeded REPE demo", context={"business_id": str(business_id), "funds": len(out["funds"])})
        return RepeSeedOut(**out)
    except Exception as exc:
        _raise_error(exc, action="repe.seed", context={"business_id": str(business_id)})


@router.get("/context", response_model=RepeContextOut)
def get_repe_context(request: Request, env_id: str | None = Query(default=None), business_id: UUID | None = Query(default=None)):
    """Resolve REPE business context from env/session and auto-create binding if missing."""
    try:
        resolved = repe_context.resolve_repe_business_context(
            request=request,
            env_id=env_id,
            business_id=str(business_id) if business_id else None,
            allow_create=True,
        )
        _log(
            "repe.context.resolve.ok",
            "Resolved REPE context",
            context={
                "env_id": resolved.env_id,
                "business_id": resolved.business_id,
                "created": resolved.created,
                "source": resolved.source,
                **resolved.diagnostics,
            },
        )
        return RepeContextOut(
            env_id=resolved.env_id,
            business_id=UUID(resolved.business_id),
            created=resolved.created,
            source=resolved.source,
            diagnostics=resolved.diagnostics,
        )
    except Exception as exc:
        _raise_error(exc, action="repe.context.resolve", context={"env_id": env_id})


@router.post("/context/init", response_model=RepeContextOut)
def init_repe_context(req: RepeContextInitRequest, request: Request):
    """Explicit one-click workspace initialization fallback."""
    try:
        resolved = repe_context.resolve_repe_business_context(
            request=request,
            env_id=req.env_id,
            business_id=str(req.business_id) if req.business_id else None,
            allow_create=True,
        )
        return RepeContextOut(
            env_id=resolved.env_id,
            business_id=UUID(resolved.business_id),
            created=resolved.created,
            source=resolved.source,
            diagnostics=resolved.diagnostics,
        )
    except Exception as exc:
        _raise_error(exc, action="repe.context.init", context={"env_id": req.env_id})


@router.get("/health")
def repe_health():
    try:
        return repe_context.repe_health()
    except Exception as exc:
        _raise_error(exc, action="repe.health")
