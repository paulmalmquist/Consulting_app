"""Relativity MES Sandbox — Databricks medallion (Phase 10).

Runs the whole medallion in ONE warehouse session against novendor_1.relativity_mes:

  bronze_rel_*   raw landing of the deterministic synthetic source (from rel_bronze_load.sql)
  silver_rel_*   conformed layer (CTAS from bronze, synthetic-only data contract)
  gold_rel_*     the five gold marts materialized as Delta (the deterministic computed product)

It then INDEPENDENTLY validates the demo invariants from the SILVER layer (3 vehicles, the suspect
lot installed on exactly two vehicles, an open major NCR) and from GOLD (a reconciliation exception),
proving the data really flowed through Databricks. Finally it READS gold_rel_* back from Databricks
and emits an idempotent serving-sync SQL (rel_serving_databricks_gold.sql) that loads the
Postgres/Lakebase serving tables with serving_provenance='databricks-gold'.

Apply the emitted serving SQL to Lakebase with apply.js (owner credential). Everything is SYNTHETIC.

Run: python telemetry-platform/databricks/relativity_mes/rel_medallion.py
"""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE.parents[3]
_DBX_DIR = _HERE.parents[1]
for p in (_REPO_ROOT, str(_DBX_DIR)):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from _bootstrap import get_client  # noqa: E402  (telemetry-platform/databricks/_bootstrap.py)
from scripts.relativity_mes_seed.generate import (  # noqa: E402
    BUSINESS_ID, ENV_ID, INGEST_BATCH, SUSPECT_LOT, build_dataset,
)
from scripts.relativity_mes_seed.emit import (  # noqa: E402
    SERVING_MAP, _columns, _infer_types, _lit, build_bronze_sql, build_gold_dbx_sql,
)

CATALOG, SCHEMA = "novendor_1", "relativity_mes"
NS = f"{CATALOG}.{SCHEMA}"
SERVING_OUT = _HERE.parent / "rel_serving_databricks_gold.sql"


def _statements(sql_text: str) -> list[str]:
    # Split on ';' at end of line; tolerant of the simple generated SQL (no embedded semicolons).
    parts, buf = [], []
    for line in sql_text.splitlines():
        if line.strip().startswith("--") and not buf:
            continue
        buf.append(line)
        if line.rstrip().endswith(";"):
            stmt = "\n".join(buf).strip().rstrip(";").strip()
            if stmt:
                parts.append(stmt)
            buf = []
    return parts


def _run(client, sql: str):
    resp = client.execute_sql(sql, wait=True)
    state = resp.get("status", {}).get("state")
    if state not in ("SUCCEEDED", "FINISHED"):
        raise RuntimeError(f"SQL not OK ({state}): {sql[:120]} :: {resp.get('status')}")
    return resp


def _fetch(client, sql: str) -> tuple[list[str], list[list]]:
    resp = _run(client, sql)
    cols = [c["name"] for c in resp.get("manifest", {}).get("schema", {}).get("columns", [])]
    rows = resp.get("result", {}).get("data_array", []) or []
    total = resp.get("manifest", {}).get("total_row_count", len(rows))
    sid = resp.get("statement_id")
    chunks = resp.get("manifest", {}).get("chunks", [])
    if sid and len(rows) < total and len(chunks) > 1:
        for ch in chunks[1:]:
            more = client._request("GET", f"/api/2.0/sql/statements/{sid}/result/chunks/{ch['chunk_index']}")
            rows.extend(more.get("data_array", []) or [])
    return cols, rows


