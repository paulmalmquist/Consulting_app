# Next Session — Telemetry Platform (Phase 3)

**Last updated:** 2026-06-01 (Phase 2 complete)

Phases 1–2 done: real NASA Bronze/Silver/Gold in `novendor_1.telemetry`, 4 models trained in
Databricks, 2 champions in the UC Model Registry, deterministic replay feed scored. Phase 3 adds the
Supabase `tel_*` schema and the FastAPI serving layer.

## Copy-paste prompt for the next Claude Code session

```
You are starting Phase 3 of the Telemetry Platform build (dispatch 0003): the Supabase tel_* schema
migration + the FastAPI serving layer in backend/. Do NOT start the dashboard (Phase 4) or deploy
(Phase 5).

Read first:
- docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md
- docs/plans/telemetry-platform/architecture.md   (tel_* table list + Phase 2 outcome / serving note)
- docs/plans/telemetry-platform/roadmap.md          (Phase 3 tickets)
- docs/plans/telemetry-platform/eval-plan.md        (negative tests / null_reasons)
- ARCHITECTURE.md                                   (RLS template, env_id/business_id, migration naming)
- telemetry-platform/PROOF.md                       (champion run IDs + replay feed)

Champions registered (Unity Catalog Model Registry):
- novendor_1.telemetry.tel_anomaly_detector@champion  (rule-based MAD: per-channel scale + k=4 on
  abs(value - value_rmean50). Cheap to re-implement in the serving layer — no pyspark needed.)
- novendor_1.telemetry.tel_rul_regressor@champion     (sklearn GBM)

Phase 3 tickets (from roadmap.md):
1. Migration repo-b/db/schema/NNN_telemetry_*.sql — resolve NNN live against
   supabase_migrations.schema_migrations (project ozboonlsplroialdwuxj); do NOT hardcode. Tables:
   tel_test_runs, tel_telemetry_channels, tel_predictions, tel_anomaly_events, tel_model_runs,
   tel_drift_metrics. Each: env_id TEXT NOT NULL + business_id UUID NOT NULL + ENABLE RLS +
   tenant_isolation policy USING (env_id = current_setting('app.env_id', true)) + WITH CHECK +
   COMMENT ON TABLE. Match the prevailing repo RLS form (look at a recent migration first).
2. Seed tel_model_runs from the registered champions (run IDs, metrics, gate decisions from PROOF.md).
3. Schema backend/app/schemas/telemetry.py (Pydantic request/response shapes).
4. Services backend/app/services/telemetry_{scoring,runs,monitoring}.py. Set app.env_id before tenant
   queries. Scoring re-implements the MAD champion (or loads the registered model). Write one
   tel_predictions row per /score.
5. Routes backend/app/routes/telemetry.py: GET /health, POST /score (anomaly score + per-channel
   attribution + go/no-go + model version/run_id + Supabase receipt), GET /runs, GET /run/{id},
   GET /monitoring (PSI + rolling anomaly rate + counts + drift). Register the router.
6. Fail-closed: no promoted model -> model_not_promoted; channel without scores -> channel_not_scored.
7. Tests backend/tests/test_telemetry_*.py: /score persists a row + returns all fields; /monitoring
   returns PSI; fail-closed null_reasons return correct codes.

Credentials: pull backend secrets via `vercel env pull backend/.env --environment production --yes`
(repo-b project) per CLAUDE.md — do not ask the user for DATABASE_URL / SUPABASE keys. Supabase work
via the Supabase CLI (project ozboonlsplroialdwuxj).

Proof to append to telemetry-platform/PROOF.md (Phase 3): migration applied + RLS verified
(cross-tenant read blocked), curl /health, curl /score (full response), tel_predictions row count
before/after, curl /monitoring, test output.

Honesty + secret rules unchanged. PHASE GATE: stop after Phase 3, append PROOF, update dispatch 0003 +
env docs, lessons to docs/tips.md. Do NOT start Phase 4 without approval.
```
