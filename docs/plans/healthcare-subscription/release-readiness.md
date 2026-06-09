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
| Merged to `main` | PASS | 2026-06-08 | PR #130 merged — commit `21f55939` |
| Frontend deployed (Vercel) | PASS | 2026-06-08 | `consulting-app` auto-deploy; deployment `consulting-bfan2f6fa` Ready; **novendor.ai** alias → it |
| Backend deployed (Railway) | PASS | 2026-06-08 | Deployed from clean worktree; live `GET /version` = `21f55939` |
| Live API smoke (`/api/hha/v1/*`) | PASS | 2026-06-09 | `health` → ok (counts 1/4/24/79/4, `phi:false`); `overview` → 18 KPIs, as_of 2026-05-31, money cast |
| Routes shipped (prod) | PASS | 2026-06-09 | `/login` 200; hha + telemetry lab routes 307 (auth gate, not 404) |
| Telemetry regression | PASS | 2026-06-09 | `/api/telemetry/health` 200; `/api/telemetry/replay` `first_model_fire_t = 728` (unchanged) |
| Visual defects found (logged-in browser) | FIXED | 2026-06-09 | First logged-in capture found two defects: page wrapped in `LabEnvironmentShell` (not standalone) + KPI fetch 404 (empty `NEXT_PUBLIC_API_BASE` → same-origin). Fixed in PR #134 (`isDomainRoute` allowlist + `/bos` proxy). |
| Live route smoke (logged-in browser) | PASS | 2026-06-09 | Playwright login as `info@novendor.ai`; standalone (no `LabEnvironmentShell` chrome — matches telemetry; only the shared `LabEnvTopBar` remains); NO-PHI banner; **18 KPI cards with values** (Active Members 4,250 · MRR $502K · NRR 111.2% · LTV:CAC 8.5× · payback 8.6mo · SLAs); metric-definition drawer (formula/grain/owner/source); provenance footer. Screenshots in `screenshots/`. |

## Fail-closed rule

If `POST /v2/environments` dry_run/apply or `verify` does not return all-stages-ok, **stop**:
record the failure in `repo-b/src/app/lab/env/[envId]/healthcare-subscription/PROOF.md` and do
not claim the environment is live or the UI works against it.

## Notes
- Provisioning requires a backend running the `hha_starter` code (local backend against the
  prod DB, or a deploy). The migration + template row are prod-DB writes; the user approved
  the v2-provisioning path.
- **2026-06-08/09 — production is live and aligned**: prod DB + prod env
  (`ceeb9ea0-9f8b-4369-b853-adcd60c01def`) + `main` (`21f55939`) + deployed frontend (novendor.ai)
  + deployed backend (`/version 21f55939`). Only the logged-in-browser visual screenshot remains
  to fully close this receipt — see `agent-validate-prompt.md`.
