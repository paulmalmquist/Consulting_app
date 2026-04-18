#!/usr/bin/env python3
"""
Upload History Rhymes notebooks to Databricks workspace.
Run from your local terminal:

    python3 skills/historyrhymes/notebooks/upload_to_databricks.py

Requires: pip install requests
PAT set via env var DATABRICKS_PAT or hardcoded below (rotate after use).
"""

import base64
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

WORKSPACE_URL = "https://adb-4255706404671504.4.azuredatabricks.net"
PAT           = os.environ.get("DATABRICKS_PAT", "")
if not PAT:
    raise RuntimeError("DATABRICKS_PAT env var is required")
DEST_FOLDER   = "/Users/paulmalmquist@gmail.com/Drafts"

NOTEBOOKS = [
    "05_data_feeds.py",
    "06_technical_features.py",
    "07_supabase_backfill.py",
    "08_agent_context_builders.py",
]

headers = {"Authorization": f"Bearer {PAT}"}
script_dir = Path(__file__).parent

def upload(notebook_file: str):
    path = script_dir / notebook_file
    if not path.exists():
        print(f"  SKIP {notebook_file} — file not found at {path}")
        return

    content = base64.b64encode(path.read_bytes()).decode()
    dest    = f"{DEST_FOLDER}/{notebook_file.replace('.py', '')}"

    resp = requests.post(
        f"{WORKSPACE_URL}/api/2.0/workspace/import",
        headers=headers,
        json={
            "path":      dest,
            "format":    "SOURCE",
            "language":  "PYTHON",
            "content":   content,
            "overwrite": True,
        },
        timeout=30,
    )

    if resp.status_code == 200:
        print(f"  OK   {notebook_file} → {dest}")
    else:
        print(f"  FAIL {notebook_file}: {resp.status_code} {resp.text}")

print(f"Uploading {len(NOTEBOOKS)} notebooks to {DEST_FOLDER}...")
for nb in NOTEBOOKS:
    upload(nb)
print("Done.")
