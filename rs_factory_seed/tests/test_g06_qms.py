from collections import defaultdict

from rs_factory_seed.cli import build_dataset


def test_qms_foreign_keys_resolve():
    _ctx, ds = build_dataset("small")
    serials = {r["serial_id"] for r in ds.get("dim_serialized_item").rows}
    ops = {r["op_id"] for r in ds.get("raw_mes_operation_executions").rows}
    ncrs = {r["ncr_id"] for r in ds.get("raw_qms_ncrs").rows}

    ins = ds.get("raw_qms_inspection_results").rows
    assert {r["op_id"] for r in ins} <= ops
    assert {r["serial_id"] for r in ins if r["serial_id"]} <= serials
    ncr = ds.get("raw_qms_ncrs").rows
    assert {r["op_id"] for r in ncr if r["op_id"]} <= ops
    assert {r["serial_id"] for r in ncr if r["serial_id"]} <= serials
    assert {r["ncr_id"] for r in ds.get("raw_qms_rework_events").rows if r["ncr_id"]} <= ncrs
    assert {r["ncr_id"] for r in ds.get("raw_qms_waivers").rows if r["ncr_id"]} <= ncrs


def test_qms_volumes():
    _ctx, ds = build_dataset("small")
    assert len(ds.get("raw_qms_inspection_characteristics").rows) == 600
    assert len(ds.get("raw_qms_inspection_results").rows) == 25000
    assert len(ds.get("raw_qms_ncrs").rows) == 300
    assert len(ds.get("raw_qms_rework_events").rows) == 200
    assert len(ds.get("raw_qms_waivers").rows) == 80


def test_scn004_fpy_rev_b_78_rev_c_91_over_124_ops():
    ctx, ds = build_dataset("small")
    exp = ctx.scenario["scenarios"]["SCN-004-REV-C-YIELD-IMPROVEMENT"]
    # group valve inspection results by op; an op passes first-time if all in_tolerance
    by_op = defaultdict(list)
    op_rev = {r["op_id"]: r["op_revision"] for r in ds.get("raw_mes_operation_executions").rows}
    for r in ds.get("raw_qms_inspection_results").rows:
        if r["scenario_id"] == "SCN-004-REV-C-YIELD-IMPROVEMENT":
            by_op[r["op_id"]].append(r)
    rev_total = defaultdict(int)
    rev_pass = defaultdict(int)
    for op_id, results in by_op.items():
        rev = op_rev[op_id]
        rev_total[rev] += 1
        if all(x["in_tolerance"] for x in results):
            rev_pass[rev] += 1
    assert rev_total["B"] == exp["revision_operation_counts"]["B"] == 60
    assert rev_total["C"] == exp["revision_operation_counts"]["C"] == 64
    assert round(rev_pass["B"] / rev_total["B"], 2) == exp["rev_b_fpy"] == 0.78
    assert round(rev_pass["C"] / rev_total["C"], 2) == exp["rev_c_fpy"] == 0.91


def test_scn002_seven_ml8821_failures_and_148k_cost():
    ctx, ds = build_dataset("small")
    exp = ctx.scenario["scenarios"]["SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"]
    scn2_ncrs = [r for r in ds.get("raw_qms_ncrs").rows
                 if r["scenario_id"] == "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"]
    assert len(scn2_ncrs) == exp["serials_failed_inspection"] == 7
    assert all(r["defect_code"] == "weld_porosity" for r in scn2_ncrs)
    # the 7 NCRs are on distinct ML-8821 serials
    ml_serials = {r["serial_id"] for r in ds.get("dim_serialized_item").rows
                  if r["scenario_id"] == "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"}
    assert {r["serial_id"] for r in scn2_ncrs} <= ml_serials
    # rework+scrap cost across the SCN-002 rework events == exactly $148K
    cost = sum(r["rework_cost_usd"] + r["scrap_cost_usd"] for r in ds.get("raw_qms_rework_events").rows
               if r["scenario_id"] == "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK")
    assert cost == exp["rework_scrap_cost_usd"] == 148000


def test_scn001_four_open_ncrs_on_tr003():
    ctx, ds = build_dataset("small")
    exp = ctx.scenario["scenarios"]["SCN-001-VEHICLE-TR003-READINESS-BLOCKED"]
    tr003_serials = {r["serial_id"] for r in ds.get("dim_serialized_item").rows
                     if r["vehicle_id"] == "VEH-TR-003"}
    scn1 = [r for r in ds.get("raw_qms_ncrs").rows
            if r["scenario_id"] == "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"]
    assert len(scn1) == exp["open_ncrs"] == 4
    assert all(r["status"] == "open" for r in scn1)
    assert all(r["serial_id"] in tr003_serials for r in scn1)


def test_scn003_weld_depth_ncrs_trace_to_wld07():
    _ctx, ds = build_dataset("small")
    scn3 = [r for r in ds.get("raw_qms_ncrs").rows
            if r["scenario_id"] == "SCN-003-MACHINE-WLD07-CALIBRATION-DRIFT"]
    assert scn3, "expected weld-depth NCRs from WLD-07 drift"
    assert all(r["defect_code"] == "weld_depth" for r in scn3)
    wld_ops = {r["op_id"] for r in ds.get("raw_mes_operation_executions").rows
               if r["dq_defect_tag"] == "WLD07_DRIFT"}
    assert {r["op_id"] for r in scn3} <= wld_ops
