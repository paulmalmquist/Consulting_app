"""Tear down the stage Gemma endpoint + model to stop GPU billing.

WHAT THIS FILE DOES (in plain language)
    Shuts the Gemma deployment back down so we STOP paying for the GPU. The L4 GPU costs about
    $1/hour while warm, so the model is kept "cold" (not deployed) by default and only warmed up
    when needed. This script does the cooling-down: it undeploys the model, deletes the endpoint
    and model, and clears the saved state file.

WHERE YOU SEE THIS
    Operator/cost-control script (the cleanup half of deploy.py). No page.

INPUTS -> OUTPUT
    INPUTS:  ~/.gemma-stage-state.json (written by deploy.py), or GVS_ENDPOINT_ID to force a
             teardown without that file. Plus Google credentials.
    OUTPUT:  the GPU-backed model is removed and billing stops; the state file is deleted.

HOW TO READ IT
    * "undeploy" = take the model off its GPU (this is what actually stops the meter); "delete"
      then removes the now-idle endpoint and model records.
    * "Idempotent" = safe to run twice — if a resource is already gone, the error is ignored and
      the script still finishes cleanly.
    * cold vs warm GPU: cold = nothing deployed, $0/hr (this script's end state); warm = deployed
      and billing. Re-warming later is cheap because the endpoint/config can be recreated.

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


# Find which endpoint to remove (from the saved state, or a forced env id), then undeploy and
# delete it so GPU billing stops.
def main() -> int:
    # If deploy.py never ran there's no saved endpoint. We still allow a forced teardown via
    # GVS_ENDPOINT_ID (e.g. cleaning up a leftover endpoint by hand); otherwise there's nothing to do.
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
    # Step 1: undeploy then delete the endpoint. undeploy_all is the line that actually stops the
    # GPU meter; delete removes the now-idle endpoint. A failure here usually means it's already
    # gone, which is fine (idempotent) — we log and continue.
    try:
        ep = aiplatform.Endpoint(endpoint_id)
        print("[teardown] undeploying all models (stops GPU billing)...", flush=True)
        ep.undeploy_all(sync=True)
        print("[teardown] deleting endpoint...", flush=True)
        ep.delete(sync=True)
        print("[teardown] endpoint deleted.", flush=True)
    except Exception as exc:  # noqa: BLE001 — already gone is fine
        print(f"[teardown] endpoint cleanup: {exc}")

    # Step 2: delete the uploaded model record(s) by their display name, so no stray model lingers.
    try:
        for m in aiplatform.Model.list(filter='display_name="ai-dispatch-stage-gemma"'):
            print(f"[teardown] deleting model {m.resource_name}", flush=True)
            m.delete(sync=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[teardown] model cleanup: {exc}")

    # Step 3: remove the saved state file so the next deploy starts clean and run.py knows there's
    # no live endpoint anymore.
    try:
        STATE.unlink()
    except Exception:
        pass
    print("[teardown] COMPLETE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
