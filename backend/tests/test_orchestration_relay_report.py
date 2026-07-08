from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay import pr as pr_mod  # noqa: E402
from orchestration.coding_relay.report import (  # noqa: E402
    RunSummary,
    final_report,
    pr_body,
    strip_style,
)


def summary() -> RunSummary:
    return RunSummary(
        run_id="20260707-120000-demo",
        state="PASS",
        exit_code=0,
        title="Demo",
        plan_path="plan.md",
        branch="relay/demo-x",
        worktree_path="C:/wt",
        base_ref="origin/main",
        base_sha="abc123def456",
        iterations_run=2,
        max_iterations=3,
        criteria_checklist=[
            ("S1", "Screen", "renders"),
            ("A1", "API", "returns 200"),
            ("D1", "DB-Data", "row exists"),
            ("T1", "Evals-tests", "tests pass"),
        ],
        final_criteria_status=[
            {"id": "S1", "status": "met", "evidence": "diff hunk"},
            {"id": "A1", "status": "unmet", "evidence": "no route"},
            {"id": "D1", "status": "not_applicable", "evidence": ""},
            # T1 absent: never reviewed.
        ],
        verdict_history=[(1, "continue", "half done"), (2, "pass", "all met")],
        test_results=[
            {"name": "backend-pytest", "skipped": False, "exit_code": 0, "duration_s": 12, "log": "l.log"},
            {"name": "frontend-unit", "skipped": True, "reason": "node_modules missing; run manually: cd x && npm ci && npm run test:unit"},
        ],
        violations=[],
        files_changed=["1\t2\tfoo.py"],
        risk_notes=["watch the thing"],
        removal_instructions="git worktree remove ...",
        codex_summary="all met",
        escalation_flags=["--codex-repo-access: reviewer was given full worktree access"],
    )


def test_criteria_marks_are_honest():
    report = final_report(summary())
    # Only "met" earns [x]; not_applicable and unmet stay unchecked with status text.
    assert "- [x] S1 (Screen): renders -- met" in report
    assert "- [ ] A1 (API): returns 200 -- unmet" in report
    assert "- [ ] D1 (DB-Data): row exists -- not_applicable" in report
    assert "- [ ] T1 (Evals-tests): tests pass -- not reviewed" in report


def test_skipped_suite_carries_manual_command():
    report = final_report(summary())
    assert "frontend-unit: SKIPPED" in report
    assert "npm ci" in report
    body = pr_body(summary())
    assert "npm ci" in body


def test_pr_body_has_verdicts_escalations_and_rollback():
    body = pr_body(summary())
    assert "iteration 1: continue. half done" in body
    assert "iteration 2: pass. all met" in body
    assert "--codex-repo-access" in body
    assert "never merges" in body or "Close this PR" in body


def test_strip_style_removes_em_dashes():
    assert "—" not in strip_style("a—b — c")
    assert "—" not in final_report(summary())


def test_create_draft_pr_always_passes_draft(monkeypatch, tmp_path):
    captured = {}

    def fake_run(cmd, cwd, timeout=300, env=None):
        captured["cmd"] = cmd

        class R:
            returncode = 0
            stdout = "https://github.com/x/y/pull/1\n"
            stderr = ""

        return R()

    monkeypatch.setattr(pr_mod, "_run", fake_run)
    monkeypatch.setattr(pr_mod.shutil, "which", lambda n: "/fake/gh")
    ok, detail = pr_mod.create_draft_pr(tmp_path, "relay/x", "title", tmp_path / "b.md")
    assert ok
    assert "--draft" in captured["cmd"]
    assert "merge" not in " ".join(str(c) for c in captured["cmd"])


def test_manual_pr_instructions_use_absolute_body_path(tmp_path):
    body = tmp_path / "runs" / "r1" / "report" / "PR_BODY.md"
    text = pr_mod.manual_pr_instructions(
        tmp_path, tmp_path / "wt", "relay/x", "title", body, "gh missing"
    )
    assert str(body) in text
    assert "--draft" in text
    assert "gh pr merge" not in text
