"""Guided operator flow: menu, criteria confirm/edit, preflight display,
prompts, PR-offer policy, and no-mutation-on-abort. All I/O is injected;
no TTY, no CLIs, no tokens.
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

from orchestration.coding_relay import guided  # noqa: E402
from orchestration.coding_relay.__main__ import build_parser  # noqa: E402
from orchestration.coding_relay.guided import (  # noqa: E402
    AutoUI,
    TerminalUI,
    confirm_criteria,
    plan_menu_entries,
    reload_criteria,
    render_preflight,
    select_plan,
    strip_id_markers,
)
from orchestration.coding_relay.intake import IntakeError, load_plan  # noqa: E402
from orchestration.coding_relay.preflight import Check, PreflightResult  # noqa: E402

FIXTURE = ROOT / "orchestration" / "coding_relay" / "fixtures" / "demo"

PLAN_TEXT = (FIXTURE / "plan.md").read_text(encoding="utf-8")


class Script:
    """Deterministic input_fn: pops scripted answers, records prompts."""

    def __init__(self, answers):
        self.answers = list(answers)
        self.prompts = []

    def __call__(self, prompt=""):
        self.prompts.append(prompt)
        if not self.answers:
            raise AssertionError(f"input exhausted at prompt: {prompt!r}")
        return self.answers.pop(0)


class Sink:
    def __init__(self):
        self.lines = []

    def __call__(self, text=""):
        self.lines.append(str(text))

    @property
    def text(self):
        return "\n".join(self.lines)


@pytest.fixture(autouse=True)
def _isolate_git_config(monkeypatch):
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", os.devnull)
    monkeypatch.setenv("GIT_CONFIG_SYSTEM", os.devnull)


@pytest.fixture()
def repo_with_active_plan(tmp_path):
    repo = tmp_path / "repo"
    active = repo / "docs" / "plans" / "03-implementation-plans" / "active"
    active.mkdir(parents=True)
    subprocess.run(["git", "init"], cwd=str(repo), capture_output=True, text=True)
    for cmd in (
        ["config", "user.email", "t@example.com"],
        ["config", "user.name", "T"],
        ["config", "commit.gpgsign", "false"],
    ):
        subprocess.run(["git", "-C", str(repo), *cmd], capture_output=True, text=True)
    (active / "0001-demo-plan.md").write_text(PLAN_TEXT, encoding="utf-8")
    (repo / "README.md").write_text("seed\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(repo), "add", "-A"], capture_output=True, text=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-m", "seed"], capture_output=True, text=True)
    return repo


# ------------------------------------------------------------------- menu

def test_plan_menu_entries_parse_title_and_status(repo_with_active_plan):
    entries = plan_menu_entries(repo_with_active_plan)
    assert len(entries) == 1
    path, title, status = entries[0]
    assert path.name == "0001-demo-plan.md"
    assert title.startswith("Demo fixture plan")
    # The demo plan has no Status line; robustness means empty, not crash.
    assert status == ""


def test_plan_menu_robust_to_garbage_file(repo_with_active_plan):
    active = repo_with_active_plan / "docs" / "plans" / "03-implementation-plans" / "active"
    (active / "0002-garbage.md").write_bytes(b"\xff\xfe\x00garbage")
    entries = plan_menu_entries(repo_with_active_plan)
    assert len(entries) == 2  # no crash


def test_select_plan_by_number(repo_with_active_plan):
    script = Script(["1"])
    sel = select_plan(repo_with_active_plan, script, Sink())
    assert sel and sel["plan"].endswith("0001-demo-plan.md")


def test_select_plan_quit_and_empty(repo_with_active_plan):
    assert select_plan(repo_with_active_plan, Script(["q"]), Sink()) is None
    assert select_plan(repo_with_active_plan, Script([""]), Sink()) is None


def test_select_plan_file_path(repo_with_active_plan, tmp_path):
    plan = tmp_path / "somewhere.md"
    plan.write_text(PLAN_TEXT, encoding="utf-8")
    sel = select_plan(repo_with_active_plan, Script(["f", str(plan)]), Sink())
    assert sel == {"plan": str(plan)}
    # Bad path re-prompts, then quit.
    out = Sink()
    sel = select_plan(repo_with_active_plan, Script(["f", "no-such.md", "q"]), out)
    assert sel is None
    assert "Not a file" in out.text


def test_select_plan_paste(repo_with_active_plan):
    lines = PLAN_TEXT.splitlines()
    script = Script(["p", *lines, "END"])
    sel = select_plan(repo_with_active_plan, script, Sink())
    assert sel and "paste_file" in sel
    pasted = Path(sel["paste_file"]).read_text(encoding="utf-8")
    assert "Acceptance Criteria" in pasted


def test_select_plan_unrecognized_reprompts(repo_with_active_plan):
    out = Sink()
    sel = select_plan(repo_with_active_plan, Script(["zz", "99", "1"]), out)
    assert sel and sel["plan"].endswith("0001-demo-plan.md")
    assert "Unrecognized" in out.text


# --------------------------------------------------------------- criteria

def _demo_result(repo_root):
    return load_plan(repo_root, str(FIXTURE / "plan.md"), None)


def test_strip_id_markers():
    assert strip_id_markers("- [T1] tests pass") == "- tests pass"
    assert strip_id_markers("  - [R12] no break") == "  - no break"
    assert strip_id_markers("- plain bullet") == "- plain bullet"


def test_reload_criteria_roundtrip(tmp_path):
    result = _demo_result(tmp_path)
    md = result.criteria.to_markdown()
    criteria = reload_criteria(md)
    assert [c[2] for c in criteria.checklist()] == [c[2] for c in result.criteria.checklist()]


def test_reload_criteria_invalid_raises():
    with pytest.raises(IntakeError):
        reload_criteria("no heading, no bullets")
    with pytest.raises(IntakeError):
        reload_criteria("## Acceptance Criteria\n\n(prose only, no bullets)\n")


def test_confirm_criteria_accept_and_abort(tmp_path):
    result = _demo_result(tmp_path)
    assert confirm_criteria(result, Script(["y"]), Sink()) is result
    assert confirm_criteria(result, Script([""]), Sink()) is result
    assert confirm_criteria(_demo_result(tmp_path), Script(["n"]), Sink()) is None


def test_confirm_criteria_edit_reloads(tmp_path):
    result = _demo_result(tmp_path)

    def editor(path: Path):
        text = path.read_text(encoding="utf-8")
        path.write_text(
            text + "- the new edited criterion runs a pytest check\n", encoding="utf-8"
        )

    out = Sink()
    confirmed = confirm_criteria(result, Script(["e", "y"]), out, editor_fn=editor)
    assert confirmed is not None
    texts = [t for _, _, t in confirmed.criteria.checklist()]
    assert any("new edited criterion" in t for t in texts)


def test_confirm_criteria_edit_propagates_into_plan_text(tmp_path):
    """The edited criteria must replace the plan's original criteria section
    in plan_text, so the builder/reviewer prompts do not carry stale,
    contradicting criteria."""
    result = _demo_result(tmp_path)
    original_criterion = "The fixture loop runs to completion"
    assert original_criterion in result.plan_text

    def editor(path: Path):
        # Replace all criteria with a single fresh one.
        path.write_text(
            "## Acceptance Criteria\n\n### Evals/tests\n"
            "- only the freshly edited criterion survives\n",
            encoding="utf-8",
        )

    confirmed = confirm_criteria(result, Script(["e", "y"]), Sink(), editor_fn=editor)
    assert confirmed is not None
    # The stale original criterion is gone from plan_text; the edit is present.
    assert original_criterion not in confirmed.plan_text
    assert "only the freshly edited criterion survives" in confirmed.plan_text
    # And the plan's non-criteria content is preserved.
    assert "RELAY_NOTE.md" in confirmed.plan_text


def test_confirm_criteria_edit_to_invalid_raises(tmp_path):
    result = _demo_result(tmp_path)

    def editor(path: Path):
        path.write_text("wrecked\n", encoding="utf-8")

    with pytest.raises(IntakeError):
        confirm_criteria(result, Script(["e"]), Sink(), editor_fn=editor)


def test_confirm_criteria_assume_yes_skips_prompt(tmp_path):
    result = _demo_result(tmp_path)
    script = Script([])  # any prompt would raise
    assert confirm_criteria(result, script, Sink(), assume_yes=True) is result


# -------------------------------------------------------------- preflight

def test_render_preflight_table():
    checks = PreflightResult()
    checks.add("git-repo", "ok", "C:/x")
    checks.add("gh-cli", "warn", "gh unauthenticated\nsecond warn line dropped")
    checks.add("base-fetch", "fail", "network down\nre-run with --allow-stale-base")
    out = Sink()
    render_preflight(checks, out)
    assert "OK    git-repo" in out.text
    assert "WARN  gh-cli" in out.text
    assert "FAIL  base-fetch" in out.text
    # WARN/OK rows are truncated to one line; FAIL rows keep the remediation.
    assert "second warn line dropped" not in out.text
    assert "re-run with --allow-stale-base" in out.text


def _args(extra=None):
    return build_parser().parse_args(extra or [])


def test_confirm_warnings_default_no():
    ui = TerminalUI(_args(), Script([""]), Sink())
    assert ui.confirm_warnings([Check("gh-cli", "warn", "x")]) is False
    ui = TerminalUI(_args(), Script(["y"]), Sink())
    assert ui.confirm_warnings([Check("gh-cli", "warn", "x")]) is True


def test_yes_flag_accepts_warnings_without_prompt():
    ui = TerminalUI(_args(["--yes"]), Script([]), Sink())
    assert ui.confirm_warnings([Check("gh-cli", "warn", "x")]) is True


# ----------------------------------------------------------- PR decisions

class FakeVerdict:
    def __init__(self, should_open_pr=True, criteria_status=None,
                 required_next_steps=None, risk_flags=None,
                 status="continue", summary="s"):
        self.should_open_pr = should_open_pr
        self.criteria_status = criteria_status or []
        self.required_next_steps = required_next_steps or []
        self.risk_flags = risk_flags or []
        self.status = status
        self.summary = summary


def test_terminal_pr_offer_pass_default_yes():
    ui = TerminalUI(_args(), Script([""]), Sink())
    assert ui.decide_pr("PASS", FakeVerdict()) is True
    ui = TerminalUI(_args(), Script(["n"]), Sink())
    assert ui.decide_pr("PASS", FakeVerdict()) is False


def test_terminal_pr_offer_pass_reviewer_veto_defaults_no():
    ui = TerminalUI(_args(), Script([""]), Sink())
    assert ui.decide_pr("PASS", FakeVerdict(should_open_pr=False)) is False


def test_terminal_pr_offer_max_iter_default_no():
    ui = TerminalUI(_args(), Script([""]), Sink())
    assert ui.decide_pr("MAX_ITER", FakeVerdict()) is False
    ui = TerminalUI(_args(), Script(["y"]), Sink())
    assert ui.decide_pr("MAX_ITER", FakeVerdict()) is True


def test_terminal_pr_never_offered_after_stop_states():
    for state in ("SAFETY_STOP", "BLOCKED", "ERROR"):
        ui = TerminalUI(_args(), Script([]), Sink())  # a prompt would raise
        assert ui.decide_pr(state, FakeVerdict()) is False
        # Even --draft-pr cannot reach these states.
        ui = TerminalUI(_args(["--draft-pr"]), Script([]), Sink())
        assert ui.decide_pr(state, FakeVerdict()) is False


def test_terminal_pr_flag_matrix_no_prompt():
    """--yes and --draft-pr resolve the PR decision without prompting; a
    stray prompt would raise via the empty Script."""
    # --yes at MAX_ITER: no PR for failing work without --draft-pr.
    assert TerminalUI(_args(["--yes"]), Script([]), Sink()).decide_pr("MAX_ITER", FakeVerdict()) is False
    # --yes at PASS: PR (delegates to AutoUI policy).
    assert TerminalUI(_args(["--yes"]), Script([]), Sink()).decide_pr("PASS", FakeVerdict()) is True
    # --draft-pr at MAX_ITER: operator override, no prompt.
    assert TerminalUI(_args(["--draft-pr"]), Script([]), Sink()).decide_pr("MAX_ITER", FakeVerdict()) is True
    # --yes at PASS with reviewer veto and no --draft-pr: veto honored.
    assert TerminalUI(_args(["--yes"]), Script([]), Sink()).decide_pr(
        "PASS", FakeVerdict(should_open_pr=False)
    ) is False


def test_eof_at_prompt_is_treated_as_decline():
    def eof(_prompt=""):
        raise EOFError

    ui = TerminalUI(_args(), eof, Sink())
    # PASS default-yes prompt: EOF must decline, not crash or accept.
    assert ui.decide_pr("PASS", FakeVerdict()) is False
    # continue prompt: EOF declines -> operator stop.
    assert ui.on_continue(1, FakeVerdict(), [], []) is False


def test_no_pr_wins_everywhere():
    for state in ("PASS", "MAX_ITER"):
        ui = TerminalUI(_args(["--no-pr"]), Script([]), Sink())
        assert ui.decide_pr(state, FakeVerdict()) is False


def test_auto_ui_matches_flag_policy():
    assert AutoUI(_args()).decide_pr("PASS", FakeVerdict()) is True
    assert AutoUI(_args()).decide_pr("MAX_ITER", FakeVerdict()) is False
    assert AutoUI(_args(["--draft-pr"])).decide_pr("MAX_ITER", FakeVerdict()) is True
    assert AutoUI(_args(["--no-pr"])).decide_pr("PASS", FakeVerdict()) is False
    assert AutoUI(_args()).decide_pr("PASS", FakeVerdict(should_open_pr=False)) is False
    # --draft-pr overrides the reviewer veto (PR 1 byte-compat behavior).
    assert AutoUI(_args(["--draft-pr"])).decide_pr("PASS", FakeVerdict(should_open_pr=False)) is True
    assert AutoUI(_args()).decide_pr("SAFETY_STOP", FakeVerdict()) is False


# --------------------------------------------------- guided E2E (fixture)

def guided_args(repo, tmp_path, extra=None):
    return build_parser().parse_args([
        "--repo-root", str(repo),
        "--fixture", str(FIXTURE),
        "--base", "HEAD",
        "--worktree-root", str(tmp_path / "wts"),
        "--max-iterations", "2",
        *(extra or []),
    ])


def test_guided_quit_makes_no_mutation(repo_with_active_plan, tmp_path):
    args = guided_args(repo_with_active_plan, tmp_path)
    code = guided.run_guided(args, Script(["q"]), Sink())
    assert code == 2
    assert not (repo_with_active_plan / ".orchestration").exists()
    assert not (tmp_path / "wts").exists()


def test_guided_criteria_abort_makes_no_mutation(repo_with_active_plan, tmp_path):
    args = guided_args(repo_with_active_plan, tmp_path)
    code = guided.run_guided(args, Script(["1", "n"]), Sink())
    assert code == 2
    assert not (repo_with_active_plan / ".orchestration").exists()
    assert not (tmp_path / "wts").exists()


def test_guided_start_decline_stops_before_worktree(repo_with_active_plan, tmp_path):
    args = guided_args(repo_with_active_plan, tmp_path)
    # menu 1, criteria yes, warnings yes (tmp repo always warns on venv/base),
    # start: decline.
    code = guided.run_guided(args, Script(["1", "y", "y", "n"]), Sink())
    assert code == 2
    # The preflight writability probe may create the empty root dirs, but no
    # worktree and no run receipts exist.
    assert not list((tmp_path / "wts").glob("*")) if (tmp_path / "wts").exists() else True
    runs = repo_with_active_plan / ".orchestration" / "runs"
    assert not runs.exists() or not list(runs.glob("*"))


def test_guided_happy_path_full_loop(repo_with_active_plan, tmp_path):
    args = guided_args(repo_with_active_plan, tmp_path, ["--no-pr"])
    out = Sink()
    # menu 1, criteria yes, warnings yes, start yes, continue after iter 1 yes.
    code = guided.run_guided(args, Script(["1", "y", "y", "y", "y"]), out)
    assert code == 0
    runs = list((repo_with_active_plan / ".orchestration" / "runs").iterdir())
    assert len(runs) == 1
    assert (runs[0] / "report" / "final-report.md").is_file()
    assert "iteration 1 summary" in out.text
    assert "verdict:  continue" in out.text
    assert "[done] PASS" in out.text


def test_guided_operator_stop_on_continue(repo_with_active_plan, tmp_path):
    args = guided_args(repo_with_active_plan, tmp_path, ["--no-pr"])
    out = Sink()
    # Decline the continue prompt after iteration 1.
    script = Script(["1", "y", "y", "y", "n"])
    code = guided.run_guided(args, script, out)
    assert code == 1
    assert script.answers == []  # exact prompt sequence, no drift
    runs = list((repo_with_active_plan / ".orchestration" / "runs").iterdir())
    meta = json.loads((runs[0] / "run.json").read_text(encoding="utf-8"))
    assert meta["state"] == "MAX_ITER"
    assert "operator stopped" in meta["detail"]
    assert (runs[0] / "report" / "final-report.md").is_file()
    # Contract point 4: the worktree is kept for inspection or a re-run.
    wts = list((tmp_path / "wts").iterdir())
    assert len(wts) == 1 and (wts[0] / "RELAY_NOTE.md").is_file()


def test_guided_warn_decline_stops_before_worktree(repo_with_active_plan, tmp_path):
    """Answering No at the warnings prompt aborts: no worktree, no receipts."""
    args = guided_args(repo_with_active_plan, tmp_path)
    out = Sink()
    code = guided.run_guided(args, Script(["1", "y", "n"]), out)
    assert code == 2
    assert "Stopped at preflight warnings" in out.text
    assert not (tmp_path / "wts").exists() or not list((tmp_path / "wts").glob("*"))
    runs = repo_with_active_plan / ".orchestration" / "runs"
    assert not runs.exists() or not list(runs.glob("*"))


def test_guided_eof_at_continue_is_operator_stop(repo_with_active_plan, tmp_path):
    """EOF (closed stdin) at the continue prompt is a clean operator stop
    (exit 1, report written), never an internal ERROR (exit 6)."""
    args = guided_args(repo_with_active_plan, tmp_path, ["--no-pr"])

    answers = iter(["1", "y", "y", "y"])

    def input_fn(_prompt=""):
        try:
            return next(answers)
        except StopIteration:
            raise EOFError  # stdin closes right at the continue prompt

    code = guided.run_guided(args, input_fn, Sink())
    assert code == 1
    runs = list((repo_with_active_plan / ".orchestration" / "runs").iterdir())
    meta = json.loads((runs[0] / "run.json").read_text(encoding="utf-8"))
    assert meta["state"] == "MAX_ITER"
    assert meta["exit_code"] == 1
    assert (runs[0] / "report" / "final-report.md").is_file()


def test_guided_yes_is_nonblocking(repo_with_active_plan, tmp_path):
    """--yes drives the whole guided run with only the plan selection; any
    later prompt would raise via input exhaustion."""
    args = guided_args(repo_with_active_plan, tmp_path, ["--no-pr", "--yes"])
    script = Script(["1"])  # menu selection only
    code = guided.run_guided(args, script, Sink())
    assert code == 0
    assert script.answers == []
    runs = list((repo_with_active_plan / ".orchestration" / "runs").iterdir())
    assert (runs[0] / "report" / "final-report.md").is_file()


def test_guided_yes_never_bypasses_hard_preflight_failure(repo_with_active_plan, tmp_path):
    """--yes with a bad --fixture dir: the hard preflight failure stops
    before any prompt or mutation, exit 2."""
    args = build_parser().parse_args([
        "--repo-root", str(repo_with_active_plan),
        "--fixture", str(tmp_path / "does-not-exist"),
        "--base", "HEAD",
        "--worktree-root", str(tmp_path / "wts"),
        "--no-pr", "--yes",
    ])
    script = Script(["1"])  # only the menu; no prompt should follow a hard fail
    code = guided.run_guided(args, script, Sink())
    assert code == 2
    assert not (tmp_path / "wts").exists() or not list((tmp_path / "wts").glob("*"))
    runs = repo_with_active_plan / ".orchestration" / "runs"
    assert not runs.exists() or not list(runs.glob("*"))
