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

_PRIORITY_WEIGHT = {"critical": 4.0, "high": 3.0, "medium": 2.0, "low": 1.0}
_ACTION_QUEUE_LIMIT = 8


_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent
    / "fixtures"
    / "winston_demo"
    / "hall_boys_operator_seed.json"
)


class OperatorFixtureMissing(RuntimeError):
    """Raised when the Hall Boys demo fixture is not deployed with the backend."""


def _impact_score(item: dict[str, Any]) -> float:
    priority = _PRIORITY_WEIGHT.get(str(item.get("priority", "medium")).lower(), 2.0)
    impact = item.get("impact") or {}
    cost = float(impact.get("estimated_cost_usd") or 0)
    ttf = impact.get("time_to_failure_days")
    ttf_weight = 1.0 / max(float(ttf), 1.0) if ttf is not None else 0.05
    return priority * max(cost, 1.0) * ttf_weight


def rank_and_trim_action_queue(
    items: list[dict[str, Any]], *, limit: int = _ACTION_QUEUE_LIMIT
) -> tuple[list[dict[str, Any]], int]:
    visible = [item for item in items if item.get("impact")]
    visible.sort(key=_impact_score, reverse=True)
    collapsed_count = max(0, len(visible) - limit)
    return visible[:limit], collapsed_count


def propagate_all(raw: dict[str, Any]) -> dict[str, Any]:
    state = dict(raw)
    items = list(state.get("action_queue", []))
    visible, collapsed = rank_and_trim_action_queue(items)
    state["_visible_action_queue"] = visible
    state["_action_queue_collapsed_count"] = collapsed
    state["_raw_action_queue"] = items
    return state


@lru_cache(maxsize=1)
def _load_fixture() -> dict[str, Any]:
    try:
        raw = json.loads(_FIXTURE_PATH.read_text())
    except FileNotFoundError as exc:
        raise OperatorFixtureMissing(
            "Hall Boys operator demo data is not available in this environment."
        ) from exc
    return propagate_all(raw)


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


def _rewrite_href(href: str | None, env_id: UUID) -> str | None:
    if not href:
        return href
    return href.replace("{env_id}", str(env_id))


def _prepare_action_queue(env_id: UUID) -> tuple[list[dict[str, Any]], int]:
    fixture = _load_fixture()
    items = list(fixture.get("_visible_action_queue", []))
    rewritten: list[dict[str, Any]] = []
    for item in items:
        copy = dict(item)
        copy["href"] = _rewrite_href(item.get("href"), env_id)
        rewritten.append(copy)
    return rewritten, int(fixture.get("_action_queue_collapsed_count", 0))


def _prepare_weekly_summary() -> dict[str, Any] | None:
    fixture = _load_fixture()
    summary = fixture.get("weekly_summary")
    if not summary:
        return None
    return dict(summary)


def _prepare_site_ordinance_strip(env_id: UUID) -> dict[str, Any]:
    fixture = _load_fixture()
    muni_index = {m["id"]: m for m in fixture.get("municipalities", [])}
    site_index = {s["id"]: s for s in fixture.get("sites", [])}

    changes = list(fixture.get("rule_change_events", []))
    changes.sort(key=lambda e: e.get("effective_date", ""), reverse=True)
    top_changes: list[dict[str, Any]] = []
    for event in changes[:3]:
        muni = muni_index.get(event.get("municipality_id"), {})
        top_changes.append(
            {
                "id": event["id"],
                "summary": event.get("summary"),
                "severity": event.get("severity"),
                "municipality_id": event.get("municipality_id"),
                "municipality_name": muni.get("name"),
                "effective_date": event.get("effective_date"),
                "impact": event.get("impact"),
                "affected_site_count": len(event.get("affected_site_ids") or []),
                "affected_project_count": len(event.get("affected_project_ids") or []),
                "href": f"/lab/env/{env_id}/operator/site-risk",
            }
        )

    sites = list(fixture.get("sites", []))
    sites.sort(
        key=lambda s: (
            0 if s.get("risk_level") == "high_risk" else 1 if s.get("risk_level") == "borderline" else 2,
            -float(s.get("feasibility_score") or 0),
        )
    )
    top_sites: list[dict[str, Any]] = []
    for site in sites[:3]:
        muni = muni_index.get(site.get("municipality_id"), {})
        top_sites.append(
            {
                "id": site["id"],
                "name": site.get("name"),
                "municipality_name": muni.get("name"),
                "risk_level": site.get("risk_level"),
                "feasibility_score": site.get("feasibility_score"),
                "confidence": site.get("confidence"),
                "buildable_units_low": site.get("buildable_units_low"),
                "buildable_units_high": site.get("buildable_units_high"),
                "href": f"/lab/env/{env_id}/operator/site-risk/{site['id']}",
            }
        )

    munis = sorted(
        fixture.get("municipalities", []),
        key=lambda m: -(m.get("overall_friction_score") or 0),
    )
    top_munis: list[dict[str, Any]] = []
    for muni in munis[:3]:
        top_munis.append(
            {
                "id": muni["id"],
                "name": muni.get("name"),
                "state": muni.get("state"),
                "friction_score": muni.get("overall_friction_score"),
                "median_approval_days": muni.get("median_approval_days"),
                "active_project_count": muni.get("active_project_count"),
                "recent_changes_30d": muni.get("recent_changes_30d"),
                "href": f"/lab/env/{env_id}/operator/municipalities/{muni['id']}",
            }
        )

    _ = site_index  # kept for future inline expansion
    return {
        "ordinance_changes": top_changes,
        "sites": top_sites,
        "municipalities": top_munis,
    }


