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


_VENDOR_CONCENTRATION_HIGH_THRESHOLD = 40.0
_VENDOR_ON_TIME_WARN_THRESHOLD = 0.75


def _vendor_index() -> dict[str, dict[str, Any]]:
    return {v["id"]: v for v in _load_fixture().get("vendors", [])}


def _vendor_project_map() -> dict[str, list[dict[str, Any]]]:
    """Walk active projects' vendor_breakdown to map vendor_id -> [project rows]."""
    mapping: dict[str, list[dict[str, Any]]] = {}
    for project in _load_fixture().get("projects", []):
        for line in project.get("vendor_breakdown", []) or []:
            vid = line.get("vendor_id")
            if not vid:
                continue
            mapping.setdefault(vid, []).append(
                {
                    "project_id": project["id"],
                    "project_name": project.get("name"),
                    "risk_level": project.get("risk_level"),
                    "status": project.get("status"),
                    "share_pct": line.get("share_pct"),
                    "amount": line.get("amount"),
                    "line_status": line.get("status"),
                }
            )
    return mapping


def _concentration_row(perf: dict[str, Any], env_id: UUID) -> dict[str, Any]:
    vendor = _vendor_index().get(perf["vendor_id"], {})
    linked = _vendor_project_map().get(perf["vendor_id"], [])
    concentration = perf.get("concentration_pct")
    return {
        "vendor_id": perf["vendor_id"],
        "vendor_name": vendor.get("name", perf["vendor_id"]),
        "category": vendor.get("category"),
        "concentration_pct": concentration,
        "concentration_severity": (
            "high" if concentration is not None and concentration >= _VENDOR_CONCENTRATION_HIGH_THRESHOLD
            else "medium" if concentration is not None and concentration >= 25.0
            else "low"
        ),
        "active_project_count": perf.get("active_project_count"),
        "total_active_jobs_denominator": perf.get("total_active_jobs_denominator"),
        "on_time_rate": perf.get("on_time_rate"),
        "on_time_warn": (
            perf.get("on_time_rate") is not None
            and perf["on_time_rate"] < _VENDOR_ON_TIME_WARN_THRESHOLD
        ),
        "budget_adherence_pct": perf.get("budget_adherence_pct"),
        "avg_delay_days": perf.get("avg_delay_days"),
        "rework_rate": perf.get("rework_rate"),
        "at_risk_project_count": perf.get("at_risk_project_count"),
        "trend": perf.get("trend"),
        "confidence": perf.get("confidence"),
        "flag": perf.get("flag"),
        "spend_share_of_active_pct": perf.get("spend_share_of_active_pct"),
        "delay_correlation": perf.get("delay_correlation"),
        "notes": perf.get("notes"),
        "impact": perf.get("impact"),
        "linked_projects": [
            {**row, "href": f"/lab/env/{env_id}/operator/projects/{row['project_id']}"}
            for row in linked
        ],
    }


_STALE_UPDATE_DAYS = 5


def list_accountability(*, env_id: UUID, business_id: UUID | None = None) -> dict[str, Any]:
    """Internal accountability layer: stalled, unowned, overdue items with escalation levels."""
    _ = business_id
    items = list(_load_fixture().get("ownership_items", []))
    projects = _project_index()

    rows = []
    for i in items:
        pid = i["project_id"]
        rows.append({
            **i,
            "project_name": projects.get(pid, {}).get("name"),
            "stalled_no_owner": not i.get("owner"),
            "stale_update": int(i.get("last_update_days") or 0) >= _STALE_UPDATE_DAYS,
            "href": f"/lab/env/{env_id}/operator/projects/{pid}",
        })
    # Sort: unassigned → overdue → highest escalation → most days overdue
    rows.sort(
        key=lambda r: (
            0 if r["stalled_no_owner"] else 1,
            0 if r.get("status") == "overdue" else 1,
            -int(r.get("escalation_level") or 0),
            -int(r.get("days_overdue") or 0),
        )
    )

    # By-owner rollup
    owner_map: dict[str, dict[str, Any]] = {}
    for r in rows:
        owner = r.get("owner") or "Unassigned"
        row = owner_map.setdefault(owner, {
            "owner": owner,
            "owner_id": r.get("owner_id"),
            "open_count": 0,
            "overdue_count": 0,
            "max_escalation_level": 0,
            "stale_count": 0,
        })
        row["open_count"] += 1
        if r.get("status") == "overdue":
            row["overdue_count"] += 1
        row["max_escalation_level"] = max(
            row["max_escalation_level"], int(r.get("escalation_level") or 0)
        )
        if r.get("stale_update"):
            row["stale_count"] += 1
    by_owner = list(owner_map.values())
    by_owner.sort(key=lambda r: (-r["overdue_count"], -r["max_escalation_level"], -r["open_count"]))

    totals = {
        "total_items": len(rows),
        "unassigned_count": sum(1 for r in rows if r["stalled_no_owner"]),
        "overdue_count": sum(1 for r in rows if r.get("status") == "overdue"),
        "stale_count": sum(1 for r in rows if r["stale_update"]),
        "max_escalation_level": max((int(r.get("escalation_level") or 0) for r in rows), default=0),
    }
    return {"items": rows, "by_owner": by_owner, "totals": totals}


