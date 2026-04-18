"""Tests for P2.3 — portfolio staffing load."""

from __future__ import annotations

from uuid import uuid4

from app.services.operator import _load_fixture, list_staffing_load


def _reset():
    _load_fixture.cache_clear()


def test_fixture_has_staff_and_load():
    _reset()
    f = _load_fixture()
    assert len(f.get("staff", [])) >= 4
    assert len(f.get("staff_load", [])) >= 6


def test_kpatel_is_overloaded():
    """K. Patel has 85% + 35% = 120% → overloaded."""
    _reset()
    board = list_staffing_load(env_id=uuid4(), business_id=None)
    kp = next(s for s in board["staff"] if s["staff_id"] == "stf-kpatel")
    assert kp["allocation_total_pct"] == 120
    assert kp["overloaded"] is True


def test_staff_sorted_allocation_desc():
    _reset()
    board = list_staffing_load(env_id=uuid4(), business_id=None)
    allocations = [s["allocation_total_pct"] for s in board["staff"]]
    assert allocations == sorted(allocations, reverse=True)


def test_every_staff_projects_link_to_real_projects():
    _reset()
    project_ids = {p["id"] for p in _load_fixture()["projects"]}
    board = list_staffing_load(env_id=uuid4(), business_id=None)
    for staff in board["staff"]:
        for p in staff["projects"]:
            assert p["project_id"] in project_ids


def test_hrefs_include_env_id():
    _reset()
    env_id = uuid4()
    board = list_staffing_load(env_id=env_id, business_id=None)
    for s in board["staff"]:
        for p in s["projects"]:
            assert str(env_id) in (p.get("href") or "")


def test_project_coverage_sorted_low_first():
    """Projects with low coverage surface first so gaps are obvious."""
    _reset()
    board = list_staffing_load(env_id=uuid4(), business_id=None)
    coverage = [p["total_allocation_pct"] for p in board["project_coverage"]]
    assert coverage == sorted(coverage)


def test_totals_match_fixture():
    _reset()
    staff = _load_fixture()["staff"]
    board = list_staffing_load(env_id=uuid4(), business_id=None)
    assert board["totals"]["staff_count"] == len(staff)
    assert board["totals"]["overloaded_count"] >= 1


def test_stretch_assignments_surface_in_projects():
    _reset()
    board = list_staffing_load(env_id=uuid4(), business_id=None)
    has_stretch = any(
        p["stretch"] for s in board["staff"] for p in s["projects"]
    )
    assert has_stretch, "fixture should include at least one stretch assignment"
