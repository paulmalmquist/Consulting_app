from __future__ import annotations

from collections import Counter
from typing import Any


SUSPECT_RULES: dict[str, list[dict[str, str]]] = {
    "context_failure": [
        {
            "path": "backend/app/assistant_runtime/context_resolver.py",
            "confidence": "high",
            "reason": "Canonical context receipt did not match the expected scope.",
        },
        {
            "path": "backend/app/services/assistant_scope.py",
            "confidence": "medium",
            "reason": "Backend scope resolution may be preferring stale or overly eager entity selection.",
        },
        {
            "path": "repo-b/src/lib/commandbar/contextEnvelope.ts",
            "confidence": "medium",
            "reason": "Frontend context envelope may be sending ambiguous or stale scope hints.",
        },
    ],
    "routing_failure": [
        {
            "path": "backend/app/assistant_runtime/skill_router.py",
            "confidence": "high",
            "reason": "Skill selection did not line up with explicit scenario expectations.",
        },
        {
            "path": "backend/app/assistant_runtime/skill_registry.py",
            "confidence": "medium",
            "reason": "Skill triggers or allowed tool tags may be too brittle.",
        },
    ],
    "lane_failure": [
        {
            "path": "backend/app/services/request_router.py",
            "confidence": "high",
            "reason": "Lane heuristics escalated or de-escalated incorrectly.",
        }
    ],
    "retrieval_failure": [
        {
            "path": "backend/app/assistant_runtime/retrieval_orchestrator.py",
            "confidence": "high",
            "reason": "Retrieval did not run, ran with the wrong policy, or did not degrade properly.",
        },
        {
            "path": "backend/app/services/rag_indexer.py",
            "confidence": "medium",
            "reason": "Search inputs or scoping filters may be suppressing expected hits.",
        },
        {
            "path": "backend/app/services/rag_reranker.py",
            "confidence": "low",
            "reason": "Reranking may be discarding relevant chunks or keeping noisy ones.",
        },
    ],
    "retrieval_contamination": [
        {
            "path": "backend/app/assistant_runtime/retrieval_orchestrator.py",
            "confidence": "high",
            "reason": "Retrieval scope leaked across environments or entities.",
        },
        {
            "path": "backend/app/services/rag_indexer.py",
            "confidence": "high",
            "reason": "Environment/entity filters may not be applied correctly to retrieval.",
        },
    ],
    "tool_policy_failure": [
        {
            "path": "backend/app/assistant_runtime/execution_engine.py",
            "confidence": "high",
            "reason": "Permission mode or tool filtering did not hold.",
        },
        {
            "path": "backend/app/mcp/registry.py",
            "confidence": "medium",
            "reason": "Tool manifest tags or confirmation requirements may be wrong.",
        },
        {
            "path": "backend/app/mcp/audit.py",
            "confidence": "medium",
            "reason": "Audit/confirmation enforcement may not be surfacing denials cleanly.",
        },
    ],
    "tool_execution_failure": [
        {
            "path": "backend/app/assistant_runtime/execution_engine.py",
            "confidence": "high",
            "reason": "Tool execution failed or failed to normalize correctly.",
        },
        {
            "path": "backend/app/mcp/audit.py",
            "confidence": "medium",
            "reason": "Audit-wrapped tool execution may be turning runtime faults into vague output.",
        },
    ],
    "degraded_mode_failure": [
        {
            "path": "backend/app/assistant_runtime/degraded_responses.py",
            "confidence": "high",
            "reason": "The runtime did not fail loudly with the right reason code or copy.",
        },
        {
            "path": "backend/app/assistant_runtime/request_lifecycle.py",
            "confidence": "medium",
            "reason": "Degradation gating may be firing too late or not at all.",
        },
    ],
    "rendering_failure": [
        {
            "path": "repo-b/src/lib/commandbar/assistantApi.ts",
            "confidence": "high",
            "reason": "Transport parsing may be choking on malformed or incomplete receipts.",
        },
        {
            "path": "repo-b/src/components/commandbar/AdvancedDrawer.tsx",
            "confidence": "high",
            "reason": "Trace panel rendering may not be resilient to malformed receipts.",
        },
        {
            "path": "repo-b/src/components/copilot/ResponseBlockRenderer.tsx",
            "confidence": "medium",
            "reason": "A malformed block or tool result may be breaking the UI tree.",
        },
    ],
    "performance_failure": [
        {
            "path": "backend/app/services/request_router.py",
            "confidence": "medium",
            "reason": "Lane escalation may be making simple prompts too expensive.",
        },
        {
            "path": "backend/app/assistant_runtime/retrieval_orchestrator.py",
            "confidence": "medium",
            "reason": "Retrieval path may be adding unnecessary latency.",
        },
        {
            "path": "backend/app/assistant_runtime/prompt_registry.py",
            "confidence": "low",
            "reason": "Prompt assembly may be bloating requests or delaying first token.",
        },
        {
            "path": "repo-b/src/lib/commandbar/assistantApi.ts",
            "confidence": "low",
            "reason": "Frontend SSE parsing may be extending perceived completion time.",
        },
    ],
    "regression_failure": [
        {
            "path": "eval_loop/runner.py",
            "confidence": "medium",
            "reason": "The harness itself or the scenario execution path failed before scoring.",
        }
    ],
}


def map_suspects(category: str | None) -> list[dict[str, str]]:
    if not category:
        return []
    return [dict(item) for item in SUSPECT_RULES.get(category, [])]


def build_suspect_heatmap(results: list[dict[str, Any]]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for result in results:
        for suspect in result.get("suspected_files", []):
            counter[suspect["path"]] += 1
    return dict(counter.most_common())

