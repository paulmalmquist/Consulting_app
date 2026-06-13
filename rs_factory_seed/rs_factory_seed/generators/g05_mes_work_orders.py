"""g05 — MES work orders + operations (convo.md §4 Phase 4).

The core factory layer. Applies the status + exception distributions from scenario_config,
tags WLD-07 drift operations (post-2026-05-20) for g06's weld-depth NCRs, builds the SCN-004
valve Rev B/C completed-operation block (124 ops, the FPY denominator g06 realizes), and
seeds SCN-007 status mismatches (stale 72h+ and closed-with-open-NCR candidates).
Cross-generator counts come ONLY from scenario_config.
"""

from __future__ import annotations

import datetime as _dt

from .. import ids
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import SourceSystem as SS

_YEAR = 2026
_SCN4 = "SCN-004-REV-C-YIELD-IMPROVEMENT"
_SCN7 = "SCN-007-WORKORDER-STATUS-MISMATCH"
_STATUS = ["complete", "in_progress", "planned", "blocked", "cancelled_replaced", "rework"]


def run(ctx: BuildContext, ds: Dataset) -> None:
    _work_orders_and_ops(ctx, ds)
    _labor_events(ctx, ds)
    _machine_assignments(ctx, ds)
    _hold_events(ctx, ds)


