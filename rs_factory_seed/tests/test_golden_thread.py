"""Golden-thread tests. The two anchors that the most tables touch — VEH-TR-003 and
material lot ML-8821 — must remain consistent across every generator as the scenario web
grows. The quantitative numbers live ONLY in scenario_config (single source); these tests
fail if any generator drifts from it (e.g. ERP says 37 serials while config says 38).

As g04/g05/g06... land, extend these assertions to the new tables (serials, work orders,
operations, NCRs, blockers, telemetry)."""

import yaml
from pathlib import Path

from rs_factory_seed.cli import build_dataset

_CFG = Path(__file__).resolve().parents[1] / "rs_factory_seed" / "config" / "scenario_config.yaml"


def _scenario_cfg():
    return yaml.safe_load(_CFG.read_text(encoding="utf-8"))


def test_scenario_config_is_single_source_of_truth_for_ml8821():
    cfg = _scenario_cfg()
    s = cfg["scenarios"]["SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"]
    # These are the numbers every downstream generator must consume (not reinvent).
    assert s["material_lot"] == "ML-8821"
    assert s["supplier_name"] == "AeroMetals"
    assert s["serials_using_lot"] == 38
    assert s["serials_failed_inspection"] == 7
    assert s["serials_installed_on_tr003"] == 3
    assert s["rework_scrap_cost_usd"] == 148000


def test_veh_tr003_present_in_master_data():
    _ctx, ds = build_dataset("small")
    vehicles = {r["vehicle_id"] for r in ds.get("dim_vehicle").rows}
    assert "VEH-TR-003" in vehicles
    v = next(r for r in ds.get("dim_vehicle").rows if r["vehicle_id"] == "VEH-TR-003")
    assert v["scenario_id"] == "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"


def test_aerometals_supplier_present_for_ml8821_thread():
    _ctx, ds = build_dataset("small")
    suppliers = [r for r in ds.get("dim_supplier").rows if r["canonical_name"] == "AeroMetals"]
    assert len(suppliers) == 1
    # ML-8821 lot + 38/7/3 serial assertions get added here once g04 ERP lands.
