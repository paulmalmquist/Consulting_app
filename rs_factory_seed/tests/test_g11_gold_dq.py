"""g11 tests: gold frames reconcile to their source artifacts, and data_quality_findings are
exact, explainable, and scenario-tagged. The named-scenario anchors must survive aggregation:
SCN-001 open NCRs (4) + missing-signoff serials (2), SCN-002 cost ($148K), SCN-004 FPY
(0.78/0.91), SCN-005 anomaly match (consumed from canonical feature windows)."""

import json
from collections import defaultdict

from rs_factory_seed.cli import build_dataset

_SCN1 = "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"
_SCN2 = "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"
_SCN4 = "SCN-004-REV-C-YIELD-IMPROVEMENT"
_SCN5 = "SCN-005-HOTFIRE-ANOMALY-SIMILARITY"
_OPEN = ("open", "eng_review_open")


# --- gold frames exist + reconcile to source --------------------------------
def test_gold_frames_present():
    _ctx, ds = build_dataset("small")
    for t in ("gold_vehicle_launch_readiness", "gold_serial_part_readiness",
              "gold_work_order_exceptions", "gold_cost_of_poor_quality",
              "gold_test_anomaly_review", "gold_ai_action_audit", "data_quality_findings"):
        assert t in ds.tables, f"missing gold/dq table {t}"


def test_launch_readiness_reconciles_to_vehicles_and_predictions():
    _ctx, ds = build_dataset("small")
    gold = ds.get("gold_vehicle_launch_readiness").rows
    assert len(gold) == len(ds.get("dim_vehicle").rows)
    readiness_pred = {p["scored_entity_id"]: p["score"] for p in ds.get("fact_ml_prediction").rows
                      if p["model_key"] == "readiness"}
    for r in gold:
        assert r["readiness_score"] == readiness_pred.get(r["vehicle_id"])


def test_serial_readiness_row_per_serial_and_inspection_counts_match():
    _ctx, ds = build_dataset("small")
    gold = ds.get("gold_serial_part_readiness").rows
    assert len(gold) == len(ds.get("dim_serialized_item").rows)
    # inspection totals reconcile to source.
    src_total = defaultdict(int)
    for r in ds.get("raw_qms_inspection_results").rows:
        src_total[r["serial_id"]] += 1
    for g in gold:
        assert g["inspection_count"] == src_total.get(g["serial_id"], 0)


def test_work_order_exceptions_are_real_exceptions():
    _ctx, ds = build_dataset("small")
    for g in ds.get("gold_work_order_exceptions").rows:
        assert g["closed_with_open_ncr"] or g["late_operations"] > 0 or g["dq_defect_tag"]


def test_anomaly_review_reconciles_and_preserves_scn005_match():
    ctx, ds = build_dataset("small")
    gold = {r["run_id"]: r for r in ds.get("gold_test_anomaly_review").rows}
    assert len(gold) == len(ds.get("raw_test_runs").rows)
    cfg = ctx.scenario["ml"]["scn005_match"]
    target, expected = cfg["target_run"], cfg["expected_match_run"]
    # the gold anomaly-review row for 00088 carries the g10 anomaly prediction whose nearest
    # match (consumed from feature windows) is 00041 — never recomputed here.
    row = gold[target]
    pred = {p["prediction_id"]: p for p in ds.get("fact_ml_prediction").rows}[row["anomaly_prediction_id"]]
    assert pred["model_key"] == "test_anomaly_detector"
    assert pred["scenario_id"] == _SCN5
    assert row["nearest_match_run"] == expected
    assert row["anomaly_score"] == pred["score"]
    assert cfg["min_match_similarity"] <= row["anomaly_score"] < cfg["must_be_below"]


# --- named-scenario anchors survive aggregation -----------------------------
def test_scn001_open_ncrs_and_inconclusive_on_tr003():
    _ctx, ds = build_dataset("small")
    lr = {r["vehicle_id"]: r for r in ds.get("gold_vehicle_launch_readiness").rows}
    tr3 = lr["VEH-TR-003"]
    assert tr3["scenario_open_ncr_count"] == 4          # SCN-001 anchor
    assert tr3["status_hint"] == "yellow"
    assert tr3["scenario_id"] == _SCN1


