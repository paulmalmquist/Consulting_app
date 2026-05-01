"""Investment Engine routes — Phase 5.

All endpoints follow the contract from skills/winston-investment-engine-module:

- Strict input validation via pydantic models. Unknown fields rejected.
- Structured error responses: { valid, value, errors[{code, message, context}] }
- No partial calculations. valid=False → HTTP 422 with the error envelope.
- Mutating endpoints write inv_audit_log + inv_mutation_event in the same
  transaction (handled by the service layer).
- env_id resolved from request context; passed through to services.

Endpoints:
    POST /investment-engine/calculate/nav           — preview NAV; no persistence
    POST /investment-engine/calculate/pnl           — preview P&L; no persistence
    POST /investment-engine/snapshots/nav/produce   — persist a draft NAV snapshot
    POST /investment-engine/snapshots/nav/{id}/lock
    POST /investment-engine/snapshots/nav/{id}/release
    GET  /investment-engine/snapshots/nav/{id}/reconstruct
    GET  /investment-engine/nav/{fund_id}/{date}    — released NAV for the key
    POST /investment-engine/reconciliation/run      — execute a reconciliation run
    GET  /investment-engine/reconciliation/breaks   — list breaks (filterable)
    GET  /investment-engine/reconciliation/runs/{id} — run + breaks report
"""
from __future__ import annotations

from datetime import date as date_type
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.db import get_cursor
from app.services import accounting_engine, accounting_snapshot_writer, reconciliation_engine
from app.services import env_context

