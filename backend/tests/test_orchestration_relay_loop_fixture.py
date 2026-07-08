"""End-to-end fixture runs: the full relay loop against a throwaway git repo,
driven by FakeProviders. No CLIs, no tokens, no network (base ref is HEAD so
preflight never fetches; the fetch tests use a nonexistent local remote).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay.__main__ import main  # noqa: E402

FIXTURE = ROOT / "orchestration" / "coding_relay" / "fixtures" / "demo"


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )


@pytest.fixture(autouse=True)
def _isolate_git_config(monkeypatch):
    # A developer's global core.hooksPath / init templates must not leak
    # into the throwaway repos these tests create.
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", os.devnull)
    monkeypatch.setenv("GIT_CONFIG_SYSTEM", os.devnull)


@pytest.fixture()
def tmp_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=str(repo), capture_output=True, text=True)
    _git(repo, "config", "user.email", "relay-test@example.com")
    _git(repo, "config", "user.name", "Relay Test")
    _git(repo, "config", "commit.gpgsign", "false")
    (repo / "README.md").write_text("seed\n", encoding="utf-8")
    _git(repo, "add", "-A")
    assert _git(repo, "commit", "-m", "seed").returncode == 0
    return repo


def make_fixture(tmp_path: Path, name: str, review_json: str | None,
                 files: dict | None = None, build_exit: int | None = None) -> Path:
    """Build a one-iteration fixture dir for failure-path tests."""
    fx = tmp_path / name
    it = fx / "iterations" / "1"
    (it / "files").mkdir(parents=True)
    fx.joinpath("plan.md").write_text(
        (FIXTURE / "plan.md").read_text(encoding="utf-8"), encoding="utf-8"
    )
    for rel, content in (files or {"RELAY_NOTE.md": "note\n"}).items():
        target = it / "files" / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    if review_json is not None:
        (it / "review.json").write_text(review_json, encoding="utf-8")
    if build_exit is not None:
        (it / "build-exit").write_text(str(build_exit), encoding="utf-8")
    return fx


def verdict_json(status: str, **extra) -> str:
    base = {
        "status": status,
        "summary": f"fixture verdict: {status}",
        "criteria_status": [],
        "required_next_steps": [],
        "plan_refinements": [],
        "tests_to_run_next": [],
        "risk_flags": [],
        "should_open_pr": False,
    }
    base.update(extra)
    return json.dumps(base)


def run_relay(tmp_repo: Path, tmp_path: Path, extra: list) -> int:
    argv = [
        "--repo-root", str(tmp_repo),
        "--plan", str(FIXTURE / "plan.md"),
        "--fixture", str(FIXTURE),
        "--base", "HEAD",
        "--no-pr",
        "--worktree-root", str(tmp_path / "wts"),
    ] + extra
    return main(argv)


def find_run_dir(tmp_repo: Path) -> Path:
    runs = list((tmp_repo / ".orchestration" / "runs").iterdir())
    assert len(runs) == 1
    return runs[0]


def test_fixture_loop_passes_end_to_end(tmp_repo: Path, tmp_path: Path):
    exit_code = run_relay(tmp_repo, tmp_path, ["--max-iterations", "2"])
    assert exit_code == 0

    run_dir = find_run_dir(tmp_repo)
    # Full manifest: plan, env, two iterations, report.
    assert (run_dir / "plan" / "original-plan.md").is_file()
    assert (run_dir / "plan" / "normalized-criteria.md").is_file()
    assert (run_dir / "env" / "preflight.json").is_file()
    for it in ("01", "02"):
        it_dir = run_dir / "iterations" / it
        for name in (
            "build-prompt.md", "build-output.md", "build-meta.json",
            "diff.patch", "safety.json",
            "review-prompt.md", "review-output.txt", "verdict.json",
        ):
            assert (it_dir / name).is_file(), f"missing iterations/{it}/{name}"
        assert (it_dir / "review-bundle" / "diff.patch").is_file()
    assert (run_dir / "report" / "final-report.md").is_file()
    assert (run_dir / "report" / "PR_BODY.md").is_file()

    run_meta = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    assert run_meta["state"] == "PASS"
    assert run_meta["exit_code"] == 0
    assert run_meta["iterations_run"] == 2

    # Iteration 1 verdict was continue; iteration 2 pass.
    v1 = json.loads((run_dir / "iterations" / "01" / "verdict.json").read_text(encoding="utf-8"))
    v2 = json.loads((run_dir / "iterations" / "02" / "verdict.json").read_text(encoding="utf-8"))
    assert v1["status"] == "continue"
    assert v2["status"] == "pass"

    # Reviewer feedback from iteration 1 reached the iteration 2 builder prompt.
    prompt2 = (run_dir / "iterations" / "02" / "build-prompt.md").read_text(encoding="utf-8")
    assert "Extend RELAY_NOTE.md" in prompt2

    # Redaction: the planted token never survives anywhere in the run folder.
    planted = "ghp_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"
    for f in run_dir.rglob("*"):
        if f.is_file():
            assert planted not in f.read_text(encoding="utf-8", errors="replace"), f
    build_out = (run_dir / "iterations" / "01" / "build-output.md").read_text(encoding="utf-8")
    assert "[REDACTED:github-token]" in build_out

    # The worktree exists on a relay/ branch and contains the fixture's file.
    worktrees = list((tmp_path / "wts").iterdir())
    assert len(worktrees) == 1
    wt = worktrees[0]
    assert (wt / "RELAY_NOTE.md").is_file()
    branch = _git(wt, "branch", "--show-current").stdout.strip()
    assert branch.startswith("relay/")

    # Final report is honest about the outcome.
    report = (run_dir / "report" / "final-report.md").read_text(encoding="utf-8")
    assert "PASS" in report
    assert "RELAY_NOTE.md" in report


def test_review_bundle_contains_run_artifacts(tmp_repo: Path, tmp_path: Path):
    """The reviewer can verify run-level criteria: the bundle carries a
    redacted run.json excerpt, this iteration's safety scan, the tests
    summary, an artifact manifest, and an availability note."""
    exit_code = run_relay(tmp_repo, tmp_path, ["--max-iterations", "2"])
    assert exit_code == 0
    run_dir = find_run_dir(tmp_repo)
    bundle = run_dir / "iterations" / "01" / "review-bundle"
    for name in (
        "run-meta.json", "safety.json", "tests-summary.json",
        "manifest.txt", "availability.md",
    ):
        assert (bundle / name).is_file(), f"missing bundle file {name}"

    meta = json.loads((bundle / "run-meta.json").read_text(encoding="utf-8"))
    assert meta["run_id"] == run_dir.name
    assert meta["branch"].startswith("relay/")
    assert "state" in meta
    # Contract: run-meta is a whitelist EXCERPT, never a full run.json dump.
    # run.json carries plan_path (absolute) and fixture at this point; a
    # regression to a blind dump would leak them into the reviewer bundle.
    full = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    assert "plan_path" in full and "plan_path" not in meta
    assert "fixture" in full and "fixture" not in meta
    ALLOWED = {
        "run_id", "relay_version", "title", "base_ref", "base_sha", "branch",
        "worktree", "max_iterations", "escalations", "providers",
        "codex_model", "state",
    }
    assert set(meta) <= ALLOWED

    assert json.loads((bundle / "safety.json").read_text(encoding="utf-8")) == []

    manifest = (bundle / "manifest.txt").read_text(encoding="utf-8")
    assert "run.json" in manifest
    assert "plan/original-plan.md" in manifest
    assert "iterations/01/safety.json" in manifest

    prompt = (run_dir / "iterations" / "01" / "review-prompt.md").read_text(encoding="utf-8")
    assert "Run metadata" in prompt
    assert run_dir.name in prompt
    assert "Artifact availability" in prompt
    assert "final-report.md" in prompt  # availability note names post-review artifacts
    assert "AFTER this review" in prompt


def test_fixture_loop_max_iterations_exit_1(tmp_repo: Path, tmp_path: Path):
    # Only one iteration allowed; fixture iteration 1 says "continue".
    exit_code = run_relay(tmp_repo, tmp_path, ["--max-iterations", "1"])
    assert exit_code == 1
    run_dir = find_run_dir(tmp_repo)
    run_meta = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    assert run_meta["state"] == "MAX_ITER"


def test_secret_written_by_builder_triggers_safety_stop(tmp_repo: Path, tmp_path: Path):
    # Build a one-iteration fixture whose "builder" writes a secret to a file.
    fx = tmp_path / "fx-secret"
    (fx / "iterations" / "1" / "files").mkdir(parents=True)
    (fx / "plan.md").write_text(
        (FIXTURE / "plan.md").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (fx / "iterations" / "1" / "files" / "config.py").write_text(
        'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"\n', encoding="utf-8"
    )
    argv = [
        "--repo-root", str(tmp_repo),
        "--plan", str(fx / "plan.md"),
        "--fixture", str(fx),
        "--base", "HEAD",
        "--no-pr",
        "--worktree-root", str(tmp_path / "wts2"),
        "--max-iterations", "2",
    ]
    exit_code = main(argv)
    assert exit_code == 4
    run_dir = find_run_dir(tmp_repo)
    safety = json.loads(
        (run_dir / "iterations" / "01" / "safety.json").read_text(encoding="utf-8")
    )
    assert any(v["rule"] == "secrets_in_diff" for v in safety)
    # No review happened after the stop.
    assert not (run_dir / "iterations" / "01" / "verdict.json").exists()


def test_dry_run_writes_nothing(tmp_repo: Path, tmp_path: Path, capsys):
    argv = [
        "--repo-root", str(tmp_repo),
        "--plan", str(FIXTURE / "plan.md"),
        "--fixture", str(FIXTURE),
        "--base", "HEAD",
        "--dry-run",
    ]
    exit_code = main(argv)
    assert exit_code == 0
    out = capsys.readouterr().out
    assert "wrote nothing" in out
    assert not (tmp_repo / ".orchestration").exists()
    # No worktree, no branch.
    branches = _git(tmp_repo, "branch", "--list").stdout
    assert "relay/" not in branches


def test_missing_criteria_refused_exit_2(tmp_repo: Path, tmp_path: Path):
    bad = tmp_path / "bad-plan.md"
    bad.write_text("# Vague wish\n\nMake it better.\n", encoding="utf-8")
    exit_code = main([
        "--repo-root", str(tmp_repo), "--plan", str(bad),
        "--fixture", str(FIXTURE), "--base", "HEAD",
    ])
    assert exit_code == 2
    assert not (tmp_repo / ".orchestration").exists()


def test_blocked_verdict_exit_5(tmp_repo: Path, tmp_path: Path):
    fx = make_fixture(tmp_path, "fx-blocked", verdict_json("blocked"))
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(fx / "plan.md"),
        "--fixture", str(fx), "--base", "HEAD", "--no-pr",
        "--worktree-root", str(tmp_path / "w1"), "--max-iterations", "2",
    ])
    assert code == 5
    run_meta = json.loads((find_run_dir(tmp_repo) / "run.json").read_text(encoding="utf-8"))
    assert run_meta["state"] == "BLOCKED"


def test_risk_escalation_verdict_exit_5(tmp_repo: Path, tmp_path: Path):
    fx = make_fixture(
        tmp_path, "fx-risk",
        verdict_json("risk_escalation", risk_flags=["touches auth"]),
    )
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(fx / "plan.md"),
        "--fixture", str(fx), "--base", "HEAD", "--no-pr",
        "--worktree-root", str(tmp_path / "w2"),
    ])
    assert code == 5
    report = (find_run_dir(tmp_repo) / "report" / "final-report.md").read_text(encoding="utf-8")
    assert "touches auth" in report


def test_escalate_safety_stops_before_review_exit_5(tmp_repo: Path, tmp_path: Path):
    # Builder touches CI workflows: escalate severity ends the run with NO review.
    fx = make_fixture(
        tmp_path, "fx-wf", verdict_json("pass"),
        files={".github/workflows/evil.yml": "on: push\n"},
    )
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(fx / "plan.md"),
        "--fixture", str(fx), "--base", "HEAD", "--no-pr",
        "--worktree-root", str(tmp_path / "w3"),
    ])
    assert code == 5
    run_dir = find_run_dir(tmp_repo)
    assert not (run_dir / "iterations" / "01" / "verdict.json").exists()
    safety = json.loads((run_dir / "iterations" / "01" / "safety.json").read_text(encoding="utf-8"))
    assert any(v["rule"] == "workflow_hooks" for v in safety)


def test_garbage_verdict_retries_once_then_blocked_exit_5(tmp_repo: Path, tmp_path: Path):
    fx = make_fixture(tmp_path, "fx-garbage", "utter nonsense, no json here")
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(fx / "plan.md"),
        "--fixture", str(fx), "--base", "HEAD", "--no-pr",
        "--worktree-root", str(tmp_path / "w4"),
    ])
    assert code == 5
    it_dir = find_run_dir(tmp_repo) / "iterations" / "01"
    # The retry happened (same iteration file re-read, still garbage).
    assert (it_dir / "review-output-retry.txt").is_file()
    assert not (it_dir / "verdict.json").exists()


def test_builder_failure_exit_6(tmp_repo: Path, tmp_path: Path):
    fx = make_fixture(tmp_path, "fx-bfail", verdict_json("pass"), build_exit=2)
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(fx / "plan.md"),
        "--fixture", str(fx), "--base", "HEAD", "--no-pr",
        "--worktree-root", str(tmp_path / "w5"),
    ])
    assert code == 6
    run_meta = json.loads((find_run_dir(tmp_repo) / "run.json").read_text(encoding="utf-8"))
    assert run_meta["state"] == "ERROR"


def test_pass_without_pr_flags_degrades_to_manual_pr(tmp_repo: Path, tmp_path: Path):
    # No origin remote: on pass the relay commits, the push fails, and the
    # MANUAL_PR.md fallback is written; the loop outcome still owns exit 0.
    code = main([
        "--repo-root", str(tmp_repo),
        "--plan", str(FIXTURE / "plan.md"),
        "--fixture", str(FIXTURE),
        "--base", "HEAD",
        "--worktree-root", str(tmp_path / "w6"),
        "--max-iterations", "2",
    ])
    assert code == 0
    manual = find_run_dir(tmp_repo) / "report" / "MANUAL_PR.md"
    assert manual.is_file()
    text = manual.read_text(encoding="utf-8")
    assert "--draft" in text
    assert "PR_BODY.md" in text
    assert "gh pr merge" not in text


def test_draft_pr_never_fires_after_safety_stop(tmp_repo: Path, tmp_path: Path):
    fx = make_fixture(
        tmp_path, "fx-secret2", verdict_json("pass"),
        files={"config.py": 'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"\n'},
    )
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(fx / "plan.md"),
        "--fixture", str(fx), "--base", "HEAD", "--draft-pr",
        "--worktree-root", str(tmp_path / "w7"),
    ])
    assert code == 4
    run_dir = find_run_dir(tmp_repo)
    # The flagged diff was neither committed nor offered for manual push.
    assert not (run_dir / "report" / "MANUAL_PR.md").exists()
    assert not (run_dir / "report" / "pr.json").exists()
    wt = next((tmp_path / "w7").iterdir())
    log = _git(wt, "log", "--oneline")
    assert len(log.stdout.strip().splitlines()) == 1  # seed commit only


def test_pass_with_no_changes_prints_skip_message(tmp_repo: Path, tmp_path: Path, capsys):
    """A PASS whose builder changed nothing still explains why no PR opened,
    restoring the PR 1 '[pr] skipped: no changes to commit' line."""
    # Fixture: builder writes no files, reviewer passes on iteration 1.
    fx = tmp_path / "fx-empty"
    (fx / "iterations" / "1").mkdir(parents=True)
    fx.joinpath("plan.md").write_text(
        (FIXTURE / "plan.md").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (fx / "iterations" / "1" / "review.json").write_text(verdict_json("pass"), encoding="utf-8")
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(fx / "plan.md"),
        "--fixture", str(fx), "--base", "HEAD", "--draft-pr",
        "--worktree-root", str(tmp_path / "we"), "--max-iterations", "1",
    ])
    assert code == 0
    out = capsys.readouterr().out
    assert "no changes to commit" in out
    run_dir = find_run_dir(tmp_repo)
    assert not (run_dir / "report" / "pr.json").exists()
    assert not (run_dir / "report" / "MANUAL_PR.md").exists()


def test_missing_clis_exit_3(tmp_repo: Path, tmp_path: Path, monkeypatch):
    import orchestration.coding_relay.preflight as pf

    real_which = pf.shutil.which
    monkeypatch.setattr(
        pf.shutil, "which",
        lambda name: None if name in ("claude", "codex") else real_which(name),
    )
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(FIXTURE / "plan.md"),
        "--base", "HEAD", "--no-pr",
    ])
    assert code == 3
    assert not list((tmp_repo / ".orchestration" / "runs").glob("*"))
    assert "relay/" not in _git(tmp_repo, "branch", "--list").stdout


def test_fetch_failure_is_hard_stop_exit_2(tmp_repo: Path, tmp_path: Path):
    _git(tmp_repo, "remote", "add", "origin", str(tmp_path / "no-such-remote"))
    _git(tmp_repo, "update-ref", "refs/remotes/origin/main", "HEAD")
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(FIXTURE / "plan.md"),
        "--fixture", str(FIXTURE), "--base", "origin/main", "--no-pr",
        "--worktree-root", str(tmp_path / "w8"),
    ])
    assert code == 2
    assert not list((tmp_repo / ".orchestration" / "runs").glob("*"))
    assert "relay/" not in _git(tmp_repo, "branch", "--list").stdout


def test_allow_stale_base_proceeds_and_is_recorded(tmp_repo: Path, tmp_path: Path):
    _git(tmp_repo, "remote", "add", "origin", str(tmp_path / "no-such-remote"))
    _git(tmp_repo, "update-ref", "refs/remotes/origin/main", "HEAD")
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(FIXTURE / "plan.md"),
        "--fixture", str(FIXTURE), "--base", "origin/main", "--no-pr",
        "--allow-stale-base", "--worktree-root", str(tmp_path / "w9"),
        "--max-iterations", "2",
    ])
    assert code == 0
    run_meta = json.loads((find_run_dir(tmp_repo) / "run.json").read_text(encoding="utf-8"))
    assert any("--allow-stale-base" in e for e in run_meta["escalations"])


def test_bad_fixture_dir_fails_preflight_before_mutation(tmp_repo: Path, tmp_path: Path):
    code = main([
        "--repo-root", str(tmp_repo), "--plan", str(FIXTURE / "plan.md"),
        "--fixture", str(tmp_path / "does-not-exist"), "--base", "HEAD", "--no-pr",
    ])
    assert code == 2
    assert not list((tmp_repo / ".orchestration" / "runs").glob("*"))
    branches = _git(tmp_repo, "branch", "--list").stdout
    assert "relay/" not in branches


def test_snapshot_diffs_against_base_even_after_builder_commit(tmp_repo: Path, tmp_path: Path):
    from orchestration.coding_relay.loop import collect_snapshot, head_moved
    from orchestration.coding_relay.worktree import create_worktree

    wt = create_worktree(tmp_repo, "snaptest", "HEAD", tmp_path / "w10")
    (wt.path / "committed.txt").write_text("smuggled\n", encoding="utf-8")
    _git(wt.path, "add", "-A")
    assert _git(wt.path, "commit", "-m", "builder smuggle").returncode == 0
    (wt.path / "uncommitted.txt").write_text("visible\n", encoding="utf-8")

    snap = collect_snapshot(wt.path, wt.base_sha)
    assert "committed.txt" in snap.changed_paths  # NOT invisible to the scanner
    assert "uncommitted.txt" in snap.changed_paths
    assert head_moved(wt.path, wt.base_sha)
