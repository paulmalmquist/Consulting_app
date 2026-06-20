"""Scenario-anchor assertions for g01 master data. As later generators land, the
quantitative scenario numbers (38/7/3/$148K, 78%→91%/124 ops, 4 NCRs, similarity) get
asserted here against the generated SQLite via sql/sample_queries.sql."""

from rs_factory_seed.cli import build_dataset


def _one(ds, table, col, val):
    matches = [r for r in ds.get(table).rows if r[col] == val]
    assert len(matches) == 1, f"{table}.{col}={val} expected 1, got {len(matches)}"
    return matches[0]


def test_tr003_vehicle_anchor():
    _ctx, ds = build_dataset("small")
    v = _one(ds, "dim_vehicle", "vehicle_id", "VEH-TR-003")
    assert v["status_hint"] == "yellow"
    assert v["scenario_id"] == "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"


def test_valve_part_and_revisions():
    _ctx, ds = build_dataset("small")
    p = _one(ds, "dim_part", "part_id", "PART-ENG-VALVE-014")
    assert p["criticality"] == "flight_critical"
    revs = [r for r in ds.get("dim_part_revision").rows if r["part_id"] == "PART-ENG-VALVE-014"]
    rev_letters = sorted(r["rev"] for r in revs)
    assert rev_letters == ["A", "B", "C"]
    released = [r for r in revs if r["status"] == "released"]
    assert len(released) == 1 and released[0]["rev"] == "C"


def test_wld07_drift_anchor():
    _ctx, ds = build_dataset("small")
    m = _one(ds, "dim_machine", "machine_id", "WLD-07")
    assert m["machine_type"] == "welder"
    assert m["calibration_overdue"] is True
    assert m["drift_onset_date"] == "2026-05-20"
    assert m["scenario_id"] == "SCN-003-MACHINE-WLD07-CALIBRATION-DRIFT"


def test_ts03_noisy_stand():
    _ctx, ds = build_dataset("small")
    m = _one(ds, "dim_machine", "machine_id", "TS-03")
    assert m["machine_type"] == "test_stand"
    assert m["noisy_channel"] == "pressure"


def test_aerometals_supplier():
    _ctx, ds = build_dataset("small")
    matches = [r for r in ds.get("dim_supplier").rows if r["canonical_name"] == "AeroMetals"]
    assert len(matches) == 1
    assert matches[0]["scenario_id"] == "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"
