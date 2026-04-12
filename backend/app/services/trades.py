"""Execution-layer service for paper-first trade intents, risk, controls, and orders."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.config import (
    IBKR_CLIENT_ID,
    TRADES_ENABLE_LIVE_SUBMISSION,
)
from app.db import get_cursor
from app.services.trades_broker import get_broker_service
from app.services.trades_control import (
    DEFAULT_RISK_LIMITS,
    PROMOTION_CHECKLIST_DEFAULTS,
    is_valid_live_phrase,
    requires_live_confirmation,
)
from app.services.trades_risk import evaluate_trade_risk


def _json_default(value: Any):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value)!r} is not JSON serializable")


def _json(value: Any) -> str:
    return json.dumps(value if value is not None else {}, default=_json_default)


def _json_loads(value: Any, default: Any):
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default
    return default


def _to_decimal(value: Any, default: str = "0") -> Decimal:
    if value is None or value == "":
        return Decimal(default)
    return Decimal(str(value))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_regime_snapshot(snapshot: Any) -> dict[str, Any] | None:
    if snapshot is None:
        return None
    if isinstance(snapshot, dict):
        return snapshot
    return {
        "snapshot_id": getattr(snapshot, "snapshot_id", None),
        "calculated_at": getattr(snapshot, "calculated_at", None),
        "regime_label": getattr(snapshot, "regime_label", None),
        "confidence": getattr(snapshot, "confidence", None),
        "signal_breakdown": getattr(snapshot, "signal_breakdown", {}) or {},
        "cross_vertical_implications": getattr(snapshot, "cross_vertical_implications", {}) or {},
        "source_metrics": getattr(snapshot, "source_metrics", {}) or {},
    }


def _load_regime_snapshot() -> dict[str, Any] | None:
    try:
        from app.services.market_regime_engine import get_latest_regime

        return _serialize_regime_snapshot(get_latest_regime())
    except Exception:
        return None


def _load_latest_research_context() -> dict[str, Any] | None:
    try:
        from app.services.research_state_service import get_latest_state

        return get_latest_state(scope_type="market", scope_key="global")
    except Exception:
        return None


def _build_trade_research_snapshot(research_state: dict[str, Any] | None) -> dict[str, Any]:
    if not research_state:
        return {}
    deterministic = research_state.get("deterministic_decision") or {}
    forecast = research_state.get("latest_forecast") or {}
    top_analogs = _json_loads(research_state.get("top_analogs"), [])
    return {
        "research_state_id": str(research_state.get("id")) if research_state.get("id") else None,
        "state_date": research_state.get("state_date").isoformat() if research_state.get("state_date") else None,
        "regime_label": research_state.get("regime_label"),
        "regime_confidence": research_state.get("regime_confidence"),
        "shock_type": research_state.get("shock_type"),
        "signal_coherence_index": research_state.get("signal_coherence_index"),
        "signal_freshness_score": research_state.get("signal_freshness_score"),
        "divergences": _json_loads(research_state.get("divergences"), []),
        "model_actions": _json_loads(research_state.get("model_actions"), []),
        "top_analog": top_analogs[0] if top_analogs else None,
        "scenario_distribution": _json_loads(research_state.get("scenario_distribution_json"), {}),
        "confidence_delta": _json_loads(research_state.get("confidence_delta_json"), {}),
        "deterministic_decision": deterministic,
        "forecast_confidence": forecast.get("forecast_confidence"),
        "scenario_dispersion_score": forecast.get("scenario_dispersion_score"),
        "agent_agreement_score": forecast.get("agent_agreement_score"),
        "adversarial_risk": forecast.get("adversarial_risk"),
        "invalidation_triggers": _json_loads(forecast.get("invalidation_triggers_json"), []),
    }


def _load_risk_limits(cur, business_id: UUID) -> dict[str, Decimal]:
    cur.execute(
        """
        SELECT name, limit_value
        FROM app.risk_limits
        WHERE business_id = %s AND active = true
        """,
        (str(business_id),),
    )
    rows = cur.fetchall()
    limits = {row["name"]: _to_decimal(row["limit_value"]) for row in rows}
    for key, value in DEFAULT_RISK_LIMITS.items():
        limits.setdefault(key, Decimal(str(value)))
    return limits


def _record_event(
    cur,
    *,
    business_id: UUID,
    event_type: str,
    event_message: str,
    severity: str = "info",
    trade_intent_id: str | UUID | None = None,
    execution_order_id: str | UUID | None = None,
    broker_payload: dict[str, Any] | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO app.execution_events (
            business_id, trade_intent_id, execution_order_id, event_type,
            event_message, severity, broker_payload_json
        ) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            str(business_id),
            str(trade_intent_id) if trade_intent_id else None,
            str(execution_order_id) if execution_order_id else None,
            event_type,
            event_message,
            severity,
            _json(broker_payload or {}),
        ),
    )


def _get_trade_intent_row(cur, business_id: UUID, trade_intent_id: UUID) -> dict[str, Any]:
    cur.execute(
        "SELECT * FROM app.trade_intents WHERE business_id = %s AND trade_intent_id = %s",
        (str(business_id), str(trade_intent_id)),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Trade intent not found")
    return row


def _get_order_row(cur, business_id: UUID, execution_order_id: UUID) -> dict[str, Any]:
    cur.execute(
        "SELECT * FROM app.execution_orders WHERE business_id = %s AND execution_order_id = %s",
        (str(business_id), str(execution_order_id)),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Execution order not found")
    return row


def _get_control_state_row(cur, business_id: UUID) -> dict[str, Any] | None:
    cur.execute(
        "SELECT * FROM app.execution_control_state WHERE business_id = %s",
        (str(business_id),),
    )
    return cur.fetchone()


def _get_latest_risk_check_row(cur, trade_intent_id: UUID) -> dict[str, Any] | None:
    cur.execute(
        """
        SELECT *
        FROM app.trade_risk_checks
        WHERE trade_intent_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (str(trade_intent_id),),
    )
    return cur.fetchone()


