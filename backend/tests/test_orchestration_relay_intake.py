from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay import intake  # noqa: E402
from orchestration.coding_relay.intake import IntakeError  # noqa: E402
from orchestration.coding_relay.runs import safe_slug  # noqa: E402

PLAN_WITH_CRITERIA = """# Add widget counter

Do the thing.

## Success Criteria

- The dashboard page shows a widget counter component
- GET /api/widgets returns a count field with status 200
- pytest backend tests pass
- existing widget rendering must not break

## Out of scope

- Anything else
"""

PLAN_WITH_SECTIONS = """# Sectioned plan

## Acceptance Criteria

### Screen
- counter renders

### API
- Not applicable

### Evals/tests
- vitest suite green
"""


def test_missing_criteria_is_refused():
    with pytest.raises(IntakeError) as exc:
        intake.normalize_criteria("")  # not reached via load_plan, direct check below
    assert "concrete" in str(exc.value) or "criteria" in str(exc.value).lower()


def test_load_plan_refuses_plan_without_criteria(tmp_path):
    plan = tmp_path / "plan.md"
    plan.write_text("# No criteria here\n\nJust vibes.\n", encoding="utf-8")
    with pytest.raises(IntakeError) as exc:
        intake.load_plan(tmp_path, str(plan), None)
    assert "Acceptance Criteria" in str(exc.value)


def test_extract_and_normalize_keyword_classification(tmp_path):
    plan = tmp_path / "plan.md"
    plan.write_text(PLAN_WITH_CRITERIA, encoding="utf-8")
    result = intake.load_plan(tmp_path, str(plan), None)
    assert result.title == "Add widget counter"
    checklist = result.criteria.checklist()
    assert len(checklist) == 4
    # Exact per-bullet routing: id shifts here would silently desync the
    # reviewer's criteria_status from the report checklist.
    assert ("S1", "Screen", "The dashboard page shows a widget counter component") in checklist
    assert ("A1", "API", "GET /api/widgets returns a count field with status 200") in checklist
    assert ("T1", "Evals-tests", "pytest backend tests pass") in checklist
    assert ("R1", "Regression guard", "existing widget rendering must not break") in checklist
    # Out-of-scope section is not swallowed into criteria.
    assert all("Anything else" not in text for _, _, text in checklist)


def test_short_keywords_do_not_fire_inside_words(tmp_path):
    # 'db' in 'feedback' and 'ci' in 'decision' must not classify these
    # UI bullets as DB-Data or Evals-tests.
    plan = tmp_path / "plan.md"
    plan.write_text(
        "# T\n\n## Acceptance Criteria\n\n"
        "- Surface reviewer feedback in the sidebar page\n"
        "- Render the decision summary on the overview page\n",
        encoding="utf-8",
    )
    result = intake.load_plan(tmp_path, str(plan), None)
    sections = {text: sec for _, sec, text in result.criteria.checklist()}
    assert sections["Surface reviewer feedback in the sidebar page"] == "Screen"
    assert sections["Render the decision summary on the overview page"] == "Screen"


def test_explicit_subsections_respected(tmp_path):
    plan = tmp_path / "plan.md"
    plan.write_text(PLAN_WITH_SECTIONS, encoding="utf-8")
    result = intake.load_plan(tmp_path, str(plan), None)
    md = result.criteria.to_markdown()
    checklist = result.criteria.checklist()
    assert ("S1", "Screen", "counter renders") in checklist
    assert ("T1", "Evals-tests", "vitest suite green") in checklist
    # "Not applicable" bullets are dropped, and the section renders as such.
    assert "### API\nNot applicable." in md


def test_markdown_renders_all_six_sections(tmp_path):
    plan = tmp_path / "plan.md"
    plan.write_text(PLAN_WITH_CRITERIA, encoding="utf-8")
    result = intake.load_plan(tmp_path, str(plan), None)
    md = result.criteria.to_markdown()
    for name in ("Screen", "API", "DB-Data", "AI behavior", "Evals-tests", "Regression guard"):
        assert f"### {name}" in md


def test_resolve_plan_path_by_prefix(tmp_path):
    active = tmp_path / "docs" / "plans" / "03-implementation-plans" / "active"
    active.mkdir(parents=True)
    (active / "0042-demo-plan.md").write_text("# x\n", encoding="utf-8")
    (active / "0043-other.md").write_text("# y\n", encoding="utf-8")
    assert intake.resolve_plan_path(tmp_path, "0042").name == "0042-demo-plan.md"
    with pytest.raises(IntakeError):
        intake.resolve_plan_path(tmp_path, "004")  # ambiguous
    with pytest.raises(IntakeError):
        intake.resolve_plan_path(tmp_path, "9999")  # no match


def test_safe_slug():
    assert safe_slug("Add Widget Counter!") == "add-widget-counter"
    assert safe_slug("///") == "task"
    assert len(safe_slug("a" * 100)) <= 24
