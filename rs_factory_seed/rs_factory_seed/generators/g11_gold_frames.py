"""g11 — gold read-model frames + data-quality findings (convo.md §8 gold tables, §13 screens).

This is the demo-readable closure: each gold frame is a TRACEABLE SUMMARY of g01-g10, not a new
source of truth. No new business logic, no new scenario numbers — gold values are aggregated from
the constructed rows and the named-scenario anchors. The five demo-screen primaries plus the AI
action audit, and (via dq.py) the data_quality_findings governance table.

Gold frames:
  gold_vehicle_launch_readiness  (Screen 1) <- dim_vehicle + ncrs + test_runs + ml_prediction(readiness)
  gold_serial_part_readiness     (Screen 2) <- dim_serialized_item + work_orders + ncrs + inspections
  gold_work_order_exceptions     (Screen 3) <- work_orders + operation_executions + ncrs
  gold_cost_of_poor_quality      (Screen 4) <- rework_events grouped by supplier/part-family
  gold_test_anomaly_review       (Screen 5) <- test_runs + limit_violations + ml_prediction(anomaly)
  gold_ai_action_audit                      <- ai_action_log + ml_prediction + human_feedback

SCN preservation: launch readiness for VEH-TR-003 reflects its 4 tagged open NCRs + 1 inconclusive
pressure test; cost-of-poor-quality for ML-8821 reconciles to $148K; the anomaly-review row for
00088 carries the g10 prediction whose similarity was consumed from g07 feature windows. None of
these are recomputed here — gold reads what the upstream generators already established.
"""

from __future__ import annotations

import json
from collections import defaultdict

from .. import dq
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import SourceSystem as SS

_SCN1 = "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"
_OPEN = ("open", "eng_review_open")


def run(ctx: BuildContext, ds: Dataset) -> None:
    _gold_vehicle_launch_readiness(ctx, ds)
    _gold_serial_part_readiness(ctx, ds)
    _gold_factory_throughput_daily(ctx, ds)
    _gold_quality_yield_daily(ctx, ds)
    _gold_supplier_material_risk(ctx, ds)
    _gold_work_order_exceptions(ctx, ds)
    _gold_daily_factory_report(ctx, ds)
    _gold_cost_of_poor_quality(ctx, ds)
    _gold_test_anomaly_review(ctx, ds)
    _gold_ai_action_audit(ctx, ds)
    dq.run(ctx, ds)


# --- Screen 1: launch readiness ---------------------------------------------
def _gold_vehicle_launch_readiness(ctx: BuildContext, ds: Dataset) -> None:
    vehicles = ds.get("dim_vehicle").rows
    serials_by_vehicle: dict[str, set] = defaultdict(set)
    for s in ds.get("dim_serialized_item").rows:
        serials_by_vehicle[s["vehicle_id"]].add(s["serial_id"])

    # open NCRs attributed to a vehicle via its serials; scenario-tagged opens counted separately.
    open_ncrs = [n for n in ds.get("raw_qms_ncrs").rows if str(n.get("status")) in _OPEN]
    inconclusive_tests = defaultdict(int)
    for r in ds.get("raw_test_runs").rows:
        if str(r.get("result")) == "inconclusive" and r.get("vehicle_id"):
            inconclusive_tests[r["vehicle_id"]] += 1

    readiness_pred = {p["scored_entity_id"]: p for p in ds.get("fact_ml_prediction").rows
                      if p["model_key"] == "readiness"}
    blocked_vehicle = ctx.scenario["anchors"]["blocked_vehicle"]
    missing_signoff = {
        blocked_vehicle: int(
            ctx.scenario["scenarios"][_SCN1]["flight_critical_serials_missing_signoff"]
        )
    }
    anchor_anomaly = ctx.scenario["anchors"]["hotfire_inconclusive_run"]
    unresolved_anomaly = {
        r["vehicle_id"]: 1
        for r in ds.get("raw_test_runs").rows
        if r["run_id"] == anchor_anomaly and r.get("result") == "inconclusive"
    }

    rows = []
    for v in vehicles:
        vid = v["vehicle_id"]
        vser = serials_by_vehicle.get(vid, set())
        tagged_open = sum(1 for n in open_ncrs
                          if n.get("scenario_id") == _SCN1 and n.get("serial_id") in vser)
        all_open = sum(1 for n in open_ncrs if n.get("serial_id") in vser)
        pred = readiness_pred.get(vid)
        rows.append({
            "vehicle_id": vid,
            "vehicle_name": v.get("name"),
            "target_launch_date": v.get("target_launch_date"),
            "status_hint": v.get("status_hint"),
            "open_ncr_count": all_open,
            "scenario_open_ncr_count": tagged_open,
            "inconclusive_test_count": inconclusive_tests.get(vid, 0),
            "unresolved_anomaly_count": unresolved_anomaly.get(vid, 0),
            "missing_inspection_signoff_count": missing_signoff.get(vid, 0),
            "readiness_score": pred["score"] if pred else None,
            "readiness_prediction_id": pred["prediction_id"] if pred else None,
            "scenario_id": v.get("scenario_id"),
        })
    ds.add("gold_vehicle_launch_readiness", rows, key=["vehicle_id"], source_system=SS.MASTER)