def _load_relevant_positions(cur, business_id: UUID, account_mode: str) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT *
        FROM app.portfolio_positions
        WHERE business_id = %s AND account_mode = %s
        ORDER BY updated_at DESC
        """,
        (str(business_id), account_mode),
    )
    return cur.fetchall()


def _resolve_account_mode(control_state: dict[str, Any], requested_mode: str | None) -> str:
    if requested_mode in {"paper", "live"}:
        return requested_mode
    if control_state.get("current_mode") == "live_enabled":
        return "live"
    return "paper"


def create_trade_intent(payload: dict[str, Any]) -> dict[str, Any]:
    business_id = UUID(str(payload["business_id"]))
    research_state = _load_latest_research_context()
    research_snapshot = _build_trade_research_snapshot(research_state)
    scenario_probabilities = payload.get("scenario_probabilities_json") or research_snapshot.get("scenario_distribution") or {}
    thesis_snapshot = {
        **research_snapshot,
        **_json_loads(payload.get("thesis_snapshot_json"), {}),
        "symbol": payload.get("symbol"),
        "side": payload.get("side"),
    }
    top_analog = research_snapshot.get("top_analog") or {}
    top_analog_id = payload.get("top_analog_id") or top_analog.get("episode_id") or top_analog.get("id")
    metadata_json = {
        **research_snapshot.get("deterministic_decision", {}),
        **(payload.get("metadata_json") or {}),
    }
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO app.trade_intents (
                business_id, env_id, created_by, source_type, source_ref_id,
                asset_class, symbol, instrument_type, side, thesis_title,
                thesis_summary, confidence_score, time_horizon, signal_strength,
                trap_risk_score, crowding_score, meta_game_level, forecast_ref_id,
                invalidation_condition, invalidation_level, expected_scenario,
                order_type, entry_price, desired_quantity, desired_notional,
                limit_price, stop_price, top_analog_id, scenario_probabilities_json,
                thesis_snapshot_json, status, metadata_json
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s::jsonb,
                %s::jsonb, %s, %s::jsonb
            )
            RETURNING *
            """,
            (
                str(business_id),
                str(payload.get("env_id")) if payload.get("env_id") else None,
                payload.get("created_by") or "api_user",
                payload["source_type"],
                payload.get("source_ref_id"),
                payload.get("asset_class"),
                payload["symbol"].upper(),
                payload.get("instrument_type") or "stock",
                payload["side"],
                payload.get("thesis_title"),
                payload["thesis_summary"],
                payload["confidence_score"],
                payload["time_horizon"],
                payload.get("signal_strength"),
                payload["trap_risk_score"],
                payload.get("crowding_score"),
                payload.get("meta_game_level"),
                str(payload.get("forecast_ref_id")) if payload.get("forecast_ref_id") else None,
                payload["invalidation_condition"],
                payload.get("invalidation_level"),
                payload["expected_scenario"],
                payload.get("order_type") or "market",
                payload.get("entry_price"),
                payload.get("desired_quantity"),
                payload.get("desired_notional"),
                payload.get("limit_price"),
                payload.get("stop_price"),
                str(top_analog_id) if top_analog_id else None,
                _json(scenario_probabilities),
                _json(thesis_snapshot),
                "pending_risk",
                _json(metadata_json),
            ),
        )
        row = cur.fetchone()
        _record_event(
            cur,
            business_id=business_id,
            trade_intent_id=row["trade_intent_id"],
            event_type="intent_created",
            event_message="Trade intent created and queued for risk review.",
        )
        return row


def list_trade_intents(business_id: UUID, status: str | None = None, env_id: UUID | None = None) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        sql = "SELECT * FROM app.trade_intents WHERE business_id = %s"
        params: list[Any] = [str(business_id)]
        if status:
            sql += " AND status = %s"
            params.append(status)
        if env_id:
            sql += " AND env_id = %s"
            params.append(str(env_id))
        sql += " ORDER BY created_at DESC"
        cur.execute(sql, params)
        return cur.fetchall()


