"""g01 — static master data (convo.md §4 Phase 1).

Produces dim_facility, dim_work_center, dim_machine, dim_operator, dim_supplier,
dim_customer, dim_vehicle, dim_part, dim_part_revision, bridge_bom — with the scenario
anchors baked in deterministically (VEH-TR-003, PART-ENG-VALVE-014 Rev A/B/C, WLD-07
calibration drift, TS-03 noisy stand, AeroMetals supplier for lot ML-8821).
"""

from __future__ import annotations

import datetime as _dt
from typing import Any

from .. import ids
from ..context import BuildContext
from ..dataset import Dataset

_FACILITIES = [
    ("Long Beach Factory", "manufacturing", "Long Beach, CA"),
    ("Stennis Test Site", "test", "Stennis, MS"),
    ("Launch Ops", "readiness", "Cape Canaveral, FL"),
    ("Supplier Receiving", "receiving", "Long Beach, CA"),
]
_WC_NAMES = [
    "Engine Assembly", "Structures", "Avionics Integration", "Inspection",
    "Test Prep", "Welding", "Machining", "Additive", "Harness Build",
    "Final Integration", "Cleanroom", "Receiving Inspection", "Tank Fab", "Propulsion",
]
# machine type -> (id prefix, share of fleet). Ensure WLD has >=7 and TS has >=3.
_MACHINE_TYPES = [
    ("printer", "PRN", 0.22),
    ("welder", "WLD", 0.18),
    ("cnc", "CNC", 0.20),
    ("test_stand", "TS", 0.12),
    ("cmm", "CMM", 0.16),
    ("torque_bench", "TRQ", 0.12),
]
_PART_FAMILIES = ["ENG-VALVE", "ENG-CHAMBER", "STR-BRACKET", "AVI-HARNESS", "SEN-ASSY", "TANK"]
_CRIT_LABELS = ["flight_critical", "safety_critical", "mission_critical", "standard"]
_SHIFTS = ["A", "B", "C"]
_TEAMS = ["Propulsion", "Structures", "Avionics", "Quality", "Test", "Integration"]
_CERTS = ["weld_l2", "torque_a", "cleanroom", "avionics_solder", "cmm_operate", "pressure_test"]


def run(ctx: BuildContext, ds: Dataset) -> None:
    _facilities(ctx, ds)
    _work_centers(ctx, ds)
    _machines(ctx, ds)
    _operators(ctx, ds)
    _suppliers(ctx, ds)
    _customers(ctx, ds)
    _vehicles(ctx, ds)
    _parts(ctx, ds)
    _part_revisions(ctx, ds)
    _bom(ctx, ds)


def _facilities(ctx: BuildContext, ds: Dataset) -> None:
    rows = [
        {"facility_id": ids.facility(i + 1), "name": nm, "kind": kind, "location": loc}
        for i, (nm, kind, loc) in enumerate(_FACILITIES[: ctx.n("facilities")])
    ]
    ds.add("dim_facility", rows, key=["facility_id"])


