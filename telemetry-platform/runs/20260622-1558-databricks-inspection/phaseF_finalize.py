"""Phase F — finalize: capture after-state, delete the temporary workspace challenger, consolidate manifest."""
from __future__ import annotations
import json, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "databricks"))
from _bootstrap import get_client, TEL  # noqa: E402

WS_DIR = "/Users/paulmalmquist@gmail.com/telemetry"
c = get_client()

# 1. Delete the temporary challenger notebook from the workspace (keep its results/run).
deleted = None
try:
    c._request("POST", "/api/2.0/workspace/delete", {"path": f"{WS_DIR}/train_rul_challenger_tmp", "recursive": False})
    deleted = "train_rul_challenger_tmp"
except Exception as e:  # noqa: BLE001
    deleted = f"ERR:{e}"

# 2. After-state: MLflow run count + champion aliases.
runs_after = len(c.search_mlflow_runs(max_results=400).get("runs", []))
champs = {}
for m in ["tel_anomaly_detector", "tel_rul_regressor"]:
    full = f"{TEL}.{m}"
    try:
        a = c._request("GET", f"/api/2.1/unity-catalog/models/{full}/aliases/champion")
        champs[m] = {"champion_version": a.get("version"), "run_id": a.get("run_id")}
    except Exception as e:  # noqa: BLE001
        champs[m] = f"ERR:{e}"

# 3. Consolidate manifest.
mpath = HERE / "run_manifest.json"
m = json.loads(mpath.read_text(encoding="utf-8")) if mpath.exists() else {}
m["finalized"] = {
    "workspace_challenger_deleted": deleted,
    "mlflow_runs_after": runs_after,
    "models_after": champs,
    "notebooks_completed_unique": sorted(set(m.get("notebooks_completed", []))),
    "notebooks_failed": m.get("notebooks_failed", []),
    "cost_safety_events": m.get("cost_safety_events", []),
    "workspace_notebooks_modified": [
        "telemetry_probe", "train_anomaly", "train_rul", "promote_models", "score_replay_feed",
        "fused_state_vector", "ncr_corpus", "ncr_clustering", "ncr_backlog_forecast",
        "(deleted) train_rul_challenger_tmp",
    ],
}
mpath.write_text(json.dumps(m, indent=2), encoding="utf-8")
print(json.dumps(m["finalized"], indent=2))
