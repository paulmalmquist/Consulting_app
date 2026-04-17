"""Pipeline Integrity anomaly class tests."""

from __future__ import annotations

from uuid import UUID

from app.services import pipeline_integrity as svc
from app.services.operator import _load_fixture


ENV_ID = UUID("11111111-1111-4111-8111-111111111111")


def _reset_cache() -> None:
    _load_fixture.cache_clear()


def test_pipeline_integrity_returns_all_three_anomaly_classes():
    _reset_cache()
    result = svc.list_pipeline_integrity(env_id=ENV_ID)
    assert "premature_projects" in result
    assert "active_before_ready" in result
    assert "assumption_drift" in result
    assert "totals" in result


def test_active_before_ready_surfaces_site_a_gate_blockers():
    _reset_cache()
    result = svc.list_pipeline_integrity(env_id=ENV_ID)
    rows = result["active_before_ready"]
    assert any(r["project_id"] == "new-development-site-a" for r in rows), (
        "Site A is 58% ready and at_risk; must surface as active-before-ready"
    )
    site_a = next(r for r in rows if r["project_id"] == "new-development-site-a")
    assert site_a["overall_pct"] < 0.7
    # Must enumerate incomplete/at-risk gates with blocker reasons
    incomplete = [g for g in site_a["gates"] if g["status"] == "incomplete"]
    assert incomplete, "Site A should have at least one incomplete gate"
    for gate in incomplete:
        assert gate.get("blocker_reason"), "incomplete gates must carry blocker_reason"


def test_active_before_ready_excludes_on_track_projects():
    _reset_cache()
    result = svc.list_pipeline_integrity(env_id=ENV_ID)
    rows = result["active_before_ready"]
    # Office retrofit program is on_track + 96% ready — must NOT appear
    assert all(r["project_id"] != "office-retrofit-program" for r in rows)


def test_assumption_drift_carries_impact_and_sorts_by_total():
    _reset_cache()
    result = svc.list_pipeline_integrity(env_id=ENV_ID)
    drift = result["assumption_drift"]
    assert drift, "Fixture must include at least one drift snapshot"
    # Sorted by total_impact_usd desc
    totals = [r["total_impact_usd"] for r in drift]
    assert totals == sorted(totals, reverse=True)
    for row in drift:
        for v in row["variance_items"]:
            assert v.get("impact") is not None
            assert v["impact"]["confidence"] in {"high", "medium", "low"}


def test_assumption_drift_variance_items_have_if_ignored_for_high_severity():
    _reset_cache()
    result = svc.list_pipeline_integrity(env_id=ENV_ID)
    drift = result["assumption_drift"]
    for row in drift:
        for v in row["variance_items"]:
            if v.get("severity") in {"high", "medium"}:
                assert (v.get("impact") or {}).get("if_ignored", {}).get(
                    "in_30_days"
                ) is not None, (
                    f"{row['project_id']}:{v['key']} must model 30-day consequence"
                )


def test_totals_match_list_lengths():
    _reset_cache()
    result = svc.list_pipeline_integrity(env_id=ENV_ID)
    totals = result["totals"]
    assert totals["premature_count"] == len(result["premature_projects"])
    assert totals["active_before_ready_count"] == len(result["active_before_ready"])
    assert totals["drift_count"] == len(result["assumption_drift"])
    recalculated = sum(
        float(r["total_impact_usd"]) for r in result["assumption_drift"]
    )
    assert totals["total_drift_impact_usd"] == recalculated


def test_hrefs_include_env_id_for_every_row():
    _reset_cache()
    result = svc.list_pipeline_integrity(env_id=ENV_ID)
    for row in result["premature_projects"]:
        assert str(ENV_ID) in (row.get("href") or "")
        assert str(ENV_ID) in (row.get("project_href") or "")
    for row in result["active_before_ready"]:
        assert str(ENV_ID) in (row.get("href") or "")
    for row in result["assumption_drift"]:
        assert str(ENV_ID) in (row.get("href") or "")
