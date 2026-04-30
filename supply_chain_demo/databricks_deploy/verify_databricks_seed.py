"""
verify_databricks_seed.py — Validate that all 19 Delta tables exist and are populated.

Resolves a verification path in this order:
  1. DATABRICKS_SQL_WAREHOUSE_ID set → use SQL Statement Execution API (fast)
  2. DATABRICKS_CLUSTER_ID set       → upload + run a verification notebook (slower)
  3. neither set                     → exit 2 with instructions

Usage:
    python verify_databricks_seed.py

Exits:
    0 — all checks pass
    1 — one or more tables empty or business check failed
    2 — neither DATABRICKS_SQL_WAREHOUSE_ID nor DATABRICKS_CLUSTER_ID configured

Requirements: requests, python-dotenv
"""

import base64
import os
import sys
import time

import requests
from dotenv import load_dotenv

load_dotenv()

HOST = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
TOKEN = os.environ.get("DATABRICKS_TOKEN", "")
WAREHOUSE_ID = os.environ.get("DATABRICKS_SQL_WAREHOUSE_ID", "")
CLUSTER_ID = os.environ.get("DATABRICKS_CLUSTER_ID", "")
CATALOG = os.environ.get("DATABRICKS_CATALOG", "supply_chain_demo")
BRONZE = os.environ.get("DATABRICKS_BRONZE_SCHEMA", "bronze")
SILVER = os.environ.get("DATABRICKS_SILVER_SCHEMA", "silver")
SEMANTIC = os.environ.get("DATABRICKS_GOLD_SCHEMA", "semantic")
NOTEBOOK_PATH_CFG = os.environ.get(
    "DATABRICKS_NOTEBOOK_PATH",
    "/Users/<your-email@domain.com>/supply_chain_demo",
)

POLL_INTERVAL_SQL = 3
TIMEOUT_SQL = 120
POLL_INTERVAL_RUN = 10
TIMEOUT_RUN = 600

ALL_TABLES = [
    (BRONZE, "raw_supplier_master"),
    (BRONZE, "raw_item_master"),
    (BRONZE, "raw_location_master"),
    (BRONZE, "raw_purchase_orders"),
    (BRONZE, "raw_shipments"),
    (BRONZE, "raw_inventory_snapshots"),
    (BRONZE, "raw_production_events"),
    (SILVER, "dim_supplier"),
    (SILVER, "dim_item"),
    (SILVER, "dim_location"),
    (SILVER, "fact_inventory_position"),
    (SILVER, "fact_order_cycle"),
    (SILVER, "fact_shipment_event"),
    (SILVER, "fact_production_output"),
    (SEMANTIC, "supplier_otif_scorecard"),
    (SEMANTIC, "inventory_risk_daily"),
    (SEMANTIC, "demand_supply_gap"),
    (SEMANTIC, "logistics_cost_to_serve"),
    (SEMANTIC, "production_throughput_summary"),
    (SEMANTIC, "data_quality_results"),
    (SILVER,   "quarantine_records"),
]

BUSINESS_CHECKS = [
    (SEMANTIC, "supplier_otif_scorecard",
     "otif_pct BETWEEN 0 AND 100 AND supplier_name IS NOT NULL",
     "otif_pct in valid range + supplier_name not null"),
    (SEMANTIC, "inventory_risk_daily",
     "days_of_supply IS NOT NULL OR on_hand_qty = 0",
     "days_of_supply not null (or on_hand=0)"),
    (SILVER,   "fact_shipment_event",
     "otif_flag IS NOT NULL",
     "otif_flag not null"),
    (SEMANTIC, "data_quality_results",
     "status IN ('PASS', 'FAIL', 'ERROR')",
     "data_quality_results status is valid"),
]


def _headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def preflight():
    if not HOST or not TOKEN:
        print("ERROR: DATABRICKS_HOST and DATABRICKS_TOKEN are required.")
        sys.exit(2)
    if not WAREHOUSE_ID and not CLUSTER_ID:
        print(
            "ERROR: Either DATABRICKS_SQL_WAREHOUSE_ID or DATABRICKS_CLUSTER_ID is required.\n"
            "  - Set DATABRICKS_SQL_WAREHOUSE_ID for fast verification via SQL Statement Execution API.\n"
            "  - Or set DATABRICKS_CLUSTER_ID to run verification on the same cluster used for seeding.\n"
            "  - Or run verification_queries.sql manually in the Databricks SQL editor."
        )
        sys.exit(2)


# ---------------------------------------------------------------------------
# Path 1: SQL Statement Execution API (preferred when warehouse available)
# ---------------------------------------------------------------------------

