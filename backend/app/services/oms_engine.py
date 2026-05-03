"""Investment Engine: Order Management System (OMS) — Wave 2.

Order lifecycle:
    idea       -> submit       -> order
    order      -> evaluate     -> pre-trade compliance: passed | failed
    order      -> approve      -> approved (compliance must have passed or been overridden)
    approved   -> route        -> routed
    routed     -> record_fill  -> partially_filled | filled
    any non-terminal -> cancel -> cancelled

Per ADR 005: pre-trade compliance is a synchronous, blocking call that uses
compliance_engine.evaluate_pre_trade. Approve is gated on the compliance
state being 'passed' or 'overridden' (with explicit override_reason).

Every state transition writes an inv_order_event row in the same transaction
as the inv_order UPDATE, plus an inv_audit_log entry.

Returns EngineResult on every code path. Pure compute helpers exist for
state-transition validation; DB-touching helpers compose them.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional, TypedDict
from uuid import UUID

from app.db import get_cursor
from app.services.compliance_engine import evaluate_pre_trade
from app.services.investment_engine_audit import write_audit


# ─────────────────────────────────────────────────────────────────────────────
# RESULT SHAPE
# ─────────────────────────────────────────────────────────────────────────────

class EngineError(TypedDict):
    code: str
    message: str
    context: dict


class EngineResult(TypedDict):
    valid: bool
    value: Optional[Any]
    errors: list[EngineError]
    input_versions: dict


def _ok(value: Any, input_versions: dict) -> EngineResult:
    return {"valid": True, "value": value, "errors": [], "input_versions": input_versions}


def _fail(errors: list[EngineError], input_versions: dict | None = None) -> EngineResult:
    return {"valid": False, "value": None, "errors": errors,
            "input_versions": input_versions or {}}


def _err(code: str, message: str, **context: Any) -> EngineError:
    return {"code": code, "message": message, "context": context}


# Error codes
ERR_ORDER_NOT_FOUND = "order_not_found"
ERR_INVALID_TRANSITION = "invalid_transition"
ERR_INVALID_INPUT = "invalid_input"
ERR_PRE_TRADE_NOT_EVALUATED = "pre_trade_not_evaluated"
ERR_PRE_TRADE_FAILED = "pre_trade_failed"
ERR_FILL_OVERFILL = "fill_overfill"
ERR_TERMINAL_STATE = "terminal_state"


# Lifecycle constants
TERMINAL_STATES = frozenset({"filled", "cancelled", "rejected"})
NON_TERMINAL = frozenset({"idea", "order", "approved", "routed", "partially_filled"})


def _serialize(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(v) for v in value]
    return value


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_order(cur, env_id: str, order_id: UUID) -> dict | None:
    cur.execute(
        """
        SELECT id, env_id, fund_id, portfolio_id, account_id, security_id,
               side, qty, order_type, limit_price, stop_price, time_in_force,
               status, pre_trade_compliance_state, pre_trade_evaluated_at,
               pre_trade_violation_count, pre_trade_violations,
               routed_to, routed_at, filled_qty, avg_fill_price_native, fill_currency,
               cancelled_at, cancelled_by, cancel_reason,
               rejected_at, reject_reason,
               proposed_by, approved_by, correlation_id
        FROM inv_order
        WHERE env_id = %s AND id = %s
        """,
        (env_id, str(order_id)),
    )
    return cur.fetchone()


def _write_event(
    cur, *, env_id: str, business_id: UUID, order_id: UUID,
    event_type: str, from_status: Optional[str], to_status: Optional[str],
    actor: str, payload: Optional[dict] = None,
    correlation_id: Optional[str] = None,
) -> None:
    cur.execute(
        """
        INSERT INTO inv_order_event (
            env_id, business_id, order_id, event_type, from_status, to_status,
            actor, payload, correlation_id
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (env_id, str(business_id), str(order_id), event_type,
         from_status, to_status, actor,
         json.dumps(_serialize(payload or {})), correlation_id),
    )


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC: lifecycle
# ─────────────────────────────────────────────────────────────────────────────

