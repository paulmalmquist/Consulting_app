from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

from app.services.workspace_templates import resolve_workspace_template_key


_TASK_STATUS_ORDER = {
    "blocked": 0,
    "late": 1,
    "in_progress": 2,
    "pending": 3,
    "completed": 4,
}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


@lru_cache(maxsize=1)
def _load_fixture() -> dict[str, Any]:
    path = _repo_root() / "fixtures" / "winston_demo" / "hall_boys_operator_seed.json"
    return json.loads(path.read_text())


def _default_period() -> str:
    fixture = _load_fixture()
    return str(fixture["environment"]["default_period"])


def _period_order() -> list[str]:
    fixture = _load_fixture()
    periods = {
        item["period"]
        for entity in fixture["entities"]
        for item in entity.get("financials", [])
    }
    return sorted(periods)


def _previous_period(period: str) -> str | None:
    periods = _period_order()
    try:
        idx = periods.index(period)
    except ValueError:
        return None
    if idx == 0:
        return None
    return periods[idx - 1]


def _margin_pct(revenue: float | int | None, expenses: float | int | None) -> float:
    revenue_value = float(revenue or 0)
    expense_value = float(expenses or 0)
    if revenue_value <= 0:
        return 0.0
    return round(((revenue_value - expense_value) / revenue_value) * 100, 1)


def _entity_map() -> dict[str, dict[str, Any]]:
    fixture = _load_fixture()
    entities = {entity["id"]: entity for entity in fixture["entities"]}
    entities[fixture["business"]["id"]] = fixture["business"]
    return entities


def _project_map() -> dict[str, dict[str, Any]]:
    fixture = _load_fixture()
    return {project["id"]: project for project in fixture["projects"]}


def _vendor_map() -> dict[str, dict[str, Any]]:
    fixture = _load_fixture()
    return {vendor["id"]: vendor for vendor in fixture["vendors"]}


def _site_map() -> dict[str, dict[str, Any]]:
    fixture = _load_fixture()
    return {site["id"]: site for site in fixture.get("development_sites", [])}


def _document_map() -> dict[str, dict[str, Any]]:
    fixture = _load_fixture()
    return {document["id"]: document for document in fixture["documents"]}


def _task_map() -> dict[str, dict[str, Any]]:
    fixture = _load_fixture()
    return {task["id"]: task for task in fixture["close_tasks"]}


def _entity_financial(entity: dict[str, Any], period: str) -> dict[str, Any]:
    for row in entity.get("financials", []):
        if row["period"] == period:
            return row
    raise LookupError(f"Missing financial snapshot for {entity.get('id')} in {period}")


def _build_entity_rows(*, period: str, env_id: UUID) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    previous_period = _previous_period(period)
    fixture = _load_fixture()
    for entity in fixture["entities"]:
        current = _entity_financial(entity, period)
        prior = _entity_financial(entity, previous_period) if previous_period else None
        margin_pct = _margin_pct(current.get("revenue"), current.get("expenses"))
        prior_margin_pct = _margin_pct(prior.get("revenue"), prior.get("expenses")) if prior else None
        margin_delta = round(margin_pct - prior_margin_pct, 1) if prior_margin_pct is not None else None
        revenue_variance = float(current.get("revenue", 0)) - float(current.get("plan_revenue", 0))
        if margin_delta is None or abs(margin_delta) < 0.4:
            trend = "flat"
        elif margin_delta > 0:
            trend = "up"
        else:
            trend = "down"
        if margin_pct < 7:
            status = "critical"
        elif margin_pct < 15:
            status = "watch"
        else:
            status = "healthy"
        if entity["id"] == "hb-logistics":
            flag = "Margin below 5% and still falling."
        elif entity["id"] == "hb-development":
            flag = "Overrun on Site A is eroding development margin."
        elif entity["id"] == "hb-construction":
            flag = "Airport Expansion is absorbing margin."
        elif entity["id"] == "hb-facilities":
            flag = "Retrofit program is carrying the strongest margin."
        else:
            flag = "Shared-services margin is stable, but close is still manual."
        rows.append(
            {
                "entity_id": entity["id"],
                "entity_name": entity["name"],
                "industry": entity.get("industry"),
                "revenue": current.get("revenue", 0),
                "expenses": current.get("expenses", 0),
                "margin_pct": margin_pct,
                "prior_margin_pct": prior_margin_pct,
                "margin_delta_pct": margin_delta,
                "cash": current.get("cash", 0),
                "plan_revenue": current.get("plan_revenue"),
                "revenue_variance": revenue_variance,
                "trend": trend,
                "status": status,
                "flag": flag,
                "top_driver": entity.get("focus"),
                "href": f"/lab/env/{env_id}/operator/finance#entity-performance",
            }
        )
    return rows