_THEME_ALIASES = {
    # Maps review comment themes to lesson themes so lessons apply to active issues.
    "panel_sizing": {"electrical_panel_sizing"},
    "grounding": {"electrical_panel_sizing"},
    "compatibility_setback": {"compatibility_setback"},
    "utility_capacity": {"utility_capacity"},
    "parking_count": {"parking_variance"},
    "ada_clearance": {"ada_clearance"},
}


def list_lessons(*, env_id: UUID, business_id: UUID | None = None) -> dict[str, Any]:
    """Lessons engine: surfaces historical lessons keyed by active themes and municipalities."""
    _ = env_id, business_id
    lessons = list(_load_fixture().get("project_lessons", []))
    review = _load_fixture().get("review_comments", [])
    sites = _load_fixture().get("sites", [])

    # Active themes from open review comments
    active_review_themes = {c["theme"] for c in review if not c.get("resolved")}
    active_lesson_themes: set[str] = set()
    for t in active_review_themes:
        active_lesson_themes.update(_THEME_ALIASES.get(t, {t}))

    # Active municipalities (where we have active sites)
    active_munis = {s.get("municipality_id") for s in sites}

    rows = []
    for lesson in lessons:
        applies = lesson["theme"] in active_lesson_themes
        muni_active = lesson.get("municipality_id") in active_munis
        rows.append({
            **lesson,
            "applies_to_active_work": applies,
            "municipality_is_active": muni_active,
            "relevance_score": (2 if applies else 0) + (1 if muni_active else 0),
        })
    rows.sort(key=lambda r: (-r["relevance_score"], r["severity"] != "high"))

    totals = {
        "lesson_count": len(rows),
        "applies_count": sum(1 for r in rows if r["applies_to_active_work"]),
        "active_theme_count": len(active_lesson_themes),
    }
    return {"rows": rows, "totals": totals}


_STAFF_OVERLOAD_THRESHOLD = 110  # combined allocation_pct across projects


def list_staffing_load(*, env_id: UUID, business_id: UUID | None = None) -> dict[str, Any]:
    _ = business_id
    staff = list(_load_fixture().get("staff", []))
    loads = list(_load_fixture().get("staff_load", []))
    projects = _project_index()
    entities = _entity_map()

    load_by_staff: dict[str, list[dict[str, Any]]] = {}
    for line in loads:
        load_by_staff.setdefault(line["staff_id"], []).append(line)

    staff_rows = []
    for s in staff:
        lines = load_by_staff.get(s["id"], [])
        allocation_total = sum(int(line.get("allocation_pct") or 0) for line in lines)
        hours_total = sum(int(line.get("hours_per_week") or 0) for line in lines)
        project_count = len({line["project_id"] for line in lines})
        project_summaries = []
        for line in lines:
            pid = line["project_id"]
            project_summaries.append({
                "project_id": pid,
                "project_name": projects.get(pid, {}).get("name"),
                "allocation_pct": line.get("allocation_pct"),
                "role_on_project": line.get("role_on_project"),
                "hours_per_week": line.get("hours_per_week"),
                "stretch": bool(line.get("stretch")),
                "notes": line.get("notes"),
                "href": f"/lab/env/{env_id}/operator/projects/{pid}",
            })
        entity = entities.get(s.get("entity_id", ""), {})
        staff_rows.append({
            "staff_id": s["id"],
            "name": s.get("name"),
            "role": s.get("role"),
            "entity_id": s.get("entity_id"),
            "entity_name": entity.get("name"),
            "seniority": s.get("seniority"),
            "cost_loaded_per_hour": s.get("cost_loaded_per_hour"),
            "allocation_total_pct": allocation_total,
            "hours_per_week_total": hours_total,
            "project_count": project_count,
            "overloaded": allocation_total >= _STAFF_OVERLOAD_THRESHOLD,
            "projects": project_summaries,
        })
    staff_rows.sort(key=lambda r: (-(r["allocation_total_pct"] or 0), r["name"] or ""))

    # Project-side: where is coverage thin?
    project_cov: dict[str, dict[str, Any]] = {}
    for line in loads:
        pid = line["project_id"]
        row = project_cov.setdefault(pid, {
            "project_id": pid,
            "project_name": projects.get(pid, {}).get("name"),
            "total_allocation_pct": 0,
            "staff_count": 0,
            "stretch_count": 0,
            "href": f"/lab/env/{env_id}/operator/projects/{pid}",
        })
        row["total_allocation_pct"] += int(line.get("allocation_pct") or 0)
        row["staff_count"] += 1
        if line.get("stretch"):
            row["stretch_count"] += 1

    coverage_rows = list(project_cov.values())
    coverage_rows.sort(key=lambda r: (r["total_allocation_pct"] or 0))

    totals = {
        "staff_count": len(staff_rows),
        "overloaded_count": sum(1 for s in staff_rows if s["overloaded"]),
        "avg_allocation_pct": (
            sum(s["allocation_total_pct"] or 0 for s in staff_rows) / len(staff_rows)
            if staff_rows else 0
        ),
        "projects_covered": len(project_cov),
    }
    return {"staff": staff_rows, "project_coverage": coverage_rows, "totals": totals}