def main() -> int:
    ds = build_dataset()
    bronze_sql = build_bronze_sql(ds)
    gold_sql = build_gold_dbx_sql(ds)
    source_tables = list(ds["source"].keys())

    client = get_client()
    client.start_warehouse()
    client.wait_for_warehouse("RUNNING", 300)
    try:
        print("[medallion] bronze: landing synthetic source …")
        for stmt in _statements(bronze_sql):
            _run(client, stmt)
        print(f"[medallion] bronze: {len(source_tables)} tables loaded")

        print("[medallion] silver: conforming (CTAS, synthetic-only data contract) …")
        for t in source_tables:
            _run(client, f"CREATE OR REPLACE TABLE {NS}.silver_{t} AS "
                         f"SELECT * FROM {NS}.bronze_{t} WHERE synthetic = true")
        print(f"[medallion] silver: {len(source_tables)} tables conformed")

        print("[medallion] gold: materializing the five marts as Delta …")
        for stmt in _statements(gold_sql):
            _run(client, stmt)

        # ---- independent validation FROM silver/gold (proves the flow) ----
        _, veh = _fetch(client, f"SELECT count(DISTINCT vehicle_serial) FROM {NS}.silver_rel_mes_vehicle")
        _, sl = _fetch(client, f"SELECT count(DISTINCT vehicle_serial) FROM {NS}.silver_rel_mes_as_built_genealogy "
                               f"WHERE lot_no = '{SUSPECT_LOT}'")
        _, om = _fetch(client, f"SELECT count(*) FROM {NS}.silver_rel_mes_nonconformance "
                               f"WHERE status='open' AND severity='major'")
        _, exc = _fetch(client, f"SELECT count(*) FROM {NS}.gold_rel_mes_erp_reconciliation "
                                f"WHERE reconciliation_status='exception'")
        n_veh, n_sl, n_om, n_exc = int(veh[0][0]), int(sl[0][0]), int(om[0][0]), int(exc[0][0])
        print(f"[medallion] VALIDATE  vehicles={n_veh}  suspect_lot_vehicles={n_sl}  "
              f"open_major_ncr={n_om}  reconciliation_exceptions={n_exc}")
        assert n_veh == 3, f"expected 3 vehicles, got {n_veh}"
        assert n_sl == 2, f"suspect lot must affect exactly 2 vehicles, got {n_sl}"
        assert n_om >= 1, "expected an open major NCR"
        assert n_exc >= 1, "expected a reconciliation exception"

        # ---- read gold_rel_* back from Databricks -> emit serving sync SQL ----
        print("[medallion] sync: reading gold_rel_* from Databricks and emitting serving SQL …")
        emit_serving_sql(client, ds)
    finally:
        client.stop_warehouse()

    print(f"[medallion] wrote {SERVING_OUT.name}. Apply to Lakebase with apply.js (owner credential):")
    print(f"  node repo-b/db/schema/apply.js (DATABASE_URL=<owner>) --files {SERVING_OUT.name}")
    return 0


def emit_serving_sql(client, ds) -> None:
    L = [
        f"-- {SERVING_OUT.name}  (GENERATED by rel_medallion.py — do not hand-edit)",
        "-- SYNTHETIC Relativity MES Sandbox: loads the Postgres/Lakebase serving tables from the",
        "-- Databricks gold marts (gold_rel_*). serving_provenance='databricks-gold'. Idempotent.",
        "BEGIN;",
    ]
    e, b = f"'{ENV_ID}'", f"'{BUSINESS_ID}'"
    for mart, table in SERVING_MAP.items():
        cols = _columns(ds["gold"][mart])
        types = _infer_types(ds["gold"][mart])
        # read the rows back FROM Databricks (the real sync), aligned to the local column order
        col_list = ", ".join(cols)
        dcols, drows = _fetch(client, f"SELECT {col_list} FROM {NS}.gold_{table}")
        L.append(f"DELETE FROM {table} WHERE ingest_batch_id = '{INGEST_BATCH}';")
        insert_cols = ["env_id", "business_id"] + cols + ["serving_provenance"]
        values = []
        for row in drows:
            cells = [e, b]
            for i, c in enumerate(cols):
                cells.append(_lit(_coerce(row[dcols.index(c)], types[c]), types[c]))
            cells.append("'databricks-gold'")
            values.append("  (" + ", ".join(cells) + ")")
        if values:
            L.append(f"INSERT INTO {table} ({', '.join(insert_cols)}) VALUES")
            L.append(",\n".join(values) + ";")
    L.append("COMMIT;")
    SERVING_OUT.write_text("\n".join(L) + "\n", encoding="utf-8")


def _coerce(value, pg_type: str):
    if value is None:
        return None
    if pg_type == "boolean":
        return str(value).lower() in ("true", "t", "1")
    if pg_type == "numeric":
        try:
            return float(value)
        except (TypeError, ValueError):
            return value
    return value


if __name__ == "__main__":
    sys.exit(main())
