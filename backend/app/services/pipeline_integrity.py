"""Pipeline Integrity — the bridge between feasibility and delivery.

Surfaces three anomaly classes:
    1. Sites pushed into projects prematurely (feasibility < threshold but linked project exists).
    2. Projects active before ready (preconstruction readiness < threshold + active status).
    3. Assumption drift (handoff variance with $ impact beyond threshold).

Joins readiness + handoff_snapshots + sites + feasibility_assessments in-memory from
the same fixture _load_fixture() backs operator.py with.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.services.operator import _load_fixture

_FEASIBILITY_THRESHOLD = 0.55  # linked project below this is suspect
_READINESS_THRESHOLD = 0.70  # active project below this is premature
_DRIFT_IMPACT_THRESHOLD_USD = 90_000  # variance items must clear this to appear


def _site_index() -> dict[str, dict[str, Any]]:
    return {s["id"]: s for s in _load_fixture().get("sites", [])}


def _project_index() -> dict[str, dict[str, Any]]:
    return {p["id"]: p for p in _load_fixture().get("projects", [])}


def _assessment_by_site() -> dict[str, dict[str, Any]]:
    return {
        fa["site_id"]: fa
        for fa in _load_fixture().get("feasibility_assessments", [])
    }


def _project_href(env_id: UUID, project_id: str) -> str:
    return f"/lab/env/{env_id}/operator/projects/{project_id}"


def _site_href(env_id: UUID, site_id: str) -> str:
    return f"/lab/env/{env_id}/operator/site-risk/{site_id}"


def _premature_site_to_project_rows(*, env_id: UUID) -> list[dict[str, Any]]:
    sites = _site_index()
    projects = _project_index()
    assessments = _assessment_by_site()
    rows: list[dict[str, Any]] = []
    for site in sites.values():
        linked_project_id = site.get("linked_project_id")
        if not linked_project_id:
            continue
        feasibility_score = site.get("feasibility_score")
        if feasibility_score is None:
            continue
        if feasibility_score >= _FEASIBILITY_THRESHOLD:
            continue
        project = projects.get(linked_project_id) or {}
        assessment = assessments.get(site["id"]) or {}
        rows.append(
            {
                "anomaly_class": "premature_project",
                "site_id": site["id"],
                "site_name": site.get("name"),
                "project_id": linked_project_id,
                "project_name": project.get("name"),
                "feasibility_score": feasibility_score,
                "risk_level": site.get("risk_level"),
                "summary": assessment.get("summary")
                or "Linked project is below feasibility threshold.",
                "recommended_action": (assessment.get("recommended_actions") or [None])[0],
                "href": _site_href(env_id, site["id"]),
                "project_href": _project_href(env_id, linked_project_id),
            }
        )
    rows.sort(key=lambda r: (r.get("feasibility_score") or 0))
    return rows


def _projects_active_before_ready_rows(*, env_id: UUID) -> list[dict[str, Any]]:
    fixture = _load_fixture()
    projects = _project_index()
    readiness_list = fixture.get("preconstruction_readiness", [])
    rows: list[dict[str, Any]] = []
    for readiness in readiness_list:
        project = projects.get(readiness.get("project_id")) or {}
        status = str(project.get("status") or "").lower()
        is_active = status in {"at_risk", "watch", "in_progress", "active"}
        overall_pct = float(readiness.get("overall_pct") or 0)
        if not is_active:
            continue
        if overall_pct >= _READINESS_THRESHOLD:
            continue
        incomplete_gates = [
            g for g in readiness.get("gates", []) if g.get("status") == "incomplete"
        ]
        at_risk_gates = [
            g for g in readiness.get("gates", []) if g.get("status") == "at_risk"
        ]
        rows.append(
            {
                "anomaly_class": "active_before_ready",
                "project_id": readiness["project_id"],
                "project_name": project.get("name"),
                "entity_id": project.get("entity_id"),
                "overall_pct": overall_pct,
                "blocking_gate": readiness.get("blocking_gate"),
                "incomplete_gate_count": len(incomplete_gates),
                "at_risk_gate_count": len(at_risk_gates),
                "gates": [
                    {
                        "key": g.get("key"),
                        "label": g.get("label"),
                        "status": g.get("status"),
                        "blocker_reason": g.get("blocker_reason"),
                        "owner": g.get("owner"),
                        "next_action": g.get("next_action"),
                    }
                    for g in readiness.get("gates", [])
                ],
                "next_action": readiness.get("next_action"),
                "owner": readiness.get("owner"),
                "href": _project_href(env_id, readiness["project_id"]),
            }
        )
    rows.sort(key=lambda r: r.get("overall_pct") or 0)
    return rows


def _assumption_drift_rows(*, env_id: UUID) -> list[dict[str, Any]]:
    fixture = _load_fixture()
    projects = _project_index()
    sites = _site_index()
    rows: list[dict[str, Any]] = []
    for snapshot in fixture.get("handoff_snapshots", []):
        project = projects.get(snapshot.get("project_id")) or {}
        site = sites.get(snapshot.get("site_id")) or {}
        variances = [
            v
            for v in snapshot.get("variance_items", [])
            if float((v.get("impact") or {}).get("estimated_cost_usd") or 0)
            >= _DRIFT_IMPACT_THRESHOLD_USD
        ]
        if not variances:
            continue
        variances.sort(
            key=lambda v: -float((v.get("impact") or {}).get("estimated_cost_usd") or 0)
        )
        top = variances[0]
        total_impact = sum(
            float((v.get("impact") or {}).get("estimated_cost_usd") or 0)
            for v in variances
        )
        rows.append(
            {
                "anomaly_class": "assumption_drift",
                "project_id": snapshot.get("project_id"),
                "project_name": project.get("name"),
                "site_id": snapshot.get("site_id"),
                "site_name": site.get("name"),
                "captured_at_pursuit": snapshot.get("captured_at_pursuit"),
                "top_variance_label": top.get("label"),
                "top_variance_note": top.get("note"),
                "top_variance_impact": top.get("impact"),
                "variance_count": len(variances),
                "total_impact_usd": total_impact,
                "variance_items": [
                    {
                        "key": v.get("key"),
                        "label": v.get("label"),
                        "pursuit": v.get("pursuit"),
                        "current": v.get("current"),
                        "diff": v.get("diff"),
                        "severity": v.get("severity"),
                        "note": v.get("note"),
                        "impact": v.get("impact"),
                    }
                    for v in variances
                ],
                "href": _project_href(env_id, snapshot.get("project_id")),
            }
        )
    rows.sort(key=lambda r: -float(r.get("total_impact_usd") or 0))
    return rows


def list_pipeline_integrity(
    *, env_id: UUID, business_id: UUID | None = None
) -> dict[str, Any]:
    _ = business_id
    premature = _premature_site_to_project_rows(env_id=env_id)
    active_before_ready = _projects_active_before_ready_rows(env_id=env_id)
    drift = _assumption_drift_rows(env_id=env_id)
    total_impact = sum(float(r.get("total_impact_usd") or 0) for r in drift)
    return {
        "premature_projects": premature,
        "active_before_ready": active_before_ready,
        "assumption_drift": drift,
        "totals": {
            "premature_count": len(premature),
            "active_before_ready_count": len(active_before_ready),
            "drift_count": len(drift),
            "total_drift_impact_usd": total_impact,
        },
    }
