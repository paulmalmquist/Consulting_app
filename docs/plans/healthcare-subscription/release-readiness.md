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

## HHA-2 (Funnel, Cohorts, Operations)

**Release state:** SHIPPED + DEPLOYED + PRODUCTION-RECEIPT-TESTED (2026-06-09). PR #136 merged →
`main` `caa57840`; frontend `consulting-5hr2amjbh` (novendor.ai alias); backend `/version caa57840`.

| Gate | Status | Date | Verification |
|---|---|---|---|
| Backend contract tests | PASS | 2026-06-09 | `python -m pytest --noconftest tests/test_hha.py -q` → 9 passed |
| Frontend typecheck | PASS | 2026-06-09 | `npm run typecheck` → exit 0 |
| Schema integrity | PASS | 2026-06-09 | `node db/schema/verify.js` with the existing DB configuration → 207 passed, 0 failed |
| Production-data service reads | PASS | 2026-06-09 | Existing env returned 6 ordered funnel stages, 3 channels, 78 visible cohort cells + 1 masked pilot marker, and 4 fixed-order operations domains |
| Suppression non-disclosure | PASS | 2026-06-09 | Masked JSON contains no cohort size, retained count, retention rate, revenue, or LTV; suppressed SQL selects only cohort month and channel |
| Same-origin `/bos` proxy | PASS | 2026-06-09 | Local Next.js `/bos/api/hha/v1/cohorts` returned 200 and the masked payload |
| Authenticated local browser | PASS | 2026-06-09 | Playwright with a signed local session for an active membership checked all four routes; drawers, banner, footer, standalone chrome, network, and console passed |
| Screenshots | PASS | 2026-06-09 | `screenshots/hha2-overview.png`, `hha2-funnel.png`, `hha2-cohorts.png`, `hha2-operations.png` |
| Channel LTV:CAC | OPEN | 2026-06-09 | Channel-specific LTV is not seeded; API returns an empty collection with the explicit grain-gap reason (Phase 3 events can supply it) |
| Merged to `main` | PASS | 2026-06-09 | [PR #136](https://github.com/paulmalmquist/Consulting_app/pull/136) merged → `caa57840`; CI reds are the documented pre-existing baseline (auth/OIDC/telemetry/SSE unit tests + 2 ruff F401s) — none in the HHA-2 diff |
| Frontend deployed (Vercel) | PASS | 2026-06-09 | `consulting-app` auto-deploy `consulting-5hr2amjbh` Ready; **novendor.ai** alias → it |
| Backend deployed (Railway) | PASS | 2026-06-09 | Deployed from clean worktree at `caa57840`; live `GET /version` = `caa57840` |
| Live API smoke (all 5) | PASS | 2026-06-09 | `/api/hha/v1/{health,overview,funnel,cohorts,operations}` → 200; overview 18 KPIs; funnel blended+channels; operations 4 domains; cohorts 1 masked pilot |
| Live suppression non-disclosure | PASS | 2026-06-09 | Prod `/cohorts` masked row = `{month, channel, masked:true, reason}` only — no cohort_size/retained_count/retention_pct/revenue/ltv. UI shows "< 11 members - suppressed", no numbers |
| Production logged-in receipt | PASS | 2026-06-09 | Playwright (info@novendor.ai) all four surfaces: standalone (no heavy shell), NO-PHI banner, metric drawer, provenance footer, masked cohort shown without numbers. `screenshots/hha2_*_prod.png` |
| Telemetry regression | PASS | 2026-06-09 | `/api/telemetry/health` 200; replay `first_model_fire_t = 728` |

## Fail-closed rule

If `POST /v2/environments` dry_run/apply or `verify` does not return all-stages-ok, **stop**:
record the failure in `repo-b/src/app/lab/env/[envId]/healthcare-subscription/PROOF.md` and do
not claim the environment is live or the UI works against it.

## Notes
- Provisioning requires a backend running the `hha_starter` code (local backend against the
  prod DB, or a deploy). The migration + template row are prod-DB writes; the user approved
  the v2-provisioning path.
- **2026-06-09 — HHA-1 + HHA-2 production is live and aligned**: prod DB + prod env
  (`ceeb9ea0-9f8b-4369-b853-adcd60c01def`) + `main` (`caa57840`) + deployed frontend
  (`consulting-5hr2amjbh`, novendor.ai) + deployed backend (`/version caa57840`). All four surfaces
  (Overview/Funnel/Cohorts/Operations) have a logged-in production receipt + screenshots
  (`screenshots/hha2_*_prod.png`). Cohort small-cell suppression verified non-disclosing in prod.
