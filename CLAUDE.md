# Winston Monorepo — Architecture Map

> Deep detail (deploy, smoke, AI gateway, OpenClaw): see `tips.md`

This monorepo has **3 runtimes** and **3 API patterns** inside the frontend.
Assuming there is one backend is the most common failure mode.

---

## Services

| Service | Directory | Stack | Port | Test | Deploy |
|---|---|---|---|---|---|
| Frontend | `repo-b/` | Next.js 14 App Router | 3001 | `make test-frontend` | `git push` → Vercel |
| BOS backend | `backend/` | FastAPI + psycopg | 8000 | `make test-backend` | `railway redeploy --yes` |
| Demo Lab | `repo-c/` | FastAPI + psycopg | 8001 (local) / 8080 (Docker) | `make test-demo` | see tips.md |

---

## Service Boundaries — ONLY modify the owning service

- Frontend code lives ONLY in `repo-b/`
- BOS backend code lives ONLY in `backend/`
- Demo Lab code lives ONLY in `repo-c/`
- SQL schema lives ONLY in `repo-b/db/schema/` (107 numbered `.sql` files — canonical source of truth)

---

## API Patterns inside repo-b

- **Pattern A** — `bosFetch()` → `/bos/[...path]` proxy → FastAPI `backend/`
- **Pattern B** — direct fetch `/api/re/v2/*` → Next.js route handler → Postgres (NO FastAPI)
- **Pattern C** — `apiFetch()` → `/v1/[...path]` proxy → FastAPI `repo-c/`

**Before touching any endpoint:** confirm which service owns it.

| Route prefix | Owner | Where the logic lives |
|---|---|---|
| `/bos/api/repe/*` | backend/ | `backend/app/routes/repe.py` |
| `/bos/api/ai/gateway/*` | backend/ | `backend/app/routes/ai_gateway.py` |
| `/bos/api/documents/*` | backend/ | `backend/app/routes/documents.py` |
| `/bos/api/tasks/*` | backend/ | `backend/app/routes/tasks.py` |
| `/api/re/v2/*` | repo-b/ | `repo-b/src/app/api/re/v2/` (direct DB) |
| `/api/commands/*` | repo-b/ | `repo-b/src/app/api/commands/` (MCP orchestrator) |
| `/api/public/*` | repo-b/ | `repo-b/src/app/api/public/` (no auth) |
| `/v1/*` | repo-c/ | proxied via `apiFetch()` |

**Fetch helpers:**
- `bosFetch()` → Pattern A (BOS backend)
- `apiFetch()` → Pattern C (Demo Lab)
- Pattern B routes use the `pg` pool directly (`repo-b/src/lib/server/db.ts`)

---

## Key Backend Services (backend/app/services/)

150+ service files. The ones most likely to be touched:

| Domain | Key files |
|---|---|
| AI gateway | `ai_gateway.py`, `ai_gateway_logger.py`, `ai_conversations.py` |
| REPE | `repe_intent.py`, `repe_session.py`, `repe_schema.py`, `repe_context.py` |
| Waterfall | `re_waterfall*.py`, `re_waterfall_runtime.py`, `re_waterfall_scenario.py` |
| Fund / capital | `re_fund_aggregation.py`, `re_fund_metrics.py`, `re_capital_account*.py`, `re_capital_ledger.py` |
| Models | `re_model*.py`, `re_run_engine.py`, `re_monte_carlo.py` |
| Reporting | `re_reports.py`, `re_uw_vs_actual.py`, `re_variance.py` |
| RAG | `rag_indexer.py`, `rag_reranker.py` |
| Dashboard | `dashboard_composer.py`, `dashboard_intelligence.py` |
| MCP tools | `backend/app/mcp/server.py` (83 tools across 19 modules) |

---

## Dashboard Intelligence Engines (repo-b/src/lib/dashboards/)

Five TypeScript engines extend the dashboard builder beyond raw widget composition:

