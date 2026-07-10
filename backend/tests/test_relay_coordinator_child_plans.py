"""Child-plan generation: criteria must pass the relay's own intake."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Import the relay's real intake to prove the generated criteria are judgeable.
from orchestration.coding_relay.intake import (  # noqa: E402
    extract_criteria,
    normalize_criteria,
)
from orchestration.relay_coordinator.child_plans import render_child_plan  # noqa: E402
from orchestration.relay_coordinator.graph import (  # noqa: E402
    CoordinatorError,
    Workstream,
)


def ws(**kw):
    return Workstream(
        workstream_id=kw.pop("workstream_id", "SUS-T4"),
        title=kw.pop("title", "Factor registry"),
        owned_paths=kw.pop("owned_paths", ["backend/app/services/sus_factors.py"]),
        forbidden_paths=kw.pop("forbidden_paths", ["orchestration/coding_relay/"]),
        acceptance_criteria=kw.pop(
            "acceptance_criteria",
            ["Register emission factors keyed by activity",
             "Unknown factors fail closed with a null reason"],
        ),
        required_tests=kw.pop("required_tests", ["python -m pytest backend/tests/test_sus_factors.py -q"]),
        **kw,
    )


def test_generated_criteria_pass_relay_normalize_criteria():
    plan = render_child_plan(ws(), base_commit="abc1234")
    raw = extract_criteria(plan.text)
    assert raw is not None  # the relay would find a criteria heading
    criteria = normalize_criteria(raw)  # the relay would accept it (no IntakeError)
    checklist = criteria.checklist()
    assert checklist  # at least one judgeable criterion
    # The required test surfaced as an Evals/tests criterion.
    assert any("pytest" in text.lower() for _, sec, text in checklist)


def test_child_plan_names_owned_and_forbidden_paths_and_base():
    plan = render_child_plan(
        ws(depends_on=["SUS-T1"]),
        base_commit="deadbeef",
        dependency_commits={"SUS-T1": "cafef00d"},
    )
    text = plan.text
    assert "backend/app/services/sus_factors.py" in text  # owned
    assert "orchestration/coding_relay/" in text  # forbidden
    assert "deadbeef" in text  # base commit
    assert "SUS-T1" in text and "cafef00d" in text  # dependency + its base commit


def test_child_plan_without_criteria_raises():
    w = ws(acceptance_criteria=[])
    with pytest.raises(CoordinatorError):
        render_child_plan(w, base_commit="abc1234")


def test_migration_child_plan_has_db_criterion():
    w = ws(workstream_id="SUS-T7", owned_paths=["repo-b/db/schema/900_x.sql"],
           migration=True, migration_order=1,
           acceptance_criteria=["Create the ledger table"])
    plan = render_child_plan(w, base_commit="abc1234")
    criteria = normalize_criteria(extract_criteria(plan.text))
    dbdata = criteria.sections.get("DB-Data", [])
    assert dbdata  # migration workstream gets a DB/Data criterion