def _work_centers(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("dim_work_center")
    n = ctx.n("work_centers")
    fac_ids = [r["facility_id"] for r in ds.get("dim_facility").rows]
    rows = []
    for i in range(n):
        nm = _WC_NAMES[i % len(_WC_NAMES)]
        rows.append({
            "work_center_id": ids.work_center(i + 1),
            "name": nm if i < len(_WC_NAMES) else f"{nm} {i // len(_WC_NAMES) + 1}",
            "facility_id": fac_ids[int(rng.integers(0, len(fac_ids)))],
            "area": nm.split()[0].lower(),
        })
    ds.add("dim_work_center", rows, key=["work_center_id"])


def _machines(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("dim_machine")
    n = ctx.n("machines")
    wc_ids = [r["work_center_id"] for r in ds.get("dim_work_center").rows]
    # Allocate counts per type, guaranteeing WLD>=7 and TS>=3.
    counts = {p: max(1, int(round(n * share))) for _, p, share in _MACHINE_TYPES}
    counts["WLD"] = max(counts.get("WLD", 0), 7)
    counts["TS"] = max(counts.get("TS", 0), 3)
    # trim/pad to exactly n
    total = sum(counts.values())
    order = [p for _, p, _ in _MACHINE_TYPES]
    while total > n:
        for p in order[::-1]:
            if counts[p] > (7 if p == "WLD" else 3 if p == "TS" else 1):
                counts[p] -= 1; total -= 1
                if total == n:
                    break
    while total < n:
        counts["PRN"] += 1; total += 1

    drift = ctx.scenario["scenarios"]["SCN-003-MACHINE-WLD07-CALIBRATION-DRIFT"]
    rows = []
    for _, prefix, _share in _MACHINE_TYPES:
        kind = {"PRN": "printer", "WLD": "welder", "CNC": "cnc", "TS": "test_stand",
                "CMM": "cmm", "TRQ": "torque_bench"}[prefix]
        for j in range(counts[prefix]):
            mid = ids.machine(prefix, j + 1)
            cal_due = ctx.as_of + _dt.timedelta(days=int(rng.integers(-60, 120)))
            overdue = cal_due < ctx.as_of
            row = {
                "machine_id": mid,
                "machine_type": kind,
                "work_center_id": wc_ids[int(rng.integers(0, len(wc_ids)))],
                "calibration_due_date": cal_due.isoformat(),
                "calibration_overdue": bool(overdue),
                "drift_onset_date": None,
                "noisy_channel": None,
                "scenario_id": None,
            }
            if mid == drift["machine"]:  # WLD-07
                row["calibration_overdue"] = True
                row["calibration_due_date"] = (ctx.as_of - _dt.timedelta(days=18)).isoformat()
                row["drift_onset_date"] = str(drift["drift_onset_date"])
                row["scenario_id"] = "SCN-003-MACHINE-WLD07-CALIBRATION-DRIFT"
            if mid == ctx.scenario["anchors"]["noisy_test_stand"]:  # TS-03
                row["noisy_channel"] = "pressure"
                row["scenario_id"] = "SCN-005-HOTFIRE-ANOMALY-SIMILARITY"
            rows.append(row)
    ds.add("dim_machine", rows, key=["machine_id"])


def _operators(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("dim_operator")
    n = ctx.n("operators")
    rows = []
    for i in range(n):
        ncert = int(rng.integers(1, 4))
        certs = sorted(rng.choice(_CERTS, size=ncert, replace=False).tolist())
        rows.append({
            "operator_id": ids.operator(i + 1),
            "name": f"Operator {i + 1:04d}",   # synthetic, no real PII
            "team": _TEAMS[int(rng.integers(0, len(_TEAMS)))],
            "shift": _SHIFTS[int(rng.integers(0, len(_SHIFTS)))],
            "certs": ";".join(certs),
            "active": bool(rng.random() > 0.05),
        })
    ds.add("dim_operator", rows, key=["operator_id"])


def _suppliers(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("dim_supplier")
    n = ctx.n("suppliers")
    aerometals = ctx.scenario["anchors"]["aerometals_supplier_name"]
    base_names = [aerometals, "TitanForge", "Helios Materials", "VertexAlloy", "NovaCast",
                  "PrimeSeal", "OrbitFab Supply", "Apex Composites", "IronWolf Metals",
                  "BlueRidge Fasteners"]
    countries = ["US", "US", "US", "DE", "JP", "US", "FR", "US"]
    rows = []
    for i in range(n):
        nm = base_names[i] if i < len(base_names) else f"Supplier {i + 1:03d}"
        sid = ids.supplier(i + 1)
        rows.append({
            "supplier_id": sid,
            "canonical_name": nm,
            "country": countries[int(rng.integers(0, len(countries)))],
            "quality_rating": round(float(rng.uniform(2.5, 4.8)), 2),
            "scenario_id": "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK" if nm == aerometals else None,
        })
    ds.add("dim_supplier", rows, key=["supplier_id"])


def _customers(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("dim_customer")
    n = ctx.n("customers")
    names = ["Orbital Networks", "SkyLink Sat", "Gov Payload Office", "DeepSpace Labs",
             "Internal Demo Mission", "Meridian Comms", "PolarView Imaging", "AstroLogistics"]
    rows = []
    for i in range(n):
        nm = names[i] if i < len(names) else f"Customer {i + 1:02d}"
        rows.append({
            "customer_id": ids.customer(i + 1),
            "name": nm,
            "kind": "internal" if "Internal" in nm else "external",
            "missions_committed": int(rng.integers(1, 5)),
        })
    ds.add("dim_customer", rows, key=["customer_id"])


def _vehicles(ctx: BuildContext, ds: Dataset) -> None:
    n = ctx.n("vehicles")
    blocked = ctx.scenario["anchors"]["blocked_vehicle"]
    rng = ctx.rng("dim_vehicle")
    rows = []
    for i in range(n):
        vid = ids.vehicle(i + 1)
        launch = ctx.as_of + _dt.timedelta(days=int(rng.integers(20, 120)))
        is_blocked = (vid == blocked)
        rows.append({
            "vehicle_id": vid,
            "name": f"Terran R {vid}",
            "program": "Terran R",
            "build_site": "Long Beach Factory",
            "target_launch_date": launch.isoformat(),
            "status_hint": "yellow" if is_blocked else "green",
            "scenario_id": "SCN-001-VEHICLE-TR003-READINESS-BLOCKED" if is_blocked else None,
        })
    ds.add("dim_vehicle", rows, key=["vehicle_id"])


def _parts(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("dim_part")
    n = ctx.n("parts")
    crit_p = [ctx.scenario["distributions"]["part_criticality"][c] for c in _CRIT_LABELS]
    valve_family = ctx.scenario["anchors"]["valve_part_family"]
    valve_seq = int(ctx.scenario["anchors"]["valve_part_seq"])
    rows = []
    # round-robin families so each is represented; force the valve anchor part.
    for i in range(n):
        fam = _PART_FAMILIES[i % len(_PART_FAMILIES)]
        seq = i // len(_PART_FAMILIES) + 1
        pid = ids.part(fam, seq)
        crit = str(rng.choice(_CRIT_LABELS, p=crit_p))
        scenario = None
        if fam == valve_family and seq == valve_seq:  # PART-ENG-VALVE-014
            crit = "flight_critical"
            scenario = "SCN-004-REV-C-YIELD-IMPROVEMENT"
        rows.append({
            "part_id": pid,
            "part_family": fam,
            "name": f"{fam} part {seq:03d}",
            "criticality": crit,
            "scenario_id": scenario,
        })
    # guarantee the valve anchor exists even if n is tiny
    anchor_pid = ids.part(valve_family, valve_seq)
    if not any(r["part_id"] == anchor_pid for r in rows):
        rows.append({"part_id": anchor_pid, "part_family": valve_family,
                     "name": f"{valve_family} part {valve_seq:03d}", "criticality": "flight_critical",
                     "scenario_id": "SCN-004-REV-C-YIELD-IMPROVEMENT"})
    ds.add("dim_part", rows, key=["part_id"])


def _part_revisions(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("dim_part_revision")
    parts = ds.get("dim_part").rows
    anchor_pid = ids.part(ctx.scenario["anchors"]["valve_part_family"],
                          int(ctx.scenario["anchors"]["valve_part_seq"]))
    valve_revs = list(ctx.scenario["anchors"]["valve_revisions"])  # [A, B, C]
    rev_letters = ["A", "B", "C", "D"]
    rows: list[dict[str, Any]] = []
    for p in parts:
        pid = p["part_id"]
        if pid == anchor_pid:
            revs = valve_revs
        else:
            k = int(rng.integers(1, 5))  # 1..4 revisions
            revs = rev_letters[:k]
        for idx, rev in enumerate(revs):
            released = (idx == len(revs) - 1)
            eff = ctx.start + _dt.timedelta(days=int(rng.integers(0, ctx.days_span())))
            scenario = None
            if pid == anchor_pid and rev in ("B", "C"):
                scenario = "SCN-004-REV-C-YIELD-IMPROVEMENT"
            rows.append({
                "revision_id": ids.revision(pid, rev),
                "part_id": pid,
                "rev": rev,
                "status": "released" if released else "superseded",
                "effective_date": eff.isoformat(),
                "scenario_id": scenario,
            })
    ds.add("dim_part_revision", rows, key=["revision_id"])


def _bom(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("bridge_bom")
    part_ids = [r["part_id"] for r in ds.get("dim_part").rows]
    target = min(ctx.n("bom_links"), len(part_ids) * (len(part_ids) - 1) // 2)
    seen: set[tuple[int, int]] = set()
    rows = []
    attempts = 0
    while len(rows) < target and attempts < target * 20:
        attempts += 1
        a = int(rng.integers(0, len(part_ids) - 1))
        b = int(rng.integers(a + 1, len(part_ids)))  # parent idx < child idx → acyclic
        if (a, b) in seen:
            continue
        seen.add((a, b))
        rows.append({
            "parent_part_id": part_ids[a],
            "child_part_id": part_ids[b],
            "qty_per": int(rng.integers(1, 9)),
            "find_number": len(rows) + 1,
        })
    ds.add("bridge_bom", rows, key=["parent_part_id", "child_part_id"])