def get_trade_intent(business_id: UUID, trade_intent_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        row = _get_trade_intent_row(cur, business_id, trade_intent_id)
        row["latest_risk_check"] = _get_latest_risk_check_row(cur, trade_intent_id)
        cur.execute(
            "SELECT * FROM app.execution_orders WHERE trade_intent_id = %s ORDER BY updated_at DESC",
            (str(trade_intent_id),),
        )
        row["orders"] = cur.fetchall()
        return row


def run_trade_risk_check(business_id: UUID, trade_intent_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        intent = _get_trade_intent_row(cur, business_id, trade_intent_id)
        control_state = _get_control_state_row(cur, business_id)
        if not control_state:
            result = {
                "portfolio_exposure_check": "block",
                "concentration_check": "block",
                "max_loss_check": "block",
                "liquidity_check": "block",
                "volatility_check": "block",
                "broker_connectivity_check": "block",
                "regime_check": "block",
                "trap_risk_check": "block",
                "live_gate_check": "block",
                "final_decision": "block",
                "adjustment_notes": "Execution control state is missing, so the trade is blocked by design.",
                "size_explanation": "No size calculated because execution control state is missing.",
                "recommended_size": 0,
                "recommended_notional": 0,
                "expected_max_loss": 0,
                "risk_budget_used_pct": 0,
                "stop_level": intent.get("invalidation_level"),
                "invalidation_level": intent.get("invalidation_level"),
                "take_profit_framework": "No take-profit framework because the trade is blocked.",
                "details_json": {"reason": "missing_control_state"},
            }
        else:
            limits = _load_risk_limits(cur, business_id)
            account_mode = "live" if control_state.get("current_mode") == "live_enabled" else "paper"
            open_positions = _load_relevant_positions(cur, business_id, account_mode)

            broker = get_broker_service()
            connected = False
            account_summary: dict[str, Any] = {}
            market_data: dict[str, Any] = {}
            try:
                connected = broker.connect(use_paper=account_mode != "live") and broker.is_connected()
                if connected:
                    account_summary = broker.get_account_summary(account_mode=account_mode)
                    market_data = broker.get_market_data(intent["symbol"])
            except Exception as exc:
                account_summary = {"error": str(exc)}
                market_data = {}

            broker_status = dict(account_summary)
            broker_status["connected"] = connected

            result = evaluate_trade_risk(
                trade_intent=intent,
                control_state=control_state,
                limits=limits,
                open_positions=open_positions,
                broker_status=broker_status,
                regime_snapshot=_load_regime_snapshot(),
                market_data=market_data,
            )

        cur.execute(
            """
            INSERT INTO app.trade_risk_checks (
                trade_intent_id, business_id, portfolio_exposure_check,
                concentration_check, max_loss_check, liquidity_check,
                volatility_check, broker_connectivity_check, regime_check,
                trap_risk_check, live_gate_check, final_decision,
                adjustment_notes, size_explanation, recommended_size,
                recommended_notional, expected_max_loss, risk_budget_used_pct,
                stop_level, invalidation_level, take_profit_framework, details_json
            ) VALUES (
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s::jsonb
            )
            RETURNING *
            """,
            (
                str(trade_intent_id),
                str(business_id),
                result["portfolio_exposure_check"],
                result["concentration_check"],
                result["max_loss_check"],
                result["liquidity_check"],
                result["volatility_check"],
                result["broker_connectivity_check"],
                result["regime_check"],
                result["trap_risk_check"],
                result["live_gate_check"],
                result["final_decision"],
                result.get("adjustment_notes"),
                result.get("size_explanation"),
                result.get("recommended_size"),
                result.get("recommended_notional"),
                result.get("expected_max_loss"),
                result.get("risk_budget_used_pct"),
                result.get("stop_level"),
                result.get("invalidation_level"),
                result.get("take_profit_framework"),
                _json(result.get("details_json") or {}),
            ),
        )
        row = cur.fetchone()
        next_status = "blocked" if row["final_decision"] == "block" else "pending_risk"
        cur.execute(
            "UPDATE app.trade_intents SET status = %s, updated_at = now() WHERE trade_intent_id = %s",
            (next_status, str(trade_intent_id)),
        )
        _record_event(
            cur,
            business_id=business_id,
            trade_intent_id=trade_intent_id,
            event_type="risk_check_completed",
            event_message=f"Risk engine completed with decision {row['final_decision']}.",
            severity="warning" if row["final_decision"] == "block" else "info",
            broker_payload=row.get("details_json") or {},
        )
        return row


def approve_trade_intent(business_id: UUID, trade_intent_id: UUID, approved_by: str, approval_notes: str | None = None) -> dict[str, Any]:
    with get_cursor() as cur:
        intent = _get_trade_intent_row(cur, business_id, trade_intent_id)
        risk_row = _get_latest_risk_check_row(cur, trade_intent_id)
        if not risk_row:
            raise HTTPException(status_code=400, detail="Run a risk check before approving a trade")
        if risk_row["final_decision"] == "block":
            raise HTTPException(status_code=400, detail="Blocked trades cannot be approved")
        cur.execute(
            """
            UPDATE app.trade_intents
            SET status = 'approved', approved_by = %s, approval_notes = %s,
                approved_at = now(), updated_at = now()
            WHERE business_id = %s AND trade_intent_id = %s
            RETURNING *
            """,
            (approved_by, approval_notes, str(business_id), str(trade_intent_id)),
        )
        row = cur.fetchone()
        _record_event(
            cur,
            business_id=business_id,
            trade_intent_id=trade_intent_id,
            event_type="approved",
            event_message=f"Trade intent approved by {approved_by}.",
            broker_payload={"approval_notes": approval_notes, "previous_status": intent["status"]},
        )
        return row


def submit_trade_intent(
    business_id: UUID,
    trade_intent_id: UUID,
    *,
    actor: str,
    tif: str = "DAY",
    broker_name: str = "ibkr",
    broker_account_mode: str | None = None,
    quantity: float | None = None,
    limit_price: float | None = None,
    stop_price: float | None = None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        intent = _get_trade_intent_row(cur, business_id, trade_intent_id)
        control_state = _get_control_state_row(cur, business_id)
        if not control_state:
            raise HTTPException(status_code=400, detail="Execution control state is missing")
        if control_state.get("kill_switch_active"):
            _record_event(
                cur,
                business_id=business_id,
                trade_intent_id=trade_intent_id,
                event_type="blocked",
                event_message="Kill switch is active. New orders are blocked.",
                severity="critical",
            )
            raise HTTPException(status_code=409, detail="Kill switch is active")
        if intent["status"] != "approved":
            raise HTTPException(status_code=400, detail="Trade intent must be approved before submission")

        risk_row = _get_latest_risk_check_row(cur, trade_intent_id)
        if not risk_row or risk_row["final_decision"] == "block":
            raise HTTPException(status_code=400, detail="Trade intent is not eligible for submission")

        account_mode = _resolve_account_mode(control_state, broker_account_mode)
        if account_mode == "live" and not TRADES_ENABLE_LIVE_SUBMISSION:
            _record_event(
                cur,
                business_id=business_id,
                trade_intent_id=trade_intent_id,
                event_type="blocked",
                event_message="Live submission remains disabled for this rollout.",
                severity="warning",
            )
            raise HTTPException(status_code=409, detail="Live trading is disabled for this rollout")

        resolved_quantity = quantity if quantity is not None else float(risk_row.get("recommended_size") or 0)
        if resolved_quantity <= 0:
            raise HTTPException(status_code=400, detail="Risk engine did not produce a tradable quantity")

        resolved_limit_price = limit_price if limit_price is not None else intent.get("limit_price")
        resolved_stop_price = stop_price if stop_price is not None else intent.get("stop_price")
        contract_json = {
            "symbol": intent["symbol"],
            "instrument_type": intent.get("instrument_type") or "stock",
            "exchange": "SMART",
            "currency": "USD",
        }
        client_id = f"winston-{IBKR_CLIENT_ID}"

        cur.execute(
            """
            INSERT INTO app.execution_orders (
                trade_intent_id, business_id, env_id, broker, broker_account_mode,
                client_id, symbol, contract_json, order_type, side, quantity,
                limit_price, stop_price, tif, last_status, raw_broker_response_json
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s::jsonb, %s, %s, %s,
                %s, %s, %s, %s, %s::jsonb
            )
            RETURNING *
            """,
            (
                str(trade_intent_id),
                str(business_id),
                str(intent.get("env_id")) if intent.get("env_id") else None,
                broker_name,
                account_mode,
                client_id,
                intent["symbol"],
                _json(contract_json),
                intent["order_type"],
                intent["side"],
                resolved_quantity,
                resolved_limit_price,
                resolved_stop_price,
                tif,
                "created",
                _json({"submitted_by": actor}),
            ),
        )
        order_row = cur.fetchone()

        broker = get_broker_service()
        try:
            broker.connect(use_paper=account_mode != "live")
            broker_response = broker.submit_order(
                symbol=intent["symbol"],
                side=intent["side"],
                quantity=resolved_quantity,
                order_type=intent["order_type"],
                limit_price=resolved_limit_price,
                stop_price=resolved_stop_price,
                tif=tif,
                contract=contract_json,
                account_mode=account_mode,
            )
            broker_order_id = str(broker_response.get("broker_order_id") or broker_response.get("order_id") or order_row["execution_order_id"])
            last_status = broker_response.get("status") or "submitted"
            cur.execute(
                """
                UPDATE app.execution_orders
                SET broker_order_id = %s,
                    submitted_at = now(),
                    last_status = %s,
                    raw_broker_response_json = %s::jsonb,
                    updated_at = now()
                WHERE execution_order_id = %s
                RETURNING *
                """,
                (broker_order_id, last_status, _json(broker_response), str(order_row["execution_order_id"])),
            )
            order_row = cur.fetchone()
            cur.execute(
                "UPDATE app.trade_intents SET status = 'submitted', updated_at = now() WHERE trade_intent_id = %s",
                (str(trade_intent_id),),
            )
            _record_event(
                cur,
                business_id=business_id,
                trade_intent_id=trade_intent_id,
                execution_order_id=order_row["execution_order_id"],
                event_type="submitted",
                event_message=f"Order submitted to {broker_name} {account_mode}.",
                broker_payload=broker_response,
            )
            return order_row
        except Exception as exc:
            cur.execute(
                """
                UPDATE app.execution_orders
                SET last_status = 'error', raw_broker_response_json = %s::jsonb, updated_at = now()
                WHERE execution_order_id = %s
                RETURNING *
                """,
                (_json({"error": str(exc)}), str(order_row["execution_order_id"])),
            )
            order_row = cur.fetchone()
            _record_event(
                cur,
                business_id=business_id,
                trade_intent_id=trade_intent_id,
                execution_order_id=order_row["execution_order_id"],
                event_type="error",
                event_message=f"Broker submission failed: {exc}",
                severity="error",
                broker_payload={"error": str(exc)},
            )
            raise HTTPException(status_code=502, detail=f"Broker submission failed: {exc}") from exc


def list_orders(business_id: UUID, status: str | None = None) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        sql = "SELECT * FROM app.execution_orders WHERE business_id = %s"
        params: list[Any] = [str(business_id)]
        if status:
            sql += " AND last_status = %s"
            params.append(status)
        sql += " ORDER BY updated_at DESC"
        cur.execute(sql, params)
        return cur.fetchall()


def get_order(business_id: UUID, execution_order_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        row = _get_order_row(cur, business_id, execution_order_id)
        cur.execute(
            "SELECT * FROM app.execution_events WHERE execution_order_id = %s ORDER BY created_at DESC",
            (str(execution_order_id),),
        )
        row["events"] = cur.fetchall()
        return row


def cancel_order(business_id: UUID, execution_order_id: UUID, actor: str) -> dict[str, Any]:
    with get_cursor() as cur:
        row = _get_order_row(cur, business_id, execution_order_id)
        broker = get_broker_service()
        try:
            broker.connect(use_paper=row["broker_account_mode"] != "live")
            broker_response = broker.cancel_order(
                broker_order_id=row.get("broker_order_id"),
                order_id=str(execution_order_id),
                account_mode=row["broker_account_mode"],
            )
        except Exception as exc:
            broker_response = {"status": "cancel_requested", "warning": str(exc)}

        cur.execute(
            """
            UPDATE app.execution_orders
            SET last_status = 'cancelled', raw_broker_response_json = %s::jsonb, updated_at = now()
            WHERE execution_order_id = %s
            RETURNING *
            """,
            (_json(broker_response), str(execution_order_id)),
        )
        order_row = cur.fetchone()
        cur.execute(
            "UPDATE app.trade_intents SET status = 'cancelled', updated_at = now() WHERE trade_intent_id = %s",
            (str(order_row["trade_intent_id"]),),
        )
        _record_event(
            cur,
            business_id=business_id,
            trade_intent_id=order_row["trade_intent_id"],
            execution_order_id=execution_order_id,
            event_type="cancelled",
            event_message=f"Order cancelled by {actor}.",
            severity="warning",
            broker_payload=broker_response,
        )
        return order_row


def list_positions(business_id: UUID, account_mode: str | None = None) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        sql = "SELECT * FROM app.portfolio_positions WHERE business_id = %s"
        params: list[Any] = [str(business_id)]
        if account_mode:
            sql += " AND account_mode = %s"
            params.append(account_mode)
        sql += " ORDER BY updated_at DESC"
        cur.execute(sql, params)
        return cur.fetchall()


def get_account_summary(business_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        control_state = _get_control_state_row(cur, business_id) or {
            "current_mode": "paper",
            "kill_switch_active": True,
            "reason": "missing_control_state",
        }
        account_mode = "live" if control_state.get("current_mode") == "live_enabled" else "paper"
        cur.execute(
            "SELECT COUNT(*) AS open_orders FROM app.execution_orders WHERE business_id = %s AND last_status NOT IN ('cancelled', 'filled', 'rejected')",
            (str(business_id),),
        )
        open_orders = cur.fetchone() or {"open_orders": 0}
        cur.execute(
            "SELECT COUNT(*) AS positions_count, COALESCE(SUM(unrealized_pnl), 0) AS unrealized_pnl, COALESCE(SUM(realized_pnl), 0) AS realized_pnl, COALESCE(SUM(market_value), 0) AS gross_market_value FROM app.portfolio_positions WHERE business_id = %s AND account_mode = %s",
            (str(business_id), account_mode),
        )
        positions_rollup = cur.fetchone() or {}
        limits = _load_risk_limits(cur, business_id)

    broker = get_broker_service()
    broker_connected = False
    broker_summary: dict[str, Any] = {}
    try:
        broker_connected = broker.connect(use_paper=account_mode != "live") and broker.is_connected()
        if broker_connected:
            broker_summary = broker.get_account_summary(account_mode=account_mode)
    except Exception as exc:
        broker_summary = {"error": str(exc)}

    gross_market_value = _to_decimal(positions_rollup.get("gross_market_value"))
    equity_value = _to_decimal(broker_summary.get("NetLiquidation") or broker_summary.get("equity_value") or "0")
    risk_utilization_pct = Decimal("0")
    max_single_position_pct = _to_decimal(limits.get("max_single_position_pct"), "5")
    if equity_value > 0 and max_single_position_pct > 0:
        allowed_gross = equity_value * (max_single_position_pct / Decimal("100"))
        if allowed_gross > 0:
            risk_utilization_pct = (gross_market_value / allowed_gross * Decimal("100")).quantize(Decimal("0.01"))

    return {
        "business_id": str(business_id),
        "account_mode": account_mode,
        "broker_connected": broker_connected,
        "kill_switch_active": bool(control_state.get("kill_switch_active")),
        "open_orders": int(open_orders.get("open_orders") or 0),
        "positions_count": int(positions_rollup.get("positions_count") or 0),
        "unrealized_pnl": positions_rollup.get("unrealized_pnl") or 0,
        "realized_pnl": positions_rollup.get("realized_pnl") or 0,
        "risk_utilization_pct": risk_utilization_pct,
        "broker_summary": broker_summary,
        "limits": {key: str(value) for key, value in limits.items()},
    }


def get_control_state(business_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        row = _get_control_state_row(cur, business_id)
        if not row:
            raise HTTPException(status_code=404, detail="Execution control state not found")
        return row


def set_kill_switch(business_id: UUID, activate: bool, reason: str, changed_by: str) -> dict[str, Any]:
    with get_cursor() as cur:
        existing = _get_control_state_row(cur, business_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Execution control state not found")
        cur.execute(
            """
            UPDATE app.execution_control_state
            SET kill_switch_active = %s, reason = %s, changed_by = %s, changed_at = now()
            WHERE business_id = %s
            RETURNING *
            """,
            (activate, reason, changed_by, str(business_id)),
        )
        row = cur.fetchone()
        _record_event(
            cur,
            business_id=business_id,
            event_type="kill_switch_activated" if activate else "kill_switch_cleared",
            event_message=reason,
            severity="critical" if activate else "warning",
            broker_payload={"changed_by": changed_by},
        )
        return row


def set_trading_mode(
    business_id: UUID,
    *,
    target_mode: str,
    changed_by: str,
    reason: str | None = None,
    confirmation_phrase: str | None = None,
) -> dict[str, Any]:
    if requires_live_confirmation(target_mode) and not is_valid_live_phrase(confirmation_phrase):
        raise HTTPException(status_code=400, detail="Live mode requires the typed confirmation phrase")
    with get_cursor() as cur:
        existing = _get_control_state_row(cur, business_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Execution control state not found")
        if target_mode == "live_enabled" and not TRADES_ENABLE_LIVE_SUBMISSION:
            _record_event(
                cur,
                business_id=business_id,
                event_type="live_mode_attempted",
                event_message="Live mode enable attempted while live submission is disabled for this rollout.",
                severity="warning",
                broker_payload={"changed_by": changed_by, "reason": reason},
            )
        cur.execute(
            """
            UPDATE app.execution_control_state
            SET current_mode = %s, reason = %s, changed_by = %s, changed_at = now()
            WHERE business_id = %s
            RETURNING *
            """,
            (target_mode, reason, changed_by, str(business_id)),
        )
        row = cur.fetchone()
        _record_event(
            cur,
            business_id=business_id,
            event_type="mode_changed",
            event_message=f"Execution mode changed to {target_mode}.",
            severity="warning" if target_mode == "live_enabled" else "info",
            broker_payload={"changed_by": changed_by, "reason": reason},
        )
        return row


def create_post_trade_review(payload: dict[str, Any]) -> dict[str, Any]:
    business_id = UUID(str(payload["business_id"]))
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO app.post_trade_reviews (
                trade_intent_id, business_id, env_id, thesis_quality_score,
                timing_quality_score, sizing_quality_score, execution_quality_score,
                discipline_score, trap_realized_flag, notes
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(payload["trade_intent_id"]),
                str(business_id),
                str(payload.get("env_id")) if payload.get("env_id") else None,
                payload.get("thesis_quality_score"),
                payload.get("timing_quality_score"),
                payload.get("sizing_quality_score"),
                payload.get("execution_quality_score"),
                payload.get("discipline_score"),
                payload.get("trap_realized_flag", False),
                payload.get("notes"),
            ),
        )
        row = cur.fetchone()
        _record_event(
            cur,
            business_id=business_id,
            trade_intent_id=payload["trade_intent_id"],
            event_type="post_trade_review_created",
            event_message="Post-trade review recorded.",
            broker_payload={"review_id": row["post_trade_review_id"]},
        )
        return row


def list_post_trade_reviews(business_id: UUID, trade_intent_id: UUID | None = None) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        sql = "SELECT * FROM app.post_trade_reviews WHERE business_id = %s"
        params: list[Any] = [str(business_id)]
        if trade_intent_id:
            sql += " AND trade_intent_id = %s"
            params.append(str(trade_intent_id))
        sql += " ORDER BY created_at DESC"
        cur.execute(sql, params)
        return cur.fetchall()


def get_promotion_checklist(business_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS count FROM app.execution_orders WHERE business_id = %s AND broker_account_mode = 'paper'",
            (str(business_id),),
        )
        paper_orders = int((cur.fetchone() or {}).get("count") or 0)
        cur.execute(
            "SELECT COUNT(*) AS count FROM app.post_trade_reviews WHERE business_id = %s",
            (str(business_id),),
        )
        reviews = int((cur.fetchone() or {}).get("count") or 0)
        cur.execute(
            "SELECT COUNT(*) AS count FROM app.execution_events WHERE business_id = %s AND severity = 'error'",
            (str(business_id),),
        )
        error_events = int((cur.fetchone() or {}).get("count") or 0)
        cur.execute(
            "SELECT COUNT(*) AS count FROM app.execution_events WHERE business_id = %s AND event_type = 'reconnected'",
            (str(business_id),),
        )
        reconnect_events = int((cur.fetchone() or {}).get("count") or 0)

    thresholds = PROMOTION_CHECKLIST_DEFAULTS
    items = [
        {
            "key": "minimum_paper_trades",
            "label": "Paper trades executed",
            "current": paper_orders,
            "required": int(thresholds["minimum_paper_trades"]),
            "passed": paper_orders >= int(thresholds["minimum_paper_trades"]),
        },
        {
            "key": "minimum_review_sample",
            "label": "Post-trade reviews completed",
            "current": reviews,
            "required": int(thresholds["minimum_review_sample"]),
            "passed": reviews >= int(thresholds["minimum_review_sample"]),
        },
        {
            "key": "max_execution_error_rate_pct",
            "label": "Execution error rate",
            "current": 0 if paper_orders == 0 else round((error_events / paper_orders) * 100, 2),
            "required": thresholds["max_execution_error_rate_pct"],
            "passed": paper_orders > 0 and ((error_events / paper_orders) * 100) <= thresholds["max_execution_error_rate_pct"],
        },
        {
            "key": "max_disconnect_events",
            "label": "Reconnect events",
            "current": reconnect_events,
            "required": thresholds["max_disconnect_events"],
            "passed": reconnect_events <= thresholds["max_disconnect_events"],
        },
        {
            "key": "required_paper_days",
            "label": "Paper incubation days",
            "current": 0,
            "required": thresholds["required_paper_days"],
            "passed": False,
            "note": "Duration tracking is pending until broker sync writes stable first/last paper timestamps.",
        },
        {
            "key": "required_brier_threshold",
            "label": "History Rhymes calibration threshold",
            "current": None,
            "required": thresholds["required_brier_threshold"],
            "passed": False,
            "note": "Wire in the existing Brier score surface before promoting beyond paper.",
        },
    ]
    return {
        "business_id": str(business_id),
        "ready_for_live": all(item["passed"] for item in items),
        "items": items,
        "generated_at": _now_iso(),
    }


def get_alerts(business_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM app.execution_events
            WHERE business_id = %s
              AND severity IN ('warning', 'error', 'critical')
            ORDER BY created_at DESC
            LIMIT 50
            """,
            (str(business_id),),
        )
        return cur.fetchall()


def _range_cutoff(range_key: str | None) -> datetime | None:
    now = datetime.now(timezone.utc)
    mapping = {
        "1D": timedelta(days=1),
        "1W": timedelta(days=7),
        "1M": timedelta(days=30),
        "3M": timedelta(days=90),
        "YTD": now - datetime(now.year, 1, 1, tzinfo=timezone.utc),
        "1Y": timedelta(days=365),
    }
    if not range_key or range_key == "ALL":
        return None
    delta = mapping.get(range_key)
    if delta is None:
        return None
    return now - delta


def _seed_mode_label(seed_count: int, mock_count: int) -> str | None:
    if mock_count > 0 and seed_count > 0:
        return "Demo / Seeded Portfolio"
    if mock_count > 0:
        return "Mock positions with live quotes"
    if seed_count > 0:
        return "Fully seeded data"
    return None


def _compute_max_drawdown_pct(points: list[dict[str, Any]]) -> float:
    peak = 0.0
    max_drawdown = 0.0
    for row in sorted(points, key=lambda item: item.get("snapshot_time") or item.get("as_of") or ""):
        value = float(row.get("portfolio_value") or 0)
        if value > peak:
            peak = value
        if peak > 0:
            drawdown = ((value - peak) / peak) * 100
            if drawdown < max_drawdown:
                max_drawdown = drawdown
    return round(abs(max_drawdown), 2)


def _benchmark_relative_return(points: list[dict[str, Any]], field: str) -> float | None:
    if len(points) < 2:
        return None
    ordered = sorted(points, key=lambda item: item.get("snapshot_time") or item.get("as_of") or "")
    start = ordered[0]
    end = ordered[-1]
    start_portfolio = _to_decimal(start.get("portfolio_value"))
    end_portfolio = _to_decimal(end.get("portfolio_value"))
    start_benchmark = _to_decimal(start.get(field))
    end_benchmark = _to_decimal(end.get(field))
    if start_portfolio <= 0 or start_benchmark <= 0:
        return None
    portfolio_return = ((end_portfolio - start_portfolio) / start_portfolio) * Decimal("100")
    benchmark_return = ((end_benchmark - start_benchmark) / start_benchmark) * Decimal("100")
    return float((portfolio_return - benchmark_return).quantize(Decimal("0.01")))


def list_open_portfolio_positions(business_id: UUID, account_mode: str | None = None) -> list[dict[str, Any]]:
    mode = account_mode or "paper"
    with get_cursor() as cur:
        try:
            cur.execute(
                """
                SELECT
                    p.portfolio_position_id,
                    p.business_id,
                    p.symbol,
                    p.asset_class,
                    p.direction,
                    p.quantity,
                    p.entry_price,
                    p.market_price AS current_price,
                    p.market_value,
                    p.unrealized_pnl,
                    p.realized_pnl,
                    CASE
                        WHEN COALESCE(p.entry_price, 0) = 0 THEN NULL
                        WHEN COALESCE(p.direction, 'long') = 'short'
                            THEN ROUND(((p.entry_price - COALESCE(p.market_price, p.entry_price)) / p.entry_price) * 100, 4)
                        ELSE ROUND(((COALESCE(p.market_price, p.entry_price) - p.entry_price) / p.entry_price) * 100, 4)
                    END AS unrealized_return_pct,
                    CASE
                        WHEN p.opened_at IS NULL THEN NULL
                        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - p.opened_at)) / 86400))::int
                    END AS days_held,
                    ti.thesis_summary,
                    COALESCE(p.invalidation_condition, ti.invalidation_condition) AS invalidation_condition,
                    p.stop_loss,
                    p.take_profit,
                    p.quote_timestamp,
                    p.quote_source,
                    p.quote_freshness_state,
                    p.quote_data_class,
                    COALESCE(p.forecast_id, ti.forecast_ref_id) AS forecast_id,
                    COALESCE(p.top_analog_id, ti.top_analog_id) AS top_analog_id,
                    COALESCE(p.scenario_probabilities_json, ti.scenario_probabilities_json) AS scenario_probabilities_json,
                    COALESCE(p.thesis_snapshot_json, ti.thesis_snapshot_json) AS thesis_snapshot_json,
                    p.updated_at
                FROM app.portfolio_positions p
                LEFT JOIN app.trade_intents ti
                  ON ti.trade_intent_id = p.thesis_ref_id
                WHERE p.business_id = %s
                  AND p.account_mode = %s
                  AND COALESCE(p.status, 'open') IN ('open', 'partially_closed')
                ORDER BY COALESCE(p.market_value, 0) DESC, p.updated_at DESC
                """,
                (str(business_id), mode),
            )
        except Exception:
            cur.execute(
                """
                SELECT
                    p.portfolio_position_id,
                    p.business_id,
                    p.symbol,
                    p.asset_class,
                    'long' AS direction,
                    p.quantity,
                    p.avg_cost AS entry_price,
                    p.market_price AS current_price,
                    p.market_value,
                    p.unrealized_pnl,
                    p.realized_pnl,
                    CASE
                        WHEN COALESCE(p.avg_cost, 0) = 0 THEN NULL
                        ELSE ROUND(((COALESCE(p.market_price, p.avg_cost) - p.avg_cost) / p.avg_cost) * 100, 4)
                    END AS unrealized_return_pct,
                    CASE
                        WHEN p.opened_at IS NULL THEN NULL
                        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - p.opened_at)) / 86400))::int
                    END AS days_held,
                    ti.thesis_summary,
                    ti.invalidation_condition,
                    NULL::numeric AS stop_loss,
                    NULL::numeric AS take_profit,
                    NULL::timestamptz AS quote_timestamp,
                    p.broker AS quote_source,
                    NULL::text AS quote_freshness_state,
                    NULL::text AS quote_data_class,
                    ti.forecast_ref_id AS forecast_id,
                    NULL::uuid AS top_analog_id,
                    ti.scenario_probabilities_json,
                    ti.thesis_snapshot_json,
                    p.updated_at
                FROM app.portfolio_positions p
                LEFT JOIN app.trade_intents ti
                  ON ti.trade_intent_id = p.thesis_ref_id
                WHERE p.business_id = %s
                  AND p.account_mode = %s
                ORDER BY COALESCE(p.market_value, 0) DESC, p.updated_at DESC
                """,
                (str(business_id), mode),
            )
        return cur.fetchall()


def list_closed_portfolio_positions(business_id: UUID, account_mode: str | None = None) -> list[dict[str, Any]]:
    mode = account_mode or "paper"
    with get_cursor() as cur:
        try:
            cur.execute(
                """
                SELECT
                    cp.portfolio_closed_position_id,
                    cp.business_id,
                    cp.symbol,
                    cp.asset_class,
                    cp.direction,
                    cp.quantity,
                    cp.entry_price,
                    cp.exit_price,
                    cp.realized_pnl,
                    cp.realized_return_pct,
                    CASE
                        WHEN cp.opened_at IS NULL THEN NULL
                        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (cp.closed_at - cp.opened_at)) / 86400))::int
                    END AS holding_period_days,
                    cp.close_reason,
                    ti.thesis_summary,
                    cp.closed_at,
                    cp.forecast_id,
                    cp.top_analog_id,
                    cp.scenario_probabilities_json,
                    cp.thesis_snapshot_json
                FROM app.portfolio_closed_positions cp
                LEFT JOIN app.trade_intents ti
                  ON ti.trade_intent_id = cp.thesis_ref_id
                WHERE cp.business_id = %s
                  AND cp.account_mode = %s
                ORDER BY cp.closed_at DESC
                """,
                (str(business_id), mode),
            )
            return cur.fetchall()
        except Exception:
            return []


def get_portfolio_history(business_id: UUID, account_mode: str | None = None, range_key: str | None = None) -> list[dict[str, Any]]:
    mode = account_mode or "paper"
    cutoff = _range_cutoff(range_key)
    with get_cursor() as cur:
        sql = """
            SELECT
                snapshot_time AS as_of,
                portfolio_value,
                cash,
                gross_exposure,
                net_exposure,
                realized_pnl,
                unrealized_pnl,
                day_pnl,
                benchmark_spy,
                benchmark_btc,
                freshness_state,
                source,
                seed_input_count,
                mock_input_count
            FROM app.portfolio_snapshots
            WHERE business_id = %s
              AND account_mode = %s
        """
        params: list[Any] = [str(business_id), mode]
        if cutoff is not None:
            sql += " AND snapshot_time >= %s"
            params.append(cutoff)
        sql += " ORDER BY snapshot_time ASC"
        try:
            cur.execute(sql, params)
            rows = cur.fetchall()
        except Exception:
            rows = []
    return rows


def get_portfolio_attribution(business_id: UUID, account_mode: str | None = None) -> dict[str, Any]:
    mode = account_mode or "paper"
    open_positions = list_open_portfolio_positions(business_id, mode)
    closed_positions = list_closed_portfolio_positions(business_id, mode)
    best = sorted(open_positions, key=lambda row: float(row.get("unrealized_pnl") or 0), reverse=True)[:5]
    worst = sorted(open_positions, key=lambda row: float(row.get("unrealized_pnl") or 0))[:5]
    realized = sum(float(row.get("realized_pnl") or 0) for row in closed_positions)
    unrealized = sum(float(row.get("unrealized_pnl") or 0) for row in open_positions)

    asset_class_map: dict[str, float] = {}
    strategy_map: dict[str, float] = {}
    gross_total = sum(abs(float(row.get("market_value") or 0)) for row in open_positions)
    long_value = 0.0
    short_value = 0.0
    largest_position = 0.0
    for row in open_positions:
        pnl = float(row.get("unrealized_pnl") or 0)
        asset_class = str(row.get("asset_class") or "other")
        strategy = str(row.get("thesis_summary") or "Unclassified")
        asset_class_map[asset_class] = asset_class_map.get(asset_class, 0.0) + pnl
        strategy_map[strategy] = strategy_map.get(strategy, 0.0) + pnl
        market_value = float(row.get("market_value") or 0)
        largest_position = max(largest_position, abs(market_value))
        if str(row.get("direction") or "long") == "short":
            short_value += abs(market_value)
        else:
            long_value += abs(market_value)

    return {
        "best_contributors": best,
        "worst_contributors": worst,
        "realized_vs_unrealized": {
            "realized": round(realized, 2),
            "unrealized": round(unrealized, 2),
        },
        "contribution_by_asset_class": [
            {"asset_class": key, "pnl": round(value, 2)} for key, value in sorted(asset_class_map.items(), key=lambda item: item[1], reverse=True)
        ],
        "contribution_by_strategy": [
            {"strategy": key, "pnl": round(value, 2)} for key, value in sorted(strategy_map.items(), key=lambda item: item[1], reverse=True)[:8]
        ],
        "largest_position_share_pct": round((largest_position / gross_total) * 100, 2) if gross_total > 0 else 0,
        "long_short_split": {
            "long": round(long_value, 2),
            "short": round(short_value, 2),
        },
    }


def get_portfolio_accountability(business_id: UUID) -> dict[str, Any]:
    reviews = list_post_trade_reviews(business_id)
    checklist = get_promotion_checklist(business_id)
    resolved = 0
    unresolved = 0
    wins = 0
    brier_scores: list[float] = []
    for review in reviews:
        discipline = review.get("discipline_score")
        if discipline is None:
            unresolved += 1
        else:
            resolved += 1
            if float(discipline) >= 60:
                wins += 1
        if review.get("thesis_quality_score") is not None:
            normalized = max(0.0, min(1.0, 1 - (float(review["thesis_quality_score"]) / 100)))
            brier_scores.append(normalized)
    avg_brier = round(sum(brier_scores) / len(brier_scores), 3) if brier_scores else None
    promotion_notes = [item["label"] for item in checklist["items"] if not item["passed"]]
    return {
        "recent_reviews": reviews[:8],
        "resolved_count": resolved,
        "unresolved_count": unresolved,
        "win_rate": round((wins / resolved) * 100, 2) if resolved > 0 else 0,
        "avg_brier_score": avg_brier,
        "confidence_deserves_trust": avg_brier is not None and avg_brier <= 0.22,
        "promotion_ready": bool(checklist["ready_for_live"]),
        "promotion_notes": promotion_notes,
    }


def get_portfolio_decision_summary(business_id: UUID) -> dict[str, Any]:
    regime_snapshot = _load_regime_snapshot() or {}
    research_state = _load_latest_research_context() or {}
    deterministic = research_state.get("deterministic_decision") or {}
    latest_forecast = research_state.get("latest_forecast") or {}
    scenarios = _json_loads(research_state.get("scenario_distribution_json"), {})
    if not scenarios and latest_forecast:
        scenarios = {
            "bull": float(latest_forecast.get("scenario_bull_prob") or 0),
            "base": float(latest_forecast.get("scenario_base_prob") or 0),
            "bear": float(latest_forecast.get("scenario_bear_prob") or 0),
        }
    top_analogs = _json_loads(research_state.get("top_analogs"), [])
    top_analog = top_analogs[0] if top_analogs else None
    confidence = float(
        (research_state.get("confidence_delta") or {}).get("current")
        or ((latest_forecast.get("forecast_confidence") or 0) * 100)
        or regime_snapshot.get("confidence")
        or 0
    )
    posture = deterministic.get("action_posture") or "paper_only"
    posture_action_map = {
        "abstain": "abstain",
        "paper_only": "paper_trade_only",
        "reduced_size": "reduce",
        "normal_conviction": "add" if float(scenarios.get("bull") or 0) > float(scenarios.get("bear") or 0) else "hold",
    }
    action = posture_action_map.get(posture, "hold")
    trap_reason = "; ".join((deterministic.get("action_posture_reasons") or [])[:2]) or None

    return {
        "recommended_action": action,
        "confidence": confidence,
        "sizing_guidance": f"Posture {posture} with size multiplier {deterministic.get('size_multiplier', 0)}.",
        "invalidation_trigger": (
            (_json_loads(latest_forecast.get("invalidation_triggers_json"), []) or [None])[0]
            or trap_reason
            or "Break in regime alignment or analog divergence widening materially."
        ),
        "current_regime": research_state.get("regime_label") or regime_snapshot.get("regime_label"),
        "bull_probability": float(scenarios.get("bull") or 0),
        "base_probability": float(scenarios.get("base") or 0),
        "bear_probability": float(scenarios.get("bear") or 0),
        "trap_warning": trap_reason,
        "top_analog_name": (top_analog or {}).get("episode"),
        "rhyme_score": (top_analog or {}).get("score"),
        "divergence_note": "; ".join(_json_loads(research_state.get("divergences"), [])[:2]) or "What differs this time is surfaced through analog divergence and trap checks.",
        "calibration_summary": "Promotion remains gated by paper history, Brier quality, drawdown discipline, and deterministic action posture.",
        "action_posture": posture,
        "action_posture_reasons": deterministic.get("action_posture_reasons") or [],
        "size_multiplier": deterministic.get("size_multiplier"),
        "state_staleness_status": deterministic.get("state_staleness_status"),
        "effective_scope_chain": deterministic.get("effective_scope_chain") or [],
        "forecast_confidence": latest_forecast.get("forecast_confidence"),
        "scenario_dispersion_score": latest_forecast.get("scenario_dispersion_score"),
        "adversarial_risk": latest_forecast.get("adversarial_risk") or research_state.get("adversarial_risk"),
        "confidence_delta": research_state.get("confidence_delta") or {},
    }


def get_portfolio_overview(business_id: UUID, account_mode: str | None = None, range_key: str | None = None) -> dict[str, Any]:
    mode = account_mode or "paper"
    with get_cursor() as cur:
        latest_sql = """
            SELECT *
            FROM app.portfolio_snapshots
            WHERE business_id = %s
              AND account_mode = %s
            ORDER BY snapshot_time DESC
            LIMIT 1
        """
        try:
            cur.execute(latest_sql, (str(business_id), mode))
            latest_snapshot = cur.fetchone()
        except Exception:
            latest_snapshot = {}
        try:
            cur.execute(
                """
                SELECT
                    COUNT(*) AS positions_count,
                    COALESCE(SUM(unrealized_pnl), 0) AS unrealized_pnl,
                    COALESCE(SUM(realized_pnl), 0) AS realized_pnl,
                    COALESCE(SUM(ABS(market_value)), 0) AS gross_exposure,
                    COALESCE(SUM(CASE WHEN COALESCE(direction, 'long') = 'short' THEN -ABS(market_value) ELSE ABS(market_value) END), 0) AS net_exposure,
                    COALESCE(SUM(seed_input_count), 0) AS seed_input_count,
                    COALESCE(SUM(mock_input_count), 0) AS mock_input_count
                FROM app.portfolio_positions
                WHERE business_id = %s
                  AND account_mode = %s
                  AND COALESCE(status, 'open') IN ('open', 'partially_closed')
                """,
                (str(business_id), mode),
            )
            open_rollup = cur.fetchone() or {}
        except Exception:
            cur.execute(
                """
                SELECT
                    COUNT(*) AS positions_count,
                    COALESCE(SUM(unrealized_pnl), 0) AS unrealized_pnl,
                    COALESCE(SUM(realized_pnl), 0) AS realized_pnl,
                    COALESCE(SUM(ABS(market_value)), 0) AS gross_exposure,
                    COALESCE(SUM(market_value), 0) AS net_exposure,
                    0 AS seed_input_count,
                    0 AS mock_input_count
                FROM app.portfolio_positions
                WHERE business_id = %s
                  AND account_mode = %s
                """,
                (str(business_id), mode),
            )
            open_rollup = cur.fetchone() or {}
        try:
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total_closed,
                    COUNT(*) FILTER (WHERE realized_pnl > 0) AS win_count,
                    COALESCE(SUM(realized_pnl), 0) AS total_realized
                FROM app.portfolio_closed_positions
                WHERE business_id = %s
                  AND account_mode = %s
                """,
                (str(business_id), mode),
            )
            closed_rollup = cur.fetchone() or {}
        except Exception:
            closed_rollup = {}
        try:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(amount), 0) AS external_cash_flows
                FROM app.portfolio_cash_flows
                WHERE business_id = %s
                  AND effective_at >= date_trunc('day', now())
                """,
                (str(business_id),),
            )
            today_flows = cur.fetchone() or {}
        except Exception:
            today_flows = {}

    history_all = get_portfolio_history(business_id, mode, "ALL")
    history_range = get_portfolio_history(business_id, mode, range_key)
    account_summary = get_account_summary(business_id)

    latest = latest_snapshot or {}
    gross_exposure = float(latest.get("gross_exposure") or open_rollup.get("gross_exposure") or 0)
    net_exposure = float(latest.get("net_exposure") or open_rollup.get("net_exposure") or 0)
    unrealized_pnl = float(latest.get("unrealized_pnl") or open_rollup.get("unrealized_pnl") or 0)
    realized_pnl = float(latest.get("realized_pnl") or closed_rollup.get("total_realized") or account_summary.get("realized_pnl") or 0)
    portfolio_value = float(latest.get("portfolio_value") or account_summary.get("broker_summary", {}).get("NetLiquidation") or gross_exposure)
    external_cash_flows = float(latest.get("external_cash_flows") or today_flows.get("external_cash_flows") or 0)
    day_pnl = float(latest.get("day_pnl") or 0)
    total_pnl = unrealized_pnl + realized_pnl
    total_return_pct = round((total_pnl / portfolio_value) * 100, 2) if portfolio_value else 0
    total_closed = int(closed_rollup.get("total_closed") or 0)
    win_count = int(closed_rollup.get("win_count") or 0)
    win_rate = round((win_count / total_closed) * 100, 2) if total_closed else 0
    seed_count = int(latest.get("seed_input_count") or open_rollup.get("seed_input_count") or 0)
    mock_count = int(latest.get("mock_input_count") or open_rollup.get("mock_input_count") or 0)
    seed_mode = _seed_mode_label(seed_count, mock_count)
    range_benchmark_relative = _benchmark_relative_return(history_range, "benchmark_spy")
    inception_benchmark_relative = _benchmark_relative_return(history_all, "benchmark_spy")
    open_positions = list_open_portfolio_positions(business_id, mode)
    stale_quotes = [row for row in open_positions if str(row.get("quote_freshness_state") or "") == "stale"]
    decision_summary = get_portfolio_decision_summary(business_id)

    return {
        "hero": {
            "business_id": str(business_id),
            "account_mode": mode,
            "as_of": latest.get("snapshot_time"),
            "portfolio_value": round(portfolio_value, 2),
            "day_pnl": round(day_pnl if day_pnl else (portfolio_value - external_cash_flows), 2),
            "total_pnl": round(total_pnl, 2),
            "total_return_pct": total_return_pct,
            "unrealized_pnl": round(unrealized_pnl, 2),
            "realized_pnl": round(realized_pnl, 2),
            "cash": float(latest.get("cash") or 0),
            "gross_exposure": round(gross_exposure, 2),
            "net_exposure": round(net_exposure, 2),
            "win_rate": win_rate,
            "max_drawdown_pct": _compute_max_drawdown_pct(history_all),
            "benchmark_relative_return_pct": range_benchmark_relative,
            "benchmark_relative_return_since_inception_pct": inception_benchmark_relative,
            "freshness_state": str(latest.get("freshness_state") or "unavailable"),
            "seed_mode_label": seed_mode,
            "seed_badge_required": seed_mode is not None,
            "stale_warning": f"{len(stale_quotes)} positions have stale marks." if stale_quotes else None,
            "quote_provenance": [
                {
                    "symbol": row.get("symbol"),
                    "source": row.get("quote_source"),
                    "quote_timestamp": row.get("quote_timestamp"),
                    "freshness_state": row.get("quote_freshness_state"),
                    "data_class": row.get("quote_data_class"),
                }
                for row in open_positions[:8]
            ],
        },
        "decision": decision_summary,
        "history_rhymes": decision_summary,
        "accountability": get_portfolio_accountability(business_id),
    }
