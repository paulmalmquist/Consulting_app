# Release readiness — Healthcare Subscription Analytics

## HHA-1 (Exec Overview)

| Gate | Status | Date | Verification |
|---|---|---|---|
| Schema integrity (`db:verify`) | PASS | 2026-06-08 | `node db/schema/verify.js` → exit 0 |
| Backend tests | PASS | 2026-06-08 | `pytest --noconftest backend/tests/test_hha.py` → 6 passed |
| Frontend typecheck | PASS | 2026-06-08 | `npm run typecheck` → exit 0 |
| Migration applied to Supabase | PASS | 2026-06-08 | `supabase db query --linked` — 5 `hha_*` tables, `rowsecurity=true`, template row present |
| v2 env provisioned | PASS | 2026-06-08 | v2 pipeline dry_run→apply: validate/create_rows/run_seed_pack/health_check all ok; lifecycle=`verified`; env_id `ceeb9ea0-9f8b-4369-b853-adcd60c01def` |
| API path (live DB) | PASS | 2026-06-08 | `hha.get_health`/`get_overview` → ok, 18 KPIs, money cast, 1 suppressed cohort |
| Contract verifier (`/verify`) | N/A | 2026-06-08 | Blocked: `app.environment_contract` (migration 10004) absent in this DB — pre-existing gap, not hha. Pipeline `health_check` passed instead. |
| Live route smoke (browser) | pending | — | Needs frontend deployed or `npm run dev`; open `/lab/env/ceeb9ea0-9f8b-4369-b853-adcd60c01def/healthcare-subscription` |
| Deploy | not done (by design) | — | No Vercel/Railway deploy in HHA-1; report auto-deploy-on-merge before any merge |

## Fail-closed rule

If `POST /v2/environments` dry_run/apply or `verify` does not return all-stages-ok, **stop**:
record the failure in `repo-b/src/app/lab/env/[envId]/healthcare-subscription/PROOF.md` and do
not claim the environment is live or the UI works against it.

## Notes
- Provisioning requires a backend running the `hha_starter` code (local backend against the
  prod DB, or a deploy). The migration + template row are prod-DB writes; the user approved
  the v2-provisioning path.