def _work_orders_and_ops(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_mes_work_orders")
    rng_op = ctx.rng("raw_mes_operation_executions")
    dist = ctx.scenario["distributions"]["mes_status"]
    exc = ctx.scenario["rates"]["mes_exceptions"]
    status_p = [dist[s] for s in _STATUS]

    serials = ds.get("dim_serialized_item").rows
    serial_by_id = {r["serial_id"]: r for r in serials}
    wc_ids = [r["work_center_id"] for r in ds.get("dim_work_center").rows]
    op_ids = [r["operator_id"] for r in ds.get("dim_operator").rows]
    machines = ds.get("dim_machine").rows
    machine_ids = [m["machine_id"] for m in machines]
    weld_machine = ctx.scenario["anchors"]["weld_machine"]   # WLD-07
    drift_onset = _dt.date.fromisoformat(
        str(ctx.scenario["scenarios"]["SCN-003-MACHINE-WLD07-CALIBRATION-DRIFT"]["drift_onset_date"]))
    anchor_part = ids.part(ctx.scenario["anchors"]["valve_part_family"],
                           int(ctx.scenario["anchors"]["valve_part_seq"]))
    valve_serials = sorted(r["serial_id"] for r in serials if r["part_id"] == anchor_part)

    n_wo = ctx.n("work_orders")
    n_op = ctx.n("operation_executions")
    scn4 = ctx.scenario["scenarios"][_SCN4]
    scn4_ops = int(scn4["completed_operations"])  # 124
    rev_counts = {str(rev): int(count) for rev, count in scn4["revision_operation_counts"].items()}
    if set(rev_counts) != {"B", "C"} or sum(rev_counts.values()) != scn4_ops:
        raise ValueError("SCN-004 revision_operation_counts must define B/C and sum to completed_operations")

    wo_rows: list[dict] = []
    op_rows: list[dict] = []
    op_seq = 0

    # --- SCN-004 valve block: reserve the final WO IDs for Rev B/C anchor work ---
    rev_blocks = [("B", rev_counts["B"]), ("C", rev_counts["C"])]
    n_normal_wo = n_wo - len(rev_blocks)
    for bi, (rev, count) in enumerate(rev_blocks):
        wo_id = ids.work_order(_YEAR, n_normal_wo + bi + 1)
        serial = valve_serials[bi % len(valve_serials)] if valve_serials else None
        wo_rows.append({
            "wo_id": wo_id, "serial_id": serial, "part_id": anchor_part,
            "revision_id": ids.revision(anchor_part, rev),
            "work_center_id": wc_ids[0], "status": "complete",
            "opened_date": _dt.date(2026, 4, 20).isoformat(),
            "closed_date": _dt.date(2026, 5, 25).isoformat(),
            "scenario_id": _SCN4, "dq_defect_tag": None,
        })
        for _ in range(count):
            op_seq += 1
            op_rows.append({
                "op_id": ids.operation(_YEAR, op_seq),
                "wo_id": wo_id, "work_center_id": wc_ids[0],
                "machine_id": machine_ids[int(rng_op.integers(0, len(machine_ids)))],
                "operator_id": op_ids[int(rng_op.integers(0, len(op_ids)))],
                "op_status": "complete", "op_revision": rev,
                "started_at": _dt.date(2026, 4, 21).isoformat(),
                "completed_at": _dt.date(2026, 5, 24).isoformat(),
                "late": False, "cycle_time_min": 30, "std_cycle_min": 30,
                "scenario_id": _SCN4, "dq_defect_tag": None,
            })

    # --- normal work orders ---
    for i in range(n_normal_wo):
        s = serials[int(rng.integers(0, len(serials)))]
        sr = serial_by_id[s["serial_id"]]
        status = str(rng.choice(_STATUS, p=status_p))
        opened = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
        closed = None
        scenario = None
        tag = None
        if status == "complete":
            duration_days = int(rng.integers(1, 40))
            opened = ctx.start + _dt.timedelta(
                days=int(rng.integers(0, ctx.days_span() - duration_days + 1))
            )
            closed = (opened + _dt.timedelta(days=duration_days)).isoformat()
            if rng.random() < exc["wo_closed_with_open_ncr"]:   # SCN-007 / DQ candidate
                tag = "MES_CLOSED_OPEN_NCR"
                scenario = _SCN7
        elif status in ("in_progress", "blocked") and rng.random() < exc["work_order_stale_72h"]:
            opened = ctx.as_of - _dt.timedelta(days=int(rng.integers(4, 20)))   # stale 72h+
            tag = "MES_STALE_72H"
            scenario = _SCN7
        wo_rows.append({
            "wo_id": ids.work_order(_YEAR, i + 1),
            "serial_id": sr["serial_id"], "part_id": sr["part_id"],
            "revision_id": sr["revision_id"], "work_center_id": wc_ids[int(rng.integers(0, len(wc_ids)))],
            "status": status, "opened_date": opened.isoformat() if isinstance(opened, _dt.date) else opened,
            "closed_date": closed, "scenario_id": scenario, "dq_defect_tag": tag,
        })

    # --- normal operation executions ---
    wo_ids_all = [w["wo_id"] for w in wo_rows]
    n_normal_op = n_op - len(op_rows)
    for _ in range(n_normal_op):
        op_seq += 1
        wo_id = wo_ids_all[int(rng_op.integers(0, len(wo_ids_all)))]
        machine_id = machine_ids[int(rng_op.integers(0, len(machine_ids)))]
        op_status = str(rng_op.choice(["complete", "in_progress", "planned"], p=[0.7, 0.2, 0.1]))
        duration_days = int(rng_op.integers(0, 3))
        latest_start = ctx.days_span() - duration_days if op_status == "complete" else ctx.days_span()
        started = ctx.start + _dt.timedelta(days=int(rng_op.integers(0, latest_start + 1)))
        std = int(rng_op.integers(15, 90))
        late = op_status == "complete" and rng_op.random() < exc["operation_completed_late"]
        if op_status == "planned":
            cyc = None
        else:
            cyc = std * 2 if rng_op.random() < exc["cycle_time_2x"] else int(
                std * float(rng_op.uniform(0.8, 1.4))
            )
        completed = started + _dt.timedelta(days=duration_days) if op_status == "complete" else None
        tag = None
        scenario = None
        # WLD-07 calibration drift: weld ops after drift onset get flagged for g06 NCRs.
        if machine_id == weld_machine and completed is not None and completed >= drift_onset:
            tag = "WLD07_DRIFT"
            scenario = "SCN-003-MACHINE-WLD07-CALIBRATION-DRIFT"
        elif op_status == "complete" and rng_op.random() < exc["operation_missing_cert"]:
            tag = "OP_MISSING_CERT"
        elif op_status == "complete" and rng_op.random() < exc["operation_skipped_no_waiver"]:
            tag = "OP_SKIPPED_NO_WAIVER"
        op_rows.append({
            "op_id": ids.operation(_YEAR, op_seq),
            "wo_id": wo_id, "work_center_id": wc_ids[int(rng_op.integers(0, len(wc_ids)))],
            "machine_id": machine_id, "operator_id": op_ids[int(rng_op.integers(0, len(op_ids)))],
            "op_status": op_status,
            "op_revision": None,
            "started_at": started.isoformat(),
            "completed_at": completed.isoformat() if completed else None,
            "late": bool(late), "cycle_time_min": int(cyc) if cyc is not None else None,
            "std_cycle_min": std,
            "scenario_id": scenario, "dq_defect_tag": tag,
        })

    ds.add("raw_mes_work_orders", wo_rows, key=["wo_id"], source_system=SS.MES)
    ds.add("raw_mes_operation_executions", op_rows, key=["op_id"], source_system=SS.MES)


def _labor_events(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_mes_labor_events")
    ops = [r["op_id"] for r in ds.get("raw_mes_operation_executions").rows]
    op_oper = {r["op_id"]: r["operator_id"] for r in ds.get("raw_mes_operation_executions").rows}
    n = ctx.n("labor_events")
    rows = []
    for i in range(n):
        op = ops[int(rng.integers(0, len(ops)))]
        d = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
        rows.append({
            "labor_id": ids.labor_event(i + 1),
            "op_id": op,
            "operator_id": op_oper[op],
            "hours": round(float(rng.uniform(0.2, 6.0)), 2),
            "event_date": d.isoformat(),
            "scenario_id": None,
        })
    ds.add("raw_mes_labor_events", rows, key=["labor_id"], source_system=SS.MES)


def _machine_assignments(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_mes_machine_assignments")
    op_rows = ds.get("raw_mes_operation_executions").rows
    n = ctx.n("machine_assignments")
    rows = []
    for i in range(n):
        op = op_rows[int(rng.integers(0, len(op_rows)))]
        rows.append({
            "assignment_id": ids.machine_assignment(i + 1),
            "op_id": op["op_id"],
            "machine_id": op["machine_id"],
            "assigned_date": op["started_at"],
            "scenario_id": None,
        })
    ds.add("raw_mes_machine_assignments", rows, key=["assignment_id"], source_system=SS.MES)


def _hold_events(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_mes_hold_events")
    wo_ids = [r["wo_id"] for r in ds.get("raw_mes_work_orders").rows]
    reasons = ["waiting_material", "quality_hold", "engineering_disposition", "tooling", "inspection_queue"]
    n = ctx.n("hold_events")
    rows = []
    for i in range(n):
        opened = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
        released = None
        if rng.random() < 0.7:
            released = (opened + _dt.timedelta(days=int(rng.integers(1, 15)))).isoformat()
        rows.append({
            "hold_id": ids.hold_event(i + 1),
            "wo_id": wo_ids[int(rng.integers(0, len(wo_ids)))],
            "reason": str(rng.choice(reasons)),
            "opened_date": opened.isoformat(),
            "released_date": released,
            "scenario_id": None,
        })
    ds.add("raw_mes_hold_events", rows, key=["hold_id"], source_system=SS.MES)
