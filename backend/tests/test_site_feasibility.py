"""Site Feasibility + Ordinance Intelligence service tests."""

from __future__ import annotations

from uuid import UUID

from app.services import site_feasibility as svc
from app.services.operator import _load_fixture


ENV_ID = UUID("11111111-1111-4111-8111-111111111111")


def _reset_cache() -> None:
    _load_fixture.cache_clear()


def test_list_sites_returns_rows_sorted_by_risk():
    _reset_cache()
    rows = svc.list_sites(env_id=ENV_ID)
    assert len(rows) == 6
    risk_order = [r["risk_level"] for r in rows]
    # high_risk and borderline should be ahead of clean
    first_clean = next((i for i, r in enumerate(risk_order) if r == "clean"), None)
    last_risk = max(
        (i for i, r in enumerate(risk_order) if r in {"high_risk", "borderline"}),
        default=-1,
    )
    assert first_clean is None or last_risk < first_clean


def test_site_detail_joins_rules_and_comparables():
    _reset_cache()
    detail = svc.get_site_detail(
        env_id=ENV_ID, business_id=None, site_id="site-brickell-18"
    )
    assert detail["name"] == "Brickell 18th Street Parcel"
    assert detail["municipality_name"] == "Miami-Dade County"
    # constraints resolve to real ordinance rules with titles
    assert detail["constraints"]
    for constraint in detail["constraints"]:
        assert constraint["rule_title"]
        assert constraint["severity"]
    # comparable projects resolve
    assert detail["comparable_projects"]
    for comp in detail["comparable_projects"]:
        assert comp["municipality_name"]


def test_ordinance_changes_populate_affected_rows_and_carry_impact():
    _reset_cache()
    rows = svc.list_ordinance_changes(env_id=ENV_ID)
    assert rows
    for row in rows:
        assert row["municipality_name"]
        assert row["rule_title"]
        # at least one downstream effect
        assert row["affected_sites"] or row["affected_projects"]
        assert row["impact"] is not None
        assert row["impact"]["confidence"] in {"high", "medium", "low"}


def test_municipality_list_sorted_by_friction():
    _reset_cache()
    rows = svc.list_municipalities(env_id=ENV_ID)
    scores = [r["overall_friction_score"] or 0 for r in rows]
    assert scores == sorted(scores, reverse=True)


def test_municipality_detail_includes_sites_and_recent_changes():
    _reset_cache()
    detail = svc.get_municipality_detail(
        env_id=ENV_ID, business_id=None, municipality_id="muni-miami-dade"
    )
    assert detail["name"] == "Miami-Dade County"
    assert detail["sites"], "Miami-Dade should surface at least one seeded site"
    assert detail["recent_changes"], "Miami-Dade should have propagated recent changes"
