"""
Phase 2 driver — train SMAP/MSL anomaly detectors in Databricks (baseline + PCA), log to MLflow.

Uploads notebooks/train_anomaly.py, runs it as a serverless job, and prints the returned metrics +
run IDs. All training happens in Databricks; this driver only orchestrates and reports.
"""
import json
import sys
from pathlib import Path

from _bootstrap import get_client
from _jobs import ensure_dir, upload_notebook, run_notebook_and_wait, get_notebook_output, WORKSPACE_DIR

NOTEBOOK = Path(__file__).resolve().parent / "notebooks" / "train_anomaly.py"


def main() -> int:
    client = get_client()
    ensure_dir(client)
    wp = upload_notebook(client, str(NOTEBOOK), f"{WORKSPACE_DIR}/train_anomaly")
    print(f"[anomaly] uploaded {wp}")
    res = run_notebook_and_wait(client, wp, "telemetry_train_anomaly", timeout=2400)
    print(f"[anomaly] result_state={res['result_state']} life={res['life_cycle_state']}")
    print(f"[anomaly] run_page_url={res['run_page_url']}")
    if res["result_state"] != "SUCCESS":
        print(f"[anomaly] FAIL — {res.get('state_message')}")
        return 2
    out = get_notebook_output(client, res["run_id"])
    payload = json.loads(out.get("result", "{}"))
    print("[anomaly] metrics:")
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
