"""Coding Relay CLI.

    python -m orchestration.coding_relay --plan docs/plans/.../0016-foo.md
    python scripts/coding_relay.py --plan 0016 --max-iterations 3
    python scripts/coding_relay.py            # guided mode on a TTY

Run with no arguments on a TTY for the guided operator flow; without a TTY
it prints usage plus the numbered list of active plans.
Exit codes: 0 pass, 1 stopped on continue (max iterations or operator), 2
intake/preflight, 3 missing CLI, 4 safety stop, 5 blocked/risk escalation,
6 provider/internal error.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from orchestration.coding_relay import RELAY_VERSION, intake as intake_mod
from orchestration.coding_relay.intake import IntakeError
from orchestration.coding_relay.loop import (
    LoopConfig,
    collect_snapshot,
    run_loop,
)
from orchestration.coding_relay.preflight import PreflightConfig, run_preflight
from orchestration.coding_relay.providers import (
    AdapterUnavailable,
    claude as claude_mod,
    codex as codex_mod,
    probe,
)
from orchestration.coding_relay.report import RunSummary, final_report, pr_body
from orchestration.coding_relay.runs import RunPaths, new_run_id
from orchestration.coding_relay.worktree import (
    create_worktree,
    default_worktree_root,
    ensure_deps_links,
    removal_instructions,
)
from orchestration.coding_relay import pr as pr_mod

DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[2]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="coding_relay",
        description="Bounded Claude-builds / Codex-reviews relay with receipts.",
    )
    p.add_argument("--plan", help="Plan file path, or a filename prefix (e.g. 0016) in docs/plans/03-implementation-plans/active/")
    p.add_argument("--paste-file", help="Read the plan text from this file instead of --plan")
    p.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT, help=argparse.SUPPRESS)
    p.add_argument("--yes", action="store_true",
                   help="Guided mode: accept prompts non-interactively (never bypasses hard failures)")
    p.add_argument("--max-iterations", type=int, default=3, help="Build/review iterations cap (default 3)")
    p.add_argument("--base", default="origin/main", help="Base ref for the relay worktree (default origin/main)")
    p.add_argument("--allow-stale-base", action="store_true", help="Proceed on the local base ref if git fetch fails (recorded)")
    p.add_argument("--worktree-root", type=Path, help="Directory for relay worktrees (default: sibling <repo>_relay)")
    p.add_argument("--claude-model", help="Builder model; passed only if the installed CLI advertises --model")
    p.add_argument("--claude-permission-mode", default="acceptEdits", choices=["acceptEdits", "bypassPermissions"])
    p.add_argument("--claude-timeout", type=int, default=1800)
    p.add_argument("--codex-model", default="gpt-5.4", help="Reviewer model, pinned for the run (default gpt-5.4)")
    p.add_argument("--codex-effort", default="low", choices=list(codex_mod.EFFORT_LADDER))
    p.add_argument("--codex-max-effort", default="medium", choices=list(codex_mod.EFFORT_LADDER),
                   help="Effort used for the final allowed iteration's review")
    p.add_argument("--codex-timeout", type=int, default=900)
    p.add_argument("--codex-repo-access", action="store_true",
                   help="RISK ESCALATION (recorded): give the reviewer full worktree access instead of the artifact bundle")
    p.add_argument("--no-tests", action="store_true", help="Skip test suites (reported honestly)")
    pr_group = p.add_mutually_exclusive_group()
    pr_group.add_argument("--no-pr", action="store_true", help="Never create a PR")
    pr_group.add_argument("--draft-pr", action="store_true",
                          help="Also create a draft PR on MAX_ITER (never after a safety stop or block)")
    p.add_argument("--allow-migrations", action="store_true", help="Let the builder touch DB schema/migration paths")
    p.add_argument("--allow-relay-self-edit", action="store_true",
                   help="RECORDED: let the builder edit orchestration/coding_relay/ itself")
    p.add_argument("--keep-env", action="store_true", help="Do not scrub CLAUDE* env vars from the builder subprocess")
    p.add_argument("--dry-run", action="store_true",
                   help="Validate the plan and preflight, print every command; no worktree, no writes, no providers")
    p.add_argument("--probe-clis", action="store_true", help="With --dry-run: also run `--help` capability probes")
    p.add_argument("--fixture", type=Path, help="Drive the loop from a fixture dir (no CLIs, no tokens)")
    p.add_argument("--version", action="version", version=f"coding-relay {RELAY_VERSION}")
    return p


def print_no_args_help(repo_root: Path) -> int:
    print("Coding Relay: give it a plan with explicit success criteria.\n")
    print("Usage:  python -m orchestration.coding_relay --plan <path|NNNN>")
    print("        python scripts/coding_relay.py --plan <path|NNNN>")
    print("        python scripts/coding_relay.py          (guided mode, TTY)\n")
    plans = intake_mod.list_active_plans(repo_root)
    if plans:
        print("Active plans (docs/plans/03-implementation-plans/active/):")
        for i, p in enumerate(plans, 1):
            print(f"  {i:2d}. {p.name}")
        print("\nExample:")
        print(f"  python -m orchestration.coding_relay --plan {plans[0].name.split('-')[0]} --dry-run")
    else:
        print("No active plans found; pass --plan <path> or --paste-file <path>.")
    print("\nA plan MUST contain a 'Success Criteria' / 'Acceptance Criteria' /")
    print("'Definition of Done' heading with concrete bullets, or the relay refuses.")
    print("Docs: docs/reference/CODING_RELAY.md")
    return 2


def _preflight_config(args, result, read_only: bool = False) -> PreflightConfig:
    return PreflightConfig(
        repo_root=args.repo_root.resolve(),
        base_ref=args.base,
        allow_stale_base=args.allow_stale_base,
        pr_requested=not args.no_pr,
        plan_path=result.plan_path,
        worktree_root=args.worktree_root,
        fixture_mode=args.fixture is not None,
        fixture_dir=args.fixture,
        read_only=read_only,
    )


def _preflight_exit_code(checks) -> int:
    failed_names = {c.name for c in checks.failures()}
    return 3 if {"claude-cli", "codex-cli"} & failed_names else 2


def do_dry_run(args, result) -> int:
    """Strict dry run: nothing written, no worktree, no providers.
    Capability probes only with --probe-clis."""
    print(f"[dry-run] plan accepted: {result.title} (slug {result.slug})")
    print("[dry-run] normalized acceptance criteria:\n")
    print(result.criteria.to_markdown())
    checks = run_preflight(_preflight_config(args, result, read_only=True))
    for c in checks.checks:
        print(f"[preflight] {c.name}: {c.status} - {c.detail}")
    wt_root = args.worktree_root or default_worktree_root(args.repo_root)
    print("\n[dry-run] a real run would:")
    print(f"  1. create worktree under {wt_root} on branch relay/{result.slug}-<timestamp> from {args.base}")
    print(f"  2. write receipts to {args.repo_root / '.orchestration' / 'runs'}/<run_id>/")
    if args.fixture:
        print(f"  3. drive the loop from fixture {args.fixture}")
    else:
        print(f"  3. builder:  claude -p --permission-mode {args.claude_permission_mode} --add-dir <worktree>")
        print(f"  4. reviewer: codex exec --cd <review-bundle> --skip-git-repo-check -m {args.codex_model} "
              f"-c model_reasoning_effort={args.codex_effort} -")
    print(f"  5. iterate up to {args.max_iterations}x: build -> safety scan -> tests -> review")
    print("  6. on pass: draft PR via gh (never merge, never force-push)" if not args.no_pr
          else "  6. no PR (--no-pr)")
    if args.probe_clis:
        for name in ("claude", "codex"):
            exe = shutil.which(name)
            if exe:
                caps = probe(exe)
                print(f"[probe] {name}: {len(caps.flags)} flags advertised"
                      f"{'; --model supported' if '--model' in caps.flags else ''}")
            else:
                print(f"[probe] {name}: not on PATH")
    # A dry run is a validation gate: mirror the real exit codes.
    if checks.failed:
        code = _preflight_exit_code(checks)
        print(f"\n[dry-run] wrote nothing, changed nothing. Preflight FAILED; a real run would exit {code}.")
        return code
    print("\n[dry-run] wrote nothing, changed nothing. Exit 0.")
    return 0


def execute_run(args, result, ui) -> int:
    """The shared pipeline after intake: preflight -> receipts -> worktree ->
    loop -> finalize. `ui` supplies the operator decision points; AutoUI
    reproduces the non-interactive policy exactly."""
    repo_root: Path = args.repo_root.resolve()

    # ---- PREFLIGHT (hard failures stop before any mutation, always)
    checks = run_preflight(_preflight_config(args, result))
    from orchestration.coding_relay.guided import render_preflight

    render_preflight(checks, ui.notify)
    if checks.failed:
        ui.error("[preflight] FAILED; nothing was created.")
        return _preflight_exit_code(checks)
    warns = [c for c in checks.checks if c.status == "warn"]
    if warns and not ui.confirm_warnings(warns):
        ui.notify("Stopped at preflight warnings. Nothing was created.")
        return 2

    # ---- RUN FOLDER (refuse to reuse an existing run's receipts)
    run_id = new_run_id(result.slug)
    suffix = 1
    while RunPaths(repo_root, run_id).root.exists():
        suffix += 1
        run_id = f"{new_run_id(result.slug)}-{suffix}"
    run_paths = RunPaths(repo_root, run_id)

    wt_root = args.worktree_root or default_worktree_root(repo_root)
    if not ui.confirm_start(f"a relay worktree under {wt_root}"):
        ui.notify("Stopped before worktree creation. Nothing was created.")
        return 2

    run_paths.write("plan/original-plan.md", result.plan_text)
    run_paths.write("plan/normalized-criteria.md", result.criteria.to_markdown())
    run_paths.write_json("env/preflight.json", checks.to_payload())
    escalation_flags: list = []
    if args.codex_repo_access:
        escalation_flags.append(
            "--codex-repo-access: reviewer was given full worktree access "
            "(default is artifact-bundle only)"
        )
    if args.claude_permission_mode == "bypassPermissions":
        escalation_flags.append(
            "--claude-permission-mode bypassPermissions: builder ran without "
            "the CLI's edit-scoping sandbox; out-of-worktree containment "
            "relied on the diff-based scanner alone"
        )
    if args.allow_relay_self_edit:
        escalation_flags.append(
            "--allow-relay-self-edit: builder was allowed to edit the relay's own code"
        )
    if args.allow_stale_base and any(c.name == "base-fetch" and c.status == "warn" for c in checks.checks):
        escalation_flags.append("--allow-stale-base: run based on a stale local ref (fetch failed)")
    run_paths.update_run_json(
        run_id=run_id, relay_version=RELAY_VERSION, title=result.title,
        plan_path=str(result.plan_path), base_ref=args.base,
        max_iterations=args.max_iterations, escalations=escalation_flags,
        codex_model=args.codex_model, state="STARTED",
    )
    ui.notify(f"[run] receipts: {run_paths.root}")

    # ---- WORKTREE
    try:
        wt = create_worktree(repo_root, result.slug, args.base, args.worktree_root)
    except RuntimeError as exc:
        ui.error(f"[worktree] FAILED: {exc}")
        run_paths.update_run_json(state="ERROR", detail=str(exc), exit_code=6)
        return 6
    ui.notify(f"[worktree] {wt.path} (branch {wt.branch}, base {wt.base_sha[:12]})")
    links = ensure_deps_links(repo_root, wt)
    for name, detail in links.items():
        ui.notify(f"[worktree] deps {name}: {detail}")
    run_paths.update_run_json(branch=wt.branch, worktree=str(wt.path), base_sha=wt.base_sha)

    # ---- PROVIDERS
    if args.fixture:
        from orchestration.coding_relay.fixtures import FakeProviders

        fakes = FakeProviders(args.fixture, wt.path)
        build_fn = fakes.build
        review_fn = fakes.review
        run_paths.update_run_json(providers="fixture", fixture=str(args.fixture))
    else:
        claude_exe = shutil.which("claude")
        codex_exe = shutil.which("codex")
        # Probe results are written through the redaction choke point, not
        # by probe() itself: no run-folder write may bypass RunPaths.write.
        claude_caps = probe(claude_exe)
        codex_caps = probe(codex_exe)
        run_paths.write("env/claude-help.txt", claude_caps.help_text)
        run_paths.write("env/codex-help.txt", codex_caps.help_text)
        _, model_note = claude_mod.build_coding_command(
            claude_exe, wt.path, args.claude_permission_mode, args.claude_model, claude_caps,
        )
        if model_note:
            ui.notify(f"[providers] {model_note}")
        run_paths.update_run_json(
            providers="cli",
            claude_model=args.claude_model or "(cli default)",
            claude_model_note=model_note or "",
        )

        def build_fn(prompt: str):
            return claude_mod.invoke_builder(
                prompt, wt.path, claude_exe,
                permission_mode=args.claude_permission_mode,
                model=args.claude_model, caps=claude_caps,
                timeout_s=args.claude_timeout, keep_env=args.keep_env,
            )

        def review_fn(prompt: str, review_dir: Path, effort: str):
            target = wt.path if args.codex_repo_access else review_dir
            target.mkdir(parents=True, exist_ok=True)
            return codex_mod.invoke_reviewer(
                prompt, target, codex_exe,
                model=args.codex_model, effort=effort, caps=codex_caps,
                timeout_s=args.codex_timeout, repo_access=args.codex_repo_access,
            )

    # ---- LOOP (any unexpected crash still lands in the exit-code table)
    loop_cfg = LoopConfig(
        max_iterations=args.max_iterations,
        run_tests=not args.no_tests,
        allow_migrations=args.allow_migrations,
        allow_relay_self_edit=args.allow_relay_self_edit,
        codex_effort=args.codex_effort,
        codex_max_effort=args.codex_max_effort,
        codex_repo_access=args.codex_repo_access,
        primary_root=repo_root,
    )
    try:
        outcome = run_loop(
            loop_cfg, result, wt, run_paths, build_fn, review_fn,
            log=ui.notify, on_continue=ui.on_continue,
        )
    except AdapterUnavailable as exc:
        ui.error(f"[loop] provider CLI vanished mid-run: {exc}")
        run_paths.update_run_json(state="ERROR", exit_code=3, detail=str(exc))
        return 3
    except Exception as exc:  # noqa: BLE001 - exit-code table integrity
        ui.error(f"[loop] internal error: {type(exc).__name__}: {exc}")
        run_paths.update_run_json(state="ERROR", exit_code=6, detail=f"{type(exc).__name__}: {exc}")
        ui.notify(removal_instructions(repo_root, wt))
        return 6

    # ---- FINALIZE: report + PR body always. The PR decision belongs to the
    # ui policy, which can never allow it after SAFETY_STOP/BLOCKED/ERROR.
    snapshot = collect_snapshot(wt.path, wt.base_sha)
    last_verdict = outcome.verdicts[-1] if outcome.verdicts else None
    summary = RunSummary(
        run_id=run_id,
        state=outcome.state,
        exit_code=outcome.exit_code,
        title=result.title,
        plan_path=str(result.plan_path),
        branch=wt.branch,
        worktree_path=str(wt.path),
        base_ref=wt.base_ref,
        base_sha=wt.base_sha,
        iterations_run=outcome.iterations_run,
        max_iterations=args.max_iterations,
        criteria_checklist=result.criteria.checklist(),
        final_criteria_status=last_verdict.criteria_status if last_verdict else [],
        verdict_history=[
            (i + 1, v.status, v.summary) for i, v in enumerate(outcome.verdicts)
        ],
        test_results=[r.to_payload() for r in outcome.last_test_results],
        violations=[v.__dict__ for v in outcome.violations],
        files_changed=snapshot.numstat,
        risk_notes=(last_verdict.risk_flags if last_verdict else []) + ([outcome.detail] if outcome.detail else []),
        removal_instructions=removal_instructions(repo_root, wt),
        codex_summary=last_verdict.summary if last_verdict else "",
        escalation_flags=escalation_flags,
    )
    run_paths.write("report/final-report.md", final_report(summary))
    run_paths.write("report/PR_BODY.md", pr_body(summary))
    run_paths.update_run_json(
        state=outcome.state, exit_code=outcome.exit_code, detail=outcome.detail,
        iterations_run=outcome.iterations_run,
    )

    # Compact outcome block (all modes).
    if last_verdict:
        counts = {"met": 0, "unmet": 0, "unknown": 0, "not_applicable": 0}
        for c in last_verdict.criteria_status:
            counts[c.get("status", "unknown")] = counts.get(c.get("status", "unknown"), 0) + 1
        ui.notify(
            f"[outcome] criteria: {counts['met']} met / {counts['unmet']} unmet / "
            f"{counts['unknown']} unknown / {counts['not_applicable']} n/a "
            f"(of {len(result.criteria.checklist())} normalized)"
        )
        for flag in last_verdict.risk_flags[:5]:
            ui.notify(f"[outcome] risk flag: {flag[:160]}")

    want_pr = ui.decide_pr(outcome.state, last_verdict)
    if want_pr and not snapshot.changed_paths:
        ui.notify("[pr] skipped: no changes to commit")
    if want_pr and snapshot.changed_paths:
        committed, commit_detail = pr_mod.commit_all(wt.path, result.slug, run_id, result.title)
        if committed:
            pushed, push_detail = pr_mod.push(wt.path, wt.branch)
            ui.notify(f"[pr] {push_detail}")
            if pushed:
                ok, pr_detail = pr_mod.create_draft_pr(
                    wt.path, wt.branch, result.title, run_paths.report_dir / "PR_BODY.md",
                )
                if ok:
                    ui.notify(f"[pr] draft PR: {pr_detail}")
                    run_paths.write_json("report/pr.json", {"url": pr_detail, "draft": True})
                else:
                    run_paths.write(
                        "report/MANUAL_PR.md",
                        pr_mod.manual_pr_instructions(
                            repo_root, wt.path, wt.branch, result.title,
                            run_paths.report_dir / "PR_BODY.md", pr_detail,
                        ),
                    )
                    ui.notify(f"[pr] fell back to MANUAL_PR.md: {pr_detail}")
            else:
                run_paths.write(
                    "report/MANUAL_PR.md",
                    pr_mod.manual_pr_instructions(
                        repo_root, wt.path, wt.branch, result.title,
                        run_paths.report_dir / "PR_BODY.md", push_detail,
                    ),
                )
                ui.notify(f"[pr] fell back to MANUAL_PR.md: {push_detail}")
        else:
            ui.notify(f"[pr] skipped: {commit_detail}")

    ui.notify(f"\n[done] {outcome.state} (exit {outcome.exit_code}). {outcome.detail}")
    ui.notify(f"[done] final report: {run_paths.report_dir / 'final-report.md'}")
    ui.notify(removal_instructions(repo_root, wt))
    return outcome.exit_code


def main(argv: list | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    parser = build_parser()
    args = parser.parse_args(argv)
    repo_root: Path = args.repo_root.resolve()

    from orchestration.coding_relay import guided

    if not args.plan and not args.paste_file:
        if guided.stdin_is_tty() and not args.dry_run:
            return guided.run_guided(args)
        return print_no_args_help(repo_root)

    # ---- INTAKE (exit 2 on refusal)
    try:
        result = intake_mod.load_plan(repo_root, args.plan, args.paste_file)
    except IntakeError as exc:
        print(f"[intake] REFUSED: {exc}", file=sys.stderr)
        return 2
    print(f"[intake] plan: {result.title}")
    print(f"[intake] criteria: {len(result.criteria.checklist())} normalized "
          f"(sections with content: "
          f"{sum(1 for _, v in result.criteria.sections.items() if v) + (1 if result.criteria.general else 0)})")

    if args.dry_run:
        return do_dry_run(args, result)

    from orchestration.coding_relay.guided import AutoUI

    return execute_run(args, result, AutoUI(args))


if __name__ == "__main__":
    raise SystemExit(main())
