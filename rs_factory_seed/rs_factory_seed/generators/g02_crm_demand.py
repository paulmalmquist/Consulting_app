"""g02 — CRM demand and build plan (convo.md §4 Phase 2).

Seeds customer demand before factory activity so operational blockers can later tie back
to customer commitments. SCN-001 hook: VEH-TR-003 is on a build plan whose mission launch
window is approaching (drives the "readiness blocked" urgency).
"""

from __future__ import annotations

import datetime as _dt

from .. import ids
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import SourceSystem as SS

_MISSION_STATUS = ["planned", "manifested", "active", "scrubbed"]
_MILESTONE_NAMES = [
    "Build Start", "Structures Complete", "Avionics Integration", "Propulsion Install",
    "Qualification Test", "Acceptance Test", "Launch Readiness Review", "Ship to Launch",
]
_YEAR = 2026


def run(ctx: BuildContext, ds: Dataset) -> None:
    _missions(ctx, ds)
    _payload_commitments(ctx, ds)
    _build_plan(ctx, ds)
    _program_milestones(ctx, ds)


def _missions(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_crm_missions")
    cust_ids = [r["customer_id"] for r in ds.get("dim_customer").rows]
    n = ctx.n("missions")
    rows = []
    for i in range(n):
        start = ctx.as_of + _dt.timedelta(days=int(rng.integers(-30, 240)))
        rows.append({
            "mission_id": ids.mission(_YEAR, i + 1),
            "customer_id": cust_ids[int(rng.integers(0, len(cust_ids)))],
            "mission_name": f"Mission {i + 1:03d}",
            "launch_window_start": start.isoformat(),
            "launch_window_end": (start + _dt.timedelta(days=int(rng.integers(5, 30)))).isoformat(),
            "status": str(rng.choice(_MISSION_STATUS, p=[0.35, 0.30, 0.25, 0.10])),
            "scenario_id": None,
        })
    ds.add("raw_crm_missions", rows, key=["mission_id"], source_system=SS.CRM)


def _payload_commitments(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_crm_payload_commitments")
    mission_ids = [r["mission_id"] for r in ds.get("raw_crm_missions").rows]
    n = ctx.n("payload_commitments")
    rows = []
    for i in range(n):
        mid = mission_ids[int(rng.integers(0, len(mission_ids)))]
        committed = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
        rows.append({
            "commitment_id": ids.payload_commitment(i + 1),
            "mission_id": mid,
            "payload_name": f"Payload {i + 1:03d}",
            "mass_kg": int(rng.integers(120, 9000)),
            "committed_date": committed.isoformat(),
            "scenario_id": None,
        })
    ds.add("raw_crm_payload_commitments", rows, key=["commitment_id"], source_system=SS.CRM)


def _build_plan(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("fact_vehicle_build_plan")
    vehicles = ds.get("dim_vehicle").rows
    mission_ids = [r["mission_id"] for r in ds.get("raw_crm_missions").rows]
    blocked = ctx.scenario["anchors"]["blocked_vehicle"]
    rows = []
    for i, v in enumerate(sorted(vehicles, key=lambda r: r["vehicle_id"])):
        vid = v["vehicle_id"]
        is_blocked = vid == blocked
        build_start = ctx.start + _dt.timedelta(days=int(rng.integers(0, 120)))
        # SCN-001: TR-003's mission window is near AS_OF (approaching).
        if is_blocked:
            target = ctx.as_of + _dt.timedelta(days=21)
            mid = mission_ids[0]
            scenario = "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"
        else:
            target = ctx.as_of + _dt.timedelta(days=int(rng.integers(40, 200)))
            mid = mission_ids[(i + 1) % len(mission_ids)]
            scenario = None
        rows.append({
            "build_plan_id": ids.build_plan(i + 1),
            "vehicle_id": vid,
            "mission_id": mid,
            "build_start_date": build_start.isoformat(),
            "target_complete_date": target.isoformat(),
            "scenario_id": scenario,
        })
    ds.add("fact_vehicle_build_plan", rows, key=["build_plan_id"], source_system=SS.CRM)


def _program_milestones(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("fact_program_milestone")
    vehicles = [r["vehicle_id"] for r in ds.get("dim_vehicle").rows]
    blocked = ctx.scenario["anchors"]["blocked_vehicle"]
    n = ctx.n("program_milestones")
    rows = []
    for i in range(n):
        vid = vehicles[i % len(vehicles)]
        name = _MILESTONE_NAMES[i % len(_MILESTONE_NAMES)]
        planned = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span() + 60)))
        # complete if planned date is in the past; the blocked vehicle's late ones stay open
        done = planned < ctx.as_of and not (vid == blocked and rng.random() < 0.4)
        rows.append({
            "milestone_id": ids.milestone(i + 1),
            "vehicle_id": vid,
            "name": name,
            "planned_date": planned.isoformat(),
            "actual_date": planned.isoformat() if done else None,
            "status": "complete" if done else ("in_progress" if planned < ctx.as_of else "planned"),
            "scenario_id": "SCN-001-VEHICLE-TR003-READINESS-BLOCKED" if (vid == blocked and not done) else None,
        })
    ds.add("fact_program_milestone", rows, key=["milestone_id"], source_system=SS.CRM)
