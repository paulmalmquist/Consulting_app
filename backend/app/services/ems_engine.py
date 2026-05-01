"""Investment Engine: Execution Management System (EMS) — Wave 2B.

Per-execution detail and per-account allocations. Sits between OMS (which
tracks the order in aggregate) and the position layer (which sees each
account's lots).

Functions:
    record_execution(order_id, ...)   — write a fill from broker; updates the
                                         order's filled_qty via oms_engine.record_fill
    allocate_execution(execution_id, allocations) — split an execution across
                                                    multiple accounts on a weighted basis
    pro_rata_allocate(execution_id, weights)      — convenience: derive allocations
                                                    from {account_id: weight} dict
    update_settlement_state(execution_id, new_state, reason?) — pending → settled | failed | cancelled
    get_execution, list_executions_for_order, list_allocations

Per ADR 002: amounts in native currency; translation happens at consumer time.
Per the snapshot pattern: executions are not snapshotted (they're transactional
inputs that feed valuations/NAV).

Pure compute helper: split_qty_by_weights — testable in isolation.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional, TypedDict
from uuid import UUID

from app.db import get_cursor
from app.services.investment_engine_audit import write_audit
from app.services import oms_engine


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
ERR_EXECUTION_NOT_FOUND = "execution_not_found"
ERR_ORDER_NOT_FOUND = "order_not_found"
ERR_INVALID_INPUT = "invalid_input"
ERR_INVALID_TRANSITION = "invalid_transition"
ERR_OVER_ALLOCATION = "over_allocation"
ERR_WEIGHTS_INVALID = "weights_invalid"


VALID_SETTLEMENT_TRANSITIONS = {
    "pending": frozenset({"settled", "failed", "cancelled"}),
    "settled": frozenset(),  # terminal
    "failed": frozenset(),    # terminal
    "cancelled": frozenset(),  # terminal
}


def _serialize(v: Any) -> Any:
    if v is None: return None
    if isinstance(v, Decimal): return str(v)
    if isinstance(v, (date, datetime)): return v.isoformat()
    if isinstance(v, UUID): return str(v)
    if isinstance(v, dict): return {k: _serialize(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)): return [_serialize(x) for x in v]
    return v


# ─────────────────────────────────────────────────────────────────────────────
# PURE COMPUTE — testable in isolation
# ─────────────────────────────────────────────────────────────────────────────

def split_qty_by_weights(
    *, total_qty: Decimal, weights: dict[str, Decimal],
) -> dict[str, Decimal]:
    """Split a total qty across keys by weight.

    Weights are normalized to sum to 1.0 internally. Returns a dict mapping
    each key to its allocated qty.

    Edge case: with N keys and a total that doesn't divide evenly, the last
    key absorbs the rounding remainder so the sum equals total_qty exactly.

    Pure function. Raises ValueError on empty weights or non-positive total.
    """
    if total_qty <= 0:
        raise ValueError(f"total_qty must be > 0; got {total_qty}")
    if not weights:
        raise ValueError("weights must be non-empty")
    if any(w <= 0 for w in weights.values()):
        raise ValueError("all weights must be > 0")

    total_w = sum(weights.values(), Decimal(0))
    keys = list(weights.keys())
    out: dict[str, Decimal] = {}
    running = Decimal(0)
    for k in keys[:-1]:
        share = (weights[k] / total_w) * total_qty
        # Quantize to schema precision (8 decimals) to avoid drift
        share = share.quantize(Decimal("0.00000001"))
        out[k] = share
        running += share
    # Last key absorbs the remainder
    out[keys[-1]] = total_qty - running
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Execution recording
# ─────────────────────────────────────────────────────────────────────────────

def record_execution(
    *,
    env_id: str,
    business_id: UUID,
    order_id: UUID,
    qty: Decimal,
    price_native: Decimal,
    price_currency: str,
    broker: str,
    venue: Optional[str] = None,
    external_exec_id: Optional[str] = None,
    fee_native: Decimal = Decimal("0"),
    fee_currency: Optional[str] = None,
    executed_at: Optional[datetime] = None,
    actor: str = "ems",
    correlation_id: Optional[str] = None,
    update_order_fill: bool = True,
) -> EngineResult:
    """Record a broker execution and (optionally) update the order's filled_qty.

    When `update_order_fill=True`, this calls oms_engine.record_fill with the
    same qty/price so the order row stays consistent. Set False when allocation
    happens before order-level fill rollup (rare; default is True).
    """
    if qty <= 0:
        return _fail([_err(ERR_INVALID_INPUT, "qty must be > 0")])
    if price_native < 0:
        return _fail([_err(ERR_INVALID_INPUT, "price_native must be >= 0")])

    executed_at = executed_at or datetime.now()

    with get_cursor() as cur:
        cur.execute(
            "SELECT id, status, qty FROM inv_order WHERE env_id = %s AND id = %s",
            (env_id, str(order_id)),
        )
        order = cur.fetchone()
    if not order:
        return _fail([_err(ERR_ORDER_NOT_FOUND, "order not found",
                            order_id=str(order_id))])
    if order["status"] not in ("routed", "partially_filled"):
        return _fail([_err(ERR_INVALID_TRANSITION,
                            "execution requires order status in (routed, partially_filled)",
                            current_status=order["status"])])

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO inv_execution (
                env_id, business_id, order_id, broker, venue, external_exec_id,
                qty, price_native, price_currency, fee_native, fee_currency,
                executed_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (env_id, str(business_id), str(order_id), broker, venue, external_exec_id,
             str(qty), str(price_native), price_currency,
             str(fee_native), fee_currency, executed_at),
        )
        execution_id = cur.fetchone()["id"]
        write_audit(
            cur, env_id=env_id, business_id=business_id,
            entity_type="inv_execution", entity_id=execution_id,
            change_type="insert",
            new_state={"id": str(execution_id), "order_id": str(order_id),
                        "broker": broker, "qty": str(qty),
                        "price_native": str(price_native),
                        "settlement_state": "pending"},
            actor=actor, correlation_id=correlation_id,
        )

    # Roll up to the order — this transitions the order to partially_filled or filled
    if update_order_fill:
        roll = oms_engine.record_fill(
            env_id=env_id, business_id=business_id, order_id=order_id,
            fill_qty=qty, fill_price_native=price_native,
            fill_currency=price_currency,
            actor=actor, correlation_id=correlation_id,
        )
        if not roll["valid"]:
            return roll  # the order-level update failed; surface its errors

    return _ok({
        "execution_id": str(execution_id),
        "order_id": str(order_id),
        "qty": qty,
        "price_native": price_native,
        "settlement_state": "pending",
    }, input_versions={"order": str(order_id)})


# ─────────────────────────────────────────────────────────────────────────────
# Allocation
# ─────────────────────────────────────────────────────────────────────────────

def allocate_execution(
    *,
    env_id: str,
    business_id: UUID,
    execution_id: UUID,
    allocations: list[dict],   # [{"account_id": str, "qty": Decimal}]
    actor: str = "ems",
    correlation_id: Optional[str] = None,
) -> EngineResult:
    """Split an execution across accounts. Each allocation row enforces the
    overdraw guard via DB trigger.

    allocations: list of {account_id, qty}. Sum must equal execution.qty exactly.
    """
    if not allocations:
        return _fail([_err(ERR_INVALID_INPUT, "allocations must be non-empty")])

    with get_cursor() as cur:
        cur.execute(
            "SELECT id, qty, fee_native FROM inv_execution WHERE env_id = %s AND id = %s",
            (env_id, str(execution_id)),
        )
        execution = cur.fetchone()
    if not execution:
        return _fail([_err(ERR_EXECUTION_NOT_FOUND, "execution not found",
                            execution_id=str(execution_id))])

    exec_qty = Decimal(str(execution["qty"]))
    fee_total = Decimal(str(execution["fee_native"] or "0"))
    total_alloc = sum((Decimal(str(a["qty"])) for a in allocations), Decimal(0))

    if total_alloc != exec_qty:
        return _fail([_err(ERR_OVER_ALLOCATION,
                            "sum of allocations must equal execution.qty exactly",
                            exec_qty=str(exec_qty),
                            sum_allocations=str(total_alloc))])

    # Validate per-account: qty > 0, account exists in same env
    inserted: list[dict] = []
    with get_cursor() as cur:
        for a in allocations:
            qty = Decimal(str(a["qty"]))
            account_id = a["account_id"]
            if qty <= 0:
                return _fail([_err(ERR_INVALID_INPUT, "allocation qty must be > 0",
                                    account_id=str(account_id))])
            pct = (qty / exec_qty).quantize(Decimal("0.0000000001"))
            fee_share = (fee_total * pct).quantize(Decimal("0.00000001")) if fee_total else Decimal("0")
            cur.execute(
                """
                INSERT INTO inv_allocation (
                    env_id, business_id, execution_id, account_id,
                    allocated_qty, allocated_pct, fee_share_native
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (env_id, str(business_id), str(execution_id), str(account_id),
                 str(qty), str(pct), str(fee_share)),
            )
            alloc_id = cur.fetchone()["id"]
            inserted.append({
                "allocation_id": str(alloc_id),
                "account_id": str(account_id),
                "qty": qty, "pct": pct, "fee_share": fee_share,
            })
            write_audit(
                cur, env_id=env_id, business_id=business_id,
                entity_type="inv_allocation", entity_id=alloc_id,
                change_type="insert",
                new_state={"id": str(alloc_id),
                            "execution_id": str(execution_id),
                            "account_id": str(account_id),
                            "allocated_qty": str(qty),
                            "allocated_pct": str(pct)},
                actor=actor, correlation_id=correlation_id,
            )

    return _ok({
        "execution_id": str(execution_id),
        "allocation_count": len(inserted),
        "allocations": inserted,
    }, input_versions={"execution": str(execution_id)})