def _cash_at_risk_totals() -> dict[str, Any]:
    fixture = _load_fixture()
    packages = fixture.get("billing_readiness") or []
    total = sum(float(row.get("amount_at_risk") or 0) for row in packages)
    project_ids = {row.get("project_id") for row in packages if row.get("amount_at_risk")}
    return {
        "total_amount_usd": total,
        "project_count": len(project_ids),
        "rows": [dict(row) for row in packages],
    }


def _permit_row(pkg: dict[str, Any], *, env_id: UUID) -> dict[str, Any]:
    fixture = _load_fixture()
    projects = _project_map()
    entities = _entity_map()
    munis = {m["id"]: m for m in fixture.get("municipalities", [])}
    project = projects.get(pkg.get("project_id") or "") or {}
    entity = entities.get(project.get("entity_id") or "") or {}
    muni = munis.get(pkg.get("municipality_id") or "") or {}

    days_in_stage = int(pkg.get("days_in_stage") or 0)
    median = int(pkg.get("median_stage_days") or 0)
    over_median = max(0, days_in_stage - median) if median else 0
    over_median_pct = (
        round((days_in_stage / median - 1.0) * 100)
        if median and days_in_stage > median
        else 0
    )

    stage_order = fixture.get("_permit_stage_order", [])
    stage_index = (
        stage_order.index(pkg.get("current_stage"))
        if pkg.get("current_stage") in stage_order
        else -1
    )

    return {
        "permit_id": pkg.get("permit_id"),
        "project_id": pkg.get("project_id"),
        "project_name": project.get("name"),
        "entity_id": project.get("entity_id"),
        "entity_name": entity.get("name"),
        "municipality_id": pkg.get("municipality_id"),
        "municipality_name": muni.get("name"),
        "municipality_friction_score": muni.get("overall_friction_score"),
        "permit_type": pkg.get("permit_type"),
        "title": pkg.get("title"),
        "applicant": pkg.get("applicant"),
        "current_stage": pkg.get("current_stage"),
        "stage_index": stage_index,
        "stage_count": len(stage_order),
        "stage_entered_at": pkg.get("stage_entered_at"),
        "median_stage_days": median,
        "days_in_stage": days_in_stage,
        "days_over_median": over_median,
        "over_median_pct": over_median_pct,
        "delay_flag": bool(pkg.get("delay_flag")),
        "expected_completion": pkg.get("expected_completion"),
        "impact": pkg.get("impact"),
        "history": [
            {
                "stage": h.get("stage"),
                "entered_at": h.get("entered_at"),
                "exited_at": h.get("exited_at"),
            }
            for h in pkg.get("history") or []
        ],
        "href_project": f"/lab/env/{env_id}/operator/projects/{pkg.get('project_id')}"
        if pkg.get("project_id")
        else None,
        "href_municipality": f"/lab/env/{env_id}/operator/municipalities/{pkg.get('municipality_id')}"
        if pkg.get("municipality_id")
        else None,
    }


def list_permits(
    *, env_id: UUID, business_id: UUID | None = None
) -> dict[str, Any]:
    _ = business_id
    fixture = _load_fixture()
    rows = [_permit_row(p, env_id=env_id) for p in fixture.get("permits") or []]
    # Delayed first, then by days over median desc, then alpha
    rows.sort(
        key=lambda r: (
            0 if r.get("delay_flag") else 1,
            -int(r.get("days_over_median") or 0),
            r.get("title") or "",
        )
    )
    stage_order = list(fixture.get("_permit_stage_order", []))

    # Funnel: count of permits in each stage
    funnel: dict[str, int] = {s: 0 for s in stage_order}
    for r in rows:
        s = r.get("current_stage") or ""
        if s in funnel:
            funnel[s] += 1
    funnel_rows = [
        {"stage": s, "count": funnel[s]} for s in stage_order
    ]

    delayed = [r for r in rows if r.get("delay_flag")]
    total_impact = sum(
        float((r.get("impact") or {}).get("estimated_cost_usd") or 0)
        for r in delayed
    )

    return {
        "permits": rows,
        "funnel": funnel_rows,
        "totals": {
            "permit_count": len(rows),
            "delayed_count": len(delayed),
            "total_days_over_median": sum(
                int(r.get("days_over_median") or 0) for r in delayed
            ),
            "delayed_impact_usd": total_impact,
        },
    }


