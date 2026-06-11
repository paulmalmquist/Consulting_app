"""g08 - Jira issues, status history, entity links, and blockers."""

from __future__ import annotations

import datetime as dt

from .. import ids
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import SourceSystem as SS

_SCN1 = "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"
_SCN6 = "SCN-006-NCR-AGING-OWNER-ROUTING"
_SCN8 = "SCN-008-DAILY-FACTORY-HANDOFF"
_TEAMS = ["Propulsion", "Structures", "Avionics", "Quality", "Test", "Integration"]
_STATUSES = ["open", "triage", "in_progress", "blocked", "resolved"]


def run(ctx: BuildContext, ds: Dataset) -> None:
    issues = _issues(ctx, ds)
    _history(ctx, ds, issues)
    _links(ctx, ds, issues)
    _blockers(ctx, ds, issues)


def _issues(ctx: BuildContext, ds: Dataset) -> list[dict]:
    rng = ctx.rng("raw_jira_issues")
    n = ctx.n("jira_issues")
    anchor_key = ctx.scenario["anchors"]["anchor_jira"]
    keys = [anchor_key]
    sequence = 1
    while len(keys) < n:
        candidate = ids.jira(sequence)
        sequence += 1
        if candidate != anchor_key:
            keys.append(candidate)
    rows = []
    for i, key in enumerate(keys[:n]):
        is_anchor = key == anchor_key
        created = ctx.as_of - dt.timedelta(days=35 if is_anchor else int(rng.integers(1, 100)))
        rows.append({
            "issue_key": key,
            "summary": "TR-003 pressure-test engineering disposition" if is_anchor
            else f"Factory exception follow-up {i + 1}",
            "issue_type": "engineering_disposition" if is_anchor else str(
                rng.choice(["quality", "manufacturing", "test", "material"])
            ),
            "status": "blocked" if is_anchor else str(rng.choice(_STATUSES)),
            "priority": "critical" if is_anchor else str(rng.choice(["low", "medium", "high"])),
            "owner_team": "Propulsion" if is_anchor else _TEAMS[i % len(_TEAMS)],
            "created_date": created.isoformat(),
            "updated_date": ctx.as_of.isoformat(),
            "vehicle_id": ctx.scenario["anchors"]["blocked_vehicle"] if is_anchor else None,
            "scenario_id": _SCN1 if is_anchor else (_SCN6 if i < 30 else None),
            "dq_defect_tag": None,
        })
    ds.add("raw_jira_issues", rows, key=["issue_key"], source_system=SS.JIRA)
    return rows


def _history(ctx: BuildContext, ds: Dataset, issues: list[dict]) -> None:
    rows = []
    for i in range(ctx.n("jira_status_history")):
        issue = issues[i % len(issues)]
        step = i // len(issues)
        changed = min(
            dt.date.fromisoformat(issue["created_date"]) + dt.timedelta(days=step * 3),
            ctx.as_of,
        )
        rows.append({
            "history_id": ids.jira_history(i + 1),
            "issue_key": issue["issue_key"],
            "from_status": _STATUSES[step % len(_STATUSES)],
            "to_status": issue["status"] if step >= 3 else _STATUSES[(step + 1) % len(_STATUSES)],
            "changed_date": changed.isoformat(),
            "scenario_id": issue["scenario_id"],
        })
    ds.add("raw_jira_status_history", rows, key=["history_id"], source_system=SS.JIRA)


def _links(ctx: BuildContext, ds: Dataset, issues: list[dict]) -> None:
    entities = []
    entities.extend(("work_order", r["wo_id"]) for r in ds.get("raw_mes_work_orders").sorted_rows())
    entities.extend(("ncr", r["ncr_id"]) for r in ds.get("raw_qms_ncrs").sorted_rows())
    entities.extend(("test_run", r["run_id"]) for r in ds.get("raw_test_runs").sorted_rows())
    rows = [{
        "link_id": ids.jira_link(1),
        "issue_key": ctx.scenario["anchors"]["anchor_jira"],
        "entity_type": "test_run",
        "entity_id": ctx.scenario["anchors"]["hotfire_inconclusive_run"],
        "link_type": "blocks_disposition",
        "scenario_id": _SCN1,
    }]
    for i in range(1, ctx.n("jira_links")):
        kind, entity_id = entities[(i - 1) % len(entities)]
        issue = issues[i % len(issues)]
        rows.append({
            "link_id": ids.jira_link(i + 1),
            "issue_key": issue["issue_key"],
            "entity_type": kind,
            "entity_id": entity_id,
            "link_type": "relates_to",
            "scenario_id": issue["scenario_id"],
        })
    ds.add("raw_jira_links", rows, key=["link_id"], source_system=SS.JIRA)


def _blockers(ctx: BuildContext, ds: Dataset, issues: list[dict]) -> None:
    rng = ctx.rng("fact_blocker")
    anchor = ctx.scenario["anchors"]["anchor_jira"]
    rows = []
    for i in range(ctx.n("blockers")):
        issue = issues[i % len(issues)]
        is_anchor = issue["issue_key"] == anchor
        age = 35 if is_anchor else int(rng.integers(1, 60))
        rows.append({
            "blocker_id": ids.blocker(i + 1),
            "issue_key": issue["issue_key"],
            "vehicle_id": ctx.scenario["anchors"]["blocked_vehicle"] if is_anchor else None,
            "owner_team": issue["owner_team"],
            "blocker_type": "engineering_disposition" if is_anchor else issue["issue_type"],
            "status": "open" if is_anchor or issue["status"] != "resolved" else "resolved",
            "age_days": age,
            "recommended_action": "Complete pressure-test disposition and readiness review"
            if is_anchor else f"Route to {issue['owner_team']} owner",
            "source_link": f"jira://{issue['issue_key']}",
            "scenario_id": _SCN1 if is_anchor else (_SCN6 if age >= 21 else _SCN8),
        })
    ds.add("fact_blocker", rows, key=["blocker_id"], source_system=SS.JIRA)


__all__ = ["run"]
