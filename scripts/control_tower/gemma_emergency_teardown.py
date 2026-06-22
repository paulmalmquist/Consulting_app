"""Emergency Gemma-on-Vertex teardown — the practical 'don't run up a tab' safety net.

Undeploys ALL models from the configured endpoint and prints deployedModels before and after. Runs
standalone (no backend/UI dependency), so a GPU can always be killed even if the app is down.

Keeps the endpoint resource (undeploy only) so the endpoint id / dedicated DNS stay stable for re-warm.
To also DELETE the endpoint, use scripts/gemma_vertex_stage/teardown.py instead.

Usage (from repo root, with Application Default Credentials available):
    GOOGLE_APPLICATION_CREDENTIALS=~/.gcp-stage-sa.json \
      python -m scripts.control_tower.gemma_emergency_teardown

Config (env): reads the same names the dispatch adapter uses, with GVS_* fallbacks:
    GEMMA_VERTEX_PROJECT_ID  | GVS_PROJECT
    GEMMA_VERTEX_LOCATION    | GVS_LOCATION   (default us-central1)
    GEMMA_VERTEX_ENDPOINT_ID | GVS_ENDPOINT_ID
"""
from __future__ import annotations

import os


def _cfg() -> tuple[str, str, str]:
    project = os.environ.get("GEMMA_VERTEX_PROJECT_ID") or os.environ.get("GVS_PROJECT", "")
    location = os.environ.get("GEMMA_VERTEX_LOCATION") or os.environ.get("GVS_LOCATION", "us-central1")
    endpoint = os.environ.get("GEMMA_VERTEX_ENDPOINT_ID") or os.environ.get("GVS_ENDPOINT_ID", "")
    return project, location, endpoint


def _deployed_ids(ep) -> list[str]:
    try:
        return [m.id for m in ep.list_models()]
    except Exception as exc:  # noqa: BLE001
        print(f"[emergency-teardown] could not list deployedModels: {exc}")
        return []


def main() -> int:
    project, location, endpoint_id = _cfg()
    if not (project and endpoint_id):
        print("[emergency-teardown] missing config: set GEMMA_VERTEX_PROJECT_ID and "
              "GEMMA_VERTEX_ENDPOINT_ID (or GVS_PROJECT / GVS_ENDPOINT_ID).")
        return 2

    from google.cloud import aiplatform

    aiplatform.init(project=project, location=location)
    ep = aiplatform.Endpoint(endpoint_id)

    before = _deployed_ids(ep)
    print(f"[emergency-teardown] endpoint={endpoint_id} project={project} location={location}")
    print(f"[emergency-teardown] deployedModels BEFORE: {before or '(none)'}")
    if not before:
        print("[emergency-teardown] nothing deployed — no GPU billing to stop. DONE.")
        return 0

    print("[emergency-teardown] undeploying all models (stops GPU billing; endpoint retained)...", flush=True)
    ep.undeploy_all(sync=True)

    after = _deployed_ids(ep)
    print(f"[emergency-teardown] deployedModels AFTER: {after or '(none)'}")
    if after:
        print("[emergency-teardown] WARNING: models still deployed — teardown NOT complete.")
        return 1
    print("[emergency-teardown] COMPLETE — endpoint retained, no models deployed, GPU billing stopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
