# Automated Testing and Deploy-and-Wait Release Strategy for the Consulting_app Repository

## Executive summary

This repository already contains most of the “building blocks” needed for a true deploy-and-wait workflow: a monorepo split between a Python FastAPI backend and a Next.js frontend, a canonical SQL “schema bundle” with both apply + verify scripts, a CI pipeline that runs backend lint/tests and frontend lint/typecheck/unit tests, and a robust production-grade Playwright suite that validates the live site end-to-end (including backend health, proxy health, API contracts, and rendered UI truth). fileciteturn47file0L1-L1 fileciteturn48file0L1-L1 fileciteturn51file0L1-L1 fileciteturn52file0L1-L1 fileciteturn55file0L1-L1

What’s missing is **a single, prioritized, automated release pipeline** that (a) forces database + seed correctness *before* deploy, (b) validates that frontend and backend are deployed from compatible commits, (c) runs deterministic post-deploy checks (staging/preview first, then production), and (d) rolls back automatically (or “re-deploy last known good”) with clear notifications when validation fails.

A concrete “deploy-and-wait” target state for this app:

- **PR gate**: DB schema/seed + backend integration + UI E2E runs in CI against an ephemeral Postgres. Only green PRs merge.
- **Main deploy gate**: after merging, deploy backend (Railway) + frontend (Vercel) from the same SHA, then automatically run a smoke subset of the existing production Playwright suite (preferably against a staging/preview URL first). If smoke fails: rollback Vercel instantly and re-deploy the last-known-good backend build (or trigger a fast rollback procedure).
- **Continuous validation**: scheduled synthetic checks run regardless of deploys, so “silent breakage” is caught quickly.
- **Operational playbook**: when validation fails, the system performs an automatic first response (rollback + alert) and leaves behind artifacts (logs + Playwright traces) that make remediation fast. citeturn0search0turn0search3turn0search5 citeturn0search2turn2search4

## Repo architecture and current automation

The repo is a monorepo with two primary services and a shared database schema toolchain.

**Backend service (`backend/`)**
- Framework: **FastAPI** backend (“Business OS Backend”). fileciteturn47file0L1-L1
- Configuration: expects production-like env vars, notably `DATABASE_URL` (Supabase Postgres connection string), and Supabase Storage credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.). fileciteturn47file0L1-L1
- DB migration workflow: backend documentation explicitly calls “apply the canonical schema bundle from `repo-b/db/schema`” using `make db:migrate` and `make db:verify`. fileciteturn47file0L1-L1
- Health: `GET /health`. fileciteturn47file0L1-L1
- Deploy target: Railway is configured with a Dockerfile build and an HTTP healthcheck on `/health`. fileciteturn56file0L1-L1

**Frontend service (`repo-b/`)**
- Framework: **Next.js**, with scripts for lint/typecheck/unit, Playwright E2E, and an explicit production test target. fileciteturn50file0L1-L1
- Test tooling: unit tests via **Vitest**, E2E via **Playwright**, and “production E2E tests” driven by `tests/production/re-production.spec.ts`. fileciteturn50file0L1-L1 fileciteturn55file0L1-L1
- The production Playwright suite is unusually strong: it checks backend health, proxy health, API contracts, and UI rendering using stable `data-testid` selectors, and it explicitly enforces “no workspace-error component” and “no unhandled JS crashes”. fileciteturn55file0L1-L1

**Database layer**
- The repo treats **SQL as the source of truth** via `repo-b/db/schema/*.sql`, applied in numeric filename order.
- `apply.js`:
  - concatenates all schema SQL files,
  - splits SQL into statements safely,
  - applies them, defaulting to a single transaction, and exits non-zero on the first failed statement. fileciteturn51file0L1-L1
- `verify.js`:
  - verifies table existence, tenant_id columns, RLS enabled, traceability columns, key views/functions, and minimum seed row counts for key tables. fileciteturn52file0L1-L1
- Both scripts connect using `DATABASE_URL` or `SUPABASE_DB_URL`. fileciteturn51file0L1-L1 fileciteturn52file0L1-L1

**Current CI (GitHub Actions)**
- `.github/workflows/ci.yml` runs on PRs and on pushes to main/master, with concurrency cancellation enabled (`group: ci-${{ github.ref }}` and `cancel-in-progress: true`). fileciteturn48file0L1-L1 citeturn1search4
- Backend job: installs deps, runs Ruff lint and pytest. fileciteturn48file0L1-L1
- Frontend job: installs deps, runs lint, typecheck, and unit tests. fileciteturn48file0L1-L1
- A Playwright “Winston first-mile” gate runs a focused browser test (`global-commandbar.spec.ts`). fileciteturn48file0L1-L1

