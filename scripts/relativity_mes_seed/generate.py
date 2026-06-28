"""Build the synthetic MES/ERP/PLM dataset and the gold marts (deterministic, stdlib only).

`build_dataset()` returns a dict with two sections:
  - "source": raw rel_* rows keyed by table name (the synthetic source-system model)
  - "gold":   computed gold.rel_* mart rows keyed by mart name (what the dashboards serve)

Every row carries the honesty columns: synthetic, source_system, source_table, source_pk,
ingest_batch_id, as_of. Nothing here references real Relativity / Manufacturo program data.
"""

from __future__ import annotations

import random
from typing import Any

MASTER_SEED = 20260626
AS_OF = "2026-06-26T00:00:00Z"
INGEST_BATCH = "rel-mes-seed-v1"
ENV_ID = "telemetry-demo"
BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001"

PRODUCT_CODE = "LV-DEMO-R"  # fictional demo launch vehicle
PRODUCT_DESC = "Demo Launch Vehicle (synthetic)"

VEHICLES = [
    ("VEH-DEMO-001", "in_assembly"),
    ("VEH-DEMO-002", "in_test"),
    ("VEH-DEMO-003", "in_assembly"),
]

# Major subassembly families. Names are deliberately generic (no real engine/vehicle names).
SUBASSEMBLIES = [
    ("ENG", "Demo Main Engine"),
    ("TNK", "Propellant Tank Assembly"),
    ("AVB", "Avionics Bay"),
    ("STR", "Interstage Structure"),
    ("TPS", "Thermal Protection Section"),
    ("FED", "Propellant Feed System"),
]

WORK_CENTERS = ["WC-WELD", "WC-MACHINE", "WC-CLEAN", "WC-INTEG", "WC-NDE", "WC-TEST"]
DEFECT_CODES = [
    "witness-mark", "porosity", "torque-out-of-spec", "surface-finish",
    "dimensional-oob", "contamination", "weld-undercut",
]
OPERATORS = ["OP-1042", "OP-1080", "OP-1135", "OP-1177", "OP-1203"]

# The suspect lot installed on two vehicles (the where-used hero case).
SUSPECT_LOT = "LOT-7788"  # deliberately outside the auto-generated LOT-22xx range (no collision)
SUSPECT_PART = "PN-TPS-SEAL"

# ── honesty-column helper ──────────────────────────────────────────────────────


def _stamp(source_system: str, source_table: str, source_pk: str, row: dict[str, Any]) -> dict[str, Any]:
    row.update(
        synthetic=True,
        source_system=source_system,
        source_table=source_table,
        source_pk=source_pk,
        ingest_batch_id=INGEST_BATCH,
        as_of=AS_OF,
    )
    return row