def pro_rata_allocate(
    *, env_id: str, business_id: UUID, execution_id: UUID,
    weights: dict[UUID, Decimal],
    actor: str = "ems", correlation_id: Optional[str] = None,
) -> EngineResult:
    """Convenience: split an execution's qty across accounts proportional to weights."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT qty FROM inv_execution WHERE env_id = %s AND id = %s",
            (env_id, str(execution_id)),
        )
        execution = cur.fetchone()
    if not execution:
        return _fail([_err(ERR_EXECUTION_NOT_FOUND, "execution not found")])

    try:
        # Convert UUID keys to strings for split_qty_by_weights
        weights_str = {str(k): v for k, v in weights.items()}
        splits = split_qty_by_weights(
            total_qty=Decimal(str(execution["qty"])),
            weights=weights_str,
        )
    except ValueError as e:
        return _fail([_err(ERR_WEIGHTS_INVALID, str(e))])

    allocations = [{"account_id": k, "qty": v} for k, v in splits.items()]
    return allocate_execution(
        env_id=env_id, business_id=business_id, execution_id=execution_id,
        allocations=allocations, actor=actor, correlation_id=correlation_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Settlement
# ─────────────────────────────────────────────────────────────────────────────

def update_settlement_state(
    *, env_id: str, business_id: UUID, execution_id: UUID,
    new_state: str, settlement_date: Optional[date] = None,
    failure_reason: Optional[str] = None,
    actor: str = "ems", correlation_id: Optional[str] = None,
) -> EngineResult:
    if new_state not in ("settled", "failed", "cancelled"):
        return _fail([_err(ERR_INVALID_INPUT,
                            "new_state must be settled | failed | cancelled",
                            got=new_state)])
    if new_state == "failed" and not failure_reason:
        return _fail([_err(ERR_INVALID_INPUT,
                            "failed state requires failure_reason")])

    with get_cursor() as cur:
        cur.execute(
            "SELECT settlement_state FROM inv_execution WHERE env_id = %s AND id = %s",
            (env_id, str(execution_id)),
        )
        row = cur.fetchone()
    if not row:
        return _fail([_err(ERR_EXECUTION_NOT_FOUND, "execution not found")])

    current = row["settlement_state"]
    if new_state not in VALID_SETTLEMENT_TRANSITIONS.get(current, frozenset()):
        return _fail([_err(ERR_INVALID_TRANSITION,
                            f"cannot transition from {current} to {new_state}",
                            current_state=current)])

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE inv_execution
            SET settlement_state = %s,
                settlement_date = COALESCE(%s, settlement_date),
                settled_at = CASE WHEN %s = 'settled' THEN now() ELSE settled_at END,
                failure_reason = %s
            WHERE env_id = %s AND id = %s
            """,
            (new_state, settlement_date, new_state, failure_reason,
             env_id, str(execution_id)),
        )
        write_audit(
            cur, env_id=env_id, business_id=business_id,
            entity_type="inv_execution", entity_id=execution_id,
            change_type="update",
            previous_state={"settlement_state": current},
            new_state={"settlement_state": new_state,
                        "failure_reason": failure_reason},
            actor=actor, reason=failure_reason,
            correlation_id=correlation_id,
        )

    return _ok({
        "execution_id": str(execution_id),
        "settlement_state": new_state,
    }, input_versions={})


