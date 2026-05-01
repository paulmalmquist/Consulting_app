"""Investment Engine: risk snapshot writer.

Persists risk_engine outputs (VaR, scenario, factor exposure) as
inv_risk_snapshot rows following the snapshot lifecycle from
skills/winston-investment-snapshot:

    produce_*  -> draft row(s)
    lock(id)   -> draft → locked, verifies reconstruct() equal
    release(id)-> locked → released, supersedes prior released for the
                  same natural key in one transaction
    reconstruct(id) -> recomputes from input_versions, asserts byte-equality

Quirk specific to risk: VaR per ADR 004 returns BOTH historical_sim and
parametric numbers. produce_var_snapshot_pair writes two rows sharing
correlation_id and as_of_date so the audit pair-up is trivial.

Persistence rule: every mutation writes inv_audit_log + inv_mutation_event
in the same transaction.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db import get_cursor
from app.services.accounting_engine import EngineError, EngineResult
from app.services.investment_engine_audit import write_audit, write_mutation_event
from app.services.risk_engine import (
    apply_scenario,
    calculate_factor_exposure,
    calculate_var,
)


# ─────────────────────────────────────────────────────────────────────────────
# RESULT SHAPE (mirrors accounting_snapshot_writer)
# ─────────────────────────────────────────────────────────────────────────────

def _ok(value: Any, input_versions: dict) -> EngineResult:
    return {"valid": True, "value": value, "errors": [], "input_versions": input_versions}


def _fail(errors: list[EngineError], input_versions: dict | None = None) -> EngineResult:
    return {"valid": False, "value": None, "errors": errors,
            "input_versions": input_versions or {}}


def _err(code: str, message: str, **context: Any) -> EngineError:
    return {"code": code, "message": message, "context": context}


ERR_SNAPSHOT_NOT_FOUND = "snapshot_not_found"
ERR_INVALID_TRANSITION = "invalid_transition"
ERR_RECONSTRUCT_DIVERGED = "reconstruct_diverged"


def _to_jsonb(d: Any) -> str:
    def default(v):
        if isinstance(v, Decimal):
            return str(v)
        if isinstance(v, (date, datetime)):
            return v.isoformat()
        if isinstance(v, UUID):
            return str(v)
        return str(v)
    return json.dumps(d, default=default)


# ─────────────────────────────────────────────────────────────────────────────
# Versioning helper — natural key for risk includes risk_kind + method etc.
# ─────────────────────────────────────────────────────────────────────────────

def _next_version(cur, *, entity_id: UUID, effective_date: date,
                    risk_kind: str, var_method: Optional[str],
                    confidence_pct: Optional[Decimal], horizon_days: Optional[int],
                    scenario_id: Optional[UUID], sensitivity_kind: Optional[str],
                    factor_id: Optional[UUID]) -> int:
    cur.execute(
        """
        SELECT COALESCE(MAX(version), 0) AS v
        FROM inv_risk_snapshot
        WHERE entity_id = %s AND effective_date = %s
          AND risk_kind = %s
          AND COALESCE(var_method,'') = COALESCE(%s,'')
          AND COALESCE(confidence_pct, 0) = COALESCE(%s, 0)
          AND COALESCE(horizon_days, 0) = COALESCE(%s, 0)
          AND COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(%s, '00000000-0000-0000-0000-000000000000'::uuid)
          AND COALESCE(sensitivity_kind, '') = COALESCE(%s, '')
          AND COALESCE(factor_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(%s, '00000000-0000-0000-0000-000000000000'::uuid)
        """,
        (str(entity_id), effective_date, risk_kind, var_method,
         confidence_pct, horizon_days,
         str(scenario_id) if scenario_id else None,
         sensitivity_kind,
         str(factor_id) if factor_id else None),
    )
    return cur.fetchone()["v"] + 1


# ─────────────────────────────────────────────────────────────────────────────
# VaR snapshot pair (ADR 004)
# ─────────────────────────────────────────────────────────────────────────────

def produce_var_snapshot_pair(
    *,
    env_id: str,
    business_id: UUID | str,
    fund_id: UUID,
    as_of_date: date,
    confidence_pct: Decimal = Decimal("95.00"),
    horizon_days: int = 1,
    history_window_days: int = 252,
    ewma_lambda: Optional[Decimal] = None,
    actor: str,
    correlation_id: Optional[str] = None,
) -> EngineResult:
    """Compute VaR (both methods) and persist as TWO draft snapshot rows
    sharing correlation_id and effective_date.

    Returns EngineResult with value = {
      "historical_sim_id": str, "parametric_id": str,
      "correlation_id": str, ...calc payload
    }
    """
    calc = calculate_var(
        env_id=env_id, fund_id=fund_id, as_of_date=as_of_date,
        confidence_pct=confidence_pct, horizon_days=horizon_days,
        history_window_days=history_window_days, ewma_lambda=ewma_lambda,
    )
    if not calc["valid"]:
        return calc

    v = calc["value"]
    input_versions = calc["input_versions"]
    pair_corr = correlation_id or f"var_pair_{uuid4()}"

    with get_cursor() as cur:
        version_hist = _next_version(
            cur, entity_id=fund_id, effective_date=as_of_date,
            risk_kind="var", var_method="historical_sim",
            confidence_pct=confidence_pct, horizon_days=horizon_days,
            scenario_id=None, sensitivity_kind=None, factor_id=None,
        )
        cur.execute(
            """
            INSERT INTO inv_risk_snapshot (
                env_id, business_id, entity_type, entity_id,
                effective_date, as_of_date, status, version,
                input_versions, produced_by,
                risk_kind, var_method, confidence_pct, horizon_days,
                history_window_days, covariance_method,
                var_native, var_currency, portfolio_value_native
            ) VALUES (
                %s, %s, 'fund', %s, %s, now(), 'draft', %s,
                %s::jsonb, %s,
                'var', 'historical_sim', %s, %s,
                %s, NULL,
                %s, %s, %s
            ) RETURNING id
            """,
            (
                env_id, str(business_id), str(fund_id), as_of_date, version_hist,
                _to_jsonb(input_versions), actor,
                confidence_pct, horizon_days,
                history_window_days,
                str(v["var_historical_sim_native"]), v["currency"],
                str(v["portfolio_value_native"]),
            ),
        )
        hist_id = cur.fetchone()["id"]

        version_param = _next_version(
            cur, entity_id=fund_id, effective_date=as_of_date,
            risk_kind="var", var_method="parametric",
            confidence_pct=confidence_pct, horizon_days=horizon_days,
            scenario_id=None, sensitivity_kind=None, factor_id=None,
        )
        cur.execute(
            """
            INSERT INTO inv_risk_snapshot (
                env_id, business_id, entity_type, entity_id,
                effective_date, as_of_date, status, version,
                input_versions, produced_by,
                risk_kind, var_method, confidence_pct, horizon_days,
                history_window_days, covariance_method,
                var_native, var_currency, portfolio_value_native
            ) VALUES (
                %s, %s, 'fund', %s, %s, now(), 'draft', %s,
                %s::jsonb, %s,
                'var', 'parametric', %s, %s,
                %s, %s,
                %s, %s, %s
            ) RETURNING id
            """,
            (
                env_id, str(business_id), str(fund_id), as_of_date, version_param,
                _to_jsonb(input_versions), actor,
                confidence_pct, horizon_days,
                history_window_days, v["covariance_method"],
                str(v["var_parametric_native"]), v["currency"],
                str(v["portfolio_value_native"]),
            ),
        )
        param_id = cur.fetchone()["id"]

        # Audit + mutation events for both rows, sharing correlation_id
        for sid, method, version in [
            (hist_id, "historical_sim", version_hist),
            (param_id, "parametric", version_param),
        ]:
            write_audit(
                cur,
                env_id=env_id, business_id=business_id,
                entity_type="inv_risk_snapshot", entity_id=sid,
                change_type="insert",
                new_state={"id": str(sid), "fund_id": str(fund_id),
                            "effective_date": as_of_date.isoformat(),
                            "var_method": method, "version": version,
                            "status": "draft"},
                actor=actor, correlation_id=pair_corr,
            )
            write_mutation_event(
                cur,
                env_id=env_id, business_id=business_id,
                entity_type="inv_risk_snapshot", entity_id=sid,
                event_type="snapshot_produced",
                payload={"var_method": method, "version": version},
                correlation_id=pair_corr,
            )

    return _ok({
        "historical_sim_id": str(hist_id),
        "parametric_id": str(param_id),
        "correlation_id": pair_corr,
        "fund_id": str(fund_id),
        "as_of_date": as_of_date.isoformat(),
        "confidence_pct": str(confidence_pct),
        "horizon_days": horizon_days,
        "var_historical_sim": str(v["var_historical_sim_native"]),
        "var_parametric": str(v["var_parametric_native"]),
        "currency": v["currency"],
        "portfolio_value_native": str(v["portfolio_value_native"]),
    }, input_versions)


# ─────────────────────────────────────────────────────────────────────────────
# Scenario snapshot
# ─────────────────────────────────────────────────────────────────────────────

def produce_scenario_snapshot(
    *,
    env_id: str,
    business_id: UUID | str,
    fund_id: UUID,
    as_of_date: date,
    scenario_id: UUID,
    actor: str,
    correlation_id: Optional[str] = None,
) -> EngineResult:
    calc = apply_scenario(
        env_id=env_id, fund_id=fund_id,
        as_of_date=as_of_date, scenario_id=scenario_id,
    )
    if not calc["valid"]:
        return calc
    v = calc["value"]
    input_versions = calc["input_versions"]

    with get_cursor() as cur:
        version = _next_version(
            cur, entity_id=fund_id, effective_date=as_of_date,
            risk_kind="scenario", var_method=None,
            confidence_pct=None, horizon_days=None,
            scenario_id=scenario_id, sensitivity_kind=None, factor_id=None,
        )
        cur.execute(
            """
            INSERT INTO inv_risk_snapshot (
                env_id, business_id, entity_type, entity_id,
                effective_date, as_of_date, status, version,
                input_versions, produced_by,
                risk_kind, scenario_id, scenario_pnl_native, scenario_currency,
                portfolio_value_native
            ) VALUES (
                %s, %s, 'fund', %s, %s, now(), 'draft', %s,
                %s::jsonb, %s,
                'scenario', %s, %s, %s, %s
            ) RETURNING id
            """,
            (
                env_id, str(business_id), str(fund_id), as_of_date, version,
                _to_jsonb(input_versions), actor,
                str(scenario_id),
                str(v["scenario_pnl_native"]), v["currency"],
                str(v["portfolio_value_native"]),
            ),
        )
        sid = cur.fetchone()["id"]
        write_audit(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_risk_snapshot", entity_id=sid,
            change_type="insert",
            new_state={"id": str(sid), "fund_id": str(fund_id),
                        "scenario_id": str(scenario_id),
                        "effective_date": as_of_date.isoformat(),
                        "version": version, "status": "draft"},
            actor=actor, correlation_id=correlation_id,
        )
        write_mutation_event(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_risk_snapshot", entity_id=sid,
            event_type="snapshot_produced",
            payload={"risk_kind": "scenario", "version": version},
            correlation_id=correlation_id,
        )

    return _ok({
        "snapshot_id": str(sid),
        "version": version,
        "status": "draft",
        "scenario_pnl_native": str(v["scenario_pnl_native"]),
        "currency": v["currency"],
        "portfolio_value_native": str(v["portfolio_value_native"]),
    }, input_versions)


# ─────────────────────────────────────────────────────────────────────────────
# Lifecycle: lock / release / reconstruct (generic across risk_kind)
# ─────────────────────────────────────────────────────────────────────────────

def lock_risk_snapshot(
    *, env_id: str, business_id: UUID | str, snapshot_id: UUID,
    actor: str, correlation_id: Optional[str] = None,
) -> EngineResult:
    rec = reconstruct_risk_snapshot(env_id=env_id, snapshot_id=snapshot_id)
    if not rec["valid"]:
        return rec
    if not rec["value"]["equal"]:
        return _fail([_err(
            ERR_RECONSTRUCT_DIVERGED,
            "snapshot reconstruct diverged; cannot lock",
            snapshot_id=str(snapshot_id),
            divergences=rec["value"]["divergences"],
        )])
    return _transition_risk(
        env_id=env_id, business_id=business_id, snapshot_id=snapshot_id,
        from_status="draft", to_status="locked", change_type="lock",
        actor=actor, correlation_id=correlation_id,
    )


def release_risk_snapshot(
    *, env_id: str, business_id: UUID | str, snapshot_id: UUID,
    actor: str, correlation_id: Optional[str] = None, reason: Optional[str] = None,
) -> EngineResult:
    """Transition locked → released; supersede any prior released row sharing
    the natural key in the same transaction.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, entity_id, effective_date, status, version,
                   risk_kind, var_method, confidence_pct, horizon_days,
                   scenario_id, sensitivity_kind, factor_id
            FROM inv_risk_snapshot
            WHERE env_id = %s AND id = %s
            """,
            (env_id, str(snapshot_id)),
        )
        snap = cur.fetchone()
        if not snap:
            return _fail([_err(ERR_SNAPSHOT_NOT_FOUND, "snapshot not found",
                                snapshot_id=str(snapshot_id))])
        if snap["status"] != "locked":
            return _fail([_err(ERR_INVALID_TRANSITION,
                                "release requires status=locked",
                                current_status=snap["status"])])

        # Find prior released for same natural key
        cur.execute(
            """
            SELECT id, version FROM inv_risk_snapshot
            WHERE entity_id = %s AND effective_date = %s
              AND risk_kind = %s
              AND COALESCE(var_method,'') = COALESCE(%s,'')
              AND COALESCE(confidence_pct, 0) = COALESCE(%s, 0)
              AND COALESCE(horizon_days, 0) = COALESCE(%s, 0)
              AND COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  = COALESCE(%s, '00000000-0000-0000-0000-000000000000'::uuid)
              AND COALESCE(sensitivity_kind, '') = COALESCE(%s, '')
              AND COALESCE(factor_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  = COALESCE(%s, '00000000-0000-0000-0000-000000000000'::uuid)
              AND status = 'released'
            """,
            (str(snap["entity_id"]), snap["effective_date"], snap["risk_kind"],
             snap["var_method"], snap["confidence_pct"], snap["horizon_days"],
             str(snap["scenario_id"]) if snap["scenario_id"] else None,
             snap["sensitivity_kind"],
             str(snap["factor_id"]) if snap["factor_id"] else None),
        )
        prior = cur.fetchone()

        if prior:
            cur.execute(
                """
                UPDATE inv_risk_snapshot
                SET status = 'superseded',
                    superseded_by_id = %s, superseded_reason = %s
                WHERE id = %s
                """,
                (str(snapshot_id), reason or "newer release", str(prior["id"])),
            )
            write_audit(
                cur,
                env_id=env_id, business_id=business_id,
                entity_type="inv_risk_snapshot", entity_id=prior["id"],
                change_type="supersede",
                previous_state={"status": "released", "version": prior["version"]},
                new_state={"status": "superseded",
                            "superseded_by_id": str(snapshot_id)},
                actor=actor, reason=reason, correlation_id=correlation_id,
            )

        cur.execute(
            "UPDATE inv_risk_snapshot SET status = 'released' WHERE id = %s",
            (str(snapshot_id),),
        )
        write_audit(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_risk_snapshot", entity_id=snapshot_id,
            change_type="release",
            previous_state={"status": "locked", "version": snap["version"]},
            new_state={"status": "released", "version": snap["version"]},
            actor=actor, reason=reason, correlation_id=correlation_id,
        )
        write_mutation_event(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_risk_snapshot", entity_id=snapshot_id,
            event_type="snapshot_released",
            payload={"version": snap["version"], "risk_kind": snap["risk_kind"],
                      "superseded_id": str(prior["id"]) if prior else None},
            correlation_id=correlation_id,
        )

    return _ok({
        "snapshot_id": str(snapshot_id),
        "status": "released",
        "version": snap["version"],
        "superseded_id": str(prior["id"]) if prior else None,
    }, input_versions={})


def reconstruct_risk_snapshot(
    *, env_id: str, snapshot_id: UUID,
) -> EngineResult:
    """Recompute the snapshot from its inputs and assert byte-equality with
    the stored payload. Read-only.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, entity_id, effective_date, risk_kind, var_method,
                   confidence_pct, horizon_days, history_window_days,
                   covariance_method, var_native, portfolio_value_native,
                   scenario_id, scenario_pnl_native,
                   factor_id, factor_exposure
            FROM inv_risk_snapshot
            WHERE env_id = %s AND id = %s
            """,
            (env_id, str(snapshot_id)),
        )
        snap = cur.fetchone()
    if not snap:
        return _fail([_err(ERR_SNAPSHOT_NOT_FOUND, "snapshot not found",
                            snapshot_id=str(snapshot_id))])

    # Stored values are rounded to schema NUMERIC(28,8); quantize recomputed
    # values to the same precision before comparing.
    Q = Decimal("0.00000001")  # 8 decimal places to match NUMERIC(28,8)

    def _eq(a: Decimal, b: Decimal) -> bool:
        return a.quantize(Q) == b.quantize(Q)

    divergences: list[dict] = []
    if snap["risk_kind"] == "var":
        # Recompute the same method
        rec = calculate_var(
            env_id=env_id, fund_id=snap["entity_id"],
            as_of_date=snap["effective_date"],
            confidence_pct=Decimal(str(snap["confidence_pct"])),
            horizon_days=int(snap["horizon_days"]),
            history_window_days=int(snap["history_window_days"]),
        )
        if not rec["valid"]:
            return _fail([_err(ERR_RECONSTRUCT_DIVERGED,
                                "recompute failed during reconstruct",
                                inner_errors=rec["errors"])])
        rv = rec["value"]
        method = snap["var_method"]
        recomputed = (rv["var_historical_sim_native"] if method == "historical_sim"
                       else rv["var_parametric_native"])
        stored = Decimal(str(snap["var_native"]))
        if not _eq(Decimal(str(recomputed)), stored):
            divergences.append({"field": "var_native", "stored": str(stored),
                                 "recomputed": str(recomputed)})

    elif snap["risk_kind"] == "scenario":
        rec = apply_scenario(
            env_id=env_id, fund_id=snap["entity_id"],
            as_of_date=snap["effective_date"], scenario_id=snap["scenario_id"],
        )
        if not rec["valid"]:
            return _fail([_err(ERR_RECONSTRUCT_DIVERGED,
                                "recompute failed", inner_errors=rec["errors"])])
        rv = rec["value"]
        if not _eq(Decimal(str(rv["scenario_pnl_native"])),
                    Decimal(str(snap["scenario_pnl_native"]))):
            divergences.append({"field": "scenario_pnl_native",
                                 "stored": str(snap["scenario_pnl_native"]),
                                 "recomputed": str(rv["scenario_pnl_native"])})

    elif snap["risk_kind"] == "factor_exposure":
        rec = calculate_factor_exposure(
            env_id=env_id, fund_id=snap["entity_id"],
            as_of_date=snap["effective_date"], factor_id=snap["factor_id"],
        )
        if not rec["valid"]:
            return _fail([_err(ERR_RECONSTRUCT_DIVERGED,
                                "recompute failed", inner_errors=rec["errors"])])
        for code, exp in rec["value"]["exposures"].items():
            if exp["factor_id"] == str(snap["factor_id"]):
                if not _eq(Decimal(str(exp["exposure_native"])),
                            Decimal(str(snap["factor_exposure"]))):
                    divergences.append({"field": "factor_exposure",
                                         "stored": str(snap["factor_exposure"]),
                                         "recomputed": str(exp["exposure_native"])})

    return _ok({
        "snapshot_id": str(snapshot_id),
        "risk_kind": snap["risk_kind"],
        "equal": len(divergences) == 0,
        "divergences": divergences,
    }, input_versions={"snapshot_id": str(snapshot_id)})


def _transition_risk(
    *, env_id: str, business_id: UUID | str, snapshot_id: UUID,
    from_status: str, to_status: str, change_type: str,
    actor: str, correlation_id: Optional[str] = None,
) -> EngineResult:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, status, version, risk_kind FROM inv_risk_snapshot "
            "WHERE env_id = %s AND id = %s",
            (env_id, str(snapshot_id)),
        )
        snap = cur.fetchone()
        if not snap:
            return _fail([_err(ERR_SNAPSHOT_NOT_FOUND, "snapshot not found")])
        if snap["status"] != from_status:
            return _fail([_err(ERR_INVALID_TRANSITION,
                                f"transition requires status={from_status}",
                                current_status=snap["status"])])
        cur.execute(
            "UPDATE inv_risk_snapshot SET status = %s WHERE id = %s",
            (to_status, str(snapshot_id)),
        )
        write_audit(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_risk_snapshot", entity_id=snapshot_id,
            change_type=change_type,
            previous_state={"status": from_status, "version": snap["version"]},
            new_state={"status": to_status, "version": snap["version"]},
            actor=actor, correlation_id=correlation_id,
        )
        write_mutation_event(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_risk_snapshot", entity_id=snapshot_id,
            event_type=f"snapshot_{to_status}",
            payload={"version": snap["version"], "risk_kind": snap["risk_kind"]},
            correlation_id=correlation_id,
        )
    return _ok({
        "snapshot_id": str(snapshot_id),
        "status": to_status,
        "version": snap["version"],
    }, input_versions={})
