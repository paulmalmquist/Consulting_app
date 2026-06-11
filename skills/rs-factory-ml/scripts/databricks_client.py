"""RS Factory ML — Databricks client wrapper.

Reuses the proven historyrhymes REST client (no copy-paste) and points it at
the rs_factory schema, then adds the four capabilities this pipeline needs:
statement polling for long CTAS, UC-volume file upload (with a DBFS fallback),
serverless notebook-job runs with completion polling, and MLflow
experiment-by-path resolution.

Auth: DATABRICKS_PAT in the environment (pull via
`vercel env pull --environment production` per CLAUDE.md, key DATABRICKS_PAT).
"""

from __future__ import annotations

import base64
import importlib.util
import json
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

_HERE = Path(__file__).resolve().parent

# This file shares its name with the historyrhymes module it wraps, so the
# base is loaded by explicit path under a distinct module name — a plain
# `import databricks_client` would resolve to this file and chase its own tail.
_BASE_PATH = _HERE.parents[1] / "historyrhymes" / "scripts" / "databricks_client.py"
_spec = importlib.util.spec_from_file_location("historyrhymes_databricks_client", _BASE_PATH)
_base_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base_mod)
_BaseClient = _base_mod.DatabricksClient

_CONFIG = json.loads((_HERE.parent / "config" / "databricks.json").read_text(encoding="utf-8"))


