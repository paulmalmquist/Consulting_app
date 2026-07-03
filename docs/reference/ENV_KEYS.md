# Environment Keys & Access Codes — NAMES-ONLY INDEX

> **Policy: this file never contains secret values.** It is a tracked index of
> env-var names, where each value lives, and what it powers. Pull real values
> with the CLI (`vercel env pull backend/.env --environment production --yes`,
> `railway variables`, or the provisioning script named in the row) — never
> from a committed file. The tracked-docs secret-shape guard in
> `scripts/check_repo_guardrails.mjs` fails CI if a credential-shaped value
> lands in `docs/`.

## Winston App (novendor.ai / `consulting-app` project on Vercel)

| Variable | Where the value lives | Notes |
|---|---|---|
| `NOVENDOR_ADMIN_EMAIL` | not secret — `info@novendor.ai` | Primary admin login (Supabase auth) |
| `NOVENDOR_ADMIN_PASSWORD` | Vercel env (production) / Supabase dashboard | Password for info@novendor.ai |
| `ADMIN_INVITE_CODE` | Vercel env (production) | Legacy invite code — fallback if email auth fails. **A prior value of this code was committed to git history in this file; rotation is pending approval (see Story #758).** |
| `ENV_INVITE_CODE` | Vercel env (production) | Grants access to environments as env_user |

## AI Provider Dispatch (standalone model router)

| Variable | Where the value lives | Notes |
|---|---|---|
| `AI_DISPATCH_ENABLED` | Railway backend env (default `false`) | Gates the cost-bearing `POST /api/ai/dispatch/run`. Read-only routing/inspection stays available. |
| `AI_DISPATCH_GEMMA_ENABLED` | Railway backend env (default `false`) | Initial value of the runtime, frontend-controllable Gemma toggle. When off, Gemma-home modes fall back to the small frontier model. |
| `AI_DISPATCH_FALLBACK_PROVIDER` / `AI_DISPATCH_FALLBACK_MODEL` | Railway backend env (defaults: openai / gpt-5-mini) | Small-model fallback used for Gemma-home modes when Gemma is off/unavailable (recorded, not silent). |
| `AI_DISPATCH_ALLOW_FALLBACK` | Railway backend env (default `false`) | Global cross-provider fallback guard; a request must also opt in per call. |
| `AI_DISPATCH_ANTHROPIC_MODEL` | Railway backend env (default: claude-opus-4-20250514) | Concrete Anthropic API model id for the Claude adapter. |
| `ANTHROPIC_API_KEY` | Railway backend env (already set for psychrag) | Enables the Claude provider. |
| `GEMMA_VERTEX_PROJECT_ID` / `GEMMA_VERTEX_LOCATION` / `GEMMA_VERTEX_ENDPOINT_ID` | unset in prod (stage: set by `.skills/gemma-vertex-stage`) | Gemma-on-Vertex contract. Their absence keeps Gemma fail-closed; set (stage only) to point the adapter at a deployed endpoint. |
| `GEMMA_VERTEX_DEDICATED_DNS` | unset in prod | Endpoint's `dedicatedEndpointDns`. **Required for Model Garden (dedicated) endpoints** — they reject the shared aiplatform.googleapis.com domain. Empty for shared-domain endpoints. |

## Stargate streaming lane (Confluent Cloud — PR 4)

| Variable | Where the value lives | Notes |
|---|---|---|
| `CONFLUENT_BOOTSTRAP_SERVERS` | printed by `infra/confluent/stargate/provision.ps1` | Cluster bootstrap; `localhost:9092` for local Redpanda |
| `CONFLUENT_API_KEY` / `CONFLUENT_API_SECRET` | minted by provision.ps1 for sa-stargate-demo | Cluster key. Do not keep unlabeled key files at the repo root — mint scoped keys via provision.ps1. |
| `CONFLUENT_SR_URL` | printed by provision.ps1 | Schema Registry; `http://localhost:8081` for local Redpanda SR |
| `CONFLUENT_SR_API_KEY` / `CONFLUENT_SR_API_SECRET` | minted by provision.ps1 | SR credentials, cloud only |
| `STARGATE_MODE` | Railway backend env (`cloud` \| `local` \| `capture`) | Bridge mode. Producer + laptop bridge; ALSO set on Railway (`capture`) for the mounted bridge |
| `STARGATE_BRIDGE_ENABLED` | Railway backend env (`1` on Railway, unset elsewhere) | Mounts the `/stargate/*` bridge router in the backend (default off; capture mode in prod) |
| `NEXT_PUBLIC_STARGATE_BRIDGE_URL` | Vercel env (production) — the Railway origin | **REQUIRED in production** for the Stargate page to be live — the page fails closed (shows a "bridge not configured" diagnostic) if unset. The `http://localhost:8100` fallback applies ONLY in `next dev`. Build-time inlined; redeploy the frontend after changing it. No trailing slash (the hook appends `/stargate/stream`). |

The Winston event backbone uses a separate `EVENTS_*` contract (see the Phase
3B lane's `infra/confluent/README.md`) — same cluster, different consumers, do
not merge the two.

Last updated: 2026-07-02 (converted to names-only; see Story #758)