def build_dataset(seed: int = MASTER_SEED) -> dict[str, Any]:
    rng = random.Random(seed)

    src: dict[str, list[dict[str, Any]]] = {
        "rel_mes_vehicle": [],
        "rel_mes_product": [],
        "rel_mes_part": [],
        "rel_mes_lot": [],
        "rel_mes_unit": [],
        "rel_mes_work_order": [],
        "rel_mes_operation_execution": [],
        "rel_mes_as_built_genealogy": [],
        "rel_mes_material_consumption": [],
        "rel_mes_inspection_order": [],
        "rel_mes_nonconformance": [],
        "rel_mes_disposition": [],
        "rel_erp_material_master": [],
        "rel_erp_production_order": [],
        "rel_erp_prod_order_cost": [],
        "rel_erp_cost_variance": [],
        "rel_erp_labor_actual": [],
        "rel_plm_part": [],
        "rel_plm_ebom": [],
        "rel_plm_ebom_line": [],
        "rel_plm_eco": [],
        "rel_plm_effectivity": [],
        "rel_xwalk_part_identity": [],
    }

    # ── MES product master (the vehicle product + each subassembly as a product) ──
    src["rel_mes_product"].append(_stamp("MES", "rel_mes_product", PRODUCT_CODE, {
        "product_code": PRODUCT_CODE, "description": PRODUCT_DESC, "revision": "A",
        "pedigree_class": "flight", "lifecycle_state": "active",
    }))
    for fam, fam_desc in SUBASSEMBLIES:
        src["rel_mes_product"].append(_stamp("MES", "rel_mes_product", f"SUB-{fam}", {
            "product_code": f"SUB-{fam}", "description": fam_desc, "revision": "A",
            "pedigree_class": "flight", "lifecycle_state": "active",
        }))

    # ── PLM as-designed: parts, EBOM, crosswalk ────────────────────────────────
    part_catalog: list[dict[str, Any]] = []  # working catalog used across MES/ERP/PLM
    for fam, fam_desc in SUBASSEMBLIES:
        n_parts = rng.randint(4, 7)
        for i in range(1, n_parts + 1):
            lot_tracked = rng.random() < 0.45
            part_no = f"PN-{fam}-{i:03d}"
            desc = f"{fam_desc} component {i}"
            part_catalog.append({
                "part_no": part_no, "family": fam, "desc": desc, "lot_tracked": lot_tracked,
            })
    # guarantee the suspect part exists and is lot-tracked under TPS
    part_catalog.append({"part_no": SUSPECT_PART, "family": "TPS",
                         "desc": "Thermal protection seal (suspect-lot demo)", "lot_tracked": True})

    plm_ebom_id = "EBOM-LV-DEMO-R-A"
    src["rel_plm_ebom"].append(_stamp("PLM", "rel_plm_ebom", plm_ebom_id, {
        "ebom_id": plm_ebom_id, "plm_part_no": f"PLM-{PRODUCT_CODE}", "revision": "A",
    }))
    for idx, p in enumerate(sorted(part_catalog, key=lambda x: x["part_no"]), start=1):
        plm_part_no = f"PLM-{p['part_no']}"
        erp_material_id = f"MAT-{p['part_no']}"
        src["rel_plm_part"].append(_stamp("PLM", "rel_plm_part", plm_part_no, {
            "plm_part_no": plm_part_no, "name": p["desc"], "lifecycle_state": "released",
        }))
        src["rel_plm_ebom_line"].append(_stamp("PLM", "rel_plm_ebom_line", f"{plm_ebom_id}:{idx}", {
            "ebom_id": plm_ebom_id, "line_no": idx, "child_plm_part_no": plm_part_no,
            "qty": rng.randint(1, 4), "reference_designator": f"RD-{p['family']}-{idx:02d}",
            "find_no": idx,
        }))
        src["rel_mes_part"].append(_stamp("MES", "rel_mes_part", p["part_no"], {
            "part_no": p["part_no"], "product_code": PRODUCT_CODE, "description": p["desc"],
            "uom": "EA", "serial_or_lot_tracked": "lot" if p["lot_tracked"] else "serial",
            "family": p["family"],
        }))
        src["rel_erp_material_master"].append(_stamp("ERP", "rel_erp_material_master", erp_material_id, {
            "material_id": erp_material_id, "description": p["desc"], "material_type": "ROH",
            "base_uom": "EA", "standard_cost": round(rng.uniform(180, 5200), 2),
            "valuation_class": "3000",
        }))
        src["rel_xwalk_part_identity"].append(_stamp("Gold", "rel_xwalk_part_identity", plm_part_no, {
            "plm_part_no": plm_part_no, "mes_part_no": p["part_no"], "product_code": PRODUCT_CODE,
            "erp_material_id": erp_material_id,
        }))

    # ── PLM engineering change orders + effectivity (as-designed governance) ─────
    # Two ECOs: one routine, one tied to the suspect-seal part (gives the genealogy a design link).
    eco_targets = [
        ("ECO-1001", "PLM-PN-STR-001", "B", "weld procedure update", "2026-05-01"),
        ("ECO-1002", f"PLM-{SUSPECT_PART}", "B", "thermal seal material change", "2026-05-20"),
    ]
    for eco_id, plm_part_no, new_rev, reason, eff_date in eco_targets:
        src["rel_plm_eco"].append(_stamp("PLM", "rel_plm_eco", eco_id, {
            "eco_id": eco_id, "ecr_ref": eco_id.replace("ECO", "ECR"), "plm_part_no": plm_part_no,
            "old_revision": "A", "new_revision": new_rev, "reason_code": reason,
            "ccb_approved_by": rng.choice(OPERATORS), "effectivity_date": eff_date,
            "effectivity_serial_range": "VEH-DEMO-002..VEH-DEMO-003", "state": "released",
        }))
        src["rel_plm_effectivity"].append(_stamp("PLM", "rel_plm_effectivity", f"EFF-{eco_id}", {
            "effectivity_id": f"EFF-{eco_id}", "plm_part_no": plm_part_no, "revision": new_rev,
            "effectivity_type": "serial", "from_value": "VEH-DEMO-002", "to_value": "VEH-DEMO-003",
            "eco_id": eco_id,
        }))

    std_cost = {m["material_id"]: m["standard_cost"] for m in src["rel_erp_material_master"]}

    # ── Lots (lot-tracked parts) ───────────────────────────────────────────────
    lot_parts = [p for p in part_catalog if p["lot_tracked"]]
    lot_index: dict[str, list[str]] = {}  # part_no -> [lot_no...]
    lot_counter = 2200
    for p in sorted(lot_parts, key=lambda x: x["part_no"]):
        lots_for_part = []
        for _ in range(rng.randint(1, 2)):
            lot_no = SUSPECT_LOT if (p["part_no"] == SUSPECT_PART and SUSPECT_LOT not in lot_index.get(p["part_no"], [])) else f"LOT-{lot_counter}"
            if lot_no != SUSPECT_LOT:
                lot_counter += 1
            src["rel_mes_lot"].append(_stamp("MES", "rel_mes_lot", lot_no, {
                "lot_no": lot_no, "part_no": p["part_no"], "qty": rng.randint(20, 200),
                "supplier_lot": f"SUP-{rng.randint(10000, 99999)}",
                "supplier_name": rng.choice(["Synthetic Aerospace Supply Co", "Demo Components Ltd",
                                             "Facsimile Metals Inc"]),
                "receipt_date": f"2026-0{rng.randint(1,5)}-{rng.randint(10,28)}",
            }))
            lots_for_part.append(lot_no)
        lot_index[p["part_no"]] = lots_for_part

    # ── Per-vehicle build: units, work orders, ops, consumption, genealogy ──────
    ncr_seq = 0
    op_exec_seq = 0
    genealogy_seq = 0
    consumption_seq = 0
    inspection_seq = 0

    # accumulators for gold
    vehicle_costs: dict[str, dict[str, float]] = {}

    for vehicle_serial, build_status in VEHICLES:
        veh_unit = f"SN-{vehicle_serial[-3:]}-VEH"
        src["rel_mes_vehicle"].append(_stamp("MES", "rel_mes_vehicle", vehicle_serial, {
            "vehicle_serial": vehicle_serial, "product_code": PRODUCT_CODE,
            "product_description": PRODUCT_DESC, "build_status": build_status,
            "unit_serial": veh_unit,
        }))
        src["rel_mes_unit"].append(_stamp("MES", "rel_mes_unit", veh_unit, {
            "unit_serial": veh_unit, "product_code": PRODUCT_CODE, "work_order_no": None,
            "parent_unit_serial": None, "build_status": build_status,
        }))
        vehicle_costs[vehicle_serial] = {"material": 0.0, "labor": 0.0, "overhead": 0.0,
                                         "rework": 0.0, "unallocated": 0.0}

        for fam, fam_desc in SUBASSEMBLIES:
            sub_unit = f"SN-{vehicle_serial[-3:]}-{fam}"
            wo = f"WO-{vehicle_serial[-3:]}-{fam}"
            mfg_order = f"MFG-{vehicle_serial[-3:]}-{fam}"
            src["rel_mes_unit"].append(_stamp("MES", "rel_mes_unit", sub_unit, {
                "unit_serial": sub_unit, "product_code": PRODUCT_CODE, "work_order_no": wo,
                "parent_unit_serial": veh_unit, "build_status": "installed",
            }))
            src["rel_mes_work_order"].append(_stamp("MES", "rel_mes_work_order", wo, {
                "work_order_no": wo, "prod_order_no": mfg_order, "vehicle_serial": vehicle_serial,
                "subassembly": fam, "subassembly_name": fam_desc, "status": "complete",
                "want_date": "2026-06-15",
            }))
            # vehicle <- subassembly genealogy edge
            genealogy_seq += 1
            src["rel_mes_as_built_genealogy"].append(_stamp(
                "MES", "rel_mes_as_built_genealogy", f"GE-{genealogy_seq:05d}", {
                    "edge_id": f"GE-{genealogy_seq:05d}", "vehicle_serial": vehicle_serial,
                    "parent_node_id": veh_unit, "child_node_id": sub_unit, "child_type": "serial",
                    "part_no": None, "lot_no": None, "unit_serial": sub_unit,
                    "reference_designator": f"RD-{fam}", "work_order_no": wo,
                    "installed_at": "2026-06-10", "installed_by": rng.choice(OPERATORS),
                }))

            # operations routing for this work order. The suspect part is excluded from random
            # consumption so the suspect lot lands on exactly the two vehicles we inject below.
            fam_parts = [p for p in part_catalog if p["family"] == fam and p["part_no"] != SUSPECT_PART]
            n_ops = rng.randint(6, 12)
            for seq in range(1, n_ops + 1):
                op_exec_seq += 1
                op_id = f"OP-{fam}-{seq:02d}"
                wc = rng.choice(WORK_CENTERS)
                std_min = rng.randint(20, 240)
                actual_min = max(5, int(std_min * rng.uniform(0.85, 1.4)))
                result = "pass"
                src["rel_mes_operation_execution"].append(_stamp(
                    "MES", "rel_mes_operation_execution", f"OE-{op_exec_seq:05d}", {
                        "exec_id": f"OE-{op_exec_seq:05d}", "work_order_no": wo, "operation_id": op_id,
                        "seq": seq, "work_center": wc, "unit_serial": sub_unit,
                        "operator_id": rng.choice(OPERATORS), "std_minutes": std_min,
                        "actual_minutes": actual_min, "result": result,
                    }))
                vehicle_costs[vehicle_serial]["labor"] += round(actual_min / 60.0 * 95.0, 2)

                # material consumption on a couple of ops
                if fam_parts and rng.random() < 0.5:
                    p = rng.choice(fam_parts)
                    lot_no = None
                    if p["lot_tracked"]:
                        lot_no = rng.choice(lot_index.get(p["part_no"], [None]))
                    consumption_seq += 1
                    qty = rng.randint(1, 4)
                    src["rel_mes_material_consumption"].append(_stamp(
                        "MES", "rel_mes_material_consumption", f"MC-{consumption_seq:05d}", {
                            "consumption_id": f"MC-{consumption_seq:05d}", "work_order_no": wo,
                            "operation_id": op_id, "vehicle_serial": vehicle_serial,
                            "part_no": p["part_no"], "lot_no": lot_no, "qty": qty,
                            "itag": f"ITAG-{rng.randint(100000,999999)}",
                        }))
                    mat_cost = round(std_cost.get(f"MAT-{p['part_no']}", 250.0) * qty, 2)
                    vehicle_costs[vehicle_serial]["material"] += mat_cost
                    # genealogy edge for the consumed part/lot
                    genealogy_seq += 1
                    src["rel_mes_as_built_genealogy"].append(_stamp(
                        "MES", "rel_mes_as_built_genealogy", f"GE-{genealogy_seq:05d}", {
                            "edge_id": f"GE-{genealogy_seq:05d}", "vehicle_serial": vehicle_serial,
                            "parent_node_id": sub_unit,
                            "child_node_id": lot_no or p["part_no"],
                            "child_type": "lot" if lot_no else "part",
                            "part_no": p["part_no"], "lot_no": lot_no, "unit_serial": None,
                            "reference_designator": f"RD-{fam}-{seq:02d}", "work_order_no": wo,
                            "installed_at": "2026-06-11", "installed_by": rng.choice(OPERATORS),
                        }))

                # inspections on NDE/test centers
                if wc in ("WC-NDE", "WC-TEST") and rng.random() < 0.6:
                    inspection_seq += 1
                    insp_result = "pass" if rng.random() < 0.85 else "fail"
                    src["rel_mes_inspection_order"].append(_stamp(
                        "MES", "rel_mes_inspection_order", f"INSP-{inspection_seq:05d}", {
                            "inspection_id": f"INSP-{inspection_seq:05d}", "work_order_no": wo,
                            "operation_id": op_id, "unit_serial_or_lot": sub_unit,
                            "vehicle_serial": vehicle_serial, "inspector_id": rng.choice(OPERATORS),
                            "result": insp_result,
                        }))

            # ERP order + costs for this work order
            mat = round(sum(c["qty"] * std_cost.get(f"MAT-{c['part_no']}", 250.0)
                            for c in src["rel_mes_material_consumption"]
                            if c["work_order_no"] == wo), 2)
            lab = round(sum(oe["actual_minutes"] / 60.0 * 95.0
                            for oe in src["rel_mes_operation_execution"]
                            if oe["work_order_no"] == wo), 2)
            ovh = round(lab * 0.18, 2)
            # overhead accrues PER WORK ORDER (matches the gold rollup's per-WO ovh exactly), so the
            # only gap between the vehicle 'actual' and the summed rollup is the unallocated residual.
            vehicle_costs[vehicle_serial]["overhead"] += ovh
            std_estimate = round((mat + lab + ovh) * rng.uniform(0.9, 1.0), 2)
            src["rel_erp_production_order"].append(_stamp(
                "ERP", "rel_erp_production_order", mfg_order, {
                    "mfg_order_no": mfg_order, "work_order_no": wo, "vehicle_serial": vehicle_serial,
                    "material_id": f"MAT-SUB-{fam}", "planned_qty": 1,
                    "std_cost_estimate": std_estimate, "status": "TECO",
                }))
            for elem, amt in (("material", mat), ("labor", lab), ("overhead", ovh)):
                src["rel_erp_prod_order_cost"].append(_stamp(
                    "ERP", "rel_erp_prod_order_cost", f"{mfg_order}:{elem}", {
                        "cost_id": f"{mfg_order}:{elem}", "mfg_order_no": mfg_order,
                        "vehicle_serial": vehicle_serial, "cost_element": elem,
                        "debit_credit": "D", "amount": amt, "posting_date": "2026-06-16",
                    }))
            src["rel_erp_labor_actual"].append(_stamp(
                "ERP", "rel_erp_labor_actual", f"{mfg_order}:LAB", {
                    "labor_id": f"{mfg_order}:LAB", "mfg_order_no": mfg_order,
                    "vehicle_serial": vehicle_serial, "activity_type": "ASSY",
                    "hours": round(lab / 95.0, 1), "rate": 95.0, "amount": lab,
                }))

    # ── Suspect lot: install on EXACTLY two vehicles (the where-used hero case) ──
    for v in ("VEH-DEMO-001", "VEH-DEMO-002"):
        sub_unit = f"SN-{v[-3:]}-TPS"
        wo = f"WO-{v[-3:]}-TPS"
        consumption_seq += 1
        src["rel_mes_material_consumption"].append(_stamp(
            "MES", "rel_mes_material_consumption", f"MC-{consumption_seq:05d}", {
                "consumption_id": f"MC-{consumption_seq:05d}", "work_order_no": wo,
                "operation_id": "OP-TPS-04", "vehicle_serial": v, "part_no": SUSPECT_PART,
                "lot_no": SUSPECT_LOT, "qty": 2, "itag": f"ITAG-{rng.randint(100000,999999)}",
            }))
        vehicle_costs[v]["material"] += round(std_cost.get(f"MAT-{SUSPECT_PART}", 800.0) * 2, 2)
        genealogy_seq += 1
        src["rel_mes_as_built_genealogy"].append(_stamp(
            "MES", "rel_mes_as_built_genealogy", f"GE-{genealogy_seq:05d}", {
                "edge_id": f"GE-{genealogy_seq:05d}", "vehicle_serial": v,
                "parent_node_id": sub_unit, "child_node_id": SUSPECT_LOT, "child_type": "lot",
                "part_no": SUSPECT_PART, "lot_no": SUSPECT_LOT, "unit_serial": None,
                "reference_designator": "RD-TPS-SEAL", "work_order_no": wo,
                "installed_at": "2026-06-11", "installed_by": rng.choice(OPERATORS),
            }))

    # ── Targeted NCRs (the demo guarantees) + a few random minors ──────────────
    def add_ncr(ncr_id, vehicle, unit_or_lot, wo, op, defect, severity, status, part_no=None,
                lot_no=None, work_center="WC-NDE"):
        src["rel_mes_nonconformance"].append(_stamp("MES", "rel_mes_nonconformance", ncr_id, {
            "ncr_id": ncr_id, "vehicle_serial": vehicle, "unit_serial_or_lot": unit_or_lot,
            "work_order_no": wo, "operation_id": op, "part_no": part_no, "lot_no": lot_no,
            "work_center": work_center, "defect_code": defect, "severity": severity,
            "status": status, "opened_ts": "2026-06-12T09:00:00Z",
            "closed_ts": None if status == "open" else "2026-06-18T15:00:00Z",
        }))

    # NCR-0001 — open, major, suspect lot, drives where-used across two vehicles
    add_ncr("NCR-0001", "VEH-DEMO-001", SUSPECT_LOT, "WO-001-TPS", "OP-TPS-04",
            "witness-mark", "major", "open", part_no=SUSPECT_PART, lot_no=SUSPECT_LOT)
    # NCR-0002 — closed with rework disposition (labor variance driver)
    add_ncr("NCR-0002", "VEH-DEMO-002", "SN-002-STR", "WO-002-STR", "OP-STR-03",
            "weld-undercut", "major", "closed", work_center="WC-WELD")
    # NCR-0003 — use-as-is disposition
    add_ncr("NCR-0003", "VEH-DEMO-003", "SN-003-AVB", "WO-003-AVB", "OP-AVB-02",
            "surface-finish", "minor", "closed", work_center="WC-INTEG")
    # a few random minors for realism
    for k in range(4, 8):
        v = rng.choice(VEHICLES)[0]
        fam = rng.choice(SUBASSEMBLIES)[0]
        add_ncr(f"NCR-{k:04d}", v, f"SN-{v[-3:]}-{fam}", f"WO-{v[-3:]}-{fam}",
                f"OP-{fam}-{rng.randint(1,9):02d}", rng.choice(DEFECT_CODES), "minor", "closed")

    # dispositions
    disp_map = {
        "NCR-0001": "rework",   # pending close; disposition decided, awaiting rework
        "NCR-0002": "rework",
        "NCR-0003": "use-as-is",
    }
    disp_by_id: dict[str, str] = {}
    for ncr in src["rel_mes_nonconformance"]:
        dtype = disp_map.get(ncr["ncr_id"], rng.choice(["use-as-is", "rework", "repair"]))
        disp_by_id[ncr["ncr_id"]] = dtype
        did = f"DISP-{ncr['ncr_id'][-4:]}"
        src["rel_mes_disposition"].append(_stamp("MES", "rel_mes_disposition", did, {
            "disposition_id": did, "ncr_id": ncr["ncr_id"], "disposition_type": dtype,
            "approved_by": rng.choice(OPERATORS),
            "approved_ts": None if ncr["status"] == "open" else "2026-06-17T12:00:00Z",
        }))

    # Rework cost per NCR (minutes, cost). The two hero NCRs are PLANTED constants (the story). The
    # emergent minors carry a small seed-varying rework cost when their disposition is rework/repair —
    # so the largest-NCR CONCENTRATION (NCR-0001's $4,200 over the total) is a stable pattern but a
    # seed-specific percentage, which is exactly what the multi-seed stability study should show.
    rework_est: dict[str, tuple[int, float]] = {"NCR-0001": (320, 4200.0), "NCR-0002": (210, 2650.0)}
    for ncr in src["rel_mes_nonconformance"]:
        nid = ncr["ncr_id"]
        if nid in rework_est:
            continue
        if disp_by_id.get(nid) in ("rework", "repair"):
            cost = round(rng.uniform(150.0, 1200.0), 2)
            rework_est[nid] = (int(cost / 13), cost)

    # rework cost attribution (labor/material variance drivers)
    rework_cost = {"VEH-DEMO-001": 0.0, "VEH-DEMO-002": 0.0, "VEH-DEMO-003": 0.0}
    rework_cost["VEH-DEMO-001"] = 4200.0   # suspect-lot rework (material qty)
    rework_cost["VEH-DEMO-002"] = 2650.0   # weld rework (labor)
    for v in rework_cost:
        vehicle_costs[v]["rework"] = rework_cost[v]

    # Emit the rework cost as ERP source rows so the medallion's gold cost rollup is fully derivable
    # from source (no generator-only constant): cost_element='rework' on the affected mfg orders.
    for v, fam, amt in (("VEH-DEMO-001", "TPS", 4200.0), ("VEH-DEMO-002", "STR", 2650.0)):
        mfg_order = f"MFG-{v[-3:]}-{fam}"
        src["rel_erp_prod_order_cost"].append(_stamp(
            "ERP", "rel_erp_prod_order_cost", f"{mfg_order}:rework", {
                "cost_id": f"{mfg_order}:rework", "mfg_order_no": mfg_order, "vehicle_serial": v,
                "cost_element": "rework", "debit_credit": "D", "amount": amt,
                "posting_date": "2026-06-18",
            }))

    # Small UNALLOCATED cost (1–3% of direct cost): mix/routing settlement ERP posts but the MES
    # component rollup does not attribute to a work order. This makes the cost-overrun bridge reconcile
    # to ~97–99% with a real, source-traceable residual instead of being a pure accounting identity
    # (a single seed allocates everything; real ERP/MES data never does). Emitted as a cost ROW with
    # cost_element='unallocated' (no new column / no schema migration); it flows into the gold overview
    # actual but NOT into the per-work-order rollup, so analytics() recovers it as the bridge residual.
    for v, _status in VEHICLES:
        c = vehicle_costs[v]
        direct = c["material"] + c["labor"] + c["overhead"] + c["rework"]
        unalloc = round(direct * rng.uniform(0.01, 0.03), 2)
        c["unallocated"] = unalloc
        src["rel_erp_prod_order_cost"].append(_stamp(
            "ERP", "rel_erp_prod_order_cost", f"VEH-{v[-3:]}:unallocated", {
                "cost_id": f"VEH-{v[-3:]}:unallocated", "mfg_order_no": None, "vehicle_serial": v,
                "cost_element": "unallocated", "debit_credit": "D", "amount": unalloc,
                "posting_date": "2026-06-19",
            }))

    # ── GOLD marts ─────────────────────────────────────────────────────────────
    gold = _build_gold(src, vehicle_costs, rework_est)
    return {"source": src, "gold": gold}


