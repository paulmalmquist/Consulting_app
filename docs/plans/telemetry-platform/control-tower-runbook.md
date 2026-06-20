# Test Telemetry Go/No-Go Control Tower — operator runbook

A governed flow that composes existing infrastructure:

```
telemetry window → score_window() verdict (GO / REVIEW / NO_GO / NOT_AVAILABLE)
  GO            → auto_pass (no gate)
  NOT_AVAILABLE → failed, fail-closed with the null_reason
  REVIEW/NO_GO  → sensitivity-routed triage (ai_dispatch, scoped registry)
                  → ENFORCED human gate: Approve / Reject / Request-more-evidence
                  → Approve|Reject signs an Ed25519 hash-chained receipt → Verify
```

- **Screen:** `/lab/env/<envId>/telemetry/control-tower` (nav group "AI & Governance").
- **Backend:** `backend/app/routes/telemetry_control_tower.py` → `backend/app/services/control_tower/`.
- **Tables:** `tel_ct_decision`, `tel_ct_receipt`, `tel_ct_gemma_state`, `tel_ct_gemma_job` (migration `repo-b/db/schema/10022_control_tower.sql`; RLS + `env_id` enforced).

## Sensitivity routing posture (ITAR-aware, NOT a compliance claim)
A scoped provider registry (`control_tower/routing.py`) inverts the production posture: the self-hosted,
in-boundary **Gemma-on-Vertex** tier may handle SENSITIVE data; external **OpenAI/Claude** are capped at
INTERNAL. So a sensitive / ITAR-demo-tagged triage routes **only** to Gemma, or fails closed
(`UNAVAILABLE / provider_not_configured`) — it never leaks to an external API. Non-sensitive triage
routes to the frontier tier. This does **not** assert ITAR compliance; that requires a separately
verified GCP workload boundary, region, access controls, data residency, support posture, and Assured
Workloads configuration. The production `ai_dispatch.provider_registry` is untouched.

## Signed receipts
Ed25519-signed, SHA-256 hash-chained per env (`chain_seq` + `prev_receipt_hash`), signed **server-side**
outside the agent's trust boundary. The writer holds a per-env `pg_advisory_xact_lock`, and
`UNIQUE(env_id, chain_seq)` is the hard fork backstop. Verify via the "Verify receipt" button or
`GET /api/telemetry/control-tower/receipts/{id}/verify`. The pinned public key is at
`GET /api/telemetry/control-tower/public-key`. Set `CONTROL_TOWER_SIGNING_KEY` (64 hex chars) in
production; absent, a deterministic **dev** key is used (verifiable, not secret) with a warning.
Honest limitation: tamper-evident, not suppression-proof (an append-only/witnessed log is the next step).

## Gemma private tier — lifecycle (cost-safe by design)
Cold by default (an idle L4 bills ~$1/hr). Warm before a demo; tear down after. Warm/teardown are
**async** (return a `job_id`; the UI polls) and require **all** of: operator role,
`CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED=true`, the confirmation token, and an audit receipt; production
is blocked unless `CONTROL_TOWER_GEMMA_LIFECYCLE_ALLOW_PROD=true` (when `CONTROL_TOWER_IS_PROD=true`).

### How teardown works (and what it costs)
- **Teardown = `endpoint.undeploy_all()` only** — it removes the GPU-backed deployed model. The Control
  Tower **keeps the endpoint + model resources + `GEMMA_VERTEX_*` config**, so the endpoint id and
  dedicated DNS stay stable for a fast re-warm. (To also delete the endpoint, use
  `scripts/gemma_vertex_stage/teardown.py`.)
- **What stops:** the L4 serving-node billing (~$1/hr) — the only material cost.
- **What remains:** the Endpoint (no compute → no charge), the Model (negligible storage), and config.
  The tier shows `cold`.
- **Re-warm:** redeploy the model to the existing endpoint (~6–20 min, GPU provisioning + vLLM load).
- **Source of truth for billing:** Vertex `endpoint.deployedModels`. The DB row is only a cache;
  teardown is `torn_down` only when Vertex reports **zero** deployed models, else
  `teardown_verification=failed`.

