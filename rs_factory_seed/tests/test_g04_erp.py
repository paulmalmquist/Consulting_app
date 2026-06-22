import yaml
from pathlib import Path

from rs_factory_seed.cli import build_dataset

_CFG = Path(__file__).resolve().parents[1] / "rs_factory_seed" / "config" / "scenario_config.yaml"
_SCN2 = "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"


def _cfg():
    return yaml.safe_load(_CFG.read_text(encoding="utf-8"))["scenarios"][_SCN2]


def test_erp_foreign_keys_resolve():
    _ctx, ds = build_dataset("small")
    sup = {r["supplier_id"] for r in ds.get("dim_supplier").rows}
    pos = {r["po_id"] for r in ds.get("raw_erp_purchase_orders").rows}
    serials = {r["serial_id"] for r in ds.get("dim_serialized_item").rows}
    lots = {r["lot_id"] for r in ds.get("raw_erp_material_lots").rows}
    parts = {r["part_id"] for r in ds.get("dim_part").rows}

    assert {r["canonical_supplier_id"] for r in ds.get("raw_erp_suppliers").rows} <= sup
    assert {r["supplier_id"] for r in ds.get("raw_erp_purchase_orders").rows} <= sup
    assert {r["supplier_id"] for r in ds.get("raw_erp_material_lots").rows} <= sup
    assert {r["po_id"] for r in ds.get("raw_erp_material_lots").rows} <= pos
    assert {r["part_id"] for r in ds.get("dim_serialized_item").rows} <= parts
    assert {r["lot_id"] for r in ds.get("fact_material_consumption").rows} <= lots
    assert {r["serial_id"] for r in ds.get("fact_material_consumption").rows} <= serials


def test_erp_volumes():
    _ctx, ds = build_dataset("small")
    assert len(ds.get("raw_erp_purchase_orders").rows) == 800
    assert len(ds.get("raw_erp_material_lots").rows) == 350
    assert len(ds.get("dim_serialized_item").rows) == 2000
    assert len(ds.get("fact_material_consumption").rows) == 3000


def test_aerometals_three_names_dq_seed():
    _ctx, ds = build_dataset("small")
    aero = [r for r in ds.get("raw_erp_suppliers").rows
            if r["canonical_supplier_id"] == _aero_id(ds)]
    names = sorted(r["raw_name"] for r in aero)
    assert names == ["AEROMETALS LLC", "Aero Metals Inc", "AeroMetals"]


def _aero_id(ds):
    return next(r["supplier_id"] for r in ds.get("dim_supplier").rows
               if r["canonical_name"] == "AeroMetals")


def test_ml8821_golden_thread_counts_match_config():
    """SCN-002: exactly 38 serials consume ML-8821; exactly 3 are installed on TR-003."""
    cfg = _cfg()
    _ctx, ds = build_dataset("small")

    # lot exists, from AeroMetals
    lot = next(r for r in ds.get("raw_erp_material_lots").rows if r["lot_id"] == "ML-8821")
    assert lot["supplier_id"] == _aero_id(ds)
    assert lot["scenario_id"] == _SCN2

    # exactly N distinct serials consume ML-8821
    consuming = {r["serial_id"] for r in ds.get("fact_material_consumption").rows
                 if r["lot_id"] == "ML-8821"}
    assert len(consuming) == cfg["serials_using_lot"] == 38

    # exactly M of those are installed on VEH-TR-003
    serial_vehicle = {r["serial_id"]: r["vehicle_id"] for r in ds.get("dim_serialized_item").rows}
    on_tr003 = [s for s in consuming if serial_vehicle.get(s) == "VEH-TR-003"]
    assert len(on_tr003) == cfg["serials_installed_on_tr003"] == 3

    # those serials carry the scenario tag (lineage)
    tagged = {r["serial_id"] for r in ds.get("dim_serialized_item").rows if r["scenario_id"] == _SCN2}
    assert consuming == tagged
