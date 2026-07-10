"""Model routing: task class -> assignment, executable/unsupported, overrides."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.relay_coordinator.graph import Workstream  # noqa: E402
from orchestration.relay_coordinator.routing import (  # noqa: E402
    EXECUTABLE,
    UNSUPPORTED,
    OutcomeRecorder,
    RunOutcome,
    classify_task,
    record_run_outcome,
    resolve_execution,
)


def ws(wid, **kw):
    return Workstream(
        workstream_id=wid,
        title=wid,
        owned_paths=kw.pop("owned", [f"src/{wid}.py"]),
        acceptance_criteria=[f"do {wid}"],
        **kw,
    )


def test_foundation_class_routes_fable_builds_sol_reviews():
    w = ws("A", is_shared_contract=True)
    ex = resolve_execution(w)
    assert ex.task_class == "foundation"
    assert ex.builder_model == "fable"
    assert ex.reviewer_model == "sol"
    assert ex.status == EXECUTABLE
    assert ex.builder_model_id == "claude-fable-5"
    assert ex.reviewer_model_id == "gpt-5.6"


def test_bounded_implementation_routes_sol_builds_fable_reviews():
    w = ws("A", owned=["src/one.py"], risk="low")
    ex = resolve_execution(w)
    assert ex.task_class == "bounded_implementation"
    assert ex.builder_model == "sol"
    assert ex.reviewer_model == "fable"
    # Sol builds means the codex CLI would build -> not executable.
    assert ex.status == UNSUPPORTED
    assert "builder" in ex.reason and "claude" in ex.reason


def test_test_class_inferred_from_test_paths():
    w = ws("A", owned=["backend/tests/test_thing.py"], risk="low")
    assert classify_task(w) == "test"


def test_architecture_sensitive_from_high_risk():
    w = ws("A", owned=["src/one.py"], risk="high")
    assert classify_task(w) == "architecture_sensitive"


def test_explicit_task_class_wins_over_inference():
    w = ws("A", owned=["src/one.py"], risk="low", task_class="foundation")
    assert classify_task(w) == "foundation"


def test_plan_override_of_models_wins():
    # A bounded-implementation workstream (policy would pick sol/fable) but the
    # plan overrides to fable builds / sol reviews -> executable.
    w = ws("A", owned=["src/one.py"], risk="low",
           builder_model="fable", reviewer_model="sol")
    ex = resolve_execution(w)
    assert ex.builder_model == "fable"
    assert ex.reviewer_model == "sol"
    assert ex.status == EXECUTABLE


def test_reverse_orientation_is_unsupported_not_faked():
    # Sol builds / Fable reviews is the explicit unsupported example.
    w = ws("A", builder_model="sol", reviewer_model="fable")
    ex = resolve_execution(w)
    assert ex.status == UNSUPPORTED
    assert ex.reason  # a recorded reason, not a fabricated run


def test_unknown_model_is_unsupported():
    w = ws("A", builder_model="mystery", reviewer_model="sol")
    ex = resolve_execution(w)
    assert ex.status == UNSUPPORTED
    assert "registry" in ex.reason


def test_outcome_recorder_appends_and_recommends(tmp_path):
    store = tmp_path / "outcomes.jsonl"
    rec = OutcomeRecorder(store)
    # fable on foundation: strong; a rival model: weak.
    rec.record(RunOutcome("fable", "foundation", "A", 1, True, "pass", 0, 12.0))
    rec.record(RunOutcome("fable", "foundation", "B", 2, True, "pass", 1, 20.0))
    rec.record(RunOutcome("rival", "foundation", "C", 3, False, "continue", 4, 40.0))
    # Append-only: three lines on disk.
    assert len([ln for ln in store.read_text().splitlines() if ln.strip()]) == 3
    suggestions = rec.recommend()
    foundation = [s for s in suggestions if s["task_class"] == "foundation"][0]
    assert foundation["suggested_builder"] == "fable"
    assert "not rewritten" in foundation["note"]


def test_record_run_outcome_helper(tmp_path):
    store = tmp_path / "outcomes.jsonl"
    w = ws("A", is_shared_contract=True)
    ex = resolve_execution(w)
    out = record_run_outcome(
        store, ex, iterations=1, first_pass_tests=True, final_status="pass",
        reviewer_findings=0, elapsed_s=5.0,
    )
    assert out.model == "fable"
    assert out.task_class == "foundation"
    assert store.is_file()