def _build_gold(src, vehicle_costs, rework_est) -> dict[str, list[dict[str, Any]]]:
    ncrs = src["rel_mes_nonconformance"]
    disp_by_ncr = {d["ncr_id"]: d for d in src["rel_mes_disposition"]}
    genealogy = src["rel_mes_as_built_genealogy"]

    # suspect-lot where-used: vehicles touched by the suspect lot
    suspect_vehicles = sorted({g["vehicle_serial"] for g in genealogy if g.get("lot_no") == SUSPECT_LOT})

    # build_overview (one row per vehicle)
    overview = []
    for v, _status in VEHICLES:
        veh = next(x for x in src["rel_mes_vehicle"] if x["vehicle_serial"] == v)
        wos = [w for w in src["rel_mes_work_order"] if w["vehicle_serial"] == v]
        edges = [g for g in genealogy if g["vehicle_serial"] == v]
        comp = [g for g in edges if g["child_type"] in ("part", "lot")]
        v_ncrs = [n for n in ncrs if n["vehicle_serial"] == v]
        open_ncr = [n for n in v_ncrs if n["status"] == "open"]
        major_ncr = [n for n in v_ncrs if n["severity"] == "major"]
        suspect_lots = sorted({g["lot_no"] for g in edges if g.get("lot_no") == SUSPECT_LOT})
        c = vehicle_costs[v]
        # actual includes the unallocated mix/routing settlement; the per-WO rollup does not — that gap
        # is the bridge residual analytics() surfaces (source-traceable to the 'unallocated' ERP rows).
        actual = round(c["material"] + c["labor"] + c["overhead"] + c["rework"] + c.get("unallocated", 0.0), 2)
        planned = round((c["material"] + c["labor"] + c["overhead"]) * 0.97, 2)
        variance = round(actual - planned, 2)
        variance_pct = round(variance / planned * 100, 2) if planned else 0.0
        readiness = "blocked" if open_ncr else ("at_risk" if variance_pct > 6 else "on_track")
        overview.append(_stamp("Gold", "gold.rel_build_overview", v, {
            "vehicle_serial": v, "product_code": veh["product_code"], "build_status": veh["build_status"],
            "work_order_count": len(wos), "genealogy_edge_count": len(edges),
            "installed_component_count": len(comp), "open_ncr_count": len(open_ncr),
            "major_ncr_count": len(major_ncr), "suspect_lot_count": len(suspect_lots),
            "affected_by_suspect_lot": bool(suspect_lots),
            "planned_cost": planned, "actual_cost": actual, "variance_amount": variance,
            "variance_pct": variance_pct, "readiness_state": readiness,
            "source_tables": "rel_mes_vehicle, rel_mes_work_order, rel_mes_as_built_genealogy, "
                             "rel_mes_nonconformance, rel_erp_prod_order_cost, rel_erp_cost_variance",
        }))

    # as_built_genealogy gold (edges enriched with inspection/ncr/disposition)
    insp_by_unit = {}
    for i in src["rel_mes_inspection_order"]:
        insp_by_unit.setdefault(i["unit_serial_or_lot"], i["result"])
    ncr_by_node = {}
    for n in ncrs:
        ncr_by_node[n["unit_serial_or_lot"]] = n
    part_desc = {p["part_no"]: p["description"] for p in src["rel_mes_part"]}
    g_gold = []
    for g in genealogy:
        node = g["child_node_id"]
        ncr = ncr_by_node.get(node) or (ncr_by_node.get(g.get("lot_no")) if g.get("lot_no") else None)
        disp = disp_by_ncr.get(ncr["ncr_id"]) if ncr else None
        g_gold.append(_stamp("Gold", "gold.rel_as_built_genealogy", g["edge_id"], {
            "vehicle_serial": g["vehicle_serial"], "parent_node_id": g["parent_node_id"],
            "child_node_id": g["child_node_id"], "child_type": g["child_type"],
            "part_no": g.get("part_no"), "part_description": part_desc.get(g.get("part_no")),
            "lot_no": g.get("lot_no"), "unit_serial": g.get("unit_serial"),
            "reference_designator": g.get("reference_designator"),
            "install_operation_id": None, "work_order_no": g.get("work_order_no"),
            "installed_at": g.get("installed_at"), "installed_by": g.get("installed_by"),
            "inspection_result": insp_by_unit.get(node),
            "ncr_id": ncr["ncr_id"] if ncr else None,
            "ncr_status": ncr["status"] if ncr else None,
            "disposition_type": disp["disposition_type"] if disp else None,
        }))

    # ncr_traceability gold (rework_est is computed in build_dataset where rng lives)
    ncr_gold = []
    for n in ncrs:
        disp = disp_by_ncr.get(n["ncr_id"])
        affected = len(suspect_vehicles) if n.get("lot_no") == SUSPECT_LOT else 1
        mins, cost = rework_est.get(n["ncr_id"], (0, 0.0))
        opened = n["opened_ts"][:10]
        closed = n["closed_ts"][:10] if n["closed_ts"] else None
        age = 14 if n["status"] == "open" else 6
        ncr_gold.append(_stamp("Gold", "gold.rel_ncr_traceability", n["ncr_id"], {
            "ncr_id": n["ncr_id"], "vehicle_serial": n["vehicle_serial"],
            "unit_serial_or_lot": n["unit_serial_or_lot"], "part_no": n.get("part_no"),
            "lot_no": n.get("lot_no"), "work_order_no": n["work_order_no"],
            "operation_id": n["operation_id"], "work_center": n["work_center"],
            "defect_code": n["defect_code"], "severity": n["severity"], "status": n["status"],
            "opened_ts": opened, "closed_ts": closed, "age_days": age,
            "disposition_type": disp["disposition_type"] if disp else None,
            "affected_vehicle_count": affected, "estimated_rework_minutes": mins,
            "estimated_rework_cost": cost,
            "cluster_label": f"{n['defect_code']} · {n['work_center']}",
        }))

    # build_cost_rollup (per vehicle/work order/part rollups — one row per work order here)
    rollup = []
    for w in src["rel_mes_work_order"]:
        wo = w["work_order_no"]
        v = w["vehicle_serial"]
        mc = [c for c in src["rel_mes_material_consumption"] if c["work_order_no"] == wo]
        oe = [o for o in src["rel_mes_operation_execution"] if o["work_order_no"] == wo]
        mat = round(sum(c["qty"] * _std(src, c["part_no"]) for c in mc), 2)
        labor_min = sum(o["actual_minutes"] for o in oe)
        labor_cost = round(labor_min / 60.0 * 95.0, 2)
        ovh = round(labor_cost * 0.18, 2)
        ncr_rw = 0.0
        if v == "VEH-DEMO-001" and w["subassembly"] == "TPS":
            ncr_rw = 4200.0
        if v == "VEH-DEMO-002" and w["subassembly"] == "STR":
            ncr_rw = 2650.0
        rollup.append(_stamp("Gold", "gold.rel_build_cost_rollup", wo, {
            "vehicle_serial": v, "work_order_no": wo,
            "part_no": mc[0]["part_no"] if mc else None,
            "material_qty": sum(c["qty"] for c in mc), "material_actual_cost": mat,
            "labor_minutes": labor_min, "labor_actual_cost": labor_cost, "overhead_cost": ovh,
            "ncr_rework_cost": ncr_rw, "total_actual_cost": round(mat + labor_cost + ovh + ncr_rw, 2),
        }))

    # mes_erp_reconciliation (per work order: MES actual vs ERP standard + variance category)
    recon = []
    for w in src["rel_mes_work_order"]:
        wo = w["work_order_no"]
        mfg = w["prod_order_no"]
        v = w["vehicle_serial"]
        po = next((p for p in src["rel_erp_production_order"] if p["mfg_order_no"] == mfg), None)
        roll = next((r for r in rollup if r["work_order_no"] == wo), None)
        if not po or not roll:
            continue
        actual = roll["total_actual_cost"]
        standard = po["std_cost_estimate"]
        var = round(actual - standard, 2)
        var_pct = round(var / standard * 100, 2) if standard else 0.0
        if roll["ncr_rework_cost"] > 0 and w["subassembly"] == "STR":
            cat = "resource_usage"
        elif roll["ncr_rework_cost"] > 0:
            cat = "input_qty"
        elif var > 0:
            cat = "input_price"
        else:
            cat = "remaining"
        recon.append(_stamp("Gold", "gold.rel_mes_erp_reconciliation", wo, {
            "vehicle_serial": v, "work_order_no": wo, "mfg_order_no": mfg,
            "erp_material_id": po["material_id"], "standard_cost": standard, "actual_cost": actual,
            "variance_amount": var, "variance_pct": var_pct, "variance_category": cat,
            "source_mes_rows": "rel_mes_material_consumption, rel_mes_operation_execution",
            "source_erp_rows": "rel_erp_production_order, rel_erp_prod_order_cost, rel_erp_cost_variance",
            "reconciliation_status": "reconciled" if abs(var_pct) < 25 else "exception",
        }))
        # write the ERP cost_variance source row to match
        src["rel_erp_cost_variance"].append(_stamp("ERP", "rel_erp_cost_variance", f"{mfg}:VAR", {
            "variance_id": f"{mfg}:VAR", "mfg_order_no": mfg, "vehicle_serial": v,
            "variance_category": cat, "amount": var, "target_cost_version": "0",
        }))

    return {
        "gold.rel_build_overview": overview,
        "gold.rel_as_built_genealogy": g_gold,
        "gold.rel_ncr_traceability": ncr_gold,
        "gold.rel_build_cost_rollup": rollup,
        "gold.rel_mes_erp_reconciliation": recon,
    }