**A key current gap**
Backend unit tests are designed to run without Postgres by mocking the DB layer (`FakeCursor` patched everywhere). This is excellent for speed, but it means CI can go green while database + migrations are broken. fileciteturn53file0L1-L1

The repo *does* have a live, real-SQL integration test module (`backend/tests/test_re_live.py`) that mirrors the frontend journey and validates seeded data, but it is skipped unless a real `DATABASE_URL` is provided. fileciteturn54file0L1-L1

## Failure modes to design against

A deploy-and-wait workflow fails when failures become **late** (post-deploy) or **silent** (not detected automatically). The most likely, highest-impact failure modes in this repo’s architecture are:

**Database schema drift and missing migrations**
- “Works locally / fails in prod” if prod DB is missing new tables/views/functions or RLS policy changes.
- Risk is amplified because migrations are applied from a “bundle” rather than a tracked migration history table; a non-idempotent statement can break re-apply.
- Verification needs to be a hard gate, not a manual step. fileciteturn51file0L1-L1 fileciteturn52file0L1-L1

**DB sync/seed not reflected in the UI**
- The production UI depends on seeded fixture data (e.g., environment, fund, quarter) and the tests explicitly assume these fixtures exist. fileciteturn55file0L1-L1
- Common failure pattern: schema deploy succeeds, but seed data didn’t run or changed shape; UI loads but shows empty state / errors; or charts show blank.
- This is precisely what the live SQL smoke tests in `test_re_live.py` are designed to catch—if they are run. fileciteturn54file0L1-L1

**Frontend/backend incompatibility and deploy ordering**
- Backend docs explicitly require deploying compatible commits and applying DB schema after deploy. fileciteturn47file0L1-L1
- If Vercel deploys a new frontend that expects endpoints/tables not yet present (or vice versa), you’ll see proxy errors (502), schema-not-migrated domain errors, or UI runtime errors; the production Playwright suite even includes checks to ensure certain POST endpoints return JSON (not HTML proxy error pages). fileciteturn55file0L1-L1

**Environment/config drift**
- Different environments (local/CI/prod) can diverge in required variables. Backend tests set a stub `DATABASE_URL` and other stubs to avoid early exits, which can hide missing-config problems until runtime. fileciteturn53file0L1-L1
- Vercel preview vs production environment variable scoping frequently causes “works on main, breaks on preview” or vice versa. citeturn2search5turn2search1

**Secrets and permissions**
- Missing / rotated DB credentials or Supabase service keys cause runtime failures (document upload, signed URLs, etc.). fileciteturn47file0L1-L1
- Deploy automation that relies on CLI/API tokens needs correct scoping and secure storage (GitHub environments + environment secrets). citeturn1search0

**CI timing/order and concurrency issues**
- The repo uses workflow/job concurrency cancellation. That’s good for PR “only latest commit matters,” but deployments require *stronger* serialization: you must ensure only one production deploy validation is live at a time to avoid “deploy A validates deploy B.” fileciteturn48file0L1-L1 citeturn1search4

**Build caching mismatch**
- Node and Python caches can speed CI but can also hide dependency drift if lockfiles aren’t honored. The workflow uses `npm ci` and pip cache keyed to requirements, which is correct; still, E2E tests must run against built artifacts that match the dependency graph. fileciteturn48file0L1-L1

## Proposed automated testing strategy

This strategy is deliberately **prioritized**: it starts by turning the repo’s existing “hidden superpowers” (SQL verify, live SQL smoke, production Playwright) into **hard pipeline gates**, and then adds a small number of high-leverage tests that close the remaining blind spots.

### Priority order

**Priority zero: make DB correctness a merge gate**
1) Run schema apply + verify in CI against an ephemeral Postgres.
2) Run a real-SQL backend integration subset (reusing `test_re_live.py` patterns) against that same DB.
3) Run frontend E2E against local services using seeded fixture IDs.

This converts the main risk (deploying code that assumes DB state that is not real) into an early failure.

### Specific tests to add, with test targets, data, and pass/fail criteria

Below, “targets” are concrete files/modules or endpoints in this repo, and “data” is pinned to deterministic fixtures already referenced in repo tests.

