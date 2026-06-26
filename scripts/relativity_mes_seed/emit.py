"""Render the synthetic dataset to the real serving architecture artifacts.

The deterministic generator is the single source of truth. From one build it emits:
  - repo-b/db/schema/10037_relativity_mes_sandbox_source.sql  — rel_* SOURCE tables (Postgres/Lakebase,
    RLS, seeded) so the "drill to source rows" path reads real serving rows, not local JSON.
  - repo-b/db/schema/10038_relativity_mes_sandbox_serving.sql — flat rel_* SERVING marts +
    rel_source_lineage_manifest (Postgres/Lakebase, RLS) with a BOOTSTRAP load of the computed gold
    rows (serving_provenance='seed-bootstrap'). The Databricks medallion overwrites these with
    Databricks-derived gold (serving_provenance='databricks-gold') when it runs.
  - telemetry-platform/databricks/relativity_mes/rel_bronze_load.sql — Databricks SQL that lands the
    same synthetic source into bronze Delta tables in novendor_1.relativity_mes (the medallion input).

No frontend/backend JSON fixtures are emitted: dashboards read the FastAPI APIs, which read the
serving tables. (A small canonical source JSON is written next to the Databricks notebooks purely as
a committed, reviewable record of the deterministic seed.)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .generate import (
    AS_OF, BUSINESS_ID, ENV_ID, INGEST_BATCH, MASTER_SEED, build_dataset,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = REPO_ROOT / "repo-b" / "db" / "schema"
DBX_DIR = REPO_ROOT / "telemetry-platform" / "databricks" / "relativity_mes"

SOURCE_MIGRATION = SCHEMA_DIR / "10037_relativity_mes_sandbox_source.sql"
SERVING_MIGRATION = SCHEMA_DIR / "10038_relativity_mes_sandbox_serving.sql"
DBX_BRONZE_SQL = DBX_DIR / "rel_bronze_load.sql"
SEED_RECORD = DBX_DIR / "rel_seed_source.json"

DBX_CATALOG = "novendor_1"
DBX_SCHEMA = "relativity_mes"

# Gold mart -> flat serving table name.
SERVING_MAP = {
    "gold.rel_build_overview": "rel_build_overview",
    "gold.rel_as_built_genealogy": "rel_as_built_genealogy",
    "gold.rel_ncr_traceability": "rel_ncr_traceability",
    "gold.rel_build_cost_rollup": "rel_build_cost_rollup",
    "gold.rel_mes_erp_reconciliation": "rel_mes_erp_reconciliation",
}

DASHBOARD_CONSUMERS = {
    "rel_mes_vehicle": ["Build Overview", "Build Genealogy"],
    "rel_mes_as_built_genealogy": ["Build Genealogy", "Build Overview"],
    "rel_mes_nonconformance": ["NCR Traceability", "Build Genealogy", "Build Overview"],
    "rel_mes_disposition": ["NCR Traceability", "Build Genealogy"],
    "rel_mes_material_consumption": ["Cost Reconciliation", "Build Genealogy"],
    "rel_mes_operation_execution": ["Cost Reconciliation", "Build Genealogy"],
    "rel_erp_production_order": ["Cost Reconciliation"],
    "rel_erp_cost_variance": ["Cost Reconciliation"],
    "rel_plm_eco": ["Build Genealogy", "Lineage & Source Tables"],
    "rel_xwalk_part_identity": ["Lineage & Source Tables", "Cost Reconciliation"],
}

# Real Relativity / Manufacturo identifiers must never appear in a synthetic data row.
BANNED = ("relativity", "manufacturo", "terran", "aeon", "andea")


def _columns(rows: list[dict[str, Any]]) -> list[str]:
    cols: list[str] = []
    for r in rows:
        for k in r:
            if k not in cols:
                cols.append(k)
    return cols


def _infer_types(rows: list[dict[str, Any]]) -> dict[str, str]:
    cols = _columns(rows)
    types: dict[str, str] = {}
    for c in cols:
        if c == "as_of":
            types[c] = "timestamptz"
            continue
        if c == "business_id":
            types[c] = "uuid"
            continue
        vals = [r.get(c) for r in rows if r.get(c) is not None]
        if vals and all(isinstance(v, bool) for v in vals):
            types[c] = "boolean"
        elif vals and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vals):
            types[c] = "numeric"
        else:
            types[c] = "text"
    return types


def _lit(value: Any, pg_type: str) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if pg_type == "numeric" and isinstance(value, (int, float)):
        return str(value)
    s = str(value).replace("'", "''")
    return f"'{s}'"


def _table_ddl(table: str, rows: list[dict[str, Any]], comment: str,
               extra_cols: dict[str, str] | None = None) -> str:
    """Postgres CREATE + RLS + idempotent seed for one table (public schema, rel_ prefix).

    extra_cols injects fixed-value columns not in the row dicts (e.g. serving_provenance).
    """
    cols = _columns(rows)
    types = _infer_types(rows)
    extra_cols = extra_cols or {}
    declared = [
        "  env_id text NOT NULL DEFAULT 'telemetry-demo'",
        "  business_id uuid NOT NULL DEFAULT '" + BUSINESS_ID + "'",
    ]
    for c in cols:
        declared.append(f"  {c} {types[c]}")
    for c in extra_cols:
        declared.append(f"  {c} text")
    lines = [
        f"CREATE TABLE IF NOT EXISTS {table} (",
        ",\n".join(declared),
        ");",
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;",
        "DO $$ BEGIN",
        f"  CREATE POLICY {table}_tenant ON {table}",
        "    USING (env_id = current_setting('app.env_id', true))",
        "    WITH CHECK (env_id = current_setting('app.env_id', true));",
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
        f"COMMENT ON TABLE {table} IS '{comment}';",
        f"DELETE FROM {table} WHERE ingest_batch_id = '{INGEST_BATCH}';",
    ]
    insert_cols = ["env_id", "business_id"] + cols + list(extra_cols.keys())
    values = []
    for r in rows:
        vals = [f"'{ENV_ID}'", f"'{BUSINESS_ID}'"]
        for c in cols:
            vals.append(_lit(r.get(c), types[c]))
        for c in extra_cols:
            vals.append(f"'{extra_cols[c]}'")
        values.append("  (" + ", ".join(vals) + ")")
    if values:
        lines.append(f"INSERT INTO {table} ({', '.join(insert_cols)}) VALUES")
        lines.append(",\n".join(values) + ";")
    return "\n".join(lines) + "\n"


HEADER = (
    "-- {file}\n"
    "-- SYNTHETIC Relativity MES Sandbox — {kind}.\n"
    "-- Generated by scripts/relativity_mes_seed (deterministic, master_seed={seed}). DO NOT hand-edit;\n"
    "-- regenerate with: python -m scripts.relativity_mes_seed.emit\n"
    "-- Shaped like a Manufacturo MES + generic ERP/PLM facsimile. Not real Relativity data,\n"
    "-- not a real schema, not a real API. Every row carries synthetic=true.\n\n"
)


def _manifest_rows(ds: dict[str, Any]) -> list[dict[str, Any]]:
    """One row per medallion object for rel_source_lineage_manifest (the Lineage dashboard)."""
    src, gold = ds["source"], ds["gold"]
    rows: list[dict[str, Any]] = []
    for table, data in src.items():
        cols = _columns(data)
        rows.append({
            "object_name": table, "layer": "source",
            "source_system": data[0]["source_system"] if data else "MES",
            "grain": cols[0] if cols else "id", "primary_key": cols[0] if cols else "id",
            "row_count": len(data),
            "dashboard_consumers": json.dumps(DASHBOARD_CONSUMERS.get(table, [])),
            "join_keys": "", "null_reason": None,
            "synthetic": True, "source_system_layer": "rel_*", "as_of": AS_OF,
        })
    for mart, data in gold.items():
        serving = SERVING_MAP.get(mart, mart)
        rows.append({
            "object_name": serving, "layer": "gold/serving",
            "source_system": "Gold", "grain": "computed mart", "primary_key": _columns(data)[2] if data else "id",
            "row_count": len(data), "dashboard_consumers": json.dumps([]),
            "join_keys": "", "null_reason": None,
            "synthetic": True, "source_system_layer": f"{mart} -> {serving}", "as_of": AS_OF,
        })
    join_keys = [
        "plm_part_no <-> mes_part_no / product_code <-> erp_material_id (rel_xwalk_part_identity)",
        "rel_mes_work_order.prod_order_no <-> rel_erp_production_order.mfg_order_no",
        "rel_mes_lot.lot_no threads rel_mes_material_consumption + rel_mes_as_built_genealogy",
        "rel_mes_unit.unit_serial threads the genealogy tree",
        "ncr.unit_serial_or_lot <-> affected vehicle trace",
    ]
    rows.append({
        "object_name": "join_key_map", "layer": "doc", "source_system": "Gold",
        "grain": "n/a", "primary_key": "n/a", "row_count": len(join_keys),
        "dashboard_consumers": json.dumps(["Lineage & Source Tables"]),
        "join_keys": json.dumps(join_keys), "null_reason": None,
        "synthetic": True, "source_system_layer": "doc", "as_of": AS_OF,
    })
    for r in rows:
        r.update(source_table="rel_source_lineage_manifest", source_pk=r["object_name"],
                 ingest_batch_id=INGEST_BATCH)
    return rows


def build_sql(ds: dict[str, Any]) -> tuple[str, str]:
    src, gold = ds["source"], ds["gold"]

    source_sql = HEADER.format(file=SOURCE_MIGRATION.name, kind="raw source-system tables (rel_*)",
                               seed=MASTER_SEED)
    for table, rows in src.items():
        source_sql += _table_ddl(
            table, rows,
            comment=f"SYNTHETIC {rows[0]['source_system'] if rows else 'MES'} source-system facsimile "
                    f"(Relativity MES Sandbox). Not real program data.") + "\n"

    serving_sql = HEADER.format(file=SERVING_MIGRATION.name,
                                kind="flat serving marts (rel_*) + lineage manifest", seed=MASTER_SEED)
    serving_sql += (
        "-- Serving tables are the Postgres/Lakebase read layer the FastAPI routes query. They are\n"
        "-- BOOTSTRAPPED here from the deterministic gold rows (serving_provenance='seed-bootstrap');\n"
        "-- the Databricks medallion (telemetry-platform/databricks/relativity_mes) overwrites them\n"
        "-- with Databricks-computed gold (serving_provenance='databricks-gold') when it runs.\n\n"
    )
    for mart, table in SERVING_MAP.items():
        serving_sql += _table_ddl(
            table, gold[mart],
            comment="SYNTHETIC gold serving mart (Relativity MES Sandbox), Postgres/Lakebase read layer.",
            extra_cols={"serving_provenance": "seed-bootstrap"}) + "\n"
    serving_sql += _table_ddl(
        "rel_source_lineage_manifest", _manifest_rows(ds),
        comment="SYNTHETIC source/medallion lineage manifest (Relativity MES Sandbox).",
        extra_cols={"serving_provenance": "seed-bootstrap"}) + "\n"
    # Grant the backend serving role read access to every rel_* table. Owner-created tables are NOT
    # covered by default privileges (verified on Lakebase), so this is required for the FastAPI routes
    # (role telemetry_app, BYPASSRLS) to read. Guarded so CI/local Postgres without the role no-op.
    serving_sql += (
        "DO $$ DECLARE r record; BEGIN\n"
        "  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='telemetry_app') THEN\n"
        "    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'rel\\_%' LOOP\n"
        "      EXECUTE format('GRANT SELECT ON public.%I TO telemetry_app', r.tablename);\n"
        "    END LOOP;\n"
        "  END IF;\n"
        "END $$;\n"
    )
    return source_sql, serving_sql


# ── Databricks bronze-load SQL (Delta) ──────────────────────────────────────────


def _dbx_type(pg_type: str) -> str:
    return {"numeric": "DOUBLE", "boolean": "BOOLEAN", "timestamptz": "TIMESTAMP", "uuid": "STRING"}.get(
        pg_type, "STRING")


def _dbx_lit(value: Any, pg_type: str) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if pg_type == "numeric" and isinstance(value, (int, float)):
        return str(value)
    if pg_type == "timestamptz":
        return "TIMESTAMP'" + str(value).replace("T", " ").replace("Z", "") + "'"
    s = str(value).replace("'", "\\'")
    return f"'{s}'"


def build_bronze_sql(ds: dict[str, Any]) -> str:
    src = ds["source"]
    out = HEADER.format(file=DBX_BRONZE_SQL.name, kind="Databricks bronze landing (Delta)", seed=MASTER_SEED)
    out += f"CREATE SCHEMA IF NOT EXISTS {DBX_CATALOG}.{DBX_SCHEMA};\n\n"
    for table, rows in src.items():
        cols = _columns(rows)
        types = _infer_types(rows)
        bronze = f"{DBX_CATALOG}.{DBX_SCHEMA}.bronze_{table}"
        col_defs = ",\n  ".join(f"{c} {_dbx_type(types[c])}" for c in cols) + ",\n  _ingest_batch_id STRING"
        out += f"CREATE OR REPLACE TABLE {bronze} (\n  {col_defs}\n) USING DELTA;\n"
        value_rows = []
        for r in rows:
            vals = [_dbx_lit(r.get(c), types[c]) for c in cols] + [f"'{INGEST_BATCH}'"]
            value_rows.append("  (" + ", ".join(vals) + ")")
        if value_rows:
            out += f"INSERT INTO {bronze} VALUES\n" + ",\n".join(value_rows) + ";\n"
        out += "\n"
    return out


def build_gold_dbx_sql(ds: dict[str, Any]) -> str:
    """Databricks SQL that materializes the deterministic gold marts as Delta tables (gold_rel_*).

    The gold marts are the deterministic computed product (see ADR 0002 — the generator is the gold
    transform); this lands them in Unity Catalog so the medallion holds bronze (raw) → silver
    (conformed, built by the orchestrator's CTAS) → gold (these marts), and serving syncs FROM gold.
    """
    gold = ds["gold"]
    out = HEADER.format(file="rel_gold_load.sql", kind="Databricks gold marts (Delta)", seed=MASTER_SEED)
    out += f"CREATE SCHEMA IF NOT EXISTS {DBX_CATALOG}.{DBX_SCHEMA};\n\n"
    for mart, rows in gold.items():
        table = f"{DBX_CATALOG}.{DBX_SCHEMA}.gold_{SERVING_MAP[mart]}"
        cols = _columns(rows)
        types = _infer_types(rows)
        col_defs = ",\n  ".join(f"{c} {_dbx_type(types[c])}" for c in cols)
        out += f"CREATE OR REPLACE TABLE {table} (\n  {col_defs}\n) USING DELTA;\n"
        value_rows = ["  (" + ", ".join(_dbx_lit(r.get(c), types[c]) for c in cols) + ")" for r in rows]
        if value_rows:
            out += f"INSERT INTO {table} VALUES\n" + ",\n".join(value_rows) + ";\n"
        out += "\n"
    return out


def assert_no_banned(ds: dict[str, Any]) -> None:
    blob = json.dumps({"source": ds["source"], "gold": ds["gold"]}).lower()
    for term in BANNED:
        if term in blob:
            raise AssertionError(f"banned identifier '{term}' leaked into a synthetic data row")


def main() -> None:
    ds = build_dataset()
    assert_no_banned(ds)
    source_sql, serving_sql = build_sql(ds)
    bronze_sql = build_bronze_sql(ds)

    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
    DBX_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_MIGRATION.write_text(source_sql, encoding="utf-8")
    SERVING_MIGRATION.write_text(serving_sql, encoding="utf-8")
    DBX_BRONZE_SQL.write_text(bronze_sql, encoding="utf-8")
    SEED_RECORD.write_text(json.dumps(ds, indent=2) + "\n", encoding="utf-8")

    print("wrote Postgres/Lakebase migrations:")
    print(f"  {SOURCE_MIGRATION.name} (source rel_* tables)")
    print(f"  {SERVING_MIGRATION.name} (flat rel_* serving + lineage manifest)")
    print("wrote Databricks medallion input:")
    print(f"  {DBX_BRONZE_SQL.relative_to(REPO_ROOT)}")
    print(f"  {SEED_RECORD.relative_to(REPO_ROOT)}")
    print("source row counts:", json.dumps({t: len(r) for t, r in ds["source"].items()}))
    print("serving row counts:", json.dumps({SERVING_MAP[m]: len(r) for m, r in ds["gold"].items()}))


if __name__ == "__main__":
    main()
