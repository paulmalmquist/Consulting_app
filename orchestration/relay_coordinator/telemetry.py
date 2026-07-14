"""Relay telemetry: derive one row per completed run from the run folder,
aggregate rows, and print a per-(builder_model, task_class) report.

    python -m orchestration.relay_coordinator.telemetry report
    python -m orchestration.relay_coordinator.telemetry backfill

The recorder is honest by construction: if the run folder does not prove
which builder model was used, the row's builder_model is null with
model_resolution "cli_default_unreported". A fabricated attribution would
silently poison the routing evidence this module exists to produce.

Storage is append-only JSONL at .orchestration/telemetry/runs.jsonl.
Nothing here mutates the run folders it reads.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

TELEMETRY_RELPATH = ".orchestration/telemetry/runs.jsonl"
RUNS_RELPATH = ".orchestration/runs"

# Loop states → aggregate outcome names. BLOCKED is disambiguated by
# inspecting the final verdict (risk_escalation vs blocked).
_STATE_TO_OUTCOME = {
    "PASS": "pass",
    "MAX_ITER": "max_iter",
    "SAFETY_STOP": "safety_stop",
    "BLOCKED": "blocked",
    "ERROR": "error",
}

# Terminal relay states — a "completed run" for telemetry purposes. Runs
# still in flight (e.g. STARTED) must not be aggregated: their iteration
# counts, outcomes, and findings are all mid-motion and would poison the
# per-model evidence this module exists to produce.
TERMINAL_STATES = frozenset(_STATE_TO_OUTCOME.keys())


@dataclass
class SuitePhaseSummary:
    pass_count: int
    fail_count: int
    skip_count: int
    first_pass_tests: str  # "true" | "false" | "no_suites" | "skipped"
    elapsed_s: float


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _diff_stat_counts(text: str) -> tuple[int, int, int]:
    """Return (files_changed, lines_added, lines_deleted) from git diff --stat.

    The final line of `git diff --stat` looks like:
        3 files changed, 42 insertions(+), 5 deletions(-)
    Either insertion or deletion may be absent.
    """
    if not text:
        return (0, 0, 0)
    files = added = deleted = 0
    tail = text.strip().splitlines()[-1] if text.strip() else ""
    m = re.search(r"(\d+)\s+files? changed", tail)
    if m:
        files = int(m.group(1))
    m = re.search(r"(\d+)\s+insertion", tail)
    if m:
        added = int(m.group(1))
    m = re.search(r"(\d+)\s+deletion", tail)
    if m:
        deleted = int(m.group(1))
    return (files, added, deleted)


def _classify_suites(suite_rows: list[dict]) -> SuitePhaseSummary:
    """Classify one iteration's tests/summary.json.

    A SKIPPED suite is never counted as a pass. When every suite passed,
    first_pass_tests is "true". If any suite failed, "false". If there
    were no suites at all, "no_suites". If suites existed but every one
    was skipped, "skipped" — a silently disabled suite must never
    masquerade as a green first pass.
    """
    if not suite_rows:
        return SuitePhaseSummary(0, 0, 0, "no_suites", 0.0)
    passes = fails = skips = 0
    elapsed = 0.0
    for r in suite_rows:
        elapsed += float(r.get("duration_s") or 0.0)
        if r.get("skipped"):
            skips += 1
        elif r.get("exit_code") == 0:
            passes += 1
        else:
            fails += 1
    if fails > 0:
        verdict = "false"
    elif passes == 0 and skips > 0:
        verdict = "skipped"
    elif passes > 0:
        verdict = "true"
    else:
        verdict = "no_suites"
    return SuitePhaseSummary(passes, fails, skips, verdict, round(elapsed, 3))


def _findings_from_verdict(verdict_payload: dict | None) -> dict[str, int]:
    if not verdict_payload:
        return {"unmet": 0, "unknown": 0, "risk_flags": 0}
    criteria = verdict_payload.get("criteria_status") or []
    unmet = sum(1 for c in criteria if c.get("status") == "unmet")
    unknown = sum(1 for c in criteria if c.get("status") == "unknown")
    flags = len(verdict_payload.get("risk_flags") or [])
    return {"unmet": unmet, "unknown": unknown, "risk_flags": flags}


_PLAN_SLUG_RE = re.compile(r"(\d{3,5}-[a-z0-9][a-z0-9-]*)", re.I)


def _plan_slug_from_path(plan_path: str | None) -> str | None:
    """Extract the ticket id/slug from a plan file path.

    Looks for the `NNNN-slug` pattern in the filename (the plan convention).
    Returns None when the path is absent or does not match.
    """
    if not plan_path:
        return None
    stem = Path(plan_path).stem
    m = _PLAN_SLUG_RE.search(stem)
    if m:
        return m.group(1).lower()
    return stem or None


def _reviewer_model_from_argv(review_meta: dict | None) -> str | None:
    """Return the reviewer model actually passed on the invocation argv.

    Reads the recorded `command` from review-meta.json (written after each
    reviewer subprocess). Proof-by-invocation: if `-m <model>` (or
    `--model=<model>`) is on the argv the CLI actually received, we can
    honestly attribute the reviewer to that model. Anything else is a claim
    we cannot back up from receipts.
    """
    if not review_meta:
        return None
    cmd = review_meta.get("command") or []
    if not isinstance(cmd, list):
        return None
    for i, tok in enumerate(cmd):
        if not isinstance(tok, str):
            continue
        if tok in ("-m", "--model") and i + 1 < len(cmd):
            nxt = cmd[i + 1]
            if isinstance(nxt, str) and nxt.strip():
                return nxt
        if tok.startswith("--model="):
            val = tok.split("=", 1)[1].strip()
            if val:
                return val
    return None


def _plan_task_class(plan_text: str) -> str:
    """Read a `Task class:` line from the plan header, or "unclassified"."""
    if not plan_text:
        return "unclassified"
    for line in plan_text.splitlines()[:80]:
        m = re.match(r"^\s*[-*]?\s*task[_ ]class\s*:\s*([A-Za-z_][A-Za-z0-9_-]*)", line, re.I)
        if m:
            return m.group(1).lower()
    return "unclassified"


def build_row_from_run_folder(run_dir: Path) -> dict | None:
    """Derive one telemetry row from an existing run folder.

    Returns None when the folder has no run.json, or when the run is not
    in a terminal state (e.g. still STARTED). Only completed runs count.
    """
    run_json = _read_json(run_dir / "run.json")
    if not run_json:
        return None
    if run_json.get("state") not in TERMINAL_STATES:
        return None

    plan_md = ""
    plan_path = run_dir / "plan" / "original-plan.md"
    if plan_path.is_file():
        try:
            plan_md = plan_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            plan_md = ""
    plan_slug = plan_md.splitlines()[0].lstrip("# ").strip() if plan_md else ""
    task_class = _plan_task_class(plan_md)

    # Iterations: read verdict + tests + timing + safety per iteration.
    iter_root = run_dir / "iterations"
    per_iteration: list[dict] = []
    build_ms = test_s = review_ms = 0
    review_ms_total = 0
    total_safety = 0
    first_pass_tests: str | None = None
    reviewer_model_from_argv: str | None = None
    if iter_root.is_dir():
        for it_dir in sorted(iter_root.iterdir()):
            if not it_dir.is_dir():
                continue
            try:
                idx = int(it_dir.name)
            except ValueError:
                continue
            build_meta = _read_json(it_dir / "build-meta.json") or {}
            review_meta = _read_json(it_dir / "review-meta.json") or {}
            verdict = _read_json(it_dir / "verdict.json")
            safety = _read_json(it_dir / "safety.json") or []
            suites = _read_json(it_dir / "tests" / "summary.json") or []
            phase = _classify_suites(suites if isinstance(suites, list) else [])
            findings = _findings_from_verdict(verdict)
            build_ms += int(build_meta.get("duration_ms") or 0)
            review_ms += int(review_meta.get("duration_ms") or 0)
            review_ms_total += int(review_meta.get("duration_ms") or 0)
            if reviewer_model_from_argv is None:
                reviewer_model_from_argv = _reviewer_model_from_argv(review_meta)
            test_s += phase.elapsed_s
            total_safety += len(safety) if isinstance(safety, list) else 0
            if idx == 1:
                first_pass_tests = phase.first_pass_tests
            per_iteration.append({
                "iteration": idx,
                "verdict_status": (verdict or {}).get("status"),
                "unmet": findings["unmet"],
                "unknown": findings["unknown"],
                "risk_flags": findings["risk_flags"],
                "tests_pass": phase.pass_count,
                "tests_fail": phase.fail_count,
                "tests_skip": phase.skip_count,
            })

    # Outcome: BLOCKED disambiguated by the last verdict.
    state = run_json.get("state") or "ERROR"
    outcome = _STATE_TO_OUTCOME.get(state, "error")
    if outcome == "blocked" and per_iteration:
        last_status = per_iteration[-1].get("verdict_status")
        if last_status == "risk_escalation":
            outcome = "risk_escalation"

    final = per_iteration[-1] if per_iteration else {"unmet": 0, "unknown": 0, "risk_flags": 0}
    files, added, deleted = 0, 0, 0
    # Prefer the review-bundle diff-stat of the last iteration; fall back to
    # the per-iteration diff-stat.txt. Either is honest git output.
    if per_iteration:
        last_idx = per_iteration[-1]["iteration"]
        for candidate in (
            iter_root / f"{last_idx:02d}" / "review-bundle" / "diff-stat.txt",
            iter_root / f"{last_idx:02d}" / "diff-stat.txt",
        ):
            if candidate.is_file():
                try:
                    files, added, deleted = _diff_stat_counts(
                        candidate.read_text(encoding="utf-8", errors="replace")
                    )
                except OSError:
                    pass
                break

    # Builder model: honest recording only.
    builder_model = run_json.get("claude_model")
    builder_resolution = run_json.get(
        "claude_model_resolution",
        "cli_default_unreported" if builder_model in (None, "(cli default)") else "legacy_recorded",
    )
    if builder_model == "(cli default)":
        # Legacy runs recorded the literal string; the row must not carry it.
        builder_model = None
        builder_resolution = "cli_default_unreported"

    # Reviewer model: verified from actual invocation argv when available
    # (proof-by-receipts). Falls back to run.json's codex_model only when
    # the relay recorded it because the -m flag was actually passed. A run
    # that could not prove which reviewer model ran gets null + a marker,
    # never a guessed name.
    reviewer_model_recorded = run_json.get("codex_model")
    if reviewer_model_recorded in (None, "(cli default)"):
        reviewer_model_recorded = None
    if reviewer_model_from_argv:
        reviewer_model = reviewer_model_from_argv
        reviewer_resolution = "verified_from_invocation_argv"
    elif reviewer_model_recorded:
        reviewer_model = reviewer_model_recorded
        reviewer_resolution = run_json.get(
            "codex_model_resolution", "cli_flag_passed"
        )
    else:
        reviewer_model = None
        reviewer_resolution = run_json.get(
            "codex_model_resolution", "cli_default_unreported"
        )
    reviewer_model_requested = run_json.get("codex_model_requested")

    total_ms = build_ms + review_ms_total + int(test_s * 1000)
    plan_id = _plan_slug_from_path(run_json.get("plan_path")) or plan_slug or run_json.get("run_id")
    row = {
        "run_id": run_json.get("run_id"),
        "plan": plan_id,
        "plan_path": run_json.get("plan_path"),
        "plan_title": run_json.get("title") or plan_slug,
        "task_class": task_class,
        "base_sha": run_json.get("base_sha"),
        "builder_model": builder_model,
        "builder_model_resolution": builder_resolution,
        "reviewer_model": reviewer_model,
        "reviewer_model_resolution": reviewer_resolution,
        "reviewer_model_requested": reviewer_model_requested,
        "reviewer_effort": run_json.get("codex_effort"),
        "reviewer_max_effort": run_json.get("codex_max_effort"),
        "iterations_used": run_json.get("iterations_run") or len(per_iteration),
        "max_iterations": run_json.get("max_iterations"),
        "outcome": outcome,
        "exit_code": run_json.get("exit_code"),
        "first_pass_tests": first_pass_tests or "no_suites",
        "review_findings_per_iteration": per_iteration,
        "final_unmet": final.get("unmet", 0),
        "final_unknown": final.get("unknown", 0),
        "final_risk_flags": final.get("risk_flags", 0),
        "files_changed": files,
        "lines_added": added,
        "lines_deleted": deleted,
        "elapsed_s": {
            "build": round(build_ms / 1000, 3),
            "test": round(test_s, 3),
            "review": round(review_ms_total / 1000, 3),
            "total": round(total_ms / 1000, 3),
        },
        "safety_violations": total_safety,
        # `rejected` means the REVIEWER judged the work unfit. That is a signal
        # about the builder model's output quality, and it is what the routing
        # evidence is for.
        #
        # A `safety_stop` is deliberately NOT a rejection. It means the builder
        # touched a protected surface (relay self-edit, an unapproved migration,
        # an auth path), which the harness caught. That is a signal about SCOPE,
        # not competence: the code may be perfectly good and still be stopped.
        # Folding it into `rejected` would overstate the rejection rate and
        # penalise whichever model happened to touch protected code, poisoning
        # the very routing evidence this module exists to produce. This ticket's
        # own run is the case in point: it was safety-stopped for a relay
        # self-edit the plan explicitly called for.
        "rejected": outcome in ("blocked", "risk_escalation"),
        "rejection_reason": run_json.get("detail") if outcome in (
            "blocked", "risk_escalation",
        ) else None,
        # Recorded separately so the signal is kept rather than lost.
        "safety_stopped": outcome == "safety_stop",
        "safety_stop_reason": run_json.get("detail") if outcome == "safety_stop" else None,
    }
    return row


def emit_row(telemetry_path: Path, row: dict) -> None:
    telemetry_path.parent.mkdir(parents=True, exist_ok=True)
    with telemetry_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, default=str) + "\n")


def read_rows(telemetry_path: Path) -> list[dict]:
    if not telemetry_path.is_file():
        return []
    rows: list[dict] = []
    for line in telemetry_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s:
            continue
        try:
            rows.append(json.loads(s))
        except json.JSONDecodeError:
            continue
    return rows


def aggregate(rows: Iterable[dict]) -> list[dict]:
    """Aggregate rows per (builder_model, task_class)."""
    groups: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        key = (
            r.get("builder_model") if r.get("builder_model") is not None else "(unreported)",
            r.get("task_class") or "unclassified",
        )
        groups.setdefault(key, []).append(r)

    out: list[dict] = []
    for (bm, tc), recs in sorted(groups.items(), key=lambda kv: (str(kv[0][0]), kv[0][1])):
        n = len(recs)
        passes = sum(1 for r in recs if r.get("outcome") == "pass")
        rejects = sum(1 for r in recs if r.get("rejected"))
        first_true = sum(1 for r in recs if r.get("first_pass_tests") == "true")
        first_eligible = sum(
            1 for r in recs if r.get("first_pass_tests") in ("true", "false", "skipped")
        )
        mean_iter = sum((r.get("iterations_used") or 0) for r in recs) / n
        mean_find = sum(
            ((r.get("final_unmet") or 0) + (r.get("final_unknown") or 0) + (r.get("final_risk_flags") or 0))
            for r in recs
        ) / n
        mean_elapsed = sum(((r.get("elapsed_s") or {}).get("total") or 0.0) for r in recs) / n
        # Reported alongside, never folded into, the rejection rate: a safety
        # stop says the builder touched a protected surface, not that its work
        # was poor. Keeping the two columns apart is what lets an operator see
        # "this model gets stopped on scope a lot" without mistaking it for
        # "this model writes bad code".
        safety_stops = sum(1 for r in recs if r.get("safety_stopped"))
        out.append({
            "builder_model": bm,
            "task_class": tc,
            "runs": n,
            "pass_rate": round(passes / n, 3),
            "rejection_rate": round(rejects / n, 3),
            "safety_stop_rate": round(safety_stops / n, 3),
            "mean_iterations": round(mean_iter, 3),
            "first_pass_test_rate": round(first_true / first_eligible, 3) if first_eligible else None,
            "mean_review_findings": round(mean_find, 3),
            "mean_elapsed_s": round(mean_elapsed, 3),
        })
    return out


def format_report(agg: list[dict]) -> str:
    header = (
        "builder_model", "task_class", "runs", "pass_rate", "rejection_rate",
        "safety_stop_rate", "mean_iterations", "first_pass_test_rate",
        "mean_review_findings", "mean_elapsed_s",
    )
    lines = [" | ".join(header)]
    if not agg:
        lines.append("(no runs recorded)")
        return "\n".join(lines) + "\n"
    for r in agg:
        fpr = r["first_pass_test_rate"]
        lines.append(" | ".join(str(v) for v in (
            r["builder_model"], r["task_class"], r["runs"],
            r["pass_rate"], r["rejection_rate"], r["safety_stop_rate"],
            r["mean_iterations"],
            "n/a" if fpr is None else fpr,
            r["mean_review_findings"], r["mean_elapsed_s"],
        )))
    return "\n".join(lines) + "\n"


def backfill(runs_root: Path, telemetry_path: Path) -> int:
    """Read every run folder under runs_root and append one row per run.

    Returns the number of rows written. Existing telemetry_path contents are
    preserved (append-only). The run folders themselves are never modified.
    """
    if not runs_root.is_dir():
        return 0
    existing_ids = {r.get("run_id") for r in read_rows(telemetry_path)}
    written = 0
    for run_dir in sorted(runs_root.iterdir()):
        if not run_dir.is_dir():
            continue
        row = build_row_from_run_folder(run_dir)
        if not row:
            continue
        if row.get("run_id") in existing_ids:
            continue
        emit_row(telemetry_path, row)
        written += 1
    return written


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    parser = argparse.ArgumentParser(
        prog="relay-telemetry",
        description="Aggregate relay run receipts into per-(builder_model, task_class) evidence.",
    )
    parser.add_argument("--repo-root", type=Path, default=_default_repo_root())
    parser.add_argument("--telemetry-path", type=Path, default=None,
                        help=f"Override the append-only store (default {TELEMETRY_RELPATH})")
    parser.add_argument("--runs-root", type=Path, default=None,
                        help=f"Override the runs directory (default {RUNS_RELPATH})")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("report", help="Print the aggregated table.")
    p_back = sub.add_parser("backfill", help="Emit rows for existing run folders.")
    p_back.add_argument("--json", action="store_true", help="Emit one JSON row per line to stdout instead of appending to the store")
    args = parser.parse_args(argv)

    repo_root = args.repo_root.resolve()
    telemetry_path = args.telemetry_path or (repo_root / TELEMETRY_RELPATH)
    runs_root = args.runs_root or (repo_root / RUNS_RELPATH)

    if args.cmd == "report":
        rows = read_rows(telemetry_path)
        sys.stdout.write(format_report(aggregate(rows)))
        return 0

    if args.cmd == "backfill":
        if args.json:
            count = 0
            if runs_root.is_dir():
                for run_dir in sorted(runs_root.iterdir()):
                    if not run_dir.is_dir():
                        continue
                    row = build_row_from_run_folder(run_dir)
                    if row:
                        sys.stdout.write(json.dumps(row, default=str) + "\n")
                        count += 1
            sys.stderr.write(f"[backfill] emitted {count} rows to stdout\n")
            return 0
        n = backfill(runs_root, telemetry_path)
        sys.stderr.write(f"[backfill] appended {n} new rows to {telemetry_path}\n")
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
