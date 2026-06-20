"""
Phase 2 driver — train C-MAPSS FD001 RUL regressors in Databricks (linear baseline + GBM), MLflow.
Uploads notebooks/train_rul.py, runs serverless, prints metrics + run IDs.
"""
import json
import sys
from pathlib import Path

from _bootstrap import get_client
from _jobs import ensure_dir, upload_notebook, run_notebook_and_wait, get_notebook_output, WORKSPACE_DIR

NOTEBOOK = Path(__file__).resolve().parent / "notebooks" / "train_rul.py"


def main() -> int:
    client = get_client()
    ensure_dir(client)
    wp = upload_notebook(client, str(NOTEBOOK), f"{WORKSPACE_DIR}/train_rul")
    print(f"[rul] uploaded {wp}")
    res = run_notebook_and_wait(client, wp, "telemetry_train_rul", timeout=2400)
    print(f"[rul] result_state={res['result_state']} life={res['life_cycle_state']}")
    print(f"[rul] run_page_url={res['run_page_url']}")
    if res["result_state"] != "SUCCESS":
        print(f"[rul] FAIL — {res.get('state_message')}")
        return 2
    out = get_notebook_output(client, res["run_id"])
    print("[rul] metrics:")
    print(json.dumps(json.loads(out.get("result", "{}")), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
