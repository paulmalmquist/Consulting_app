"""
Phase 1, step 1 — create the telemetry Unity Catalog schema.

Creates novendor_1.telemetry if it does not exist, using fully-qualified SQL through the SQL
Warehouse. Starts the warehouse, runs the DDL, lists schemas to confirm, and stops the warehouse to
control cost. Read-mostly: the only mutation is CREATE SCHEMA IF NOT EXISTS.
"""

import sys

from _bootstrap import get_client, CATALOG, SCHEMA, TEL


def main() -> int:
    client = get_client()

    print(f"[schema] starting warehouse {client.warehouse_id} ...")
    client.start_warehouse()
    state = client.wait_for_warehouse("RUNNING", timeout=300)
    print(f"[schema] warehouse state: {state}")

    try:
        ddl = (
            f"CREATE SCHEMA IF NOT EXISTS {TEL} "
            f"COMMENT 'Telemetry Platform (NASA aerospace analog) — Bronze/Silver/Gold for "
            f"C-MAPSS RUL, SMAP/MSL anomaly detection, IMS bearing run-to-failure.'"
        )
        print(f"[schema] {ddl}")
        resp = client.execute_sql(ddl)
        statestr = resp.get("status", {}).get("state")
        print(f"[schema] statement state: {statestr}")
        if statestr not in ("SUCCEEDED", "FINISHED"):
            print(f"[schema] FAIL — unexpected state: {resp.get('status')}")
            return 2

        schemas = client.list_schemas().get("schemas", [])
        names = sorted(s.get("name") for s in schemas if s.get("name"))
        print(f"[schema] catalog {CATALOG} schemas now: {names}")
        if SCHEMA not in names:
            print(f"[schema] FAIL — {SCHEMA} not present after create")
            return 3
        print(f"[schema] PASS — {TEL} ready")
        return 0
    finally:
        print("[schema] stopping warehouse ...")
        try:
            client.stop_warehouse()
        except Exception as e:  # noqa: BLE001
            print(f"[schema] WARN — stop_warehouse: {str(e)[:120]}")


if __name__ == "__main__":
    sys.exit(main())