def create_idea(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    portfolio_id: Optional[UUID],
    account_id: Optional[UUID],
    security_id: UUID,
    side: str,
    qty: Decimal,
    order_type: str = "market",
    limit_price: Optional[Decimal] = None,
    stop_price: Optional[Decimal] = None,
    time_in_force: str = "day",
    proposed_by: str,
    correlation_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> EngineResult:
    """Create an order in 'idea' state."""
    if side not in ("buy", "sell"):
        return _fail([_err(ERR_INVALID_INPUT, "side must be 'buy' or 'sell'", got=side)])
    if qty <= 0:
        return _fail([_err(ERR_INVALID_INPUT, "qty must be > 0", got=str(qty))])
    if order_type == "limit" and limit_price is None:
        return _fail([_err(ERR_INVALID_INPUT, "limit_price required for limit orders")])
    if order_type in ("stop", "stop_limit") and stop_price is None:
        return _fail([_err(ERR_INVALID_INPUT, "stop_price required for stop orders")])

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO inv_order (
                env_id, business_id, fund_id, portfolio_id, account_id, security_id,
                side, qty, order_type, limit_price, stop_price, time_in_force,
                status, proposed_by, correlation_id, metadata
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'idea', %s, %s, %s)
            RETURNING id, status, created_at
            """,
            (env_id, str(business_id), str(fund_id),
             str(portfolio_id) if portfolio_id else None,
             str(account_id) if account_id else None,
             str(security_id), side, str(qty), order_type,
             str(limit_price) if limit_price is not None else None,
             str(stop_price) if stop_price is not None else None,
             time_in_force, proposed_by, correlation_id,
             json.dumps(_serialize(metadata or {}))),
        )
        row = cur.fetchone()
        order_id = row["id"]

        _write_event(cur, env_id=env_id, business_id=business_id, order_id=order_id,
                     event_type="idea_created", from_status=None, to_status="idea",
                     actor=proposed_by, correlation_id=correlation_id,
                     payload={"side": side, "qty": str(qty), "order_type": order_type})
        write_audit(cur, env_id=env_id, business_id=business_id,
                    entity_type="inv_order", entity_id=order_id,
                    change_type="insert",
                    new_state={"id": str(order_id), "status": "idea",
                                "fund_id": str(fund_id), "side": side,
                                "qty": str(qty)},
                    actor=proposed_by, correlation_id=correlation_id)

    return _ok({"order_id": str(order_id), "status": "idea"},
                input_versions={"correlation_id": correlation_id or ""})


def submit_order(
    *, env_id: str, business_id: UUID, order_id: UUID, actor: str,
    correlation_id: Optional[str] = None,
) -> EngineResult:
    """idea → order. No compliance check yet; just promotes from idea."""
    return _transition(
        env_id=env_id, business_id=business_id, order_id=order_id,
        from_status="idea", to_status="order",
        event_type="submitted", actor=actor, correlation_id=correlation_id,
    )


def evaluate_pre_trade_compliance(
    *, env_id: str, business_id: UUID, order_id: UUID,
    as_of_date: date, actor: str, correlation_id: Optional[str] = None,
) -> EngineResult:
    """Run compliance.evaluate_pre_trade against the order; persist result on the order row."""
    with get_cursor() as cur:
        order = _fetch_order(cur, env_id, order_id)
    if not order:
        return _fail([_err(ERR_ORDER_NOT_FOUND, "order not found", order_id=str(order_id))])
    if order["status"] not in ("order", "approved"):
        return _fail([_err(ERR_INVALID_TRANSITION,
                            "evaluate_pre_trade requires status in (order, approved)",
                            current_status=order["status"])])

    proposed = {
        "account_id": str(order["account_id"]) if order["account_id"] else None,
        "security_id": str(order["security_id"]),
        "side": order["side"],
        "qty": str(order["qty"]),
        "price_native": str(order["limit_price"] or "0"),
        "price_currency": "USD",  # caller provides for non-default
    }
    res = evaluate_pre_trade(
        env_id=env_id, fund_id=order["fund_id"],
        proposed_trade=proposed, as_of_date=as_of_date,
    )
    if not res["valid"]:
        return res

    summary = res["value"]["summary"]
    violations = res["value"]["violations"]
    n = summary["violations_total"]
    new_state = "passed" if n == 0 else "failed"

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE inv_order
            SET pre_trade_compliance_state = %s,
                pre_trade_evaluated_at = now(),
                pre_trade_violation_count = %s,
                pre_trade_violations = %s::jsonb
            WHERE env_id = %s AND id = %s
            """,
            (new_state, n,
             json.dumps(_serialize(violations)) if violations else None,
             env_id, str(order_id)),
        )
        _write_event(cur, env_id=env_id, business_id=business_id, order_id=order_id,
                     event_type="pre_trade_evaluated",
                     from_status=order["status"], to_status=order["status"],
                     actor=actor, correlation_id=correlation_id,
                     payload={"violation_count": n, "compliance_state": new_state})
        write_audit(cur, env_id=env_id, business_id=business_id,
                    entity_type="inv_order", entity_id=order_id,
                    change_type="update",
                    previous_state={"pre_trade_compliance_state": order["pre_trade_compliance_state"]},
                    new_state={"pre_trade_compliance_state": new_state,
                                "pre_trade_violation_count": n},
                    actor=actor, correlation_id=correlation_id)

    return _ok({
        "order_id": str(order_id),
        "compliance_state": new_state,
        "violation_count": n,
        "violations": violations,
    }, input_versions={"summary": summary})


