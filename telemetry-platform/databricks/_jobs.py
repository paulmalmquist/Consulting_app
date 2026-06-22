"""
Telemetry Platform — Databricks notebook-job helpers.

The shared DatabricksClient can import a notebook and kick off a serverless job run, but has no run
poller. This adds: upload a local .py notebook (SOURCE format), run it serverless, and poll the run
to a terminal state, returning the result state + the run page URL. MLflow logging happens INSIDE the
notebook (native to the Databricks ML runtime), so model training does not depend on local ML libs.
"""

import base64
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

WORKSPACE_DIR = "/Users/paulmalmquist@gmail.com/telemetry"


def _req(client, method: str, path: str, body=None) -> dict:
    import json
    url = f"{client.base_url}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {client.pat}")
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        raise RuntimeError(f"{method} {path} -> {e.code}: {body[:300]}")


def ensure_dir(client, path: str = WORKSPACE_DIR) -> None:
    _req(client, "POST", "/api/2.0/workspace/mkdirs", {"path": path})


def upload_notebook(client, local_py: str, workspace_path: str) -> str:
    with open(local_py, "rb") as f:
        content_b64 = base64.b64encode(f.read()).decode()
    client.import_notebook(workspace_path, content_b64, language="PYTHON", overwrite=True)
    return workspace_path


def _create_and_run_serverless(client, notebook_path: str, job_name: str,
                               params: dict | None = None) -> dict:
    """
    Create + run a serverless notebook job with a proper environments block.

    The shared client's create_and_run_notebook_job sets environment_key='Default' but omits the
    matching `environments` spec, which the current Jobs API rejects (INVALID_PARAMETER_VALUE). We
    define a serverless environment here instead of editing the shared client.
    """
    job_body = {
        "name": job_name,
        "tasks": [{
            "task_key": "main",
            "notebook_task": {"notebook_path": notebook_path, "base_parameters": params or {}},
            "environment_key": "default",
        }],
        "environments": [{
            "environment_key": "default",
            "spec": {"client": "3"},
        }],
    }
    create_resp = _req(client, "POST", "/api/2.1/jobs/create", job_body)
    job_id = create_resp.get("job_id")
    run_resp = _req(client, "POST", "/api/2.1/jobs/run-now", {"job_id": job_id})
    return {"job_id": job_id, **run_resp}


def run_notebook_and_wait(client, notebook_path: str, job_name: str,
                          params: dict | None = None, timeout: int = 1800) -> dict:
    """Create a serverless notebook job, run it, poll to terminal state. Returns run summary."""
    started = _create_and_run_serverless(client, notebook_path, job_name, params)
    run_id = started.get("run_id")
    job_id = started.get("job_id")
    start = time.time()
    state = {}
    while time.time() - start < timeout:
        info = _req(client, "GET", f"/api/2.1/jobs/runs/get?run_id={run_id}")
        state = info.get("state", {})
        life = state.get("life_cycle_state")
        if life in ("TERMINATED", "SKIPPED", "INTERNAL_ERROR"):
            return {
                "job_id": job_id, "run_id": run_id,
                "result_state": state.get("result_state"),
                "life_cycle_state": life,
                "state_message": state.get("state_message", "")[:300],
                "run_page_url": info.get("run_page_url", ""),
            }
        time.sleep(15)
    return {"job_id": job_id, "run_id": run_id, "result_state": "TIMEOUT",
            "life_cycle_state": state.get("life_cycle_state"), "run_page_url": ""}


def get_notebook_output(client, run_id: int) -> dict:
    """Fetch a job run's notebook output (dbutils.notebook.exit payload)."""
    # For multi-task jobs we must read the task run; fetch the run, then its first task's output.
    info = _req(client, "GET", f"/api/2.1/jobs/runs/get?run_id={run_id}")
    tasks = info.get("tasks", [])
    if not tasks:
        return {}
    task_run_id = tasks[0].get("run_id")
    out = _req(client, "GET", f"/api/2.1/jobs/runs/get-output?run_id={task_run_id}")
    return out.get("notebook_output", {})
