"""g06 — QMS inspections, NCRs, rework, waivers (convo.md §4 Phase 5).

Realizes the quantitative quality scenarios, consuming counts ONLY from scenario_config
and the dq_defect_tags g05 left behind:
  - SCN-004: first-pass yield over the 124 valve ops lands on 0.78 (Rev B) / 0.91 (Rev C).
  - SCN-002: exactly 7 of the 38 ML-8821 serials fail inspection; rework+scrap = $148K.
  - SCN-003: weld-depth NCRs trace to WLD-07's post-drift operations.
  - SCN-001: exactly 4 OPEN NCRs on VEH-TR-003 serials.
  - SCN-007: an OPEN NCR on each work order g05 tagged closed-with-open-NCR.
Other ops realize part-family FPY (sampled within tolerance).
"""

from __future__ import annotations

import datetime as _dt

from .. import ids
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import SourceSystem as SS

_SCN1 = "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"
_SCN2 = "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"
_SCN3 = "SCN-003-MACHINE-WLD07-CALIBRATION-DRIFT"
_SCN7 = "SCN-007-WORKORDER-STATUS-MISMATCH"
_OWNER_TEAMS = ["Propulsion", "Structures", "Avionics", "Quality", "Test", "Integration"]
_DISPOSITIONS = ["rework", "use_as_is", "repair", "scrap", "eng_review_open"]
_DEFAULT_FPY = 0.90


def run(ctx: BuildContext, ds: Dataset) -> None:
    _characteristics(ctx, ds)
    op_first_pass = _inspection_results(ctx, ds)
    _ncrs_rework_waivers(ctx, ds, op_first_pass)


