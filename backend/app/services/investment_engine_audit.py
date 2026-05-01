"""Investment Engine: audit hook helpers.

Centralizes the contract for writing inv_audit_log rows. Every mutating path
in the investment engine MUST call write_audit() in the same transaction as
its data mutation. Append-only is enforced at the DB layer (trigger
inv_block_append_only on inv_audit_log) — these helpers exist so callers
get the contract right by default.

Per skills/winston-investment-engine-module audit contract:
- entity_type, entity_id required
- change_type ∈ {insert, update, delete, release, supersede, void, lock}
- previous_state jsonb (None on insert)
- new_state jsonb (None on delete)
- actor required
- correlation_id optional but recommended
- env_id, business_id always

Usage:

    from app.services.investment_engine_audit import write_audit
    from app.db import get_cursor

    with get_cursor() as cur:
        cur.execute("INSERT INTO inv_nav_snapshot (...) VALUES (...) RETURNING id, ...",
                    (...))
        row = cur.fetchone()
        write_audit(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="nav_snapshot",
            entity_id=row["id"],
            change_type="insert",
            new_state=row,
            actor="accounting_engine.produce_nav_snapshot",
            correlation_id=correlation_id,
        )
"""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable
from uuid import UUID

VALID_CHANGE_TYPES = frozenset({
    "insert", "update", "delete", "release", "supersede", "void", "lock",
})


def _serialize(value: Any) -> Any:
    """JSON-safe serialization for audit payloads.

    psycopg returns Decimal, datetime, date, UUID — none JSON-serializable
    by default. This helper recurses through dicts/lists and converts.
    """
    if value is None:
        return None
    if isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(v) for v in value]
    # Fallback: stringify unknown types
    return str(value)


def write_audit(
    cur: Any,
    *,
    env_id: str,
    business_id: UUID | str,
    entity_type: str,
    entity_id: UUID | str,
    change_type: str,
    previous_state: dict | None = None,
    new_state: dict | None = None,
    actor: str,
    reason: str | None = None,
    correlation_id: str | None = None,
) -> None:
    """Write a single audit row using the caller's cursor (same transaction).

    Raises ValueError if change_type is not in the allowed set, or if both
    previous_state and new_state are None for a non-noop change_type.

    Does not commit — that's the caller's responsibility. By design: the
    caller's mutation and this audit row land or fail together.
    """
    if change_type not in VALID_CHANGE_TYPES:
        raise ValueError(
            f"invalid change_type={change_type!r}; must be one of {sorted(VALID_CHANGE_TYPES)}"
        )
    if not entity_type:
        raise ValueError("entity_type is required")
    if not actor:
        raise ValueError("actor is required")

    # An insert MUST have new_state. A delete MUST have previous_state.
    # Other change_types should have at least one populated.
    if change_type == "insert" and new_state is None:
        raise ValueError("change_type='insert' requires new_state")
    if change_type == "delete" and previous_state is None:
        raise ValueError("change_type='delete' requires previous_state")
    if change_type in ("update", "release", "supersede", "void", "lock"):
        if previous_state is None and new_state is None:
            raise ValueError(
                f"change_type={change_type!r} requires at least one of "
                f"previous_state or new_state"
            )

    cur.execute(
        """
        INSERT INTO inv_audit_log (
            env_id, business_id, entity_type, entity_id, change_type,
            previous_state, new_state, actor, reason, correlation_id
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            env_id,
            str(business_id),
            entity_type,
            str(entity_id),
            change_type,
            json.dumps(_serialize(previous_state)) if previous_state is not None else None,
            json.dumps(_serialize(new_state)) if new_state is not None else None,
            actor,
            reason,
            correlation_id,
        ),
    )


def write_audit_batch(
    cur: Any,
    rows: Iterable[dict],
    *,
    env_id: str,
    business_id: UUID | str,
    actor: str,
    correlation_id: str | None = None,
) -> int:
    """Write multiple audit rows in one cursor (same transaction).

    Each row dict must contain: entity_type, entity_id, change_type, plus
    optional previous_state / new_state / reason. Returns the number of
    rows written.
    """
    n = 0
    for r in rows:
        write_audit(
            cur,
            env_id=env_id,
            business_id=business_id,
            entity_type=r["entity_type"],
            entity_id=r["entity_id"],
            change_type=r["change_type"],
            previous_state=r.get("previous_state"),
            new_state=r.get("new_state"),
            actor=actor,
            reason=r.get("reason"),
            correlation_id=correlation_id,
        )
        n += 1
    return n


def write_mutation_event(
    cur: Any,
    *,
    env_id: str,
    business_id: UUID | str,
    entity_type: str,
    entity_id: UUID | str,
    event_type: str,
    payload: dict | None = None,
    correlation_id: str | None = None,
) -> None:
    """Write an inv_mutation_event row (lighter than audit_log, for state
    machine transitions). Same-transaction; append-only enforced at DB.
    """
    cur.execute(
        """
        INSERT INTO inv_mutation_event (
            env_id, business_id, entity_type, entity_id, event_type,
            payload, correlation_id
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            env_id,
            str(business_id),
            entity_type,
            str(entity_id),
            event_type,
            json.dumps(_serialize(payload)) if payload is not None else "{}",
            correlation_id,
        ),
    )
