#!/usr/bin/env python3
"""
Sync the historyrhymes workspace to Databricks.

Usage:
    python3 historyrhymes/jobs/upload.py            # upload everything
    python3 historyrhymes/jobs/upload.py --only shared   # shared modules only
    python3 historyrhymes/jobs/upload.py --only pipelines
    python3 historyrhymes/jobs/upload.py --dry-run  # print what would be uploaded

Databricks workspace layout after upload:
    /historyrhymes/shared/config
    /historyrhymes/shared/utils
    /historyrhymes/shared/db
    /historyrhymes/shared/dissensus_core
    /historyrhymes/pipelines/01_spf_ingest
    /historyrhymes/pipelines/02_spf_backtest
    /historyrhymes/pipelines/03_ood_detector
    /historyrhymes/pipelines/04_dissensus_scorer
    /historyrhymes/pipelines/05_data_feeds
    /historyrhymes/pipelines/06_technical_features
    /historyrhymes/pipelines/07_supabase_backfill
    /historyrhymes/pipelines/08_agent_context_builders
    /historyrhymes/pipelines/09_nightly_agent_runner

Requires: pip install requests
"""

import argparse
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
HEADERS       = {"Authorization": f"Bearer {PAT}"}

REPO_ROOT = Path(__file__).parent.parent   # historyrhymes/

# Map: local relative path → Databricks workspace path (no extension in Databricks)
FILE_MAP = {
    # Shared modules — upload FIRST, pipelines depend on them
    "shared/config.py":           "/historyrhymes/shared/config",
    "shared/utils.py":            "/historyrhymes/shared/utils",
    "shared/db.py":               "/historyrhymes/shared/db",
    "shared/dissensus_core.py":   "/historyrhymes/shared/dissensus_core",
    # Pipelines
    "pipelines/05_data_feeds.py":              "/historyrhymes/pipelines/05_data_feeds",
    "pipelines/06_technical_features.py":      "/historyrhymes/pipelines/06_technical_features",
    "pipelines/07_supabase_backfill.py":       "/historyrhymes/pipelines/07_supabase_backfill",
    "pipelines/08_agent_context_builders.py":  "/historyrhymes/pipelines/08_agent_context_builders",
    "pipelines/09_nightly_agent_runner.py":    "/historyrhymes/pipelines/09_nightly_agent_runner",
}

# Notebooks 01-04 exist in Databricks at their old Drafts paths.
# After verifying they work, move them here too:
LEGACY_MOVE = {
    # source (Drafts)                             → target (/historyrhymes)
    "/Users/paulmalmquist@gmail.com/Drafts/01_spf_ingest":      "/historyrhymes/pipelines/01_spf_ingest",
    "/Users/paulmalmquist@gmail.com/Drafts/02_spf_backtest":    "/historyrhymes/pipelines/02_spf_backtest",
    "/Users/paulmalmquist@gmail.com/Drafts/03_ood_detector":    "/historyrhymes/pipelines/03_ood_detector",
    "/Users/paulmalmquist@gmail.com/Drafts/04_dissensus_scorer":"/historyrhymes/pipelines/04_dissensus_scorer",
}


def mkdir_p(ws_path: str) -> None:
    """Create workspace folder if it doesn't exist."""
    requests.post(
        f"{WORKSPACE_URL}/api/2.0/workspace/mkdirs",
        headers=HEADERS,
        json={"path": ws_path},
        timeout=15,
    )   # 200 or RESOURCE_ALREADY_EXISTS are both fine


def upload_notebook(local_path: Path, ws_path: str, dry_run: bool = False) -> bool:
    if not local_path.exists():
        print(f"  SKIP  {local_path.name}  (file not found)")
        return False
    if dry_run:
        print(f"  DRY   {local_path}  →  {ws_path}")
        return True

    content = base64.b64encode(local_path.read_bytes()).decode()
    resp    = requests.post(
        f"{WORKSPACE_URL}/api/2.0/workspace/import",
        headers=HEADERS,
        json={"path": ws_path, "format": "SOURCE", "language": "PYTHON",
              "content": content, "overwrite": True},
        timeout=30,
    )
    if resp.status_code == 200:
        print(f"  OK    {local_path.name:45s}  →  {ws_path}")
        return True
    else:
        print(f"  FAIL  {local_path.name}: {resp.status_code} {resp.text[:120]}")
        return False


def move_legacy(source: str, target: str, dry_run: bool = False) -> None:
    """Move a notebook from source to target path in Databricks workspace."""
    if dry_run:
        print(f"  DRY MOVE  {source}  →  {target}")
        return
    resp = requests.post(
        f"{WORKSPACE_URL}/api/2.0/workspace/move",
        headers=HEADERS,
        json={"source_path": source, "destination_path": target},
        timeout=15,
    )
    if resp.status_code == 200:
        print(f"  MOVED  {source.split('/')[-1]}  →  {target}")
    else:
        print(f"  MOVE FAILED  {source}: {resp.status_code} {resp.text[:120]}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=["shared", "pipelines"], help="Upload subset only")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--move-legacy", action="store_true",
                        help="Also move notebooks 01-04 from Drafts to /historyrhymes/pipelines")
    args = parser.parse_args()

    # Create workspace folders
    for folder in ["/historyrhymes", "/historyrhymes/shared", "/historyrhymes/pipelines"]:
        if not args.dry_run:
            mkdir_p(folder)

    ok = fail = skip = 0
    for rel_path, ws_path in FILE_MAP.items():
        if args.only == "shared"    and not rel_path.startswith("shared/"):    continue
        if args.only == "pipelines" and not rel_path.startswith("pipelines/"): continue

        local = REPO_ROOT / rel_path
        result = upload_notebook(local, ws_path, args.dry_run)
        if result:   ok   += 1
        elif local.exists(): fail += 1
        else:        skip += 1

    if args.move_legacy:
        print("\nMoving legacy notebooks (01-04) from Drafts...")
        for src, dst in LEGACY_MOVE.items():
            move_legacy(src, dst, args.dry_run)

    print(f"\n{'DRY RUN — ' if args.dry_run else ''}Done: {ok} uploaded, {fail} failed, {skip} skipped")

    if not args.dry_run and ok > 0:
        print(f"\nWorkspace: {WORKSPACE_URL}/#workspace/historyrhymes")
        print(f"Deploy workflow: python3 historyrhymes/jobs/deploy_workflow.py")


if __name__ == "__main__":
    main()