| Engine | File | What it does |
|---|---|---|
| Interaction Engine | `interaction-engine.ts` | Level 1 + 2 interaction rules; infers widget wiring |
| Measure Suggestion | `measure-suggestion-engine.ts` | required/suggested/optional metrics by keyword + user type |
| Tabular Engine | `tabular-engine.ts` | Auto-injects table when logically needed (7 rules, first match wins) |
| Dashboard Intelligence | `dashboard-intelligence.ts` | Orchestrator: behavior_mode, hero_widget, interactions, table_decision |
| Spec Parser | `spec-from-markdown.ts` | Parses `## Interactions`, `## Measure Intent`, `## Table Behavior` sections |

Call `assembleDashboardIntelligence()` AFTER initial widget composition.

**Available widget types:** `metrics_strip`, `trend_line`, `bar_chart`, `waterfall`, `statement_table`, `comparison_table`, `text_block`. (`sparkline_grid`, `sensitivity_heat` are stubbed — don't request.)

**`comparison_table` is right for "actual vs budget" / "UW vs actual."** `statement_table` renders a full P&L, not a scorecard.

---

## Database

- **Schema location:** `repo-b/db/schema/` (files `000_*.sql` → `999_*.sql`)
- **Apply migrations:** `make db:migrate` — Railway does NOT auto-migrate on deploy
- **Verify integrity:** `make db:verify`
- **ORM:** None. Raw psycopg3 SQL everywhere.
- **psycopg3 rule:** `%` in SQL strings must be `%%` or the driver will choke

---

## Test Commands

```bash
make test-frontend          # Vitest unit tests (repo-b)
make test-backend           # Backend unit tests — mocked DB (backend/)
make test-demo              # Demo Lab unit tests (repo-c/)
make test-repe              # Full REPE verification suite
make test-repe-backend      # REPE API tests only
make test-repe-e2e          # REPE Playwright flows
make test-e2e               # Full Playwright E2E suite
make test-dashboard-validation  # Dashboard spec + layout (no DB)
make test-live              # Live integration smoke (requires DATABASE_URL)
make quality                # lint-strict + typecheck + test-frontend (CI-aligned)
```

---

## Deploy Checklist

Before declaring a deploy done, all of the following must be true:

1. Railway shows `SUCCESS` (backend changes)
2. `GET https://authentic-sparkle-production-7f37.up.railway.app/health` → 200
3. Vercel deploy complete (frontend changes)
4. `make db:migrate` run if any `.sql` file changed
5. `make db:verify` passes
6. Hard browser refresh done before UI verification

---

## Execution Rules

- ALWAYS run tests after changes using the relevant `make test-*` command
- ALWAYS include actual terminal output in your response
- ALWAYS run `cd backend && python -m ruff check` before ANY `git push` — fix all errors before pushing
- NEVER say "tests should pass" — RUN THEM
- NEVER use `git add -A` — stage specific files only
- NEVER declare deploy done before Railway shows `SUCCESS` + `/health` 200
- NEVER push code that hasn't passed `ruff check` — CI will reject it

---

## Production Seed IDs

| Name | ID |
|---|---|
| Business (Meridian Capital) | `a1b2c3d4-0001-0001-0001-000000000001` |
| Environment | `a1b2c3d4-0001-0001-0003-000000000001` |
| Fund (IGF-VII) | `a1b2c3d4-0003-0030-0001-000000000001` |
| Asset (Cascade Multifamily) | `11689c58-7993-400e-89c9-b3f33e431553` |

---

## Production URLs

- Frontend: `https://www.paulmalmquist.com`
- BOS backend: `https://authentic-sparkle-production-7f37.up.railway.app`
- Health: `https://authentic-sparkle-production-7f37.up.railway.app/health`

---

## Common Errors

1. **RE v2 route in wrong place** — `/api/re/v2/*` lives in `repo-b/src/app/api/re/v2/`, not `backend/`
2. **Missing `env_id`/`business_id`** — empty data is missing context, not a UI bug
3. **`"use client"` without React import** — `import React from "react"` required, or Vitest breaks
4. **`%` in psycopg3 SQL** — use `%%` or the driver will throw a format error
5. **Declaring deploy done too early** — wait for Railway `SUCCESS` + `/health` 200
6. **Editing Demo Lab port as 8001 in Docker** — repo-c Dockerfile runs on 8080; 8001 is the local dev alias only
7. **Skipping `make db:migrate` after schema changes** — Railway never auto-migrates
8. **Touching `backend/` for an MCP command route** — those live in `repo-b/src/app/api/commands/`