router = APIRouter(prefix="/api/investment-engine", tags=["investment_engine"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ctx(request: Request, env_id: Optional[str] = None,
         business_id: Optional[UUID] = None) -> tuple[str, UUID]:
    """Resolve (env_id, business_id) from request + optional overrides."""
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=False,
    )
    return ctx.env_id, UUID(ctx.business_id)


def _engine_response(result: dict, *, success_status: int = 200) -> JSONResponse:
    """Convert an EngineResult to a FastAPI JSON response.

    valid=True  → success_status with the full envelope
    valid=False → 422 with the same envelope
    """
    serialized = _jsonify(result)
    status = success_status if result["valid"] else 422
    return JSONResponse(content=serialized, status_code=status)


def _jsonify(value: Any) -> Any:
    """Recursive JSON-safe serialization (Decimal, UUID, date)."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, date_type):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonify(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonify(v) for v in value]
    if hasattr(value, "__dict__"):
        # dataclass-like objects from compare_positions Break list
        return {k: _jsonify(v) for k, v in value.__dict__.items()}
    return value


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models — strict (extra="forbid" rejects unknown fields)
# ─────────────────────────────────────────────────────────────────────────────

class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CalculateNavRequest(_Strict):
    fund_id: UUID
    effective_date: date_type
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


class CalculatePnlRequest(_Strict):
    fund_id: UUID
    start_date: date_type
    end_date: date_type
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


class ProduceNavSnapshotRequest(_Strict):
    fund_id: UUID
    effective_date: date_type
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None
    actor: str = Field(default="api")
    correlation_id: Optional[str] = None


class SnapshotTransitionRequest(_Strict):
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None
    actor: str = Field(default="api")
    reason: Optional[str] = None
    correlation_id: Optional[str] = None


class RunReconciliationRequest(_Strict):
    run_id: UUID
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None
    qty_abs: Optional[str] = None       # Decimal as string
    qty_rel: Optional[str] = None
    price_abs: Optional[str] = None
    price_rel: Optional[str] = None
    stale_seconds: Optional[int] = None


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — calculation (read-only)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/calculate/nav")
def post_calculate_nav(req: CalculateNavRequest, request: Request):
    env_id, _ = _ctx(request, req.env_id, req.business_id)
    result = accounting_engine.calculate_nav(
        env_id=env_id, fund_id=req.fund_id, as_of_date=req.effective_date,
    )
    return _engine_response(result)


@router.post("/calculate/pnl")
def post_calculate_pnl(req: CalculatePnlRequest, request: Request):
    env_id, _ = _ctx(request, req.env_id, req.business_id)
    result = accounting_engine.calculate_pnl(
        env_id=env_id, fund_id=req.fund_id,
        start_date=req.start_date, end_date=req.end_date,
    )
    return _engine_response(result)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — NAV snapshot lifecycle
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/snapshots/nav/produce")
def post_produce_nav(req: ProduceNavSnapshotRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    result = accounting_snapshot_writer.produce_nav_snapshot(
        env_id=env_id, business_id=business_id,
        fund_id=req.fund_id, effective_date=req.effective_date,
        actor=req.actor, correlation_id=req.correlation_id,
    )
    return _engine_response(result, success_status=201)


@router.post("/snapshots/nav/{snapshot_id}/lock")
def post_lock_nav(snapshot_id: UUID, req: SnapshotTransitionRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    result = accounting_snapshot_writer.lock_nav_snapshot(
        env_id=env_id, business_id=business_id,
        snapshot_id=snapshot_id, actor=req.actor,
        correlation_id=req.correlation_id,
    )
    return _engine_response(result)


@router.post("/snapshots/nav/{snapshot_id}/release")
def post_release_nav(snapshot_id: UUID, req: SnapshotTransitionRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    result = accounting_snapshot_writer.release_nav_snapshot(
        env_id=env_id, business_id=business_id,
        snapshot_id=snapshot_id, actor=req.actor, reason=req.reason,
        correlation_id=req.correlation_id,
    )
    return _engine_response(result)


@router.get("/snapshots/nav/{snapshot_id}/reconstruct")
def get_reconstruct_nav(snapshot_id: UUID, request: Request,
                         env_id: Optional[str] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    result = accounting_snapshot_writer.reconstruct_nav_snapshot(
        env_id=env_id_resolved, snapshot_id=snapshot_id,
    )
    return _engine_response(result)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — released NAV lookup
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/nav/{fund_id}/{eff_date}")
def get_released_nav(fund_id: UUID, eff_date: date_type, request: Request,
                      env_id: Optional[str] = Query(default=None),
                      as_of: Optional[str] = Query(default=None,
                          description="ISO timestamp; returns the released snapshot known on/before this moment")):
    env_id_resolved, _ = _ctx(request, env_id, None)

    sql = """
        SELECT id, version, status, as_of_date,
               nav_native, nav_currency, nav_base,
               total_assets_native, total_liabilities_native,
               input_versions, produced_at
        FROM inv_nav_snapshot
        WHERE env_id = %s AND entity_id = %s AND effective_date = %s
          AND status = 'released'
    """
    params: tuple = (env_id_resolved, str(fund_id), eff_date)
    # Bi-temporal "as of" filter
    if as_of:
        sql += " AND as_of_date <= %s"
        params = params + (as_of,)
    sql += " ORDER BY as_of_date DESC LIMIT 1"

    with get_cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

    if not row:
        return JSONResponse(
            content={
                "valid": False,
                "value": None,
                "errors": [{
                    "code": "snapshot_not_released",
                    "message": "no released NAV snapshot for this (fund, effective_date)",
                    "context": {"fund_id": str(fund_id),
                                "effective_date": eff_date.isoformat(),
                                "as_of": as_of},
                }],
                "input_versions": {},
            },
            status_code=404,
        )

    return JSONResponse(content=_jsonify({
        "valid": True,
        "value": {
            "snapshot_id": row["id"],
            "version": row["version"],
            "status": row["status"],
            "as_of_date": row["as_of_date"].isoformat(),
            "nav_native": row["nav_native"],
            "nav_currency": row["nav_currency"],
            "nav_base": row["nav_base"],
            "total_assets_native": row["total_assets_native"],
            "total_liabilities_native": row["total_liabilities_native"],
            "input_versions": row["input_versions"],
            "produced_at": row["produced_at"].isoformat(),
        },
        "errors": [],
        "input_versions": {"snapshot_id": str(row["id"])},
    }))


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — reconciliation
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/reconciliation/run")
def post_run_reconciliation(req: RunReconciliationRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)

    tol_kwargs: dict = {}
    if req.qty_abs is not None: tol_kwargs["qty_abs"] = Decimal(req.qty_abs)
    if req.qty_rel is not None: tol_kwargs["qty_rel"] = Decimal(req.qty_rel)
    if req.price_abs is not None: tol_kwargs["price_abs"] = Decimal(req.price_abs)
    if req.price_rel is not None: tol_kwargs["price_rel"] = Decimal(req.price_rel)
    if req.stale_seconds is not None: tol_kwargs["stale_seconds"] = req.stale_seconds
    tolerances = reconciliation_engine.Tolerances(**tol_kwargs)

    result = reconciliation_engine.run_reconciliation(
        env_id=env_id, business_id=business_id,
        run_id=req.run_id, tolerances=tolerances,
    )
    return _engine_response(result)


@router.get("/reconciliation/runs/{run_id}")
def get_reconciliation_report(run_id: UUID, request: Request,
                               env_id: Optional[str] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    result = reconciliation_engine.generate_reconciliation_report(
        env_id=env_id_resolved, run_id=run_id,
    )
    return _engine_response(result)


@router.get("/audit/timeline")
def get_audit_timeline(request: Request,
                        env_id: Optional[str] = Query(default=None),
                        entity_type: Optional[str] = Query(default=None),
                        entity_id: Optional[UUID] = Query(default=None),
                        change_type: Optional[str] = Query(default=None),
                        limit: int = Query(default=100, ge=1, le=500)):
    """Audit log for a specific entity (typically an inv_nav_snapshot or inv_fund).

    When entity_id is omitted, returns the most recent N audit rows for the
    env (across all entities). The viewer in the UI uses this to render a
    timeline with JSON diffs of previous_state → new_state.
    """
    env_id_resolved, _ = _ctx(request, env_id, None)

    where = ["env_id = %s"]
    params: list = [env_id_resolved]
    if entity_type:
        where.append("entity_type = %s"); params.append(entity_type)
    if entity_id is not None:
        where.append("entity_id = %s"); params.append(str(entity_id))
    if change_type:
        where.append("change_type = %s"); params.append(change_type)

    sql = f"""
        SELECT id, entity_type, entity_id, change_type,
               previous_state, new_state, actor, reason,
               correlation_id, created_at
        FROM inv_audit_log
        WHERE {' AND '.join(where)}
        ORDER BY created_at DESC
        LIMIT {int(limit)}
    """
    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()

    return JSONResponse(content=_jsonify({
        "valid": True,
        "value": {
            "count": len(rows),
            "events": [
                {
                    "id": r["id"],
                    "entity_type": r["entity_type"],
                    "entity_id": r["entity_id"],
                    "change_type": r["change_type"],
                    "previous_state": r["previous_state"],
                    "new_state": r["new_state"],
                    "actor": r["actor"],
                    "reason": r["reason"],
                    "correlation_id": r["correlation_id"],
                    "created_at": r["created_at"].isoformat(),
                }
                for r in rows
            ],
        },
        "errors": [],
        "input_versions": {},
    }))


@router.get("/funds")
def list_funds(request: Request,
                env_id: Optional[str] = Query(default=None),
                limit: int = Query(default=100, ge=1, le=500)):
    """List funds in the env. Used by the UI fund picker."""
    env_id_resolved, _ = _ctx(request, env_id, None)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, name, inception_date, base_currency, lot_relief_method, status
            FROM inv_fund
            WHERE env_id = %s
            ORDER BY name
            LIMIT %s
            """,
            (env_id_resolved, int(limit)),
        )
        rows = cur.fetchall()

    return JSONResponse(content=_jsonify({
        "valid": True,
        "value": {"count": len(rows), "funds": [
            {"id": r["id"], "name": r["name"],
             "inception_date": r["inception_date"].isoformat(),
             "base_currency": r["base_currency"],
             "lot_relief_method": r["lot_relief_method"],
             "status": r["status"]}
            for r in rows
        ]},
        "errors": [],
        "input_versions": {},
    }))


