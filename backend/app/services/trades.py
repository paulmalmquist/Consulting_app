"""Execution-layer service for paper-first trade intents, risk, controls, and orders."""

from __future__ import annotations

import json
from datetime import datetime, timezone
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
                limit_price, stop_price, status, metadata_json
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s::jsonb
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
                "pending_risk",
                _json(payload.get("metadata_json") or {}),
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