def _std(src, part_no):
    if not part_no:
        return 250.0
    for m in src["rel_erp_material_master"]:
        if m["material_id"] == f"MAT-{part_no}":
            return m["standard_cost"]
    return 250.0


# ── Simulation-analysis helpers (Phase 10 hardening) — pure Python, no Databricks ──────────────────

RECON_EXCEPTION_PCT = 25.0  # mirrors the gold writer + backend constant; the threshold-sensitivity sweep
#                             in analytics() exists precisely to show this fixed band is not discriminating.


def scenario_manifest(seed: int = MASTER_SEED) -> dict[str, Any]:
    """What this seed PLANTED (vs what emerges) — the adult synthetic-data posture for the UI labels."""
    return {
        "seed": seed,
        "master_seed": MASTER_SEED,
        "planted": {
            "suspect_lot": SUSPECT_LOT,
            "suspect_part": SUSPECT_PART,
            "suspect_vehicles": ["VEH-DEMO-001", "VEH-DEMO-002"],
            "planted_ncrs": [
                {"ncr_id": "NCR-0001", "severity": "major", "status": "open", "on_lot": True},
                {"ncr_id": "NCR-0002", "severity": "major", "status": "closed", "on_lot": False},
                {"ncr_id": "NCR-0003", "severity": "minor", "status": "closed", "on_lot": False},
            ],
            "planted_rework": {"VEH-DEMO-001": 4200.0, "VEH-DEMO-002": 2650.0},
            "recon_threshold_pct": RECON_EXCEPTION_PCT,
            "unallocated_residual_pct_range": [1.0, 3.0],
        },
        "generated_vs_emergent": {
            "suspect_lot_exposure": "generated",
            "blocked_state_of_VEH-DEMO-001": "emergent (open major NCR + over-threshold WO)",
            "rework_amounts": "generated (emitted as traceable ERP cost rows)",
            "largest_ncr_concentration_pct": "emergent (ratio of planted rework over total)",
            "minor_ncrs_NCR-0004..0007": "emergent (random vehicle/subassembly/defect)",
            "standard_cost": "emergent (direct cost x rng 0.9..1.0)",
            "unallocated_residual": "emergent (rng 1..3% of direct cost)",
            "cost_overrun_bridge": "derived accounting identity + emergent residual",
        },
    }