# --- Screen 2: serialized part readiness ------------------------------------
def _gold_serial_part_readiness(ctx: BuildContext, ds: Dataset) -> None:
    wo_by_serial = defaultdict(list)
    for w in ds.get("raw_mes_work_orders").rows:
        wo_by_serial[w.get("serial_id")].append(w)
    open_ncr_by_serial = defaultdict(int)
    for n in ds.get("raw_qms_ncrs").rows:
        if str(n.get("status")) in _OPEN:
            open_ncr_by_serial[n.get("serial_id")] += 1
    ins_by_serial = defaultdict(lambda: [0, 0])  # [total, first_pass]
    for r in ds.get("raw_qms_inspection_results").rows:
        agg = ins_by_serial[r.get("serial_id")]
        agg[0] += 1
        if r.get("first_pass"):
            agg[1] += 1

    rows = []
    for s in ds.get("dim_serialized_item").rows:
        sid = s["serial_id"]
        wos = wo_by_serial.get(sid, [])
        total, fp = ins_by_serial.get(sid, [0, 0])
        rows.append({
            "serial_id": sid,
            "part_id": s.get("part_id"),
            "revision_id": s.get("revision_id"),
            "vehicle_id": s.get("vehicle_id"),
            "build_status": s.get("build_status"),
            "work_order_count": len(wos),
            "open_ncr_count": open_ncr_by_serial.get(sid, 0),
            "inspection_count": total,
            "first_pass_count": fp,
            "scenario_id": s.get("scenario_id"),
        })
    ds.add("gold_serial_part_readiness", rows, key=["serial_id"], source_system=SS.MASTER)


def _gold_factory_throughput_daily(ctx: BuildContext, ds: Dataset) -> None:
    groups = defaultdict(lambda: {"completed": 0, "late": 0, "cycle": 0.0})
    for op in ds.get("raw_mes_operation_executions").rows:
        if op.get("op_status") != "complete" or not op.get("completed_at"):
            continue
        key = (op["completed_at"], op["work_center_id"])
        groups[key]["completed"] += 1
        groups[key]["late"] += int(bool(op.get("late")))
        groups[key]["cycle"] += float(op.get("cycle_time_min") or 0)
    rows = [{
        "day": day,
        "work_center_id": work_center,
        "completed_operations": values["completed"],
        "late_operations": values["late"],
        "avg_cycle_time_min": round(values["cycle"] / values["completed"], 2),
        "scenario_id": None,
    } for (day, work_center), values in sorted(groups.items())]
    ds.add("gold_factory_throughput_daily", rows, key=["day", "work_center_id"],
           source_system=SS.MASTER)


