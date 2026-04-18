from __future__ import annotations

from typing import Any
from uuid import UUID

from app.services.operator import _load_fixture


def _municipality_index() -> dict[str, dict[str, Any]]:
    return {m["id"]: m for m in _load_fixture().get("municipalities", [])}


def _site_index() -> dict[str, dict[str, Any]]:
    return {s["id"]: s for s in _load_fixture().get("sites", [])}


def _rule_index() -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in _load_fixture().get("ordinance_rules", [])}


def _assessment_by_site() -> dict[str, dict[str, Any]]:
    return {
        fa["site_id"]: fa
        for fa in _load_fixture().get("feasibility_assessments", [])
    }


def _project_index() -> dict[str, dict[str, Any]]:
    return {p["id"]: p for p in _load_fixture().get("projects", [])}


def _comparable_index() -> dict[str, dict[str, Any]]:
    return {c["id"]: c for c in _load_fixture().get("comparable_projects", [])}


def _scenario_by_site() -> dict[str, dict[str, Any]]:
    return {
        s["site_id"]: s
        for s in _load_fixture().get("development_scenarios", [])
    }


def _rule_change_event_index() -> dict[str, dict[str, Any]]:
    return {e["id"]: e for e in _load_fixture().get("rule_change_events", [])}


def _site_href(env_id: UUID, site_id: str) -> str:
    return f"/lab/env/{env_id}/operator/site-risk/{site_id}"


def _muni_href(env_id: UUID, muni_id: str) -> str:
    return f"/lab/env/{env_id}/operator/municipalities/{muni_id}"


def _row_for_site(site: dict[str, Any], env_id: UUID) -> dict[str, Any]:
    munis = _municipality_index()
    assessments = _assessment_by_site()
    muni = munis.get(site.get("municipality_id"), {})
    assessment = assessments.get(site["id"], {})
    return {
        "site_id": site["id"],
        "name": site.get("name"),
        "municipality_id": site.get("municipality_id"),
        "municipality_name": muni.get("name"),
        "state": muni.get("state"),
        "zoning": site.get("zoning"),
        "status": site.get("status"),
        "acreage": site.get("acreage"),
        "buildable_units_low": site.get("buildable_units_low"),
        "buildable_units_high": site.get("buildable_units_high"),
        "feasibility_score": site.get("feasibility_score"),
        "confidence": site.get("confidence"),
        "risk_level": site.get("risk_level"),
        "approval_timeline_days_low": site.get("approval_timeline_days_low"),
        "approval_timeline_days_high": site.get("approval_timeline_days_high"),
        "known_blocker_count": len(site.get("known_blocker_rule_ids") or []),
        "target_project_type": site.get("target_project_type"),
        "linked_project_id": site.get("linked_project_id"),
        "summary": assessment.get("summary"),
        "href": _site_href(env_id, site["id"]),
    }


def list_sites(*, env_id: UUID, business_id: UUID | None = None) -> list[dict[str, Any]]:
    _ = business_id
    sites = list(_load_fixture().get("sites", []))
    sites.sort(
        key=lambda s: (
            0 if s.get("risk_level") == "high_risk" else 1 if s.get("risk_level") == "borderline" else 2,
            -float(s.get("feasibility_score") or 0),
            s.get("name") or "",
        )
    )
    return [_row_for_site(site, env_id) for site in sites]


def _build_scenario_block(raw: dict[str, Any]) -> dict[str, Any]:
    """Hydrate a development_scenarios fixture entry into the API shape."""
    events = _rule_change_event_index()
    ordinance_impact = raw.get("active_ordinance_impact")
    enriched_impact = None
    if ordinance_impact and ordinance_impact.get("ordinance_event_id"):
        event = events.get(ordinance_impact["ordinance_event_id"], {})
        enriched_impact = {
            **ordinance_impact,
            "event_effective_date": event.get("effective_date"),
            "event_change_type": event.get("change_type"),
        }
    return {
        "site_id": raw["site_id"],
        "presets": raw.get("presets", []),
        "active_ordinance_impact": enriched_impact,
    }


