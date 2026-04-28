"""
create_jobs.py — Create a Databricks Workflow job for the medallion seed.

Creates one job with one task (runs seed_all_tables notebook).
Manual trigger only — no schedule. Run seed_workspace.py first to upload the notebook.

Usage:
    python create_jobs.py

Requirements: requests, python-dotenv
"""

import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

HOST = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
TOKEN = os.environ.get("DATABRICKS_TOKEN", "")
CLUSTER_ID = os.environ.get("DATABRICKS_CLUSTER_ID", "")
ALLOW_NEW_CLUSTER = os.environ.get("DATABRICKS_ALLOW_NEW_CLUSTER", "false").lower() == "true"
NOTEBOOK_PATH_CFG = os.environ.get(
    "DATABRICKS_NOTEBOOK_PATH",
    "/Users/<your-email@domain.com>/supply_chain_demo",
)


def _headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def preflight():
    if not HOST or not TOKEN:
        print("ERROR: DATABRICKS_HOST and DATABRICKS_TOKEN are required.")
        sys.exit(1)
    if not CLUSTER_ID and not ALLOW_NEW_CLUSTER:
        print(
            "ERROR: DATABRICKS_CLUSTER_ID is required.\n"
            "Set it to a running cluster ID, or set DATABRICKS_ALLOW_NEW_CLUSTER=true."
        )
        sys.exit(1)


def resolve_notebook_path():
    path = NOTEBOOK_PATH_CFG
    if "<your-email@domain.com>" in path:
        try:
            r = requests.get(
                f"{HOST}/api/2.0/preview/scim/v2/Me",
                headers=_headers(),
                timeout=15,
            )
            r.raise_for_status()
            email = r.json().get("userName", "")
            if email:
                path = path.replace("<your-email@domain.com>", email)
        except Exception:
            pass
    return path.rstrip("/")


def main():
    preflight()
    print("Supply Chain Demo — Create Workflow Job")
    print(f"  Host: {HOST}")

    base_path = resolve_notebook_path()
    seed_notebook = f"{base_path}/seed_all_tables"

    cluster_spec = {}
    if CLUSTER_ID:
        cluster_spec = {"existing_cluster_id": CLUSTER_ID}
    else:
        cluster_spec = {
            "new_cluster": {
                "spark_version": "15.4.x-scala2.12",
                "node_type_id": "Standard_DS3_v2",
                "num_workers": 0,
                "spark_conf": {"spark.databricks.cluster.profile": "singleNode"},
                "custom_tags": {"ResourceClass": "SingleNode"},
            }
        }

    payload = {
        "name": "Supply Chain Demo - Medallion Refresh",
        "tasks": [
            {
                "task_key": "seed_all_tables",
                "description": "Seed all 19 bronze/silver/semantic Delta tables",
                "notebook_task": {"notebook_path": seed_notebook},
                **cluster_spec,
            }
        ],
        "format": "MULTI_TASK",
    }

    r = requests.post(
        f"{HOST}/api/2.1/jobs/create",
        json=payload,
        headers=_headers(),
        timeout=30,
    )

    if r.status_code in (200, 201):
        job_id = r.json().get("job_id")
        job_url = f"{HOST}/#job/{job_id}"
        print(f"  ✓ job created: {job_url}")
        print(f"\nTo run: open the URL above and click Run Now.")
        print(f"Or run seed_workspace.py for a one-shot ad-hoc run.")
    else:
        print(f"  ✗ job creation failed ({r.status_code}): {r.text}")
        sys.exit(1)


if __name__ == "__main__":
    main()
