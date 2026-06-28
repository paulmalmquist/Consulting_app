"""Relativity MES Sandbox serving reads (Phase 10) — display-only, fail-closed.

Reads the flat rel_* serving marts + rel_* source tables from Postgres/Lakebase via
get_telemetry_cursor(). These are SYNTHETIC, clearly-labeled rows loaded by the seed migration
(serving_provenance='seed-bootstrap') and/or the Databricks medallion backfill
(serving_provenance='databricks-gold'). There is NO fabricated fallback: an empty or missing serving
table returns null_reason and an 'unavailable' source-kind — never invented rows.

Source-kind contract (matches repo-b drill/sourceKind.ts): real serving rows -> 'live-rows';
nothing to serve -> 'unavailable'. The serving_provenance is surfaced separately so the UI can say
"synthetic Databricks Gold serving rows" vs "synthetic gold serving rows (bootstrap load)".
"""
from __future__ import annotations

import re
from uuid import UUID

import psycopg

from app.db import get_telemetry_cursor as get_cursor
from app.services.reporting_common import resolve_tenant_id

# Allowlisted rel_* source tables for the generic drill-to-source endpoint (prevents table injection).
SOURCE_TABLES = {
    "rel_mes_vehicle", "rel_mes_product", "rel_mes_part", "rel_mes_lot", "rel_mes_unit",
    "rel_mes_work_order", "rel_mes_operation_execution", "rel_mes_as_built_genealogy",
    "rel_mes_material_consumption", "rel_mes_inspection_order", "rel_mes_nonconformance",
    "rel_mes_disposition", "rel_erp_material_master", "rel_erp_production_order",
    "rel_erp_prod_order_cost", "rel_erp_cost_variance", "rel_erp_labor_actual", "rel_plm_part",
    "rel_plm_ebom", "rel_plm_ebom_line", "rel_plm_eco", "rel_plm_effectivity",
    "rel_xwalk_part_identity",
}
_COL_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
_MISSING = (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn, psycopg.errors.InsufficientPrivilege)

# |variance %| at/above which a work order is an MES↔ERP reconciliation exception. Single source of
# truth (the generator's gold writer uses the same 25); covered by a boundary test so it cannot drift.
RECON_EXCEPTION_PCT = 25.0


def _kind(rows: list) -> str:
    return "live-rows" if rows else "unavailable"


def _provenance(rows: list) -> str | None:
    return rows[0].get("serving_provenance") if rows else None


def _as_of(rows: list) -> str | None:
    if rows and rows[0].get("as_of") is not None:
        return str(rows[0]["as_of"])
    return None


def _empty(null_reason: str, **extra) -> dict:
    base = {"rows": [], "source_kind": "unavailable", "serving_provenance": None,
            "as_of": None, "null_reason": null_reason}
    base.update(extra)
    return base


def overview(*, env_id: str, business_id: UUID) -> dict:
    try:
        with get_cursor() as cur:
            resolve_tenant_id(cur, business_id)
            cur.execute(
                """SELECT * FROM rel_build_overview
                   WHERE env_id = %s AND business_id = %s ORDER BY vehicle_serial""",
                (env_id, str(business_id)))
            rows = [dict(r) for r in cur.fetchall()]
    except _MISSING:
        return _empty("serving_table_missing")
    if not rows:
        return _empty("serving_not_loaded")
    return {"rows": rows, "source_kind": _kind(rows), "serving_provenance": _provenance(rows),
            "as_of": _as_of(rows), "null_reason": None}


def genealogy(*, env_id: str, business_id: UUID, vehicle_serial: str | None = None) -> dict:
    try:
        with get_cursor() as cur:
            resolve_tenant_id(cur, business_id)
            cur.execute(
                """SELECT vehicle_serial, product_code, product_description, build_status, unit_serial
                   FROM rel_mes_vehicle WHERE env_id = %s AND business_id = %s ORDER BY vehicle_serial""",
                (env_id, str(business_id)))
            vehicles = [dict(r) for r in cur.fetchall()]

            params: tuple = (env_id, str(business_id))
            where = "env_id = %s AND business_id = %s"
            if vehicle_serial:
                where += " AND vehicle_serial = %s"
                params = (env_id, str(business_id), vehicle_serial)
            cur.execute(f"""SELECT * FROM rel_as_built_genealogy WHERE {where}
                            ORDER BY vehicle_serial, parent_node_id, child_node_id""", params)
            rows = [dict(r) for r in cur.fetchall()]

            cur.execute(f"""SELECT * FROM rel_ncr_traceability WHERE {where} ORDER BY ncr_id""", params)
            ncrs = [dict(r) for r in cur.fetchall()]
    except _MISSING:
        return _empty("serving_table_missing", vehicles=[], ncrs=[])
    if not vehicles:
        return _empty("serving_not_loaded", vehicles=[], ncrs=[])
    return {"vehicles": vehicles, "rows": rows, "ncrs": ncrs,
            "source_kind": _kind(rows or vehicles), "serving_provenance": _provenance(rows),
            "as_of": _as_of(rows), "null_reason": None if rows else "no_genealogy_for_vehicle"}