**Database migration idempotency test**
- **Target**: `repo-b/db/schema/apply.js` + all `repo-b/db/schema/*.sql`. fileciteturn51file0L1-L1
- **Data**: an empty ephemeral Postgres.
- **Procedure**:
  - run apply once (should succeed),
  - run apply *again* (must also succeed).
- **Pass criteria**: second apply returns exit code 0; no statements fail.
- **Why it matters**: bundling the full schema implies repeatability; idempotency is the fail-fast signal that a new SQL file introduced a “CREATE TABLE without IF NOT EXISTS” or similar.

**Database verification gate**
- **Target**: `repo-b/db/schema/verify.js`. fileciteturn52file0L1-L1
- **Data**: the same ephemeral DB after apply.
- **Pass criteria**: verification script exits 0 and the checks for RLS, traceability columns, required functions/views, and baseline seed counts pass. fileciteturn52file0L1-L1

**Backend real-SQL integration smoke suite in CI**
- **Target**: add a new integration marker, or re-run the existing live tests `backend/tests/test_re_live.py` against the ephemeral DB. fileciteturn54file0L1-L1
- **Data**: seeded fixture data that includes “Institutional Growth Fund VII” and related REPE fixtures (already asserted by tests). fileciteturn54file0L1-L1
- **Pass criteria** (examples taken from the existing suite):
  - `/health` returns 200 and JSON status in (“ok”, “healthy”, “up”).
  - `/api/repe/context` returns ≥ 1 fund.
  - fund list contains “Institutional Growth Fund VII”.
  - “Cascade Multifamily” asset has correct identity fields (city/state/property_type) if present.
  - quarter metrics return values in plausible financial ranges where asserted. fileciteturn54file0L1-L1
- **Implementation detail**: today these tests are skipped unless a real DB URL is used; CI simply needs to set `DATABASE_URL` to the service Postgres connection string. fileciteturn54file0L1-L1

**Contract tests between frontend proxy and backend**
- **Target**: the proxy surface verified in production tests (e.g., `/bos/health`, `/bos/api/re/v1/context?...`). fileciteturn55file0L1-L1
- **Data**: seeded fixture env/fund IDs (the production tests already use deterministic UUIDs).
- **Pass criteria**:
  - proxy returns 200 and JSON,
  - response includes required keys and correct echoed identifiers (`env_id`, etc.),
  - no HTML error pages for JSON endpoints (proxy error detection). fileciteturn55file0L1-L1

**Frontend E2E “seeded data appears in UI” test (local/CI)**
- **Target**: mirror the production tests’ “rendered truth” checks, but run against locally started Next.js + backend + ephemeral DB.
- **Data**:
  - a known env/fund fixture, preferably the deterministic fixtures already used in production tests, or a CI-only seed fixture that is queried dynamically (first call context endpoint to discover IDs).
- **Pass criteria**:
  - fund list page loads and displays at least one seeded fund name,
  - workspace errors do not render,
  - no unhandled JS errors (Playwright pageerror trap).

**Migration verification in deployment pipeline**
- **Target**: in staging/prod, run `verify.js` (read-only checks) as a post-deploy gate so you detect missing RLS, missing tables, missing functions immediately.
- **Pass criteria**: exit code 0.

**Data-consistency checks (DB ⇄ API ⇄ UI)**
- **Target**: tables and endpoints used by live/prod suites: `repe_fund`, `repe_asset`, and `/bos/api/re/v1/context`, etc. fileciteturn54file0L1-L1 fileciteturn55file0L1-L1
- **Data**: deterministic fixture IDs from production tests. fileciteturn55file0L1-L1
- **Pass criteria** (example):
  - SQL says fund exists → API fund list includes it → UI fund list renders it.

**Property-based tests for core financial invariants**
- **Why included**: Many regressions in finance engines are “edge-case algebra errors.” Property-based testing was popularized by QuickCheck (Claessen & Hughes). citeturn14search3
- **Target**: choose one high-risk math module (e.g., IRR, waterfall, amortization) and enforce invariants such as monotonicity, conservation checks, and bounds.
- **Tooling default**: Python Hypothesis or JS fast-check (no repo constraint stated).
- **Pass criteria**: invariants hold for randomized inputs; failing counterexample is minimized and stored.

### Test types comparison table

