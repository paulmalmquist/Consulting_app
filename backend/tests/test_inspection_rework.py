"""Tests for P2.2 — inspection rework board."""

from __future__ import annotations

from uuid import uuid4

from app.services.operator import _load_fixture, list_inspection_rework


def _reset():
    _load_fixture.cache_clear()


def test_fixture_has_inspection_events():
    _reset()
    assert len(_load_fixture().get("inspection_events", [])) >= 6


def test_overall_fail_rate_between_0_and_1():
    _reset()
    board = list_inspection_rework(env_id=uuid4(), business_id=None)
    assert 0 <= board["totals"]["overall_fail_rate"] <= 1


def test_by_type_sorted_fail_rate_desc():
    _reset()
    board = list_inspection_rework(env_id=uuid4(), business_id=None)
    keys = [(r["fail_rate"], r["failed"]) for r in board["by_inspection_type"]]
    assert keys == sorted(keys, reverse=True)


def test_apex_tops_vendor_rework_when_rework_present():
    _reset()
    board = list_inspection_rework(env_id=uuid4(), business_id=None)
    assert board["by_vendor"]
    # Apex has two failed electrical inspections — should rank high
    apex = next((v for v in board["by_vendor"] if v["vendor_id"] == "apex-electrical"), None)
    assert apex is not None
    assert apex["failed"] >= 2


def test_recent_failures_sorted_date_desc():
    _reset()
    board = list_inspection_rework(env_id=uuid4(), business_id=None)
    dates = [r["inspection_date"] for r in board["recent_failures"]]
    assert dates == sorted(dates, reverse=True)


def test_recent_failures_only_include_fails():
    _reset()
    fixture = _load_fixture()
    fail_ids = {e["id"] for e in fixture["inspection_events"] if e.get("result") == "fail"}
    board = list_inspection_rework(env_id=uuid4(), business_id=None)
    for f in board["recent_failures"]:
        assert f["id"] in fail_ids


def test_hrefs_include_env_id():
    _reset()
    env_id = uuid4()
    board = list_inspection_rework(env_id=env_id, business_id=None)
    for row in board["recent_failures"]:
        assert str(env_id) in (row.get("href") or "")


def test_totals_match_fixture():
    _reset()
    events = _load_fixture()["inspection_events"]
    board = list_inspection_rework(env_id=uuid4(), business_id=None)
    totals = board["totals"]
    assert totals["event_count"] == len(events)
    assert totals["fail_count"] == sum(1 for e in events if e.get("result") == "fail")
    assert totals["total_rework_cost_usd"] == sum(float(e.get("rework_cost_usd") or 0) for e in events)
