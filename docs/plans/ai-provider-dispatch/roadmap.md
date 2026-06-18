# Roadmap

## PR 1 — Standalone governed spine (done)
Backend package (models/registry/policy/providers/supervisor/receipts), migration 541, route
`/api/ai/dispatch`, CLI, tests. OpenAI real, Claude real, Gemma fails closed. No gateway changes.

## PR 2 — Visibility + eval harness (in progress — ADO Feature #668)
Read-only platform admin panel at `/lab/system/ai-provider-dispatch` (gated by `isAdminSession`):
provider inventory (available / not-configured / fail-closed, modes, risk/privacy ceilings, missing-env
shown by name only), an honest capability banner, the routing eval suite, and recent governed dispatch
receipts. GET-only proxy (`/api/ai-dispatch/[...path]`) — structurally cannot trigger a provider call.
Added read-only backend `GET /api/ai/dispatch/evals` (in-process `select_provider`, no model calls, no
DB, no external files). Independent of the ade-ops module (own primitives/proxy). No `ai_gateway` /
`request_router` changes; `POST /run` stays flag-gated off.

Still deferred to a later PR: real eval *grading* against live providers and the Gemma **promotion
criteria** (a mode flips Gemma to default only after ≥90% suite pass on that mode, 0 critical
hallucinations, and a better latency/cost profile than the frontier model). PR 2 ships routing-policy
eval *visibility*, not live-provider grading.

## PR 3 — Real Gemma on Vertex (adapter shipped — ADO Feature #669)
Wired `gemma_vertex_provider` to a real Vertex endpoint (`:predict` + ADC auth); Gemma is now in the
implemented set so availability is purely credential-gated. Fails closed on missing env/ADC
(`provider_not_configured`); Vertex errors → `provider_call_failed`. Receipts redacted, no secrets/raw
answers. Mocked-Vertex tests; no GCP provisioning in this PR, so Gemma stays unavailable in prod until
credentials are set. Gemma is **not promoted** and `POST /run` stays gated. Setup/stage runbook:
`gemma-vertex-setup.md`. Still deferred: provisioning a real endpoint + the first real call (stage-first),
which is an infra step, not code.

## PR 4 — Cost + budget
Per-provider cost/latency metering recorded on the receipt; a budget guard returning
`cost_limit_exceeded` when a call would exceed the configured ceiling.

## PR 5 — Live gateway integration
Route one lane of real chat through the dispatch layer behind a flag, so the production gateway begins to
consume provider selection. Separately gated; reversible.

## PR 6 — Fallback chains
Explicit, recorded fallback chains with `fallback_chain_exhausted` when every eligible+available provider
fails.