| Test type | Purpose | Frequency | Where it runs | Typical runtime target |
|---|---|---|---|---|
| Static checks (lint/typecheck) | Catch style/typing issues early | Every PR + main | Local + CI | < 2 min |
| Unit tests (backend FakeCursor / frontend Vitest) | Fast correctness in isolation | Every PR + main | Local + CI | < 5 min |
| DB schema apply + verify | Ensure schema+RLS+seed baseline is valid | Every PR that touches schema/backend; always on main | CI (ephemeral Postgres); post-deploy (read-only verify) | 2–8 min |
| Backend integration (real SQL) | Confirm API behavior with real DB + seed | Every PR that touches backend/schema; on main | CI (ephemeral Postgres) | 5–15 min |
| Contract tests (proxy + API shape) | Detect breaking API shape changes | Every PR; post-deploy smoke | CI; staging/prod validation | 2–6 min |
| Frontend E2E (seeded UI truth) | Confirm UI renders seeded business truth | Every PR affecting frontend/backend; staging gate | CI; staging | 5–15 min |
| Production smoke (synthetic) | Confirm live system is healthy and coherent | After every prod deploy + scheduled | Prod (Playwright request + light UI) | 2–7 min |
| Production deep suite | Validate key journeys + data correctness | Nightly or on-demand | Prod | 10–25 min |

## CI/CD designs for deploy-and-wait

This section proposes concrete GitHub Actions workflows that integrate **Vercel** and **Railway**, using primary docs for each platform and the repo’s existing scripts.

### Design principles

1) **Single SHA, coordinated deploy**: deploy backend and frontend from the same commit to avoid incompatibility (explicitly called out in backend deploy checklist). fileciteturn47file0L1-L1  
2) **Hard gates before deploy**: database apply + verify + integration tests must pass. fileciteturn51file0L1-L1 fileciteturn52file0L1-L1  
3) **Post-deploy validation is mandatory**: smoke tests run after deploy, and failure triggers rollback/mitigation automatically. fileciteturn55file0L1-L1  
4) **Deployment serialization**: use concurrency controls so only one deploy validation runs at a time. citeturn1search4  
5) **Use environments for secrets and protection rules**: store production tokens in GitHub Environments. citeturn1search0turn1search2  

### Workflow architecture

**Workflow A: tighten PR CI (extend existing `ci.yml`)**
Add jobs (or a separate workflow) that:
- starts a Postgres service,
- runs `make db:migrate` + `make db:verify`,
- runs a selected real-SQL integration suite (`backend/tests/test_re_live.py` and/or a smaller subset),
- runs Playwright E2E against local Next.js + backend (seeded DB).

This closes the current gap where the backend unit suite can pass without any real DB. fileciteturn53file0L1-L1

**Workflow B: deploy-and-validate on main**
Trigger this after CI completes successfully on the default branch using `workflow_run`. citeturn1search1  
Then:
1) deploy backend to Railway,
2) deploy frontend to Vercel,
3) run post-deploy smoke tests (Playwright in request mode + minimal UI),
4) on failure, rollback frontend quickly and re-deploy the last-known-good backend build.

Railway docs explicitly support using the CLI in CI/CD pipelines (`railway up` and CI modes). citeturn0search2turn2search3  
Railway also describes using GitHub Actions triggered by deployment status events for post-deploy actions. citeturn2search4  

Vercel supports:
- managing env vars via CLI (`vercel env`), citeturn2search1
- listing deployments via API (useful for polling deploy state), citeturn2search0
- instant rollback via CLI (`vercel rollback`), citeturn0search0
- and guidance on production rollback procedures and log inspection. citeturn0search3  
Important nuance: Vercel’s instant rollback is fast but can restore a previous build that may have **stale configuration**; environment variables aren’t “rebuilt,” so rollback may not fix incidents caused by env var changes. citeturn0search5

### Mermaid diagrams

```mermaid
flowchart TD
  A[PR opened/updated] --> B[CI: lint + unit]
  B --> C[CI: db:migrate + db:verify on ephemeral Postgres]
  C --> D[CI: backend integration (real SQL)]
  D --> E[CI: frontend E2E (local Next + backend)]
  E -->|green| F[Merge to main]

  F --> G[Deploy workflow on main]
  G --> H[Deploy backend to Railway]
  H --> I[Deploy frontend to Vercel]
  I --> J[Post-deploy smoke tests]
  J -->|pass| K[Deploy complete: wait safely]
  J -->|fail| L[Auto response]
  L --> M[Vercel rollback]
  L --> N[Re-deploy last-known-good backend]
  M --> O[Notify + attach artifacts]
  N --> O
```

