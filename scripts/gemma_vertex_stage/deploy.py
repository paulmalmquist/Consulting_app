"""Deploy the smallest Gemma to a Vertex endpoint (stage), cheapest GPU, and save state.

WHAT THIS FILE DOES (in plain language)
    Stands up a private copy of Google's open "Gemma" language model on Google Cloud's
    managed ML platform ("Vertex AI"), so sensitive text can be triaged WITHOUT sending it to
    any public AI API. It picks the smallest Gemma and the cheapest GPU, deploys it, looks up
    the model's private web address, and saves everything needed to call it later.

    Vocabulary you'll meet here:
      * Vertex AI  = Google Cloud's managed ML platform (where the model runs).
      * endpoint   = a deployed, callable model — you POST text to it and get text back.
      * Model Garden = Google's catalog of ready-to-deploy open models (Gemma lives here).
      * L4 GPU     = the graphics chip that runs the model; ~$1/hr WHILE WARM. That's why we
                     deploy on demand and tear down right after — see teardown.py.

WHERE YOU SEE THIS
    This is an operator/provisioning script, not a page. The endpoint it creates is what the
    backend "Gemma on Vertex" adapter (gemma_vertex_provider.py) calls, which is in turn what
    the Control Tower page uses to route SENSITIVE triage to the private model tier.

INPUTS -> OUTPUT
    INPUTS:  Google credentials (via GOOGLE_APPLICATION_CREDENTIALS) + the GVS_* env overrides
             below (which model / region / machine / GPU to use).
    OUTPUT:  a live Vertex endpoint, plus ~/.gemma-stage-state.json holding
             project/location/endpoint_id/dedicated_dns, plus printed `export` lines that wire
             the dispatch adapter to this endpoint.

HOW TO READ IT
    * "dedicated DNS" = the endpoint's own private web address (Model Garden endpoints reject
      the shared Google domain, so we must fetch and use their dedicated address).
    * The two-attempt retry exists because Google's very first deploy in a fresh project can
      return a transient 500 while it provisions service agents — one retry usually clears it.

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


# Look up the endpoint's private web address ("dedicated DNS"). Model Garden endpoints can only
# be called at this address, not the shared Google domain, so we read it back from Vertex and
# save it. -> this value becomes GEMMA_VERTEX_DEDICATED_DNS, which the backend adapter uses to
# reach the model; without it, calls to a Model Garden endpoint fail.
def _fetch_dedicated_dns(project: str, location: str, endpoint_id: str) -> str:
    import google.auth
    import httpx
    from google.auth.transport.requests import Request

    # Application Default Credentials (ADC): ambient Google auth from the environment — no pasted
    # keys. We exchange them for a short-lived token to authorize the lookup call below.
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(Request())
    # Ask Vertex for the endpoint's details; the dedicated address is one field in the response.
    r = httpx.get(
        f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/endpoints/{endpoint_id}",
        headers={"Authorization": "Bearer " + creds.token},
        timeout=30,
    )
    return r.json().get("dedicatedEndpointDns", "") if r.status_code == 200 else ""


# Deploy Gemma, fetch its private address, save state, and print the env lines to wire it up.
def main() -> int:
    # Read the deployment choices (which model / region / machine / GPU), falling back to the
    # cheapest sensible stage defaults when an override isn't set.
    project = os.environ.get("GVS_PROJECT", "novendor-events-prod")
    location = os.environ.get("GVS_LOCATION", "us-central1")
    model_id = os.environ.get("GVS_MODEL", "google/gemma3@gemma-3-1b-it")
    machine = os.environ.get("GVS_MACHINE", "g2-standard-12")
    accel = os.environ.get("GVS_ACCEL", "NVIDIA_L4")

    import vertexai
    from google.api_core.exceptions import InternalServerError
    from vertexai.preview import model_garden

    # Point the Vertex client at the target project/region, then grab the Gemma model from
    # Google's Model Garden catalog so we can deploy it.
    vertexai.init(project=project, location=location)
    print(f"[deploy] {model_id} on {machine} + 1x {accel} in {project}/{location} ...", flush=True)
    model = model_garden.OpenModel(model_id)

    # Deploy the model onto a warm GPU and get back a callable endpoint. The retry handles the
    # one-time transient 500 Google can throw the very first time a project deploys anything.
    endpoint = None
    for attempt in (1, 2):  # first Vertex use can 500 (service-agent provisioning) — retry once
        try:
            # accept_eula=True agrees to Gemma's license; this call is what actually spins up the
            # (billable) GPU-backed endpoint.
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
    # Pull the short numeric endpoint id out of its full resource path, look up its private
    # address, and save both to disk so run.py and teardown.py can find this exact endpoint.
    ep_id = endpoint.resource_name.rsplit("/", 1)[-1]
    dns = _fetch_dedicated_dns(project, location, ep_id)
    state = {"project": project, "location": location, "endpoint_id": ep_id, "dedicated_dns": dns}
    STATE.write_text(json.dumps(state, indent=2))

    print(f"\n[deploy] DONE endpoint_id={ep_id}")
    print(f"[deploy] dedicated_dns={dns or '(none — regular endpoint)'}")
    print(f"[deploy] state saved to {STATE}\n")
    # Print copy-paste env lines so an operator can point the backend Gemma adapter at this
    # endpoint. -> set these and the Control Tower can route sensitive triage to this private tier.
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
