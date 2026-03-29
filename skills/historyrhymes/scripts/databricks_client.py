"""
HistoryRhymes — Databricks Client
==================================
Thin REST client for Databricks workspace, MLflow, SQL, and Unity Catalog APIs.
Uses DATABRICKS_PAT from environment for authentication.

Usage:
    from databricks_client import DatabricksClient
    client = DatabricksClient()
    client.start_warehouse()
    result = client.execute_sql("SELECT 1")
    client.stop_warehouse()
"""

import json
import os
import time
from pathlib import Path
from typing import Any, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError


# Load config
_CONFIG_PATH = Path(__file__).parent.parent / "config" / "databricks.json"
with open(_CONFIG_PATH) as f:
    _CONFIG = json.load(f)


class DatabricksClient:
    """REST client for Databricks APIs."""

    def __init__(self, pat: Optional[str] = None, workspace_url: Optional[str] = None):
        self.pat = pat or os.environ.get("DATABRICKS_PAT", "")
        self.base_url = (workspace_url or _CONFIG["workspace_url"]).rstrip("/")
        self.catalog = _CONFIG["catalog"]
        self.schema = _CONFIG["schema"]
        self.warehouse_id = _CONFIG["sql_warehouse_id"]
        self.experiment_id = _CONFIG["mlflow_experiment_id"]

        if not self.pat:
            raise ValueError("DATABRICKS_PAT not set in environment")

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode() if body else None
        req = Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.pat}")
        req.add_header("Content-Type", "application/json")

        try:
            with urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode())
        except HTTPError as e:
            error_body = e.read().decode() if e.fp else ""
            raise RuntimeError(f"Databricks API {method} {path} → {e.code}: {error_body}")

    # ── SQL Warehouse ──────────────────────────────────────────────

    def start_warehouse(self) -> dict:
        return self._request("POST", f"/api/2.0/sql/warehouses/{self.warehouse_id}/start")

    def stop_warehouse(self) -> dict:
        return self._request("POST", f"/api/2.0/sql/warehouses/{self.warehouse_id}/stop")

    def warehouse_status(self) -> str:
        resp = self._request("GET", f"/api/2.0/sql/warehouses/{self.warehouse_id}")
        return resp.get("state", "UNKNOWN")

    def wait_for_warehouse(self, target: str = "RUNNING", timeout: int = 300) -> str:
        start = time.time()
        while time.time() - start < timeout:
            status = self.warehouse_status()
            if status == target:
                return status
            time.sleep(5)
        raise TimeoutError(f"Warehouse did not reach {target} within {timeout}s")

    def execute_sql(self, statement: str, wait: bool = True) -> dict:
        body = {
            "warehouse_id": self.warehouse_id,
            "statement": statement,
            "wait_timeout": "30s" if wait else "0s",
        }
        return self._request("POST", "/api/2.0/sql/statements", body)

    # ── MLflow ─────────────────────────────────────────────────────

    def create_mlflow_run(self, run_name: str, tags: Optional[dict] = None) -> dict:
        body: dict[str, Any] = {
            "experiment_id": self.experiment_id,
            "run_name": run_name,
        }
        if tags:
            body["tags"] = [{"key": k, "value": str(v)} for k, v in tags.items()]
        return self._request("POST", "/api/2.0/mlflow/runs/create", body)

    def log_metric(self, run_id: str, key: str, value: float, step: int = 0) -> dict:
        return self._request("POST", "/api/2.0/mlflow/runs/log-metric", {
            "run_id": run_id,
            "key": key,
            "value": value,
            "step": step,
            "timestamp": int(time.time() * 1000),
        })

    def log_param(self, run_id: str, key: str, value: str) -> dict:
        return self._request("POST", "/api/2.0/mlflow/runs/log-parameter", {
            "run_id": run_id,
            "key": key,
            "value": value,
        })

    def end_mlflow_run(self, run_id: str, status: str = "FINISHED") -> dict:
        return self._request("POST", "/api/2.0/mlflow/runs/update", {
            "run_id": run_id,
            "status": status,
            "end_time": int(time.time() * 1000),
        })

    def search_mlflow_runs(self, filter_string: str = "", max_results: int = 100) -> dict:
        return self._request("POST", "/api/2.0/mlflow/runs/search", {
            "experiment_ids": [self.experiment_id],
            "filter": filter_string,
            "max_results": max_results,
        })

    # ── Workspace / Notebooks ──────────────────────────────────────

    def list_workspace(self, path: str = "/") -> dict:
        return self._request("GET", f"/api/2.0/workspace/list?path={path}")

    def import_notebook(self, path: str, content_b64: str, language: str = "PYTHON", overwrite: bool = True) -> dict:
        return self._request("POST", "/api/2.0/workspace/import", {
            "path": path,
            "content": content_b64,
            "language": language,
            "overwrite": overwrite,
            "format": "SOURCE",
        })

    # ── Unity Catalog ──────────────────────────────────────────────

    def list_schemas(self) -> dict:
        return self._request("GET", f"/api/2.1/unity-catalog/schemas?catalog_name={self.catalog}")

    def list_tables(self, schema: Optional[str] = None) -> dict:
        s = schema or self.schema
        return self._request("GET", f"/api/2.1/unity-catalog/tables?catalog_name={self.catalog}&schema_name={s}")

    # ── Jobs ───────────────────────────────────────────────────────

    def create_and_run_notebook_job(self, notebook_path: str, job_name: str, params: Optional[dict] = None) -> dict:
        job_body: dict[str, Any] = {
            "name": job_name,
            "tasks": [{
                "task_key": "main",
                "notebook_task": {
                    "notebook_path": notebook_path,
                    "base_parameters": params or {},
                },
                "existing_cluster_id": None,
                "new_cluster": None,
            }],
            "run_as": {"user_name": "paulmalmquist@gmail.com"},
        }
        # Use serverless
        job_body["tasks"][0]["environment_key"] = "Default"
        create_resp = self._request("POST", "/api/2.1/jobs/create", job_body)
        job_id = create_resp.get("job_id")
        run_resp = self._request("POST", "/api/2.1/jobs/run-now", {"job_id": job_id})
        return {"job_id": job_id, **run_resp}
