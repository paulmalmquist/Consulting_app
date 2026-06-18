---
id: gemma-vertex-stage
kind: skill
status: active
source_of_truth: true
topic: ai-infrastructure
owners:
  - backend
  - cross-repo
intent_tags:
  - gemma
  - vertex
  - stage
  - provisioning
triggers:
  - spin up gemma
  - deploy gemma to vertex
  - stage gemma endpoint
  - gemma vertex stage
  - test gemma through dispatch
  - tear down gemma endpoint
entrypoint: false
handoff_to:
  - ai-provider-dispatch
when_to_use: "Use to spin up a stage Gemma-on-Vertex endpoint, exercise it through the governed AI Provider Dispatch path, and tear it down — for verifying the Gemma adapter against real Vertex without touching production."
when_not_to_use: "Do not use to set GEMMA_VERTEX_* in production, enable AI_DISPATCH_ENABLED in production, promote Gemma, or route live chat. Those are deliberately out of scope."
surface_paths:
  - scripts/gemma_vertex_stage/
  - backend/app/services/ai_dispatch/providers/gemma_vertex_provider.py
name: gemma-vertex-stage
description: "Spin up / exercise / tear down a stage Gemma-on-Vertex endpoint and validate it through the governed dispatch path. Stage-only; never touches production config or flags."
---

# Gemma on Vertex — stage spin-up

Three commands: **deploy → run → teardown**. Always pair deploy with teardown (GPU billing).

## Hard rules (stage-only)
- Never set `GEMMA_VERTEX_*` in production, never enable `AI_DISPATCH_ENABLED` in production.
- This does not promote Gemma and does not route live chat. Real Gemma calls go only through the
  existing governed dispatch path (`run_dispatch` / `/api/ai/dispatch/run` / the CLI).
- Always tear the endpoint down after the test — an idle L4 endpoint bills ~$1/hr.

## Prerequisites
1. **GCP project** with the **Vertex AI API enabled** (`aiplatform.googleapis.com`).
2. **Credentials** with **Agent Platform User + Administrator** (`roles/aiplatform.user` + `roles/aiplatform.admin`).
   The backend's BigQuery SA can be reused once those roles are added:
   ```bash
   cd backend && railway variables --json | python -c "import sys,json,os; \
     sa=json.loads(json.load(sys.stdin)['GOOGLE_APPLICATION_CREDENTIALS_JSON']); \
     open(os.path.expanduser('~/.gcp-stage-sa.json'),'w').write(json.dumps(sa))"
   export GOOGLE_APPLICATION_CREDENTIALS=~/.gcp-stage-sa.json
   ```
3. **GPU quota**: `NVIDIA_L4` "Custom Model Serving" quota ≥ 1 in the region (often 0 by default → request increase).
4. **SDK**: `python -m pip install "google-cloud-aiplatform>=1.71"`.

## Commands (from repo root, with `GOOGLE_APPLICATION_CREDENTIALS` set)
```bash
# 1. Deploy the smallest Gemma (gemma-3-1b-it) on the cheapest GPU (L4). ~6–20 min.
python -m scripts.gemma_vertex_stage.deploy
#    -> prints endpoint id + dedicated DNS + the export lines; writes ~/.gemma-stage-state.json
#    Overrides: GVS_PROJECT / GVS_LOCATION / GVS_MODEL / GVS_MACHINE / GVS_ACCEL

# 2. Exercise the governed dispatch path (real Gemma call; receipt captured, NOT written to prod).
python -m scripts.gemma_vertex_stage.run

# 3. Tear down (undeploy + delete endpoint + model). ALWAYS run this.
python -m scripts.gemma_vertex_stage.teardown
```

## Gotchas (learned 2026-06-18)
- **First Vertex use 500s.** A brand-new-to-Vertex project's first deploy can fail with a bare
  `500 INTERNAL` (service-agent provisioning lag). `deploy.py` retries once; it usually succeeds.
- **Model Garden endpoints are *dedicated*.** They reject the shared `aiplatform.googleapis.com`
  domain (`FAILED_PRECONDITION`) and must be hit via their **dedicated DNS** (the endpoint resource's
  `dedicatedEndpointDns`). `deploy.py` auto-fetches it; set it as `GEMMA_VERTEX_DEDICATED_DNS` for the
  adapter. (`gemma_vertex_provider.py` uses it when present, shared domain otherwise.)
- **vLLM `:predict` returns a string prediction** — `{"predictions": ["<text>"]}`. The adapter's
  `_extract_text` already handles a string `predictions[0]`.
- **Receipts in a no-DB run** report `receipt_write_failed` (the CLI/script has no Postgres), which
  correctly degrades the result — proof the receipt guard fires on a real call. The dispatch itself
  still succeeded (real answer + latency).
- **Carrying to prod** is a separate, deliberate decision: config present but execution still gated.
  See `docs/plans/ai-provider-dispatch/gemma-vertex-setup.md`.
