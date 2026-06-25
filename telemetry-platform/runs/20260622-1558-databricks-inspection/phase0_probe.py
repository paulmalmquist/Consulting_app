"""Phase 0 — preflight probe (read-only).

Inventories the novendor_1.telemetry schema, confirms prerequisite Gold/Silver inputs,
lists deployed workspace notebooks, and snapshots MLflow runs + UC registered models
BEFORE any new training runs. Writes phase0_snapshot.json into this run dir.
No mutation: SELECT / SHOW / list / search only.
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DBX = HERE.parents[1] / "databricks"   # telemetry-platform/databricks
sys.path.insert(0, str(DBX))
from _bootstrap import get_client, TEL  # noqa: E402

WS_DIR = "/Users/paulmalmquist@gmail.com/telemetry"

PREREQ_TABLES = [
    "gold_smap_msl_windows",
    "gold_cmapss_features",
    "silver_cmapss_rul",
    "silver_smap_msl_labels",
    "gold_replay_feed",
]


def sql_rows(client, statement: str, timeout: int = 120):
    """Run SQL, polling the statements API to terminal state. Returns data_array (list of rows)."""
    r = client.execute_sql(statement)
    state = r.get("status", {}).get("state")
    sid = r.get("statement_id")
    start = time.time()
    while state in ("PENDING", "RUNNING") and time.time() - start < timeout:
        time.sleep(3)
        r = client._request("GET", f"/api/2.0/sql/statements/{sid}")
        state = r.get("status", {}).get("state")
    if state != "SUCCEEDED":
        raise RuntimeError(f"SQL not SUCCEEDED ({state}): {statement[:80]} :: {json.dumps(r.get('status'))[:300]}")
    return r.get("result", {}).get("data_array", []) or []


def main() -> int:
    client = get_client()
    snap: dict = {"workspace": client.base_url, "warehouse_id": client.warehouse_id,
                  "experiment_id": client.experiment_id, "schema": TEL}

    # 1. All tables in the schema + row counts
    tbls = [row[1] for row in sql_rows(client, f"SHOW TABLES IN {TEL}")]
    snap["tables"] = {}
    for t in sorted(tbls):
        try:
            n = sql_rows(client, f"SELECT COUNT(*) FROM {TEL}.{t}")[0][0]
        except Exception as e:  # noqa: BLE001
            n = f"ERR:{e}"
        snap["tables"][t] = n
    snap["table_count"] = len(tbls)

    # 2. Prerequisite check
    snap["prereq"] = {t: (t in tbls and str(snap["tables"].get(t)).isdigit() and int(snap["tables"][t]) > 0)
                      for t in PREREQ_TABLES}
    snap["prereq_all_present"] = all(snap["prereq"].values())

    # 3. Deployed workspace notebooks
    try:
        objs = client._request("GET", f"/api/2.0/workspace/list?path={WS_DIR}").get("objects", [])
        snap["workspace_notebooks"] = sorted(o["path"].split("/")[-1] for o in objs if o.get("object_type") == "NOTEBOOK")
    except Exception as e:  # noqa: BLE001
        snap["workspace_notebooks"] = f"ERR:{e}"

    # 4. MLflow runs BEFORE (this experiment)
    try:
        runs = client.search_mlflow_runs(max_results=200).get("runs", [])
        snap["mlflow_runs_before"] = [{
            "run_id": r["info"]["run_id"],
            "run_name": next((t["value"] for t in r["data"].get("tags", []) if t["key"] == "mlflow.runName"), None),
            "status": r["info"].get("status"),
            "start_time": r["info"].get("start_time"),
            "metrics": {m["key"]: m["value"] for m in r["data"].get("metrics", [])},
        } for r in runs]
        snap["mlflow_runs_before_count"] = len(runs)
    except Exception as e:  # noqa: BLE001
        snap["mlflow_runs_before"] = f"ERR:{e}"

    # 5. UC registered models + aliases BEFORE
    try:
        models = client._request(
            "GET", f"/api/2.1/unity-catalog/models?catalog_name={client.catalog}&schema_name=telemetry"
        ).get("registered_models", [])
        snap["models_before"] = []
        for m in models:
            full = m["full_name"]
            vers = client._request("GET", f"/api/2.1/unity-catalog/models/{full}/versions").get("model_versions", [])
            snap["models_before"].append({
                "name": full,
                "aliases": m.get("aliases", []),
                "versions": [{"version": v.get("version"), "run_id": v.get("run_id")} for v in vers],
            })
    except Exception as e:  # noqa: BLE001
        snap["models_before"] = f"ERR:{e}"

    out = HERE / "phase0_snapshot.json"
    out.write_text(json.dumps(snap, indent=2), encoding="utf-8")
    # Console summary (no secrets)
    print("=== Phase 0 snapshot ===")
    print("tables:", snap["table_count"])
    print("prereq_all_present:", snap["prereq_all_present"], snap["prereq"])
    print("workspace_notebooks:", snap["workspace_notebooks"])
    print("mlflow_runs_before:", snap.get("mlflow_runs_before_count"))
    mb = snap["models_before"]
    print("models_before:", [(m["name"], m["aliases"]) for m in mb] if isinstance(mb, list) else mb)
    print("wrote", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