def run_sql(statement):
    payload = {
        "statement": statement,
        "warehouse_id": WAREHOUSE_ID,
        "wait_timeout": "30s",
        "on_wait_timeout": "CANCEL",
    }
    r = requests.post(
        f"{HOST}/api/2.0/sql/statements",
        json=payload,
        headers=_headers(),
        timeout=40,
    )
    if r.status_code != 200:
        return None, f"HTTP {r.status_code}: {r.text}"

    data = r.json()
    statement_id = data.get("statement_id")
    status = data.get("status", {}).get("state", "")

    elapsed = 0
    while status in ("PENDING", "RUNNING") and elapsed < TIMEOUT_SQL:
        time.sleep(POLL_INTERVAL_SQL)
        elapsed += POLL_INTERVAL_SQL
        poll = requests.get(
            f"{HOST}/api/2.0/sql/statements/{statement_id}",
            headers=_headers(),
            timeout=15,
        )
        if poll.status_code != 200:
            return None, f"Poll error: HTTP {poll.status_code}"
        data = poll.json()
        status = data.get("status", {}).get("state", "")

    if status != "SUCCEEDED":
        err = data.get("status", {}).get("error", {}).get("message", status)
        return None, err

    rows = data.get("result", {}).get("data_array", [])
    return rows, None


def verify_via_warehouse():
    print(f"  Path:      SQL Warehouse ({WAREHOUSE_ID})")
    print(f"  Catalog:   {CATALOG}.{{{BRONZE},{SILVER},{SEMANTIC}}}")
    print()

    passes = 0
    failures = 0

    print("--- Row counts ---")
    for schema, table in ALL_TABLES:
        tbl = f"{CATALOG}.{schema}.{table}"
        rows, err = run_sql(f"SELECT COUNT(*) FROM {tbl}")
        if err:
            print(f"  ✗  {tbl:<58} ERROR: {err}")
            failures += 1
            continue
        count = int(rows[0][0]) if rows else 0
        if count == 0:
            print(f"  ✗  {tbl:<58} 0 rows  ← empty")
            failures += 1
        else:
            print(f"  ✓  {tbl:<58} {count:>8,} rows")
            passes += 1

    print()
    print("--- Business checks ---")
    for schema, table, condition, label in BUSINESS_CHECKS:
        tbl = f"{CATALOG}.{schema}.{table}"
        rows, err = run_sql(f"SELECT COUNT(*) FROM {tbl} WHERE NOT ({condition})")
        if err:
            print(f"  ✗  {label:<58} ERROR: {err}")
            failures += 1
            continue
        bad = int(rows[0][0]) if rows else 0
        if bad > 0:
            print(f"  ✗  {label:<58} {bad:,} rows violating check")
            failures += 1
        else:
            print(f"  ✓  {label}")
            passes += 1

    return passes, failures


# ---------------------------------------------------------------------------
# Path 2: Cluster-based verification notebook (fallback when no warehouse)
# ---------------------------------------------------------------------------

def resolve_notebook_path():
    path = NOTEBOOK_PATH_CFG
    if "<your-email@domain.com>" in path:
        try:
            r = requests.get(
                f"{HOST}/api/2.0/preview/scim/v2/Me",
                headers=_headers(),
                timeout=15,
            )
            r.raise_for_status()
            email = r.json().get("userName", "")
            if email:
                path = path.replace("<your-email@domain.com>", email)
        except Exception:
            pass
    return path.rstrip("/")


def build_verify_notebook():
    table_lines = "\n".join(
        f'    ({schema!r}, {table!r}),' for schema, table in ALL_TABLES
    )
    biz_lines = "\n".join(
        f'    ({schema!r}, {table!r}, {condition!r}, {label!r}),'
        for schema, table, condition, label in BUSINESS_CHECKS
    )
    return f'''# Databricks notebook source
# Verify supply_chain_demo seed. Generated by verify_databricks_seed.py.

from pyspark.sql import SparkSession

spark = SparkSession.builder.getOrCreate()

CATALOG = "{CATALOG}"
BRONZE = "{BRONZE}"
SILVER = "{SILVER}"
SEMANTIC = "{SEMANTIC}"

USE_UNITY = True
try:
    spark.sql(f"USE CATALOG {{CATALOG}}")
except Exception:
    USE_UNITY = False


def table_ref(schema, name):
    if USE_UNITY:
        return f"{{CATALOG}}.{{schema}}.{{name}}"
    return f"{{CATALOG}}_{{schema}}.{{name}}"


ALL_TABLES = [
{table_lines}
]

BUSINESS_CHECKS = [
{biz_lines}
]

passes = 0
failures = 0

print("--- Row counts ---")
for schema, table in ALL_TABLES:
    tbl = table_ref(schema, table)
    try:
        n = spark.sql(f"SELECT COUNT(*) AS c FROM {{tbl}}").collect()[0]["c"]
        if n == 0:
            print(f"  FAIL  {{tbl}}  0 rows  empty")
            failures += 1
        else:
            print(f"  PASS  {{tbl}}  {{n:,}} rows")
            passes += 1
    except Exception as e:
        print(f"  FAIL  {{tbl}}  ERROR: {{e}}")
        failures += 1

print()
print("--- Business checks ---")
for schema, table, condition, label in BUSINESS_CHECKS:
    tbl = table_ref(schema, table)
    try:
        bad = spark.sql(f"SELECT COUNT(*) AS c FROM {{tbl}} WHERE NOT ({{condition}})").collect()[0]["c"]
        if bad > 0:
            print(f"  FAIL  {{label}}  {{bad:,}} rows violating check")
            failures += 1
        else:
            print(f"  PASS  {{label}}")
            passes += 1
    except Exception as e:
        print(f"  FAIL  {{label}}  ERROR: {{e}}")
        failures += 1

print()
print(f"SUMMARY {{passes}} passed, {{failures}} failed")
if failures:
    raise Exception(f"{{failures}} verification check(s) failed")
'''


