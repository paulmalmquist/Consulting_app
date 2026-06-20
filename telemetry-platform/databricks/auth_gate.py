"""
Phase 1 auth gate — READ-ONLY.

First action of any Databricks session. Sources DATABRICKS_PAT (env or claude_token.txt), then makes
a single read-only call (warehouse status) to confirm the token authenticates the Databricks
workspace. Reports only: PAT source (not value), workspace URL, warehouse id + state, and whether the
listed catalog/schemas are reachable. Exits non-zero on auth failure so callers can STOP.

The token value is never printed, logged, or returned.
"""

import json
import sys

from _bootstrap import get_client, pat_source, CATALOG, SCHEMA, TEL


def main() -> int:
    print(f"[auth-gate] PAT source: {pat_source()}")
    try:
        client = get_client()
    except ValueError as e:
        print(f"[auth-gate] FAIL — {e}")
        return 2

    print(f"[auth-gate] workspace: {client.base_url}")
    print(f"[auth-gate] warehouse_id: {client.warehouse_id}")

    # Single read-only call. A 401/403 here means the token does not authenticate Databricks
    # (e.g. it is an Anthropic key, not a Databricks dapi PAT).
    try:
        state = client.warehouse_status()
    except RuntimeError as e:
        msg = str(e)
        if " 401" in msg or " 403" in msg:
            print("[auth-gate] FAIL — token did not authenticate Databricks (401/403). "
                  "If this is an Anthropic key rather than a Databricks dapi PAT, STOP and "
                  "supply a Databricks PAT.")
        else:
            print(f"[auth-gate] FAIL — Databricks API error: {msg[:200]}")
        return 3

    print(f"[auth-gate] warehouse_status: {state}")

    # Confirm Unity Catalog is reachable and report whether the telemetry schema already exists.
    try:
        schemas = client.list_schemas().get("schemas", [])
        names = sorted(s.get("name") for s in schemas if s.get("name"))
        print(f"[auth-gate] catalog {CATALOG} schemas: {names}")
        print(f"[auth-gate] telemetry schema exists: {SCHEMA in names}  (target namespace: {TEL})")
    except RuntimeError as e:
        print(f"[auth-gate] WARN — could not list schemas: {str(e)[:200]}")

    print("[auth-gate] PASS — Databricks authenticated, workspace reachable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