def _gold_quality_yield_daily(ctx: BuildContext, ds: Dataset) -> None:
    ops = {o["op_id"]: o for o in ds.get("raw_mes_operation_executions").rows}
    per_op = {}
    for result in ds.get("raw_qms_inspection_results").rows:
        per_op.setdefault(result["op_id"], bool(result.get("first_pass")))
        per_op[result["op_id"]] = per_op[result["op_id"]] and bool(result.get("first_pass"))
    groups = defaultdict(lambda: [0, 0])
    for op_id, passed in per_op.items():
        op = ops.get(op_id)
        if not op or not op.get("completed_at"):
            continue
        key = (op["completed_at"], op.get("work_center_id"), op.get("op_revision") or "CURRENT")
        groups[key][1] += 1
        groups[key][0] += int(passed)
    rows = [{
        "day": day,
        "work_center_id": work_center,
        "revision": revision,
        "first_pass_operations": counts[0],
        "inspected_operations": counts[1],
        "first_pass_yield": round(counts[0] / counts[1], 4),
        "scenario_id": "SCN-004-REV-C-YIELD-IMPROVEMENT" if revision in ("B", "C") else None,
    } for (day, work_center, revision), counts in sorted(groups.items())]
    ds.add("gold_quality_yield_daily", rows, key=["day", "work_center_id", "revision"],
           source_system=SS.MASTER)


def _gold_supplier_material_risk(ctx: BuildContext, ds: Dataset) -> None:
    supplier_name = {s["supplier_id"]: s["canonical_name"] for s in ds.get("dim_supplier").rows}
    predictions = {p["scored_entity_id"]: p for p in ds.get("fact_ml_prediction").rows
                   if p["model_key"] == "supplier_risk"}
    ncr_serials = {n["serial_id"] for n in ds.get("raw_qms_ncrs").rows if n.get("serial_id")}
    consumed = defaultdict(set)
    for event in ds.get("fact_material_consumption").rows:
        consumed[event["lot_id"]].add(event["serial_id"])
    rows = []
    for lot in ds.get("raw_erp_material_lots").rows:
        serials = consumed.get(lot["lot_id"], set())
        pred = predictions.get(lot["lot_id"])
        rows.append({
            "lot_id": lot["lot_id"],
            "supplier_id": lot["supplier_id"],
            "supplier_name": supplier_name.get(lot["supplier_id"]),
            "material": lot["material"],
            "serials_exposed": len(serials),
            "serials_with_ncr": len(serials & ncr_serials),
            "defect_rate": round(len(serials & ncr_serials) / len(serials), 4) if serials else 0.0,
            "risk_score": pred["score"] if pred else None,
            "scenario_id": lot.get("scenario_id"),
        })
    ds.add("gold_supplier_material_risk", rows, key=["lot_id"], source_system=SS.MASTER)


# --- Screen 3: work-order exceptions ----------------------------------------
def _gold_work_order_exceptions(ctx: BuildContext, ds: Dataset) -> None:
    ops_by_wo = defaultdict(lambda: [0, 0])  # [total_ops, late_ops]
    for o in ds.get("raw_mes_operation_executions").rows:
        agg = ops_by_wo[o.get("wo_id")]
        agg[0] += 1
        if o.get("late"):
            agg[1] += 1
    open_ncr_by_wo = defaultdict(int)
    for n in ds.get("raw_qms_ncrs").rows:
        if str(n.get("status")) in _OPEN:
            open_ncr_by_wo[n.get("wo_id")] += 1

    rows = []
    for w in ds.get("raw_mes_work_orders").rows:
        wid = w["wo_id"]
        total_ops, late_ops = ops_by_wo.get(wid, [0, 0])
        open_ncrs = open_ncr_by_wo.get(wid, 0)
        is_closed = str(w.get("status")) in ("complete", "closed")
        closed_with_open_ncr = is_closed and open_ncrs > 0
        # only rows that ARE an exception (closed-with-open-ncr, late ops, or a dq tag) make the frame.
        is_exception = closed_with_open_ncr or late_ops > 0 or bool(w.get("dq_defect_tag"))
        if not is_exception:
            continue
        rows.append({
            "wo_id": wid,
            "status": w.get("status"),
            "serial_id": w.get("serial_id"),
            "part_id": w.get("part_id"),
            "total_operations": total_ops,
            "late_operations": late_ops,
            "open_ncr_count": open_ncrs,
            "closed_with_open_ncr": closed_with_open_ncr,
            "dq_defect_tag": w.get("dq_defect_tag"),
            "scenario_id": w.get("scenario_id"),
        })
    ds.add("gold_work_order_exceptions", rows, key=["wo_id"], source_system=SS.MASTER)


