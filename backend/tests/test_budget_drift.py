"""Tests for P2.6 — budget drift early-warning board."""

from __future__ import annotations

from uuid import uuid4

from app.services.operator import _load_fixture, list_budget_drift


def _reset():
    _load_fixture.cache_clear()


def test_fixture_has_budget_drift_per_project():
    _reset()
    drift = _load_fixture().get("budget_drift", [])
    project_ids = {p["id"] for p in _load_fixture()["projects"]}
    drift_project_ids = {r["project_id"] for r in drift}
    assert drift_project_ids.issubset(project_ids)
    assert len(drift) >= 3


def test_board_sorted_critical_first():
    _reset()
    board = list_budget_drift(env_id=uuid4(), business_id=None)
    severities = [r["drift_severity"] for r in board["rows"]]
    # critical should come before elevated, elevated before stable
    order_map = {"critical": 0, "elevated": 1, "stable": 2}
    scores = [order_map.get(s or "stable", 3) for s in severities]
    assert scores == sorted(scores)


def test_critical_rows_carry_impact_with_if_ignored():
    _reset()
    board = list_budget_drift(env_id=uuid4(), business_id=None)
    critical = [r for r in board["rows"] if r["drift_severity"] == "critical"]
    assert critical, "fixture should seed at least one critical drift row"
    for row in critical:
        assert row["impact"] is not None, f"{row['project_id']} critical but missing impact"
        assert row["impact"]["if_ignored"]["in_30_days"]["estimated_cost_usd"] > 0


def test_airport_expansion_is_top_critical():
    """Airport Expansion is the demo hero — must be the top drift row with accelerating trend."""
    _reset()
    board = list_budget_drift(env_id=uuid4(), business_id=None)
    top = board["rows"][0]
    assert top["project_id"] == "airport-expansion"
    assert top["drift_severity"] == "critical"
    assert top["current_drift_pct"] is not None and top["current_drift_pct"] >= 15
    # The last three trend points must be monotonically increasing (drift accelerating)
    tail = top["trend_points_pct"][-3:]
    assert tail == sorted(tail), f"Airport drift should be accelerating, got {tail}"


def test_totals_are_consistent():
    _reset()
    board = list_budget_drift(env_id=uuid4(), business_id=None)
    rows = board["rows"]
    totals = board["totals"]
    assert totals["project_count"] == len(rows)
    assert totals["critical_count"] == sum(1 for r in rows if r["drift_severity"] == "critical")
    assert totals["watchlist_count"] == sum(
        1 for r in rows if r["drift_severity"] in {"critical", "elevated"}
    )
    expected_overrun = sum((r.get("forecast_cost_overrun_usd") or 0) for r in rows)
    assert totals["total_forecast_overrun_usd"] == expected_overrun


def test_hrefs_include_env_id():
    _reset()
    env_id = uuid4()
    board = list_budget_drift(env_id=env_id, business_id=None)
    for row in board["rows"]:
        assert str(env_id) in (row.get("href") or "")
        assert "/operator/projects/" in (row.get("href") or "")


def test_every_row_links_to_real_project():
    _reset()
    project_ids = {p["id"] for p in _load_fixture()["projects"]}
    board = list_budget_drift(env_id=uuid4(), business_id=None)
    for row in board["rows"]:
        assert row["project_id"] in project_ids
        assert row["project_name"]


def test_critical_rows_include_next_threshold_context():
    """Critical rows should tell the operator what happens if drift hits next threshold."""
    _reset()
    board = list_budget_drift(env_id=uuid4(), business_id=None)
    critical = [r for r in board["rows"] if r["drift_severity"] == "critical"]
    for row in critical:
        assert row["days_to_next_threshold"] is not None
        assert row["next_threshold_label"]


def test_stable_rows_do_not_carry_impact():
    _reset()
    board = list_budget_drift(env_id=uuid4(), business_id=None)
    for row in board["rows"]:
        if row["drift_severity"] == "stable":
            assert row["impact"] is None, f"{row['project_id']} stable but has impact"
