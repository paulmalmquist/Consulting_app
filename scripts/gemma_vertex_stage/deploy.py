"""Deploy the smallest Gemma to a Vertex endpoint (stage), cheapest GPU, and save state.

Usage:
    GOOGLE_APPLICATION_CREDENTIALS=~/.gcp-stage-sa.json \\
      python -m scripts.gemma_vertex_stage.deploy

Env overrides (all optional):
    GVS_PROJECT   (default novendor-events-prod)
    GVS_LOCATION  (default us-central1)
    GVS_MODEL     (default google/gemma3@gemma-3-1b-it)
    GVS_MACHINE   (default g2-standard-12)
    GVS_ACCEL     (default NVIDIA_L4)

Writes ~/.gemma-stage-state.json with project/location/endpoint_id/dedicated_dns and prints the
export lines to wire the dispatch adapter. ALWAYS pair with teardown.py to stop GPU billing.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

STATE = Path(os.path.expanduser("~/.gemma-stage-state.json"))


def _fetch_dedicated_dns(project: str, location: str, endpoint_id: str) -> str:
    import google.auth
    import httpx
    from google.auth.transport.requests import Request

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(Request())
    r = httpx.get(
        f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/endpoints/{endpoint_id}",
        headers={"Authorization": "Bearer " + creds.token},
        timeout=30,
    )
    return r.json().get("dedicatedEndpointDns", "") if r.status_code == 200 else ""


def main() -> int:
    project = os.environ.get("GVS_PROJECT", "novendor-events-prod")
    location = os.environ.get("GVS_LOCATION", "us-central1")
    model_id = os.environ.get("GVS_MODEL", "google/gemma3@gemma-3-1b-it")
    machine = os.environ.get("GVS_MACHINE", "g2-standard-12")
    accel = os.environ.get("GVS_ACCEL", "NVIDIA_L4")

    import vertexai
    from google.api_core.exceptions import InternalServerError
    from vertexai.preview import model_garden

    vertexai.init(project=project, location=location)
    print(f"[deploy] {model_id} on {machine} + 1x {accel} in {project}/{location} ...", flush=True)
    model = model_garden.OpenModel(model_id)

    endpoint = None
    for attempt in (1, 2):  # first Vertex use can 500 (service-agent provisioning) — retry once
        try:
            endpoint = model.deploy(
                accept_eula=True,
                machine_type=machine,
                accelerator_type=accel,
                accelerator_count=1,
                endpoint_display_name="ai-dispatch-stage-gemma",
                model_display_name="ai-dispatch-stage-gemma",
            )
            break
        except InternalServerError as exc:
            print(f"[deploy] attempt {attempt} got INTERNAL ({exc}); retrying..." if attempt == 1 else f"[deploy] failed: {exc}", flush=True)
            if attempt == 2:
                return 1
            time.sleep(10)

    assert endpoint is not None
    ep_id = endpoint.resource_name.rsplit("/", 1)[-1]
    dns = _fetch_dedicated_dns(project, location, ep_id)
    state = {"project": project, "location": location, "endpoint_id": ep_id, "dedicated_dns": dns}
    STATE.write_text(json.dumps(state, indent=2))

    print(f"\n[deploy] DONE endpoint_id={ep_id}")
    print(f"[deploy] dedicated_dns={dns or '(none — regular endpoint)'}")
    print(f"[deploy] state saved to {STATE}\n")
    print("# export these to wire the dispatch adapter (STAGE ONLY):")
    print(f"export GEMMA_VERTEX_PROJECT_ID={project}")
    print(f"export GEMMA_VERTEX_LOCATION={location}")
    print(f"export GEMMA_VERTEX_ENDPOINT_ID={ep_id}")
    if dns:
        print(f"export GEMMA_VERTEX_DEDICATED_DNS={dns}")
    print("\n# When done:  python -m scripts.gemma_vertex_stage.teardown")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
