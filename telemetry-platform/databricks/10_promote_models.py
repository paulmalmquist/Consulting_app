"""
Phase 2 driver — promotion gates + Model Registry.
Reads logged MLflow metrics, applies declared gates, registers promoted models (UC registry),
records held-back models honestly. Prints the gate decisions + registry status.
"""
import json
import sys
from pathlib import Path

from _bootstrap import get_client
from _jobs import ensure_dir, upload_notebook, run_notebook_and_wait, get_notebook_output, WORKSPACE_DIR

NOTEBOOK = Path(__file__).resolve().parent / "notebooks" / "promote_models.py"


def main() -> int:
    client = get_client()
    ensure_dir(client)
    wp = upload_notebook(client, str(NOTEBOOK), f"{WORKSPACE_DIR}/promote_models")
    print(f"[promote] uploaded {wp}")
    res = run_notebook_and_wait(client, wp, "telemetry_promote_models", timeout=1200)
    print(f"[promote] result_state={res['result_state']} life={res['life_cycle_state']}")
    print(f"[promote] run_page_url={res['run_page_url']}")
    if res["result_state"] != "SUCCESS":
        print(f"[promote] FAIL — {res.get('state_message')}")
        return 2
    out = get_notebook_output(client, res["run_id"])
    print("[promote] decisions:")
    print(json.dumps(json.loads(out.get("result", "{}")), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
