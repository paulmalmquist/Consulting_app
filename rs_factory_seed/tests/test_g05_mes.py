from collections import Counter

from rs_factory_seed.cli import build_dataset


def test_mes_foreign_keys_resolve():
    _ctx, ds = build_dataset("small")
    serials = {r["serial_id"] for r in ds.get("dim_serialized_item").rows}
    parts = {r["part_id"] for r in ds.get("dim_part").rows}
    wcs = {r["work_center_id"] for r in ds.get("dim_work_center").rows}
    machines = {r["machine_id"] for r in ds.get("dim_machine").rows}
    operators = {r["operator_id"] for r in ds.get("dim_operator").rows}
    wos = {r["wo_id"] for r in ds.get("raw_mes_work_orders").rows}
    ops = {r["op_id"] for r in ds.get("raw_mes_operation_executions").rows}

    wo = ds.get("raw_mes_work_orders").rows
    assert {r["serial_id"] for r in wo if r["serial_id"]} <= serials
    assert {r["part_id"] for r in wo} <= parts
    op = ds.get("raw_mes_operation_executions").rows
    assert {r["wo_id"] for r in op} <= wos
    assert {r["machine_id"] for r in op} <= machines
    assert {r["operator_id"] for r in op} <= operators
    assert {r["work_center_id"] for r in op} <= wcs
    assert {r["op_id"] for r in ds.get("raw_mes_labor_events").rows} <= ops
    assert {r["op_id"] for r in ds.get("raw_mes_machine_assignments").rows} <= ops
    assert {r["wo_id"] for r in ds.get("raw_mes_hold_events").rows} <= wos


def test_mes_volumes():
    _ctx, ds = build_dataset("small")
    assert len(ds.get("raw_mes_work_orders").rows) == 1000
    assert len(ds.get("raw_mes_operation_executions").rows) == 8000
    assert len(ds.get("raw_mes_labor_events").rows) == 12000
    assert len(ds.get("raw_mes_machine_assignments").rows) == 6000
    assert len(ds.get("raw_mes_hold_events").rows) == 800


def test_scn004_valve_block_uses_configured_revision_split():
    ctx, ds = build_dataset("small")
    expected = ctx.scenario["scenarios"]["SCN-004-REV-C-YIELD-IMPROVEMENT"]
    scn4 = [r for r in ds.get("raw_mes_operation_executions").rows
            if r["scenario_id"] == "SCN-004-REV-C-YIELD-IMPROVEMENT"]
    assert len(scn4) == expected["completed_operations"] == 124
    assert all(r["op_status"] == "complete" for r in scn4)
    counts = Counter(r["op_revision"] for r in scn4)
    assert counts == Counter(expected["revision_operation_counts"])
    for rev, count in expected["revision_operation_counts"].items():
        target = expected[f"rev_{rev.lower()}_fpy"]
        passing = round(target * count)
        assert round(passing / count, 2) == target


def test_scn007_status_mismatch_tags_present():
    _ctx, ds = build_dataset("small")
    wo = ds.get("raw_mes_work_orders").rows
    closed_open = [r for r in wo if r["dq_defect_tag"] == "MES_CLOSED_OPEN_NCR"]
    stale = [r for r in wo if r["dq_defect_tag"] == "MES_STALE_72H"]
    assert closed_open, "expected at least one closed-with-open-NCR candidate"
    assert stale, "expected at least one stale 72h+ work order"
    assert all(r["scenario_id"] == "SCN-007-WORKORDER-STATUS-MISMATCH" for r in closed_open + stale)


def test_wld07_drift_ops_tagged():
    _ctx, ds = build_dataset("small")
    drift_ops = [r for r in ds.get("raw_mes_operation_executions").rows
                 if r["dq_defect_tag"] == "WLD07_DRIFT"]
    assert drift_ops, "expected WLD-07 post-drift operations tagged"
    assert all(r["machine_id"] == "WLD-07" for r in drift_ops)
    assert all(r["completed_at"] >= "2026-05-20" for r in drift_ops)


def test_mes_status_distribution_is_within_sampling_tolerance():
    ctx, ds = build_dataset("small")
    rows = ds.get("raw_mes_work_orders").rows
    anchor_rows = [r for r in rows
                   if r["scenario_id"] == "SCN-004-REV-C-YIELD-IMPROVEMENT"]
    sampled = [r for r in rows if r not in anchor_rows]
    actual = Counter(r["status"] for r in sampled)
    expected = ctx.scenario["distributions"]["mes_status"]
    for status, proportion in expected.items():
        observed = actual[status] / len(sampled)
        assert abs(observed - proportion) <= 0.04, (
            f"{status} observed={observed:.3f} expected={proportion:.3f}"
        )


def test_mes_exception_tags_match_intended_records():
    _ctx, ds = build_dataset("small")
    work_orders = ds.get("raw_mes_work_orders").rows
    operations = ds.get("raw_mes_operation_executions").rows

    closed_open = [r for r in work_orders if r["dq_defect_tag"] == "MES_CLOSED_OPEN_NCR"]
    stale = [r for r in work_orders if r["dq_defect_tag"] == "MES_STALE_72H"]
    missing_cert = [r for r in operations if r["dq_defect_tag"] == "OP_MISSING_CERT"]
    skipped = [r for r in operations if r["dq_defect_tag"] == "OP_SKIPPED_NO_WAIVER"]

    assert all(r["status"] == "complete" and r["closed_date"] for r in closed_open)
    assert all(r["status"] in {"in_progress", "blocked"} and not r["closed_date"] for r in stale)
    assert missing_cert
    assert skipped


def test_mes_status_dates_are_consistent():
    ctx, ds = build_dataset("small")
    work_orders = ds.get("raw_mes_work_orders").rows
    operations = ds.get("raw_mes_operation_executions").rows

    assert all(r["closed_date"] for r in work_orders if r["status"] == "complete")
    assert all(not r["closed_date"] for r in work_orders if r["status"] != "complete")
    assert all(r["closed_date"] <= ctx.as_of.isoformat() for r in work_orders if r["closed_date"])

    assert all(r["completed_at"] for r in operations if r["op_status"] == "complete")
    assert all(not r["completed_at"] for r in operations if r["op_status"] != "complete")
    assert all(r["completed_at"] <= ctx.as_of.isoformat() for r in operations if r["completed_at"])
