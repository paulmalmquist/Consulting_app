#!/usr/bin/env python3
"""
Deploy the nightly_pipeline Databricks Workflow.

Usage:
    python3 historyrhymes/jobs/deploy_workflow.py [--update JOB_ID]

First run:  creates the job and prints the job_id.
Subsequent: python3 ... --update <job_id>   (updates existing job in place)

Requires: pip install requests pyyaml
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import requests
    import yaml
except ImportError:
    print("pip install requests pyyaml")
    sys.exit(1)

WORKSPACE_URL = "https://adb-4255706404671504.4.azuredatabricks.net"
PAT           = os.environ.get("DATABRICKS_PAT", "")
if not PAT:
    raise RuntimeError("DATABRICKS_PAT env var is required")
HEADERS       = {"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"}

HERE = Path(__file__).parent


def load_workflow_json() -> dict:
    """Load YAML workflow definition and convert to Databricks Jobs API v2.1 JSON."""
    spec_path = HERE / "nightly_pipeline.yml"
    with open(spec_path) as f:
        spec = yaml.safe_load(f)

    # Strip YAML anchors/aliases artefacts and build API payload
    tasks = []
    for t in spec["tasks"]:
        task = {k: v for k, v in t.items() if not k.startswith("_")}
        tasks.append(task)

    payload = {
        "name":                   spec["name"],
        "schedule":               spec["schedule"],
        "email_notifications":    spec.get("email_notifications", {}),
        "max_concurrent_runs":    spec.get("max_concurrent_runs", 1),
        "tasks":                  tasks,
    }
    if "health" in spec:
        payload["health"] = spec["health"]

    return payload


def create_job(payload: dict) -> int:
    resp = requests.post(f"{WORKSPACE_URL}/api/2.1/jobs/create",
                         headers=HEADERS, json=payload, timeout=30)
    resp.raise_for_status()
    job_id = resp.json()["job_id"]
    print(f"Created job: {job_id}")
    return job_id


def update_job(job_id: int, payload: dict) -> None:
    resp = requests.post(f"{WORKSPACE_URL}/api/2.1/jobs/reset",
                         headers=HEADERS,
                         json={"job_id": job_id, "new_settings": payload},
                         timeout=30)
    resp.raise_for_status()
    print(f"Updated job {job_id}")


def get_job(job_id: int) -> dict:
    resp = requests.get(f"{WORKSPACE_URL}/api/2.1/jobs/get",
                        headers=HEADERS, params={"job_id": job_id}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--update", type=int, help="Job ID to update (omit to create)")
    parser.add_argument("--dry-run", action="store_true", help="Print JSON only")
    args = parser.parse_args()

    payload = load_workflow_json()

    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return

    if args.update:
        update_job(args.update, payload)
        info = get_job(args.update)
        print(f"Job URL: {WORKSPACE_URL}/#job/{args.update}")
    else:
        job_id = create_job(payload)
        print(f"Job URL: {WORKSPACE_URL}/#job/{job_id}")
        print(f"\nTo update later:")
        print(f"  python3 historyrhymes/jobs/deploy_workflow.py --update {job_id}")
        # Save job_id locally
        (HERE / "job_id.txt").write_text(str(job_id))
        print(f"Job ID saved to historyrhymes/jobs/job_id.txt")


if __name__ == "__main__":
    main()