def approve_order(
    *, env_id: str, business_id: UUID, order_id: UUID, actor: str,
    override_reason: Optional[str] = None, correlation_id: Optional[str] = None,
) -> EngineResult:
    """order → approved. Requires pre_trade_compliance_state ∈ {passed, overridden}.

    If pre_trade_compliance_state == 'failed' and override_reason is provided,
    the state moves to 'overridden' before approval.
    """
    with get_cursor() as cur:
        order = _fetch_order(cur, env_id, order_id)
    if not order:
        return _fail([_err(ERR_ORDER_NOT_FOUND, "order not found", order_id=str(order_id))])
    if order["status"] != "order":
        return _fail([_err(ERR_INVALID_TRANSITION,
                            "approve requires status='order'",
                            current_status=order["status"])])

    state = order["pre_trade_compliance_state"]
    if state == "not_evaluated":
        return _fail([_err(ERR_PRE_TRADE_NOT_EVALUATED,
                            "pre-trade compliance must be evaluated before approve")])
    if state == "failed" and not override_reason:
        return _fail([_err(ERR_PRE_TRADE_FAILED,
                            "pre-trade compliance failed; provide override_reason to proceed",
                            violation_count=order["pre_trade_violation_count"])])

    new_compliance_state = state
    if state == "failed" and override_reason:
        new_compliance_state = "overridden"

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE inv_order
            SET status = 'approved', approved_by = %s,
                pre_trade_compliance_state = %s
            WHERE env_id = %s AND id = %s
            """,
            (actor, new_compliance_state, env_id, str(order_id)),
        )
        _write_event(cur, env_id=env_id, business_id=business_id, order_id=order_id,
                     event_type="approved", from_status="order", to_status="approved",
                     actor=actor, correlation_id=correlation_id,
                     payload={"compliance_state": new_compliance_state,
                              "override_reason": override_reason})
        write_audit(cur, env_id=env_id, business_id=business_id,
                    entity_type="inv_order", entity_id=order_id,
                    change_type="update",
                    previous_state={"status": "order",
                                    "pre_trade_compliance_state": state},
                    new_state={"status": "approved", "approved_by": actor,
                                "pre_trade_compliance_state": new_compliance_state},
                    actor=actor, reason=override_reason,
                    correlation_id=correlation_id)

    return _ok({"order_id": str(order_id), "status": "approved",
                "compliance_state": new_compliance_state},
                input_versions={})


def route_order(
    *, env_id: str, business_id: UUID, order_id: UUID, routed_to: str,
    actor: str, correlation_id: Optional[str] = None,
    routing_metadata: Optional[dict] = None,
) -> EngineResult:
    """approved → routed."""
    with get_cursor() as cur:
        order = _fetch_order(cur, env_id, order_id)
    if not order:
        return _fail([_err(ERR_ORDER_NOT_FOUND, "order not found")])
    if order["status"] != "approved":
        return _fail([_err(ERR_INVALID_TRANSITION,
                            "route requires status='approved'",
                            current_status=order["status"])])

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE inv_order
            SET status = 'routed', routed_to = %s, routed_at = now(),
                routing_metadata = %s::jsonb
            WHERE env_id = %s AND id = %s
            """,
            (routed_to,
             json.dumps(_serialize(routing_metadata or {})),
             env_id, str(order_id)),
        )
        _write_event(cur, env_id=env_id, business_id=business_id, order_id=order_id,
                     event_type="routed", from_status="approved", to_status="routed",
                     actor=actor, correlation_id=correlation_id,
                     payload={"routed_to": routed_to})
        write_audit(cur, env_id=env_id, business_id=business_id,
                    entity_type="inv_order", entity_id=order_id,
                    change_type="update",
                    previous_state={"status": "approved"},
                    new_state={"status": "routed", "routed_to": routed_to},
                    actor=actor, correlation_id=correlation_id)

    return _ok({"order_id": str(order_id), "status": "routed",
                "routed_to": routed_to},
                input_versions={})


