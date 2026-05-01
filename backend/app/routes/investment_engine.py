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
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.db import get_cursor
from app.services import (
    accounting_engine,
    accounting_snapshot_writer,
    compliance_engine,
    env_context,
    reconciliation_engine,
    risk_engine,
)

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
    if req.qty_abs is not None:
        tol_kwargs["qty_abs"] = Decimal(req.qty_abs)
    if req.qty_rel is not None:
        tol_kwargs["qty_rel"] = Decimal(req.qty_rel)
    if req.price_abs is not None:
        tol_kwargs["price_abs"] = Decimal(req.price_abs)
    if req.price_rel is not None:
        tol_kwargs["price_rel"] = Decimal(req.price_rel)
    if req.stale_seconds is not None:
        tol_kwargs["stale_seconds"] = req.stale_seconds
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
        where.append("entity_type = %s")
        params.append(entity_type)
    if entity_id is not None:
        where.append("entity_id = %s")
        params.append(str(entity_id))
    if change_type:
        where.append("change_type = %s")
        params.append(change_type)

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
        where.append("run_id = %s")
        params.append(str(run_id))
    if break_type:
        where.append("break_type = %s")
        params.append(break_type)
    if severity:
        where.append("severity = %s")
        params.append(severity)
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


# ─────────────────────────────────────────────────────────────────────────────
# Wave 1 — Risk routes
# ─────────────────────────────────────────────────────────────────────────────


class CalcVarRequest(_Strict):
    fund_id: UUID
    as_of_date: date_type
    confidence_pct: str = Field(default="95.00", description="95.00, 97.50, or 99.00")
    horizon_days: int = 1
    history_window_days: int = 252
    ewma_lambda: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/risk/var")
def post_calc_var(req: CalcVarRequest, request: Request):
    env_id, _ = _ctx(request, req.env_id, req.business_id)
    result = risk_engine.calculate_var(
        env_id=env_id, fund_id=req.fund_id, as_of_date=req.as_of_date,
        confidence_pct=Decimal(req.confidence_pct),
        horizon_days=req.horizon_days,
        history_window_days=req.history_window_days,
        ewma_lambda=Decimal(req.ewma_lambda) if req.ewma_lambda else None,
    )
    return _engine_response(result)


class ApplyScenarioRequest(_Strict):
    fund_id: UUID
    as_of_date: date_type
    scenario_id: UUID
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/risk/scenario")
def post_apply_scenario(req: ApplyScenarioRequest, request: Request):
    env_id, _ = _ctx(request, req.env_id, req.business_id)
    result = risk_engine.apply_scenario(
        env_id=env_id, fund_id=req.fund_id,
        as_of_date=req.as_of_date, scenario_id=req.scenario_id,
    )
    return _engine_response(result)


class FactorExposureRequest(_Strict):
    fund_id: UUID
    as_of_date: date_type
    factor_id: Optional[UUID] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/risk/factor-exposure")
def post_factor_exposure(req: FactorExposureRequest, request: Request):
    env_id, _ = _ctx(request, req.env_id, req.business_id)
    result = risk_engine.calculate_factor_exposure(
        env_id=env_id, fund_id=req.fund_id,
        as_of_date=req.as_of_date, factor_id=req.factor_id,
    )
    return _engine_response(result)


class SensitivityRequest(_Strict):
    fund_id: UUID
    as_of_date: date_type
    sensitivity_kind: str  # "dv01" | "beta" | "delta"
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/risk/sensitivity")
def post_sensitivity(req: SensitivityRequest, request: Request):
    if req.sensitivity_kind not in ("dv01", "beta", "delta"):
        return JSONResponse(
            content={"valid": False, "value": None,
                     "errors": [{"code": "invalid_input",
                                  "message": "sensitivity_kind must be dv01, beta, or delta",
                                  "context": {"got": req.sensitivity_kind}}],
                     "input_versions": {}},
            status_code=422,
        )
    env_id, _ = _ctx(request, req.env_id, req.business_id)
    result = risk_engine.calculate_sensitivity(
        env_id=env_id, fund_id=req.fund_id,
        as_of_date=req.as_of_date, sensitivity_kind=req.sensitivity_kind,
    )
    return _engine_response(result)


@router.get("/risk/factors")
def list_factors(request: Request, env_id: Optional[str] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, code, name, factor_kind, dimension FROM inv_factor "
            "WHERE env_id = %s ORDER BY code",
            (env_id_resolved,),
        )
        rows = cur.fetchall()
    return JSONResponse(content=_jsonify({
        "valid": True,
        "value": {"count": len(rows), "factors": rows},
        "errors": [], "input_versions": {},
    }))