def study_aggregates(ds: dict[str, Any]) -> dict[str, float]:
    """The fragile metrics whose seed-to-seed spread the multi-seed study measures."""
    gold = ds["gold"]
    overview = gold["gold.rel_build_overview"]
    ncrs = gold["gold.rel_ncr_traceability"]
    recon = gold["gold.rel_mes_erp_reconciliation"]
    ops = ds["source"]["rel_mes_operation_execution"]

    rework_by_cluster: dict[str, float] = {}
    for nc in ncrs:
        rework_by_cluster[nc.get("cluster_label", "?")] = (
            rework_by_cluster.get(nc.get("cluster_label", "?"), 0.0) + (nc.get("estimated_rework_cost") or 0.0))
    total_rework = sum(rework_by_cluster.values()) or 0.0
    largest_share = (max(rework_by_cluster.values()) / total_rework * 100) if total_rework else 0.0

    wc_minutes: dict[str, float] = {}
    max_ratio = 0.0
    for o in ops:
        wc_minutes[o["work_center"]] = wc_minutes.get(o["work_center"], 0.0) + (o.get("actual_minutes") or 0)
        std = o.get("std_minutes") or 0
        if std:
            max_ratio = max(max_ratio, (o.get("actual_minutes") or 0) / std)

    actual_tot = sum(r.get("actual_cost", 0.0) for r in overview) or 0.0
    # residual = portion of overview actual not explained by the per-WO rollup components
    rollup = gold["gold.rel_build_cost_rollup"]
    rollup_tot = sum(r.get("total_actual_cost", 0.0) for r in rollup) or 0.0
    residual_pct = ((actual_tot - rollup_tot) / actual_tot * 100) if actual_tot else 0.0

    suspect_vehicles = sorted({g["vehicle_serial"] for g in gold["gold.rel_as_built_genealogy"]
                               if g.get("lot_no") == SUSPECT_LOT})

    return {
        "largest_ncr_share_pct": round(largest_share, 2),
        "exception_wo_count": float(sum(1 for r in recon if r.get("reconciliation_status") == "exception")),
        "max_actual_std_ratio": round(max_ratio, 3),
        "blocked_build_count": float(sum(1 for o in overview if o.get("readiness_state") == "blocked")),
        "residual_pct": round(residual_pct, 2),
        "blast_size": float(len(suspect_vehicles)),
        "ncr_count": float(len(ncrs)),
    }
