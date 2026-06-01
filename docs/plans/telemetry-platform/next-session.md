# Next Session — Telemetry Platform (Phase 5)

**Last updated:** 2026-06-01 (Phase 4 complete)

Phases 1–4 done: medallion data in Databricks; models + champions behind gates; Supabase serving;
dashboard as a Winston lab env (`dc82d39d-9be2-49b0-a01d-c7181b13a8b6`) with the deterministic
GO→NO-GO replay. Phase 5 deploys the API and frontend and runs smoke tests against live URLs.

## Copy-paste prompt for the next Claude Code session

```
You are starting Phase 5 of the Telemetry Platform build (dispatch 0003): deploy. Do not change
models, schema, or the dashboard except for deploy-config fixes.

Read first:
- docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md
- docs/plans/telemetry-platform/architecture.md   (Phase 4 outcome; routes; the env_id)
- docs/plans/telemetry-platform/roadmap.md          (Phase 5 tickets)
- telemetry-platform/PROOF.md
- CLAUDE.md "Infrastructure CLI Guardrails" (Railway/Vercel CLI usage) + the repo-b-no-auto-deploy memory.

Phase 5 tickets:
1. API → Railway. Deploy backend/ (telemetry routes are already registered in main.py). Keep deps
   lean — do NOT add databricks/mlflow/pyspark; the anomaly champion serves as a rule and the replay
   reads the committed fixture backend/app/data/telemetry/replay_fixture.json. Set secrets
   (DATABASE_URL, SUPABASE_*) via Railway store. Run from backend/ (railway up --service <name>);
   verify the live SHA per the backend deploy workflow.
2. Frontend → Vercel. repo-b does NOT auto-deploy — run `cd repo-b && vercel deploy --prod`. Set
   BOS_API_ORIGIN (the telemetry proxy upstream) to the Railway API origin via Vercel env if not
   already inferred from the host.
3. Smoke tests vs deployed URLs: curl the deployed /api/telemetry/{health,score,monitoring}; load the
   live env at /lab/env/dc82d39d-9be2-49b0-a01d-c7181b13a8b6/telemetry; run the replay.
4. Finalize telemetry-platform/README.md / PROOF.md / DEMO.md with the real URLs + smoke transcript.

Watch:
- If Railway can't host a dep, fall back to serving registered-model metadata / the fixture and
  document the fallback honestly (do not fake inference).
- The v2 verify gate 500s here because app.environment_contract is missing platform-wide (backlog) —
  not a telemetry deploy blocker.

Proof to append to telemetry-platform/PROOF.md (Phase 5): Railway URL + live /score against it,
Vercel prod URL + live env loads, smoke transcript. Final results table.

PHASE GATE: this is the last phase. After it, the platform is the full loop end to end on live URLs.
Update dispatch 0003 + env docs; lessons to docs/tips.md.
```
