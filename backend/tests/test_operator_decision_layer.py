"""Decision Layer invariants for the Hall Boys operator fixture.

Covers: fixture-missing resilience, action-queue impact + if_ignored coverage,
signal filter, connectivity (no isolated objects), and weekly-summary shape.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.services import operator as operator_svc
from app.services.operator import (
    OperatorFixtureMissing,
    _load_fixture,
    rank_and_trim_action_queue,
)


ALLOWED_CATEGORIES = {
    "permit",
    "ordinance",
    "vendor",
    "closeout",
    "budget",
    "feasibility",
    "inspection",
    "handoff",
}


def _reset_cache() -> None:
    _load_fixture.cache_clear()


def test_fixture_missing_raises_clean_domain_error(monkeypatch, tmp_path):
    _reset_cache()
    missing = tmp_path / "not_there.json"
    monkeypatch.setattr(operator_svc, "_FIXTURE_PATH", missing)
    _reset_cache()
    with pytest.raises(OperatorFixtureMissing) as exc:
        _load_fixture()
    assert "not available" in str(exc.value).lower()
    assert "/fixtures" not in str(exc.value)
    _reset_cache()


def test_action_queue_items_all_carry_impact_and_if_ignored():
    _reset_cache()
    fixture = _load_fixture()
    visible = fixture["_visible_action_queue"]
    assert visible, "action queue must have visible items"
    for item in visible:
        impact = item.get("impact")
        assert impact is not None, f"item {item['id']} missing impact"
        assert impact.get("confidence") in {"high", "medium", "low"}
        assert item["category"] in ALLOWED_CATEGORIES
        if item["priority"] in {"critical", "high"}:
            assert impact.get("if_ignored", {}).get("in_30_days") is not None, (
                f"critical/high item {item['id']} must model consequence of ignoring"
            )


def test_action_queue_covers_multiple_categories():
    _reset_cache()
    fixture = _load_fixture()
    categories = {item["category"] for item in fixture["_visible_action_queue"]}
    assert len(categories) >= 5, (
        f"expected a spread of categories (got {categories}); "
        "narrative requires multiple pillars represented"
    )


def test_rank_and_trim_sorts_by_impact_times_urgency():
    items: list[dict[str, Any]] = [
        {
            "id": "small",
            "priority": "medium",
            "impact": {"estimated_cost_usd": 10000, "time_to_failure_days": 30},
        },
        {
            "id": "huge_urgent",
            "priority": "critical",
            "impact": {"estimated_cost_usd": 500000, "time_to_failure_days": 5},
        },
        {
            "id": "no_impact",
            "priority": "critical",
        },
    ]
    visible, collapsed = rank_and_trim_action_queue(items)
    assert [i["id"] for i in visible] == ["huge_urgent", "small"]
    assert collapsed == 0


def test_rank_and_trim_respects_limit_and_reports_collapsed():
    items = [
        {
            "id": f"itm-{i}",
            "priority": "medium",
            "impact": {"estimated_cost_usd": i * 1000, "time_to_failure_days": 30},
        }
        for i in range(1, 13)
    ]
    visible, collapsed = rank_and_trim_action_queue(items, limit=8)
    assert len(visible) == 8
    assert collapsed == 4


def test_weekly_summary_shape_is_opinionated():
    _reset_cache()
    summary = _load_fixture()["weekly_summary"]
    assert summary["operating_posture"] in {"defensive", "stable", "aggressive"}
    assert summary["critical_path"]
    assert summary["headline"]
    assert len(summary["top_risks"]) >= 2
    for risk in summary["top_risks"]:
        assert risk["confidence"] in {"high", "medium", "low"}


def test_connectivity_sites_link_to_municipalities_and_rules():
    _reset_cache()
    fixture = _load_fixture()
    muni_ids = {m["id"] for m in fixture["municipalities"]}
    rule_ids = {r["id"] for r in fixture["ordinance_rules"]}
    for site in fixture["sites"]:
        assert site["municipality_id"] in muni_ids, (
            f"site {site['id']} points to missing municipality"
        )
        for rid in site.get("known_blocker_rule_ids", []):
            assert rid in rule_ids, (
                f"site {site['id']} references unknown ordinance rule {rid}"
            )


def test_rule_change_events_affect_known_sites_or_projects():
    _reset_cache()
    fixture = _load_fixture()
    site_ids = {s["id"] for s in fixture["sites"]}
    project_ids = {p["id"] for p in fixture["projects"]}
    assert fixture["rule_change_events"], "need at least one propagated event for the demo"
    for event in fixture["rule_change_events"]:
        affected = set(event.get("affected_site_ids", [])) | set(
            event.get("affected_project_ids", [])
        )
        assert affected, f"event {event['id']} has no downstream effect"
        for sid in event.get("affected_site_ids", []):
            assert sid in site_ids
        for pid in event.get("affected_project_ids", []):
            assert pid in project_ids


def test_billing_readiness_rows_reference_real_projects():
    _reset_cache()
    fixture = _load_fixture()
    project_ids = {p["id"] for p in fixture["projects"]}
    for row in fixture["billing_readiness"]:
        assert row["project_id"] in project_ids


def test_fixture_path_matches_deployed_location():
    """Shame check: fixture must live inside the backend package so Railway ships it."""
    path = Path(operator_svc._FIXTURE_PATH)
    assert "backend/app/fixtures" in str(path) or "app/fixtures" in str(path)
    assert path.exists(), f"fixture missing from deployable location: {path}"


def test_propagated_visible_queue_equals_fixture_limit():
    _reset_cache()
    fixture = _load_fixture()
    raw = fixture["_raw_action_queue"]
    visible = fixture["_visible_action_queue"]
    collapsed = fixture["_action_queue_collapsed_count"]
    assert len(visible) + collapsed == len(raw)