def _document_summary(document: dict[str, Any]) -> dict[str, Any]:
    entities = _entity_map()
    projects = _project_map()
    vendors = _vendor_map()
    entity = entities.get(document["entity_id"], {})
    project = projects.get(document.get("project_id") or "", {})
    vendor = vendors.get(document.get("vendor_id") or "", {})
    return {
        "document_id": document["id"],
        "title": document["title"],
        "type": document["type"],
        "entity_id": document["entity_id"],
        "entity_name": entity.get("name", document["entity_id"]),
        "project_id": document.get("project_id"),
        "project_name": project.get("name"),
        "vendor_id": document.get("vendor_id"),
        "vendor_name": vendor.get("name"),
        "status": document["status"],
        "created_at": document["created_at"],
        "risk_flags": document.get("risk_flags", []),
        "key_terms": document.get("key_terms", []),
        "extracted_json": document.get("extracted_json", {}),
    }


def _close_task_row(task: dict[str, Any], *, env_id: UUID) -> dict[str, Any]:
    entities = _entity_map()
    projects = _project_map()
    entity = entities.get(task["entity_id"], {})
    project = projects.get(task.get("project_id") or "", {})
    href = f"/lab/env/{env_id}/operator/close"
    if task.get("project_id"):
        href = f"/lab/env/{env_id}/operator/projects/{task['project_id']}"
    return {
        "task_id": task["id"],
        "title": task["title"],
        "type": task["type"],
        "entity_id": task["entity_id"],
        "entity_name": entity.get("name", task["entity_id"]),
        "project_id": task.get("project_id"),
        "project_name": project.get("name"),
        "status": task["status"],
        "owner": task["owner"],
        "due_date": task.get("due_date"),
        "blocker_reason": task.get("blocker_reason"),
        "late_flag": task["status"] == "late",
        "priority": task.get("priority"),
        "href": href,
    }


def _build_close_rows(*, env_id: UUID) -> list[dict[str, Any]]:
    fixture = _load_fixture()
    rows = [_close_task_row(task, env_id=env_id) for task in fixture["close_tasks"]]
    return sorted(
        rows,
        key=lambda row: (
            _TASK_STATUS_ORDER.get(str(row["status"]), 99),
            row.get("due_date") or "",
            row["title"],
        ),
    )


def _project_row(project: dict[str, Any], *, env_id: UUID) -> dict[str, Any]:
    entities = _entity_map()
    entity = entities.get(project["entity_id"], {})
    return {
        "project_id": project["id"],
        "entity_id": project["entity_id"],
        "entity_name": entity.get("name", project["entity_id"]),
        "name": project["name"],
        "status": project["status"],
        "owner": project.get("owner"),
        "start_date": project.get("start_date"),
        "end_date": project.get("end_date"),
        "budget": project.get("budget", 0),
        "actual_cost": project.get("actual_cost", 0),
        "variance": float(project.get("budget", 0)) - float(project.get("actual_cost", 0)),
        "revenue": project.get("revenue"),
        "margin_pct": project.get("margin_pct"),
        "risk_score": project.get("risk_score", 0),
        "risk_level": project.get("risk_level", "low"),
        "summary": project.get("summary"),
        "blockers": project.get("blockers", []),
        "primary_vendor": project.get("primary_vendor"),
        "href": f"/lab/env/{env_id}/operator/projects/{project['id']}",
    }


def _build_project_rows(*, env_id: UUID) -> list[dict[str, Any]]:
    fixture = _load_fixture()
    rows = [_project_row(project, env_id=env_id) for project in fixture["projects"]]
    return sorted(rows, key=lambda row: (-float(row["risk_score"]), row["name"]))


def _vendor_row(vendor: dict[str, Any]) -> dict[str, Any]:
    contract_value = float(vendor.get("contract_value") or 0)
    spend_ytd = float(vendor.get("spend_ytd") or 0)
    overspend = max(0.0, spend_ytd - contract_value) if contract_value else None
    return {
        "vendor_id": vendor["id"],
        "name": vendor["name"],
        "category": vendor["category"],
        "entity_count": len(vendor.get("entities", [])),
        "entities": vendor.get("entities", []),
        "spend_ytd": spend_ytd,
        "contract_value": contract_value or None,
        "overspend_amount": overspend,
        "duplication_flag": len(vendor.get("entities", [])) > 1,
        "risk_flag": vendor.get("risk_flag"),
        "notes": vendor.get("notes"),
        "spend_by_entity": vendor.get("spend_by_entity", []),
        "linked_projects": vendor.get("linked_projects", []),
    }