def upload_notebook(path, script):
    encoded = base64.b64encode(script.encode("utf-8")).decode("utf-8")
    r = requests.post(
        f"{HOST}/api/2.0/workspace/import",
        json={
            "path": path,
            "format": "SOURCE",
            "language": "PYTHON",
            "content": encoded,
            "overwrite": True,
        },
        headers=_headers(),
        timeout=30,
    )
    if r.status_code not in (200, 201):
        print(f"ERROR: Upload failed ({r.status_code}): {r.text}")
        sys.exit(1)


def submit_run(notebook_path):
    r = requests.post(
        f"{HOST}/api/2.1/jobs/runs/submit",
        json={
            "run_name": "supply_chain_demo_verify",
            "tasks": [
                {
                    "task_key": "verify",
                    "notebook_task": {"notebook_path": notebook_path},
                    "existing_cluster_id": CLUSTER_ID,
                }
            ],
        },
        headers=_headers(),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["run_id"]


def poll_run(run_id):
    elapsed = 0
    while elapsed < TIMEOUT_RUN:
        info = requests.get(
            f"{HOST}/api/2.1/jobs/runs/get?run_id={run_id}",
            headers=_headers(),
            timeout=15,
        ).json()
        state = info.get("state", {})
        life = state.get("life_cycle_state", "")
        result = state.get("result_state", "")

        if life == "TERMINATED":
            return result, info
        if life in ("INTERNAL_ERROR", "SKIPPED"):
            return life, info

        print(".", end="", flush=True)
        time.sleep(POLL_INTERVAL_RUN)
        elapsed += POLL_INTERVAL_RUN

    return "TIMEOUT", {}


def fetch_output(run_id):
    try:
        out = requests.get(
            f"{HOST}/api/2.1/jobs/runs/get-output?run_id={run_id}",
            headers=_headers(),
            timeout=15,
        ).json()
        return out.get("notebook_output", {}).get("result", "")
    except Exception:
        return ""


def verify_via_cluster():
    print(f"  Path:      Cluster ({CLUSTER_ID})")
    print(f"  Catalog:   {CATALOG}.{{{BRONZE},{SILVER},{SEMANTIC}}}")

    base_path = resolve_notebook_path()
    verify_path = f"{base_path}/verify_seed"

    print(f"\nUploading verification notebook to {verify_path}...")
    upload_notebook(verify_path, build_verify_notebook())
    print("  ✓ uploaded")

    print("\nSubmitting verification run...")
    run_id = submit_run(verify_path)
    run_url = f"{HOST}/#job/runs/{run_id}"
    print(f"  run_id: {run_id}")
    print(f"  url:    {run_url}")
    print(f"\nPolling (every {POLL_INTERVAL_RUN}s, timeout {TIMEOUT_RUN}s)...")

    result_state, _ = poll_run(run_id)
    print()

    output = fetch_output(run_id)
    if output:
        print("\n" + output)

    if result_state == "SUCCESS":
        return 1, 0
    return 0, 1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    preflight()
    print("Supply Chain Demo — Verify Seeded Tables")
    print(f"  Host:      {HOST}")

    if WAREHOUSE_ID:
        passes, failures = verify_via_warehouse()
    else:
        print(f"  [verify] No SQL warehouse detected — falling back to cluster execution ({CLUSTER_ID})")
        passes, failures = verify_via_cluster()

    print()
    if failures:
        print(f"{passes + failures} checks. {passes} passed, {failures} failed.")
        print("\nRe-run seed_workspace.py to repopulate failed tables.")
        sys.exit(1)
    else:
        if WAREHOUSE_ID:
            print(f"{passes} checks. All passed.")
        else:
            print("Verification run succeeded.")
        print("\nAll tables verified. Databricks workspace is ready.")


if __name__ == "__main__":
    main()
