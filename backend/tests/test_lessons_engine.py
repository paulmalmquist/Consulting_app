"""Tests for P2.4 — lessons engine."""

from __future__ import annotations

from uuid import uuid4

from app.services.operator import _load_fixture, list_lessons


def _reset():
    _load_fixture.cache_clear()


def test_fixture_has_lessons():
    _reset()
    assert len(_load_fixture().get("project_lessons", [])) >= 4


def test_active_theme_lessons_surface_first():
    _reset()
    board = list_lessons(env_id=uuid4(), business_id=None)
    scores = [r["relevance_score"] for r in board["rows"]]
    assert scores == sorted(scores, reverse=True)


def test_electrical_panel_sizing_lesson_applies():
    """Active review comments on panel_sizing should make that lesson apply."""
    _reset()
    board = list_lessons(env_id=uuid4(), business_id=None)
    panel_lesson = next(r for r in board["rows"] if r["theme"] == "electrical_panel_sizing")
    assert panel_lesson["applies_to_active_work"] is True


def test_totals_are_consistent():
    _reset()
    board = list_lessons(env_id=uuid4(), business_id=None)
    assert board["totals"]["lesson_count"] == len(board["rows"])
    applies = sum(1 for r in board["rows"] if r["applies_to_active_work"])
    assert board["totals"]["applies_count"] == applies


def test_every_lesson_has_preemptive_action():
    _reset()
    board = list_lessons(env_id=uuid4(), business_id=None)
    for row in board["rows"]:
        assert row["preemptive_action"]
        assert len(row["preemptive_action"]) >= 10


def test_lessons_carry_severity():
    _reset()
    board = list_lessons(env_id=uuid4(), business_id=None)
    for row in board["rows"]:
        assert row["severity"] in {"high", "medium", "low"}


def test_municipality_flag_set_for_active_munis():
    _reset()
    board = list_lessons(env_id=uuid4(), business_id=None)
    site_munis = {s["municipality_id"] for s in _load_fixture()["sites"]}
    for row in board["rows"]:
        if row.get("municipality_id") in site_munis:
            assert row["municipality_is_active"] is True