def get_site_detail(*, env_id: UUID, business_id: UUID | None, site_id: str) -> dict[str, Any]:
    _ = business_id
    sites = _site_index()
    site = sites.get(site_id)
    if not site:
        raise LookupError(f"Site not found: {site_id}")

    rules = _rule_index()
    comparables = _comparable_index()
    projects = _project_index()
    munis = _municipality_index()
    assessment = _assessment_by_site().get(site_id, {})
    muni = munis.get(site.get("municipality_id"), {})

    linked_project = None
    if site.get("linked_project_id"):
        project = projects.get(site["linked_project_id"])
        if project:
            linked_project = {
                "project_id": project["id"],
                "name": project.get("name"),
                "status": project.get("status"),
                "risk_level": project.get("risk_level"),
                "href": f"/lab/env/{env_id}/operator/projects/{project['id']}",
            }

    constraints: list[dict[str, Any]] = []
    for item in assessment.get("constraints", []):
        rule = rules.get(item.get("rule_id"), {})
        constraints.append(
            {
                "rule_id": item.get("rule_id"),
                "rule_title": rule.get("title"),
                "rule_summary": rule.get("summary"),
                "severity": rule.get("severity"),
                "effective_date": rule.get("effective_date"),
                "impact": item.get("impact"),
                "note": item.get("note"),
                "confidence": item.get("confidence"),
            }
        )

    comparable_rows: list[dict[str, Any]] = []
    for cid in assessment.get("comparable_project_ids", []):
        comp = comparables.get(cid)
        if comp:
            comp_muni = munis.get(comp.get("municipality_id"), {})
            comparable_rows.append(
                {
                    "id": comp["id"],
                    "name": comp.get("name"),
                    "municipality_name": comp_muni.get("name"),
                    "outcome": comp.get("outcome"),
                    "cycle_days": comp.get("cycle_days"),
                    "matched_on": comp.get("matched_on", []),
                    "notes": comp.get("notes"),
                }
            )

    scenario_data = _scenario_by_site().get(site_id)
    development_scenarios = _build_scenario_block(scenario_data) if scenario_data else None

    return {
        "site_id": site["id"],
        "name": site.get("name"),
        "address": site.get("address"),
        "parcel_id": site.get("parcel_id"),
        "zoning": site.get("zoning"),
        "acreage": site.get("acreage"),
        "status": site.get("status"),
        "target_project_type": site.get("target_project_type"),
        "municipality_id": site.get("municipality_id"),
        "municipality_name": muni.get("name"),
        "municipality_friction_score": muni.get("overall_friction_score"),
        "municipality_href": _muni_href(env_id, site.get("municipality_id"))
        if site.get("municipality_id")
        else None,
        "buildable_units_low": site.get("buildable_units_low"),
        "buildable_units_high": site.get("buildable_units_high"),
        "height_limit_ft": site.get("height_limit_ft"),
        "density_cap_du_per_acre": site.get("density_cap_du_per_acre"),
        "feasibility_score": site.get("feasibility_score"),
        "confidence": site.get("confidence"),
        "risk_level": site.get("risk_level"),
        "approval_timeline_days_low": site.get("approval_timeline_days_low"),
        "approval_timeline_days_high": site.get("approval_timeline_days_high"),
        "linked_project": linked_project,
        "summary": assessment.get("summary"),
        "constraints": constraints,
        "comparable_projects": comparable_rows,
        "recommended_actions": assessment.get("recommended_actions", []),
        "risk_score": assessment.get("risk_score"),
        "development_scenarios": development_scenarios,
    }


def list_ordinance_changes(
    *, env_id: UUID, business_id: UUID | None = None, window_days: int | None = None
) -> list[dict[str, Any]]:
    _ = business_id, window_days
    fixture = _load_fixture()
    munis = _municipality_index()
    rules = _rule_index()
    sites = _site_index()
    projects = _project_index()

    rows: list[dict[str, Any]] = []
    events = list(fixture.get("rule_change_events", []))
    events.sort(key=lambda e: e.get("effective_date") or "", reverse=True)
    for event in events:
        muni = munis.get(event.get("municipality_id"), {})
        rule = rules.get(event.get("rule_id"), {})
        affected_sites = [
            {
                "site_id": s_id,
                "name": sites.get(s_id, {}).get("name", s_id),
                "risk_level": sites.get(s_id, {}).get("risk_level"),
                "href": _site_href(env_id, s_id),
            }
            for s_id in event.get("affected_site_ids", [])
        ]
        affected_projects = [
            {
                "project_id": p_id,
                "name": projects.get(p_id, {}).get("name", p_id),
                "risk_level": projects.get(p_id, {}).get("risk_level"),
                "href": f"/lab/env/{env_id}/operator/projects/{p_id}",
            }
            for p_id in event.get("affected_project_ids", [])
        ]
        rows.append(
            {
                "id": event["id"],
                "municipality_id": event.get("municipality_id"),
                "municipality_name": muni.get("name"),
                "rule_id": event.get("rule_id"),
                "rule_title": rule.get("title"),
                "change_type": event.get("change_type"),
                "effective_date": event.get("effective_date"),
                "summary": event.get("summary"),
                "severity": event.get("severity"),
                "confidence": event.get("confidence"),
                "impact": event.get("impact"),
                "affected_sites": affected_sites,
                "affected_projects": affected_projects,
                "municipality_href": _muni_href(env_id, event.get("municipality_id"))
                if event.get("municipality_id")
                else None,
            }
        )
    return rows


