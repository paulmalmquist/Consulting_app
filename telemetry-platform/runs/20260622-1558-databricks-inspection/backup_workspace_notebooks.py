"""Workspace mutation guard — export current deployed notebook source as a backup.

Before any driver re-uploads (overwrite=True) a notebook, snapshot what is live in the
workspace so we can prove/restore exactly what was there. Read-only export.
"""
from __future__ import annotations
import base64
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "databricks"))
from _bootstrap import get_client  # noqa: E402

WS_DIR = "/Users/paulmalmquist@gmail.com/telemetry"
NOTEBOOKS = ["telemetry_probe", "train_anomaly", "train_rul", "promote_models",
             "score_replay_feed", "fused_state_vector", "ncr_corpus", "ncr_clustering",
             "ncr_backlog_forecast"]

backup_dir = HERE / "workspace_backup_before"
backup_dir.mkdir(exist_ok=True)


def main() -> int:
    c = get_client()
    for nb in NOTEBOOKS:
        path = f"{WS_DIR}/{nb}"
        try:
            resp = c._request("GET", f"/api/2.0/workspace/export?path={path}&format=SOURCE")
            src = base64.b64decode(resp["content"]).decode("utf-8")
            (backup_dir / f"{nb}.py").write_text(src, encoding="utf-8")
            print(f"backed up {nb}  ({len(src)} chars)")
        except Exception as e:  # noqa: BLE001
            print(f"ERR exporting {nb}: {e}")
    print("backup dir:", backup_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
