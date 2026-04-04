from __future__ import annotations

from typing import Any


FAILURE_CATEGORIES = (
    "context_failure",
    "routing_failure",
    "lane_failure",
    "retrieval_failure",
    "retrieval_contamination",
    "tool_policy_failure",
    "tool_execution_failure",
    "degraded_mode_failure",
    "rendering_failure",
    "performance_failure",
    "regression_failure",
)

FAILURE_PRIORITY = list(FAILURE_CATEGORIES)

SEVERITY_BY_CATEGORY: dict[str, str] = {
    "context_failure": "high",
    "routing_failure": "medium",
    "lane_failure": "medium",
    "retrieval_failure": "high",
    "retrieval_contamination": "critical",
    "tool_policy_failure": "critical",
    "tool_execution_failure": "high",
    "degraded_mode_failure": "high",
    "rendering_failure": "high",
    "performance_failure": "medium",
    "regression_failure": "high",
}

CRITICAL_CATEGORIES = {
    "context_failure",
    "retrieval_contamination",
    "tool_policy_failure",
    "degraded_mode_failure",
    "rendering_failure",
}


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