def _build_vendor_rows() -> list[dict[str, Any]]:
    fixture = _load_fixture()
    rows = [_vendor_row(vendor) for vendor in fixture["vendors"]]
    return sorted(
        rows,
        key=lambda row: (
            0 if row["duplication_flag"] else 1,
            -(row["overspend_amount"] or 0),
            -row["spend_ytd"],
        ),
    )


def get_context(
    *,
    env_id: UUID,
    business_id: UUID,
    created: bool,
    source: str,
    diagnostics: dict[str, Any] | None = None,
    environment: dict[str, Any] | None = None,
) -> dict[str, Any]:
    template_key = resolve_workspace_template_key(
        workspace_template_key=(environment or {}).get("workspace_template_key"),
        industry_type=(environment or {}).get("industry_type"),
        industry=(environment or {}).get("industry"),
    ) or str(_load_fixture()["environment"]["template_key"])
    return {
        "env_id": str(env_id),
        "business_id": business_id,
        "workspace_template_key": template_key,
        "created": created,
        "source": source,
        "diagnostics": diagnostics or {},
    }


def get_command_center(*, env_id: UUID, business_id: UUID) -> dict[str, Any]:
    fixture = _load_fixture()
    period = _default_period()
    previous_period = _previous_period(period) or period
    entity_rows = _build_entity_rows(period=period, env_id=env_id)
    prior_entity_rows = _build_entity_rows(period=previous_period, env_id=env_id)
    consolidated_revenue = sum(float(row["revenue"]) for row in entity_rows)
    consolidated_expenses = sum(float(row["expenses"]) for row in entity_rows)
    prior_revenue = sum(float(row["revenue"]) for row in prior_entity_rows)
    prior_expenses = sum(float(row["expenses"]) for row in prior_entity_rows)
    consolidated_margin = _margin_pct(consolidated_revenue, consolidated_expenses)
    prior_margin = _margin_pct(prior_revenue, prior_expenses)
    cash_total = sum(float(row["cash"]) for row in entity_rows)
    at_risk_projects = [row for row in _build_project_rows(env_id=env_id) if row["risk_level"] == "high"]
    close_rows = _build_close_rows(env_id=env_id)
    vendor_rows = _build_vendor_rows()
    site_rows = _build_site_rows(env_id=env_id)
    ai_grounding = fixture.get("ai_grounding", {})
    return {
        "env_id": str(env_id),
        "business_id": business_id,
        "workspace_template_key": str(fixture["environment"]["template_key"]),
        "business_name": str(fixture["business"]["name"]),
        "period": period,
        "metrics_strip": [
            {
                "key": "revenue",
                "label": "Revenue",
                "value": consolidated_revenue,
                "comparison_label": "Vs Feb",
                "comparison_value": prior_revenue,
                "delta_value": consolidated_revenue - prior_revenue,
                "tone": "positive",
                "unit": "usd",
                "trend_direction": "up" if consolidated_revenue > prior_revenue else "flat",
                "driver_text": "Facilities growth offset logistics softness.",
            },
            {
                "key": "margin",
                "label": "Weighted Margin",
                "value": consolidated_margin,
                "comparison_label": "Vs Feb",
                "comparison_value": prior_margin,
                "delta_value": round(consolidated_margin - prior_margin, 1),
                "tone": "warning" if consolidated_margin < prior_margin else "positive",
                "unit": "pct",
                "trend_direction": "down" if consolidated_margin < prior_margin else "up",
                "driver_text": "Construction and Development overruns pulled margin down.",
            },
            {
                "key": "cash",
                "label": "Cash",
                "value": cash_total,
                "comparison_label": "Operating cash",
                "comparison_value": None,
                "delta_value": None,
                "tone": "neutral",
                "unit": "usd",
                "trend_direction": "flat",
                "driver_text": "Cash is still healthy, but close blockers are delaying visibility.",
            },
            {
                "key": "risk_projects",
                "label": "At-Risk Projects",
                "value": len(at_risk_projects),
                "comparison_label": "High risk",
                "comparison_value": len(at_risk_projects),
                "delta_value": None,
                "tone": "danger",
                "unit": "count",
                "trend_direction": "flat",
                "driver_text": "Airport Expansion and New Development Site A need action now.",
            },
        ],
        "entity_performance": entity_rows,
        "at_risk_projects": at_risk_projects,
        "close_tasks": close_rows,
        "top_documents": [_document_summary(document) for document in fixture["documents"]],
        "vendor_alerts": [row for row in vendor_rows if row["duplication_flag"] or (row["overspend_amount"] or 0) > 0],
        "development_sites": [row for row in site_rows if row["risk_level"] in ("high", "medium")],
        "assistant_focus": {
            "headline": "Control the overrun, unblock close, then consolidate duplicated vendor spend.",
            "summary_lines": ai_grounding.get("what_is_going_wrong", []),
            "priorities": ai_grounding.get("what_to_focus_on", []),
            "money_leakage": ai_grounding.get("where_money_is_lost", []),
            "close_blockers": [
                row["blocker_reason"]
                for row in close_rows
                if row["status"] in {"blocked", "late"} and row.get("blocker_reason")
            ],
            "prompt_suggestions": [
                "What’s going wrong this month?",
                "Where are we losing money?",
                "Which projects are at risk?",
                "Should we pursue the Main St site?",
                "What approvals are slowing us down?",
                "What should I focus on today?",
            ],
        },
        "demo_script": fixture.get("demo_script", []),
        "improvements": fixture.get("improvements", []),
    }


