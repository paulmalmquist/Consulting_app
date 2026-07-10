"""Relay Coordinator CLI.

    python -m orchestration.relay_coordinator --roadmap <manifest> --dry-run
    python -m orchestration.relay_coordinator --roadmap <manifest> --yes

Reads a workstreams manifest, validates the graph, schedules waves, routes
models, and either prints a mutation-free dry run or (with approval) launches
each workstream through the relay as an isolated worker. It never merges,
never deploys, never force-pushes, never pushes to main, never applies a
migration.

Exit codes:
    0 dry-run clean, or all launched workers passed
    1 one or more launched workers stopped short (max-iter/continue)
    2 roadmap/intake refusal or a coordinator hard stop
    3 approval required and not granted (nothing launched)
    5 a launched worker was blocked or hit a risk escalation
    6 an unexpected coordinator error
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from orchestration.relay_coordinator import COORDINATOR_VERSION
from orchestration.relay_coordinator.cli import (
    RoadmapError,
    build_plan,
    coordinator_stops,
    load_roadmap,
    render_dry_run,
    render_waves,
    validate_child_plans,
    worker_commands,
)
from orchestration.relay_coordinator.graph import CoordinatorError
from orchestration.relay_coordinator.waves import DEFAULT_CONCURRENCY
from orchestration.relay_coordinator.workers import default_runner, launch_worker

DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[2]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="relay_coordinator",
        description="Plan, schedule, and launch relay workers from a roadmap. "
        "Never merges, deploys, force-pushes, or applies a migration.",
    )
    p.add_argument("--roadmap", required=True,
                   help="Workstreams manifest: a JSON file or a markdown roadmap with a ```json block")
    p.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT, help=argparse.SUPPRESS)
    p.add_argument("--base", default="origin/main",
                   help="Fixed base ref every worker branches from (default origin/main)")
    p.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY,
                   help=f"Max workers per wave batch (default {DEFAULT_CONCURRENCY})")
    p.add_argument("--max-iterations", type=int, default=3,
                   help="Per-worker relay build/review cap (default 3)")
    p.add_argument("--worktree-root", type=Path,
                   help="Parent dir for per-workstream worktree roots (default: sibling <repo>_coord)")
    p.add_argument("--output-dir", type=Path,
                   help="Dir for child plans and the outcomes store (default: .orchestration/coordinator)")
    p.add_argument("--dry-run", action="store_true",
                   help="Print the graph, waves, assignments, and every relay command; create nothing")
    p.add_argument("--yes", action="store_true",
                   help="Approve launch non-interactively (required to launch without a TTY)")
    p.add_argument("--version", action="version", version=f"relay-coordinator {COORDINATOR_VERSION}")
    return p


def _resolve_base(repo_root: Path, base_ref: str) -> str:
    """Resolve the base ref to a fixed SHA when possible; else return as given.

    A fixed SHA is preferable so every worker branches from the identical
    state. If git cannot resolve it (offline, bad ref), the coordinator keeps
    the ref string; the relay itself validates the base at worktree time.
    """
    import subprocess

    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", base_ref],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return proc.stdout.strip()
    except OSError:
        pass
    return base_ref


def _force_utf8_stdout() -> None:
    """Render the em-dash wave preview correctly on a cp1252 Windows console.

    The preview uses an em dash; a default Windows console codepage cannot
    encode it and would print a replacement glyph. Reconfiguring to UTF-8 is
    display-only and never raises on a stream that does not support it.
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass


def main(argv: list | None = None) -> int:
    _force_utf8_stdout()
    argv = sys.argv[1:] if argv is None else argv
    args = build_parser().parse_args(argv)
    repo_root: Path = args.repo_root.resolve()

    # ---- INTAKE
    try:
        workstreams = load_roadmap(args.roadmap)
    except RoadmapError as exc:
        print(f"[intake] REFUSED: {exc}", file=sys.stderr)
        return 2

    # ---- VALIDATE + SCHEDULE + ROUTE (raises on any graph violation)
    try:
        plan = build_plan(workstreams, concurrency=args.concurrency)
    except CoordinatorError as exc:
        # Surface all stops together, not just the first raised.
        try:
            from orchestration.relay_coordinator.graph import DependencyGraph
            graph = DependencyGraph(
                workstreams={w.workstream_id: w for w in workstreams},
                order=[w.workstream_id for w in workstreams],
            )
            for line in coordinator_stops(graph, args.concurrency):
                print(f"[stop] {line}", file=sys.stderr)
        except Exception:  # noqa: BLE001 - best-effort detail only
            pass
        print(f"[stop] coordinator refuses to schedule: {exc}", file=sys.stderr)
        return 2

    # A clear plan still gets an explicit stop sweep for defense in depth.
    stops = coordinator_stops(plan, args.concurrency)
    if stops:
        for line in stops:
            print(f"[stop] {line}", file=sys.stderr)
        return 2

    base_commit = _resolve_base(repo_root, args.base)

    # Confirm every child plan's criteria pass the relay's intake (in memory).
    try:
        validate_child_plans(plan, base_commit)
    except CoordinatorError as exc:
        print(f"[stop] child-plan criteria refused by relay intake: {exc}", file=sys.stderr)
        return 2

    wt_root = args.worktree_root or (repo_root.parent / f"{repo_root.name}_coord")

    # ---- DRY RUN (mutation-free)
    if args.dry_run:
        print(render_dry_run(plan, base_commit, wt_root, args.max_iterations))
        return 0

    # ---- APPROVAL GATE
    is_tty = sys.stdin.isatty()
    print("Planned waves:\n")
    print(render_waves(plan))
    print()
    if not args.yes:
        if is_tty:
            print("Re-run with --yes to launch these workers, or --dry-run to preview commands.")
        else:
            print("Approval required. Re-run with --yes to launch; launching nothing.",
                  file=sys.stderr)
        return 3

    # ---- LAUNCH (real runner; per-workstream child plans written under output-dir)
    output_dir = args.output_dir or (repo_root / ".orchestration" / "coordinator")
    output_dir.mkdir(parents=True, exist_ok=True)

    from orchestration.relay_coordinator.child_plans import render_child_plan

    def wt_for(ws):
        return wt_root / ws.workstream_id

    def plan_for(ws):
        child = render_child_plan(ws, base_commit)
        path = output_dir / f"{ws.workstream_id}-child-plan.md"
        child.write(path)
        return path

    commands = worker_commands(plan, base_commit, wt_for, plan_for, args.max_iterations)

    worst = 0
    for cmd in commands:
        result = launch_worker(cmd, repo_root, default_runner)
        print(f"[worker] {result.workstream_id}: {result.status} "
              f"(exit {result.exit_code}) launched={result.launched}")
        if result.exit_code in (5,):
            worst = max(worst, 5)
        elif result.exit_code in (1, 2, 6):
            worst = max(worst, 1)
    return worst


if __name__ == "__main__":
    raise SystemExit(main())
