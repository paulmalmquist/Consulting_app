from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any


PATCH_MAP = {
    "context_failure": {
        "files": ["repo-b/src/lib/commandbar/contextEnvelope.ts", "backend/app/services/assistant_scope.py", "backend/app/assistant_runtime/context_resolver.py"],
        "why": "Context envelope or scope resolution disagreed with scenario expectations.",
        "risks": "Touching shared context contracts can create cross-environment regressions.",
    },
    "routing_failure": {
        "files": ["backend/app/assistant_runtime/skill_router.py", "backend/app/assistant_runtime/skill_registry.py"],
        "why": "Skill selection or answer shape drifted from deterministic expectations.",
        "risks": "Over-tightening triggers can make casual phrasing brittle.",
    },
    "lane_failure": {
        "files": ["backend/app/services/request_router.py"],
        "why": "Lane heuristics over- or under-escalated the request budget.",
        "risks": "Changing lanes affects latency, retrieval, and tool allowances together.",
    },
    "retrieval_failure": {
        "files": ["backend/app/assistant_runtime/retrieval_orchestrator.py", "backend/app/services/rag_indexer.py", "backend/app/services/rag_reranker.py"],
        "why": "Retrieval ran when it should not, failed to run when it should, or returned empty/noisy results.",
        "risks": "RAG changes can alter latency and citation behavior across environments.",
    },
    "tool_policy_failure": {
        "files": ["backend/app/assistant_runtime/execution_engine.py", "backend/app/mcp/registry.py", "backend/app/mcp/audit.py"],
        "why": "Tool filtering, permission mode, or confirmation policy did not hold.",
        "risks": "Incorrect fixes here can open write paths or break legitimate read tools.",
    },
    "tool_execution_failure": {
        "files": ["backend/app/assistant_runtime/execution_engine.py", "backend/app/mcp/audit.py"],
        "why": "Tool calls failed, normalized poorly, or surfaced the wrong receipts.",
        "risks": "Can mask real backend tool faults if handled too broadly.",
    },
    "degraded_mode_failure": {
        "files": ["backend/app/assistant_runtime/degraded_responses.py", "backend/app/assistant_runtime/request_lifecycle.py"],
        "why": "The runtime did not fail loudly with the right reason code or message.",
        "risks": "Overeager degradation can suppress valid answers.",
    },
    "rendering_failure": {
        "files": ["repo-b/src/lib/commandbar/assistantApi.ts", "repo-b/src/components/commandbar/AdvancedDrawer.tsx", "repo-b/src/components/copilot/ResponseBlockRenderer.tsx"],
        "why": "Frontend receipt parsing or trace rendering broke.",
        "risks": "UI changes can hide debug truth even when backend receipts are correct.",
    },
    "performance_failure": {
        "files": ["backend/app/services/request_router.py", "backend/app/assistant_runtime/retrieval_orchestrator.py", "backend/app/assistant_runtime/prompt_registry.py", "repo-b/src/lib/commandbar/assistantApi.ts"],
        "why": "The runtime exceeded the timing budget or first-token expectations.",
        "risks": "Performance tweaks can accidentally remove safeguards or evidence.",
    },
}


def build_patch_plan(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for result in results:
        if result.get("failure_category"):
            grouped[result["failure_category"]].append(result)

    ranked = sorted(grouped.items(), key=lambda item: (-len(item[1]), item[0]))
    recommendations: list[dict[str, Any]] = []
    for category, failures in ranked:
        mapping = PATCH_MAP.get(category, {"files": [], "why": "Unmapped failure category.", "risks": "Unknown."})
        scenario_ids = [failure["scenario_id"] for failure in failures[:8]]
        environments = Counter(failure.get("environment") or "none" for failure in failures)
        recommendations.append(
            {
                "category": category,
                "count": len(failures),
                "scenario_ids": scenario_ids,
                "files": mapping["files"],
                "why": mapping["why"],
                "risks": mapping["risks"],
                "rerun": scenario_ids[:5],
                "neighbor_rerun": list(environments.keys())[:3],
            }
        )
    return recommendations


def safe_autofix_actions(recommendations: list[dict[str, Any]], apply: bool) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for recommendation in recommendations:
        actions.append(
            {
                "category": recommendation["category"],
                "applied": False,
                "reason": "No safe automatic codemod is registered for this category yet." if apply else "Dry-run only.",
                "files": recommendation["files"],
            }
        )
    return actions

