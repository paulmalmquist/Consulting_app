"""Tests for orchestration.relay_coordinator.telemetry.

The recorder MUST never invent a builder model, and a SKIPPED suite MUST
never be counted as a first-pass green. These are the two invariants the
whole point of this ticket rests on; the rest of the tests exercise
outcome mapping, aggregation, and the CLI surfaces.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from orchestration.relay_coordinator import telemetry as tel  # noqa: E402


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _make_run(
    root: Path,
    *,
    run_id: str,
    state: str = "PASS",
    exit_code: int = 0,
    iterations: list[dict] | None = None,
    claude_model=None,
    claude_model_resolution: str | None = None,
    codex_model="gpt-5.4",
    task_class: str = "bounded_implementation",
    detail: str = "",
) -> Path:
    """Fabricate a run folder that matches what the relay writes."""
    run_dir = root / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    run_json = {
        "run_id": run_id,
        "title": f"test run {run_id}",
        "plan_path": f"docs/plans/{run_id}.md",
        "base_sha": "abc123",
        "max_iterations": 3,
        "state": state,
        "exit_code": exit_code,
        "iterations_run": len(iterations or []),
        "detail": detail,
        "codex_model": codex_model,
        "codex_effort": "low",
        "codex_max_effort": "medium",
    }
    if claude_model is not None:
        run_json["claude_model"] = claude_model
    if claude_model_resolution is not None:
        run_json["claude_model_resolution"] = claude_model_resolution
    _write_json(run_dir / "run.json", run_json)
    (run_dir / "plan").mkdir()
    (run_dir / "plan" / "original-plan.md").write_text(
        f"# {run_id}\n\nTask class: {task_class}\n\nBody.\n", encoding="utf-8",
    )
    for spec in iterations or []:
        idx = spec["iteration"]
        it_dir = run_dir / "iterations" / f"{idx:02d}"
        it_dir.mkdir(parents=True, exist_ok=True)
        _write_json(it_dir / "build-meta.json", {"duration_ms": spec.get("build_ms", 1000)})
        _write_json(it_dir / "review-meta.json", {"duration_ms": spec.get("review_ms", 500)})
        _write_json(it_dir / "safety.json", spec.get("safety", []))
        if "verdict" in spec:
            _write_json(it_dir / "verdict.json", spec["verdict"])
        if "suites" in spec:
            _write_json(it_dir / "tests" / "summary.json", spec["suites"])
        (it_dir / "review-bundle").mkdir()
        (it_dir / "review-bundle" / "diff-stat.txt").write_text(
            spec.get("diff_stat", " 2 files changed, 10 insertions(+), 3 deletions(-)\n"),
            encoding="utf-8",
        )
    return run_dir


def test_row_carries_plan_ticket_id_slug(tmp_path):
    """The row must expose the plan ticket id/slug so per-plan aggregation
    works; `plan_path` and `plan_title` alone are not enough."""
    run_dir = _make_run(
        tmp_path, run_id="20260714-000030-plan",
        iterations=[{"iteration": 1, "verdict": {"status": "pass", "summary": "ok",
                     "criteria_status": [], "risk_flags": []}}],
    )
    # Simulate the real relay's plan_path convention: NNNN-slug.md.
    payload = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    payload["plan_path"] = "docs/plans/03-implementation-plans/active/0034-relay-orchestration-telemetry.md"
    (run_dir / "run.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    row = tel.build_row_from_run_folder(run_dir)
    assert row is not None
    assert "plan" in row
    assert row["plan"] == "0034-relay-orchestration-telemetry"


def test_reviewer_model_verified_from_invocation_argv(tmp_path):
    """The reviewer model must come from the actual invocation argv when
    available (proof-by-receipts), not merely from the requested arg."""
    run_dir = _make_run(
        tmp_path, run_id="20260714-000031-argv",
        codex_model="gpt-5.4",
        iterations=[{"iteration": 1, "verdict": {"status": "pass", "summary": "ok",
                     "criteria_status": [], "risk_flags": []}}],
    )
    # Simulate what loop.py writes: review-meta.json with the actual argv.
    review_meta_path = run_dir / "iterations" / "01" / "review-meta.json"
    review_meta_path.write_text(json.dumps({
        "agent": "codex",
        "adapter": "relay_reviewer",
        "command": ["codex", "exec", "--cd", "/tmp/x", "--skip-git-repo-check",
                    "-m", "gpt-5.4-actually-used", "-c", "model_reasoning_effort=low", "-"],
        "exit_code": 0,
        "duration_ms": 500,
    }), encoding="utf-8")
    row = tel.build_row_from_run_folder(run_dir)
    assert row["reviewer_model"] == "gpt-5.4-actually-used"
    assert row["reviewer_model_resolution"] == "verified_from_invocation_argv"


def test_reviewer_model_null_when_argv_lacks_model_flag(tmp_path):
    """If the recorded argv has no -m/--model, the row must fall back to
    what run.json can prove — or to null when even that is absent."""
    run_dir = _make_run(
        tmp_path, run_id="20260714-000032-noargv",
        codex_model=None,
        iterations=[{"iteration": 1, "verdict": {"status": "pass", "summary": "ok",
                     "criteria_status": [], "risk_flags": []}}],
    )
    # Delete codex_model so run.json cannot back a claim either.
    payload = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    payload.pop("codex_model", None)
    (run_dir / "run.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (run_dir / "iterations" / "01" / "review-meta.json").write_text(json.dumps({
        "command": ["codex", "exec", "--cd", "/tmp/x", "--skip-git-repo-check", "-"],
        "duration_ms": 500,
    }), encoding="utf-8")
    row = tel.build_row_from_run_folder(run_dir)
    assert row["reviewer_model"] is None
    assert row["reviewer_model_resolution"] == "cli_default_unreported"


def test_unresolved_builder_records_null_not_a_guess(tmp_path):
    _make_run(
        tmp_path, run_id="20260714-000001-unresolved",
        claude_model=None, claude_model_resolution="cli_default_unreported",
        iterations=[{"iteration": 1, "verdict": {"status": "pass", "summary": "ok",
                     "criteria_status": [], "risk_flags": []}}],
    )
    row = tel.build_row_from_run_folder(tmp_path / "20260714-000001-unresolved")
    assert row is not None
    assert row["builder_model"] is None
    assert row["builder_model_resolution"] == "cli_default_unreported"


def test_legacy_cli_default_string_is_translated_to_null(tmp_path):
    """Rows for the 14 pre-telemetry runs recorded the literal '(cli default)';
    a backfill must not carry that forward as if it were a model name."""
    _make_run(
        tmp_path, run_id="20260714-000002-legacy",
        claude_model="(cli default)",
    )
    row = tel.build_row_from_run_folder(tmp_path / "20260714-000002-legacy")
    assert row["builder_model"] is None
    assert row["builder_model_resolution"] == "cli_default_unreported"


def test_first_pass_tests_false_when_any_iter1_suite_failed(tmp_path):
    _make_run(
        tmp_path, run_id="20260714-000003-fail",
        state="MAX_ITER", exit_code=1,
        iterations=[{
            "iteration": 1,
            "suites": [
                {"name": "backend", "skipped": False, "exit_code": 0, "duration_s": 4.0},
                {"name": "frontend", "skipped": False, "exit_code": 1, "duration_s": 2.0},
            ],
            "verdict": {"status": "continue", "summary": "keep going",
                        "criteria_status": [], "risk_flags": []},
        }],
    )
    row = tel.build_row_from_run_folder(tmp_path / "20260714-000003-fail")
    assert row["first_pass_tests"] == "false"


def test_first_pass_tests_records_skipped_not_pass(tmp_path):
    """The exact regression: a suite that SKIPPED must be recorded as
    'skipped', never as a green first pass — the node_modules-junction
    failure that hid the frontend suites for most of the sustainability
    roadmap must be visible at aggregation time."""
    _make_run(
        tmp_path, run_id="20260714-000004-skipped",
        iterations=[{
            "iteration": 1,
            "suites": [
                {"name": "frontend-lint", "skipped": True,
                 "reason": "node_modules missing", "exit_code": None, "duration_s": 0.0},
            ],
            "verdict": {"status": "pass", "summary": "ok",
                        "criteria_status": [], "risk_flags": []},
        }],
    )
    row = tel.build_row_from_run_folder(tmp_path / "20260714-000004-skipped")
    assert row["first_pass_tests"] == "skipped"


def test_terminal_outcomes_map_correctly(tmp_path):
    cases = [
        ("PASS", 0, "pass", "pass"),
        ("MAX_ITER", 1, "continue", "max_iter"),
        ("BLOCKED", 5, "blocked", "blocked"),
        ("BLOCKED", 5, "risk_escalation", "risk_escalation"),
        ("SAFETY_STOP", 4, "continue", "safety_stop"),
        ("ERROR", 6, None, "error"),
    ]
    for i, (state, code, verdict_status, expected) in enumerate(cases):
        iters = []
        if verdict_status is not None:
            iters = [{"iteration": 1, "verdict": {
                "status": verdict_status, "summary": "x",
                "criteria_status": [], "risk_flags": [],
            }}]
        _make_run(
            tmp_path, run_id=f"20260714-00000{i}-outcome",
            state=state, exit_code=code, iterations=iters,
        )
        row = tel.build_row_from_run_folder(tmp_path / f"20260714-00000{i}-outcome")
        assert row["outcome"] == expected, f"{state}/{verdict_status} → {row['outcome']}"
        assert row["exit_code"] == code


def test_aggregate_groups_by_builder_model_and_task_class(tmp_path):
    """Aggregation math over a small honest fixture set."""
    rows = [
        {"builder_model": "fable", "task_class": "foundation",
         "outcome": "pass", "rejected": False, "iterations_used": 1,
         "first_pass_tests": "true", "final_unmet": 0, "final_unknown": 0,
         "final_risk_flags": 0, "elapsed_s": {"total": 120.0}},
        {"builder_model": "fable", "task_class": "foundation",
         "outcome": "max_iter", "rejected": False, "iterations_used": 3,
         "first_pass_tests": "false", "final_unmet": 2, "final_unknown": 1,
         "final_risk_flags": 0, "elapsed_s": {"total": 300.0}},
        {"builder_model": "fable", "task_class": "foundation",
         "outcome": "pass", "rejected": False, "iterations_used": 2,
         "first_pass_tests": "true", "final_unmet": 0, "final_unknown": 0,
         "final_risk_flags": 0, "elapsed_s": {"total": 200.0}},
        {"builder_model": "sol", "task_class": "bounded_implementation",
         "outcome": "blocked", "rejected": True, "iterations_used": 1,
         "first_pass_tests": "skipped", "final_unmet": 0, "final_unknown": 3,
         "final_risk_flags": 1, "elapsed_s": {"total": 60.0}},
    ]
    agg = {(r["builder_model"], r["task_class"]): r for r in tel.aggregate(rows)}
    fable = agg[("fable", "foundation")]
    assert fable["runs"] == 3
    assert fable["pass_rate"] == round(2 / 3, 3)
    assert fable["mean_iterations"] == 2.0
    # Only "true"/"false"/"skipped" are eligible; here all 3 are, and 2 are true.
    assert fable["first_pass_test_rate"] == round(2 / 3, 3)
    sol = agg[("sol", "bounded_implementation")]
    assert sol["rejection_rate"] == 1.0
    assert sol["mean_review_findings"] == 4.0


def test_report_on_empty_store_exits_zero_with_empty_table(tmp_path, capsys):
    empty = tmp_path / "runs.jsonl"
    rc = tel.main(["--repo-root", str(tmp_path),
                   "--telemetry-path", str(empty),
                   "--runs-root", str(tmp_path / "nonexistent-runs"),
                   "report"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "builder_model" in out
    assert "(no runs recorded)" in out


def test_backfill_skips_non_terminal_runs(tmp_path):
    """A run whose run.json is still STARTED (mid-flight) must not be
    emitted by backfill. Only completed runs count as evidence."""
    runs_root = tmp_path / "runs"
    _make_run(
        runs_root, run_id="20260714-000020-in-flight",
        state="STARTED", exit_code=0, iterations=[],
    )
    _make_run(
        runs_root, run_id="20260714-000021-done",
        state="PASS", exit_code=0,
        iterations=[{"iteration": 1, "verdict": {"status": "pass", "summary": "ok",
                     "criteria_status": [], "risk_flags": []}}],
    )
    tpath = tmp_path / "telemetry.jsonl"
    n = tel.backfill(runs_root, tpath)
    assert n == 1
    rows = tel.read_rows(tpath)
    assert [r["run_id"] for r in rows] == ["20260714-000021-done"]
    # Direct call also honors the terminal filter.
    assert tel.build_row_from_run_folder(runs_root / "20260714-000020-in-flight") is None


def test_backfill_does_not_mutate_run_folders(tmp_path):
    runs_root = tmp_path / "runs"
    run_dir = _make_run(
        runs_root, run_id="20260714-000010-backfill",
        iterations=[{"iteration": 1, "verdict": {"status": "pass", "summary": "ok",
                     "criteria_status": [], "risk_flags": []}}],
    )
    before = {
        p.relative_to(run_dir).as_posix(): p.stat().st_mtime_ns
        for p in run_dir.rglob("*") if p.is_file()
    }
    tpath = tmp_path / "telemetry.jsonl"
    n = tel.backfill(runs_root, tpath)
    assert n == 1
    after = {
        p.relative_to(run_dir).as_posix(): p.stat().st_mtime_ns
        for p in run_dir.rglob("*") if p.is_file()
    }
    assert before == after, "backfill must not touch source run folders"
    rows = tel.read_rows(tpath)
    assert len(rows) == 1
    # Idempotent: second backfill does not duplicate the row.
    assert tel.backfill(runs_root, tpath) == 0
    assert len(tel.read_rows(tpath)) == 1


# --- a safety stop is not a rejection ------------------------------------

def test_safety_stop_is_not_counted_as_a_rejection(tmp_path):
    """A safety stop says the builder touched a protected surface, not that
    its work was poor.

    `rejected` is a signal about the builder model's output quality: the
    reviewer judged the work unfit. A safety stop is a signal about SCOPE. The
    code may be perfectly good and still be stopped, which is exactly what
    happened to this ticket's own first run: it was halted for a relay
    self-edit the plan explicitly called for.

    Folding safety stops into the rejection rate would penalise whichever model
    happened to touch protected code and poison the routing evidence this
    module exists to produce.
    """
    root = tmp_path / "runs"

    _make_run(root, run_id="r-safety", state="SAFETY_STOP", exit_code=4,
              detail="orchestration_self_edit")
    _make_run(root, run_id="r-blocked", state="BLOCKED", exit_code=5,
              detail="reviewer blocked")

    safety = tel.build_row_from_run_folder(root / "r-safety")
    blocked = tel.build_row_from_run_folder(root / "r-blocked")

    # The safety stop is recorded, but is NOT a rejection.
    assert safety["rejected"] is False
    assert safety["safety_stopped"] is True
    assert safety["safety_stop_reason"]
    assert safety["rejection_reason"] is None

    # A reviewer block IS a rejection, and is not a safety stop.
    assert blocked["rejected"] is True
    assert blocked["safety_stopped"] is False

    # The aggregate keeps the two apart rather than conflating them.
    agg = tel.aggregate([safety, blocked])
    row = agg[0]
    assert row["runs"] == 2
    assert row["rejection_rate"] == 0.5, "safety stop must not inflate rejection rate"
    assert row["safety_stop_rate"] == 0.5


# --- the report must not silently lie ------------------------------------

def test_report_row_columns_line_up_with_the_header():
    """Every header has a value under it, in the right place.

    A report whose columns are misaligned is worse than no report: it reads as
    authoritative while attributing one metric's number to another. That is how
    a `safety_stop_rate` of 2.7 (an impossible rate) can appear, when what is
    actually being printed under that header is the mean-iterations figure.

    This pins the header and the row renderer to the same width, so adding a
    column to one without the other fails loudly instead of shifting every
    number after it one place to the left.
    """
    agg = [{
        "builder_model": "(unreported)",
        "task_class": "unclassified",
        "runs": 10,
        "pass_rate": 0.1,
        "rejection_rate": 0.3,
        "safety_stop_rate": 0.1,
        "mean_iterations": 2.7,
        "first_pass_test_rate": 0.667,
        "mean_review_findings": 3.1,
        "mean_elapsed_s": 927.88,
    }]

    out = tel.format_report(agg).strip().splitlines()
    header, row = out[0].split(" | "), out[1].split(" | ")

    assert len(row) == len(header), (
        f"row has {len(row)} values for {len(header)} headers -- columns are shifted"
    )

    cells = dict(zip(header, row))
    # Each value must appear under its OWN header, not its neighbour's.
    assert cells["safety_stop_rate"] == "0.1"
    assert cells["mean_iterations"] == "2.7"
    assert cells["rejection_rate"] == "0.3"
    assert cells["mean_elapsed_s"] == "927.88"

    # Rates are rates. A value > 1.0 under a rate column means misalignment.
    for col in ("pass_rate", "rejection_rate", "safety_stop_rate"):
        assert 0.0 <= float(cells[col]) <= 1.0, f"{col}={cells[col]} is not a rate"


def test_report_alignment_holds_when_first_pass_rate_is_missing():
    """The n/a substitution must not consume the wrong slot."""
    agg = [{
        "builder_model": "fable", "task_class": "foundation", "runs": 1,
        "pass_rate": 1.0, "rejection_rate": 0.0, "safety_stop_rate": 0.0,
        "mean_iterations": 1.0, "first_pass_test_rate": None,
        "mean_review_findings": 0.0, "mean_elapsed_s": 12.5,
    }]
    out = tel.format_report(agg).strip().splitlines()
    header, row = out[0].split(" | "), out[1].split(" | ")
    assert len(row) == len(header)
    cells = dict(zip(header, row))
    assert cells["first_pass_test_rate"] == "n/a"
    assert cells["mean_elapsed_s"] == "12.5"
