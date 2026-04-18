"""Tests for P2.5 — review cycle / comment-letter analyzer."""

from __future__ import annotations

from uuid import uuid4

from app.services.operator import _load_fixture, list_review_cycle_analysis


def _reset():
    _load_fixture.cache_clear()


def test_fixture_has_review_comments():
    _reset()
    assert len(_load_fixture().get("review_comments", [])) >= 8


def test_themes_sorted_by_unresolved_then_blocking():
    _reset()
    board = list_review_cycle_analysis(env_id=uuid4(), business_id=None)
    themes = board["themes"]
    assert themes
    keys = [(t["unresolved_count"], t["blocking_count"], t["total_comments"]) for t in themes]
    assert keys == sorted(keys, reverse=True)


def test_panel_sizing_is_a_repeat_theme_on_airport_expansion():
    _reset()
    board = list_review_cycle_analysis(env_id=uuid4(), business_id=None)
    panel = next((t for t in board["themes"] if t["theme"] == "panel_sizing"), None)
    assert panel is not None
    assert panel["total_comments"] >= 3


def test_repeat_offenders_exist_with_cycle_count_ge_2():
    _reset()
    board = list_review_cycle_analysis(env_id=uuid4(), business_id=None)
    assert board["repeat_offenders"]
    for o in board["repeat_offenders"]:
        assert o["cycle_count"] >= 2


def test_cycle_churn_references_real_projects():
    _reset()
    project_ids = {p["id"] for p in _load_fixture()["projects"]}
    board = list_review_cycle_analysis(env_id=uuid4(), business_id=None)
    for row in board["cycle_churn"]:
        assert row["project_id"] in project_ids
        assert row["max_cycle"] >= 1


def test_totals_match_fixture():
    _reset()
    comments = _load_fixture()["review_comments"]
    board = list_review_cycle_analysis(env_id=uuid4(), business_id=None)
    totals = board["totals"]
    assert totals["comment_count"] == len(comments)
    assert totals["unresolved_count"] == sum(1 for c in comments if not c.get("resolved"))
    assert totals["blocking_count"] == sum(1 for c in comments if c.get("severity") == "blocking")


def test_hrefs_include_env_id():
    _reset()
    env_id = uuid4()
    board = list_review_cycle_analysis(env_id=env_id, business_id=None)
    for row in board["cycle_churn"]:
        assert str(env_id) in (row.get("href") or "")


def test_airport_expansion_at_cycle_3():
    _reset()
    board = list_review_cycle_analysis(env_id=uuid4(), business_id=None)
    airport = next(r for r in board["cycle_churn"] if r["project_id"] == "airport-expansion")
    assert airport["max_cycle"] >= 3
