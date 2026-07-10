"""Worker launch through an injected fake runner. No real CLI, no network."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.relay_coordinator.graph import Workstream  # noqa: E402
from orchestration.relay_coordinator.routing import resolve_execution  # noqa: E402
from orchestration.relay_coordinator.workers import (  # noqa: E402
    RunnerResult,
    build_worker_command,
    launch_batch,
    launch_worker,
)


def ws(wid, **kw):
    return Workstream(
        workstream_id=wid, title=wid,
        owned_paths=kw.pop("owned", [f"src/{wid}.py"]),
        acceptance_criteria=[f"do {wid}"],
        **kw,
    )


class FakeRunner:
    """Records every argv it was asked to run and returns a scripted exit.

    This stands in for a real `python -m orchestration.coding_relay` call, the
    same way the relay's own fixture mode stands in for the claude/codex CLIs.
    No subprocess, no token, no network.
    """

    def __init__(self, exit_code=0):
        self.calls: list[list[str]] = []
        self.exit_code = exit_code

    def __call__(self, argv, cwd) -> RunnerResult:
        self.calls.append(list(argv))
        return RunnerResult(exit_code=self.exit_code, stdout="ok", stderr="")


def _cmd(w, base="abc123", wt_root=Path("/coord"), child=Path("/coord/plan.md"), max_iter=3):
    ex = resolve_execution(w)
    return build_worker_command(w, ex, child, base, wt_root, max_iterations=max_iter)


def test_worker_command_shape_matches_relay_contract():
    cmd = _cmd(ws("A", builder_model="fable", reviewer_model="sol"))
    joined = " ".join(cmd.argv)
    assert "-m orchestration.coding_relay" in joined
    assert "--plan" in cmd.argv
    assert "--base abc123" in joined
    assert "--claude-model claude-fable-5" in joined
    assert "--codex-model gpt-5.6" in joined
    assert "--no-pr" in cmd.argv
    assert "--max-iterations 3" in joined
    # The coordinator never adds these.
    assert "--draft-pr" not in cmd.argv
    assert "gh" not in cmd.argv


def test_migration_command_adds_allow_migrations():
    cmd = _cmd(ws("M", builder_model="fable", reviewer_model="sol",
                   migration=True, migration_order=1,
                   owned=["repo-b/db/schema/900_x.sql"]))
    assert "--allow-migrations" in cmd.argv


def test_fake_runner_drives_a_supported_worker_token_free():
    runner = FakeRunner(exit_code=0)
    cmd = _cmd(ws("A", builder_model="fable", reviewer_model="sol"))
    result = launch_worker(cmd, repo_root=Path("/repo"), runner=runner)
    assert result.launched is True
    assert result.exit_code == 0
    assert result.status == "pass"
    # The runner received exactly the coordinator's argv (the module invocation).
    assert len(runner.calls) == 1
    assert "orchestration.coding_relay" in " ".join(runner.calls[0])


def test_unsupported_orientation_is_recorded_not_launched():
    runner = FakeRunner()
    # sol builds -> unsupported by the current worker.
    cmd = _cmd(ws("A", builder_model="sol", reviewer_model="fable"))
    result = launch_worker(cmd, repo_root=Path("/repo"), runner=runner)
    assert result.launched is False
    assert result.status == "unsupported_by_current_worker"
    assert result.detail  # a reason is recorded
    assert runner.calls == []  # no run was faked


def test_relay_exit_codes_map_to_status():
    for exit_code, expected in [
        (0, "pass"), (1, "max_iterations_or_continue"),
        (2, "intake_or_preflight_refusal"), (3, "missing_cli"),
        (4, "safety_stop"), (5, "blocked_or_risk"), (6, "error"),
    ]:
        runner = FakeRunner(exit_code=exit_code)
        cmd = _cmd(ws("A", builder_model="fable", reviewer_model="sol"))
        result = launch_worker(cmd, repo_root=Path("/repo"), runner=runner)
        assert result.status == expected


def test_launch_batch_runs_each_and_skips_unsupported():
    runner = FakeRunner(exit_code=0)
    supported = _cmd(ws("A", builder_model="fable", reviewer_model="sol"))
    unsupported = _cmd(ws("B", builder_model="sol", reviewer_model="fable"))
    outcome = launch_batch([supported, unsupported], repo_root=Path("/repo"), runner=runner)
    statuses = {r.workstream_id: r.status for r in outcome.results}
    assert statuses["A"] == "pass"
    assert statuses["B"] == "unsupported_by_current_worker"
    # Only the supported one actually ran.
    assert len(runner.calls) == 1
