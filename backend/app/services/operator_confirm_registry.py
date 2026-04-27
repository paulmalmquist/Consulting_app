"""Durable pending-confirmation registry for the Operator runtime.

The Operator (Anthropic Managed Agent) runtime emits `requires_action` stops
that pause the session until the user approves or denies each pending tool call.
While the user thinks, the worker thread that owns the synchronous
`run_session_turn` loop is blocked on an `asyncio.Event`. The mapping from
`(anthropic_session_id, tool_call_id)` to the decision lives both in-memory
(the events themselves) and in the database (`operator_pending_confirmations`),
so:

  * Multiple confirmations can be in flight per session without cross-wiring.
  * A backend restart does not silently drop a pending confirmation — the
    `/confirm` endpoint resolves the row in DB; on next bootstrap, expired or
    aborted rows are reconciled by `sweep_expired`.
  * The user's decision can survive (and be authoritative for) the worker
    thread that issued the request.

Lookups are scoped by `business_id` at the route layer to ensure cross-tenant
isolation.
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PendingConfirmation:
    pending_id: str
    anthropic_session_id: str
    tool_call_id: str
    conversation_id: str
    business_id: str
    env_id: str | None
    tool_name: str
    tool_input: dict[str, Any]
    status: str
    decision_reason: str | None
    decided_by: str | None
    expires_at: datetime


@dataclass
class _LiveSlot:
    """In-process handoff slot for a worker thread waiting on a decision."""
    event: asyncio.Event
    decision: dict[str, Any] | None  # populated when /confirm or sweep resolves
    loop: asyncio.AbstractEventLoop


# (anthropic_session_id, tool_call_id) -> _LiveSlot
_LIVE: dict[tuple[str, str], _LiveSlot] = {}
_LIVE_LOCK = asyncio.Lock()


def _row_to_pending(row: dict[str, Any]) -> PendingConfirmation:
    raw_input = row.get("tool_input")
    if isinstance(raw_input, str):
        with suppress(json.JSONDecodeError):
            raw_input = json.loads(raw_input)
    return PendingConfirmation(
        pending_id=str(row["pending_id"]),
        anthropic_session_id=row["anthropic_session_id"],
        tool_call_id=row["tool_call_id"],
        conversation_id=str(row["conversation_id"]),
        business_id=str(row["business_id"]),
        env_id=str(row["env_id"]) if row.get("env_id") else None,
        tool_name=row["tool_name"],
        tool_input=raw_input if isinstance(raw_input, dict) else {},
        status=row["status"],
        decision_reason=row.get("decision_reason"),
        decided_by=row.get("decided_by"),
        expires_at=row["expires_at"],
    )


def register(
    *,
    anthropic_session_id: str,
    tool_call_id: str,
    conversation_id: UUID | str,
    business_id: UUID | str,
    env_id: UUID | str | None,
    tool_name: str,
    tool_input: dict[str, Any],
) -> PendingConfirmation:
    """Persist an awaiting confirmation. Idempotent per (session_id, tool_call_id)."""
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO operator_pending_confirmations (
                   anthropic_session_id, tool_call_id, conversation_id,
                   business_id, env_id, tool_name, tool_input
               ) VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (anthropic_session_id, tool_call_id) DO UPDATE
                   SET tool_input = EXCLUDED.tool_input,
                       tool_name  = EXCLUDED.tool_name
               RETURNING pending_id, anthropic_session_id, tool_call_id, conversation_id,
                         business_id, env_id, tool_name, tool_input, status,
                         decision_reason, decided_by, expires_at""",
            (
                anthropic_session_id,
                tool_call_id,
                str(conversation_id),
                str(business_id),
                str(env_id) if env_id else None,
                tool_name,
                json.dumps(tool_input),
            ),
        )
        return _row_to_pending(cur.fetchone() or {})


def get(*, anthropic_session_id: str, tool_call_id: str) -> PendingConfirmation | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT pending_id, anthropic_session_id, tool_call_id, conversation_id,
                      business_id, env_id, tool_name, tool_input, status,
                      decision_reason, decided_by, expires_at
               FROM operator_pending_confirmations
               WHERE anthropic_session_id = %s AND tool_call_id = %s""",
            (anthropic_session_id, tool_call_id),
        )
        row = cur.fetchone()
        return _row_to_pending(row) if row else None


def list_for_session(*, anthropic_session_id: str) -> list[PendingConfirmation]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT pending_id, anthropic_session_id, tool_call_id, conversation_id,
                      business_id, env_id, tool_name, tool_input, status,
                      decision_reason, decided_by, expires_at
               FROM operator_pending_confirmations
               WHERE anthropic_session_id = %s
               ORDER BY created_at ASC""",
            (anthropic_session_id,),
        )
        return [_row_to_pending(r) for r in cur.fetchall()]


def _resolve_in_db(
    *,
    anthropic_session_id: str,
    tool_call_id: str,
    new_status: str,
    decided_by: str | None,
    decision_reason: str | None,
) -> PendingConfirmation | None:
    """Atomically flip status from 'awaiting' to one of the terminal states."""
    with get_cursor() as cur:
        cur.execute(
            """UPDATE operator_pending_confirmations
               SET status = %s,
                   decided_by = COALESCE(decided_by, %s),
                   decision_reason = COALESCE(decision_reason, %s),
                   decided_at = now()
               WHERE anthropic_session_id = %s AND tool_call_id = %s
                 AND status = 'awaiting'
               RETURNING pending_id, anthropic_session_id, tool_call_id, conversation_id,
                         business_id, env_id, tool_name, tool_input, status,
                         decision_reason, decided_by, expires_at""",
            (
                new_status,
                decided_by,
                decision_reason,
                anthropic_session_id,
                tool_call_id,
            ),
        )
        row = cur.fetchone()
        return _row_to_pending(row) if row else None


