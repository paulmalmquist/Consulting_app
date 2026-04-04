from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def _median(values: list[int]) -> float:
    return round(statistics.median(values), 2) if values else 0.0


def _p95(values: list[int]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, int(round((len(ordered) - 1) * 0.95))))
    return float(ordered[idx])


def build_environment_scorecards(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for result in results:
        grouped[result.get("environment") or "none"].append(result)

    scorecards: list[dict[str, Any]] = []
    for environment, env_results in grouped.items():
        total = len(env_results)
        durations = [int(item.get("duration_ms") or 0) for item in env_results]
        failure_counter = Counter(item.get("failure_category") for item in env_results if item.get("failure_category"))
        pass_count = sum(1 for item in env_results if item.get("passed"))
        context_ok = sum(1 for item in env_results if not any(m.get("category") == "context_failure" for m in item.get("mismatches", [])))
        skill_ok = sum(1 for item in env_results if not any(m.get("field") == "skill" for m in item.get("mismatches", [])))
        lane_ok = sum(1 for item in env_results if not any(m.get("category") == "lane_failure" for m in item.get("mismatches", [])))
        degraded_candidates = [item for item in env_results if item.get("expected", {}).get("status") == "degraded"]
        degraded_ok = sum(1 for item in degraded_candidates if not any(m.get("category") == "degraded_mode_failure" for m in item.get("mismatches", [])))
        retrieval_candidates = [item for item in env_results if item.get("expected", {}).get("retrieval_used") is True]
        retrieval_ok = sum(1 for item in retrieval_candidates if not any(m.get("category") in {"retrieval_failure", "retrieval_contamination"} for m in item.get("mismatches", [])))
        retrieval_empty_candidates = [item for item in env_results if item.get("expected", {}).get("retrieval_status") == "empty"]
        retrieval_empty_ok = sum(1 for item in retrieval_empty_candidates if not any(m.get("category") == "retrieval_failure" for m in item.get("mismatches", [])))
        tool_safety_ok = sum(1 for item in env_results if not any(m.get("category") in {"tool_policy_failure", "tool_execution_failure"} for m in item.get("mismatches", [])))
        contamination_ok = sum(1 for item in env_results if not item.get("contamination_details", {}).get("contaminated"))
        frontend_cases = [item for item in env_results if item.get("kind") == "frontend_contract"]
        frontend_render_success = sum(1 for item in frontend_cases if item.get("passed"))
        fallback_used = sum(1 for item in env_results if item.get("fallback_used"))
        low_confidence_dispatch = sum(1 for item in env_results if item.get("low_confidence_dispatch"))
        invalid_dispatch = sum(1 for item in env_results if item.get("invalid_dispatch"))
        dispatch_code_disagreement = sum(1 for item in env_results if item.get("dispatch_code_disagreement"))
        # Retrieval empty rate: among scenarios where retrieval was actually used, how many got empty results
        retrieval_actually_used = [
            item for item in env_results
            if (item.get("turn_receipt") or {}).get("retrieval", {}).get("used")
        ]
        retrieval_actually_empty = sum(
            1 for item in retrieval_actually_used
            if (item.get("turn_receipt") or {}).get("retrieval", {}).get("status") == "empty"
        )
        # Product pass rate for this environment
        product_items = [item for item in env_results if item.get("product_pass") is not None]
        product_pass_count = sum(1 for item in product_items if item.get("product_pass"))
        pass_rate = round(pass_count / max(total, 1), 4)
        overall_score = round(
            (
                pass_rate * 0.25
                + (context_ok / max(total, 1)) * 0.2
                + (lane_ok / max(total, 1)) * 0.1
                + (skill_ok / max(total, 1)) * 0.1
                + (tool_safety_ok / max(total, 1)) * 0.1
                + (contamination_ok / max(total, 1)) * 0.1
                + (retrieval_ok / max(len(retrieval_candidates), 1)) * 0.05
                + (frontend_render_success / max(len(frontend_cases), 1) if frontend_cases else 1.0) * 0.1
            )
            * 100,
            2,
        )

        scorecards.append(
            {
                "environment": environment,
                "total_scenarios": total,
                "pass_rate": pass_rate,
                "degraded_correctness_rate": round(degraded_ok / max(len(degraded_candidates), 1), 4) if degraded_candidates else 1.0,
                "context_accuracy": round(context_ok / max(total, 1), 4),
                "lane_accuracy": round(lane_ok / max(total, 1), 4),
                "skill_accuracy": round(skill_ok / max(total, 1), 4),
                "retrieval_success_rate": round(retrieval_ok / max(len(retrieval_candidates), 1), 4) if retrieval_candidates else 1.0,
                "retrieval_empty_correctness": round(retrieval_empty_ok / max(len(retrieval_empty_candidates), 1), 4) if retrieval_empty_candidates else 1.0,
                "tool_safety_rate": round(tool_safety_ok / max(total, 1), 4),
                "contamination_rate": round(1 - (contamination_ok / max(total, 1)), 4),
                "median_latency_ms": _median(durations),
                "p95_latency_ms": _p95(durations),
                "frontend_render_success_rate": round(frontend_render_success / max(len(frontend_cases), 1), 4) if frontend_cases else 1.0,
                "fallback_rate": round(fallback_used / max(total, 1), 4),
                "low_confidence_dispatch_rate": round(low_confidence_dispatch / max(total, 1), 4),
                "invalid_dispatch_rate": round(invalid_dispatch / max(total, 1), 4),
                "dispatch_code_disagreement_rate": round(dispatch_code_disagreement / max(total, 1), 4),
                "retrieval_empty_rate": round(retrieval_actually_empty / max(len(retrieval_actually_used), 1), 4) if retrieval_actually_used else None,
                "product_pass_rate": round(product_pass_count / max(len(product_items), 1), 4) if product_items else None,
                "top_failure_categories": failure_counter.most_common(3),
                "overall_score": overall_score,
            }
        )
    return sorted(scorecards, key=lambda item: (item["overall_score"], item["environment"]))


def write_environment_scorecards(out_dir: Path, scorecards: list[dict[str, Any]]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    lines = ["# Environment Scorecards", ""]
    for card in scorecards:
        lines.extend(
            [
                f"## {card['environment']}",
                f"- Overall score: {card['overall_score']}",
                f"- Scenarios: {card['total_scenarios']}",
                f"- Pass rate: {card['pass_rate']}",
                f"- Context accuracy: {card['context_accuracy']}",
                f"- Lane accuracy: {card['lane_accuracy']}",
                f"- Skill accuracy: {card['skill_accuracy']}",
                f"- Degraded correctness: {card['degraded_correctness_rate']}",
                f"- Retrieval success: {card['retrieval_success_rate']}",
                f"- Retrieval empty correctness: {card['retrieval_empty_correctness']}",
                f"- Tool safety: {card['tool_safety_rate']}",
                f"- Contamination rate: {card['contamination_rate']}",
                f"- Median latency: {card['median_latency_ms']}ms",
                f"- P95 latency: {card['p95_latency_ms']}ms",
                f"- Frontend render success: {card['frontend_render_success_rate']}",
                f"- Fallback rate: {card['fallback_rate']}",
                f"- Low-confidence dispatch rate: {card['low_confidence_dispatch_rate']}",
                f"- Invalid dispatch rate: {card['invalid_dispatch_rate']}",
                f"- Dispatch/code disagreement rate: {card['dispatch_code_disagreement_rate']}",
                f"- Top failures: {', '.join(f'{k}:{v}' for k, v in card['top_failure_categories']) or 'none'}",
                "",
            ]
        )
    (out_dir / "environment_scorecards.md").write_text("\n".join(lines) + "\n")
    (out_dir / "environment_scorecards.json").write_text(json.dumps(scorecards, indent=2) + "\n")