def list_projects(*, env_id: UUID, business_id: UUID) -> list[dict[str, Any]]:
    _ = business_id
    return _build_project_rows(env_id=env_id)


def get_project_detail(*, env_id: UUID, business_id: UUID, project_id: str) -> dict[str, Any]:
    _ = business_id
    projects = _project_map()
    documents = _document_map()
    tasks = _task_map()
    project = projects.get(project_id)
    if not project:
        raise LookupError("Project not found")
    row = _project_row(project, env_id=env_id)
    row.update(
        {
            "budget_vs_actual": project.get("budget_by_month", []),
            "timeline": project.get("timeline", []),
            "documents": [
                _document_summary(documents[document_id])
                for document_id in project.get("document_ids", [])
                if document_id in documents
            ],
            "tasks": [
                _close_task_row(tasks[task_id], env_id=env_id)
                for task_id in project.get("task_ids", [])
                if task_id in tasks
            ],
            "vendor_breakdown": project.get("vendor_breakdown", []),
            "root_causes": project.get("root_causes", []),
            "recommended_actions": project.get("recommended_actions", []),
        }
    )
    return row


def list_vendors(*, env_id: UUID, business_id: UUID) -> list[dict[str, Any]]:
    _ = env_id, business_id
    return _build_vendor_rows()


def list_close_tasks(*, env_id: UUID, business_id: UUID) -> list[dict[str, Any]]:
    _ = business_id
    return _build_close_rows(env_id=env_id)


# ---------------------------------------------------------------------------
# Development Sites
# ---------------------------------------------------------------------------


def _site_row(site: dict[str, Any], *, env_id: UUID) -> dict[str, Any]:
    entities = _entity_map()
    entity = entities.get(site["entity_id"], {})
    return {
        "site_id": site["id"],
        "name": site["name"],
        "address": site.get("address"),
        "city": site.get("city"),
        "entity_id": site["entity_id"],
        "entity_name": entity.get("name", site["entity_id"]),
        "zoning_type": site.get("zoning_type"),
        "status": site.get("status", "scouting"),
        "predev_cost_to_date": float(site.get("predev_cost_to_date", 0)),
        "predev_budget": site.get("predev_budget"),
        "risk_score": float(site.get("risk_score", 0)),
        "risk_level": site.get("risk_level", "low"),
        "estimated_timeline_days": site.get("estimated_timeline_days"),
        "owner": site.get("owner"),
        "summary": site.get("summary"),
        "href": f"/lab/env/{env_id}/operator/pipeline/{site['id']}",
    }


def _build_site_rows(*, env_id: UUID) -> list[dict[str, Any]]:
    fixture = _load_fixture()
    rows = [_site_row(site, env_id=env_id) for site in fixture.get("development_sites", [])]
    return sorted(rows, key=lambda row: (-float(row["risk_score"]), row["name"]))


def list_sites(*, env_id: UUID, business_id: UUID) -> list[dict[str, Any]]:
    _ = business_id
    return _build_site_rows(env_id=env_id)


def get_site_detail(*, env_id: UUID, business_id: UUID, site_id: str) -> dict[str, Any]:
    _ = business_id
    sites = _site_map()
    documents = _document_map()
    projects = _project_map()
    site = sites.get(site_id)
    if not site:
        raise LookupError("Site not found")
    row = _site_row(site, env_id=env_id)
    linked_project = projects.get(site.get("linked_project_id") or "", {})
    row.update(
        {
            "allowed_uses": site.get("allowed_uses", []),
            "restrictions": site.get("restrictions", {}),
            "approvals_required": site.get("approvals_required", []),
            "blockers": site.get("blockers", []),
            "linked_project_id": site.get("linked_project_id"),
            "linked_project_name": linked_project.get("name"),
            "documents": [
                _document_summary(documents[doc_id])
                for doc_id in site.get("linked_document_ids", [])
                if doc_id in documents
            ],
            "recommended_actions": site.get("recommended_actions", []),
        }
    )
    return row
