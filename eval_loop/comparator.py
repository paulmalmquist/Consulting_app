from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def compare_result_sets(
    *,
    current_results: list[dict[str, Any]],
    baseline_results: list[dict[str, Any]],
    current_label: str,
    baseline_label: str,
) -> dict[str, Any]:
    by_baseline = {item["scenario_id"]: item for item in baseline_results}
    comparisons: list[dict[str, Any]] = []
    improved = worsened = 0
    latency_delta_total = 0
    contamination_delta_total = 0
    pass_delta = 0

    for current in current_results:
        baseline = by_baseline.get(current["scenario_id"])
        if baseline is None:
            continue
        current_score = float(current.get("score") or 0)
        baseline_score = float(baseline.get("score") or 0)
        correctness_winner = current_label if current_score > baseline_score else baseline_label if baseline_score > current_score else "tie"
        current_latency = int(current.get("duration_ms") or 0)
        baseline_latency = int(baseline.get("duration_ms") or 0)
        latency_winner = current_label if current_latency < baseline_latency else baseline_label if baseline_latency < current_latency else "tie"
        current_contamination = int(current.get("cross_environment_contamination") or 0)
        baseline_contamination = int(baseline.get("cross_environment_contamination") or 0)
        safety_regressed = bool(current.get("failure_category") in {"tool_policy_failure", "degraded_mode_failure", "retrieval_contamination"} and baseline.get("failure_category") not in {"tool_policy_failure", "degraded_mode_failure", "retrieval_contamination"})

        if current_score > baseline_score:
            improved += 1
        elif current_score < baseline_score:
            worsened += 1
        latency_delta_total += current_latency - baseline_latency
        contamination_delta_total += current_contamination - baseline_contamination
        pass_delta += (1 if current.get("passed") else 0) - (1 if baseline.get("passed") else 0)

        comparisons.append(
            {
                "scenario_id": current["scenario_id"],
                "correctness_winner": correctness_winner,
                "latency_winner": latency_winner,
                "safety_regressed": safety_regressed,
                "contamination_regressed": current_contamination > baseline_contamination,
                "score_delta": round(current_score - baseline_score, 2),
                "latency_delta_ms": current_latency - baseline_latency,
                "current_failure_category": current.get("failure_category"),
                "baseline_failure_category": baseline.get("failure_category"),
            }
        )

    return {
        "current_label": current_label,
        "baseline_label": baseline_label,
        "scenario_count": len(comparisons),
        "improved": improved,
        "worsened": worsened,
        "net_pass_delta": pass_delta,
        "net_latency_delta_ms": latency_delta_total,
        "net_contamination_delta": contamination_delta_total,
        "comparisons": comparisons,
    }


def write_comparison_report(out_dir: Path, comparison: dict[str, Any]) -> None:
    lines = [
        "# Comparison Report",
        "",
        f"- Current: `{comparison['current_label']}`",
        f"- Baseline: `{comparison['baseline_label']}`",
        f"- Scenarios compared: `{comparison['scenario_count']}`",
        f"- Improved: `{comparison['improved']}`",
        f"- Worsened: `{comparison['worsened']}`",
        f"- Net pass delta: `{comparison['net_pass_delta']}`",
        f"- Net latency delta: `{comparison['net_latency_delta_ms']}ms`",
        f"- Net contamination delta: `{comparison['net_contamination_delta']}`",
        "",
        "## Per-scenario",
    ]
    for item in comparison["comparisons"][:25]:
        lines.append(
            f"- `{item['scenario_id']}` correctness `{item['correctness_winner']}` "
            f"latency `{item['latency_winner']}` score delta `{item['score_delta']}` "
            f"latency delta `{item['latency_delta_ms']}ms` safety regressed `{item['safety_regressed']}` "
            f"contamination regressed `{item['contamination_regressed']}`"
        )
    (out_dir / "comparison_report.md").write_text("\n".join(lines) + "\n")
    (out_dir / "comparison_report.json").write_text(json.dumps(comparison, indent=2) + "\n")