async def acquire_slot(
    *,
    anthropic_session_id: str,
    tool_call_id: str,
) -> _LiveSlot:
    """Reserve an in-memory wait slot for the worker thread.

    Must be called from the asyncio loop that owns the request. The returned
    slot's .event will be set when /confirm or the sweep task resolves the
    pending row.
    """
    key = (anthropic_session_id, tool_call_id)
    async with _LIVE_LOCK:
        slot = _LIVE.get(key)
        if slot is None:
            slot = _LiveSlot(
                event=asyncio.Event(),
                decision=None,
                loop=asyncio.get_running_loop(),
            )
            _LIVE[key] = slot
        return slot


def _release_slot(anthropic_session_id: str, tool_call_id: str) -> None:
    _LIVE.pop((anthropic_session_id, tool_call_id), None)


def _signal_slot(
    anthropic_session_id: str,
    tool_call_id: str,
    decision: dict[str, Any],
) -> None:
    """Signal the in-memory slot (if present) from any thread."""
    key = (anthropic_session_id, tool_call_id)
    slot = _LIVE.get(key)
    if slot is None:
        return
    slot.decision = decision

    def _set() -> None:
        slot.event.set()

    try:
        slot.loop.call_soon_threadsafe(_set)
    except RuntimeError:
        # Loop is closed — nothing to wake. The sweep task will handle restart recovery.
        logger.warning(
            "Confirmation slot loop closed before signal: session=%s tool_call=%s",
            anthropic_session_id,
            tool_call_id,
        )


def resolve(
    *,
    anthropic_session_id: str,
    tool_call_id: str,
    result: str,
    deny_message: str | None,
    decided_by: str | None,
) -> PendingConfirmation | None:
    """Persist a user decision and signal the worker thread.

    `result` must be 'allow' or 'deny'. Returns the post-update row, or None
    if the row was missing or not in 'awaiting' state.
    """
    if result not in ("allow", "deny"):
        raise ValueError(f"resolve: invalid result {result!r}")
    new_status = "allowed" if result == "allow" else "denied"
    pending = _resolve_in_db(
        anthropic_session_id=anthropic_session_id,
        tool_call_id=tool_call_id,
        new_status=new_status,
        decided_by=decided_by,
        decision_reason=deny_message,
    )
    if pending is None:
        return None
    _signal_slot(
        anthropic_session_id,
        tool_call_id,
        {"result": result, "deny_message": deny_message, "status": new_status},
    )
    return pending


def abort(
    *,
    anthropic_session_id: str,
    tool_call_id: str,
    reason: str = "session_aborted",
) -> PendingConfirmation | None:
    """Mark a pending confirmation as aborted (e.g. session error, restart)."""
    pending = _resolve_in_db(
        anthropic_session_id=anthropic_session_id,
        tool_call_id=tool_call_id,
        new_status="aborted",
        decided_by="system",
        decision_reason=reason,
    )
    if pending is None:
        return None
    _signal_slot(
        anthropic_session_id,
        tool_call_id,
        {"result": "deny", "deny_message": reason, "status": "aborted"},
    )
    return pending


def cleanup_slot(*, anthropic_session_id: str, tool_call_id: str) -> None:
    """Drop the in-memory slot once the worker has consumed the decision."""
    _release_slot(anthropic_session_id, tool_call_id)


# ── Background sweep ─────────────────────────────────────────────────


async def sweep_expired() -> int:
    """Mark all `awaiting` rows past `expires_at` as `expired` and signal slots.

    Returns the count of rows expired in this pass.
    """
    expired_rows: list[dict[str, Any]] = []
    with get_cursor() as cur:
        cur.execute(
            """UPDATE operator_pending_confirmations
               SET status = 'expired',
                   decision_reason = COALESCE(decision_reason, 'expired_by_sweep'),
                   decided_by = COALESCE(decided_by, 'system'),
                   decided_at = now()
               WHERE status = 'awaiting' AND expires_at < now()
               RETURNING anthropic_session_id, tool_call_id""",
        )
        expired_rows = cur.fetchall() or []

    for row in expired_rows:
        _signal_slot(
            row["anthropic_session_id"],
            row["tool_call_id"],
            {"result": "deny", "deny_message": "expired_by_sweep", "status": "expired"},
        )
    if expired_rows:
        logger.info("operator_confirm_registry: expired %d pending row(s)", len(expired_rows))
    return len(expired_rows)


async def run_sweep_loop(*, interval_seconds: int = 30) -> None:
    """Background task: sweep expired confirmations forever. Cancellation-safe."""
    logger.info("operator_confirm_registry: sweep loop started (interval=%ds)", interval_seconds)
    try:
        while True:
            try:
                await sweep_expired()
            except Exception:  # noqa: BLE001 — sweep must not die
                logger.exception("operator_confirm_registry: sweep iteration failed")
            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        logger.info("operator_confirm_registry: sweep loop cancelled")
        raise


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
