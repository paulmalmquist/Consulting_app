"""
Winston response-contract enforcer.

Wraps the SSE async generator from `run_request_lifecycle` and provides two
operating modes, controlled by separate env-var flags:

  shadow mode  (WINSTON_CONTRACT_SHADOW_MODE=1)
    - Yields every upstream line unchanged.
    - Collects events; validates after the stream terminates.
    - Persists one observation row to `ai_contract_observations`.
    - Never modifies, delays, or drops any upstream bytes.

  enforce mode  (WINSTON_CONTRACT_ENFORCE_MODE=1, takes precedence)
    - Validates *before* yielding each event (parse → validate → decide → yield).
    - On a critical inline violation, suppresses the offending event.
    - If no valid terminal has been delivered yet, emits a canonical fallback
      error + done pair so the client always receives a terminal sequence.
    - If a valid terminal was already delivered before the violation, stops
      consuming silently — does not emit a second terminal.
    - Persists the observation with enforced=True.

  disabled  (both flags off — default)
    - Pure passthrough. Zero parsing, zero persistence, zero overhead.

Phase 3a critical violations (inline enforcement):
  - no_terminal_state  (checked after stream ends)
  - tokens_after_terminal  (checked per-event, before yield)
  - multiple_terminal_states / second terminal  (checked per-event, before yield)

Raw-id leakage and unavailable masquerade require full-stream text analysis
and are NOT enforced inline in 3a — they are observed post-stream only.

Fallback error codes (stable):
  MISSING_TERMINAL_EVENT       — stream ended without done/error
  INVALID_RESPONSE_SEQUENCE    — FSM violation (tokens after terminal, second terminal)
  UNRECOVERABLE_STREAM_PARSE_ERROR — upstream raised before any parseable events

Three quarantine layers ensure enforcer failures never kill production traffic:
  1. _parse_sse_line() returns None on any exception — never raises.
  2. _persist_observation() catches and logs all exceptions.
  3. The outer try/finally catches validator/persist/fallback-emit failures.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, AsyncGenerator, AsyncIterable

from app.assistant_runtime.response_contract import (
    CONTRACT_VERSION,
    REQUEST_LIFECYCLE_VERSION,
    RUNTIME_CRITICAL_CATEGORIES,
    TERMINAL_EVENTS,
    EventType,
    LifecyclePhase,
    advance_phase,
    validate_turn,
)

logger = logging.getLogger(__name__)

SHADOW_MODE_ENV = "WINSTON_CONTRACT_SHADOW_MODE"
ENFORCE_MODE_ENV = "WINSTON_CONTRACT_ENFORCE_MODE"
EVENT_SEQUENCE_CAP = 40

# Stable error codes emitted in fallback payloads.
CODE_MISSING_TERMINAL = "MISSING_TERMINAL_EVENT"
CODE_INVALID_SEQUENCE = "INVALID_RESPONSE_SEQUENCE"
CODE_UNRECOVERABLE_PARSE = "UNRECOVERABLE_STREAM_PARSE_ERROR"

STABLE_FALLBACK_CODES = frozenset(
    {CODE_MISSING_TERMINAL, CODE_INVALID_SEQUENCE, CODE_UNRECOVERABLE_PARSE}
)


def shadow_mode_enabled() -> bool:
    return os.environ.get(SHADOW_MODE_ENV, "").strip().lower() in ("1", "true", "yes", "on")


def enforce_mode_enabled() -> bool:
    return os.environ.get(ENFORCE_MODE_ENV, "").strip().lower() in ("1", "true", "yes", "on")


def _resolve_mode(mode: str | None) -> str:
    if mode is not None:
        return mode
    if enforce_mode_enabled():
        return "enforce"
    if shadow_mode_enabled():
        return "shadow"
    return "disabled"


# ─────────────────────────────────────────────────────────────────────
# SSE helpers
# ─────────────────────────────────────────────────────────────────────


def _sse_str(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _parse_sse_line(sse_block: str) -> dict[str, Any] | None:
    """Parse `event: ...\\ndata: ...\\n\\n` into a dict. Returns None on any failure."""
    if not sse_block:
        return None
    try:
        event_name: str | None = None
        data_str: str | None = None
        for raw_line in sse_block.split("\n"):
            line = raw_line.rstrip()
            if not line:
                continue
            if line.startswith("event:"):
                event_name = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data_str = line[len("data:"):].strip()
        if not event_name:
            return None
        data: dict[str, Any] = {}
        if data_str:
            try:
                parsed = json.loads(data_str)
                if isinstance(parsed, dict):
                    data = parsed
            except json.JSONDecodeError:
                pass
        return {"event": event_name, "data": data}
    except Exception:  # noqa: BLE001
        return None


def _coerce_event_type(name: str) -> EventType | None:
    try:
        return EventType(name.lower())
    except (ValueError, AttributeError):
        return None


# ─────────────────────────────────────────────────────────────────────
# Canonical fallback payloads
# ─────────────────────────────────────────────────────────────────────


def _build_fallback_error(
    *, violation_category: str, fallback_code: str, runtime_identity: dict[str, Any] | None
) -> str:
    return _sse_str("error", {
        "type": "contract_enforced_error",
        "code": fallback_code,
        "message": "Winston could not produce a valid response. Please retry.",
        "retryable": True,
        "runtime_identity": runtime_identity or {},
        "contract": {
            "enforced": True,
            "top_category": violation_category,
        },
    })


def _build_fallback_done(
    *, runtime_identity: dict[str, Any] | None, fallback_code: str
) -> str:
    return _sse_str("done", {
        "status": "error",
        "final_state": "contract_enforced_error",
        "runtime_identity": runtime_identity or {},
        "contract": {"enforced": True, "fallback_code": fallback_code},
        "turn_receipt": {},
        "trace": {},
    })


# ─────────────────────────────────────────────────────────────────────
# Persistence
# ─────────────────────────────────────────────────────────────────────


def _persist_observation(
    *,
    events: list[dict[str, Any]],
    verdict: dict[str, Any],
    business_id: str | None,
    env_id: str | None,
    request_id: str | None,
    conversation_id: str | None,
    session_id: str | None,
    mode: str,
    enforced: bool = False,
    enforcement_reason: str | None = None,
    emitted_fallback: bool = False,
    fallback_code: str | None = None,
) -> None:
    """Best-effort write to ai_contract_observations. Swallows all errors."""
    try:
        from app.db import get_cursor

        violations = verdict.get("violations") or []
        critical_count = sum(
            1 for v in violations
            if v.get("severity") == "critical"
            or v.get("category") in RUNTIME_CRITICAL_CATEGORIES
        )
        top_category: str | None = violations[0]["category"] if violations else None
        runtime_identity = verdict.get("runtime_identity") or {}
        final_state = verdict.get("final_state")
        final_state_str = (
            final_state.value if hasattr(final_state, "value") else str(final_state)
        )
        terminal_event = verdict.get("terminal_event")
        terminal_event_str = (
            terminal_event.value if hasattr(terminal_event, "value")
            else (str(terminal_event) if terminal_event else None)
        )
        event_sequence = [
            str(ev.get("event") or ev.get("type") or "")
            for ev in events[:EVENT_SEQUENCE_CAP]
        ]

        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO ai_contract_observations (
                    business_id, env_id,
                    request_id, conversation_id, session_id,
                    contract_version, request_lifecycle_version, mode,
                    valid, terminal_event, final_state,
                    violation_count, critical_violations, top_category, violations,
                    runtime_path, runtime_lane, response_shape_hash,
                    event_count, event_type_sequence,
                    enforced, enforcement_reason, emitted_fallback, fallback_code
                ) VALUES (
                    %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s::jsonb,
                    %s, %s, %s,
                    %s, %s,
                    %s, %s, %s, %s
                )
                """,
                (
                    business_id,
                    env_id,
                    request_id,
                    conversation_id,
                    session_id,
                    CONTRACT_VERSION,
                    REQUEST_LIFECYCLE_VERSION,
                    mode,
                    bool(verdict.get("valid")),
                    terminal_event_str,
                    final_state_str,
                    len(violations),
                    critical_count,
                    top_category,
                    json.dumps(violations, default=str),
                    runtime_identity.get("path") if isinstance(runtime_identity, dict) else None,
                    runtime_identity.get("lane") if isinstance(runtime_identity, dict) else None,
                    verdict.get("response_shape_hash") or "",
                    len(events),
                    event_sequence,
                    enforced,
                    enforcement_reason,
                    emitted_fallback,
                    fallback_code,
                ),
            )
    except Exception:  # noqa: BLE001
        logger.warning("contract_enforcer: failed to persist observation", exc_info=True)


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────