def record_fill(
    *, env_id: str, business_id: UUID, order_id: UUID,
    fill_qty: Decimal, fill_price_native: Decimal, fill_currency: str,
    actor: str, correlation_id: Optional[str] = None,
) -> EngineResult:
    """Record an execution fill. Updates filled_qty + avg_fill_price; transitions
    routed → partially_filled or routed → filled when filled_qty == qty.
    """
    if fill_qty <= 0:
        return _fail([_err(ERR_INVALID_INPUT, "fill_qty must be > 0")])

    with get_cursor() as cur:
        order = _fetch_order(cur, env_id, order_id)
    if not order:
        return _fail([_err(ERR_ORDER_NOT_FOUND, "order not found")])
    if order["status"] not in ("routed", "partially_filled"):
        return _fail([_err(ERR_INVALID_TRANSITION,
                            "record_fill requires status in (routed, partially_filled)",
                            current_status=order["status"])])

    prev_filled = Decimal(str(order["filled_qty"]))
    new_filled = prev_filled + fill_qty
    if new_filled > Decimal(str(order["qty"])):
        return _fail([_err(ERR_FILL_OVERFILL,
                            f"fill would exceed order qty: filled={new_filled}, qty={order['qty']}",
                            order_id=str(order_id))])

    # Volume-weighted average fill price
    if prev_filled == 0:
        new_avg = fill_price_native
    else:
        prev_avg = Decimal(str(order["avg_fill_price_native"] or "0"))
        new_avg = (prev_avg * prev_filled + fill_price_native * fill_qty) / new_filled

    new_status = "filled" if new_filled == Decimal(str(order["qty"])) else "partially_filled"

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE inv_order
            SET filled_qty = %s, avg_fill_price_native = %s,
                fill_currency = %s, status = %s
            WHERE env_id = %s AND id = %s
            """,
            (str(new_filled), str(new_avg), fill_currency, new_status,
             env_id, str(order_id)),
        )
        _write_event(cur, env_id=env_id, business_id=business_id, order_id=order_id,
                     event_type="fill_recorded",
                     from_status=order["status"], to_status=new_status,
                     actor=actor, correlation_id=correlation_id,
                     payload={"fill_qty": str(fill_qty),
                              "fill_price_native": str(fill_price_native),
                              "filled_qty_total": str(new_filled),
                              "avg_fill_price": str(new_avg)})
        write_audit(cur, env_id=env_id, business_id=business_id,
                    entity_type="inv_order", entity_id=order_id,
                    change_type="update",
                    previous_state={"status": order["status"],
                                    "filled_qty": str(prev_filled)},
                    new_state={"status": new_status,
                                "filled_qty": str(new_filled),
                                "avg_fill_price_native": str(new_avg)},
                    actor=actor, correlation_id=correlation_id)

    return _ok({"order_id": str(order_id), "status": new_status,
                "filled_qty": new_filled, "avg_fill_price_native": new_avg,
                "remaining_qty": Decimal(str(order["qty"])) - new_filled},
                input_versions={})


def cancel_order(
    *, env_id: str, business_id: UUID, order_id: UUID, actor: str,
    cancel_reason: Optional[str] = None, correlation_id: Optional[str] = None,
) -> EngineResult:
    """Cancel an order from any non-terminal state."""
    with get_cursor() as cur:
        order = _fetch_order(cur, env_id, order_id)
    if not order:
        return _fail([_err(ERR_ORDER_NOT_FOUND, "order not found")])
    if order["status"] in TERMINAL_STATES:
        return _fail([_err(ERR_TERMINAL_STATE,
                            f"cannot cancel from terminal state {order['status']}",
                            current_status=order["status"])])

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE inv_order
            SET status = 'cancelled', cancelled_at = now(),
                cancelled_by = %s, cancel_reason = %s
            WHERE env_id = %s AND id = %s
            """,
            (actor, cancel_reason, env_id, str(order_id)),
        )
        _write_event(cur, env_id=env_id, business_id=business_id, order_id=order_id,
                     event_type="cancelled",
                     from_status=order["status"], to_status="cancelled",
                     actor=actor, correlation_id=correlation_id,
                     payload={"cancel_reason": cancel_reason})
        write_audit(cur, env_id=env_id, business_id=business_id,
                    entity_type="inv_order", entity_id=order_id,
                    change_type="update",
                    previous_state={"status": order["status"]},
                    new_state={"status": "cancelled"},
                    actor=actor, reason=cancel_reason,
                    correlation_id=correlation_id)

    return _ok({"order_id": str(order_id), "status": "cancelled"},
                input_versions={})


