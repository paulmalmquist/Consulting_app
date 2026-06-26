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