def _gold_daily_factory_report(ctx: BuildContext, ds: Dataset) -> None:
    completed = sum(
        1 for op in ds.get("raw_mes_operation_executions").rows
        if op.get("op_status") == "complete" and op.get("completed_at") == ctx.as_of.isoformat()
    )
    open_blockers = [b for b in ds.get("fact_blocker").rows if b.get("status") == "open"]
    open_holds = [h for h in ds.get("raw_mes_hold_events").rows if not h.get("released_date")]
    test_anomalies = [
        r for r in ds.get("raw_test_runs").rows
        if r.get("result") in ("fail", "inconclusive")
    ]
    rows = [{
        "report_date": ctx.as_of.isoformat(),
        "completed_operations": completed,
        "open_blockers": len(open_blockers),
        "open_quality_holds": len(open_holds),
        "material_shortages": sum(1 for h in open_holds if h.get("reason") == "waiting_material"),
        "test_anomalies": len(test_anomalies),
        "recommended_followups": "; ".join(
            f"{b['owner_team']}: {b['recommended_action']} [{b['source_link']}]"
            for b in sorted(open_blockers, key=lambda x: (-x["age_days"], x["blocker_id"]))[:5]
        ),
        "source_links": "gold_factory_throughput_daily;fact_blocker;raw_mes_hold_events;"
        "gold_test_anomaly_review",
        "scenario_id": "SCN-008-DAILY-FACTORY-HANDOFF",
    }]
    ds.add("gold_daily_factory_report", rows, key=["report_date"], source_system=SS.MASTER)


# --- Screen 4: cost of poor quality -----------------------------------------
def _gold_cost_of_poor_quality(ctx: BuildContext, ds: Dataset) -> None:
    # rework/scrap cost grouped by (supplier, part_family) via the NCR -> serial -> part lineage.
    parts = {p["part_id"]: p for p in ds.get("dim_part").rows}
    serial_part = {s["serial_id"]: s.get("part_id") for s in ds.get("dim_serialized_item").rows}
    # serial -> supplier via material consumption -> lot -> supplier.
    lot_supplier = {l["lot_id"]: l.get("supplier_id") for l in ds.get("raw_erp_material_lots").rows}
    sup_name = {s["supplier_id"]: s.get("canonical_name") for s in ds.get("dim_supplier").rows}
    serial_supplier = {}
    for c in ds.get("fact_material_consumption").rows:
        sup = lot_supplier.get(c.get("lot_id"))
        if sup and c.get("serial_id") not in serial_supplier:
            serial_supplier[c["serial_id"]] = sup

    groups = defaultdict(lambda: {"rework_cost": 0, "scrap_cost": 0, "rework_hours": 0.0,
                                  "event_count": 0,
                                  # scenario cost is tracked SEPARATELY so the named-scenario figure
                                  # reconciles exactly to source (e.g. SCN-002 == $148K), never
                                  # inflated by untagged events that happen to share the group.
                                  "scenario_cost": defaultdict(int)})
    for r in ds.get("raw_qms_rework_events").rows:
        sid = r.get("serial_id")
        pid = serial_part.get(sid)
        fam = parts.get(pid, {}).get("part_family", "UNKNOWN")
        sup = serial_supplier.get(sid)
        name = sup_name.get(sup, "UNATTRIBUTED")
        cost = int(r.get("rework_cost_usd") or 0) + int(r.get("scrap_cost_usd") or 0)
        g = groups[(name, fam)]
        g["rework_cost"] += int(r.get("rework_cost_usd") or 0)
        g["scrap_cost"] += int(r.get("scrap_cost_usd") or 0)
        g["rework_hours"] += float(r.get("rework_hours") or 0)
        g["event_count"] += 1
        if r.get("scenario_id"):
            g["scenario_cost"][r["scenario_id"]] += cost

    rows = []
    for (name, fam), g in groups.items():
        # pick the scenario contributing the most tagged cost as the row's scenario_id, and
        # expose that scenario's exact cost separately for reconciliation.
        scn_costs = sorted(g["scenario_cost"].items(), key=lambda kv: (-kv[1], kv[0]))
        scenario_id = scn_costs[0][0] if scn_costs else None
        scenario_cost = scn_costs[0][1] if scn_costs else 0
        rows.append({
            "supplier_name": name,
            "part_family": fam,
            "rework_cost_usd": g["rework_cost"],
            "scrap_cost_usd": g["scrap_cost"],
            "cost_of_poor_quality_usd": g["rework_cost"] + g["scrap_cost"],
            "scenario_cost_usd": scenario_cost,
            "rework_hours": round(g["rework_hours"], 2),
            "event_count": g["event_count"],
            "scenario_id": scenario_id,
        })
    ds.add("gold_cost_of_poor_quality", rows, key=["supplier_name", "part_family"],
           source_system=SS.MASTER)