async def wrap_lifecycle_stream(
    upstream: AsyncIterable[str],
    *,
    business_id: str | None = None,
    env_id: str | None = None,
    request_id: str | None = None,
    conversation_id: str | None = None,
    session_id: str | None = None,
    mode: str | None = None,
) -> AsyncGenerator[str, None]:
    """Wrap an SSE async generator with contract validation.

    Mode resolution (highest wins):
      enforce  — inline enforcement; validate-before-yield; suppress violations;
                 emit fallback only if no valid terminal was delivered
      shadow   — observe-only; yield unchanged; persist verdict post-stream
      disabled — pure passthrough; no parsing, no persistence
    """
    resolved_mode = _resolve_mode(mode)

    if resolved_mode == "disabled":
        async for sse_line in upstream:
            yield sse_line
        return

    if resolved_mode == "shadow":
        async for chunk in _shadow_loop(
            upstream=upstream,
            business_id=business_id,
            env_id=env_id,
            request_id=request_id,
            conversation_id=conversation_id,
            session_id=session_id,
        ):
            yield chunk
        return

    # enforce
    async for chunk in _enforce_loop(
        upstream=upstream,
        business_id=business_id,
        env_id=env_id,
        request_id=request_id,
        conversation_id=conversation_id,
        session_id=session_id,
    ):
        yield chunk