# ─────────────────────────────────────────────────────────────────────────────
# Read helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_execution(*, env_id: str, execution_id: UUID) -> EngineResult:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, order_id, broker, venue, external_exec_id,
                   qty, price_native, price_currency,
                   fee_native, fee_currency, executed_at,
                   settlement_state, settlement_date, settled_at, failure_reason
            FROM inv_execution
            WHERE env_id = %s AND id = %s
            """,
            (env_id, str(execution_id)),
        )
        row = cur.fetchone()
    if not row:
        return _fail([_err(ERR_EXECUTION_NOT_FOUND, "execution not found")])
    return _ok(row, input_versions={"execution": str(execution_id)})


def list_executions_for_order(*, env_id: str, order_id: UUID) -> EngineResult:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, broker, qty, price_native, fee_native,
                   settlement_state, executed_at
            FROM inv_execution
            WHERE env_id = %s AND order_id = %s
            ORDER BY executed_at
            """,
            (env_id, str(order_id)),
        )
        rows = cur.fetchall()
    return _ok({"order_id": str(order_id), "executions": rows, "count": len(rows)},
                input_versions={})


def list_allocations(*, env_id: str, execution_id: UUID) -> EngineResult:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, account_id, allocated_qty, allocated_pct, fee_share_native
            FROM inv_allocation
            WHERE env_id = %s AND execution_id = %s
            ORDER BY allocated_qty DESC
            """,
            (env_id, str(execution_id)),
        )
        rows = cur.fetchall()
    return _ok({"execution_id": str(execution_id), "allocations": rows, "count": len(rows)},
                input_versions={})
