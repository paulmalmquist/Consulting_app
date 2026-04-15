"""Thin Databricks REST client for the NCF grant friction pipeline.

Mirrors skills/historyrhymes/scripts/databricks_client.py conventions:
- reads config from ../config/databricks.json
- authenticates via DATABRICKS_PAT env var
- exposes a minimal surface (run_notebook, query_sql, list_models)

This is a skeleton. Flesh out methods as concrete operations land; reuse the
historyrhymes client where the surface is identical (notebook runs, SQL queries).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import requests

CONFIG_PATH = Path(__file__).parent.parent / "config" / "databricks.json"


def load_config() -> dict[str, Any]:
    with CONFIG_PATH.open() as f:
        return json.load(f)


def auth_headers() -> dict[str, str]:
    token = os.environ.get("DATABRICKS_PAT")
    if not token:
        raise RuntimeError("DATABRICKS_PAT env var is not set")
    return {"Authorization": f"Bearer {token}"}


def workspace_url() -> str:
    return load_config()["workspace_url"].rstrip("/")


def query_sql(statement: str) -> dict[str, Any]:
    """Fire-and-wait SQL execution on the configured warehouse."""
    cfg = load_config()
    url = f"{workspace_url()}/api/2.0/sql/statements"
    payload = {
        "warehouse_id": cfg["sql_warehouse_id"],
        "statement": statement,
        "wait_timeout": "30s",
    }
    resp = requests.post(url, headers=auth_headers(), json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()


def get_latest_model_version(model_name: str = "ncf_grant_friction",
                             stage: str = "Production") -> dict[str, Any] | None:
    """Return the latest MLflow model version in the given stage."""
    url = f"{workspace_url()}/api/2.0/mlflow/registered-models/get-latest-versions"
    resp = requests.post(
        url,
        headers=auth_headers(),
        json={"name": model_name, "stages": [stage]},
        timeout=30,
    )
    resp.raise_for_status()
    versions = resp.json().get("model_versions", [])
    return versions[0] if versions else None
