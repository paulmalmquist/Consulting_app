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


def summarize_run(*, run_id: str, cycle: int, suite: str, results: list[dict[str, Any]]) -> dict[str, Any]:
    durations = [int(result.get("duration_ms") or 0) for result in results if result.get("duration_ms") is not None]
    passed_count = sum(1 for result in results if result.get("passed"))
    failed_count = len(results) - passed_count
    degraded_count = sum(1 for result in results if (result.get("turn_receipt") or {}).get("status") == "degraded")
    hallucination_rate = round(sum(result.get("hallucination_proxy", 0) for result in results) / max(len(results), 1), 4)
    contamination_rate = round(sum(result.get("cross_environment_contamination", 0) for result in results) / max(len(results), 1), 4)
    receipt_completeness_avg = round(sum(float(result.get("receipt_completeness") or 0.0) for result in results) / max(len(results), 1), 4)
    trace_fidelity_avg = round(sum(float(result.get("trace_fidelity") or 0.0) for result in results) / max(len(results), 1), 4)
    fallback_rate = round(sum(1 for result in results if result.get("fallback_used")) / max(len(results), 1), 4)
    low_confidence_dispatch_rate = round(sum(1 for result in results if result.get("low_confidence_dispatch")) / max(len(results), 1), 4)
    invalid_dispatch_rate = round(sum(1 for result in results if result.get("invalid_dispatch")) / max(len(results), 1), 4)
    dispatch_code_disagreement_rate = round(sum(1 for result in results if result.get("dispatch_code_disagreement")) / max(len(results), 1), 4)
    return {
        "run_id": run_id,
        "cycle": cycle,
        "suite": suite,
        "scenario_count": len(results),
        "passed_count": passed_count,
        "failed_count": failed_count,
        "median_latency_ms": _median(durations),
        "p95_latency_ms": _p95(durations),
        "degraded_rate": round(degraded_count / max(len(results), 1), 4),
        "hallucination_rate": hallucination_rate,
        "contamination_rate": contamination_rate,
        "receipt_completeness_avg": receipt_completeness_avg,
        "trace_fidelity_avg": trace_fidelity_avg,
        "fallback_rate": fallback_rate,
        "low_confidence_dispatch_rate": low_confidence_dispatch_rate,
        "invalid_dispatch_rate": invalid_dispatch_rate,
        "dispatch_code_disagreement_rate": dispatch_code_disagreement_rate,
    }


def _failure_clusters(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "scenario_ids": [], "environments": Counter(), "suspects": Counter()})
    for result in results:
        category = result.get("failure_category")
        if not category:
            continue
        cluster = grouped[category]
        cluster["count"] += 1
        cluster["scenario_ids"].append(result["scenario_id"])
        cluster["environments"][result.get("environment") or "none"] += 1
        for suspect in result.get("suspected_files", []):
            cluster["suspects"][suspect["path"]] += 1
    out: list[dict[str, Any]] = []
    for category, cluster in grouped.items():
        out.append(
            {
                "category": category,
                "count": cluster["count"],
                "scenario_ids": cluster["scenario_ids"][:20],
                "top_environments": cluster["environments"].most_common(5),
                "top_suspects": cluster["suspects"].most_common(5),
            }
        )
    return sorted(out, key=lambda item: (-item["count"], item["category"]))