@router.get("/risk/scenarios")
def list_scenarios(request: Request, env_id: Optional[str] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, code, name, kind, shocks, description FROM inv_scenario "
            "WHERE env_id = %s ORDER BY code",
            (env_id_resolved,),
        )
        rows = cur.fetchall()
    return JSONResponse(content=_jsonify({
        "valid": True,
        "value": {"count": len(rows), "scenarios": rows},
        "errors": [], "input_versions": {},
    }))


# ─────────────────────────────────────────────────────────────────────────────
# Wave 1 — Compliance routes
# ─────────────────────────────────────────────────────────────────────────────

class EvaluatePreTradeRequest(_Strict):
    fund_id: UUID
    as_of_date: date_type
    proposed_trade: dict  # {account_id, security_id, side, qty, price_native, ...}
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/compliance/evaluate/pre-trade")
def post_eval_pre_trade(req: EvaluatePreTradeRequest, request: Request):
    env_id, _ = _ctx(request, req.env_id, req.business_id)
    result = compliance_engine.evaluate_pre_trade(
        env_id=env_id, fund_id=req.fund_id,
        proposed_trade=req.proposed_trade, as_of_date=req.as_of_date,
    )
    return _engine_response(result)


class EvaluatePostTradeRequest(_Strict):
    fund_id: UUID
    as_of_date: date_type
    persist: bool = True
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/compliance/evaluate/post-trade")
def post_eval_post_trade(req: EvaluatePostTradeRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    result = compliance_engine.evaluate_post_trade(
        env_id=env_id, business_id=business_id, fund_id=req.fund_id,
        as_of_date=req.as_of_date, persist=req.persist,
    )
    return _engine_response(result)


@router.get("/compliance/rules")
def list_compliance_rules(request: Request,
                            env_id: Optional[str] = Query(default=None),
                            fund_id: Optional[UUID] = Query(default=None),
                            as_of: Optional[date_type] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    eff = as_of or date_type.today()
    result = compliance_engine.list_active_rules(
        env_id=env_id_resolved, fund_id=fund_id, as_of_date=eff,
    )
    return _engine_response(result)


class CreateRuleRequest(_Strict):
    operator: str
    fund_id: Optional[UUID] = None
    scope_kind: str = "fund"
    predicate: dict = Field(default_factory=dict)
    threshold: Optional[str] = None
    threshold_list: Optional[list[str]] = None
    severity: str = "high"
    reason: Optional[str] = None
    active_from: date_type
    active_to: Optional[date_type] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/compliance/rules")
def post_create_rule(req: CreateRuleRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    result = compliance_engine.create_rule(
        env_id=env_id, business_id=business_id,
        rule={
            "operator": req.operator,
            "fund_id": req.fund_id,
            "scope_kind": req.scope_kind,
            "predicate": req.predicate,
            "threshold": req.threshold,
            "threshold_list": req.threshold_list,
            "severity": req.severity,
            "reason": req.reason,
            "active_from": req.active_from,
            "active_to": req.active_to,
        },
    )
    return _engine_response(result, success_status=201)


class DeactivateRuleRequest(_Strict):
    as_of: date_type
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/compliance/rules/{rule_id}/deactivate")
def post_deactivate_rule(rule_id: UUID, req: DeactivateRuleRequest, request: Request):
    env_id, _ = _ctx(request, req.env_id, req.business_id)
    result = compliance_engine.deactivate_rule(
        env_id=env_id, rule_id=rule_id, as_of=req.as_of,
    )
    return _engine_response(result)


@router.get("/compliance/violations")
def get_violations(request: Request,
                    env_id: Optional[str] = Query(default=None),
                    fund_id: Optional[UUID] = Query(default=None),
                    eval_kind: Optional[str] = Query(default=None),
                    severity: Optional[str] = Query(default=None),
                    resolved: Optional[bool] = Query(default=None),
                    limit: int = Query(default=200, ge=1, le=1000)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    where = ["env_id = %s"]
    params: list = [env_id_resolved]
    if fund_id is not None:
        where.append("fund_id = %s")
        params.append(str(fund_id))
    if eval_kind:
        where.append("eval_kind = %s")
        params.append(eval_kind)
    if severity:
        where.append("severity = %s")
        params.append(severity)
    if resolved is True:
        where.append("resolved_at IS NOT NULL")
    elif resolved is False:
        where.append("resolved_at IS NULL")
    sql = f"""
        SELECT id, rule_id, fund_id, portfolio_id, account_id, proposed_trade_id,
               eval_kind, severity, snapshot_value, threshold, evidence,
               evaluated_at, resolved_at, resolved_by, resolution_note
        FROM inv_compliance_violation
        WHERE {' AND '.join(where)}
        ORDER BY severity DESC, evaluated_at DESC
        LIMIT {int(limit)}
    """
    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
    return JSONResponse(content=_jsonify({
        "valid": True,
        "value": {"count": len(rows), "violations": rows},
        "errors": [], "input_versions": {},
    }))


class ResolveViolationRequest(_Strict):
    resolved_by: str
    resolution_note: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/compliance/violations/{violation_id}/resolve")
def post_resolve_violation(violation_id: UUID, req: ResolveViolationRequest, request: Request):
    env_id, _ = _ctx(request, req.env_id, req.business_id)
    result = compliance_engine.resolve_violation(
        env_id=env_id, violation_id=violation_id,
        resolved_by=req.resolved_by, resolution_note=req.resolution_note,
    )
    return _engine_response(result)


# ─────────────────────────────────────────────────────────────────────────────
# Wave 2 — OMS + EMS routes
# ─────────────────────────────────────────────────────────────────────────────

from app.services import oms_engine, ems_engine


# ── Order lifecycle ──────────────────────────────────────────────────────────

class CreateOrderIdeaRequest(_Strict):
    fund_id: UUID
    portfolio_id: Optional[UUID] = None
    account_id: Optional[UUID] = None
    security_id: UUID
    side: str
    qty: str
    order_type: str = "market"
    limit_price: Optional[str] = None
    stop_price: Optional[str] = None
    time_in_force: str = "day"
    proposed_by: str
    correlation_id: Optional[str] = None
    metadata: Optional[dict] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/orders/ideas")
def post_create_idea(req: CreateOrderIdeaRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    result = oms_engine.create_idea(
        env_id=env_id, business_id=business_id,
        fund_id=req.fund_id, portfolio_id=req.portfolio_id,
        account_id=req.account_id, security_id=req.security_id,
        side=req.side, qty=Decimal(req.qty),
        order_type=req.order_type,
        limit_price=Decimal(req.limit_price) if req.limit_price else None,
        stop_price=Decimal(req.stop_price) if req.stop_price else None,
        time_in_force=req.time_in_force,
        proposed_by=req.proposed_by,
        correlation_id=req.correlation_id,
        metadata=req.metadata,
    )
    return _engine_response(result, success_status=201)


class OrderActorRequest(_Strict):
    actor: str
    correlation_id: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/orders/{order_id}/submit")
def post_submit_order(order_id: UUID, req: OrderActorRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    return _engine_response(oms_engine.submit_order(
        env_id=env_id, business_id=business_id,
        order_id=order_id, actor=req.actor, correlation_id=req.correlation_id,
    ))


class EvaluatePreTradeOrderRequest(_Strict):
    actor: str
    as_of_date: date_type
    correlation_id: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/orders/{order_id}/evaluate-pre-trade")
def post_evaluate_pre_trade(order_id: UUID, req: EvaluatePreTradeOrderRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    return _engine_response(oms_engine.evaluate_pre_trade_compliance(
        env_id=env_id, business_id=business_id, order_id=order_id,
        as_of_date=req.as_of_date, actor=req.actor,
        correlation_id=req.correlation_id,
    ))


class ApproveOrderRequest(_Strict):
    actor: str
    override_reason: Optional[str] = None
    correlation_id: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/orders/{order_id}/approve")
def post_approve_order(order_id: UUID, req: ApproveOrderRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    return _engine_response(oms_engine.approve_order(
        env_id=env_id, business_id=business_id, order_id=order_id,
        actor=req.actor, override_reason=req.override_reason,
        correlation_id=req.correlation_id,
    ))


class RouteOrderRequest(_Strict):
    actor: str
    routed_to: str
    routing_metadata: Optional[dict] = None
    correlation_id: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/orders/{order_id}/route")
def post_route_order(order_id: UUID, req: RouteOrderRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    return _engine_response(oms_engine.route_order(
        env_id=env_id, business_id=business_id, order_id=order_id,
        routed_to=req.routed_to, actor=req.actor,
        routing_metadata=req.routing_metadata,
        correlation_id=req.correlation_id,
    ))


class CancelOrderRequest(_Strict):
    actor: str
    cancel_reason: Optional[str] = None
    correlation_id: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/orders/{order_id}/cancel")
def post_cancel_order(order_id: UUID, req: CancelOrderRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    return _engine_response(oms_engine.cancel_order(
        env_id=env_id, business_id=business_id, order_id=order_id,
        actor=req.actor, cancel_reason=req.cancel_reason,
        correlation_id=req.correlation_id,
    ))


@router.get("/orders/{order_id}")
def get_order_route(order_id: UUID, request: Request,
                     env_id: Optional[str] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    return _engine_response(oms_engine.get_order(
        env_id=env_id_resolved, order_id=order_id,
    ))


@router.get("/orders/{order_id}/events")
def get_order_events(order_id: UUID, request: Request,
                      env_id: Optional[str] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    return _engine_response(oms_engine.list_order_events(
        env_id=env_id_resolved, order_id=order_id,
    ))


@router.get("/orders")
def list_orders(request: Request,
                 env_id: Optional[str] = Query(default=None),
                 fund_id: Optional[UUID] = Query(default=None),
                 status: Optional[str] = Query(default=None),
                 limit: int = Query(default=200, ge=1, le=1000)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    where = ["env_id = %s"]
    params: list = [env_id_resolved]
    if fund_id is not None:
        where.append("fund_id = %s"); params.append(str(fund_id))
    if status:
        where.append("status = %s"); params.append(status)
    sql = f"""
        SELECT id, fund_id, portfolio_id, account_id, security_id,
               side, qty, order_type, limit_price, stop_price, status,
               pre_trade_compliance_state, pre_trade_violation_count,
               filled_qty, avg_fill_price_native, fill_currency,
               proposed_by, approved_by, created_at, updated_at
        FROM inv_order
        WHERE {' AND '.join(where)}
        ORDER BY created_at DESC
        LIMIT {int(limit)}
    """
    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
    return JSONResponse(content=_jsonify({
        "valid": True,
        "value": {"count": len(rows), "orders": rows},
        "errors": [], "input_versions": {},
    }))


# ── Executions + allocations ─────────────────────────────────────────────────

class RecordExecutionRequest(_Strict):
    order_id: UUID
    qty: str
    price_native: str
    price_currency: str
    broker: str
    venue: Optional[str] = None
    external_exec_id: Optional[str] = None
    fee_native: Optional[str] = None
    fee_currency: Optional[str] = None
    actor: str = "ems"
    correlation_id: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/executions")
def post_record_execution(req: RecordExecutionRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    return _engine_response(ems_engine.record_execution(
        env_id=env_id, business_id=business_id,
        order_id=req.order_id, qty=Decimal(req.qty),
        price_native=Decimal(req.price_native),
        price_currency=req.price_currency,
        broker=req.broker, venue=req.venue,
        external_exec_id=req.external_exec_id,
        fee_native=Decimal(req.fee_native) if req.fee_native else Decimal("0"),
        fee_currency=req.fee_currency,
        actor=req.actor, correlation_id=req.correlation_id,
    ), success_status=201)


class AllocateExecutionRequest(_Strict):
    allocations: list[dict]   # [{account_id, qty}]
    actor: str = "ems"
    correlation_id: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/executions/{execution_id}/allocate")
def post_allocate_execution(execution_id: UUID, req: AllocateExecutionRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    # Coerce qty to Decimal
    allocations = [{"account_id": a["account_id"], "qty": Decimal(str(a["qty"]))}
                    for a in req.allocations]
    return _engine_response(ems_engine.allocate_execution(
        env_id=env_id, business_id=business_id,
        execution_id=execution_id, allocations=allocations,
        actor=req.actor, correlation_id=req.correlation_id,
    ))


class UpdateSettlementRequest(_Strict):
    new_state: str   # settled | failed | cancelled
    settlement_date: Optional[date_type] = None
    failure_reason: Optional[str] = None
    actor: str = "ops"
    correlation_id: Optional[str] = None
    env_id: Optional[str] = None
    business_id: Optional[UUID] = None


@router.post("/executions/{execution_id}/settlement")
def post_update_settlement(execution_id: UUID, req: UpdateSettlementRequest, request: Request):
    env_id, business_id = _ctx(request, req.env_id, req.business_id)
    return _engine_response(ems_engine.update_settlement_state(
        env_id=env_id, business_id=business_id,
        execution_id=execution_id, new_state=req.new_state,
        settlement_date=req.settlement_date,
        failure_reason=req.failure_reason,
        actor=req.actor, correlation_id=req.correlation_id,
    ))


@router.get("/executions/{execution_id}")
def get_execution_route(execution_id: UUID, request: Request,
                         env_id: Optional[str] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    return _engine_response(ems_engine.get_execution(
        env_id=env_id_resolved, execution_id=execution_id,
    ))


@router.get("/executions/{execution_id}/allocations")
def get_allocations(execution_id: UUID, request: Request,
                     env_id: Optional[str] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    return _engine_response(ems_engine.list_allocations(
        env_id=env_id_resolved, execution_id=execution_id,
    ))


@router.get("/orders/{order_id}/executions")
def list_order_executions(order_id: UUID, request: Request,
                           env_id: Optional[str] = Query(default=None)):
    env_id_resolved, _ = _ctx(request, env_id, None)
    return _engine_response(ems_engine.list_executions_for_order(
        env_id=env_id_resolved, order_id=order_id,
    ))
