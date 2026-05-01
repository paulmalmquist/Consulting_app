"""
Winston Response Contract — single source of truth.

This module owns the definition of "valid Winston turn." Both the runtime
(backend/app/assistant_runtime/request_lifecycle.py) and the eval loop
(eval_loop/**) import from here.

What it owns:

  - Event type whitelist (`EventType`)
  - Lifecycle FSM rules (`advance_phase`, `legal_next_events`)
  - Payload validators per event type (`validate_event_payload`)
  - Final-state validator for a full turn (`validate_turn`)
  - Runtime identity assembly (`build_runtime_identity`)
  - Response shape hashing (`response_shape_hash`)
  - Drift detection (`detect_contract_drift`)
  - Authoritative runtime failure categories (imported from _types)

Design rules:

  - `error` is itself terminal. The transport treats it as end-of-stream.
    We do NOT require `error` → `done` pairing. (Matches current runtime
    behavior; see request_lifecycle.py:858 and :1748.)
  - Tokens ARE legal after `structured_result`. The meridian structured
    executor path streams tokens after the structured payload. An FSM
    rule against this would flag canonical behavior as invalid.
  - Runtime-only events (`progress`, `context`, `session`, `safety`) are
    whitelisted. They are in active use by the current runtime.
  - Phase 1 is observation-only. The runtime does NOT yet consume the
    FSM or the validator; only `build_runtime_identity` is wired in.
    Phase 2 wraps `run_request_lifecycle` with a validating generator.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable

from app.assistant_runtime.response_contract_types import (
    CONTRACT_VERSION,
    REQUEST_LIFECYCLE_VERSION,
    RUNTIME_FAILURE_CATEGORIES,
    RUNTIME_SEVERITY_BY_CATEGORY,
    RUNTIME_CRITICAL_CATEGORIES,
    TERMINAL_EVENTS,
    EventType,
    LifecyclePhase,
    RuntimeIdentity,
    RuntimePath,
    Severity,
    TurnValidationResult,
    ViolationRecord,
)

# ─────────────────────────────────────────────────────────────────────
# Regex + phrase tables for payload-level heuristics.
# ─────────────────────────────────────────────────────────────────────

_UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)

_UNAVAILABLE_PHRASES: tuple[str, ...] = (
    "no response from winston",
    "winston is unavailable",
    "something went wrong",
    "an error occurred",
    "i couldn't process",
    "i was unable to",
)

CANONICAL_LANES: frozenset[str] = frozenset({"A_FAST", "B_LOOKUP", "C_ANALYSIS"})
"""Lane strings considered canonical for runtime-identity mapping.
Matches the full turn_receipt.lane.value form. `_build_trace` in
request_lifecycle.py emits only the first letter — callers that pass
us the short form still classify correctly via `_short_lane_map`."""

_SHORT_LANE_MAP: dict[str, str] = {
    "A": "A_FAST",
    "B": "B_LOOKUP",
    "C": "C_ANALYSIS",
    "F": "F",
}


# ─────────────────────────────────────────────────────────────────────
# Event coercion helpers.
# The runtime stores events as {"event": name, "data": payload} dicts
# after going through SSE parsing. Different callers may use "type"
# instead of "event"; we accept both.
# ─────────────────────────────────────────────────────────────────────


def _coerce_event_type(raw: Any) -> EventType | None:
    if isinstance(raw, EventType):
        return raw
    if not isinstance(raw, str):
        return None
    try:
        return EventType(raw.lower())
    except ValueError:
        return None


def _event_name(event: dict[str, Any]) -> str:
    return str(event.get("event") or event.get("type") or "")


def _event_data(event: dict[str, Any]) -> dict[str, Any]:
    data = event.get("data")
    if isinstance(data, dict):
        return data
    # Some upstream parsers flatten the envelope — treat the whole event
    # as the data dict when no explicit `data` key.
    return {k: v for k, v in event.items() if k not in ("event", "type")}


# ─────────────────────────────────────────────────────────────────────
# Payload validators per event type. Permissive in Phase 1 — we only
# fire `invalid_event_payload` for clearly broken shapes (wrong type
# on a required field), not for merely-unexpected-but-harmless keys.
# ─────────────────────────────────────────────────────────────────────


def _violation(
    *,
    category: str,
    event_index: int,
    detail: dict[str, Any],
    severity: Severity | None = None,
) -> ViolationRecord:
    return {
        "category": category,
        "event_index": event_index,
        "severity": severity or RUNTIME_SEVERITY_BY_CATEGORY.get(category, "medium"),
        "detail": detail,
    }


def validate_event_payload(
    event_type: EventType, data: dict[str, Any], *, event_index: int = -1
) -> list[ViolationRecord]:
    """Per-event payload validator. Returns a list of violations (possibly empty).

    Checks required keys and basic types. Deliberately tolerant — the goal
    is to catch broken shapes, not to lock down every optional field.
    """
    violations: list[ViolationRecord] = []

    def require(key: str, typ: type | tuple[type, ...]) -> None:
        if key not in data:
            violations.append(
                _violation(
                    category="invalid_event_payload",
                    event_index=event_index,
                    detail={"event": event_type.value, "missing_key": key},
                )
            )
            return
        if not isinstance(data[key], typ):
            violations.append(
                _violation(
                    category="invalid_event_payload",
                    event_index=event_index,
                    detail={
                        "event": event_type.value,
                        "key": key,
                        "expected_type": typ.__name__ if isinstance(typ, type) else [t.__name__ for t in typ],
                        "actual_type": type(data[key]).__name__,
                    },
                )
            )

    if event_type == EventType.TOKEN:
        require("text", str)
    elif event_type == EventType.STATUS:
        # `status` events carry a message string in practice; other keys
        # (stage, progress) are optional.
        if "message" in data and not isinstance(data["message"], str):
            violations.append(
                _violation(
                    category="invalid_event_payload",
                    event_index=event_index,
                    detail={"event": "status", "key": "message", "actual_type": type(data["message"]).__name__},
                )
            )
    elif event_type == EventType.ERROR:
        require("message", str)
    elif event_type == EventType.DONE:
        # `done` MUST include turn_receipt + trace; blocks/scope may be empty.
        require("turn_receipt", dict)
        require("trace", dict)
    elif event_type == EventType.RESPONSE_BLOCK:
        require("block", dict)
    elif event_type == EventType.STRUCTURED_RESULT:
        # Must have a result_type; either a `card` or `data` payload.
        require("result_type", str)
        if "card" not in data and "data" not in data:
            violations.append(
                _violation(
                    category="invalid_event_payload",
                    event_index=event_index,
                    detail={"event": "structured_result", "missing_key": "card_or_data"},
                )
            )
    elif event_type == EventType.TOOL_CALL:
        require("tool_name", str)
    elif event_type == EventType.TOOL_RESULT:
        require("tool_name", str)
    # STATUS / PROGRESS / CONTEXT / SESSION / SAFETY / CITATION / CLARIFICATION_REQUIRED
    # have loose shapes today; we do not validate further in Phase 1.

    return violations


# ─────────────────────────────────────────────────────────────────────
# Lifecycle FSM.
#
# Rules:
#   INIT     → STREAMING | TOOL | FINALIZING | TERMINAL
#   STREAMING → STREAMING | TOOL | FINALIZING | TERMINAL
#   TOOL     → TOOL | STREAMING | FINALIZING | TERMINAL
#   FINALIZING → TERMINAL
#   TERMINAL → ∅  (no events permitted after)
#
# Event → destination phase hints:
#   status / progress / context / session / safety → same phase (or INIT→STREAMING)
#   token                                         → STREAMING (legal after structured_result)
#   tool_call / tool_result                       → TOOL
#   response_block / structured_result / citation → STREAMING or FINALIZING
#   clarification_required                        → FINALIZING (MUST be followed by done)
#   error, done                                   → TERMINAL
# ─────────────────────────────────────────────────────────────────────


_ALLOWED_TRANSITIONS: dict[LifecyclePhase, frozenset[LifecyclePhase]] = {
    LifecyclePhase.INIT: frozenset(
        {LifecyclePhase.INIT, LifecyclePhase.STREAMING, LifecyclePhase.TOOL,
         LifecyclePhase.FINALIZING, LifecyclePhase.TERMINAL}
    ),
    LifecyclePhase.STREAMING: frozenset(
        {LifecyclePhase.STREAMING, LifecyclePhase.TOOL,
         LifecyclePhase.FINALIZING, LifecyclePhase.TERMINAL}
    ),
    LifecyclePhase.TOOL: frozenset(
        {LifecyclePhase.TOOL, LifecyclePhase.STREAMING,
         LifecyclePhase.FINALIZING, LifecyclePhase.TERMINAL}
    ),
    LifecyclePhase.FINALIZING: frozenset(
        {LifecyclePhase.FINALIZING, LifecyclePhase.TERMINAL}
    ),
    LifecyclePhase.TERMINAL: frozenset(),
}


def advance_phase(
    current: LifecyclePhase, event_type: EventType
) -> tuple[LifecyclePhase, bool]:
    """Compute the next phase after an event.

    Returns `(next_phase, legal)`. `legal=False` means the event was
    observed in an illegal phase — the caller should record a
    `tokens_after_terminal` or similar violation. We still return a
    best-effort next phase so the FSM doesn't get stuck.
    """
    if event_type in TERMINAL_EVENTS:
        if current == LifecyclePhase.TERMINAL:
            # Double-terminal: caller should emit multiple_terminal_states.
            return LifecyclePhase.TERMINAL, False
        return LifecyclePhase.TERMINAL, True

    if current == LifecyclePhase.TERMINAL:
        # Any non-terminal event after terminal is illegal.
        return LifecyclePhase.TERMINAL, False

    if event_type == EventType.CLARIFICATION_REQUIRED:
        return LifecyclePhase.FINALIZING, True

    if event_type in (EventType.TOOL_CALL, EventType.TOOL_RESULT):
        return LifecyclePhase.TOOL, True

    if event_type in (EventType.TOKEN, EventType.RESPONSE_BLOCK,
                      EventType.STRUCTURED_RESULT, EventType.CITATION):
        # Once finalizing, stay finalizing (blocks/results may still appear
        # after clarification_required). Otherwise move to STREAMING.
        if current == LifecyclePhase.FINALIZING:
            return LifecyclePhase.FINALIZING, True
        return LifecyclePhase.STREAMING, True

    # status / progress / context / session / safety — keep current phase,
    # but bump INIT to STREAMING on any non-init signal.
    if current == LifecyclePhase.INIT:
        return LifecyclePhase.STREAMING, True
    return current, True


# ─────────────────────────────────────────────────────────────────────
# Runtime identity.
# ─────────────────────────────────────────────────────────────────────


def build_runtime_identity(
    *, lane: str | None, execution_path: str | None
) -> RuntimeIdentity:
    """Assemble `runtime_identity` for stamping onto `done.trace`.

    `lane` may be in short-letter form (the form emitted by
    request_lifecycle._build_trace) or full form. Both are accepted.
    """
    normalized_lane = _normalize_lane(lane)
    path = _classify_runtime_path(normalized_lane=normalized_lane, execution_path=execution_path)
    return {
        "path": path,
        "lane": normalized_lane,
        "contract_version": CONTRACT_VERSION,
        "request_lifecycle_version": REQUEST_LIFECYCLE_VERSION,
    }


def _normalize_lane(lane: str | None) -> str:
    if not lane:
        return "unknown"
    lane_str = str(lane).strip()
    if not lane_str:
        return "unknown"
    upper = lane_str.upper()
    # Short letter form from _build_trace.
    if len(upper) == 1 and upper in _SHORT_LANE_MAP:
        return _SHORT_LANE_MAP[upper]
    # Full form (e.g., "A_FAST") or unknown.
    return upper


def _classify_runtime_path(
    *, normalized_lane: str, execution_path: str | None
) -> RuntimePath:
    if normalized_lane == "F":
        return "fallback"
    path = (execution_path or "").strip().lower()
    if path.startswith("fast_") or path.startswith("meridian_structured"):
        return "fast"
    return "canonical"


# ─────────────────────────────────────────────────────────────────────
# Response shape hash.
#
# Canonical implementation — both regression_store._response_shape_hash
# and postgres_sink._response_shape_hash re-export this after refactor.
# ─────────────────────────────────────────────────────────────────────


def response_shape_hash(
    events: Iterable[dict[str, Any]] | None,
    response_blocks: Iterable[dict[str, Any]] | None = None,
) -> str:
    """Stable 16-hex-char hash of the response shape (event type sequence +
    response-block type list). Semantically identical streams hash the same;
    any structural change produces a different hash."""
    event_types: list[str] = []
    for ev in events or []:
        if isinstance(ev, dict):
            event_types.append(_event_name(ev))
    block_types: list[str] = []
    for blk in response_blocks or []:
        if isinstance(blk, dict):
            block_types.append(str(blk.get("type") or ""))
    payload = json.dumps({"events": event_types, "blocks": block_types}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def detect_contract_drift(
    *,
    current_shape_hash: str,
    current_contract_version: str,
    baseline: dict[str, Any] | None,
) -> ViolationRecord | None:
    """Flag `contract_drift_unversioned` when shape changed but the
    contract version wasn't bumped along with it.

    Phase 1 severity = `warning` (consumer should log; not a hard fail).
    Phase 3 upgrades to `critical`.
    """
    if not baseline:
        return None
    baseline_hash = baseline.get("last_pass_response_shape_hash")
    baseline_version = baseline.get("contract_version") or CONTRACT_VERSION
    if not baseline_hash or baseline_hash == current_shape_hash:
        return None
    if current_contract_version != baseline_version:
        return None  # intentional versioned change
    return _violation(
        category="contract_drift_unversioned",
        event_index=-1,
        detail={
            "baseline_shape_hash": baseline_hash,
            "current_shape_hash": current_shape_hash,
            "contract_version": current_contract_version,
        },
    )


# ─────────────────────────────────────────────────────────────────────
# Whole-turn validator.
#
# This is the single function both the runtime (Phase 2) and the eval
# loop (right now) call to get a verdict on a completed event stream.
# ─────────────────────────────────────────────────────────────────────


def _event_types_of(events: Iterable[dict[str, Any]]) -> list[EventType | None]:
    return [_coerce_event_type(_event_name(ev)) for ev in events]


def _extract_response_text(events: Iterable[dict[str, Any]]) -> str:
    """Concatenate every `token.text` seen in the stream, plus the
    first `done.turn_receipt.response_text` if the runtime emitted one.
    Used by unavailable_masquerade and raw_id_leakage detection."""
    parts: list[str] = []
    for ev in events:
        etype = _coerce_event_type(_event_name(ev))
        data = _event_data(ev)
        if etype == EventType.TOKEN:
            text = data.get("text")
            if isinstance(text, str):
                parts.append(text)
        elif etype == EventType.DONE:
            receipt = data.get("turn_receipt") or {}
            rendered = receipt.get("response_text") if isinstance(receipt, dict) else None
            if isinstance(rendered, str):
                parts.append(rendered)
    return "".join(parts)


def _done_event_data(events: Iterable[dict[str, Any]]) -> dict[str, Any] | None:
    for ev in events:
        if _coerce_event_type(_event_name(ev)) == EventType.DONE:
            return _event_data(ev)
    return None


def _observed_lane_and_path(events: Iterable[dict[str, Any]]) -> tuple[str | None, str | None]:
    done = _done_event_data(events)
    if not done:
        return None, None
    trace = done.get("trace") or {}
    if not isinstance(trace, dict):
        return None, None
    lane = trace.get("lane")
    execution_path = trace.get("execution_path")
    return (str(lane) if lane else None), (str(execution_path) if execution_path else None)


def _dashboard_widgets(events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    widgets: list[dict[str, Any]] = []
    for ev in events:
        if _coerce_event_type(_event_name(ev)) != EventType.STRUCTURED_RESULT:
            continue
        data = _event_data(ev)
        if data.get("result_type") in ("dynamic_dashboard", "dashboard_spec"):
            card = data.get("card") or data.get("data") or {}
            if isinstance(card, dict):
                widgets.extend(card.get("widgets") or [])
    return widgets


def _widget_is_empty(widget: dict[str, Any]) -> bool:
    data = widget.get("data")
    if data is None:
        return True
    if isinstance(data, (list, tuple)) and len(data) == 0:
        return True
    if isinstance(data, dict) and not data:
        return True
    if isinstance(data, dict):
        vals = data.get("metrics") or data.get("values") or []
        if isinstance(vals, list) and vals and all(
            (v.get("value") in (None, "") for v in vals if isinstance(v, dict))
        ):
            return True
    return False


def _has_structured_output(events: Iterable[dict[str, Any]]) -> bool:
    for ev in events:
        etype = _coerce_event_type(_event_name(ev))
        if etype in (EventType.STRUCTURED_RESULT, EventType.RESPONSE_BLOCK):
            return True
    return False


def _has_tokens(events: Iterable[dict[str, Any]]) -> bool:
    return any(_coerce_event_type(_event_name(ev)) == EventType.TOKEN for ev in events)


def _expected_runtime_paths(expectations: dict[str, Any]) -> set[str]:
    allowed = expectations.get("allowed_runtime_paths")
    if isinstance(allowed, list):
        return {str(path) for path in allowed if path}
    expected = (
        expectations.get("runtime_path")
        or expectations.get("expected_runtime_path")
        or expectations.get("runtime_identity_path")
    )
    return {str(expected)} if expected else set()


def _expected_runtime_lanes(expectations: dict[str, Any]) -> set[str]:
    lane = expectations.get("lane")
    if lane:
        return {_normalize_lane(str(lane))}
    allowed_lanes = expectations.get("allowed_lanes")
    if isinstance(allowed_lanes, list):
        return {_normalize_lane(str(item)) for item in allowed_lanes if item}
    return set()


def _requires_runtime_identity(expectations: dict[str, Any]) -> bool:
    return bool(
        expectations.get("runtime_identity_required")
        or _expected_runtime_paths(expectations)
        or _expected_runtime_lanes(expectations)
    )


def validate_turn(
    events: list[dict[str, Any]],
    *,
    scenario_expectations: dict[str, Any] | None = None,
    baseline: dict[str, Any] | None = None,
    latency_regression_multiplier: float = 2.0,
) -> TurnValidationResult:
    """Validate a completed event stream.

    Called from the eval loop today. Phase 2 adds a runtime wrapper that
    calls this after the generator terminates and records violations to
    `ai_gateway_logs.contract_violations`.

    `scenario_expectations` is the eval case's `expected` dict. When called
    from the runtime (Phase 2), it will be None — only contract-level rules
    fire then.
    """
    violations: list[ViolationRecord] = []
    expectations = scenario_expectations or {}

    # 1. Drive the FSM and validate payloads.
    phase = LifecyclePhase.INIT
    terminal_event: EventType | None = None
    terminal_count = 0
    saw_clarification = False
    for idx, ev in enumerate(events):
        etype = _coerce_event_type(_event_name(ev))
        if etype is None:
            violations.append(
                _violation(
                    category="unknown_event_type",
                    event_index=idx,
                    detail={"name": _event_name(ev)},
                )
            )
            continue

        # Per-event payload validation.
        violations.extend(validate_event_payload(etype, _event_data(ev), event_index=idx))

        # FSM transition.
        next_phase, legal = advance_phase(phase, etype)
        if not legal:
            if etype in TERMINAL_EVENTS:
                violations.append(
                    _violation(
                        category="multiple_terminal_states",
                        event_index=idx,
                        detail={"event": etype.value, "prior_terminal": terminal_event.value if terminal_event else None},
                    )
                )
            else:
                violations.append(
                    _violation(
                        category="tokens_after_terminal",
                        event_index=idx,
                        detail={"event": etype.value},
                    )
                )
        phase = next_phase

        if etype in TERMINAL_EVENTS:
            terminal_count += 1
            if terminal_event is None:
                terminal_event = etype
        if etype == EventType.CLARIFICATION_REQUIRED:
            saw_clarification = True

    # 2. No terminal state.
    if terminal_count == 0:
        violations.append(
            _violation(
                category="no_terminal_state",
                event_index=-1,
                detail={"event_count": len(events), "last_5_events": [_event_name(e) for e in events[-5:]]},
            )
        )

    # 3. clarification_required must be followed by done (not error).
    if saw_clarification and terminal_event != EventType.DONE:
        violations.append(
            _violation(
                category="clarification_without_done",
                event_index=-1,
                detail={"terminal_event": terminal_event.value if terminal_event else None},
            )
        )

    # 4. Unavailable masquerade — visible response text is an unavailable phrase.
    for idx, ev in enumerate(events):
        data = _event_data(ev)
        contract = data.get("contract") if isinstance(data, dict) else None
        if (
            data.get("type") == "contract_enforced_error"
            or (isinstance(contract, dict) and contract.get("enforced") is True)
        ):
            violations.append(
                _violation(
                    category="contract_enforced_fallback",
                    event_index=idx,
                    detail={
                        "event": _event_name(ev),
                        "code": data.get("code") or (contract or {}).get("fallback_code"),
                    },
                )
            )
            break

    response_text = _extract_response_text(events)
    lower = response_text.lower()
    for phrase in _UNAVAILABLE_PHRASES:
        if phrase in lower:
            violations.append(
                _violation(
                    category="unavailable_masquerade",
                    event_index=-1,
                    detail={"phrase": phrase, "excerpt": response_text[:240]},
                )
            )
            break

    # 5. Raw ID leakage — bare UUIDs in user-visible response text.
    uuid_hits = _UUID_RE.findall(response_text)
    if uuid_hits:
        violations.append(
            _violation(
                category="raw_id_leakage",
                event_index=-1,
                detail={"count": len(uuid_hits), "sample": uuid_hits[:3]},
            )
        )

    # 6. Fallback to Lane F — case expected canonical, observed F.
    observed_lane_raw, execution_path = _observed_lane_and_path(events)
    normalized_observed = _normalize_lane(observed_lane_raw)
    expected_lane_raw = expectations.get("lane")
    normalized_expected = _normalize_lane(str(expected_lane_raw)) if expected_lane_raw else None
    if normalized_observed == "F" and normalized_expected in CANONICAL_LANES:
        violations.append(
            _violation(
                category="fallback_to_lane_f",
                event_index=-1,
                detail={"expected_lane": normalized_expected, "observed_lane": "F"},
            )
        )

    # 7. Empty dashboard shell.
    widgets = _dashboard_widgets(events)
    if widgets and all(_widget_is_empty(w) for w in widgets):
        violations.append(
            _violation(
                category="empty_dashboard_shell",
                event_index=-1,
                detail={"widget_count": len(widgets), "widget_types": [w.get("type") for w in widgets]},
            )
        )

    # 8. Narration-only (case expected structured; tokens streamed; no structured output).
    expects_structured = bool(
        expectations.get("response_blocks")
        or expectations.get("structured_result")
        or expectations.get("must_emit_structured")
    )
    if expects_structured and _has_tokens(events) and not _has_structured_output(events):
        violations.append(
            _violation(
                category="narration_only",
                event_index=-1,
                detail={"text_length": len(response_text)},
            )
        )

    # 9. Latency regression vs baseline.
    if baseline:
        baseline_latency = baseline.get("last_pass_latency_ms")
        done_data = _done_event_data(events) or {}
        trace = done_data.get("trace") if isinstance(done_data, dict) else None
        current_latency: int | None = None
        if isinstance(trace, dict):
            current_latency = trace.get("elapsed_ms")
        if baseline_latency and current_latency:
            threshold = baseline_latency * latency_regression_multiplier
            if current_latency > threshold:
                violations.append(
                    _violation(
                        category="latency_regression",
                        event_index=-1,
                        detail={
                            "baseline_ms": baseline_latency,
                            "current_ms": current_latency,
                            "threshold_ms": int(threshold),
                            "multiplier": latency_regression_multiplier,
                        },
                    )
                )

    # 10. Shape-drift detection.
    shape_hash = response_shape_hash(events, _collect_response_blocks(events))
    drift = detect_contract_drift(
        current_shape_hash=shape_hash,
        current_contract_version=CONTRACT_VERSION,
        baseline=baseline,
    )
    if drift:
        violations.append(drift)

    # Runtime identity — read from the stream or synthesize from observed lane.
    runtime_identity: RuntimeIdentity | None = None
    done_data = _done_event_data(events)
    stamped_identity_present = False
    if done_data:
        trace = done_data.get("trace") or {}
        if isinstance(trace, dict) and isinstance(trace.get("runtime_identity"), dict):
            stamped_identity_present = True
            stamped = trace["runtime_identity"]
            # Trust the runtime's stamp when present; this is the authoritative value.
            try:
                runtime_identity = {
                    "path": stamped.get("path") or _classify_runtime_path(
                        normalized_lane=normalized_observed, execution_path=execution_path
                    ),
                    "lane": stamped.get("lane") or normalized_observed,
                    "contract_version": stamped.get("contract_version") or CONTRACT_VERSION,
                    "request_lifecycle_version": stamped.get("request_lifecycle_version") or REQUEST_LIFECYCLE_VERSION,
                }
            except Exception:  # noqa: BLE001
                runtime_identity = None
        if runtime_identity is None:
            runtime_identity = build_runtime_identity(
                lane=normalized_observed, execution_path=execution_path
            )

    if _requires_runtime_identity(expectations):
        if not stamped_identity_present:
            violations.append(
                _violation(
                    category="missing_runtime_identity",
                    event_index=-1,
                    detail={
                        "terminal_event": terminal_event.value if terminal_event else None,
                    },
                )
            )

        expected_paths = _expected_runtime_paths(expectations)
        if runtime_identity and expected_paths and runtime_identity["path"] not in expected_paths:
            violations.append(
                _violation(
                    category="runtime_path_mismatch",
                    event_index=-1,
                    detail={
                        "expected": sorted(expected_paths),
                        "actual": runtime_identity["path"],
                    },
                )
            )

        expected_lanes = _expected_runtime_lanes(expectations)
        if runtime_identity and expected_lanes and runtime_identity["lane"] not in expected_lanes:
            violations.append(
                _violation(
                    category="runtime_lane_mismatch",
                    event_index=-1,
                    detail={
                        "expected": sorted(expected_lanes),
                        "actual": runtime_identity["lane"],
                    },
                )
            )

    valid = all(
        v["severity"] != "critical" and v["category"] not in RUNTIME_CRITICAL_CATEGORIES
        for v in violations
    )
    return {
        "valid": valid,
        "violations": violations,
        "final_state": phase,
        "response_shape_hash": shape_hash,
        "runtime_identity": runtime_identity,
        "terminal_event": terminal_event,
    }


def _collect_response_blocks(events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for ev in events:
        etype = _coerce_event_type(_event_name(ev))
        data = _event_data(ev)
        if etype == EventType.RESPONSE_BLOCK:
            block = data.get("block")
            if isinstance(block, dict):
                blocks.append(block)
        elif etype == EventType.DONE:
            for block in data.get("response_blocks") or []:
                if isinstance(block, dict):
                    blocks.append(block)
    return blocks


__all__ = [
    # Re-exports from _types
    "CONTRACT_VERSION",
    "REQUEST_LIFECYCLE_VERSION",
    "EventType",
    "LifecyclePhase",
    "RuntimeIdentity",
    "RuntimePath",
    "Severity",
    "TurnValidationResult",
    "ViolationRecord",
    "RUNTIME_FAILURE_CATEGORIES",
    "RUNTIME_SEVERITY_BY_CATEGORY",
    "RUNTIME_CRITICAL_CATEGORIES",
    "TERMINAL_EVENTS",
    # Public API
    "CANONICAL_LANES",
    "advance_phase",
    "build_runtime_identity",
    "detect_contract_drift",
    "response_shape_hash",
    "validate_event_payload",
    "validate_turn",
]