def where_used(*, env_id: str, business_id: UUID, lot_no: str) -> dict:
    try:
        with get_cursor() as cur:
            resolve_tenant_id(cur, business_id)
            cur.execute(
                """SELECT * FROM rel_as_built_genealogy
                   WHERE env_id = %s AND business_id = %s AND lot_no = %s
                   ORDER BY vehicle_serial""",
                (env_id, str(business_id), lot_no))
            rows = [dict(r) for r in cur.fetchall()]
    except _MISSING:
        return _empty("serving_table_missing", lot_no=lot_no, vehicles=[], affected_vehicle_count=0)
    vehicles = sorted({r["vehicle_serial"] for r in rows})
    if not rows:
        return _empty("lot_not_installed", lot_no=lot_no, vehicles=[], affected_vehicle_count=0)
    return {"lot_no": lot_no, "vehicles": vehicles, "affected_vehicle_count": len(vehicles),
            "rows": rows, "source_kind": _kind(rows), "serving_provenance": _provenance(rows),
            "as_of": _as_of(rows), "null_reason": None}


def ncr(*, env_id: str, business_id: UUID) -> dict:
    try:
        with get_cursor() as cur:
            resolve_tenant_id(cur, business_id)
            cur.execute(
                """SELECT * FROM rel_ncr_traceability
                   WHERE env_id = %s AND business_id = %s ORDER BY status DESC, severity DESC, ncr_id""",
                (env_id, str(business_id)))
            rows = [dict(r) for r in cur.fetchall()]
    except _MISSING:
        return _empty("serving_table_missing", kpis=None)
    if not rows:
        return _empty("serving_not_loaded", kpis=None)
    kpis = _ncr_kpis(rows)
    return {"rows": rows, "kpis": kpis, "source_kind": _kind(rows),
            "serving_provenance": _provenance(rows), "as_of": _as_of(rows), "null_reason": None}


