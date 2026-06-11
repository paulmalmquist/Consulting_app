"""g04 — ERP materials, serialized items, and the ML-8821 golden thread (convo §4 Phase 3).

Builds suppliers (with intentional duplicate-name variants), POs, material lots, serialized
items, genealogy, and material consumption. The SCN-002 numbers come ONLY from
scenario_config (single source of truth): lot ML-8821 (from AeroMetals) is consumed by
EXACTLY `serials_using_lot` serialized items, of which EXACTLY `serials_installed_on_tr003`
are installed on VEH-TR-003. Drift here (37 vs 38) is caught by the golden-thread test.
"""

from __future__ import annotations

import datetime as _dt

from .. import ids
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import SourceSystem as SS

_YEAR = 2026
_BUILD_STATUS = ["in_process", "complete", "installed", "scrapped"]
_MATERIALS = ["weld_wire", "titanium_plate", "aluminum_billet", "composite_ply",
              "seal_ring", "fastener_set", "sensor_module"]
_SCN2 = "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"


def run(ctx: BuildContext, ds: Dataset) -> None:
    _suppliers_raw(ctx, ds)
    _purchase_orders(ctx, ds)
    _material_lots(ctx, ds)
    _serialized_items(ctx, ds)
    _genealogy(ctx, ds)
    _material_consumption(ctx, ds)


def _suppliers_raw(ctx: BuildContext, ds: Dataset) -> None:
    """Raw ERP supplier records with duplicate-name variants (DQ: same supplier, many names)."""
    rng = ctx.rng("raw_erp_suppliers")
    dup_rate = ctx.scenario["rates"]["material_problems"]["supplier_name_duplicate"]
    aerometals = ctx.scenario["anchors"]["aerometals_supplier_name"]
    suppliers = ds.get("dim_supplier").rows
    rows = []
    seq = 0
    for s in sorted(suppliers, key=lambda r: r["supplier_id"]):
        name = s["canonical_name"]
        if name == aerometals:
            variants = [aerometals, "Aero Metals Inc", "AEROMETALS LLC"]   # DQ: three names
        elif rng.random() < dup_rate:
            variants = [name, name.upper()]
        else:
            variants = [name]
        for v in variants:
            seq += 1
            rows.append({
                "raw_supplier_id": ids.raw_supplier(seq),
                "raw_name": v,
                "canonical_supplier_id": s["supplier_id"],
                "scenario_id": _SCN2 if name == aerometals else None,
            })
    ds.add("raw_erp_suppliers", rows, key=["raw_supplier_id"], source_system=SS.ERP)


