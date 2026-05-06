"""
Failure taxonomy for the Winston autonomous eval loop.

The 7+ runtime-contract categories (no_terminal_state, fallback_to_lane_f,
empty_dashboard_shell, narration_only, raw_id_leakage, unavailable_masquerade,
latency_regression, contract_drift_unversioned, ...) are OWNED by the shared
backend contract module:

    backend/app/assistant_runtime/response_contract_types.py

This file merges those with the eval-loop's pre-existing legacy categories
(context_failure, routing_failure, lane_failure, retrieval_contamination,
tool_policy_failure, etc.) and exposes the union plus merged severity +
critical-category tables.

If you need to adjust the severity of a runtime-contract category, edit
the backend module — NOT this file. If you need to add a purely eval-side
category (a failure mode that doesn't correspond to a runtime-observable
contract violation), add it to `_LEGACY_*` below.
"""
from __future__ import annotations

from typing import Any


# ── Legacy eval-only categories ──────────────────────────────────────
# These are scoring/comparison failures the eval harness detects that
# aren't first-class contract violations (e.g., retrieval quality, tool
# policy choices). Keep in eval land.
_LEGACY_CATEGORIES: tuple[str, ...] = (
    "context_failure",
    "routing_failure",
    "lane_failure",
    "retrieval_failure",
    "retrieval_contamination",
    "tool_policy_failure",
    "tool_execution_failure",
    "degraded_mode_failure",
    "rendering_failure",
    "operator_unavailable",
    "performance_failure",
    "regression_failure",
    # Concept-eval (PR 3+) hard-fail categories. Only `wrong_concept_id`
    # is actively emitted by PR 3 scorers; the rest are pre-registered
    # for PR 4 hard-fail scenarios (S13/S15/S16/S17).
    "wrong_concept_id",
    "hallucinated_number",
    "mixed_basis",
    "stale_primary_source",
    "conflict_ignored",
)

_LEGACY_SEVERITY: dict[str, str] = {
    "context_failure": "high",
    "routing_failure": "medium",
    "lane_failure": "medium",
    "retrieval_failure": "high",
    "retrieval_contamination": "critical",
    "tool_policy_failure": "critical",
    "tool_execution_failure": "high",
    "degraded_mode_failure": "high",
    "rendering_failure": "high",
    "operator_unavailable": "high",
    "performance_failure": "medium",
    "regression_failure": "high",
    "wrong_concept_id": "critical",
    "hallucinated_number": "critical",
    "mixed_basis": "critical",
    "stale_primary_source": "critical",
    "conflict_ignored": "critical",
}

_LEGACY_CRITICAL: set[str] = {
    "context_failure",
    "retrieval_contamination",
    "tool_policy_failure",
    "degraded_mode_failure",
    "rendering_failure",
    "operator_unavailable",
    "wrong_concept_id",
    "hallucinated_number",
    "mixed_basis",
    "stale_primary_source",
    "conflict_ignored",
}


# ── Load runtime-contract categories from the shared module ──────────


def _load_runtime_categories() -> tuple[tuple[str, ...], dict[str, str], set[str]]:
    """Lazy import — the backend `app` package may not be on sys.path at
    module load time (runner.bootstrap_backend_imports happens at main()).

    Falls back to an inline-defined mirror of the 7 canonical categories
    if the backend isn't importable, so this module always produces a
    valid FAILURE_CATEGORIES superset.
    """
    try:
        from app.assistant_runtime.response_contract_types import (
            RUNTIME_CRITICAL_CATEGORIES,
            RUNTIME_FAILURE_CATEGORIES,
            RUNTIME_SEVERITY_BY_CATEGORY,
        )
        return (
            tuple(RUNTIME_FAILURE_CATEGORIES),
            dict(RUNTIME_SEVERITY_BY_CATEGORY),
            set(RUNTIME_CRITICAL_CATEGORIES),
        )
    except ImportError:
        # Inline mirror — must stay aligned with response_contract_types.py.
        # If either drifts, the backend module is authoritative and this is
        # a bug in the mirror.
        runtime = (
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
        severity = {
            "no_terminal_state": "critical",
            "multiple_terminal_states": "critical",
            "tokens_after_terminal": "critical",
            "fallback_to_lane_f": "high",
            "empty_dashboard_shell": "high",
            "narration_only": "high",
            "raw_id_leakage": "critical",
            "unavailable_masquerade": "critical",
            "latency_regression": "medium",
            "contract_drift_unversioned": "warning",
            "clarification_without_done": "high",
            "invalid_event_payload": "high",
            "unknown_event_type": "medium",
            "missing_runtime_identity": "critical",
            "runtime_path_mismatch": "critical",
            "runtime_lane_mismatch": "high",
            "contract_enforced_fallback": "critical",
        }
        critical = {cat for cat, sev in severity.items() if sev == "critical"}
        return runtime, severity, critical


_RUNTIME_CATEGORIES, _RUNTIME_SEVERITY, _RUNTIME_CRITICAL = _load_runtime_categories()


# ── Public union ─────────────────────────────────────────────────────

def _dedupe(*groups: tuple[str, ...]) -> tuple[str, ...]:
    seen: dict[str, None] = {}
    for group in groups:
        for cat in group:
            seen.setdefault(cat, None)
    return tuple(seen.keys())


FAILURE_CATEGORIES: tuple[str, ...] = _dedupe(_RUNTIME_CATEGORIES, _LEGACY_CATEGORIES)
FAILURE_PRIORITY: list[str] = list(FAILURE_CATEGORIES)

SEVERITY_BY_CATEGORY: dict[str, str] = {**_LEGACY_SEVERITY, **_RUNTIME_SEVERITY}

CRITICAL_CATEGORIES: set[str] = _LEGACY_CRITICAL | _RUNTIME_CRITICAL


# ── Public helpers (unchanged API) ───────────────────────────────────


def primary_failure_category(mismatches: list[dict[str, Any]]) -> str | None:
    if not mismatches:
        return None
    categories = {m.get("category") for m in mismatches if m.get("category")}
    for category in FAILURE_PRIORITY:
        if category in categories:
            return category
    return next((m.get("category") for m in mismatches if m.get("category")), None)


def severity_for(category: str | None) -> str:
    if not category:
        return "low"
    return SEVERITY_BY_CATEGORY.get(category, "medium")


def is_critical_failure(category: str | None) -> bool:
    return bool(category in CRITICAL_CATEGORIES)


def normalize_failure(
    *,
    scenario_id: str,
    request_id: str | None,
    category: str,
    evidence: dict[str, Any],
    suspected_files: list[dict[str, Any]] | None = None,
    newly_introduced: bool = False,
) -> dict[str, Any]:
    return {
        "scenario_id": scenario_id,
        "request_id": request_id,
        "category": category,
        "severity": severity_for(category),
        "newly_introduced": newly_introduced,
        "evidence": evidence,
        "suspected_files": suspected_files or [],
    }


__all__ = [
    "FAILURE_CATEGORIES",
    "FAILURE_PRIORITY",
    "SEVERITY_BY_CATEGORY",
    "CRITICAL_CATEGORIES",
    "primary_failure_category",
    "severity_for",
    "is_critical_failure",
    "normalize_failure",
]