# --- Screen 5: test anomaly review ------------------------------------------
def _gold_test_anomaly_review(ctx: BuildContext, ds: Dataset) -> None:
    viol_by_run = defaultdict(int)
    for v in ds.get("raw_test_limit_violations").rows:
        viol_by_run[v.get("run_id")] += 1
    anomaly_pred = {p["scored_entity_id"]: p for p in ds.get("fact_ml_prediction").rows
                    if p["model_key"] == "test_anomaly_detector"}

    rows = []
    for r in ds.get("raw_test_runs").rows:
        rid = r["run_id"]
        pred = anomaly_pred.get(rid)
        match_run = None
        if pred:
            drivers = json.loads(pred["top_drivers_json"]).get("top_drivers", [])
            match_run = next((d.get("match_run") for d in drivers if d.get("match_run")), None)
        rows.append({
            "run_id": rid,
            "test_type": r.get("test_type"),
            "vehicle_id": r.get("vehicle_id"),
            "result": r.get("result"),
            "limit_violation_count": viol_by_run.get(rid, 0),
            "anomaly_score": pred["score"] if pred else None,
            "nearest_match_run": match_run,
            "anomaly_prediction_id": pred["prediction_id"] if pred else None,
            "scenario_id": r.get("scenario_id"),
        })
    ds.add("gold_test_anomaly_review", rows, key=["run_id"], source_system=SS.MASTER)


# --- AI action audit --------------------------------------------------------
def _gold_ai_action_audit(ctx: BuildContext, ds: Dataset) -> None:
    pred = {p["prediction_id"]: p for p in ds.get("fact_ml_prediction").rows}
    fb_by_pred = defaultdict(list)
    for f in ds.get("fact_human_feedback").rows:
        if f.get("prediction_id"):
            fb_by_pred[f["prediction_id"]].append(f["label"])

    rows = []
    for a in ds.get("fact_ai_action_log").rows:
        pid = a.get("prediction_id")
        p = pred.get(pid)
        labels = fb_by_pred.get(pid, [])
        rows.append({
            "ai_action_id": a["ai_action_id"],
            "action_type": a.get("action_type"),
            "model_key": a.get("model_key"),
            "prediction_id": pid,
            "surface": a.get("surface"),
            "has_model_version": bool(p and p.get("model_version_id")),
            "feedback_label": labels[0] if labels else None,
            "scenario_id": a.get("scenario_id"),
        })
    ds.add("gold_ai_action_audit", rows, key=["ai_action_id"], source_system=SS.MASTER)


__all__ = ["run"]
