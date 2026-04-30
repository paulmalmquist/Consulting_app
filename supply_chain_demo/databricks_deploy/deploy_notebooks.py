"""
deploy_notebooks.py — Upload the 8 supply chain notebooks to a Databricks workspace.

Usage:
    cp .env.example .env
    python deploy_notebooks.py

Uploads to DATABRICKS_NOTEBOOK_PATH (default: /Users/<email>/supply_chain_demo).

Requirements: requests, python-dotenv
"""

import base64
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

HOST = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
TOKEN = os.environ.get("DATABRICKS_TOKEN", "")
NOTEBOOK_PATH_CFG = os.environ.get(
    "DATABRICKS_NOTEBOOK_PATH",
    "/Users/<your-email@domain.com>/supply_chain_demo",
)

NOTEBOOKS_DIR = Path(__file__).parent.parent

NOTEBOOKS = [
    ("00_setup.py",            "PYTHON"),
    ("01_bronze_ingest.py",    "PYTHON"),
    ("02_silver_transform.py", "PYTHON"),
    ("03_gold_kpis.py",        "PYTHON"),
    ("04_semantic_views.sql",  "SQL"),
    ("05_data_quality.py",     "PYTHON"),
    ("06_ai_layer.py",         "PYTHON"),
    ("07_dashboard.sql",       "SQL"),
    ("09_cdc_merge.py",        "PYTHON"),
]


def _headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def preflight():
    if not HOST or not TOKEN:
        print("ERROR: DATABRICKS_HOST and DATABRICKS_TOKEN are required.")
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
                print(f"  auto-detected user email: {email}")
        except Exception as e:
            print(f"  warning: could not auto-detect email ({e}); using path as-is")
    return path.rstrip("/")


def ensure_workspace_folder(base_path):
    r = requests.post(
        f"{HOST}/api/2.0/workspace/mkdirs",
        json={"path": base_path},
        headers=_headers(),
        timeout=15,
    )
    if r.status_code not in (200, 201):
        print(f"  warning: mkdirs returned {r.status_code}: {r.text}")


def upload_notebook(workspace_path, local_path, language):
    content = local_path.read_bytes()
    encoded = base64.b64encode(content).decode("utf-8")
    payload = {
        "path": workspace_path,
        "format": "SOURCE",
        "language": language,
        "content": encoded,
        "overwrite": True,
    }
    r = requests.post(
        f"{HOST}/api/2.0/workspace/import",
        json=payload,
        headers=_headers(),
        timeout=30,
    )
    return r.status_code, r.text


def main():
    preflight()
    print("Supply Chain Demo — Upload Notebooks")
    print(f"  Host: {HOST}")

    base_path = resolve_notebook_path()
    print(f"  Path: {base_path}")
    ensure_workspace_folder(base_path)
    print()

    success = 0
    failed = 0
    for filename, language in NOTEBOOKS:
        local_path = NOTEBOOKS_DIR / filename
        if not local_path.exists():
            print(f"  ✗ {filename:<30} not found at {local_path}")
            failed += 1
            continue

        stem = Path(filename).stem
        workspace_path = f"{base_path}/{stem}"
        status, text = upload_notebook(workspace_path, local_path, language)

        if status in (200, 201):
            print(f"  ✓ uploaded  {filename:<30} →  {workspace_path}")
            success += 1
        else:
            print(f"  ✗ failed    {filename:<30} ({status}): {text}")
            failed += 1

    print(f"\n{success} uploaded, {failed} failed.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
