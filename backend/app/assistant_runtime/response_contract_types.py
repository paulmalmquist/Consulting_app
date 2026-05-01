"""
Types for the Winston response contract.

Kept in a separate module so that type consumers (the eval loop, the runtime,
and the tests) can import cheaply without pulling in the validator body.

The public types:

- EventType         — canonical list of SSE event types Winston may emit
- LifecyclePhase    — FSM states for a turn
- RuntimeIdentity   — {path, lane, contract_version, request_lifecycle_version}
- ViolationRecord   — {category, event_index, severity, detail}
- TurnValidationResult — validator output

Every event type currently in use by the runtime is whitelisted here —
`progress`, `context`, `session`, and `safety` are in active use and must
not be dropped until Phase 3 explicitly deprecates them.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal, TypedDict

CONTRACT_VERSION: str = "v1"
"""Bump when the response contract (event shape, FSM rules, required fields) changes.
Consumers use this to detect unversioned drift."""

REQUEST_LIFECYCLE_VERSION: str = "v1"
"""Bump when `run_request_lifecycle` emission semantics change in a way that
affects the observable event stream — e.g. a new event type is introduced,
or a phase transition is added/removed."""


class EventType(str, Enum):
    """Canonical SSE event types. Whitelist of every event currently emitted
    by the runtime — audit-driven, not aspirational.

    `STATUS`, `TOKEN`, `TOOL_CALL`, `TOOL_RESULT`, `CITATION`, `RESPONSE_BLOCK`,
    `STRUCTURED_RESULT`, `CLARIFICATION_REQUIRED`, `ERROR`, and `DONE` are
    the primary contract events.

    `PROGRESS`, `CONTEXT`, `SESSION`, and `SAFETY` are runtime-only events
    in active use. Kept whitelisted so shadow-mode validation doesn't flag
    them. Phase 3 may propose deprecation.
    """

    STATUS = "status"
    TOKEN = "token"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    CITATION = "citation"
    RESPONSE_BLOCK = "response_block"
    STRUCTURED_RESULT = "structured_result"
    CLARIFICATION_REQUIRED = "clarification_required"
    PROGRESS = "progress"
    CONTEXT = "context"
    SESSION = "session"
    SAFETY = "safety"
    ERROR = "error"
    DONE = "done"


TERMINAL_EVENTS: frozenset[EventType] = frozenset({EventType.DONE, EventType.ERROR})
RUNTIME_ONLY_EVENTS: frozenset[EventType] = frozenset(
    {EventType.SESSION, EventType.SAFETY, EventType.CONTEXT, EventType.PROGRESS}
)


class LifecyclePhase(str, Enum):
    INIT = "init"
    STREAMING = "streaming"
    TOOL = "tool"
    FINALIZING = "finalizing"
    TERMINAL = "terminal"


RuntimePath = Literal["canonical", "fallback", "fast"]


class RuntimeIdentity(TypedDict):
    path: RuntimePath
    lane: str
    contract_version: str
    request_lifecycle_version: str


Severity = Literal["critical", "high", "medium", "warning"]


class ViolationRecord(TypedDict):
    category: str
    event_index: int
    severity: Severity
    detail: dict[str, Any]


class TurnValidationResult(TypedDict):
    valid: bool
    violations: list[ViolationRecord]
    final_state: LifecyclePhase
    response_shape_hash: str
    runtime_identity: RuntimeIdentity | None
    terminal_event: EventType | None


# ── Authoritative runtime failure categories ────────────────────────
# These live in the contract module — the eval loop imports from here.
# `contract_drift_unversioned` is deliberately `warning` in Phase 1;
# Phase 3 upgrades it to `critical` after soak.

RUNTIME_FAILURE_CATEGORIES: tuple[str, ...] = (
    "no_terminal_state",
    "multiple_terminal_states",
    "tokens_after_terminal",
    "fallback_to_lane_f",
    "empty_dashboard_shell",
    "narration_only",
    "raw_id_leakage",
    "unavailable_masquerade",
    "latency_regression",
    "contract_drift_unversioned",
    "clarification_without_done",
    "invalid_event_payload",
    "unknown_event_type",
    "missing_runtime_identity",
    "runtime_path_mismatch",
    "runtime_lane_mismatch",
    "contract_enforced_fallback",
)

RUNTIME_SEVERITY_BY_CATEGORY: dict[str, Severity] = {
    "no_terminal_state": "critical",
    "multiple_terminal_states": "critical",
    "tokens_after_terminal": "critical",
    "fallback_to_lane_f": "high",
    "empty_dashboard_shell": "high",
    "narration_only": "high",
    "raw_id_leakage": "critical",
    "unavailable_masquerade": "critical",
    "latency_regression": "medium",
    "contract_drift_unversioned": "warning",  # Phase 3 → critical
    "clarification_without_done": "high",
    "invalid_event_payload": "high",
    "unknown_event_type": "medium",
    "missing_runtime_identity": "critical",
    "runtime_path_mismatch": "critical",
    "runtime_lane_mismatch": "high",
    "contract_enforced_fallback": "critical",
}

RUNTIME_CRITICAL_CATEGORIES: frozenset[str] = frozenset(
    cat
    for cat, sev in RUNTIME_SEVERITY_BY_CATEGORY.items()
    if sev == "critical"
)


__all__ = [
    "CONTRACT_VERSION",
    "REQUEST_LIFECYCLE_VERSION",
    "EventType",
    "TERMINAL_EVENTS",
    "RUNTIME_ONLY_EVENTS",
    "LifecyclePhase",
    "RuntimePath",
    "RuntimeIdentity",
    "Severity",
    "ViolationRecord",
    "TurnValidationResult",
    "RUNTIME_FAILURE_CATEGORIES",
    "RUNTIME_SEVERITY_BY_CATEGORY",
    "RUNTIME_CRITICAL_CATEGORIES",
]