def _render_latest_summary(
    *,
    summary: dict[str, Any],
    results: list[dict[str, Any]],
    regressions: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
    scorecards: list[dict[str, Any]],
    comparison: dict[str, Any] | None,
    contamination_summary: dict[str, Any],
    failure_clusters: list[dict[str, Any]],
    suspect_heatmap: dict[str, int],
) -> str:
    failures = [result for result in results if not result.get("passed")]
    latency_buckets = Counter(result.get("latency_bucket") for result in results)
    correctly_degraded = [
        result["scenario_id"]
        for result in results
        if (result.get("turn_receipt") or {}).get("status") == "degraded"
        and not any(m.get("category") == "degraded_mode_failure" for m in result.get("mismatches", []))
    ]
    still_hallucinating = [
        result["scenario_id"]
        for result in results
        if result.get("hallucination_proxy")
    ]
    weakest_environment = scorecards[0] if scorecards else None
    improved = comparison.get("improved", 0) if comparison else 0
    worsened = comparison.get("worsened", 0) if comparison else 0
    contamination_lines = []
    for env, stats in sorted(contamination_summary.items(), key=lambda item: (-item[1]["contamination_rate"], item[0]))[:3]:
        contamination_lines.append(
            f"- `{env}` contamination `{stats['contamination_rate']}` context leak `{stats['context_leak_rate']}` retrieval leak `{stats['retrieval_leak_rate']}` answer leak `{stats['answer_leak_rate']}`"
        )
    fallback_reasons = Counter(result.get("fallback_reason") for result in results if result.get("fallback_reason"))

    lines = [
        "# Latest Summary",
        "",
        f"- Run: `{summary['run_id']}` cycle `{summary['cycle']}` suite `{summary['suite']}`",
        f"- Passed: `{summary['passed_count']}/{summary['scenario_count']}`",
        f"- Median latency: `{summary['median_latency_ms']}ms`",
        f"- P95 latency: `{summary['p95_latency_ms']}ms`",
        f"- Receipt completeness avg: `{summary['receipt_completeness_avg']}`",
        f"- Trace fidelity avg: `{summary['trace_fidelity_avg']}`",
        f"- Fallback rate: `{summary['fallback_rate']}`",
        f"- Low-confidence dispatch rate: `{summary['low_confidence_dispatch_rate']}`",
        f"- Invalid dispatch rate: `{summary['invalid_dispatch_rate']}`",
        f"- Dispatch/code disagreement rate: `{summary['dispatch_code_disagreement_rate']}`",
        "",
        "## What Failed Most Often",
    ]
    if failure_clusters:
        for cluster in failure_clusters[:5]:
            lines.append(f"- `{cluster['category']}`: {cluster['count']} scenarios")
    else:
        lines.append("- No failures recorded.")

    lines.extend(
        [
            "",
            "## What Improved This Cycle",
            f"- Improved scenarios vs baseline: `{improved}`",
            f"- Worsened scenarios vs baseline: `{worsened}`",
            f"- New regressions recorded: `{len(regressions)}`",
            "",
            "## What Got Slower",
            f"- `slow_correct`: {latency_buckets.get('slow_correct', 0)}",
            f"- `slow_wrong`: {latency_buckets.get('slow_wrong', 0)}",
            "",
            "## Fallback Integrity",
            f"- Fallback invocations: `{sum(1 for result in results if result.get('fallback_used'))}`",
            f"- Low-confidence dispatches: `{sum(1 for result in results if result.get('low_confidence_dispatch'))}`",
            f"- Invalid dispatches: `{sum(1 for result in results if result.get('invalid_dispatch'))}`",
            f"- Dispatch/code disagreements: `{sum(1 for result in results if result.get('dispatch_code_disagreement'))}`",
            "",
            "## Cross-Environment Contamination",
        ]
    )
    if fallback_reasons:
        for reason, count in fallback_reasons.most_common(5):
            lines.append(f"- fallback `{reason}`: {count}")
    lines.extend(contamination_lines or ["- No contamination detected in this cycle."])

    lines.extend(["", "## What Degraded Correctly"])
    if correctly_degraded:
        lines.extend(f"- `{scenario_id}`" for scenario_id in correctly_degraded[:8])
    else:
        lines.append("- No correctly degraded scenarios recorded.")
    lines.extend(["", "## What Still Hallucinates"])
    if still_hallucinating:
        lines.extend(f"- `{scenario_id}`" for scenario_id in still_hallucinating[:8])
    else:
        lines.append("- No hallucination proxy hits.")
    lines.extend(["", "## Weakest Environment"])
    if weakest_environment:
        lines.append(
            f"- `{weakest_environment['environment']}` overall `{weakest_environment['overall_score']}` pass `{weakest_environment['pass_rate']}` contamination `{weakest_environment['contamination_rate']}`"
        )
    else:
        lines.append("- No environment scorecards available.")

    lines.extend(["", "## Most Implicated Files"])
    if suspect_heatmap:
        for path, count in list(suspect_heatmap.items())[:8]:
            lines.append(f"- `{path}`: {count}")
    else:
        lines.append("- No suspect-file mapping recorded.")

    if recommendations:
        lines.extend(["", "## Top Patch Targets"])
        for recommendation in recommendations[:5]:
            lines.append(
                f"- `{recommendation['category']}` -> {', '.join(recommendation['files'][:3]) or 'none'}"
            )
    return "\n".join(lines) + "\n"


def _render_regressions(regressions: list[dict[str, Any]], comparison: dict[str, Any] | None) -> str:
    lines = ["# Regressions", ""]
    if regressions:
        for regression in regressions:
            lines.append(
                f"- `{regression['scenario_id']}` `{regression['regression_type']}` "
                f"(score {regression.get('previous_score')} -> {regression.get('current_score')})"
            )
    else:
        lines.append("- No regressions recorded in this run.")

    if comparison:
        lines.extend(["", "## Worsened Scenarios"])
        worsened = [item for item in comparison.get("comparisons", []) if item.get("score_delta", 0) < 0]
        if worsened:
            for item in worsened[:20]:
                lines.append(
                    f"- `{item['scenario_id']}` score delta `{item['score_delta']}` latency delta `{item['latency_delta_ms']}ms` safety regressed `{item['safety_regressed']}` contamination regressed `{item['contamination_regressed']}`"
                )
        else:
            lines.append("- No worsened scenarios in the comparison set.")
    return "\n".join(lines) + "\n"


