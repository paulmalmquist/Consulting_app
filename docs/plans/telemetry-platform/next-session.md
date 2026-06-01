# Next Session — Telemetry Platform (Phase 4)

**Last updated:** 2026-06-01 (Phase 3 complete)

Phases 1–3 done: real NASA medallion data in Databricks; 4 models + 2 registered champions behind
gates; Supabase `tel_*` schema + live FastAPI serving (`/api/telemetry/*`) with persisted receipts.
Phase 4 builds the dashboard as a real Winston lab environment and wires the deterministic replay.

## Copy-paste prompt for the next Claude Code session

```
You are starting Phase 4 of the Telemetry Platform build (dispatch 0003): the Next.js dashboard as a
Winston lab environment, provisioned via the v2 pipeline, reading the live /api/telemetry/* endpoints
and the deterministic replay feed. Do NOT start deployment (Phase 5).

Read first:
- docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md
- docs/plans/telemetry-platform/architecture.md          (Phase 3 outcome: endpoints + serving)
- docs/plans/telemetry-platform/roadmap.md                (Phase 4 tickets)
- telemetry-platform/docs/frontend-wireframe.md           (screen-by-screen spec + API binding table)
- telemetry-platform/DEMO.md                              (4-min journey + replay storyboard, D-4)
- repo-b/src/components/lab/environments/constants.ts     (industry registration + route resolver)
- repo-b/src/app/lab/env/[envId]/supply-chain/            (closest multi-page lab-env precedent)
- repo-b/src/lib/api.ts                                   (apiFetch, same-origin /v1 proxy)
- skills/winston-create-environment/SKILL.md              (v2 provisioning POST /v2/environments)

Live serving contract (Phase 3, prefix /api/telemetry):
  GET /health  POST /score  GET /runs  GET /run/{id}  GET /monitoring
  (run the backend locally: cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8077)
Demo tenant fixture: env_id 'telemetry-demo', business_id 7e1eb000-0000-4000-a000-000000000001,
run smap_msl:D-4:test. Champions in tel_model_runs.

Decision to make + record (explicit): reviewer access model — public read-only demo vs invite-code
vs authenticated lab tenant. Default template auth_mode is private; widening it is a recorded choice.

Phase 4 tickets (from roadmap.md):
1. Template: add a 'telemetry' template to repo-b/db/schema/516_environment_templates_seed.sql (or
   reuse empty_lab + custom seed): default_home_route '/lab/env/{env_id}/telemetry', industry_type
   'telemetry', dark theme tokens.
2. Seed pack backend/app/services/environment_seed_packs_v2/telemetry_starter.py + register in
   __init__.py SEED_PACKS (mirror supply_chain_starter). Seed minimal tel_test_runs/tel_telemetry_channels.
3. Industry registration in constants.ts: add 'telemetry' to industries, INDUSTRY_DISPLAY_MAP,
   isTelemetryEnvironment(), resolveEnvironmentOpenPath() -> /lab/env/{envId}/telemetry.
4. Pages repo-b/src/app/lab/env/[envId]/telemetry/ (root + runs/, replay/, model-performance/,
   monitoring/, optional copilot/); components repo-b/src/components/telemetry/. Data via apiFetch
   against /api/telemetry/*. No hardcoded metrics in the frontend.
5. Deterministic replay: read precomputed champion outputs (gold_replay_feed_scored). Either add a
   backend proxy endpoint that serves the scored feed, or seed a tel_* copy. Pre-warm; fire-tick
   flips Go/No-Go (D-4 model_pred fires at t=728, covers all 3,248 labeled ticks); never stalls.
6. Provision the tenant: POST /v2/environments {client_name, template_key:'telemetry', slug,
   env_kind:'demo', seed_pack:'telemetry_starter', dry_run:false}; ensure app.environments and
   v1.environments env_id match; run GET /v2/environments/{env_id}/verify.

Design: dark console only; <=7 nav; active = fill+weight; go/no-go reads as a redline indicator.
Use the --bm-* tokens in repo-b/src/app/globals.css.

Proof to append to telemetry-platform/PROOF.md (Phase 4): env_id, verify-gate result, screenshots per
panel, the replay sequence (green->red + attribution), evidence values come from the API (network tab).

PHASE GATE: stop after Phase 4, append PROOF, update dispatch 0003 + env docs, lessons to docs/tips.md.
Do NOT start Phase 5 without approval.
```