def list_inspection_rework(*, env_id: UUID, business_id: UUID | None = None) -> dict[str, Any]:
    _ = business_id
    events = list(_load_fixture().get("inspection_events", []))
    projects = _project_index()
    vendors = _vendor_index()

    # Failure rate by inspection_type
    type_map: dict[str, dict[str, Any]] = {}
    for e in events:
        t = e.get("inspection_type", "unknown")
        row = type_map.setdefault(t, {"inspection_type": t, "total": 0, "failed": 0, "rework_hours": 0, "rework_cost_usd": 0})
        row["total"] += 1
        if e.get("result") == "fail":
            row["failed"] += 1
        row["rework_hours"] += int(e.get("rework_hours") or 0)
        row["rework_cost_usd"] += float(e.get("rework_cost_usd") or 0)

    by_type = []
    for row in type_map.values():
        fail_rate = row["failed"] / row["total"] if row["total"] else 0
        by_type.append({
            "inspection_type": row["inspection_type"],
            "total": row["total"],
            "failed": row["failed"],
            "fail_rate": round(fail_rate, 3),
            "rework_hours": row["rework_hours"],
            "rework_cost_usd": row["rework_cost_usd"],
        })
    by_type.sort(key=lambda r: (r["fail_rate"], r["failed"]), reverse=True)

    # Vendor rework ranking
    vendor_map: dict[str, dict[str, Any]] = {}
    for e in events:
        vid = e.get("vendor_id")
        if not vid:
            continue
        row = vendor_map.setdefault(vid, {
            "vendor_id": vid,
            "vendor_name": vendors.get(vid, {}).get("name", vid),
            "total": 0,
            "failed": 0,
            "rework_hours": 0,
            "rework_cost_usd": 0,
        })
        row["total"] += 1
        if e.get("result") == "fail":
            row["failed"] += 1
        row["rework_hours"] += int(e.get("rework_hours") or 0)
        row["rework_cost_usd"] += float(e.get("rework_cost_usd") or 0)

    by_vendor = []
    for row in vendor_map.values():
        fail_rate = row["failed"] / row["total"] if row["total"] else 0
        by_vendor.append({**row, "fail_rate": round(fail_rate, 3)})
    by_vendor.sort(key=lambda r: (r["rework_cost_usd"], r["failed"]), reverse=True)

    # Recent failures list
    recent_failures = sorted(
        [e for e in events if e.get("result") == "fail"],
        key=lambda e: e.get("inspection_date") or "",
        reverse=True,
    )
    recent_rows = []
    for e in recent_failures[:8]:
        vid = e.get("vendor_id")
        recent_rows.append({
            "id": e["id"],
            "project_id": e["project_id"],
            "project_name": projects.get(e["project_id"], {}).get("name"),
            "inspection_type": e.get("inspection_type"),
            "inspection_date": e.get("inspection_date"),
            "vendor_id": vid,
            "vendor_name": vendors.get(vid, {}).get("name") if vid else None,
            "issue_summary": e.get("issue_summary"),
            "rework_hours": e.get("rework_hours") or 0,
            "rework_cost_usd": e.get("rework_cost_usd") or 0,
            "href": f"/lab/env/{env_id}/operator/projects/{e['project_id']}",
        })

    totals = {
        "event_count": len(events),
        "fail_count": sum(1 for e in events if e.get("result") == "fail"),
        "overall_fail_rate": round(
            sum(1 for e in events if e.get("result") == "fail") / len(events) if events else 0, 3
        ),
        "total_rework_hours": sum(int(e.get("rework_hours") or 0) for e in events),
        "total_rework_cost_usd": sum(float(e.get("rework_cost_usd") or 0) for e in events),
    }
    return {
        "by_inspection_type": by_type,
        "by_vendor": by_vendor,
        "recent_failures": recent_rows,
        "totals": totals,
    }