def _purchase_orders(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_erp_purchase_orders")
    sup_ids = [r["supplier_id"] for r in ds.get("dim_supplier").rows]
    n = ctx.n("purchase_orders")
    rows = []
    for i in range(n):
        od = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
        rows.append({
            "po_id": ids.purchase_order(_YEAR, i + 1),
            "supplier_id": sup_ids[int(rng.integers(0, len(sup_ids)))],
            "order_date": od.isoformat(),
            "status": str(rng.choice(["open", "received", "closed"], p=[0.2, 0.3, 0.5])),
            "scenario_id": None,
        })
    ds.add("raw_erp_purchase_orders", rows, key=["po_id"], source_system=SS.ERP)


def _material_lots(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_erp_material_lots")
    sup_by_name = {r["canonical_name"]: r["supplier_id"] for r in ds.get("dim_supplier").rows}
    po_ids = [r["po_id"] for r in ds.get("raw_erp_purchase_orders").rows]
    n = ctx.n("material_lots")
    miss_cert = ctx.scenario["rates"]["material_problems"]["missing_certificate"]
    before_appr = ctx.scenario["rates"]["material_problems"]["lot_used_before_approval"]
    aerometals = ctx.scenario["anchors"]["aerometals_supplier_name"]
    bad_lot = ctx.scenario["anchors"]["bad_material_lot"]   # ML-8821

    rows = []
    for i in range(1, n):   # leave room; anchor added explicitly
        recv = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
        rows.append({
            "lot_id": ids.material_lot(i),
            "supplier_id": list(sup_by_name.values())[int(rng.integers(0, len(sup_by_name)))],
            "po_id": po_ids[int(rng.integers(0, len(po_ids)))],
            "material": str(rng.choice(_MATERIALS)),
            "heat_number": f"HT-{int(rng.integers(10000, 99999))}",
            "cert_present": bool(rng.random() > miss_cert),
            "received_date": recv.isoformat(),
            "approval_status": "approved" if rng.random() > before_appr else "pending",
            "scenario_id": None,
            "dq_defect_tag": None,
        })
    # anchor lot ML-8821 (AeroMetals, weld_wire) — SCN-002
    rows.append({
        "lot_id": bad_lot,
        "supplier_id": sup_by_name[aerometals],
        "po_id": po_ids[0],
        "material": "weld_wire",
        "heat_number": "HT-88210",
        "cert_present": True,
        "received_date": _dt.date(2026, 3, 12).isoformat(),
        "approval_status": "approved",
        "scenario_id": _SCN2,
        "dq_defect_tag": "ML8821_POROSITY",
    })
    ds.add("raw_erp_material_lots", rows, key=["lot_id"], source_system=SS.ERP)


def _serialized_items(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("dim_serialized_item")
    parts = ds.get("dim_part").rows
    released = {r["part_id"]: r["revision_id"] for r in ds.get("dim_part_revision").rows
               if r["status"] == "released"}
    vehicles = [r["vehicle_id"] for r in ds.get("dim_vehicle").rows]
    blocked = ctx.scenario["anchors"]["blocked_vehicle"]
    anchor_part = ids.part(ctx.scenario["anchors"]["valve_part_family"],
                           int(ctx.scenario["anchors"]["valve_part_seq"]))
    n = ctx.n("serialized_items")
    n_ml = int(ctx.scenario["scenarios"][_SCN2]["serials_using_lot"])             # 38
    n_tr003 = int(ctx.scenario["scenarios"][_SCN2]["serials_installed_on_tr003"])  # 3

    rows = []
    # First n_ml serials are the ML-8821 thread: valve part, flight-critical; exactly
    # n_tr003 of them are installed on VEH-TR-003.
    for i in range(n):
        seq = i + 1
        if i < n_ml:
            pid = anchor_part
            vehicle = blocked if i < n_tr003 else None
            status = "installed" if vehicle else "complete"
            scenario = _SCN2
        else:
            p = parts[int(rng.integers(0, len(parts)))]
            pid = p["part_id"]
            vehicle = vehicles[int(rng.integers(0, len(vehicles)))] if rng.random() < 0.4 else None
            status = "installed" if vehicle else str(rng.choice(_BUILD_STATUS, p=[0.4, 0.4, 0.0, 0.2]))
            scenario = None
        rows.append({
            "serial_id": ids.serial("SN", seq),
            "part_id": pid,
            "revision_id": released.get(pid),
            "vehicle_id": vehicle,
            "build_status": status,
            "scenario_id": scenario,
        })
    ds.add("dim_serialized_item", rows, key=["serial_id"], source_system=SS.ERP)


def _genealogy(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("fact_serial_genealogy")
    serials = [r["serial_id"] for r in ds.get("dim_serialized_item").rows]
    n = min(ctx.n("serial_genealogy"), len(serials) - 1)
    rows = []
    seen: set[tuple[int, int]] = set()
    attempts = 0
    while len(rows) < n and attempts < n * 20:
        attempts += 1
        a = int(rng.integers(0, len(serials) - 1))
        b = int(rng.integers(a + 1, len(serials)))   # parent idx < child idx -> acyclic
        if (a, b) in seen:
            continue
        seen.add((a, b))
        install = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
        rows.append({
            "genealogy_id": ids.genealogy(len(rows) + 1),
            "parent_serial_id": serials[a],
            "child_serial_id": serials[b],
            "install_date": install.isoformat(),
            "scenario_id": None,
        })
    ds.add("fact_serial_genealogy", rows, key=["genealogy_id"], source_system=SS.ERP)


def _material_consumption(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("fact_material_consumption")
    bad_lot = ctx.scenario["anchors"]["bad_material_lot"]
    n_ml = int(ctx.scenario["scenarios"][_SCN2]["serials_using_lot"])  # 38
    ml_serials = [r["serial_id"] for r in ds.get("dim_serialized_item").rows
                  if r["scenario_id"] == _SCN2]
    other_serials = [r["serial_id"] for r in ds.get("dim_serialized_item").rows
                     if r["scenario_id"] != _SCN2]
    other_lots = [r["lot_id"] for r in ds.get("raw_erp_material_lots").rows if r["lot_id"] != bad_lot]
    target = ctx.n("material_consumption")

    rows = []
    seq = 0
    # The ML-8821 thread: exactly n_ml consumption rows, lot -> the n_ml thread serials (1:1).
    for s in sorted(ml_serials):
        seq += 1
        consumed = ctx.start + _dt.timedelta(days=int(rng.integers(150, ctx.days_span())))
        rows.append({
            "consumption_id": ids.consumption(seq),
            "lot_id": bad_lot,
            "serial_id": s,
            "qty": int(rng.integers(1, 4)),
            "consumed_date": consumed.isoformat(),
            "scenario_id": _SCN2,
            "dq_defect_tag": "ML8821_POROSITY",
        })
    assert len(ml_serials) == n_ml, f"ML-8821 thread expected {n_ml} serials, got {len(ml_serials)}"
    # remaining consumption: other lots -> other serials
    while seq < target and other_serials and other_lots:
        seq += 1
        consumed = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
        rows.append({
            "consumption_id": ids.consumption(seq),
            "lot_id": other_lots[int(rng.integers(0, len(other_lots)))],
            "serial_id": other_serials[int(rng.integers(0, len(other_serials)))],
            "qty": int(rng.integers(1, 6)),
            "consumed_date": consumed.isoformat(),
            "scenario_id": None,
            "dq_defect_tag": None,
        })
    ds.add("fact_material_consumption", rows, key=["consumption_id"], source_system=SS.ERP)