@router.get("/reconciliation/breaks")
def get_breaks(request: Request,
                env_id: Optional[str] = Query(default=None),
                run_id: Optional[UUID] = Query(default=None),
                break_type: Optional[str] = Query(default=None),
                severity: Optional[str] = Query(default=None),
                resolved: Optional[bool] = Query(default=None,
                    description="false = open only; true = resolved only; null = both"),
                limit: int = Query(default=200, ge=1, le=1000)):
    env_id_resolved, _ = _ctx(request, env_id, None)

    where = ["env_id = %s"]
    params: list = [env_id_resolved]
    if run_id is not None:
        where.append("run_id = %s"); params.append(str(run_id))
    if break_type:
        where.append("break_type = %s"); params.append(break_type)
    if severity:
        where.append("severity = %s"); params.append(severity)
    if resolved is False:
        where.append("resolved_at IS NULL")
    elif resolved is True:
        where.append("resolved_at IS NOT NULL")

    sql = f"""
        SELECT id, run_id, break_type, severity, account_id, security_id,
               source_a_value, source_b_value, evidence,
               resolved_at, resolved_by, resolution_note, created_at
        FROM inv_reconciliation_break
        WHERE {' AND '.join(where)}
        ORDER BY severity DESC, created_at DESC
        LIMIT {int(limit)}
    """
    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()

    return JSONResponse(content=_jsonify({
        "valid": True,
        "value": {
            "count": len(rows),
            "breaks": [
                {
                    "id": r["id"],
                    "run_id": r["run_id"],
                    "break_type": r["break_type"],
                    "severity": r["severity"],
                    "account_id": r["account_id"],
                    "security_id": r["security_id"],
                    "source_a_value": r["source_a_value"],
                    "source_b_value": r["source_b_value"],
                    "evidence": r["evidence"],
                    "resolved_at": r["resolved_at"].isoformat() if r["resolved_at"] else None,
                    "resolved_by": r["resolved_by"],
                    "resolution_note": r["resolution_note"],
                    "created_at": r["created_at"].isoformat(),
                }
                for r in rows
            ],
        },
        "errors": [],
        "input_versions": {},
    }))