_REVIEW_SEVERITY_WEIGHT = {"blocking": 3, "delaying": 2, "minor": 1}


def list_review_cycle_analysis(*, env_id: UUID, business_id: UUID | None = None) -> dict[str, Any]:
    _ = business_id
    comments = list(_load_fixture().get("review_comments", []))
    projects = _project_index()

    # Theme clustering
    theme_map: dict[str, dict[str, Any]] = {}
    for c in comments:
        t = c.get("theme", "uncategorized")
        row = theme_map.setdefault(t, {
            "theme": t,
            "total_comments": 0,
            "blocking_count": 0,
            "unresolved_count": 0,
            "project_ids": set(),
            "avg_resolution_days": [],
        })
        row["total_comments"] += 1
        if c.get("severity") == "blocking":
            row["blocking_count"] += 1
        if not c.get("resolved"):
            row["unresolved_count"] += 1
        row["project_ids"].add(c["project_id"])
        if c.get("resolution_days") is not None:
            row["avg_resolution_days"].append(c["resolution_days"])

    themes = []
    for row in theme_map.values():
        days = row["avg_resolution_days"]
        themes.append({
            "theme": row["theme"],
            "total_comments": row["total_comments"],
            "blocking_count": row["blocking_count"],
            "unresolved_count": row["unresolved_count"],
            "affected_project_count": len(row["project_ids"]),
            "avg_resolution_days": round(sum(days) / len(days), 1) if days else None,
        })
    themes.sort(key=lambda r: (r["unresolved_count"], r["blocking_count"], r["total_comments"]), reverse=True)

    # Repeat-offender reviewers: same reviewer + same theme across ≥2 cycles
    repeat_map: dict[tuple[str, str], dict[str, Any]] = {}
    for c in comments:
        key = (c.get("reviewer_name", "unknown"), c.get("theme", "uncategorized"))
        row = repeat_map.setdefault(key, {
            "reviewer_name": c.get("reviewer_name"),
            "reviewer_role": c.get("reviewer_role"),
            "theme": c.get("theme"),
            "cycle_count": 0,
            "project_ids": set(),
            "unresolved": 0,
        })
        row["cycle_count"] += 1
        row["project_ids"].add(c["project_id"])
        if not c.get("resolved"):
            row["unresolved"] += 1

    repeat_offenders = []
    for row in repeat_map.values():
        if row["cycle_count"] >= 2:
            repeat_offenders.append({
                "reviewer_name": row["reviewer_name"],
                "reviewer_role": row["reviewer_role"],
                "theme": row["theme"],
                "cycle_count": row["cycle_count"],
                "affected_project_count": len(row["project_ids"]),
                "unresolved": row["unresolved"],
            })
    repeat_offenders.sort(key=lambda r: (r["unresolved"], r["cycle_count"]), reverse=True)

    # Cycle churn per project
    cycle_map: dict[str, dict[str, Any]] = {}
    for c in comments:
        pid = c["project_id"]
        row = cycle_map.setdefault(pid, {
            "project_id": pid,
            "project_name": projects.get(pid, {}).get("name"),
            "max_cycle": 0,
            "total_comments": 0,
            "unresolved_count": 0,
            "blocking_count": 0,
            "href": f"/lab/env/{env_id}/operator/projects/{pid}",
        })
        row["max_cycle"] = max(row["max_cycle"], int(c.get("review_cycle") or 1))
        row["total_comments"] += 1
        if not c.get("resolved"):
            row["unresolved_count"] += 1
        if c.get("severity") == "blocking":
            row["blocking_count"] += 1

    cycle_churn = list(cycle_map.values())
    cycle_churn.sort(key=lambda r: (r["max_cycle"], r["unresolved_count"]), reverse=True)

    totals = {
        "comment_count": len(comments),
        "unresolved_count": sum(1 for c in comments if not c.get("resolved")),
        "blocking_count": sum(1 for c in comments if c.get("severity") == "blocking"),
        "theme_count": len(themes),
        "repeat_offender_count": len(repeat_offenders),
        "max_cycle_observed": max((int(c.get("review_cycle") or 1) for c in comments), default=0),
    }
    return {
        "themes": themes,
        "repeat_offenders": repeat_offenders,
        "cycle_churn": cycle_churn,
        "totals": totals,
    }