```mermaid
flowchart LR
  subgraph CI_Gates[CI gates (must all pass)]
    L1[Backend lint+pytest]
    L2[Frontend lint+typecheck+unit]
    L3[DB apply+verify]
    L4[Backend real-SQL integration]
    L5[Frontend E2E seeded truth]
  end

  CI_Gates --> D1[Deploy to staging/preview]
  D1 --> V1[Staging smoke]
  V1 -->|pass| D2[Deploy/promote production]
  D2 --> P1[Production smoke]
  P1 -->|pass| OK[Done]
  P1 -->|fail| RB[Rollback + alert]
```

### Concrete CI YAML example patterns

**Example: add a DB gate job using GitHub Actions service containers**

```yaml
jobs:
  db-gate:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/test
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: repo-b/package-lock.json

      - name: Install repo-b deps
        working-directory: repo-b
        run: npm ci

      - name: Apply schema bundle
        run: make db:migrate

      - name: Verify schema + seed baseline
        run: make db:verify
```

This directly leverages the repo’s canonical `make db:migrate` and `make db:verify` targets. fileciteturn49file0L1-L1

**Example: run the existing live SQL smoke suite in CI**

```yaml
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: backend/requirements.txt

      - name: Install backend deps
        working-directory: backend
        run: pip install -r requirements.txt

      - name: Run real-SQL integration smoke
        working-directory: backend
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
        run: python -m pytest tests/test_re_live.py -v
```

This reuses the repo’s “mirrors the frontend UX journey” integration suite. fileciteturn54file0L1-L1

### Deploy validation and automated rollback

**Post-deploy health checks**
- Validate backend `/health` (Railway healthcheck path is `/health`). fileciteturn56file0L1-L1
- Validate frontend-to-backend proxy (`/bos/health`) as proven by the production Playwright smoke suite. fileciteturn55file0L1-L1

**Rollback mechanics**
- **Frontend rollback**: `vercel rollback` rolls back production deployments to a previous deployment; status can be checked with `vercel rollback status`. citeturn0search0
- **Operational nuance**: Vercel instant rollback is fast but may restore stale configuration; env var changes may not be reflected. citeturn0search5
- **Backend rollback**: Railway supports rollback actions in its deployment UI, and the CLI supports CI-friendly deploy flows (`railway up`), allowing a “re-deploy from last-known-good SHA” strategy. citeturn0search4turn0search2

A reliable “automated rollback” approach for the backend that avoids depending on undocumented rollback APIs:

1) Maintain a `prod-stable` git tag (or GitHub release) updated automatically after a successful production deploy.
2) On failed post-deploy validation:
   - checkout `prod-stable`,
   - run `railway up --ci` (or equivalent) to redeploy the last stable backend code. citeturn0search2turn2search3

This provides deterministic rollback behavior even if Railway UI rollback is the only “officially documented” rollback surface.

## Scripts, health checks, monitoring, and implementation plan

### Scripts/commands for deploy validation and seeded-data correctness

**DB + seed truth check (SQL)**
Use deterministic IDs already referenced by production tests (ENV_ID / FUND_ID) and validate the DB contains the facts your charts depend on. fileciteturn55file0L1-L1

Example SQL checks (pseudo-queries; adjust schema/table names if your canonical SQL differs):

```sql
-- fund exists
SELECT count(*) AS c
FROM repe_fund
WHERE fund_id = 'a1b2c3d4-0003-0030-0001-000000000001';

-- env has at least one fund
SELECT count(*) AS c
FROM repe_fund
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001';

-- key asset exists (Cascade)
SELECT count(*) AS c
FROM repe_asset
WHERE name = 'Cascade Multifamily';
```

This aligns with how the live integration tests discover IDs and assert seed presence. fileciteturn54file0L1-L1

**API contract checks**
Use curl or Playwright request context; the production spec already uses request-based assertions for health and for key endpoints. fileciteturn55file0L1-L1

Minimal bash smoke (example):

```bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://www.paulmalmquist.com}"

# Proxy health: proves Vercel can reach backend
curl -fsS "${BASE_URL}/bos/health" | jq -e '.ok == true'

# Context contract: proves seeded fixture is coherent
ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
curl -fsS "${BASE_URL}/bos/api/re/v1/context?env_id=${ENV_ID}" \
  | jq -e --arg env "${ENV_ID}" '.env_id == $env and (.funds_count >= 1)'
```

The pass/fail criteria exactly match the production smoke suite’s intent. fileciteturn55file0L1-L1

**Schema verification in deploy pipeline**
Run the repo’s verify script against the target DB after deploy:

