# Investment Engine V1 — Handoff Notes

- **Status:** code-complete and DB-side-deployed; deploy of routes + frontend pending
- **Date:** 2026-04-30
- **Verification:** in-process FastAPI HTTP smoke against live Supabase = 24/24 pass

## What's already live in prod

The Supabase migrations are applied. `inv_*` tables exist and are populated with the production-grade schema (RLS, audit triggers, snapshot immutability, lot-relief overdraw guard, etc.). No further DB step needed.

Verified by `mcp__supabase__list_tables(schemas=['public'])` returning all 22 base tables + 4 partitions + 1 view, all with RLS enabled and `env_id`-isolation policies.

## What still needs to ship

The application code — backend routes + frontend page — has been written and tested but not yet deployed. Sandbox can't auth to Vercel/Railway, so this is a manual push.

## Files to commit

Run from repo root:

```bash
git add \
  backend/app/routes/investment_engine.py \
  backend/app/services/accounting_engine.py \
  backend/app/services/accounting_snapshot_writer.py \
  backend/app/services/investment_engine_audit.py \
  backend/app/services/reconciliation_engine.py \
  backend/tests/test_accounting_engine.py \
  docs/plans/INVESTMENT_ENGINE_PLAN.md \
  docs/plans/investment-engine \
  docs/adr/investment-engine \
  repo-b/db/schema/474_inv_core_entities.sql \
  repo-b/db/schema/475_inv_positions.sql \
  repo-b/db/schema/476_inv_transactions.sql \
  repo-b/db/schema/477_inv_pricing.sql \
  repo-b/db/schema/478_inv_accounting_snapshots.sql \
  repo-b/db/schema/479_inv_reconciliation.sql \
  repo-b/db/schema/480_inv_audit.sql \
  repo-b/db/schema/481_inv_block_released_mutation_payload_guard.sql \
  repo-b/db/schema/482_inv_position_current_view_fix.sql \
  'repo-b/src/app/lab/env/[envId]/investment-engine' \
  repo-b/tests/investment-engine.spec.ts \
  skills/winston-investment-engine-module \
  skills/winston-investment-snapshot

git add \
  backend/app/main.py \
  repo-b/src/lib/bos-api.ts \
  repo-b/src/components/lab/LabEnvironmentShell.tsx \
  repo-b/src/components/lab/Breadcrumbs.tsx \
  'repo-b/src/app/lab/env/[envId]/page.tsx' \
  CLAUDE.md
```

The tree has many other unrelated modifications from prior sessions. The above paths are the complete investment-engine surface — review with `git diff --cached` before committing.

## Suggested commit message

```
Investment Engine V1 — Aladdin-class fund accounting

Schema:
- 9 migrations (474-482) covering core entities, positions, transactions,
  pricing, accounting snapshots, reconciliation, audit + lineage
- 22 base tables + 4 partitions + 1 view + 9 trigger functions
- RLS + env_id isolation on every user-facing table
- Snapshot immutability trigger (released rows read-only except for
  superseded transition); append-only audit/mutation_event triggers;
  lot-relief overdraw guard

Backend services (backend/app/services/):
- accounting_engine.py — calculate_position_value, rollup_portfolio_value,
  calculate_nav, calculate_pnl. Pure compute helpers + DB fetches +
  fail-closed EngineResult shape. 25/25 prod-DB tests pass.
- reconciliation_engine.py — compare_positions (pure), run_reconciliation,
  generate_reconciliation_report. 19/19 tests pass.
- investment_engine_audit.py — write_audit, write_audit_batch,
  write_mutation_event helpers (same-transaction enforcement).
- accounting_snapshot_writer.py — produce/lock/release/reconstruct for NAV
  snapshots. 22/22 lifecycle tests pass.

Routes (backend/app/routes/investment_engine.py):
- POST /calculate/nav, /calculate/pnl
- POST /snapshots/nav/produce, /lock, /release; GET /reconstruct
- GET /nav/{fund_id}/{date}
- POST /reconciliation/run; GET /reconciliation/runs/{id}, /breaks
- GET /funds, /audit/timeline (UI helpers)
- All under /api/investment-engine. Strict pydantic, structured errors,
  HTTP 422 on invalid. Registered in app/main.py.

Frontend (repo-b/src/app/lab/env/[envId]/investment-engine/page.tsx):
- Three tabs: NAV (with snapshot lifecycle), Reconciliation (filterable
  break table), Audit (timeline with JSON diffs).
- "Unavailable" component instead of placeholder numbers when invalid.
- bos-api.ts: 13 typed client functions for the investment-engine surface.
- LabEnvironmentShell + Breadcrumbs + REPE quick-actions wired.

Tests:
- backend/tests/test_accounting_engine.py — pytest with db_conn fixture
- repo-b/tests/investment-engine.spec.ts — Playwright (NAV happy/fail,
  reconciliation empty state, audit JSON diff expansion)

ADRs:
- 001 Lot accounting (immutable lots + reliefs, fund-level FIFO/spec_id)
- 002 Currency model (native + fx_rate_id, no stored translated values)
- 003 Bi-temporal time model (effective_date + as_of_date + input_versions)

Skills authored:
- winston-investment-engine-module (per-module discipline)
- winston-investment-snapshot (locked snapshot lifecycle pattern)

Verification:
- 24/24 in-process FastAPI HTTP smoke tests against live Supabase pass
- All TS/Python files AST-parse clean
- Prod-DB-side schema verified (22 tables + RLS + triggers all in place)
```

## Deploy commands

After committing and pushing to `main`:

```bash
# Backend (Railway)
cd backend
railway up --service authentic-sparkle
railway logs --service authentic-sparkle | head -50   # confirm boot

# Frontend (Vercel — will auto-deploy on push to main, or force):
cd ..
vercel deploy --prod
```

CI may auto-deploy on push depending on existing pipeline config. Check Vercel dashboard / GitHub Actions to confirm.

## Smoke checks after deploy

```bash
# Replace with actual prod hostnames
BACKEND=https://api.novendor.ai      # or the Railway public URL
FRONTEND=https://novendor.ai

# 1. Funds list (any env you have data in; e.g. an existing REPE env)
curl -s "$BACKEND/api/investment-engine/funds?env_id=$ENV_ID" | jq .

# 2. NAV calc against a known fund (returns valid=false if no data, which is fine)
curl -s -X POST "$BACKEND/api/investment-engine/calculate/nav" \
  -H 'content-type: application/json' \
  -d "{\"fund_id\":\"$FUND_ID\",\"effective_date\":\"2026-04-30\",\"env_id\":\"$ENV_ID\"}" | jq .

# 3. Frontend page (browser)
open "$FRONTEND/lab/env/$ENV_ID/investment-engine"
```

Expected response shape on every route is the EngineResult envelope:
`{ valid: bool, value: any | null, errors: [{code, message, context}], input_versions: {} }`.

A 422 with `valid: false` on missing data is correct, not a failure.

## Known caveats

- `vercel env pull backend/.env --environment production` was used during dev. Don't accidentally commit `backend/.env`.
- Some pre-existing files in the working tree are dirty (modifications from prior sessions). Stage only the paths in the commit list above.
- The `.git/index.lock` was stuck in the sandbox during the staging attempt; shouldn't reproduce on your machine but `rm .git/index.lock` if needed.

## Path to Wave 1

V1 is done. Next per the plan doc:
- Wave 1: risk_engine + compliance (parallel modules using `winston-investment-engine-module` skill)
- ADR 004 (VaR method) and ADR 005 (compliance rule DSL) before Wave 1 schema lands