_DRIFT_SEVERITY_ORDER = {"critical": 0, "elevated": 1, "stable": 2}


def _drift_row(raw: dict[str, Any], env_id: UUID) -> dict[str, Any]:
    projects = _project_index()
    project = projects.get(raw["project_id"], {})
    entities = _entity_map()
    entity = entities.get(project.get("entity_id", ""), {})
    return {
        "project_id": raw["project_id"],
        "project_name": project.get("name"),
        "entity_id": project.get("entity_id"),
        "entity_name": entity.get("name"),
        "project_status": project.get("status"),
        "project_risk_level": project.get("risk_level"),
        "current_budget_usd": raw.get("current_budget_usd"),
        "actual_cost_usd": raw.get("actual_cost_usd"),
        "current_drift_pct": raw.get("current_drift_pct"),
        "drift_trend_30d_pct": raw.get("drift_trend_30d_pct"),
        "drift_trend_60d_pct": raw.get("drift_trend_60d_pct"),
        "drift_risk_score": raw.get("drift_risk_score"),
        "drift_severity": raw.get("drift_severity"),
        "key_driver": raw.get("key_driver"),
        "trend_points_pct": raw.get("trend_points_pct", []),
        "forecast_final_drift_pct": raw.get("forecast_final_drift_pct"),
        "forecast_cost_overrun_usd": raw.get("forecast_cost_overrun_usd"),
        "days_to_next_threshold": raw.get("days_to_next_threshold"),
        "next_threshold_label": raw.get("next_threshold_label"),
        "confidence": raw.get("confidence"),
        "owner": raw.get("owner"),
        "notes": raw.get("notes"),
        "impact": raw.get("impact"),
        "href": f"/lab/env/{env_id}/operator/projects/{raw['project_id']}",
    }


def _project_index() -> dict[str, dict[str, Any]]:
    return {p["id"]: p for p in _load_fixture().get("projects", [])}


def list_budget_drift(*, env_id: UUID, business_id: UUID | None = None) -> dict[str, Any]:
    _ = business_id
    raw_rows = list(_load_fixture().get("budget_drift", []))
    rows = [_drift_row(r, env_id) for r in raw_rows]
    rows.sort(
        key=lambda r: (
            _DRIFT_SEVERITY_ORDER.get(r.get("drift_severity") or "stable", 3),
            -(r.get("drift_risk_score") or 0),
        )
    )
    critical = [r for r in rows if r.get("drift_severity") == "critical"]
    watchlist = [r for r in rows if r.get("drift_severity") in {"critical", "elevated"}]
    totals = {
        "project_count": len(rows),
        "critical_count": len(critical),
        "watchlist_count": len(watchlist),
        "total_forecast_overrun_usd": sum(
            (r.get("forecast_cost_overrun_usd") or 0) for r in rows
        ),
        "max_current_drift_pct": max(
            (abs(r.get("current_drift_pct") or 0) for r in rows), default=0.0
        ),
    }
    return {"rows": rows, "totals": totals}


def list_vendor_concentration(*, env_id: UUID, business_id: UUID | None = None) -> dict[str, Any]:
    _ = business_id
    perf_rows = list(_load_fixture().get("vendor_performance", []))
    rows = [_concentration_row(perf, env_id) for perf in perf_rows]
    rows.sort(key=lambda r: (r.get("concentration_pct") or 0), reverse=True)

    flagged = [r for r in rows if (r.get("concentration_pct") or 0) >= _VENDOR_CONCENTRATION_HIGH_THRESHOLD]
    totals = {
        "vendor_count": len(rows),
        "flagged_count": len(flagged),
        "max_concentration_pct": max((r.get("concentration_pct") or 0 for r in rows), default=0.0),
        "portfolio_on_time_rate": (
            sum((r.get("on_time_rate") or 0) for r in rows) / len(rows) if rows else None
        ),
    }
    return {"vendors": rows, "totals": totals}


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
