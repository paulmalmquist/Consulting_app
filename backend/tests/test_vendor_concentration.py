"""Tests for P2.1 — vendor concentration + performance board."""

from __future__ import annotations

from uuid import uuid4

from app.services.operator import (
    _load_fixture,
    list_vendor_concentration,
)


def _reset():
    _load_fixture.cache_clear()


def test_fixture_has_vendor_performance():
    _reset()
    fixture = _load_fixture()
    assert "vendor_performance" in fixture
    assert len(fixture["vendor_performance"]) >= 3


def test_apex_is_flagged_at_42_percent():
    """The weekly narrative claims Apex is on 42% of active jobs — this must hold."""
    _reset()
    board = list_vendor_concentration(env_id=uuid4(), business_id=None)
    apex = next(v for v in board["vendors"] if v["vendor_id"] == "apex-electrical")
    assert apex["concentration_pct"] == 42.0
    assert apex["concentration_severity"] == "high"


def test_board_sorted_by_concentration_desc():
    _reset()
    board = list_vendor_concentration(env_id=uuid4(), business_id=None)
    percents = [v["concentration_pct"] or 0 for v in board["vendors"]]
    assert percents == sorted(percents, reverse=True)


def test_flagged_count_matches_high_severity_rows():
    _reset()
    board = list_vendor_concentration(env_id=uuid4(), business_id=None)
    high_rows = [v for v in board["vendors"] if v["concentration_severity"] == "high"]
    assert board["totals"]["flagged_count"] == len(high_rows)


def test_max_concentration_matches_top_row():
    _reset()
    board = list_vendor_concentration(env_id=uuid4(), business_id=None)
    top = board["vendors"][0]
    assert board["totals"]["max_concentration_pct"] == top["concentration_pct"]


def test_every_row_references_real_vendor():
    _reset()
    fixture = _load_fixture()
    vendor_ids = {v["id"] for v in fixture["vendors"]}
    board = list_vendor_concentration(env_id=uuid4(), business_id=None)
    for row in board["vendors"]:
        assert row["vendor_id"] in vendor_ids


def test_linked_projects_include_env_aware_hrefs():
    _reset()
    env_id = uuid4()
    board = list_vendor_concentration(env_id=env_id, business_id=None)
    apex = next(v for v in board["vendors"] if v["vendor_id"] == "apex-electrical")
    assert len(apex["linked_projects"]) >= 1
    for p in apex["linked_projects"]:
        assert str(env_id) in (p.get("href") or "")


def test_apex_impact_includes_if_ignored():
    """Apex is the concentration hero — must carry Decision Layer impact block."""
    _reset()
    board = list_vendor_concentration(env_id=uuid4(), business_id=None)
    apex = next(v for v in board["vendors"] if v["vendor_id"] == "apex-electrical")
    assert apex["impact"] is not None
    if_ignored = apex["impact"]["if_ignored"]["in_30_days"]
    assert if_ignored["estimated_cost_usd"] > 0
    assert if_ignored["estimated_delay_days"] > 0


def test_on_time_warn_flags_below_75_percent():
    _reset()
    board = list_vendor_concentration(env_id=uuid4(), business_id=None)
    for row in board["vendors"]:
        if row["on_time_rate"] is not None and row["on_time_rate"] < 0.75:
            assert row["on_time_warn"] is True
        else:
            assert row["on_time_warn"] is False