```bash
# Uses DATABASE_URL or SUPABASE_DB_URL
make db:verify
```

This directly leverages `verify.js` checks for RLS and seed baselines. fileciteturn49file0L1-L1 fileciteturn52file0L1-L1

### Monitoring, alerting, and remediation playbook

**Monitoring layers**
- **Synthetic monitoring (recommended)**: run the production smoke suite on a schedule (e.g., every 15–60 minutes). It detects:
  - backend health,
  - proxy health,
  - key API contract validity,
  - UI rendering correctness, and
  - JS runtime crashes. fileciteturn55file0L1-L1
- **Deploy-time logging for Vercel**: Vercel’s rollback guide recommends using `vercel logs --environment production --status-code 5xx --since 30m` to confirm symptoms and validate recovery. citeturn0search3
- **Railway operational visibility**: Railway documents deployment actions including rollback and redeploy; use the Railway service deployment history and logs to confirm backend recovery. citeturn0search4turn0search2

**Alerting**
- On failed post-deploy smoke:
  - Open a GitHub Issue automatically with:
    - commit SHA,
    - failed step summary,
    - Playwright report artifact link,
    - links to Vercel + Railway deployment IDs/URLs (capture via CLI or API).
- On scheduled smoke failure:
  - mark incident; trigger same playbook even if no deploy occurred.

**Automated first response**
1) **Freeze**: prevent further production deploys (GitHub Actions concurrency + environment protection). citeturn1search4turn1search0
2) **Rollback frontend** quickly: `vercel rollback` and wait for completion. citeturn0search0  
3) **Recover backend**:
   - either Railway UI rollback (documented), citeturn0search4  
   - or deterministic re-deploy from `prod-stable` tag via Railway CLI. citeturn0search2turn2search3  
4) **Re-validate**: rerun smoke suite; only then declare recovery.

**Manual remediation loop**
- If rollback restores service, debug root cause using:
  - Playwright trace/video artifacts,
  - schema verify output,
  - DB diff (schema-only dump),
  - Vercel + Railway logs.

### Prioritized implementation plan with effort and risk

Effort estimates assume one engineer familiar with the repo; “risk” measures production impact if skipped.

**Highest priority**
- **Add ephemeral-DB schema gate in CI (db:migrate + db:verify)**  
  Effort: 0.5–1 day. Risk if skipped: Very high (schema drift becomes deploy-time failure). fileciteturn49file0L1-L1
- **Run real-SQL backend integration smoke in CI (enable `test_re_live.py` against ephemeral DB)**  
  Effort: 0.5–1.5 days (may require ensuring seed fixtures exist after apply). Risk: Very high (seed/DB/UI mismatch). fileciteturn54file0L1-L1
- **Parameterize production Playwright tests to run against staging/preview baseURL**  
  Effort: 0.5–1 day. Risk: High (no safe pre-prod validation). fileciteturn55file0L1-L1

**Next**
- **Create deploy-and-validate workflow on main using `workflow_run`**  
  Effort: 1–2 days. Risk: High (deploys without deterministic validation). citeturn1search1
- **Implement automatic rollback procedure** (Vercel rollback + backend redeploy-last-good)  
  Effort: 1–2 days. Risk: High (incidents require manual midnight ops). citeturn0search0turn0search2

**Stabilization**
- **Scheduled synthetic smoke checks (prod)**  
  Effort: 0.5 day. Risk: Medium (silent breakage). fileciteturn55file0L1-L1
- **Add schema idempotency gate (apply twice)**  
  Effort: 0.5 day. Risk: Medium-high (future schema changes can brick deploy). fileciteturn51file0L1-L1
- **Property-based tests for one high-risk finance invariant set**  
  Effort: 1–3 days initial, then incremental. Risk: Medium (edge-case correctness bugs). citeturn14search3

**Hardening**
- **Environment drift detection** (assert required env var names exist in Vercel/Railway environments; fail pipeline if missing)  
  Effort: 1–2 days. Risk: Medium-high (runtime failures due to missing config). citeturn2search5turn1search0
- **Artifacts + diagnostics automation** (attach Playwright report links, key logs, schema verify output to failure notifications)  
  Effort: 0.5–1 day. Risk: Medium (slow MTTR).

This plan prioritizes the minimum set of changes required to reach a credible deploy-and-wait workflow: **DB gating + integration correctness pre-merge**, plus **post-deploy smoke + rollback** post-merge, using the repo’s existing verification and production test assets as the backbone.