def test_scn002_cost_of_poor_quality_reconciles_to_148k():
    _ctx, ds = build_dataset("small")
    # the SCN-002 scenario cost across gold rows equals the source rework/scrap tagged SCN-002.
    gold_scn2 = sum(r["scenario_cost_usd"] for r in ds.get("gold_cost_of_poor_quality").rows
                    if r["scenario_id"] == _SCN2)
    src_scn2 = sum(int(r["rework_cost_usd"]) + int(r["scrap_cost_usd"])
                   for r in ds.get("raw_qms_rework_events").rows if r.get("scenario_id") == _SCN2)
    assert gold_scn2 == src_scn2 == 148000


def test_scn004_fpy_holds_at_source():
    """FPY is derived from source ops + inspection first_pass, not invented in gold."""
    _ctx, ds = build_dataset("small")
    scn4_ops = {o["op_id"]: o for o in ds.get("raw_mes_operation_executions").rows
                if o.get("scenario_id") == _SCN4}
    op_first_pass = {}
    for r in ds.get("raw_qms_inspection_results").rows:
        if r["op_id"] in scn4_ops:
            op_first_pass.setdefault(r["op_id"], True)
            if not r.get("first_pass"):
                op_first_pass[r["op_id"]] = False
    by_rev = defaultdict(lambda: [0, 0])  # [first_pass, total]
    for opid, allfp in op_first_pass.items():
        rev = scn4_ops[opid]["op_revision"]
        by_rev[rev][1] += 1
        if allfp:
            by_rev[rev][0] += 1
    assert round(by_rev["B"][0] / by_rev["B"][1], 2) == 0.78
    assert round(by_rev["C"][0] / by_rev["C"][1], 2) == 0.91


# --- data_quality_findings --------------------------------------------------
def test_dq_missing_signoff_is_exactly_two_flight_critical_on_tr003():
    ctx, ds = build_dataset("small")
    parts = {p["part_id"]: p for p in ds.get("dim_part").rows}
    miss = [f for f in ds.get("data_quality_findings").rows
            if f["rule"] == "missing_inspection_signoff"]
    assert len(miss) == 2                               # SCN-001 anchor
    serials = {s["serial_id"]: s for s in ds.get("dim_serialized_item").rows}
    for f in miss:
        assert f["scenario_id"] == _SCN1
        s = serials[f["entity_id"]]
        assert s["vehicle_id"] == "VEH-TR-003"
        assert parts[s["part_id"]]["criticality"] == "flight_critical"
        assert f["detail"]                              # explainable


def test_dq_findings_are_explainable_and_reference_real_entities():
    _ctx, ds = build_dataset("small")
    findings = ds.get("data_quality_findings").rows
    assert findings, "expected some data-quality findings"
    for f in findings:
        assert f["rule"] and f["severity"] and f["detail"]
        assert f["entity_type"] and f["entity_id"]


def test_dq_wo_closed_with_open_ncr_are_genuinely_closed_with_open_ncrs():
    _ctx, ds = build_dataset("small")
    closed = {w["wo_id"] for w in ds.get("raw_mes_work_orders").rows
              if str(w.get("status")) in ("complete", "closed")}
    open_ncr_wos = {n["wo_id"] for n in ds.get("raw_qms_ncrs").rows
                    if str(n.get("status")) in _OPEN}
    for f in ds.get("data_quality_findings").rows:
        if f["rule"] == "wo_closed_with_open_ncr":
            assert f["entity_id"] in closed
            assert f["entity_id"] in open_ncr_wos


def test_dq_findings_deterministic_count():
    """Two builds yield the same findings (count + ids)."""
    _c1, ds1 = build_dataset("small")
    _c2, ds2 = build_dataset("small")
    a = [(f["finding_id"], f["rule"], f["entity_id"]) for f in ds1.get("data_quality_findings").rows]
    b = [(f["finding_id"], f["rule"], f["entity_id"]) for f in ds2.get("data_quality_findings").rows]
    assert a == b
