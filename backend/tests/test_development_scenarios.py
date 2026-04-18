"""Tests for P1.4 — development_scenarios fixture + site_feasibility service."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.services import operator as operator_svc
from app.services.operator import _load_fixture
from app.services.site_feasibility import get_site_detail


def _reset():
    _load_fixture.cache_clear()


SITES_WITH_SCENARIOS = ["site-brickell-18", "site-wynwood-42", "site-austin-riverside", "site-airport-expansion"]
PRESET_IDS = {"conservative", "base", "aggressive"}


def test_fixture_has_development_scenarios():
    _reset()
    fixture = _load_fixture()
    assert "development_scenarios" in fixture
    assert len(fixture["development_scenarios"]) >= 4


def test_every_scenario_has_three_presets():
    _reset()
    for entry in _load_fixture()["development_scenarios"]:
        ids = {p["id"] for p in entry["presets"]}
        assert ids == PRESET_IDS, f"site {entry['site_id']} missing presets: {PRESET_IDS - ids}"


def test_every_preset_has_required_outputs():
    _reset()
    required = {"irr_pct", "profit_margin_pct", "timeline_days", "total_dev_cost_usd"}
    for entry in _load_fixture()["development_scenarios"]:
        for preset in entry["presets"]:
            outputs = set(preset["outputs"].keys())
            missing = required - outputs
            assert not missing, f"{entry['site_id']}/{preset['id']} missing outputs: {missing}"


def test_base_case_irr_beats_conservative():
    _reset()
    for entry in _load_fixture()["development_scenarios"]:
        base = next(p for p in entry["presets"] if p["id"] == "base")
        conservative = next(p for p in entry["presets"] if p["id"] == "conservative")
        assert base["outputs"]["irr_pct"] > conservative["outputs"]["irr_pct"], (
            f"{entry['site_id']}: base IRR should exceed conservative"
        )


def test_ordinance_impact_references_real_events():
    _reset()
    event_ids = {e["id"] for e in _load_fixture()["rule_change_events"]}
    for entry in _load_fixture()["development_scenarios"]:
        impact = entry.get("active_ordinance_impact")
        if impact:
            assert impact["ordinance_event_id"] in event_ids, (
                f"{entry['site_id']} ordinance impact references unknown event"
            )


def test_ordinance_delta_is_negative_irr():
    """Ordinance changes should reduce IRR (negative delta)."""
    _reset()
    for entry in _load_fixture()["development_scenarios"]:
        impact = entry.get("active_ordinance_impact")
        if impact and impact.get("delta_vs_base"):
            delta = impact["delta_vs_base"]
            if delta.get("irr_pct") is not None:
                assert delta["irr_pct"] < 0, (
                    f"{entry['site_id']}: ordinance IRR delta should be negative"
                )


def test_get_site_detail_includes_scenarios():
    _reset()
    env_id = uuid4()
    detail = get_site_detail(env_id=env_id, business_id=None, site_id="site-brickell-18")
    sc = detail["development_scenarios"]
    assert sc is not None
    assert len(sc["presets"]) == 3
    assert sc["active_ordinance_impact"] is not None
    assert sc["active_ordinance_impact"]["delta_vs_base"]["irr_pct"] < 0


def test_get_site_detail_enriches_ordinance_event_metadata():
    _reset()
    detail = get_site_detail(env_id=uuid4(), business_id=None, site_id="site-brickell-18")
    impact = detail["development_scenarios"]["active_ordinance_impact"]
    assert impact["event_effective_date"] is not None
    assert impact["event_change_type"] is not None


def test_site_without_ordinance_impact_has_none():
    _reset()
    detail = get_site_detail(env_id=uuid4(), business_id=None, site_id="site-airport-expansion")
    sc = detail["development_scenarios"]
    assert sc is not None
    assert sc["active_ordinance_impact"] is None


def test_site_without_scenarios_returns_none():
    _reset()
    detail = get_site_detail(env_id=uuid4(), business_id=None, site_id="site-dallas-bishop-arts")
    assert detail["development_scenarios"] is None
