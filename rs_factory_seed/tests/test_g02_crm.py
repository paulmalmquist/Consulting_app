from rs_factory_seed.cli import build_dataset


def _ids(ds, table, col):
    return {r[col] for r in ds.get(table).rows}


def test_crm_foreign_keys_resolve():
    _ctx, ds = build_dataset("small")
    customers = _ids(ds, "dim_customer", "customer_id")
    missions = _ids(ds, "raw_crm_missions", "mission_id")
    vehicles = _ids(ds, "dim_vehicle", "vehicle_id")

    assert {r["customer_id"] for r in ds.get("raw_crm_missions").rows} <= customers
    assert {r["mission_id"] for r in ds.get("raw_crm_payload_commitments").rows} <= missions
    assert {r["vehicle_id"] for r in ds.get("fact_vehicle_build_plan").rows} <= vehicles
    assert {r["mission_id"] for r in ds.get("fact_vehicle_build_plan").rows} <= missions
    assert {r["vehicle_id"] for r in ds.get("fact_program_milestone").rows} <= vehicles


def test_crm_volumes():
    _ctx, ds = build_dataset("small")
    assert len(ds.get("raw_crm_missions").rows) == 18
    assert len(ds.get("raw_crm_payload_commitments").rows) == 36
    assert len(ds.get("fact_vehicle_build_plan").rows) == 4   # one per vehicle
    assert len(ds.get("fact_program_milestone").rows) == 90


def test_tr003_build_plan_window_is_approaching():
    """SCN-001: TR-003's build plan target is near AS_OF (drives readiness urgency)."""
    _ctx, ds = build_dataset("small")
    bp = next(r for r in ds.get("fact_vehicle_build_plan").rows if r["vehicle_id"] == "VEH-TR-003")
    assert bp["scenario_id"] == "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"
    assert bp["target_complete_date"] == "2026-06-29"   # as_of(2026-06-08) + 21d
