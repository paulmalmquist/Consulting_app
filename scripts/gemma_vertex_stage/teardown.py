"""Tear down the stage Gemma endpoint + model to stop GPU billing.

Usage:
    GOOGLE_APPLICATION_CREDENTIALS=~/.gcp-stage-sa.json \\
      python -m scripts.gemma_vertex_stage.teardown

Reads ~/.gemma-stage-state.json (written by deploy.py). Idempotent: ignores already-deleted
resources.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

STATE = Path(os.path.expanduser("~/.gemma-stage-state.json"))


def main() -> int:
    if not STATE.exists():
        print(f"[teardown] no state file at {STATE}; nothing to do (set GVS_ENDPOINT_ID to force).")
        endpoint_id = os.environ.get("GVS_ENDPOINT_ID", "")
        project = os.environ.get("GVS_PROJECT", "novendor-events-prod")
        location = os.environ.get("GVS_LOCATION", "us-central1")
        if not endpoint_id:
            return 0
    else:
        st = json.loads(STATE.read_text())
        project, location, endpoint_id = st["project"], st["location"], st["endpoint_id"]

    from google.cloud import aiplatform

    aiplatform.init(project=project, location=location)
    try:
        ep = aiplatform.Endpoint(endpoint_id)
        print("[teardown] undeploying all models (stops GPU billing)...", flush=True)
        ep.undeploy_all(sync=True)
        print("[teardown] deleting endpoint...", flush=True)
        ep.delete(sync=True)
        print("[teardown] endpoint deleted.", flush=True)
    except Exception as exc:  # noqa: BLE001 — already gone is fine
        print(f"[teardown] endpoint cleanup: {exc}")

    try:
        for m in aiplatform.Model.list(filter='display_name="ai-dispatch-stage-gemma"'):
            print(f"[teardown] deleting model {m.resource_name}", flush=True)
            m.delete(sync=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[teardown] model cleanup: {exc}")

    try:
        STATE.unlink()
    except Exception:
        pass
    print("[teardown] COMPLETE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