def list_municipalities(
    *, env_id: UUID, business_id: UUID | None = None
) -> list[dict[str, Any]]:
    _ = business_id
    fixture = _load_fixture()
    sites = fixture.get("sites", [])
    projects = fixture.get("projects", [])
    rows: list[dict[str, Any]] = []
    for muni in fixture.get("municipalities", []):
        muni_sites = [s for s in sites if s.get("municipality_id") == muni["id"]]
        muni_projects = []
        for project in projects:
            project_site = next(
                (s for s in muni_sites if s.get("linked_project_id") == project.get("id")),
                None,
            )
            if project_site is not None:
                muni_projects.append(project)
        rows.append(
            {
                "id": muni["id"],
                "name": muni.get("name"),
                "state": muni.get("state"),
                "median_approval_days": muni.get("median_approval_days"),
                "variance_required_rate": muni.get("variance_required_rate"),
                "inspection_fail_rate": muni.get("inspection_fail_rate"),
                "ordinance_volatility_score": muni.get("ordinance_volatility_score"),
                "comment_loop_frequency": muni.get("comment_loop_frequency"),
                "rework_rate": muni.get("rework_rate"),
                "overall_friction_score": muni.get("overall_friction_score"),
                "active_project_count": muni.get("active_project_count") or len(muni_projects),
                "active_site_count": muni.get("active_site_count") or len(muni_sites),
                "active_ordinance_count": muni.get("active_ordinance_count"),
                "recent_changes_30d": muni.get("recent_changes_30d"),
                "risk_level": muni.get("risk_level"),
                "confidence": muni.get("confidence"),
                "href": _muni_href(env_id, muni["id"]),
            }
        )
    rows.sort(key=lambda r: -float(r.get("overall_friction_score") or 0))
    return rows


def get_municipality_detail(
    *, env_id: UUID, business_id: UUID | None, municipality_id: str
) -> dict[str, Any]:
    _ = business_id
    fixture = _load_fixture()
    munis = _municipality_index()
    muni = munis.get(municipality_id)
    if not muni:
        raise LookupError(f"Municipality not found: {municipality_id}")
    sites = [
        {
            "site_id": s["id"],
            "name": s.get("name"),
            "risk_level": s.get("risk_level"),
            "status": s.get("status"),
            "feasibility_score": s.get("feasibility_score"),
            "href": _site_href(env_id, s["id"]),
        }
        for s in fixture.get("sites", [])
        if s.get("municipality_id") == municipality_id
    ]
    changes = [
        row
        for row in list_ordinance_changes(env_id=env_id, business_id=business_id)
        if row.get("municipality_id") == municipality_id
    ]
    projects_index = _project_index()
    linked_projects: list[dict[str, Any]] = []
    for site in fixture.get("sites", []):
        if site.get("municipality_id") != municipality_id:
            continue
        pid = site.get("linked_project_id")
        if not pid:
            continue
        project = projects_index.get(pid)
        if not project:
            continue
        linked_projects.append(
            {
                "project_id": pid,
                "name": project.get("name"),
                "status": project.get("status"),
                "risk_level": project.get("risk_level"),
                "href": f"/lab/env/{env_id}/operator/projects/{pid}",
            }
        )
    return {
        "id": muni["id"],
        "name": muni.get("name"),
        "state": muni.get("state"),
        "median_approval_days": muni.get("median_approval_days"),
        "variance_required_rate": muni.get("variance_required_rate"),
        "inspection_fail_rate": muni.get("inspection_fail_rate"),
        "ordinance_volatility_score": muni.get("ordinance_volatility_score"),
        "comment_loop_frequency": muni.get("comment_loop_frequency"),
        "rework_rate": muni.get("rework_rate"),
        "overall_friction_score": muni.get("overall_friction_score"),
        "active_project_count": muni.get("active_project_count"),
        "active_site_count": muni.get("active_site_count"),
        "active_ordinance_count": muni.get("active_ordinance_count"),
        "recent_changes_30d": muni.get("recent_changes_30d"),
        "risk_level": muni.get("risk_level"),
        "confidence": muni.get("confidence"),
        "sites": sites,
        "linked_projects": linked_projects,
        "recent_changes": changes,
    }