def write_reports(
    *,
    out_dir: Path,
    summary: dict[str, Any],
    results: list[dict[str, Any]],
    regressions: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
    recent_summaries: list[dict[str, Any]],
    scorecards: list[dict[str, Any]],
    comparison: dict[str, Any] | None,
    contamination_summary: dict[str, Any],
    failure_clusters: list[dict[str, Any]],
    suspect_heatmap: dict[str, int],
    receipt_diffs: list[dict[str, Any]],
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    latest_summary = _render_latest_summary(
        summary=summary,
        results=results,
        regressions=regressions,
        recommendations=recommendations,
        scorecards=scorecards,
        comparison=comparison,
        contamination_summary=contamination_summary,
        failure_clusters=failure_clusters,
        suspect_heatmap=suspect_heatmap,
    )
    (out_dir / "latest_summary.md").write_text(latest_summary)
    (out_dir / "regressions.md").write_text(_render_regressions(regressions, comparison))

    sample_payload = [
        {
            "scenario_id": result["scenario_id"],
            "environment": result.get("environment"),
            "prompt": result.get("prompt"),
            "turn_receipt": result.get("turn_receipt"),
            "trace": result.get("trace"),
            "receipt_diff": result.get("receipt_diff"),
        }
        for result in results[:8]
    ]
    (out_dir / "receipts_sample.json").write_text(json.dumps(sample_payload, indent=2) + "\n")

    trend_payload = {
        "recent_summaries": recent_summaries,
        "current": summary,
        "latency_buckets": dict(Counter(result.get("latency_bucket") for result in results)),
        "receipt_diffs": receipt_diffs[:50],
    }
    (out_dir / "performance_trends.json").write_text(json.dumps(trend_payload, indent=2) + "\n")

    patch_md = ["# Patch Recommendations", ""]
    if recommendations:
        for recommendation in recommendations:
            patch_md.extend(
                [
                    f"## {recommendation['category']}",
                    f"- Failures: {recommendation['count']}",
                    f"- Why: {recommendation['why']}",
                    f"- Files: {', '.join(recommendation['files']) or 'none'}",
                    f"- Risks: {recommendation['risks']}",
                    f"- Rerun first: {', '.join(recommendation['rerun']) or 'none'}",
                    "",
                ]
            )
    else:
        patch_md.append("- No patch recommendations. No failures recorded.")
    (out_dir / "patch_recommendations.md").write_text("\n".join(patch_md) + "\n")

    env_lines = ["# Environment Scorecards", ""]
    for card in scorecards:
        env_lines.extend(
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
                f"- Top failures: {', '.join(f'{key}:{value}' for key, value in card['top_failure_categories']) or 'none'}",
                "",
            ]
        )
    (out_dir / "environment_scorecards.md").write_text("\n".join(env_lines) + "\n")
    (out_dir / "environment_scorecards.json").write_text(json.dumps(scorecards, indent=2) + "\n")

    if comparison:
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
            "## Scenario Deltas",
        ]
        for item in comparison.get("comparisons", [])[:40]:
            lines.append(
                f"- `{item['scenario_id']}` correctness `{item['correctness_winner']}` latency `{item['latency_winner']}` score delta `{item['score_delta']}` latency delta `{item['latency_delta_ms']}ms` safety regressed `{item['safety_regressed']}` contamination regressed `{item['contamination_regressed']}`"
            )
        (out_dir / "comparison_report.md").write_text("\n".join(lines) + "\n")
        (out_dir / "comparison_report.json").write_text(json.dumps(comparison, indent=2) + "\n")
    else:
        (out_dir / "comparison_report.md").write_text("# Comparison Report\n\n- No comparison was requested for this run.\n")
        (out_dir / "comparison_report.json").write_text(json.dumps({}, indent=2) + "\n")

    (out_dir / "failure_clusters.json").write_text(json.dumps(failure_clusters, indent=2) + "\n")
    (out_dir / "suspect_file_heatmap.json").write_text(json.dumps(suspect_heatmap, indent=2) + "\n")
    (out_dir / "receipt_diffs.json").write_text(json.dumps(receipt_diffs, indent=2) + "\n")
