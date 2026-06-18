# Gemma on Vertex — adapter & stage setup (PR 3)

PR 3 replaces the Gemma fail-closed stub with a real Vertex AI adapter
(`backend/app/services/ai_dispatch/providers/gemma_vertex_provider.py`). The dispatch contract is
unchanged: Gemma is still barred from code/tool/SQL, HIGH risk, and SENSITIVE data, is **not promoted**
to a default for any mode, and `POST /run` stays flag-gated off.

## What this PR does and does NOT do

- **Does:** call a deployed Vertex endpoint via the `:predict` contract, authenticate with Application
  Default Credentials (ADC), parse the response into `ProviderCompletion`, record a redacted receipt.
- **Does NOT:** provision any GCP infrastructure, set credentials in any environment, promote Gemma,
  enable `AI_DISPATCH_ENABLED`, add fallback chains, or change `ai_gateway.py` / `request_router.py`.

Because no `GEMMA_VERTEX_*` credentials are set anywhere, Gemma **remains unavailable / fail-closed in
production after this PR merges** — the adapter only becomes live where credentials are configured.

## Env keys (names only — never commit values)

| Variable | Purpose |
|---|---|
| `GEMMA_VERTEX_PROJECT_ID` | GCP project hosting the Vertex endpoint (required) |
| `GEMMA_VERTEX_LOCATION` | Vertex region, e.g. `us-central1` (defaults to `us-central1`) |
| `GEMMA_VERTEX_ENDPOINT_ID` | Deployed Vertex endpoint id (required) |
| `GEMMA_VERTEX_DEDICATED_DNS` | The endpoint's dedicated DNS (`dedicatedEndpointDns`). **Required for Model Garden deployments** — they are *dedicated* endpoints that reject the shared `aiplatform.googleapis.com` domain. Leave empty for a regular shared-domain endpoint. |
| Google auth | Application Default Credentials — `GOOGLE_APPLICATION_CREDENTIALS` (service-account JSON path) or workload identity already approved for the backend runtime. The service-account JSON is **never** read into a receipt or the UI. |

> **Spin-up automation:** the `.skills/gemma-vertex-stage/` skill (`scripts/gemma_vertex_stage/`)
> deploys the smallest Gemma on the cheapest GPU, auto-fetches the dedicated DNS, exercises the
> dispatch path, and tears the endpoint down — one command each. Verified end-to-end on 2026-06-18
> (gemma-3-1b-it on L4: real `:predict` 200, dispatch SUCCESS, then teardown).

## Fail-closed behavior

- Any of `GEMMA_VERTEX_PROJECT_ID` / `GEMMA_VERTEX_ENDPOINT_ID` (or location) missing → `ProviderUnavailable`
  → `UNAVAILABLE / provider_not_configured`.
- ADC missing or unrefreshable → `ProviderUnavailable` → `provider_not_configured` (no secret leaked).
- Vertex transport / timeout / HTTP ≥400 → `ProviderCallError` → `DEGRADED / provider_call_failed`.
- `complete()` never raises out; the supervisor records the outcome.

## Stage setup (do this in a non-prod / stage backend first — recommended)

1. **Deploy Gemma to a Vertex endpoint.** In Vertex AI Model Garden, select a Gemma model and deploy it
   to an endpoint (GPU/TPU-backed). Copy the numeric **endpoint id**.
2. **Service account + ADC.** Create/choose a service account with `roles/aiplatform.user`; provide its
   credentials to the backend runtime via ADC (mounted `GOOGLE_APPLICATION_CREDENTIALS` JSON or workload
   identity). Do not paste the JSON anywhere it could be logged.
3. **Set env** on the stage backend: `GEMMA_VERTEX_PROJECT_ID`, `GEMMA_VERTEX_LOCATION`,
   `GEMMA_VERTEX_ENDPOINT_ID`.
4. **Confirm the serving contract.** The adapter sends `{instances:[{prompt,max_tokens}]}` and parses
   `{predictions:[…]}` / `generateContent`-style responses defensively. Confirm the exact request/response
   shape of your serving container and adjust `_vertex_predict` / `_extract_text` if it differs.
5. **Exercise via the gated path only.** With `AI_DISPATCH_ENABLED=true` **on stage only**, run a real
   call through `POST /api/ai/dispatch/run` or the CLI `ask --mode summarization --risk low`. Verify a
   `success` with a receipt; verify a forced error path returns `degraded / provider_call_failed`.

## Production

Recommended: after the stage call is verified, deploy to production with `GEMMA_VERTEX_*` config present
but **execution still gated** (`AI_DISPATCH_ENABLED` stays off). Promotion of Gemma to a mode default and
cost/latency guards are **later PRs** (see `roadmap.md`), not this one.