def _closeout_package_row(
    pkg: dict[str, Any], *, env_id: UUID
) -> dict[str, Any]:
    projects = _project_map()
    entities = _entity_map()
    project = projects.get(pkg.get("project_id") or "") or {}
    entity = entities.get(project.get("entity_id") or "") or {}
    missing_items = list(pkg.get("missing_items") or [])
    blocking = [m for m in missing_items if m.get("blocking")]
    impact_total = sum(
        float((m.get("impact") or {}).get("estimated_cost_usd") or 0)
        for m in missing_items
    )
    by_type: dict[str, int] = {}
    for m in missing_items:
        key = str(m.get("type") or "other")
        by_type[key] = by_type.get(key, 0) + 1
    earliest_due = None
    for m in missing_items:
        due = m.get("due_date")
        if due and (earliest_due is None or due < earliest_due):
            earliest_due = due
    return {
        "project_id": pkg.get("project_id"),
        "project_name": project.get("name"),
        "entity_id": project.get("entity_id"),
        "entity_name": entity.get("name"),
        "target_close_date": pkg.get("target_close_date"),
        "days_to_close": pkg.get("days_to_close"),
        "completion_pct": pkg.get("completion_pct") or 0,
        "missing_count": len(missing_items),
        "blocking_count": len(blocking),
        "impact_total_usd": impact_total,
        "earliest_due_date": earliest_due,
        "missing_by_type": [
            {"type": key, "count": count} for key, count in sorted(by_type.items())
        ],
        "missing_items": [
            {
                "id": m.get("id"),
                "type": m.get("type"),
                "title": m.get("title"),
                "owner": m.get("owner"),
                "blocking": bool(m.get("blocking")),
                "due_date": m.get("due_date"),
                "note": m.get("note"),
                "impact": m.get("impact"),
            }
            for m in missing_items
        ],
        "href": f"/lab/env/{env_id}/operator/projects/{pkg.get('project_id')}"
        if pkg.get("project_id")
        else None,
    }


def list_closeout_packages(
    *, env_id: UUID, business_id: UUID | None = None
) -> dict[str, Any]:
    _ = business_id
    fixture = _load_fixture()
    packages = fixture.get("closeout_packages") or []
    rows = [_closeout_package_row(pkg, env_id=env_id) for pkg in packages]
    rows.sort(key=lambda r: (r.get("days_to_close") or 9999, -r.get("impact_total_usd") or 0))
    total_impact = sum(float(r.get("impact_total_usd") or 0) for r in rows)
    total_missing = sum(int(r.get("missing_count") or 0) for r in rows)
    total_blocking = sum(int(r.get("blocking_count") or 0) for r in rows)
    earliest_due = None
    for r in rows:
        due = r.get("earliest_due_date")
        if due and (earliest_due is None or due < earliest_due):
            earliest_due = due
    cash = _cash_at_risk_totals()
    return {
        "packages": rows,
        "totals": {
            "package_count": len(rows),
            "missing_item_count": total_missing,
            "blocking_missing_count": total_blocking,
            "impact_total_usd": total_impact,
            "earliest_due_date": earliest_due,
            "cash_at_risk_usd": float(cash.get("total_amount_usd") or 0),
            "cash_at_risk_project_count": int(cash.get("project_count") or 0),
        },
        "cash_at_risk": cash,
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
    action_queue, action_queue_collapsed = _prepare_action_queue(env_id)
    weekly_summary = _prepare_weekly_summary()
    site_ordinance_strip = _prepare_site_ordinance_strip(env_id)
    cash_at_risk = _cash_at_risk_totals()
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
            "headline": (weekly_summary or {}).get("headline")
            or "Control the overrun, unblock close, then consolidate duplicated vendor spend.",
            "summary_lines": (weekly_summary or {}).get("key_shifts")
            or ai_grounding.get("what_is_going_wrong", []),
            "priorities": (weekly_summary or {}).get("recommended_actions")
            or ai_grounding.get("what_to_focus_on", []),
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
                "What ordinance changes affect our active sites?",
                "Which municipalities are slowing us down most?",
                "What’s the IRR hit from the Miami parking rule?",
                "What should I focus on today?",
            ],
        },
        "weekly_summary": weekly_summary,
        "action_queue": action_queue,
        "action_queue_collapsed_count": action_queue_collapsed,
        "site_ordinance_strip": site_ordinance_strip,
        "cash_at_risk": cash_at_risk,
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