async def _shadow_loop(
    upstream: AsyncIterable[str],
    *,
    business_id: str | None,
    env_id: str | None,
    request_id: str | None,
    conversation_id: str | None,
    session_id: str | None,
) -> AsyncGenerator[str, None]:
    """Observation-only: yield every byte unchanged, validate after stream ends."""
    events: list[dict[str, Any]] = []
    try:
        async for sse_line in upstream:
            yield sse_line
            parsed = _parse_sse_line(sse_line)
            if parsed is not None:
                events.append(parsed)
    finally:
        try:
            verdict = validate_turn(events)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: _persist_observation(
                    events=events,
                    verdict=verdict,
                    business_id=business_id,
                    env_id=env_id,
                    request_id=request_id,
                    conversation_id=conversation_id,
                    session_id=session_id,
                    mode="shadow",
                ),
            )
        except Exception:  # noqa: BLE001
            logger.warning("contract_enforcer: shadow verdict/persist failed", exc_info=True)


async def _enforce_loop(
    upstream: AsyncIterable[str],
    *,
    business_id: str | None,
    env_id: str | None,
    request_id: str | None,
    conversation_id: str | None,
    session_id: str | None,
) -> AsyncGenerator[str, None]:
    """Enforcement mode: parse → validate → decide → yield.

    Two distinct outcomes on violation:
      A. No valid terminal yet delivered → emit canonical error + done fallback.
      B. Valid terminal already delivered → suppress the invalid event silently
         (do NOT emit another terminal — the client has one; we cannot un-ring it).

    The second terminal event is suppressed in both cases; it is never yielded.
    """
    events: list[dict[str, Any]] = []
    phase = LifecyclePhase.INIT
    valid_terminal_delivered = False
    enforced = False
    enforcement_reason: str | None = None
    fallback_code: str | None = None
    emitted_fallback = False

    try:
        async for sse_line in upstream:
            parsed = _parse_sse_line(sse_line)

            if parsed is None:
                # Non-parseable chunk: yield as-is (could be a comment line or keepalive).
                yield sse_line
                continue

            event_name = parsed.get("event", "")
            etype = _coerce_event_type(event_name)
            events.append(parsed)

            # ── FSM transition check ──────────────────────────────────
            next_phase, legal = advance_phase(phase, etype) if etype else (phase, True)

            if etype in TERMINAL_EVENTS:
                if valid_terminal_delivered:
                    # Second terminal: suppress it. Case B — valid terminal already sent.
                    enforced = True
                    enforcement_reason = "multiple_terminal_states"
                    fallback_code = CODE_INVALID_SEQUENCE
                    # Do not yield. Stop consuming.
                    break
                # First terminal — yield it, record that a valid terminal was delivered.
                yield sse_line
                valid_terminal_delivered = True
                phase = next_phase
                continue

            if not legal:
                # tokens_after_terminal (phase is TERMINAL): suppress the invalid event.
                # Case B if valid terminal was already delivered (it was, since phase=TERMINAL).
                enforced = True
                enforcement_reason = "tokens_after_terminal"
                fallback_code = CODE_INVALID_SEQUENCE
                # Do not yield. Stop consuming.
                break

            # Safe to deliver this non-terminal event.
            yield sse_line
            phase = next_phase

    finally:
        # After the loop: check for missing terminal.
        if not valid_terminal_delivered and not enforced:
            enforced = True
            enforcement_reason = "no_terminal_state"
            fallback_code = CODE_MISSING_TERMINAL

        # Emit fallback only when no valid terminal has reached the client.
        if enforced and not valid_terminal_delivered:
            try:
                verdict_partial = validate_turn(events)
                runtime_identity = verdict_partial.get("runtime_identity")
            except Exception:  # noqa: BLE001
                runtime_identity = None

            try:
                yield _build_fallback_error(
                    violation_category=enforcement_reason or "unknown",
                    fallback_code=fallback_code or CODE_UNRECOVERABLE_PARSE,
                    runtime_identity=runtime_identity,
                )
                yield _build_fallback_done(
                    runtime_identity=runtime_identity,
                    fallback_code=fallback_code or CODE_UNRECOVERABLE_PARSE,
                )
                emitted_fallback = True
            except Exception:  # noqa: BLE001
                logger.warning("contract_enforcer: failed to emit fallback", exc_info=True)

        # Persist the observation regardless of outcome.
        try:
            verdict = validate_turn(events)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: _persist_observation(
                    events=events,
                    verdict=verdict,
                    business_id=business_id,
                    env_id=env_id,
                    request_id=request_id,
                    conversation_id=conversation_id,
                    session_id=session_id,
                    mode="enforce",
                    enforced=enforced,
                    enforcement_reason=enforcement_reason,
                    emitted_fallback=emitted_fallback,
                    fallback_code=fallback_code,
                ),
            )
        except Exception:  # noqa: BLE001
            logger.warning("contract_enforcer: enforce verdict/persist failed", exc_info=True)


__all__ = [
    "SHADOW_MODE_ENV",
    "ENFORCE_MODE_ENV",
    "STABLE_FALLBACK_CODES",
    "CODE_MISSING_TERMINAL",
    "CODE_INVALID_SEQUENCE",
    "CODE_UNRECOVERABLE_PARSE",
    "shadow_mode_enabled",
    "enforce_mode_enabled",
    "wrap_lifecycle_stream",
    "_parse_sse_line",
    "_build_fallback_error",
    "_build_fallback_done",
]
