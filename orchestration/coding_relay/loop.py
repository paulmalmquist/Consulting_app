"""The bounded build/scan/test/review loop.

States: ITERATING{BUILD -> SCAN -> TEST -> REVIEW} -> terminal.

Terminal states and exit codes (also in docs/reference/CODING_RELAY.md):

    PASS         0   reviewer verdict "pass"
    MAX_ITER     1   iterations exhausted on "continue"
    (intake)     2   handled before the loop
    (cli)        3   handled before the loop
    SAFETY_STOP  4   stop-severity safety violation
    BLOCKED      5   reviewer "blocked", "risk_escalation", unparseable
                     verdict after retry, or an escalate-severity violation
    ERROR        6   builder/reviewer nonzero exit, timeout, internal error

Providers are injected as callables so fixtures.FakeProviders can drive
the whole loop without any CLI.
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from orchestration.coding_relay import prompts, safety, test_runner, verdict as verdict_mod
from orchestration.coding_relay.intake import IntakeResult
from orchestration.coding_relay.providers import AdapterResult
from orchestration.coding_relay.runs import RunPaths
from orchestration.coding_relay.worktree import RelayWorktree

PASS, MAX_ITER, SAFETY_STOP, BLOCKED, ERROR = (
    "PASS", "MAX_ITER", "SAFETY_STOP", "BLOCKED", "ERROR",
)
EXIT_CODES = {PASS: 0, MAX_ITER: 1, SAFETY_STOP: 4, BLOCKED: 5, ERROR: 6}

# Prompt-embedded diff cap. The full diff (itself capped at DIFF_ARTIFACT_CAP)
# lives in the review bundle the reviewer can open.
DIFF_PROMPT_CAP = 150_000
DIFF_ARTIFACT_CAP = 2_000_000


@dataclass
class LoopConfig:
    max_iterations: int = 3
    run_tests: bool = True
    allow_migrations: bool = False
    allow_relay_self_edit: bool = False
    codex_effort: str = "low"
    codex_max_effort: str = "medium"
    codex_repo_access: bool = False  # changes bundle wording only
    primary_root: Optional[Path] = None  # for venv resolution


@dataclass
class LoopOutcome:
    state: str
    exit_code: int
    iterations_run: int = 0
    verdicts: list = field(default_factory=list)  # Verdict objects, in order
    last_test_results: list = field(default_factory=list)  # SuiteResult objects
    violations: list = field(default_factory=list)  # Violation objects
    detail: str = ""


def _git(worktree: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(worktree), *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )


def collect_snapshot(worktree: Path, base_sha: str) -> safety.DiffSnapshot:
    """Stage everything and read the cumulative diff vs the recorded base.

    Diffing against base_sha (not HEAD) means changes the builder smuggled
    into its own commits are still visible to the scanner, the tests, and
    the reviewer. Deletions are counted with rename detection off so a mass
    move counts as deletions (the pre-commit hook it mirrors misses that).
    """
    _git(worktree, "add", "-A")
    diff = _git(worktree, "diff", "--cached", base_sha).stdout
    changed = [
        p for p in _git(worktree, "diff", "--cached", base_sha, "--name-only").stdout.splitlines()
        if p.strip()
    ]
    deleted = [
        p for p in _git(
            worktree, "-c", "diff.renames=false",
            "diff", "--cached", base_sha, "--diff-filter=D", "--name-only",
        ).stdout.splitlines()
        if p.strip()
    ]
    numstat = [
        ln for ln in _git(worktree, "diff", "--cached", base_sha, "--numstat").stdout.splitlines()
        if ln.strip()
    ]
    return safety.DiffSnapshot(
        diff_text=diff, changed_paths=changed, deleted_paths=deleted, numstat=numstat,
    )


def _diff_stat(worktree: Path, base_sha: str) -> str:
    return _git(worktree, "diff", "--cached", base_sha, "--stat").stdout


def head_moved(worktree: Path, base_sha: str) -> bool:
    """True when the builder created commits (the relay owns all commits)."""
    head = _git(worktree, "rev-parse", "HEAD").stdout.strip()
    return bool(head) and head != base_sha


def _run_meta_excerpt(run_paths: RunPaths) -> dict:
    """Redacted, reviewer-relevant excerpt of run.json (never the full file)."""
    import json as _json

    keys = (
        "run_id", "relay_version", "title", "base_ref", "base_sha", "branch",
        "worktree", "max_iterations", "escalations", "providers", "codex_model",
        "state",
    )
    try:
        data = _json.loads(run_paths.run_json.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    return {k: data[k] for k in keys if k in data}


def _artifact_manifest(run_paths: RunPaths) -> list:
    """Run-folder files existing at review time, run-root relative."""
    files = []
    for f in sorted(run_paths.root.rglob("*")):
        if f.is_file():
            files.append(f.relative_to(run_paths.root).as_posix())
    return files


def _availability_note(iteration: int) -> str:
    return (
        "Artifact availability at review time:\n"
        "- Already written (see manifest): run.json, plan/, env/, this "
        "iteration's diff, safety.json, tests, and this bundle.\n"
        f"- Written AFTER this review, so they cannot appear yet: "
        f"iterations/{iteration:02d}/verdict.json (built from YOUR response), "
        "report/final-report.md, report/PR_BODY.md. The relay writes the "
        "final report and PR body for every run that reaches the loop; "
        "judge 'final report is written'-style criteria as met when the "
        "manifest and run metadata show the run is on that path.\n"
    )


def _bundle_summary(
    run_paths: RunPaths,
    iteration: int,
    snapshot: safety.DiffSnapshot,
    diff_stat: str,
    test_results: list,
    builder_tail: str,
    violations: list,
    repo_access: bool = False,
) -> str:
    """Write the review bundle files and return the prompt-embedded summary."""
    import json as _json

    n = iteration
    bundle_rel = f"iterations/{n:02d}/review-bundle"
    run_meta = _run_meta_excerpt(run_paths)
    run_paths.write_json(f"{bundle_rel}/run-meta.json", run_meta)
    run_paths.write_json(f"{bundle_rel}/safety.json", [v.__dict__ for v in violations])
    run_paths.write_json(f"{bundle_rel}/tests-summary.json", [r.to_payload() for r in test_results])
    manifest = _artifact_manifest(run_paths)
    run_paths.write(f"{bundle_rel}/manifest.txt", "\n".join(manifest) + "\n")
    availability = _availability_note(n)
    run_paths.write(f"{bundle_rel}/availability.md", availability)
    diff_for_artifact = snapshot.diff_text
    truncated_artifact = len(diff_for_artifact) > DIFF_ARTIFACT_CAP
    if truncated_artifact:
        diff_for_artifact = diff_for_artifact[:DIFF_ARTIFACT_CAP] + "\n[diff truncated at 2MB]\n"
    run_paths.write(f"{bundle_rel}/diff.patch", diff_for_artifact)
    run_paths.write(f"{bundle_rel}/diff-stat.txt", diff_stat)
    run_paths.write(f"{bundle_rel}/files.txt", "\n".join(snapshot.changed_paths) + "\n")
    tests_md = "\n".join(r.summary_line() for r in test_results) or "No suites were run."
    run_paths.write(f"{bundle_rel}/tests-summary.md", tests_md + "\n")
    run_paths.write(f"{bundle_rel}/builder-summary.md", builder_tail + "\n")

    bundle_abs = run_paths.review_bundle_dir(n)
    bundle_files = (
        "diff.patch, diff-stat.txt, files.txt, tests-summary.md, "
        "tests-summary.json, builder-summary.md, run-meta.json, safety.json, "
        "manifest.txt, availability.md"
    )
    if repo_access:
        bundle_line = (
            f"You have repository access at your working directory; the review "
            f"bundle files ({bundle_files}) live at {bundle_abs}"
        )
        diff_location = f"the full diff is {bundle_abs / 'diff.patch'}"
    else:
        bundle_line = f"Bundle files in your working directory: {bundle_files}"
        diff_location = "the full diff is diff.patch in your working directory"
    diff_for_prompt = snapshot.diff_text
    diff_note = ""
    if len(diff_for_prompt) > DIFF_PROMPT_CAP:
        diff_for_prompt = diff_for_prompt[:DIFF_PROMPT_CAP]
        diff_note = f"\n[diff truncated in this prompt; {diff_location}]\n"
    return (
        f"{bundle_line}\n\n"
        "### Run metadata (redacted excerpt of run.json)\n"
        + _json.dumps(run_meta, indent=2, default=str)
        + f"\n\n### Run-folder artifact manifest ({len(manifest)} files at review time)\n"
        + "\n".join(manifest[:300])
        + "\n\n### Artifact availability\n" + availability
        + "\n### Safety scan (this iteration)\n"
        + (_json.dumps([v.__dict__ for v in violations], default=str) if violations else "[] (no violations)")
        + f"\n\n### Changed files ({len(snapshot.changed_paths)})\n"
        + "\n".join(snapshot.changed_paths[:200])
        + "\n\n### Diff stat\n" + diff_stat
        + "\n### Tests\n" + tests_md
        + "\n\n### Builder summary (tail)\n" + builder_tail
        + "\n\n### Diff\n```diff\n" + diff_for_prompt + "\n```" + diff_note
    )


def _feedback_text(v) -> str:
    lines = [f"Reviewer summary: {v.summary}", ""]
    unmet = [c for c in v.criteria_status if c.get("status") in ("unmet", "unknown")]
    if unmet:
        lines.append("Unmet or unverified criteria:")
        lines += [f"- {c['id']}: {c['text']} ({c['status']}; {c.get('evidence', '')})" for c in unmet]
        lines.append("")
    if v.required_next_steps:
        lines.append("Required next steps:")
        lines += [f"- {s}" for s in v.required_next_steps]
        lines.append("")
    if v.plan_refinements:
        lines.append("Plan refinements (repo facts invalidated assumptions):")
        lines += [f"- {s}" for s in v.plan_refinements]
        lines.append("")
    if v.tests_to_run_next:
        lines.append("Tests the reviewer wants run:")
        lines += [f"- {s}" for s in v.tests_to_run_next]
    return "\n".join(lines)


def run_loop(
    cfg: LoopConfig,
    intake: IntakeResult,
    wt: RelayWorktree,
    run_paths: RunPaths,
    build: Callable[[str], AdapterResult],
    review: Callable[[str, Path, str], AdapterResult],
    log: Callable[[str], None] = print,
    on_continue: Optional[Callable] = None,
) -> LoopOutcome:
    """on_continue(iteration, verdict, test_results, violations) -> bool is
    called after a 'continue' verdict when another iteration remains; False
    stops the run (MAX_ITER semantics: work preserved, exit 1)."""
    outcome = LoopOutcome(state=ERROR, exit_code=EXIT_CODES[ERROR])
    reviewer_feedback: Optional[str] = None
    test_failures: Optional[str] = None

    for iteration in range(1, cfg.max_iterations + 1):
        outcome.iterations_run = iteration
        it_rel = f"iterations/{iteration:02d}"
        log(f"[iteration {iteration}/{cfg.max_iterations}] BUILD")

        # ---- BUILD
        b_prompt = prompts.builder_prompt(
            intake.plan_text, intake.criteria, iteration, cfg.max_iterations,
            reviewer_feedback, test_failures,
        )
        run_paths.write(f"{it_rel}/build-prompt.md", b_prompt)
        b_res = build(b_prompt)
        run_paths.write(f"{it_rel}/build-output.md", b_res.stdout)
        if b_res.stderr.strip():
            run_paths.write(f"{it_rel}/build-stderr.txt", b_res.stderr)
        run_paths.write_json(f"{it_rel}/build-meta.json", b_res.meta())
        if not b_res.ok:
            outcome.state, outcome.exit_code = ERROR, EXIT_CODES[ERROR]
            outcome.detail = f"builder exited {b_res.exit_code}; see {it_rel}/build-stderr.txt"
            log(f"[iteration {iteration}] builder failed (exit {b_res.exit_code}); stopping")
            return outcome

        # ---- SCAN
        snapshot = collect_snapshot(wt.path, wt.base_sha)
        diff_stat = _diff_stat(wt.path, wt.base_sha)
        run_paths.write(f"{it_rel}/diff.patch", snapshot.diff_text[:DIFF_ARTIFACT_CAP])
        run_paths.write(f"{it_rel}/diff-stat.txt", diff_stat)
        violations = safety.scan(
            wt.path, snapshot, intake.plan_text,
            allow_migrations=cfg.allow_migrations,
            allow_relay_self_edit=cfg.allow_relay_self_edit,
        )
        if head_moved(wt.path, wt.base_sha):
            violations.append(
                safety.Violation(
                    "builder_committed", safety.STOP,
                    "The builder created git commits; the relay owns all "
                    "commits. The diff above still covers the committed "
                    "changes (diffed against the base), but the run stops.",
                )
            )
        run_paths.write_json(f"{it_rel}/safety.json", [v.__dict__ for v in violations])
        outcome.violations.extend(violations)
        if safety.stops(violations):
            outcome.state, outcome.exit_code = SAFETY_STOP, EXIT_CODES[SAFETY_STOP]
            outcome.detail = "; ".join(f"{v.rule}: {v.detail}" for v in safety.stops(violations))
            log(f"[iteration {iteration}] SAFETY STOP: {outcome.detail}")
            return outcome
        if safety.escalations(violations):
            outcome.state, outcome.exit_code = BLOCKED, EXIT_CODES[BLOCKED]
            outcome.detail = (
                "risk escalation from safety scan: "
                + "; ".join(f"{v.rule}: {v.detail}" for v in safety.escalations(violations))
                + f". Inspect the worktree at {wt.path} and decide by hand; the "
                "relay does not continue past escalations on its own."
            )
            log(f"[iteration {iteration}] RISK ESCALATION: {outcome.detail}")
            return outcome

        # ---- TEST
        test_results: list = []
        if cfg.run_tests and snapshot.changed_paths:
            py, py_desc = test_runner.resolve_python(wt.path, cfg.primary_root)
            suites = test_runner.infer_suites(snapshot.changed_paths, py)
            if suites:
                log(f"[iteration {iteration}] TEST ({len(suites)} suites)")
            test_results = test_runner.run_suites(
                wt.path, suites, f"{it_rel}/tests", py_desc, write=run_paths.write,
            )
            run_paths.write_json(
                f"{it_rel}/tests/summary.json", [r.to_payload() for r in test_results]
            )
            for r in test_results:
                log(f"  {r.summary_line()}")
        outcome.last_test_results = test_results
        test_failures = test_runner.failing_excerpt(test_results, run_paths.root) or None

        # ---- REVIEW
        # A stricter final review: bump effort to the ceiling on the last
        # allowed iteration (model never changes).
        effort = cfg.codex_effort if iteration < cfg.max_iterations else cfg.codex_max_effort
        builder_tail = b_res.stdout.strip()[-2000:]
        bundle_summary = _bundle_summary(
            run_paths, iteration, snapshot, diff_stat, test_results, builder_tail,
            violations, repo_access=cfg.codex_repo_access,
        )
        r_prompt = prompts.reviewer_prompt(
            intake.plan_text, intake.criteria, iteration, bundle_summary,
        )
        run_paths.write(f"{it_rel}/review-prompt.md", r_prompt)
        bundle_dir = run_paths.review_bundle_dir(iteration)
        log(f"[iteration {iteration}] REVIEW (effort {effort})")
        r_res = review(r_prompt, bundle_dir, effort)
        run_paths.write(f"{it_rel}/review-output.txt", r_res.stdout)
        if r_res.stderr.strip():
            run_paths.write(f"{it_rel}/review-stderr.txt", r_res.stderr)
        run_paths.write_json(f"{it_rel}/review-meta.json", r_res.meta())
        if not r_res.ok:
            outcome.state, outcome.exit_code = ERROR, EXIT_CODES[ERROR]
            outcome.detail = f"reviewer exited {r_res.exit_code}; see {it_rel}/review-stderr.txt"
            log(f"[iteration {iteration}] reviewer failed (exit {r_res.exit_code}); stopping")
            return outcome

        v = verdict_mod.parse_verdict(r_res.stdout)
        if v is None:
            log(f"[iteration {iteration}] verdict unparseable; one JSON-only retry")
            retry_res = review(r_prompt + verdict_mod.RETRY_NUDGE, bundle_dir, effort)
            run_paths.write(f"{it_rel}/review-output-retry.txt", retry_res.stdout)
            run_paths.write_json(f"{it_rel}/review-retry-meta.json", retry_res.meta())
            v = verdict_mod.parse_verdict(retry_res.stdout) if retry_res.ok else None
        if v is None:
            outcome.state, outcome.exit_code = BLOCKED, EXIT_CODES[BLOCKED]
            outcome.detail = (
                "reviewer did not return a valid JSON verdict after one retry; "
                f"raw output saved under {it_rel}/. Treating as blocked."
            )
            log(f"[iteration {iteration}] {outcome.detail}")
            return outcome

        run_paths.write_json(f"{it_rel}/verdict.json", v.to_payload())
        outcome.verdicts.append(v)
        log(f"[iteration {iteration}] verdict: {v.status} - {v.summary[:120]}")

        if v.status == "pass":
            outcome.state, outcome.exit_code = PASS, EXIT_CODES[PASS]
            outcome.detail = v.summary
            return outcome
        if v.status == "blocked":
            outcome.state, outcome.exit_code = BLOCKED, EXIT_CODES[BLOCKED]
            outcome.detail = f"reviewer blocked: {v.summary}"
            return outcome
        if v.status == "risk_escalation":
            outcome.state, outcome.exit_code = BLOCKED, EXIT_CODES[BLOCKED]
            outcome.detail = (
                f"reviewer escalated risk: {v.summary}. Risk flags: "
                f"{'; '.join(v.risk_flags) or '(none listed)'}. A human must "
                f"approve before this continues; inspect {wt.path}."
            )
            return outcome
        # "continue": carry feedback into the next builder pass; the
        # operator may stop here in guided mode.
        if on_continue is not None and iteration < cfg.max_iterations:
            if not on_continue(iteration, v, test_results, violations):
                outcome.state, outcome.exit_code = MAX_ITER, EXIT_CODES[MAX_ITER]
                outcome.detail = (
                    f"operator stopped after iteration {iteration} (last "
                    "verdict 'continue'). The worktree is preserved for "
                    "inspection or a re-run."
                )
                return outcome
        reviewer_feedback = _feedback_text(v)

    outcome.state, outcome.exit_code = MAX_ITER, EXIT_CODES[MAX_ITER]
    outcome.detail = (
        f"max iterations ({cfg.max_iterations}) reached; last verdict was "
        "'continue'. The worktree is preserved for inspection or a re-run."
    )
    return outcome