# ─────────────────────────────────────────────────────────────────────────────
# Internal: generic transition (idea → order with no compliance check)
# ─────────────────────────────────────────────────────────────────────────────

def _transition(
    *, env_id: str, business_id: UUID, order_id: UUID,
    from_status: str, to_status: str, event_type: str,
    actor: str, correlation_id: Optional[str] = None,
    payload: Optional[dict] = None,
) -> EngineResult:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, status FROM inv_order WHERE env_id = %s AND id = %s",
            (env_id, str(order_id)),
        )
        row = cur.fetchone()
        if not row:
            return _fail([_err(ERR_ORDER_NOT_FOUND, "order not found")])
        if row["status"] != from_status:
            return _fail([_err(ERR_INVALID_TRANSITION,
                                f"transition requires status={from_status}",
                                current_status=row["status"])])
        cur.execute(
            "UPDATE inv_order SET status = %s WHERE env_id = %s AND id = %s",
            (to_status, env_id, str(order_id)),
        )
        _write_event(cur, env_id=env_id, business_id=business_id, order_id=order_id,
                     event_type=event_type, from_status=from_status, to_status=to_status,
                     actor=actor, correlation_id=correlation_id, payload=payload)
        write_audit(cur, env_id=env_id, business_id=business_id,
                    entity_type="inv_order", entity_id=order_id,
                    change_type="update",
                    previous_state={"status": from_status},
                    new_state={"status": to_status},
                    actor=actor, correlation_id=correlation_id)
    return _ok({"order_id": str(order_id), "status": to_status}, input_versions={})


# ─────────────────────────────────────────────────────────────────────────────
# Read helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_order(*, env_id: str, order_id: UUID) -> EngineResult:
    with get_cursor() as cur:
        order = _fetch_order(cur, env_id, order_id)
    if not order:
        return _fail([_err(ERR_ORDER_NOT_FOUND, "order not found")])
    return _ok(order, input_versions={"order_id": str(order_id)})


def list_order_events(*, env_id: str, order_id: UUID) -> EngineResult:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, event_type, from_status, to_status, actor, payload,
                   correlation_id, created_at
            FROM inv_order_event
            WHERE env_id = %s AND order_id = %s
            ORDER BY created_at
            """,
            (env_id, str(order_id)),
        )
        rows = cur.fetchall()
    return _ok({"order_id": str(order_id), "events": rows, "count": len(rows)},
                input_versions={})