### Before a live demo
1. Probe the Gemma tier (UI "Probe" or `POST /gemma-tier/probe`).
2. If cold and you want live sensitive triage, warm ~20–30 min ahead (UI "Warm", confirm token
   `WARM-GEMMA`) — requires `CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED=true`.
3. Confirm a `sensitive`/ITAR-tagged run routes to `gemma_gcp`; a non-sensitive run routes to the
   frontier tier.
4. Confirm the operator can see the Teardown control and the emergency script runs.

### After a live demo
1. Teardown (UI "Teardown", confirm token `TEARDOWN-GEMMA`).
2. Verify Vertex `deployedModels` is empty (UI "Verify" / re-probe); confirm `est_active_cost_usd = 0`.
3. Save the teardown receipt id; screenshot the tier status = `torn_down`.

### Emergency teardown (works even if the app is down)
```bash
GOOGLE_APPLICATION_CREDENTIALS=~/.gcp-stage-sa.json \
  python -m scripts.control_tower.gemma_emergency_teardown
# undeploys all models from the configured endpoint, prints deployedModels before/after
```

## Environment variables
| Var | Purpose | Default |
|---|---|---|
| `CONTROL_TOWER_SIGNING_KEY` | Ed25519 seed (64 hex) for receipt signing | dev key (warned) |
| `CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED` | allow warm/teardown execution | `false` |
| `CONTROL_TOWER_GEMMA_LIFECYCLE_ALLOW_PROD` | allow lifecycle when `CONTROL_TOWER_IS_PROD=true` | `false` |
| `CONTROL_TOWER_IS_PROD` | mark this deployment as production | `false` |
| `GEMMA_VERTEX_PROJECT_ID` / `_LOCATION` / `_ENDPOINT_ID` / `_DEDICATED_DNS` | Vertex endpoint contract (shared with `ai_dispatch`) | — |

## Screenshot evidence (2026-06-19)
- **Path:** `docs/plans/telemetry-platform/screenshots/control-tower.png`
- **Rendered:** yes — full dark console, "Control Tower" active in the nav, heading + ITAR-aware-posture
  blurb + "STAGED REAL BACKEND" truth label, and all five panels (Verdict "No decisions yet", Routing
  "No routing yet", Gemma Private Tier showing real cold/`unavailable` fields — `gemma-3-1b-it`,
  `us-central1`, 0 deployed, $0 — Approval gate "No open gates", Signed receipt "No receipt selected").
- **Backend wiring:** real. Captured against `next dev` (port 3100) → `/api/telemetry/control-tower/*`
  proxy → local backend (port 8001) → the linked Supabase with migration 10022 applied. The
  control-tower endpoints returned **200** (`gemma-tier`, `decisions`); **Gemma was not warmed**.
- **How it was captured:** Playwright (chromium) logged in via `POST /api/auth/telemetry-login`
  (local dev reviewer creds in `.env.local`: `TELEMETRY_REVIEWER_USERNAME=telemetry` /
  `TELEMETRY_REVIEWER_PASSWORD=localdemo` / `TELEMETRY_REVIEWER_ENV_ID=telemetry-demo`,
  `BM_SESSION_SECRET` dev value, `BOS_API_ORIGIN=http://127.0.0.1:8001`), then navigated to
  `/lab/env/telemetry-demo/telemetry/control-tower` and screenshotted full-page.
- **Visual limitation:** an unrelated app-shell call `GET /api/auth/me` returns 500 under the scoped
  local reviewer session (it has no full backend user record) — it does **not** affect the Control Tower
  panels, which render from their own 200 responses. Full green-path (a real verdict, a populated gate +
  signed receipt) still needs a promoted anomaly champion + a real `run_key` in `tel_test_runs` for the
  env.

## Known limitations
- Triage executes a provider call only when `execute_triage=true` on score-and-gate; the default is
  routing-only (shows the decision + rejected map, no cost, no live key needed).
- Full green-path (score-and-gate producing a real verdict) needs a promoted anomaly champion and a
  `run_key` present in `tel_test_runs` for the env; otherwise the verdict is `NOT_AVAILABLE` (honest).
- Idle auto-teardown sweep is documented but deferred (manual teardown + emergency script cover safety
  while the tier is cold by default).