class RsFactoryClient(_BaseClient):
    def __init__(self, pat: str | None = None) -> None:
        super().__init__(pat=pat, workspace_url=_CONFIG["workspace_url"])
        # Override the historyrhymes schema context — never write into theirs.
        self.catalog = _CONFIG["catalog"]
        self.schema = _CONFIG["schema"]
        self.warehouse_id = _CONFIG["sql_warehouse_id"]
        self.experiment_path = _CONFIG["mlflow_experiment_path"]
        self.notebook_dir = _CONFIG["workspace_notebook_dir"]
        self.landing_volume = _CONFIG["landing_volume"]

    @property
    def qualified_schema(self) -> str:
        return f"{self.catalog}.{self.schema}"

    @property
    def volume_root(self) -> str:
        return f"/Volumes/{self.catalog}/{self.schema}/{self.landing_volume}"

    # -- SQL with real completion (the base client's 30s wait is not enough
    #    for the bigger CTAS / window scans) ---------------------------------

    def sql(self, statement: str, timeout_s: int = 600) -> dict:
        resp = self.execute_sql(statement, wait=True)
        statement_id = resp.get("statement_id")
        state = (resp.get("status") or {}).get("state")
        started = time.time()
        while state in ("PENDING", "RUNNING") and time.time() - started < timeout_s:
            time.sleep(3)
            resp = self._request("GET", f"/api/2.0/sql/statements/{statement_id}")
            state = (resp.get("status") or {}).get("state")
        if state != "SUCCEEDED":
            error = ((resp.get("status") or {}).get("error") or {}).get("message", state)
            raise RuntimeError(f"SQL failed [{state}]: {error}\n{statement[:300]}")
        return resp

    def sql_rows(self, statement: str, timeout_s: int = 600) -> list[list]:
        resp = self.sql(statement, timeout_s)
        return (resp.get("result") or {}).get("data_array") or []

    def sql_scalar(self, statement: str, timeout_s: int = 600):
        rows = self.sql_rows(statement, timeout_s)
        return rows[0][0] if rows and rows[0] else None

    def sql_dicts(self, statement: str, timeout_s: int = 600) -> list[dict]:
        resp = self.sql(statement, timeout_s)
        cols = [c["name"] for c in ((resp.get("manifest") or {}).get("schema") or {}).get("columns", [])]
        rows = (resp.get("result") or {}).get("data_array") or []
        return [dict(zip(cols, r)) for r in rows]

    # -- file upload ---------------------------------------------------------

    def upload_to_volume(self, local_path: Path, filename: str) -> str:
        """PUT a local file into the landing volume via the Files API."""
        target = f"{self.volume_root}/{filename}"
        url = f"{self.base_url}/api/2.0/fs/files{target}?overwrite=true"
        req = Request(url, data=local_path.read_bytes(), method="PUT")
        req.add_header("Authorization", f"Bearer {self.pat}")
        req.add_header("Content-Type", "application/octet-stream")
        try:
            with urlopen(req, timeout=600) as resp:
                resp.read()
        except HTTPError as e:
            raise RuntimeError(f"Files API PUT {target} -> {e.code}: {e.read().decode()[:300]}")
        return target

    def upload_to_dbfs(self, local_path: Path, filename: str) -> str:
        """Fallback transport when UC Volumes / Files API is unavailable."""
        target = f"/FileStore/rs_factory/landing/{filename}"
        create = self._request("POST", "/api/2.0/dbfs/create", {"path": target, "overwrite": True})
        handle = create["handle"]
        data = local_path.read_bytes()
        for i in range(0, len(data), 1024 * 1024):
            chunk = base64.b64encode(data[i:i + 1024 * 1024]).decode("ascii")
            self._request("POST", "/api/2.0/dbfs/add-block", {"handle": handle, "data": chunk})
        self._request("POST", "/api/2.0/dbfs/close", {"handle": handle})
        return f"dbfs:{target}"

    # -- notebooks as serverless jobs ----------------------------------------

    def import_notebook_source(self, local_path: Path, workspace_name: str) -> str:
        """Import a notebook-source .py file under the rs_factory_ml dir."""
        self._request("POST", "/api/2.0/workspace/mkdirs", {"path": self.notebook_dir})
        target = f"{self.notebook_dir}/{workspace_name}"
        content = base64.b64encode(local_path.read_bytes()).decode("ascii")
        self.import_notebook(target, content)
        return target

    def run_notebook_job(self, notebook_path: str, job_name: str,
                         params: dict | None = None, timeout_s: int = 3600) -> dict:
        """Submit a one-time serverless notebook run and wait for it."""
        body = {
            "run_name": job_name,
            "tasks": [{
                "task_key": "main",
                "notebook_task": {
                    "notebook_path": notebook_path,
                    "base_parameters": {k: str(v) for k, v in (params or {}).items()},
                },
            }],
        }
        submit = self._request("POST", "/api/2.1/jobs/runs/submit", body)
        run_id = submit["run_id"]
        started = time.time()
        while time.time() - started < timeout_s:
            run = self._request("GET", f"/api/2.1/jobs/runs/get?run_id={run_id}")
            state = run.get("state", {})
            life = state.get("life_cycle_state")
            if life in ("TERMINATED", "SKIPPED", "INTERNAL_ERROR"):
                result = state.get("result_state")
                if result != "SUCCESS":
                    raise RuntimeError(
                        f"job {job_name} run {run_id} -> {result}: "
                        f"{state.get('state_message', '')} ({run.get('run_page_url', '')})"
                    )
                return run
            time.sleep(15)
        raise TimeoutError(f"job {job_name} run {run_id} still running after {timeout_s}s")

    # -- MLflow by experiment path --------------------------------------------

    def ensure_experiment(self) -> str:
        try:
            resp = self._request(
                "GET",
                f"/api/2.0/mlflow/experiments/get-by-name?experiment_name={self.experiment_path}",
            )
            return resp["experiment"]["experiment_id"]
        except RuntimeError:
            resp = self._request("POST", "/api/2.0/mlflow/experiments/create",
                                 {"name": self.experiment_path})
            return resp["experiment_id"]

    def latest_run(self, experiment_id: str, filter_string: str = "") -> dict | None:
        resp = self._request("POST", "/api/2.0/mlflow/runs/search", {
            "experiment_ids": [experiment_id],
            "filter": filter_string,
            "max_results": 1,
            "order_by": ["attributes.start_time DESC"],
        })
        runs = resp.get("runs") or []
        return runs[0] if runs else None
