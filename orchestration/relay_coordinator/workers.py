"""Launch each workstream through the relay as an isolated worker.

The coordinator invokes the relay's own CLI as a subprocess, one per
workstream, with an isolated worktree root, a fixed base commit, the routed
builder/reviewer models, `--no-pr`, and a max-iterations cap. It never adds
`--draft-pr`, never merges, never deploys, never force-pushes. The relay's
own safety layer still runs inside each worker; this module adds nothing that
weakens it.

The launch layer takes an INJECTABLE runner callable so tests drive it with
a fake runner: token-free, network-free, no real `claude` or `codex`. The
default runner shells out to `python -m orchestration.coding_relay ...`.

Relay exit codes this module interprets:
    0 pass, 1 max-iter/continue, 2 intake/preflight, 3 missing CLI,
    4 safety, 5 blocked/risk, 6 error.
"""
from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from orchestration.relay_coordinator.graph import Workstream
from orchestration.relay_coordinator.routing import (
    UNSUPPORTED,
    ExecutionPlan,
)
from orchestration.relay_coordinator.safety import assert_command_safe

# The relay module invoked as a worker. A string, never a path we write to,
# so a static "does the coordinator write into coding_relay/?" check finds
# nothing: this is a module name passed to `python -m`, not a file target.
RELAY_MODULE = "orchestration.coding_relay"

RELAY_EXIT_MEANING = {
    0: "pass",
    1: "max_iterations_or_continue",
    2: "intake_or_preflight_refusal",
    3: "missing_cli",
    4: "safety_stop",
    5: "blocked_or_risk",
    6: "error",
}


@dataclass
class RunnerResult:
    """What a runner returns for one worker invocation."""

    exit_code: int
    stdout: str = ""
    stderr: str = ""


# A runner takes the argv (after the interpreter) and the per-worker cwd and
# returns a RunnerResult. The default runner shells out; a fake runner in
# tests returns a scripted result without touching the network or a CLI.
Runner = Callable[[list[str], Path], RunnerResult]


@dataclass
class WorkerCommand:
    """The exact relay invocation the coordinator would run for a workstream.

    `argv` is what follows the Python interpreter (`-m`, the module, flags).
    `command_str` is the full human-readable line, used for dry-run printing
    and for the forbidden-command safety guard.
    """

    workstream_id: str
    argv: list[str]
    worktree_root: Path
    child_plan_path: Path
    executable: bool
    unsupported_reason: str = ""

    @property
    def command_str(self) -> str:
        return f"{sys.executable} " + " ".join(self.argv)


@dataclass
class WorkerResult:
    """The outcome of launching one worker (or of declining to)."""

    workstream_id: str
    launched: bool
    exit_code: int | None
    status: str
    detail: str = ""
    command_str: str = ""
    elapsed_s: float = 0.0
    stdout: str = ""
    stderr: str = ""


def build_worker_command(
    ws: Workstream,
    execution: ExecutionPlan,
    child_plan_path: Path,
    base_commit: str,
    worktree_root: Path,
    max_iterations: int = 3,
) -> WorkerCommand:
    """Assemble the relay command for one workstream and guard it.

    The command always carries `--no-pr` and never `--draft-pr`. When the
    workstream is flagged `migration=True` it adds `--allow-migrations` so the
    relay's own migration gate lets the builder touch schema paths (the
    coordinator still never applies anything). Every assembled command runs
    through `assert_command_safe`, so a merge/deploy/force-push/push-to-main
    shape can never leave this function.
    """
    argv = [
        "-m",
        RELAY_MODULE,
        "--plan",
        str(child_plan_path),
        "--base",
        base_commit,
        "--worktree-root",
        str(worktree_root),
        "--claude-model",
        execution.builder_model_id,
        "--codex-model",
        execution.reviewer_model_id,
        "--no-pr",
        "--max-iterations",
        str(max_iterations),
    ]
    if ws.migration:
        argv.append("--allow-migrations")

    cmd = WorkerCommand(
        workstream_id=ws.workstream_id,
        argv=argv,
        worktree_root=Path(worktree_root),
        child_plan_path=Path(child_plan_path),
        executable=execution.status != UNSUPPORTED,
        unsupported_reason=execution.reason if execution.status == UNSUPPORTED else "",
    )
    # Structural guarantee: the coordinator never builds a forbidden command.
    assert_command_safe([sys.executable, *argv])
    return cmd


def default_runner(argv: list[str], cwd: Path) -> RunnerResult:
    """Real runner: shell out to `python -m orchestration.coding_relay ...`.

    Used outside tests. Tests inject a fake runner instead so no real CLI or
    network is touched. The coordinator never inspects or edits the relay's
    files here; it only runs the module.
    """
    proc = subprocess.run(
        [sys.executable, *argv],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return RunnerResult(exit_code=proc.returncode, stdout=proc.stdout or "", stderr=proc.stderr or "")


def launch_worker(
    cmd: WorkerCommand,
    repo_root: Path,
    runner: Runner = default_runner,
) -> WorkerResult:
    """Launch one worker via the runner, or decline an unsupported orientation.

    An unsupported orientation is recorded, never faked: the coordinator does
    not launch it and returns a WorkerResult with status
    `unsupported_by_current_worker`. A supported orientation is guarded once
    more and then run through the runner.
    """
    if not cmd.executable:
        return WorkerResult(
            workstream_id=cmd.workstream_id,
            launched=False,
            exit_code=None,
            status=UNSUPPORTED,
            detail=cmd.unsupported_reason,
            command_str=cmd.command_str,
        )

    assert_command_safe([sys.executable, *cmd.argv])
    start = time.monotonic()
    result = runner(cmd.argv, Path(repo_root))
    elapsed = time.monotonic() - start
    status = RELAY_EXIT_MEANING.get(result.exit_code, f"unknown_exit_{result.exit_code}")
    return WorkerResult(
        workstream_id=cmd.workstream_id,
        launched=True,
        exit_code=result.exit_code,
        status=status,
        detail=RELAY_EXIT_MEANING.get(result.exit_code, ""),
        command_str=cmd.command_str,
        elapsed_s=elapsed,
        stdout=result.stdout,
        stderr=result.stderr,
    )


@dataclass
class BatchOutcome:
    """Results for one concurrency batch within a wave."""

    results: list[WorkerResult] = field(default_factory=list)


def launch_batch(
    commands: list[WorkerCommand],
    repo_root: Path,
    runner: Runner = default_runner,
) -> BatchOutcome:
    """Launch a batch of worker commands and collect their results.

    The batch is the coordinator's unit of parallelism; the caller is
    responsible for keeping each batch within the concurrency cap. Each
    command is launched through the runner; an unsupported one is recorded
    and skipped. This function launches only what it is given and never
    reorders across the concurrency boundary.
    """
    outcome = BatchOutcome()
    for cmd in commands:
        outcome.results.append(launch_worker(cmd, repo_root, runner))
    return outcome