def _characteristics(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_qms_inspection_characteristics")
    families = sorted({r["part_family"] for r in ds.get("dim_part").rows})
    n = ctx.n("inspection_characteristics")
    names = ["diameter", "length", "weld_depth", "torque", "surface_finish",
             "flatness", "concentricity", "pressure_hold", "resistance"]
    rows = []
    for i in range(n):
        fam = families[i % len(families)]
        nominal = round(float(rng.uniform(5, 500)), 3)
        tol = round(nominal * 0.02, 3)
        rows.append({
            "characteristic_id": ids.inspection_characteristic(i + 1),
            "part_family": fam,
            "name": names[i % len(names)],
            "nominal": nominal,
            "tolerance": tol,
            "criticality": str(rng.choice(["flight_critical", "safety_critical", "standard"],
                                          p=[0.2, 0.3, 0.5])),
            "scenario_id": None,
        })
    ds.add("raw_qms_inspection_characteristics", rows, key=["characteristic_id"], source_system=SS.QMS)


def _inspection_results(ctx: BuildContext, ds: Dataset):
    """One+ measurement per completed op. Returns {op_id: first_pass_bool}."""
    rng = ctx.rng("raw_qms_inspection_results")
    fpy_by_family = ctx.scenario["distributions"]["part_family_fpy"]
    scn4 = ctx.scenario["scenarios"]["SCN-004-REV-C-YIELD-IMPROVEMENT"]
    fpy_rev = {"B": scn4["rev_b_fpy"], "C": scn4["rev_c_fpy"]}

    serial_part = {r["serial_id"]: r["part_id"] for r in ds.get("dim_serialized_item").rows}
    part_family = {r["part_id"]: r["part_family"] for r in ds.get("dim_part").rows}
    wo_serial = {r["wo_id"]: r["serial_id"] for r in ds.get("raw_mes_work_orders").rows}

    ops = [r for r in ds.get("raw_mes_operation_executions").rows if r["op_status"] == "complete"]
    # Valve SCN-004 ops first (guarantees exact FPY even under the 25000 cap), then the rest.
    valve_ops = sorted((o for o in ops if o["scenario_id"] == "SCN-004-REV-C-YIELD-IMPROVEMENT"),
                       key=lambda o: o["op_id"])
    other_ops = sorted((o for o in ops if o["scenario_id"] != "SCN-004-REV-C-YIELD-IMPROVEMENT"),
                       key=lambda o: o["op_id"])

    # Deterministic first_pass per op.
    op_first_pass: dict[str, bool] = {}
    # SCN-004 valve ops: exactly round(fpy*count) pass per revision.
    for rev in ("B", "C"):
        block = [o for o in valve_ops if o["op_revision"] == rev]
        n_pass = round(fpy_rev[rev] * len(block))
        for idx, o in enumerate(block):
            op_first_pass[o["op_id"]] = idx < n_pass
    # Other ops: part-family FPY (sampled).
    for o in other_ops:
        serial = wo_serial.get(o["wo_id"])
        fam = part_family.get(serial_part.get(serial), "")
        fpy = fpy_by_family.get(fam, _DEFAULT_FPY)
        op_first_pass[o["op_id"]] = bool(rng.random() < fpy)

    n_target = ctx.n("inspection_results")
    rows: list[dict] = []
    seq = 0
    for o in valve_ops + other_ops:
        serial = wo_serial.get(o["wo_id"])
        fam = part_family.get(serial_part.get(serial), "")
        passed = op_first_pass[o["op_id"]]
        kchars = int(rng.integers(3, 7))
        for ci in range(kchars):
            seq += 1
            in_tol = True if passed else (ci != 0)  # first char fails when op fails
            nominal = round(float(rng.uniform(5, 500)), 3)
            tol = round(nominal * 0.02, 3)
            dev = float(rng.uniform(-1, 1)) * tol if in_tol else tol * float(rng.uniform(1.2, 2.5))
            rows.append({
                "result_id": ids.inspection_result(seq),
                "op_id": o["op_id"],
                "serial_id": serial,
                "characteristic_seq": ci + 1,
                "part_family": fam,
                "nominal": nominal,
                "measured_value": round(nominal + dev, 3),
                "tolerance": tol,
                "in_tolerance": bool(in_tol),
                "first_pass": bool(passed),
                "scenario_id": o["scenario_id"],
                "dq_defect_tag": None,
            })
    # Trim to the target volume; valve SCN-004 ops are first, so they are never trimmed.
    rows = rows[:n_target]
    ds.add("raw_qms_inspection_results", rows, key=["result_id"], source_system=SS.QMS)
    return op_first_pass


def _ncrs_rework_waivers(ctx: BuildContext, ds: Dataset, op_first_pass: dict) -> None:
    rng = ctx.rng("raw_qms_ncrs")
    s1 = ctx.scenario["scenarios"][_SCN1]
    s2 = ctx.scenario["scenarios"][_SCN2]
    disp_p = [ctx.scenario["distributions"]["ncr_disposition"][d] for d in _DISPOSITIONS]

    serials = ds.get("dim_serialized_item").rows
    ml_serials = sorted(r["serial_id"] for r in serials if r["scenario_id"] == _SCN2)
    tr003_serials = sorted(r["serial_id"] for r in serials if r["vehicle_id"] == "VEH-TR-003")
    serial_part = {r["serial_id"]: r["part_id"] for r in serials}
    wld_ops = sorted((r for r in ds.get("raw_mes_operation_executions").rows
                      if r["dq_defect_tag"] == "WLD07_DRIFT"), key=lambda r: r["op_id"])
    closed_open_wos = sorted((r for r in ds.get("raw_mes_work_orders").rows
                              if r["dq_defect_tag"] == "MES_CLOSED_OPEN_NCR"), key=lambda r: r["wo_id"])
    wo_serial = {r["wo_id"]: r["serial_id"] for r in ds.get("raw_mes_work_orders").rows}

    n_total = ctx.n("ncrs")
    rows: list[dict] = []
    seq = 0

    def add_ncr(serial, op_id, wo_id, defect, disposition, status, scenario, tag, day_offset):
        nonlocal seq
        seq += 1
        opened = ctx.as_of - _dt.timedelta(days=day_offset)
        closed = None if status == "open" else (opened + _dt.timedelta(days=3)).isoformat()
        rows.append({
            "ncr_id": ids.ncr(2026, seq),
            "serial_id": serial,
            "op_id": op_id,
            "wo_id": wo_id,
            "part_id": serial_part.get(serial),
            "defect_code": defect,
            "disposition": disposition,
            "status": status,
            "opened_date": opened.isoformat(),
            "closed_date": closed,
            "owner_team": _OWNER_TEAMS[seq % len(_OWNER_TEAMS)],
            "scenario_id": scenario,
            "dq_defect_tag": tag,
        })

    # SCN-002: exactly N ML-8821 serials fail inspection -> N NCRs (weld porosity).
    n_fail = int(s2["serials_failed_inspection"])  # 7
    for i in range(n_fail):
        s = ml_serials[i]
        disp = "scrap" if i < 2 else "rework"
        add_ncr(s, None, None, "weld_porosity", disp, "open" if i < 3 else "closed",
                _SCN2, "ML8821_POROSITY", 20 - i)

    # SCN-001: exactly 4 OPEN NCRs on TR-003 serials.
    n_open = int(s1["open_ncrs"])  # 4
    for i in range(n_open):
        s = tr003_serials[i % len(tr003_serials)]
        add_ncr(s, None, None, "dimensional", "eng_review_open", "open", _SCN1, None, 30 - i)

    # SCN-003: weld-depth NCRs from WLD-07 post-drift ops.
    for o in wld_ops:
        add_ncr(wo_serial.get(o["wo_id"]), o["op_id"], o["wo_id"], "weld_depth",
                "rework", "open", _SCN3, "WLD07_DRIFT", 10)

    # SCN-007: OPEN NCR on each closed-with-open-NCR work order.
    for w in closed_open_wos:
        add_ncr(w["serial_id"], None, w["wo_id"], "process_escape", "eng_review_open",
                "open", _SCN7, "MES_CLOSED_OPEN_NCR", 15)

    # Random fill to the target volume from first-pass failures.
    failed_ops = [op for op, ok in op_first_pass.items() if not ok]
    op_index = {r["op_id"]: r for r in ds.get("raw_mes_operation_executions").rows}
    fi = 0
    while len(rows) < n_total and failed_ops:
        o = op_index[failed_ops[fi % len(failed_ops)]]
        fi += 1
        s = wo_serial.get(o["wo_id"])
        disp = str(rng.choice(_DISPOSITIONS, p=disp_p))
        status = "open" if disp == "eng_review_open" else str(rng.choice(["open", "closed"], p=[0.3, 0.7]))
        add_ncr(s, o["op_id"], o["wo_id"], "out_of_tolerance", disp, status, None, None,
                int(rng.integers(1, 90)))
    ds.add("raw_qms_ncrs", rows, key=["ncr_id"], source_system=SS.QMS)

    _rework_events(ctx, ds, rows)
    _waivers(ctx, ds, rows)


def _rework_events(ctx: BuildContext, ds: Dataset, ncrs: list[dict]) -> None:
    rng = ctx.rng("raw_qms_rework_events")
    cost_total = int(ctx.scenario["scenarios"][_SCN2]["rework_scrap_cost_usd"])  # 148000
    scn2_ncrs = sorted((n for n in ncrs if n["scenario_id"] == _SCN2), key=lambda n: n["ncr_id"])
    n = ctx.n("rework_events")
    rows = []
    seq = 0
    # SCN-002 cost block: rework+scrap across the 7 ML-8821 NCRs sums to exactly 148000.
    k = len(scn2_ncrs)
    base = cost_total // k
    remainder = cost_total - base * k
    for i, nc in enumerate(scn2_ncrs):
        seq += 1
        amount = base + (1 if i < remainder else 0)
        is_scrap = nc["disposition"] == "scrap"
        rows.append({
            "rework_id": ids.rework_event(seq),
            "ncr_id": nc["ncr_id"],
            "serial_id": nc["serial_id"],
            "rework_hours": 0.0 if is_scrap else round(float(rng.uniform(2, 16)), 1),
            "rework_cost_usd": 0 if is_scrap else amount,
            "scrap_cost_usd": amount if is_scrap else 0,
            "event_date": nc["opened_date"],
            "scenario_id": _SCN2,
            "dq_defect_tag": "ML8821_POROSITY",
        })
    # remaining rework events on rework-disposition NCRs
    rework_ncrs = [n for n in ncrs if n["disposition"] in ("rework", "repair") and n["scenario_id"] != _SCN2]
    ri = 0
    while seq < n and rework_ncrs:
        nc = rework_ncrs[ri % len(rework_ncrs)]
        ri += 1
        seq += 1
        rows.append({
            "rework_id": ids.rework_event(seq),
            "ncr_id": nc["ncr_id"],
            "serial_id": nc["serial_id"],
            "rework_hours": round(float(rng.uniform(1, 12)), 1),
            "rework_cost_usd": int(rng.integers(200, 4000)),
            "scrap_cost_usd": 0,
            "event_date": nc["opened_date"],
            "scenario_id": None,
            "dq_defect_tag": None,
        })
    ds.add("raw_qms_rework_events", rows, key=["rework_id"], source_system=SS.QMS)


def _waivers(ctx: BuildContext, ds: Dataset, ncrs: list[dict]) -> None:
    rng = ctx.rng("raw_qms_waivers")
    use_as_is = [n for n in ncrs if n["disposition"] == "use_as_is"]
    n = ctx.n("waivers")
    rows = []
    for i in range(n):
        nc = use_as_is[i % len(use_as_is)] if use_as_is else None
        approved = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
        rows.append({
            "waiver_id": ids.waiver(i + 1),
            "ncr_id": nc["ncr_id"] if nc else None,
            "serial_id": nc["serial_id"] if nc else None,
            "kind": "use_as_is",
            "approved_date": approved.isoformat(),
            "approver_team": "Engineering",
            "scenario_id": None,
        })
    ds.add("raw_qms_waivers", rows, key=["waiver_id"], source_system=SS.QMS)