def _ncr_kpis(rows: list[dict]) -> dict:
    open_rows = [r for r in rows if r.get("status") == "open"]
    major = [r for r in rows if r.get("severity") == "major"]
    ages = sorted(float(r["age_days"]) for r in rows if r.get("age_days") is not None)
    median_age = ages[len(ages) // 2] if ages else None
    families: dict[str, int] = {}
    for r in rows:
        fam = r.get("defect_code") or "unknown"
        families[fam] = families.get(fam, 0) + 1
    top_family = max(families, key=families.get) if families else None
    affected = sorted({r["vehicle_serial"] for r in rows if r.get("vehicle_serial")})
    rework_cost = round(sum(float(r.get("estimated_rework_cost") or 0) for r in rows), 2)
    return {
        "open_now": len(open_rows), "major": len(major), "median_age_days": median_age,
        "top_defect_family": top_family, "vehicles_affected": len(affected),
        "estimated_rework_cost": rework_cost,
        "open_blocking": len([r for r in open_rows if r.get("severity") == "major"]),
    }


def cost(*, env_id: str, business_id: UUID, vehicle_serial: str | None = None) -> dict:
    try:
        with get_cursor() as cur:
            resolve_tenant_id(cur, business_id)
            params: tuple = (env_id, str(business_id))
            where = "env_id = %s AND business_id = %s"
            if vehicle_serial:
                where += " AND vehicle_serial = %s"
                params = (env_id, str(business_id), vehicle_serial)
            cur.execute(f"SELECT * FROM rel_build_cost_rollup WHERE {where} ORDER BY work_order_no", params)
            rollup = [dict(r) for r in cur.fetchall()]
            cur.execute(f"SELECT * FROM rel_mes_erp_reconciliation WHERE {where} ORDER BY work_order_no",
                        params)
            recon = [dict(r) for r in cur.fetchall()]
    except _MISSING:
        return _empty("serving_table_missing", rollup=[], reconciliation=[], kpis=None)
    if not rollup and not recon:
        return _empty("serving_not_loaded", rollup=[], reconciliation=[], kpis=None)
    return {"rollup": rollup, "reconciliation": recon, "kpis": _cost_kpis(rollup, recon),
            "source_kind": _kind(rollup or recon), "serving_provenance": _provenance(rollup or recon),
            "as_of": _as_of(rollup or recon), "null_reason": None}


def _cost_kpis(rollup: list[dict], recon: list[dict]) -> dict:
    def s(rows, col):
        return round(sum(float(r.get(col) or 0) for r in rows), 2)
    standard = s(recon, "standard_cost")
    actual = s(recon, "actual_cost")
    variance = round(actual - standard, 2)
    return {
        "standard_cost": standard, "actual_cost": actual, "total_variance": variance,
        "variance_pct": round(variance / standard * 100, 2) if standard else 0.0,
        "material_variance": s(rollup, "material_actual_cost"),
        "labor_variance": s(rollup, "labor_actual_cost"),
        "ncr_rework_cost": s(rollup, "ncr_rework_cost"),
        "unreconciled_rows": len([r for r in recon if r.get("reconciliation_status") == "exception"]),
    }


# ── Build Analytics (Phase 10) — simulation-analysis blocks over the rel_* serving marts ──────────
# Display-only, fail-closed PER BLOCK. Every number traces to a serving row; concentration/ratio stats
# are computed, not asserted. Multi-seed stability + scenario manifest + data-quality are receipt-backed
# (Batch B) and fail closed in the response until their committed receipts land.

def _f(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _fetch(cur, table: str, env_id: str, business_id: UUID, order_col: str) -> list[dict]:
    cur.execute(f"SELECT * FROM {table} WHERE env_id = %s AND business_id = %s ORDER BY {order_col}",
                (env_id, str(business_id)))
    return [dict(r) for r in cur.fetchall()]


def _readiness_block(ov: list[dict], ncrs: list[dict], vehicle_serial: str | None) -> dict:
    rows = []
    for v in ov:
        if vehicle_serial and v.get("vehicle_serial") != vehicle_serial:
            continue
        state = v.get("readiness_state")
        if state == "blocked":
            driver = "open major NCR" if v.get("open_ncr_count") else "blocked"
        elif state == "at_risk":
            driver = f"variance {round(_f(v.get('variance_pct')), 1)}%"
        else:
            driver = "on track"
        if v.get("affected_by_suspect_lot"):
            driver += " · suspect lot"
        rows.append({"vehicle_serial": v.get("vehicle_serial"), "readiness_state": state,
                     "open_ncr_count": int(_f(v.get("open_ncr_count"))),
                     "variance_pct": round(_f(v.get("variance_pct")), 2),
                     "suspect_lot_flag": bool(v.get("affected_by_suspect_lot")), "driver": driver})
    return {"rows": rows, "null_reason": None if rows else "serving_not_loaded"}


def _asymmetry_block(ov: list[dict], ncrs: list[dict], geneal: list[dict]) -> dict:
    """Why one suspect-lot vehicle is blocked and another is not — derived from rows, not prose."""
    exposed = sorted({g.get("vehicle_serial") for g in geneal
                      if g.get("child_type") == "lot" and g.get("lot_no")
                      and any(o.get("vehicle_serial") == g.get("vehicle_serial") and o.get("affected_by_suspect_lot") for o in ov)})
    if len(exposed) < 2:
        return {"rows": [], "shared_exposure": exposed, "null_reason": "no_shared_exposure"}
    rows = []
    for vs in exposed:
        ov_row = next((o for o in ov if o.get("vehicle_serial") == vs), {})
        v_ncrs = [n for n in ncrs if n.get("vehicle_serial") == vs]
        open_major = [n for n in v_ncrs if n.get("status") == "open" and n.get("severity") == "major"]
        lot_wo = next((g.get("work_order_no") for g in geneal
                       if g.get("vehicle_serial") == vs and g.get("child_type") == "lot"), None)
        rows.append({
            "vehicle_serial": vs, "readiness_state": ov_row.get("readiness_state"),
            "open_ncr_count": int(_f(ov_row.get("open_ncr_count"))),
            "open_major_ncr": len(open_major), "lot_install_wo": lot_wo,
            "note": ("open major NCR on the lot install" if open_major
                     else "lot installed; no open major NCR on it"),
        })
    return {"rows": rows, "shared_exposure": exposed, "null_reason": None}


def _blast_block(ov: list[dict], ncrs: list[dict], recon: list[dict], geneal: list[dict]) -> dict:
    lot_edges = [g for g in geneal if g.get("child_type") == "lot" and g.get("lot_no")]
    if not lot_edges:
        return {"rows_present": False, "null_reason": "no_suspect_lot", "lot_id": None,
                "part_number": None, "vehicles": [], "ncrs": [], "work_orders": [], "edges": []}
    # The "suspect" lot is the one with QUALITY ATTRIBUTION (an NCR raised against it), not merely the
    # lot with the widest where-used — a common part installed everywhere has the widest spread but no
    # defect story, which would render an empty, misleading blast radius. Rank lots by NCR count first,
    # then by where-used; fall back to widest where-used only when no lot carries an NCR.
    by_lot: dict[str, set] = {}
    for g in lot_edges:
        by_lot.setdefault(g["lot_no"], set()).add(g.get("vehicle_serial"))
    ncr_by_lot: dict[str, int] = {}
    for n in ncrs:
        if n.get("lot_no") in by_lot:
            ncr_by_lot[n["lot_no"]] = ncr_by_lot.get(n["lot_no"], 0) + 1
    lot_id = max(by_lot, key=lambda k: (ncr_by_lot.get(k, 0), len(by_lot[k])))
    part_number = next((g.get("part_no") for g in lot_edges if g.get("lot_no") == lot_id), None)
    veh_serials = sorted(v for v in by_lot[lot_id] if v)
    vehicles = [{"vehicle_serial": vs,
                 "readiness_state": next((o.get("readiness_state") for o in ov if o.get("vehicle_serial") == vs), None)}
                for vs in veh_serials]
    lot_ncrs = [n for n in ncrs if n.get("lot_no") == lot_id]
    ncr_rows = [{"ncr_id": n.get("ncr_id"), "severity": n.get("severity"), "status": n.get("status"),
                 "rework_cost": round(_f(n.get("estimated_rework_cost")), 2)} for n in lot_ncrs]
    wo_ids = {n.get("work_order_no") for n in lot_ncrs if n.get("work_order_no")}
    wos = [{"work_order_id": r.get("work_order_no"), "variance_pct": round(_f(r.get("variance_pct")), 2),
            "actual_cost": round(_f(r.get("actual_cost")), 2), "standard_cost": round(_f(r.get("standard_cost")), 2)}
           for r in recon if r.get("work_order_no") in wo_ids]
    edges = ([{"from": lot_id, "to": vs, "label": "where-used"} for vs in veh_serials]
             + [{"from": lot_id, "to": n["ncr_id"], "label": n.get("severity")} for n in ncr_rows]
             + [{"from": n["ncr_id"], "to": w["work_order_id"], "label": f"{w['variance_pct']}%"}
                for n, w in zip(ncr_rows, wos)])
    return {"rows_present": True, "null_reason": None, "lot_id": lot_id, "part_number": part_number,
            "vehicles": vehicles, "ncrs": ncr_rows, "work_orders": wos, "edges": edges}


def _bridge_block(ov: list[dict], rollup: list[dict], vehicle_serial: str | None) -> dict:
    rows = []
    for v in ov:
        vs = v.get("vehicle_serial")
        if vehicle_serial and vs != vehicle_serial:
            continue
        vr = [r for r in rollup if r.get("vehicle_serial") == vs]
        material = round(sum(_f(r.get("material_actual_cost")) for r in vr), 2)
        labor_oh = round(sum(_f(r.get("labor_actual_cost")) + _f(r.get("overhead_cost")) for r in vr), 2)
        rework = round(sum(_f(r.get("ncr_rework_cost")) for r in vr), 2)
        actual = round(_f(v.get("actual_cost")), 2)
        # analytics-only reconciliation residual: what 'actual' does NOT explain via the components.
        residual = round(actual - (material + labor_oh + rework), 2)
        rows.append({"vehicle_serial": vs, "planned_cost": round(_f(v.get("planned_cost")), 2),
                     "material": material, "labor_overhead": labor_oh, "rework": rework,
                     "residual": residual, "actual_cost": actual})
    explained = sum(r["material"] + r["labor_overhead"] + r["rework"] for r in rows)
    actual_tot = sum(r["actual_cost"] for r in rows)
    reconciled_pct = round(explained / actual_tot * 100, 2) if actual_tot else None
    return {"rows": rows, "reconciled_pct": reconciled_pct,
            "residual_total": round(actual_tot - explained, 2),
            "null_reason": None if rows else "serving_not_loaded"}


def _pareto_block(ncrs: list[dict]) -> dict:
    if not ncrs:
        return {"rows": [], "concentration_pct": None, "null_reason": "serving_not_loaded"}
    agg: dict[str, dict] = {}
    for n in ncrs:
        label = n.get("cluster_label") or f"{n.get('defect_code')}·{n.get('work_center')}"
        a = agg.setdefault(label, {"cluster_label": label, "ncr_count": 0, "rework_cost": 0.0})
        a["ncr_count"] += 1
        a["rework_cost"] += _f(n.get("estimated_rework_cost"))
    ranked = sorted(agg.values(), key=lambda x: x["rework_cost"], reverse=True)
    total = sum(a["rework_cost"] for a in ranked) or 0.0
    cum = 0.0
    for a in ranked:
        a["rework_cost"] = round(a["rework_cost"], 2)
        cum += a["rework_cost"]
        a["cumulative_rework_pct"] = round(cum / total * 100, 2) if total else 0.0
    concentration = round(ranked[0]["rework_cost"] / total * 100, 2) if total else None
    return {"rows": ranked, "concentration_pct": concentration, "n_ncrs": len(ncrs), "null_reason": None}


def _workcenter_block(ops: list[dict], wos: list[dict]) -> dict:
    if not ops:
        return {"rows": [], "null_reason": "serving_not_loaded"}
    sub_by_wo = {w.get("work_order_no"): w.get("subassembly") for w in wos}
    agg: dict[tuple, dict] = {}
    for o in ops:
        wc = o.get("work_center") or "unknown"
        sub = sub_by_wo.get(o.get("work_order_no")) or "unknown"
        a = agg.setdefault((wc, sub), {"work_center": wc, "subassembly": sub,
                                       "actual_minutes": 0.0, "std_minutes": 0.0, "op_count": 0})
        a["actual_minutes"] += _f(o.get("actual_minutes"))
        a["std_minutes"] += _f(o.get("std_minutes"))
        a["op_count"] += 1
    rows = []
    for a in agg.values():
        a["actual_minutes"] = round(a["actual_minutes"], 1)
        a["std_minutes"] = round(a["std_minutes"], 1)
        a["actual_std_ratio"] = round(a["actual_minutes"] / a["std_minutes"], 3) if a["std_minutes"] else None
        a["low_n"] = a["op_count"] < 5
        rows.append(a)
    rows.sort(key=lambda x: x["actual_minutes"], reverse=True)
    return {"rows": rows, "null_reason": None}


def _recon_block(recon: list[dict]) -> dict:
    if not recon:
        return {"rows": [], "threshold_sensitivity": [], "null_reason": "serving_not_loaded"}
    rows = []
    for r in recon:
        vp = _f(r.get("variance_pct"))
        rows.append({"work_order_id": r.get("work_order_no"), "vehicle_serial": r.get("vehicle_serial"),
                     "standard_cost": round(_f(r.get("standard_cost")), 2),
                     "actual_cost": round(_f(r.get("actual_cost")), 2),
                     "variance_pct": round(vp, 2), "variance_category": r.get("variance_category"),
                     "reconciliation_status": r.get("reconciliation_status"),
                     "is_exception": abs(vp) >= RECON_EXCEPTION_PCT})
    # threshold sensitivity: how many WOs are exceptions as the band moves — shows the fixed band's grip.
    sweep = [{"k": k, "exception_count": sum(1 for r in recon if abs(_f(r.get("variance_pct"))) >= k)}
             for k in (15, 20, 25, 30, 40, 50, 65)]
    return {"rows": rows, "threshold_sensitivity": sweep, "exception_threshold_pct": RECON_EXCEPTION_PCT,
            "null_reason": None}


def _disconfirmation_block(recon: list[dict], ncrs: list[dict], ov: list[dict], geneal: list[dict]) -> dict:
    """Look for what the scenario did NOT plant — the 'not replaying seeds' rebuttal. Honest 0 is fine."""
    ncr_wos = {n.get("work_order_no") for n in ncrs if n.get("work_order_no")}
    findings = []
    # 1) WO over threshold with no linked NCR
    for r in recon:
        if abs(_f(r.get("variance_pct"))) >= RECON_EXCEPTION_PCT and r.get("work_order_no") not in ncr_wos:
            findings.append({"kind": "exception_without_ncr", "ref": r.get("work_order_no"),
                             "detail": f"variance {round(_f(r.get('variance_pct')),1)}% but no linked NCR"})
    # 2) NCR with rework $ but its WO is not a cost exception
    recon_excep_wo = {r.get("work_order_no") for r in recon if abs(_f(r.get("variance_pct"))) >= RECON_EXCEPTION_PCT}
    for n in ncrs:
        if _f(n.get("estimated_rework_cost")) > 0 and n.get("work_order_no") not in recon_excep_wo:
            findings.append({"kind": "rework_without_variance", "ref": n.get("ncr_id"),
                             "detail": "rework cost recorded but its work order is within tolerance"})
    # 3) SUSPECT-lot exposed vehicle that is not blocked. "Suspect" = a lot that actually carries an NCR
    #    (not any tracked lot) — otherwise every vehicle with a routine lot is flagged, which is noise and
    #    mislabels a clean vehicle as "contains a suspect lot". This narrowing is what makes VEH-DEMO-002
    #    (has the NCR'd lot but on_track) the meaningful finding and drops the false VEH-DEMO-003.
    suspect_lots = {n.get("lot_no") for n in ncrs if n.get("lot_no")}
    exposed = {g.get("vehicle_serial") for g in geneal
               if g.get("child_type") == "lot" and g.get("lot_no") in suspect_lots}
    for o in ov:
        if o.get("vehicle_serial") in exposed and o.get("readiness_state") != "blocked":
            findings.append({"kind": "exposed_not_blocked", "ref": o.get("vehicle_serial"),
                             "detail": f"contains a suspect (NCR'd) lot but readiness={o.get('readiness_state')}"})
    return {"findings": findings, "checks_run": 3, "null_reason": None}


def _analytics_kpis(ov: list[dict], rollup: list[dict], recon: list[dict], ncrs: list[dict],
                    ops: list[dict]) -> dict:
    total_variance = round(sum(_f(r.get("variance_amount")) for r in recon), 2)
    actual_tot = sum(_f(r.get("total_actual_cost")) for r in rollup) or 0.0
    rework_tot = sum(_f(r.get("ncr_rework_cost")) for r in rollup)
    excep = len([r for r in recon if str(r.get("reconciliation_status")) == "exception"])
    suspect_vehicles = len([o for o in ov if o.get("affected_by_suspect_lot")])
    wc_minutes: dict[str, float] = {}
    for o in ops:
        wc_minutes[o.get("work_center") or "unknown"] = wc_minutes.get(o.get("work_center") or "unknown", 0.0) + _f(o.get("actual_minutes"))
    busiest = max(wc_minutes, key=wc_minutes.get) if wc_minutes else None
    rework_by_cluster: dict[str, float] = {}
    for n in ncrs:
        label = n.get("cluster_label") or "unknown"
        rework_by_cluster[label] = rework_by_cluster.get(label, 0.0) + _f(n.get("estimated_rework_cost"))
    ncr_rework_tot = sum(rework_by_cluster.values()) or 0.0
    concentration = round(max(rework_by_cluster.values()) / ncr_rework_tot * 100, 2) if ncr_rework_tot else None
    return {
        "total_variance": total_variance,
        "rework_share_pct": round(rework_tot / actual_tot * 100, 2) if actual_tot else None,
        "recon_exception_count": excep,
        "suspect_lot_vehicle_count": suspect_vehicles,
        "busiest_work_center": busiest,
        "defect_concentration_pct": concentration,
    }


def analytics(*, env_id: str, business_id: UUID, vehicle_serial: str | None = None) -> dict:
    """Build Analytics — live simulation-analysis blocks over the rel_* serving marts.

    Per-block null_reason (one empty supporting mart degrades that block, not the page). Page-level
    null_reason only if a CORE mart (rel_build_overview or rel_build_cost_rollup) is empty. vehicle_serial
    refilters readiness + bridge only; the program-wide blocks (blast/pareto/workcenter/recon/
    disconfirmation/asymmetry) stay global.
    """
    try:
        with get_cursor() as cur:
            resolve_tenant_id(cur, business_id)
            ov = _fetch(cur, "rel_build_overview", env_id, business_id, "vehicle_serial")
            rollup = _fetch(cur, "rel_build_cost_rollup", env_id, business_id, "work_order_no")
            recon = _fetch(cur, "rel_mes_erp_reconciliation", env_id, business_id, "work_order_no")
            ncrs = _fetch(cur, "rel_ncr_traceability", env_id, business_id, "ncr_id")
            geneal = _fetch(cur, "rel_as_built_genealogy", env_id, business_id, "vehicle_serial")
            ops = _fetch(cur, "rel_mes_operation_execution", env_id, business_id, "exec_id")
            wos = _fetch(cur, "rel_mes_work_order", env_id, business_id, "work_order_no")
    except _MISSING:
        return _empty("serving_table_missing", kpis=None, blocks={})
    if not ov or not rollup:
        return _empty("serving_not_loaded", kpis=None, blocks={})
    return {
        "source_kind": "live-rows", "serving_provenance": _provenance(ov), "as_of": _as_of(ov),
        "null_reason": None,
        "kpis": _analytics_kpis(ov, rollup, recon, ncrs, ops),
        "blocks": {
            "readiness": _readiness_block(ov, ncrs, vehicle_serial),
            "asymmetry": _asymmetry_block(ov, ncrs, geneal),
            "blast": _blast_block(ov, ncrs, recon, geneal),
            "bridge": _bridge_block(ov, rollup, vehicle_serial),
            "pareto": _pareto_block(ncrs),
            "workcenter": _workcenter_block(ops, wos),
            "recon": _recon_block(recon),
            "disconfirmation": _disconfirmation_block(recon, ncrs, ov, geneal),
        },
    }


def lineage(*, env_id: str, business_id: UUID) -> dict:
    try:
        with get_cursor() as cur:
            resolve_tenant_id(cur, business_id)
            cur.execute(
                """SELECT * FROM rel_source_lineage_manifest
                   WHERE env_id = %s AND business_id = %s ORDER BY layer, object_name""",
                (env_id, str(business_id)))
            rows = [dict(r) for r in cur.fetchall()]
            # live serving health: row counts per serving table, proving the Lakebase path
            serving = {}
            for t in ("rel_build_overview", "rel_as_built_genealogy", "rel_ncr_traceability",
                      "rel_build_cost_rollup", "rel_mes_erp_reconciliation"):
                cur.execute(f"SELECT count(*)::int AS n, max(serving_provenance) AS prov FROM {t} "
                            f"WHERE env_id = %s AND business_id = %s", (env_id, str(business_id)))
                r = cur.fetchone() or {}
                serving[t] = {"row_count": r.get("n", 0), "serving_provenance": r.get("prov")}
    except _MISSING:
        return _empty("serving_table_missing", serving={})
    if not rows:
        return _empty("serving_not_loaded", serving={})
    return {"rows": rows, "serving": serving, "source_kind": _kind(rows),
            "serving_provenance": _provenance(rows), "as_of": _as_of(rows), "null_reason": None}


def source_rows(*, env_id: str, business_id: UUID, table: str, key: str | None = None,
                value: str | None = None, limit: int = 200) -> dict:
    if table not in SOURCE_TABLES:
        return _empty("unknown_source_table", table=table, columns=[], row_count=0)
    if key is not None and not _COL_RE.match(key):
        return _empty("invalid_filter_key", table=table, columns=[], row_count=0)
    limit = max(1, min(int(limit), 1000))
    try:
        with get_cursor() as cur:
            resolve_tenant_id(cur, business_id)
            params: list = [env_id, str(business_id)]
            where = "env_id = %s AND business_id = %s"
            if key and value is not None:
                where += f" AND {key} = %s"
                params.append(value)
            cur.execute(f"SELECT * FROM {table} WHERE {where} LIMIT {limit}", tuple(params))
            rows = [dict(r) for r in cur.fetchall()]
    except _MISSING:
        return _empty("serving_table_missing", table=table, columns=[], row_count=0)
    columns = list(rows[0].keys()) if rows else []
    if not rows:
        return _empty("no_rows_for_filter", table=table, columns=[], row_count=0)
    return {"table": table, "columns": columns, "rows": rows, "row_count": len(rows),
            "source_kind": "live-rows", "serving_provenance": None, "as_of": _as_of(rows),
            "null_reason": None}
