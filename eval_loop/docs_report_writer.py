"""
Writes a concise, dated Winston eval report to docs/ai-testing/reports/
and updates docs/LATEST.md with a one-line pointer.

This runs alongside the richer artifacts/eval-loop/ reports from
reporters.py — it's the human-readable, repo-committed record that
future sessions (and morning digests) can find without running anything.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _fmt_ms(v: Any) -> str:
    if v is None:
        return "—"
    try:
        return f"{int(v):,} ms"
    except (TypeError, ValueError):
        return str(v)


def _dedupe_preserving_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _regression_rows(
    results: list[dict[str, Any]],
    postgres_summary: dict[str, Any] | None,
) -> list[str]:
    rows: list[str] = []
    for r in results:
        if not r.get("failure_category"):
            continue
        lane = ((r.get("trace") or {}).get("lane")) or "—"
        cid = r.get("scenario_id") or "—"
        cat = r.get("failure_category")
        lat = _fmt_ms(r.get("duration_ms"))
        rows.append(f"| `{cid}` | `{cat}` | `{lane}` | {lat} |")
    if postgres_summary and postgres_summary.get("regressions"):
        rows.append(
            f"\n_Postgres-detected regressions this run: {postgres_summary['regressions']}_"
        )
    return rows


def _lane_distribution(results: list[dict[str, Any]]) -> dict[str, int]:
    dist: dict[str, int] = {}
    for r in results:
        lane = ((r.get("trace") or {}).get("lane")) or "unknown"
        dist[lane] = dist.get(lane, 0) + 1
    return dist


def _latency_line(summary: dict[str, Any]) -> str:
    median = _fmt_ms(summary.get("median_latency_ms"))
    p95 = _fmt_ms(summary.get("p95_latency_ms"))
    return f"median **{median}**, p95 **{p95}**"


def _render_concept_eval_section(concept: dict[str, Any]) -> list[str]:
    """Render the concept-eval section for the docs report. Called when
    `summary["concept_eval"]` is present (i.e. the run included at least
    one concept_eval scenario).
    """
    lines: list[str] = []
    lines.append("## Concept eval (NOI variance v1)")
    lines.append("")
    lines.append(f"- Scenarios run: **{concept.get('scenario_count', 0)}**")
    lines.append(f"- Score coverage avg: **{concept.get('score_coverage_avg', 0)}**")
    lines.append(f"- Source-discipline coverage avg: **{concept.get('source_discipline_coverage_avg', 0)}** _(0.0 expected in PR 3)_")
    lines.append("")

    by_scorer = concept.get("by_scorer") or {}
    if by_scorer:
        lines.append("### Pass rate by scorer")
        lines.append("")
        lines.append("| scorer | applicable | passed | pass_rate |")
        lines.append("|---|---|---|---|")
        for name, stats in by_scorer.items():
            applicable = stats.get("applicable", 0)
            passed = stats.get("passed", 0)
            pass_rate = stats.get("pass_rate")
            pass_rate_str = "n/a" if pass_rate is None else f"{pass_rate:.2%}"
            lines.append(f"| `{name}` | {applicable} | {passed} | {pass_rate_str} |")
        lines.append("")

    gates = (concept.get("release_gates") or {}).get("gates") or []
    if gates:
        lines.append("### Release gates")
        lines.append("")
        lines.append("| gate | threshold | actual | applicable | passed |")
        lines.append("|---|---|---|---|---|")
        for g in gates:
            actual = g.get("actual")
            actual_str = "n/a" if actual is None else f"{actual:.2%}"
            threshold = g.get("threshold")
            threshold_str = f"{threshold:.0%}" if isinstance(threshold, (int, float)) else str(threshold)
            mark = "PASS" if g.get("passed") else "FAIL"
            lines.append(
                f"| `{g.get('name')}` | {threshold_str} | {actual_str} | {g.get('applicable_count', 0)} | **{mark}** |"
            )
        lines.append("")
        if not (concept.get("release_gates") or {}).get("all_passed"):
            lines.append("> **Concept eval release gates failed.** Promotion blocked until concept_match_score reaches 95%.")
            lines.append("")

    hard_failures = concept.get("hard_gate_failures") or []
    if hard_failures:
        lines.append("### Hard-gate failures")
        lines.append("")
        lines.append("| scenario_id | category | scorer |")
        lines.append("|---|---|---|")
        for hf in hard_failures:
            lines.append(
                f"| `{hf.get('scenario_id')}` | `{hf.get('category')}` | `{hf.get('scorer')}` |"
            )
        lines.append("")

    return lines


def _actionable_suspects(results: list[dict[str, Any]], limit: int = 5) -> list[str]:
    tally: dict[str, int] = {}
    for r in results:
        if not r.get("failure_category"):
            continue
        for suspect in r.get("suspected_files") or []:
            path = suspect.get("path")
            if path:
                tally[path] = tally.get(path, 0) + 1
    ranked = sorted(tally.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    return [f"- `{path}` — touched by {count} failing case(s)" for path, count in ranked]


def write_docs_report(
    *,
    repo_root: Path,
    run_id: str,
    suite: str,
    trigger: str,
    environment: str | None = None,
    summary: dict[str, Any],
    results: list[dict[str, Any]],
    regressions: list[dict[str, Any]],
    postgres_summary: dict[str, Any] | None = None,
) -> Path:
    """Write docs/ai-testing/reports/YYYY-MM-DD_HHMM.md and return its path."""
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y-%m-%d_%H%M")
    reports_dir = repo_root / "docs" / "ai-testing" / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    env_slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", environment.strip()) if environment else None
    out_path = reports_dir / f"{stamp}_{env_slug}.md" if env_slug else reports_dir / f"{stamp}.md"

    passed = summary.get("passed_count", 0)
    failed = summary.get("failed_count", 0)
    total = summary.get("scenario_count", passed + failed)

    status_line = "✅ all pass" if failed == 0 else f"❌ {failed} fail / {total} total"
    categories = _dedupe_preserving_order(
        [r.get("failure_category") for r in results if r.get("failure_category")]
    )
    lane_dist = _lane_distribution(results)

    lines: list[str] = []
    title_env = f" - {environment}" if environment else ""
    lines.append(f"# Winston eval report{title_env} - {stamp} UTC")
    lines.append("")
    lines.append(f"- **Run ID:** `{run_id}`")
    lines.append(f"- **Suite:** `{suite}`")
    if environment:
        lines.append(f"- **Environment:** `{environment}`")
    lines.append(f"- **Trigger:** `{trigger}`")
    lines.append(f"- **Status:** {status_line}")
    lines.append(f"- **Latency:** {_latency_line(summary)}")
    if postgres_summary:
        lines.append(
            f"- **Postgres run:** `{postgres_summary.get('run_id')}` "
            f"— status `{postgres_summary.get('status')}`, "
            f"regressions: {postgres_summary.get('regressions', 0)}"
        )
    lines.append("")

    lines.append("## Pass / fail")
    lines.append("")
    lines.append(f"- Passed: **{passed}**")
    lines.append(f"- Failed: **{failed}**")
    lines.append(f"- Total cases: **{total}**")
    if regressions:
        lines.append(f"- Regressions (vs prior run): **{len(regressions)}**")
    lines.append("")

    lines.append("## Lane distribution")
    lines.append("")
    for lane, count in sorted(lane_dist.items(), key=lambda kv: -kv[1]):
        lines.append(f"- `{lane}`: {count}")
    lines.append("")

    concept_summary = (summary or {}).get("concept_eval")
    if concept_summary:
        lines.extend(_render_concept_eval_section(concept_summary))

    if failed:
        lines.append("## Failing cases")
        lines.append("")
        lines.append("| case_id | category | observed lane | latency |")
        lines.append("|---|---|---|---|")
        lines.extend(_regression_rows(results, postgres_summary))
        lines.append("")

    if categories:
        lines.append("## Failure categories seen")
        lines.append("")
        for cat in categories:
            lines.append(f"- `{cat}`")
        lines.append("")

    suspects = _actionable_suspects(results)
    if suspects:
        lines.append("## Top suspect files")
        lines.append("")
        lines.extend(suspects)
        lines.append("")

    lines.append("## Actionable next steps")
    lines.append("")
    if failed == 0:
        lines.append("- All canonical-contract assertions pass for this run. No action required.")
    else:
        lines.append(
            "- Inspect failing cases above. Canonical-contract failures "
            "(`no_terminal_state`, `fallback_to_lane_f`, `empty_dashboard_shell`, "
            "`narration_only`, `raw_id_leakage`, `unavailable_masquerade`) are "
            "hard fails — they indicate the canonical runtime is broken for that case."
        )
        lines.append(
            "- Lane F usage when a canonical lane was expected means the legacy "
            "`_run_repe_fast_path` is getting picked up — check `backend/app/assistant_runtime/request_lifecycle.py` routing."
        )
        lines.append(
            "- For full trace, query `ai_gateway_logs` by `request_id` from `trace_summary` or join `winston_eval_results.ai_gateway_log_id`."
        )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(
        "_Generated by `eval_loop.docs_report_writer`. "
        "Rich artifacts (patch plan, suspect heatmap, receipt diffs) live in `artifacts/eval-loop/`._"
    )
    lines.append("")

    out_path.write_text("\n".join(lines))
    _update_latest_manifest(
        repo_root=repo_root,
        stamp=stamp,
        out_path=out_path,
        summary=summary,
        suite=suite,
        environment=environment,
    )
    return out_path


def _update_latest_manifest(
    *,
    repo_root: Path,
    stamp: str,
    out_path: Path,
    summary: dict[str, Any],
    suite: str,
    environment: str | None = None,
) -> None:
    """
    Update docs/LATEST.md so the morning digest surfaces this report.
    Replaces any existing 'Winston eval' line; appends if none.
    """
    latest_path = repo_root / "docs" / "LATEST.md"
    if not latest_path.exists():
        # Don't create it — LATEST.md is maintained by the daily digest job.
        return

    passed = summary.get("passed_count", 0)
    failed = summary.get("failed_count", 0)
    rel_path = out_path.relative_to(repo_root)
    status_icon = "pass" if failed == 0 else "fail"
    label = f"Winston eval {environment} ({suite})" if environment else f"Winston eval ({suite})"
    line = (
        f"- **{label}** - {status_icon}: {passed} pass / {failed} fail · "
        f"[{stamp}](./{rel_path.as_posix()})  _updated {stamp} UTC_"
    )

    text = latest_path.read_text()
    pattern = re.compile(rf"^- \*\*{re.escape(label)}\*\*.*$", re.MULTILINE)
    if pattern.search(text):
        new_text = pattern.sub(line, text, count=1)
    else:
        # Insert at end of file with a trailing newline.
        new_text = text.rstrip() + "\n" + line + "\n"
    latest_path.write_text(new_text)


__all__ = ["write_docs_report"]
