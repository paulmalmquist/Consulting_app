from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from eval_loop.environment_matrix import EnvironmentBinding


def evaluate_scenario_contamination(
    *,
    scenario: dict[str, Any],
    result: dict[str, Any],
    bindings: dict[str, EnvironmentBinding],
) -> dict[str, Any]:
    receipt = result.get("turn_receipt") or {}
    context = receipt.get("context") or {}
    trace = result.get("trace") or {}
    response_text = (result.get("response_text") or "").lower()
    expected_environment = scenario.get("environment")
    contamination_terms = [term.lower() for term in scenario.get("expected", {}).get("contamination_terms", [])]

    context_leak = False
    if expected_environment:
        expected_binding = bindings.get(expected_environment)
        expected_env_id = expected_binding.env_id if expected_binding else None
        actual_env_id = context.get("environment_id") or (trace.get("resolved_scope") or {}).get("environment_id")
        if expected_env_id and actual_env_id and actual_env_id != expected_env_id:
            context_leak = True

    answer_leak = any(term in response_text for term in contamination_terms)
    retrieval_leak = bool(result.get("chaos_details", {}).get("retrieval_wrong_scope_simulation"))
    if not retrieval_leak and receipt.get("retrieval", {}).get("used"):
        citations = trace.get("citations") or []
        retrieval_leak = any(
            isinstance(citation, dict) and any(term in str(citation).lower() for term in contamination_terms)
            for citation in citations
        )

    contaminated = context_leak or retrieval_leak or answer_leak
    return {
        "contaminated": contaminated,
        "context_leak": context_leak,
        "retrieval_leak": retrieval_leak,
        "answer_leak": answer_leak,
    }


def build_contamination_summary(results: list[dict[str, Any]]) -> dict[str, Any]:
    per_environment: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "scenario_count": 0,
        "contamination_count": 0,
        "context_leak_count": 0,
        "retrieval_leak_count": 0,
        "answer_leak_count": 0,
    })
    for result in results:
        env = result.get("environment") or "none"
        details = result.get("contamination_details", {})
        per_environment[env]["scenario_count"] += 1
        per_environment[env]["contamination_count"] += 1 if details.get("contaminated") else 0
        per_environment[env]["context_leak_count"] += 1 if details.get("context_leak") else 0
        per_environment[env]["retrieval_leak_count"] += 1 if details.get("retrieval_leak") else 0
        per_environment[env]["answer_leak_count"] += 1 if details.get("answer_leak") else 0

    normalized: dict[str, Any] = {}
    for env, stats in per_environment.items():
        total = max(stats["scenario_count"], 1)
        normalized[env] = {
            **stats,
            "contamination_rate": round(stats["contamination_count"] / total, 4),
            "context_leak_rate": round(stats["context_leak_count"] / total, 4),
            "retrieval_leak_rate": round(stats["retrieval_leak_count"] / total, 4),
            "answer_leak_rate": round(stats["answer_leak_count"] / total, 4),
        }
    return normalized


def build_contamination_clusters(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for result in results:
        family = result.get("family")
        if family:
            by_family[family].append(result)

    clusters: list[dict[str, Any]] = []
    for family, family_results in by_family.items():
        family_results = [item for item in family_results if item.get("environment")]
        if len(family_results) < 2:
            continue
        environment_names = {item.get("environment") for item in family_results}
        if len(environment_names) < 2:
            continue
        contaminated = [item for item in family_results if item.get("contamination_details", {}).get("contaminated")]
        if contaminated:
            clusters.append(
                {
                    "family": family,
                    "scenario_ids": [item["scenario_id"] for item in contaminated],
                    "environments": sorted(environment_names),
                    "count": len(contaminated),
                }
            )
    return sorted(clusters, key=lambda item: (-item["count"], item["family"]))

