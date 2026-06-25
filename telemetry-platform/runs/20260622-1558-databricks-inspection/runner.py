"""Phase A workhorse — upload a local notebook, run it serverless, poll to terminal state,
cancel on timeout, capture output, and append a record to run_manifest.json.

CLI:  python runner.py <local_path> <ws_name> <job_name> [timeout_seconds]
Importable: run(local_path, ws_name, job_name, timeout) -> dict
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "databricks"))
from _bootstrap import get_client  # noqa: E402
from _jobs import ensure_dir, upload_notebook, run_notebook_and_wait, get_notebook_output, WORKSPACE_DIR  # noqa: E402

MANIFEST = HERE / "run_manifest.json"


def _load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {"run_id": HERE.name, "runs": [], "notebooks_completed": [], "notebooks_failed": [],
            "cost_safety_events": []}


def _save_manifest(m: dict) -> None:
    MANIFEST.write_text(json.dumps(m, indent=2), encoding="utf-8")


def run(local_path: str, ws_name: str, job_name: str, timeout: int = 2400) -> dict:
    client = get_client()
    ensure_dir(client)
    wp = upload_notebook(client, local_path, f"{WORKSPACE_DIR}/{ws_name}")
    t0 = time.time()
    res = run_notebook_and_wait(client, wp, job_name, timeout=timeout)
    elapsed = round(time.time() - t0, 1)
    rec = {"ws_name": ws_name, "job_name": job_name, "uploaded": wp,
           "result_state": res.get("result_state"), "life_cycle_state": res.get("life_cycle_state"),
           "run_id": res.get("run_id"), "job_id": res.get("job_id"),
           "run_page_url": res.get("run_page_url"), "state_message": res.get("state_message"),
           "elapsed_s": elapsed, "timeout_s": timeout}

    m = _load_manifest()
    # Cost/runaway guard: cancel a run that blew the declared timeout.
    if res.get("result_state") == "TIMEOUT":
        try:
            client._request("POST", "/api/2.1/jobs/runs/cancel", {"run_id": res.get("run_id")})
            rec["cancelled_on_timeout"] = True
        except Exception as e:  # noqa: BLE001
            rec["cancel_error"] = str(e)
        m["cost_safety_events"].append({"ws_name": ws_name, "event": "timeout_cancel", "elapsed_s": elapsed})

    payload = {}
    if res.get("result_state") == "SUCCESS":
        try:
            payload = json.loads(get_notebook_output(client, res["run_id"]).get("result", "{}") or "{}")
        except Exception as e:  # noqa: BLE001
            payload = {"_output_parse_error": str(e)}
        m["notebooks_completed"].append(ws_name)
    else:
        m["notebooks_failed"].append(ws_name)
    rec["output"] = payload
    m["runs"].append(rec)
    _save_manifest(m)
    return rec


if __name__ == "__main__":
    local_path, ws_name, job_name = sys.argv[1], sys.argv[2], sys.argv[3]
    timeout = int(sys.argv[4]) if len(sys.argv) > 4 else 2400
    r = run(local_path, ws_name, job_name, timeout)
    print(f"result_state={r['result_state']} life={r['life_cycle_state']} elapsed={r['elapsed_s']}s")
    print(f"run_page_url={r['run_page_url']}")
    print("output:")
    print(json.dumps(r["output"], indent=2))
    sys.exit(0 if r["result_state"] == "SUCCESS" else 2)
