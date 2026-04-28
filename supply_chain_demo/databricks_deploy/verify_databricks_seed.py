"""
verify_databricks_seed.py — Validate that all 19 Delta tables exist and are populated.

Uses the Databricks SQL Statement Execution API (requires a SQL Warehouse ID).

Usage:
    python verify_databricks_seed.py

Exits:
    0 — all 19 tables pass
    1 — one or more tables empty or business check failed
    2 — DATABRICKS_SQL_WAREHOUSE_ID not configured

Requirements: requests, python-dotenv
"""

import os
import sys
import time

import requests
from dotenv import load_dotenv

load_dotenv()

HOST = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
TOKEN = os.environ.get("DATABRICKS_TOKEN", "")
WAREHOUSE_ID = os.environ.get("DATABRICKS_SQL_WAREHOUSE_ID", "")
CATALOG = os.environ.get("DATABRICKS_CATALOG", "supply_chain_demo")
BRONZE = os.environ.get("DATABRICKS_BRONZE_SCHEMA", "bronze")
SILVER = os.environ.get("DATABRICKS_SILVER_SCHEMA", "silver")
SEMANTIC = os.environ.get("DATABRICKS_GOLD_SCHEMA", "semantic")

POLL_INTERVAL = 3
TIMEOUT_SECONDS = 120


def _headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def preflight():
    if not HOST or not TOKEN:
        print("ERROR: DATABRICKS_HOST and DATABRICKS_TOKEN are required.")
        sys.exit(2)
    if not WAREHOUSE_ID:
        print(
            "ERROR: DATABRICKS_SQL_WAREHOUSE_ID is required.\n"
            "Set it to a running SQL Warehouse ID in your .env file.\n"
            "Alternatively, run the queries in verification_queries.sql manually\n"
            "in the Databricks SQL editor."
        )
        sys.exit(2)


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
    while status in ("PENDING", "RUNNING") and elapsed < TIMEOUT_SECONDS:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
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


def check_count(schema, table):
    tbl = f"{CATALOG}.{schema}.{table}"
    rows, err = run_sql(f"SELECT COUNT(*) FROM {tbl}")
    if err:
        return tbl, None, err
    count = int(rows[0][0]) if rows else 0
    return tbl, count, None


def check_business(schema, table, condition, label):
    tbl = f"{CATALOG}.{schema}.{table}"
    rows, err = run_sql(f"SELECT COUNT(*) FROM {tbl} WHERE NOT ({condition})")
    if err:
        return label, None, err
    bad = int(rows[0][0]) if rows else 0
    return label, bad, None


def main():
    preflight()
    print("Supply Chain Demo — Verify Seeded Tables")
    print(f"  Host:      {HOST}")
    print(f"  Warehouse: {WAREHOUSE_ID}")
    print(f"  Catalog:   {CATALOG}.{{{BRONZE},{SILVER},{SEMANTIC}}}")
    print()

    all_tables = [
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
    ]

    business_checks = [
        (SEMANTIC, "supplier_otif_scorecard", "otif_pct BETWEEN 0 AND 100 AND supplier_name IS NOT NULL", "otif_pct in valid range + supplier_name not null"),
        (SEMANTIC, "inventory_risk_daily", "days_of_supply IS NOT NULL OR on_hand_qty = 0", "days_of_supply not null (or on_hand=0)"),
        (SILVER, "fact_shipment_event", "otif_flag IS NOT NULL", "otif_flag not null"),
    ]

    passes = 0
    failures = 0

    print("--- Row counts ---")
    for schema, table in all_tables:
        tbl, count, err = check_count(schema, table)
        if err:
            print(f"  ✗  {tbl:<58} ERROR: {err}")
            failures += 1
        elif count == 0:
            print(f"  ✗  {tbl:<58} 0 rows  ← empty")
            failures += 1
        else:
            print(f"  ✓  {tbl:<58} {count:>8,} rows")
            passes += 1

    print()
    print("--- Business checks ---")
    for schema, table, condition, label in business_checks:
        lbl, bad, err = check_business(schema, table, condition, label)
        if err:
            print(f"  ✗  {lbl:<58} ERROR: {err}")
            failures += 1
        elif bad and bad > 0:
            print(f"  ✗  {lbl:<58} {bad:,} rows violating check")
            failures += 1
        else:
            print(f"  ✓  {lbl}")
            passes += 1

    print()
    total = passes + failures
    print(f"{total} checks. {passes} passed, {failures} failed.")

    if failures:
        print("\nRe-run seed_workspace.py to repopulate failed tables.")
        sys.exit(1)
    else:
        print("\nAll tables verified. Databricks workspace is ready.")


if __name__ == "__main__":
    main()
