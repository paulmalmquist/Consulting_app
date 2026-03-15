# Coding Assistant    

This file is a repo inventory plus a pre-flight checklist for giving instructions to coding assistants in this monorepo.

The main repeat failure pattern here is simple: assistants assume there is one app, one backend, one API surface, and one database path. That is false in this repo.

## Dashboard Intelligence Engines (depth-2 upgrade)

Five TypeScript engines in `repo-b/src/lib/dashboards/` power smarter dashboard generation:

| Engine | File | What it does |
|---|---|---|
| Interaction Engine | `interaction-engine.ts` | Level 1 + Level 2 interaction rules; infers wiring from widget pairs |
| Measure Suggestion | `measure-suggestion-engine.ts` | required/suggested/optional metrics from keywords + user type |
| Tabular Engine | `tabular-engine.ts` | Auto-injects table when one is logically needed (7 rules, first match wins) |
| Dashboard Intelligence | `dashboard-intelligence.ts` | Orchestrator — behavior_mode, hero_widget, interactions, table_decision |
| Spec Parser | `spec-from-markdown.ts` | Parses `## Interactions`, `## Measure Intent`, `## Table Behavior` sections |

Call `assembleDashboardIntelligence()` AFTER initial widget composition.
Its result enriches the response payload — these are design contracts, not yet rendered by frontend.

**Behavior modes:** `executive_summary` | `operational_monitor` | `analytical_workbench` |
`pipeline_manager` | `geographic_explorer`

**Table auto-injection (first match):** watchlist → exceptions always; map → detail on_select;
compare/market → grouped summary; pipeline/deal → deal grid; analytical+KPI+trend → ranked expandable;
fund_quarterly_review → scorecard; executive_summary → ranked expandable.

**Interaction levels:** Level 1 always wired (bar→table filter, kpi→trend, table row→kpi update).
Level 2 archetype-specific (drilldown, cross-filter, sync_selection).

**New markdown sections:** `## Interactions` (plain-English rules), `## Measure Intent`
(depth/user-type/required metrics), `## Table Behavior` (include/visibility/type override).

**Frontend implementation priority:**
1. `interaction_model.global_filters` → page-level filter bar
2. `behavior_mode` → layout density default
3. `on_select` table visibility — hide table until click
4. `hero_widget_id` → larger grid weight
5. `measure_suggestions.suggested` → hint chips in builder UI

## Dashboard Request System (docs/dashboard_requests/)

Winston's AI dashboard builder accepts both free-form prompts and structured markdown specs.

**Markdown spec path** — pass `spec_file` to the generate endpoint instead of `prompt`:
```bash
POST /api/re/v2/dashboards/generate
{ "spec_file": "docs/dashboard_requests/real_estate_fund_dashboard.md",
  "env_id": "...", "business_id": "..." }
```

The generate route (`repo-b/src/app/api/re/v2/dashboards/generate/route.ts`) reads the
file via `fs.readFileSync`, parses it with `parseMarkdownSpec()` from
`repo-b/src/lib/dashboards/spec-from-markdown.ts`, and synthesises a prompt. If required
sections are missing it returns `422` with `missing_sections[]`.

**Required sections in every markdown spec:** Purpose, Key Metrics, Layout, Entity Scope.

**Widget types available:** `metrics_strip`, `trend_line`, `bar_chart`, `waterfall`,
`statement_table`, `comparison_table`, `text_block`. The `sparkline_grid` and
`sensitivity_heat` types are stubbed — don't request them yet.

**Next.js `cwd()` is repo-b root** — the route resolves `spec_file` relative to `process.cwd()`
first, then tries `../` (monorepo root). Paths like `docs/dashboard_requests/foo.md` work
from the monorepo root; paths like `src/...` would need to be relative to repo-b/.

**Archetype detection is regex-only, not LLM** — the fast-path classifier in
`backend/app/services/repe_intent.py` fires at confidence ≥ 0.85. If the synthesised prompt
is ambiguous, add explicit archetype-trigger words ("monthly operating", "fund quarterly
review", "watchlist") to the Purpose section.

**`comparison_table` is the right widget for "actual vs budget" or "UW vs actual" views.**
Don't use `statement_table` for those — it renders full P&L rows, not a scorecard.

Key files:
- `docs/dashboard_requests/template.md` — blank request template
- `docs/dashboard_requests/schema.md` — parsing rules and agent instructions
- `docs/dashboard_requests/real_estate_fund_dashboard.md` — worked example
- `docs/dashboard_requests/README.md` — workflow guide and curl examples
- `repo-b/src/lib/dashboards/spec-from-markdown.ts` — markdown parser
- `repo-b/src/app/api/re/v2/dashboards/generate/route.ts` — generate endpoint (modified)

## Research Integration Layer

Winston has a two-tier research model:
- **Tier 1 (quick lookup):** OpenClaw web tools inline. No file needed.
- **Tier 2 (deep research):** User runs ChatGPT Deep Research externally, pastes report into `docs/research/YYYY-MM-DD-<slug>.md` using `docs/research/template.md`, sets `Status: ready`, then asks Winston to ingest.
- **Tier 3 (ingest):** `research-ingest` skill reads the report, assigns tasks to surfaces, hands to `feature-dev`.

Key files:
- `RESEARCH.md` — routing rules, Telegram command patterns, report lifecycle
- `docs/research/template.md` — blank report template
- `docs/research/README.md` — directory guide
- `.skills/research-ingest/SKILL.md` — research-architect skill definition

Telegram examples:
```
search: what changed in shadcn/ui v2 tooltips               # Tier 1
deep research needed: compare IRR calculation libraries      # Tier 2
ingest research: docs/research/2026-03-11-irr-libs.md       # Tier 3
build plan from: docs/research/2026-03-11-irr-libs.md       # Tier 3
```

### Research-Driven Implementations

_(This section is appended by the research-architect after each successful ingestion.)_

---

## Quick Tip

- When reading or editing Next.js route files with shell commands, quote paths like `'repo-b/src/app/lab/env/[envId]/page.tsx'`. Unquoted brackets will be globbed by `zsh` and the command will fail before it reaches the file.
- Run backend tests with `python3.11 -m pytest ...` in this repo. A bare `pytest` invocation may bind to an older interpreter and fail inside existing files before your feature code is even imported.
- OpenClaw now routes Telegram DMs from user `8672815280` to `dispatcher-winston`, not the legacy `winston` agent. The default `main` agent still stays on `~/.openclaw/workspace`.
- OpenClaw is now Codex-first for non-Claude control agents: `agents.defaults.model.primary`, `dispatcher-winston`, `commander-winston`, `data-winston`, and the new Novendor business agents all use `codex-cli/gpt-5.4` instead of the OpenAI API-backed default.
- Winston harness agents are split cleanly: `claude-winston` and `codex-winston` use ACP persistent runtimes, while `claude-cli-winston` and `codex-cli-winston` provide explicit OpenClaw CLI-backend fallback agents.
- OpenClaw CLI backend commands are pinned through `~/.openclaw/bin/claude` and `~/.openclaw/bin/codex` so launchd or other minimal-PATH environments still find the correct binaries.
- Lobster is now installed locally and pinned through `~/.openclaw/bin/lobster`. Multi-step Novendor workflows live in `orchestration/openclaw/`.
- ACP adapter commands are pinned in `~/.acpx/config.json` with absolute `/usr/local/bin/npx` wrappers so Claude/Codex ACP sessions do not depend on shell PATH resolution.
- OpenClaw `2026.3.8` needs `tools.sessions.visibility: "all"` in `~/.openclaw/openclaw.json` if a Telegram-facing dispatcher is going to spawn and continue cross-agent CLI worker sessions like `claude-cli-winston` or `codex-cli-winston`.
- If Telegram behavior seems to ignore the current Winston routing, inspect `~/.openclaw/agents/*/sessions/sessions.json` for stale `telegram:direct:<peer>` entries. Old `main` or `commander-winston` mappings can keep a DM on the wrong agent path even after config changes.
- The Winston routing skill is stored both in `skills/winston-router/SKILL.md` for repo context and in `~/.openclaw/skills/winston-router/SKILL.md` so the live gateway actually loads it.
- `~/.openclaw/skills/acp-router/SKILL.md` overrides the bundled ACP router so Winston Telegram DMs prefer CLI worker agents instead of unsupported non-threaded ACP spawn paths.
- For local alignment with Telegram, use `openclaw agent --agent dispatcher-winston ...` for the lightweight DM entrypoint, or attach the TUI to `agent:dispatcher-winston:telegram:direct:8672815280` when you want the same Telegram session on desktop.
- Keep `commander-winston` for richer local orchestration, but prefer `dispatcher-winston` as the Telegram front door so Winston spends fewer tokens on routing.
- Winston repo synchronization now runs through `sync-winston` and `scripts/openclaw_safe_sync.sh`; this blocks pulls on dirty trees, wrong branches, or rebase conflicts instead of allowing a blind `git pull`.
- Telegram DMs work best when `commander-winston` answers simple repo questions directly. Avoid subagent delegation for one-file lookups or doc-location questions, because a timed-out child run can leave the Telegram turn without a visible reply.
- Telegram `push` or `deploy` requests should route to `deploy-winston`, not `commander-winston` directly. In Winston chat, `push` means commit + push to GitHub + monitor CI + monitor Vercel/Railway + run post-deploy checks from `tips.md`.
- Telegram should never show internal delegation chatter like blocked ACP routes or abandoned subagent attempts. If a valid user-facing answer was already sent, any later internal completion event should be ignored with `NO_REPLY`.
- Telegram UX should be incremental for long tasks: quick acknowledgment first, then short progress notes at real milestones, then one final answer.
- Live-site login, invite-code login, authenticated dashboard verification, and browser-based production checks should route to `builder-winston`, not to Claude/Codex CLI workers, because those tasks need browser state rather than a CLI-only harness.
- If a Telegram request mentions both live/browser work and `Claude`, `opus 4.6`, or `high thinking`, the browser/live-site route still wins. Send it to `builder-winston` first and let the builder decide whether Claude should be used internally.
- The Novendor business agents use isolated workspaces under `~/.openclaw/workspaces/novendor-*` so outreach/proposal/content/demo work cannot accidentally target the Winston repo.
- Telegram slash commands are now the preferred operator surface: `/research`, `/build`, `/propose`, `/outreach`, `/content`, `/ops_status`, `/brief`, `/cost`.
- OpenClaw `2026.3.8` reserves `/status` as a native Telegram command. Use `/ops_status`, plain `status`, or the forum `Status` topic for the Novendor status rollup on this machine.
- `~/.openclaw/bin/codex` now strips OpenClaw's unsupported `--color`/`--progress-cursor` flags when it resumes Codex sessions, which fixes the `codex exec resume ... unexpected argument '--color'` failure on this install.
- The Telegram bot still has no live forum supergroup in state today. Topic-level routing is enabled by `scripts/openclaw_setup_forum.mjs` once the bot is added to a forum supergroup and you pass the real `--chat-id`.
- `scripts/openclaw_setup_forum.mjs --chat-id <telegram-supergroup-id>` creates the Research/Builds/Client Ops/Sales/Status topics, patches `channels.telegram.groups.<chatId>.topics.*.agentId`, and installs the `Novendor Morning Brief` cron job to the Status topic.
- The OpenClaw gateway is managed through the launchd service again on this machine. Use `openclaw gateway stop` and `openclaw gateway start` for reloads instead of killing the port manually.
- Proposal approvals currently use Lobster approval gates and staged handoff files rather than Telegram-native host-exec approval buttons. This build does not expose a first-class Telegram `execApprovals` surface like Discord.
- If an old Telegram DM session keeps reporting `openai/gpt-5.1-codex` after the Codex-first cutover, send `/reset` in that chat so the dispatcher session picks up the new model config.
- Audit note (2026-03-14): legacy direct-DB Next routes in `repo-b/src/app/api/re/v1/*` and `repo-b/src/app/api/v1/environments/*` should reuse `repo-b/src/lib/server/db.ts` and shared query helpers instead of re-declaring file-local `getPool()` / `resolveBusinessId()` logic.
- Audit note (2026-03-14): Lab/Data Studio pages under `repo-b/src/app/lab/env/[envId]/...` have repeated `API_BASE` + `qs()` + account-bootstrap fetch patterns. New pages in that surface should land on a shared hook/client, not another page-local copy.
- Audit note (2026-03-14): assistant response rendering is now split across both `repo-b/src/components/copilot/` and `repo-b/src/components/winston/`. Before adding a third assistant surface, extract shared response blocks or add mirrored tests so charts/tables/confirmations do not drift silently.
- REPE sidebar UX source of truth now lives in `repo-b/src/components/repe/workspace/repeNavigation.ts`. Desktop grouped nav, tablet compact icon rail, and mobile quick-nav all derive from that config; if you change section order or labels, update that file and `repo-b/src/components/repe/workspace/__tests__/repeNavigation.test.ts` together.
- RE create/list flows are easy to break when the page mixes a legacy direct-DB Next route with the canonical BOS API contract. For models, the durable contract is `env_id` + `primary_fund_id` on `/api/re/v2/models`; validate inline before submit, disable only during the in-flight save, and refetch the list from that same source of truth after success instead of hand-appending a stale payload.

## 1. Repo Inventory

### Primary surfaces

| Surface | Directory | Stack | Default port | Main role |
|---|---|---|---:|---|
| Frontend | `repo-b/` | Next.js 14 App Router + TS | `3001` | Main Winston / Business OS UI |
| BOS backend | `backend/` | FastAPI + psycopg | `8000` | Business OS APIs, documents, AI gateway, RE/PDS/etc. |
| Demo Lab backend | `repo-c/` | FastAPI + psycopg | `8001` | Demo lab environments, uploads, chat, pipeline, Excel API |
| Excel add-in | `excel-addin/` | React + Webpack | n/a | Talks to `repo-c` APIs |
| SQL schema source | `repo-b/db/schema/` | ordered `.sql` bundle | n/a | Canonical schema/migrations |

### Important conclusion

Do not describe this repo as "a Next app with a Python backend" without clarifying which backend and which API surface.

It is:

1. `repo-b` frontend
2. `backend` Business OS backend
3. `repo-c` Demo Lab backend
4. Shared Postgres / Supabase-backed data model
5. Mixed direct-DB and proxied API patterns inside `repo-b`

## 2. Source Of Truth By Concern

| Concern | Source of truth |
|---|---|
| Frontend pages/components | `repo-b/src/app`, `repo-b/src/components` |
| Frontend direct DB route handlers | `repo-b/src/app/api/re/v2/*`, selected `repo-b/src/app/bos/api/*` |
| Business OS API contracts | `backend/app/routes/*`, `backend/app/schemas/*`, `backend/app/services/*` |
| Demo Lab API contracts | `repo-c/app/main.py` |
| Canonical SQL schema | `repo-b/db/schema/*.sql` applied in numeric order |
| DB apply/verify scripts | `repo-b/db/schema/apply.js`, `repo-b/db/schema/verify.js` |
| Local dev topology | `docs/LOCAL_DEV_PORTS.md`, `Makefile` |
| Local dev topology | `docs/LOCAL_DEV_PORTS.md` |

### Important conclusion

There is no Prisma/ORM canonical model here. This repo is SQL-first.

If a change affects persistence, check SQL files first, then route/service code.

## 3. Runtime Data Flows

### A. Frontend -> BOS backend -> SQL / storage

Used by `repo-b/src/lib/bos-api.ts`.

Flow:

1. Browser UI in `repo-b`
2. `bosFetch(...)`
3. Same-origin Next proxy at `/bos/*` in `repo-b/src/app/bos/[...path]/route.ts`
4. FastAPI in `backend/`
5. Postgres via `backend/app/db.py`
6. Optional Supabase Storage via `backend/app/repos/supabase_storage_repo.py`

Typical examples:

- businesses
- departments/capabilities
- documents
- executions
- PDS APIs
- REPE context bootstrap
- AI gateway

### B. Frontend -> Next route handler -> SQL directly

Used heavily in `repo-b/src/app/api/re/v2/*` and some `repo-b/src/app/bos/api/*`.

Flow:

1. Browser UI in `repo-b`
2. Next route handler
3. `getPool()` from `repo-b/src/lib/server/db.ts`
4. Postgres directly from Node via `pg`

Typical examples:

- `repo-b/src/app/api/re/v2/funds/[fundId]/metrics/[quarter]/route.ts`
- `repo-b/src/app/api/re/v2/funds/[fundId]/quarter-close/route.ts`
- many asset/fund/model/scenario routes

### Important conclusion

Not all `/api/*` traffic goes through `backend/`.

Before instructing an assistant to "update the backend endpoint", verify whether the endpoint actually lives in:

- `backend/app/routes/*`, or
- `repo-b/src/app/api/*`

### C. Frontend -> Demo Lab backend

Used by `repo-b/src/lib/api.ts`.

Flow:

1. Browser UI in `repo-b`
2. `apiFetch(...)`
3. Same-origin Next proxy at `/v1/*` in `repo-b/src/app/v1/[...path]/route.ts`
4. FastAPI in `repo-c/`
5. Postgres / Supabase-backed tables used by Demo Lab

Typical examples:

- environments
- uploads
- demo chat
- pipeline
- Excel API support

### Demo Lab fallback wrinkle

Some Demo Lab flows in `repo-b` can fall back to local in-process state when the upstream Demo Lab backend is unavailable.

Relevant file:

- `repo-b/src/lib/labV1Fallback.ts`

### Important conclusion

If a Demo Lab page "works" while `repo-c` is down, verify whether you are seeing fallback behavior before concluding that the real backend path is correct.

### D. Document upload -> SQL metadata + Supabase Storage

Canonical upload path:

1. Frontend calls `initUpload()` / `completeUpload()` from `repo-b/src/lib/bos-api.ts`
2. BOS backend routes in `backend/app/routes/documents.py`
3. Document metadata stored in `app.documents`, `app.document_versions`, `app.document_entity_links`
4. Binary stored in Supabase Storage

### Important conclusion

Uploading a document is not the same thing as indexing it for RAG.

### E. Document indexing -> vector store

Canonical current RAG path:

1. Document exists in `app.documents` + `app.document_versions`
2. Frontend or caller hits `/api/ai/gateway/index`
3. Next proxy forwards to `backend/app/routes/ai_gateway.py`
4. Backend downloads file from Supabase Storage
5. `backend/app/services/text_extractor.py` extracts text
6. `backend/app/services/rag_indexer.py` chunks + embeds + stores in `rag_chunks`

Canonical vector table:

- `rag_chunks`

Schema file:

- `repo-b/db/schema/316_rag_vector_chunks.sql`

### Legacy/demo document-vector path

There is also older/demo KB code using:

- `app.document_chunks`
- `kb_*` tables
- `repo-b/db/schema/291_winston_demo_kb.sql`
- `backend/app/services/winston_demo.py`

### Important conclusion

If the task is about the current AI Gateway / RAG system, prefer `rag_chunks`.

Do not default to `app.document_chunks` unless the task is explicitly about Winston demo/legacy KB flows.

## 4. Environment Variables And Ports To Check First

### Frontend (`repo-b`)

- `NEXT_PUBLIC_BOS_API_BASE_URL`
- `BOS_API_ORIGIN`
- `NEXT_PUBLIC_DEMO_API_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL` only for legacy fallback assumptions
- `DATABASE_URL` or `PG_POOLER_URL` if Next route handlers hit Postgres directly
- `ADMIN_INVITE_CODE`
- `ENV_INVITE_CODE`

### BOS backend (`backend`)

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STORAGE_BUCKET`
- `ALLOWED_ORIGINS`
- `OPENAI_API_KEY` for AI Gateway

### Demo Lab backend (`repo-c`)

- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS`
- `EXCEL_API_KEY` if Excel flows matter

### Default local ports

- frontend: `3001`
- BOS backend: `8000`
- Demo Lab backend: `8001`

## 5. Authentication / Context Assumptions

### Session model in `repo-b`

Auth is mostly cookie-based, not a full external auth stack.

Primary cookie:

- `bos_session`

Key middleware:

- `repo-b/src/middleware.ts`
- `repo-b/src/lib/server/sessionAuth.ts`

Protected areas include:

- `/lab/*`
- `/app/*`
- `/documents/*`
- `/tasks/*`
- `/api/commands/*`
- `/api/mcp/*`
- `/api/ai/gateway/*`

### Environment/business context

Many RE/REPE flows depend on both:

- `env_id`
- `business_id`

Important files:

- `repo-b/src/lib/repe-context.ts`
- `repo-b/src/app/api/lab/env-context/[envId]/route.ts`
- `backend/app/routes/repe.py` and related context services

### Important conclusion

If a bug smells like "empty data", "404", "not bound", or "context missing", check env/business binding before changing UI logic.

## 6. SQL / Schema Reality

### Canonical migration model

The schema is a numbered SQL bundle in:

- `repo-b/db/schema/*.sql`

Applied by:

- `node repo-b/db/schema/apply.js`

Verified by:

- `node repo-b/db/schema/verify.js`

### Important conclusion

Do not invent ad hoc migrations in random places.

If a feature needs schema changes, update the proper numbered SQL file or add a new numbered SQL file in `repo-b/db/schema/`.

### Useful commands

```bash
make db:migrate
make db:verify
cd repo-b && npm run db:dry
```

## 7. Common Repeat Errors To Prevent

1. Assuming all APIs are in `backend/`
2. Assuming all frontend APIs are thin proxies rather than direct SQL handlers
3. Sending Demo Lab changes to BOS backend or BOS changes to `repo-c`
4. Forgetting that RE v2 is largely implemented inside `repo-b/src/app/api/re/v2/*`
5. Forgetting env/business binding requirements
6. Confusing document upload with RAG indexing
7. Targeting `app.document_chunks` when the task is really about `rag_chunks`
8. Forgetting Supabase Storage is part of the document path
9. Assuming production uses localhost-based API origins
10. Changing UI without checking matching tests in `repo-b/tests` and `repo-b/src/components/**/*.test*`
11. Changing backend contracts without checking frontend callers in `bos-api.ts` or `api.ts`
12. Forgetting that `repo-b` can fail because DB env vars are missing even if `backend` is healthy
13. Mistaking Demo Lab fallback responses for real `repo-c` behavior
14. Creating new `"use client"` React components without `import React from "react"` — Next.js auto-injects it for production builds but the vitest/jsdom test environment does NOT, causing `ReferenceError: React is not defined` in CI
15. Pushing Python changes without running `ruff check` locally first — CI will catch it but it wastes a deploy cycle
16. Hardcoded `%` in SQL strings passed to psycopg3 `execute()` — must be `%%` to avoid format-string errors (e.g. `LIKE '%%broker%%'`)

## 8. Pre-Flight Checklist Before Prompting A Coding Assistant

Ask the assistant to confirm all of these before making changes:

1. Which app is in scope: `repo-b`, `backend`, `repo-c`, or `excel-addin`?
2. Is the user flow using `bosFetch`, `apiFetch`, or a direct browser fetch to a Next route?
3. Is the endpoint implemented in `backend/app/routes/*` or `repo-b/src/app/api/*`?
4. Does the route talk to Postgres directly, or proxy to FastAPI?
5. Which IDs are required: `env_id`, `business_id`, `fund_id`, `asset_id`, `document_id`, etc.?
6. Does the feature require auth/session cookies?
7. Does the DB schema already contain the required tables/columns?
8. If documents are involved, is the task about storage metadata, extracted text, or vector retrieval?
9. If AI/RAG is involved, is the canonical table `rag_chunks` or a demo KB table?
10. Which test suite must pass: `backend` pytest, `repo-c` pytest, `repo-b` vitest, Playwright, or DB verify?

## 9. Recommended Prompt Addendum For Assistants

Use language like this when assigning work:

```md
Before changing code, identify:
- the exact app and file path that owns this flow
- whether the request path is frontend-direct-to-DB, frontend-to-BOS-backend, or frontend-to-Demo-Lab-backend
- the exact SQL tables involved
- whether env_id/business_id context is required
- whether document upload and RAG indexing are separate steps here
- the smallest relevant test command to run after the change
```

## 10. Fast Sanity Commands

```bash
make db:verify
make test-backend
make test-demo
make test-frontend
make smoke
```

For quick architecture checks:

```bash
rg "getPool\\(" repo-b/src/app
rg "bosFetch\\(" repo-b/src
rg "apiFetch\\(" repo-b/src
rg "rag_chunks|document_chunks" backend repo-b/db/schema repo-b/src
```

## 11. One-Sentence Mental Model

This repo is a multi-surface monorepo where `repo-b` is the UI, `backend` is the Business OS API, `repo-c` is a separate Demo Lab API, `repo-b` also owns many direct-to-Postgres route handlers, and the current canonical vector store is `rag_chunks`, not the older demo KB chunk tables.

---

## 12. Deploy -> Test Readiness

### The core rule

There are five separate post-change steps in this repo, and assistants should not compress them into one generic deploy:

1. GitHub push / merge
2. GitHub Actions CI
3. Vercel frontend deploy for `repo-b`
4. Railway backend deploy for `backend`
5. Manual DB migration if schema changed

GitHub Actions CI is not the deploy mechanism here. The current CI workflow runs lint, typecheck, and unit checks. It does not deploy Vercel or Railway.

Vercel and Railway are independent. One does not trigger the other.

| Action | How to trigger | When live |
|---|---|---|
| GitHub CI | Push to `main` / PR update | When workflow jobs finish |
| Frontend deploy | Vercel deploy for `repo-b` | After Vercel build + rollout completes |
| Backend deploy | Railway deploy/redeploy for `backend` | After Railway build + `/health` passes |
| DB schema changes | `make db:migrate` run manually | Immediately after the command completes |

**Do not start production testing until every relevant step for the changed surface has completed.**

---

### Actual production routing

Current production wiring:

- Frontend: Vercel
- BOS backend: Railway
- Frontend proxy: Vercel `BOS_API_ORIGIN` -> Railway backend URL

The BOS request path in production is:

1. Browser -> Vercel frontend
2. Vercel `/bos/*` proxy
3. Railway backend

It is not `GitHub -> Vercel -> Railway`.

---

### Railway deploy timing in detail

The BOS backend runs as a Docker container on Railway using `backend/Dockerfile`. Railway only serves the new backend after the deployment reaches `SUCCESS` and `/health` returns 200.

Typical timings:

- `requirements.txt` unchanged -> often ~1-2 min
- `requirements.txt` changed -> often ~3-5 min
- simple `railway redeploy --yes` with warm cache -> often ~1-3 min

Most reliable checks:

```bash
cd backend && railway service status
cd backend && railway deployment list --json
curl -sS https://authentic-sparkle-production-7f37.up.railway.app/health
```

Observed in this repo:

- A newer GitHub commit does not guarantee Railway has already deployed it.
- Running `railway redeploy --yes` in `backend/` created a new deployment and progressed `BUILDING -> DEPLOYING -> SUCCESS`.
- After `SUCCESS`, `GET /health` returned `{"ok": true}` from the live Railway backend.

If backend code changed and Railway does not appear to be picking it up, the smallest corrective action is:

```bash
cd backend && railway redeploy --yes
```

There is also a helper script that encodes this polling-based deploy loop:

- `repo-b/scripts/production-loop.mjs`

That script detects changed files, redeploys Railway for backend changes, waits for Railway health, and can also deploy Vercel for frontend changes.

---

### Vercel deploy timing in detail

`repo-b` is deployed to Vercel, not Railway.

Typical timing:

- Next.js build + rollout is often ~2-5 min depending on cache warmth and page count

For frontend-affecting changes, a healthy Railway backend is not enough. UI code, Next route handlers in `repo-b/src/app/api/*`, and proxy behavior in `repo-b/src/app/bos/[...path]/route.ts` depend on the Vercel deployment being current.

---

### SQL / schema changes - the most common missed step

Railway does not run migrations automatically. There is no startup hook in `backend/Dockerfile` that applies the SQL bundle.

If your change involved any of the following, you must run `make db:migrate` separately before testing:

- Adding a new table or column
- Adding or changing an index
- Seeding new rows via a `.sql` file
- Enabling the `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector`)
- Any change to a file in `repo-b/db/schema/*.sql`

```bash
make db:migrate
make db:verify
```

If you skip this step, the backend may deploy cleanly while production queries still fail or return empty results.

---

### pgvector specifically

The `rag_chunks` table has a `vector(1536)` column and an HNSW index. Both require the `pgvector` extension to be enabled on the Postgres instance.

The schema SQL (`316_rag_vector_chunks.sql`) conditionally enables the extension. If `vector` is unavailable on the server, semantic search silently degrades toward full-text behavior. If RAG search feels like keyword search, check the extension first.

---

### Testing readiness checklist

Before running manual or automated production tests:

1. GitHub CI has finished if you are waiting on lint/typecheck/unit confirmation.
2. Railway shows `SUCCESS` for `backend/` changes.
3. Vercel deploy is complete for `repo-b/` changes.
4. `GET /health` on the Railway backend returns 200.
5. `GET /bos/health` through the production frontend returns 200 if the flow uses the Vercel proxy.
6. `make db:migrate` has been run if any `.sql` file changed.
7. `make db:verify` passes if schema changed.
8. pgvector is active if the change touches `rag_chunks`, embeddings, or AI gateway indexing.
9. Hard refresh the browser before UI verification because stale JS bundles can mask a fresh deploy.
10. Check platform env vars if the feature worked locally but fails in production.

Most common production env culprits:

- Railway backend: `OPENAI_API_KEY`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`
- Vercel frontend: `BOS_API_ORIGIN`, `NEXT_PUBLIC_BOS_API_BASE_URL`, `NEXT_PUBLIC_DEMO_API_BASE_URL`

---

### Change type -> required waits

| Change type | Wait for GitHub CI | Wait for Vercel deploy | Wait for Railway deploy | Run `db:migrate` |
|---|:---:|:---:|:---:|:---:|
| UI-only (`repo-b` component/style/layout) | Recommended | ✅ | — | — |
| Next route handler in `repo-b/src/app/api/*` | Recommended | ✅ | — | Maybe |
| Backend route/service in `backend/app/*` | Recommended | — | ✅ | Maybe |
| SQL schema in `repo-b/db/schema/*.sql` | Recommended | — | — | ✅ |
| Seed data in SQL bundle | Recommended | — | — | ✅ |
| RAG/indexing/backend AI change | Recommended | — | ✅ | Maybe / often |
| RAG schema/index change | Recommended | — | ✅ | ✅ |
| Vercel env var change | — | ✅ | — | — |
| Railway env var change | — | — | ✅ | — |
| Full-stack feature touching `repo-b` + `backend` | Recommended | ✅ | ✅ | Maybe |

---

### Recommended test order

Use this order unless there is a strong reason not to:

1. Run the smallest local test(s) for the changed surface.
2. If schema changed, run `make db:migrate` then `make db:verify`.
3. Deploy the changed runtime(s): Vercel for `repo-b`, Railway for `backend`.
4. Poll health/status endpoints instead of waiting blind.
5. Run production smoke checks only after health is confirmed.

Useful local commands:

```bash
make test-backend
make test-demo
make test-frontend
make db:verify
```

Useful production checks:

```bash
cd backend && railway service status
cd backend && railway deployment list --json
curl -sS https://authentic-sparkle-production-7f37.up.railway.app/health
curl -sS https://www.paulmalmquist.com/bos/health
```

---

### Important conclusion

The most common reasons a prod fix appears not live are:

1. GitHub CI is running, but no deploy has happened yet.
2. Railway backend has not redeployed yet and needs `railway redeploy --yes`.
3. Vercel frontend is still serving the previous build.
4. Schema changed but `make db:migrate` was not run.
5. The wrong runtime was checked: the issue may be in `repo-b` when the assistant only looked at `backend`, or vice versa.

---

## 13. Backend API Smoke Tests — Mirroring the Frontend UX Journey

### Two test modes in `backend/tests/`

All tests in `backend/tests/` run with a `FakeCursor` — they mock the database layer entirely and do **not** require Postgres. They prove that routes parse correctly and return the right shape, not that the actual seeded data is present and correct.

| Mode | How to run | What it proves |
|---|---|---|
| Unit tests (default) | `make test-backend` or `cd backend && pytest` | Routes, schemas, service logic — no real DB |
| Live endpoint smoke | `pytest backend/tests/ -m smoke -k "live"` or `httpx` against running backend | Real data is present, seed values are correct |

There is no `integration/` directory yet. If you want to add live smoke tests, create `backend/tests/test_ux_smoke.py` and skip the `FakeCursor` fixture — use `requests` or `httpx` against the live backend URL.

---

### Key endpoint groups that mirror the frontend walkthrough

These are the API calls the frontend actually makes during a standard RE/REPE session. Run them in this order to confirm the full stack is healthy after a deploy.

### Production seed IDs — use these, not test UUIDs

All smoke tests should use the real Meridian Capital Management seed data. Do not substitute placeholder or test UUIDs.

| Name | ID |
|---|---|
| Business (Meridian Capital Management) | `a1b2c3d4-0001-0001-0001-000000000001` |
| Environment | `a1b2c3d4-0001-0001-0003-000000000001` |
| Fund (Institutional Growth Fund VII) | `a1b2c3d4-0003-0030-0001-000000000001` |
| Asset (Cascade Multifamily, Aurora CO) | `11689c58-7993-400e-89c9-b3f33e431553` |

---

#### 1. REPE Context bootstrap (required by nearly every page)

```
GET /api/repe/context?env_id={env_id}&business_id={business_id}
```

This is the very first call `repo-b` makes. If it returns empty or 404, every downstream page will show blank data. Check `backend/app/routes/repe.py → /context`.

Note: the context endpoint returns a binding diagnostic, not the full fund/asset list. A `binding_found: false` is normal if env/business aren't explicitly linked — downstream pages still work as long as `business_found: true`.

#### 2. Fund list / portfolio overview

```
GET /api/repe/businesses/{business_id}/funds
```

Route: `backend/app/routes/repe.py`.

Expected: returns at least one fund with `name` = `"Institutional Growth Fund VII"`, `fund_type` = `"closed_end"`, `vintage_year` = `2024`.

#### 3. Fund detail

```
GET /api/repe/funds/{fund_id}
```

Route: `backend/app/routes/repe.py`.

Expected: `"name"` = `"Institutional Growth Fund VII"`, `"target_size"` = `"500000000..."`, `"status"` = `"investing"`.

#### 4. Fund investments list (Investments tab)

```
GET /api/re/v2/funds/{fund_id}/investments
```

Route: `backend/app/routes/re_v2.py`.

Expected: returns at least one investment row with `"name"` containing `"Cascade"`.

#### 5. Asset cockpit data

```
GET /api/repe/assets/{asset_id}           ← identity card (name, address, type, units)
```

Expected for Cascade Multifamily:
```
name        = "Cascade Multifamily"
address     = "14200 E Alameda Ave, Aurora, CO"
units       = 280
asset_type  = "property" / property_type = "multifamily"
occupancy   ≈ 0.9243   (92.4%)
noi         > 0
```

#### 6. Fund investments / JVs (Fund → Investments tab)

```
GET /api/re/v2/funds/{fund_id}/investments
GET /api/re/v2/investments/{investment_id}/jvs
GET /api/re/v2/jvs/{jv_id}/assets?quarter=2026Q1
```

These power the investment rollup table. If JVs return empty, the Investments tab will show no rows even if assets exist.

#### 7. Models list (Models page)

```
GET /api/re/v2/funds/{fund_id}/models
GET /api/re/v2/models
```

Route: `backend/app/routes/re_v2.py`.

Expected: at least one model row seeded — if blank, the Models page is empty.

---

### How to run a live smoke pass manually

Use the real production seed IDs — no placeholders, no test UUIDs.

```bash
export BASE="https://authentic-sparkle-production-7f37.up.railway.app"
export BIZ_ID="a1b2c3d4-0001-0001-0001-000000000001"
export ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
export FUND_ID="a1b2c3d4-0003-0030-0001-000000000001"
export ASSET_ID="11689c58-7993-400e-89c9-b3f33e431553"

# 1. Context binding check
curl -s "$BASE/api/repe/context?env_id=$ENV_ID&business_id=$BIZ_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print('business_found:', d['diagnostics']['business_found'])"

# 2. Fund list
curl -s "$BASE/api/repe/businesses/$BIZ_ID/funds" | python3 -c "import sys,json; d=json.load(sys.stdin); print([f['name'] for f in d])"

# 3. Fund detail
curl -s "$BASE/api/repe/funds/$FUND_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['fund']['name'], d['fund']['status'])"

# 4. Asset identity
curl -s "$BASE/api/repe/assets/$ASSET_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['asset']['name'], '| units:', d['details']['units'], '| occ:', d['details']['occupancy'])"

# 5. Fund investments
curl -s "$BASE/api/re/v2/funds/$FUND_ID/investments" | python3 -c "import sys,json; d=json.load(sys.stdin); print('investments:', len(d) if isinstance(d, list) else d)"
```

All of these should return non-null values with no 404 or 500 before you declare a deploy healthy.

---

### Important conclusion

The `make test-backend` suite does not catch missing seed data or wrong prod env vars — it runs entirely against mocked DB responses. After any deploy that touches seed data, SQL schema, or env vars, run the curl smoke pass above (or a pytest integration suite against the live URL) before calling the deploy done.

---

## 14. Autonomous Deploy-and-Test Workflow

### The contract

When you give a large task, the assistant must complete the **full cycle** without prompting:

1. Make all code and schema changes
2. Run **all** local checks before committing — every single one, no exceptions:
   - `cd repo-b && npx vitest run` — unit tests (catches missing React imports, stale test expectations)
   - `cd repo-b && npx tsc --noEmit` — TypeScript (catches null coalesce, type mismatches)
   - `source backend/.venv/bin/activate && ruff check backend/` — Python lint (catches unused imports, unused variables)
   - If any check fails, fix it before committing. Do not push and hope CI catches it.
3. Commit and push to `main` (triggers Railway backend redeploy + Vercel frontend redeploy automatically)
4. Poll all three deployment targets until each one reaches a healthy state — **never declare done until all services confirm healthy**
5. Run live smoke tests against production endpoints (not localhost, not demo cookies, not mock data)
6. Report the actual production answer or confirm test pass

You should not need to ask for permission between steps or wait for human confirmation mid-task. The only time to pause is if a deploy fails or a smoke test returns an unexpected error — surface that immediately with the actual error and a diagnosis.

---

### No demo/mock anything in the test phase

All connections during testing must be live and real:

- **Auth:** use `bos_session` cookie with a real session, not `demo_lab_session=active` (which is a legacy fallback that bypasses real auth). If the prod endpoint requires a real session, test via a URL that doesn't require it or set up a proper session token.
- **Data:** test against seeded production data, not hardcoded fixture values
- **Backend:** always test against `https://authentic-sparkle-production-7f37.up.railway.app` (BOS backend) and `https://www.paulmalmquist.com` (frontend/Next API routes) — never `localhost` unless the task was explicitly local-only
- **DB:** if schema changed, `make db:migrate` must have run and `make db:verify` must pass before any smoke test

---

### Deployment polling procedure

#### Railway (backend)
```bash
# Poll every 30s until SUCCESS
/opt/homebrew/bin/railway service status --all
```
State sequence: `BUILDING → DEPLOYING → SUCCESS`. Do not proceed until `SUCCESS`.

Confirm the new code is live (not a cached old container):
```bash
curl -s https://authentic-sparkle-production-7f37.up.railway.app/health
```
If the gateway route is involved:
```bash
curl -s https://authentic-sparkle-production-7f37.up.railway.app/api/ai/gateway/health
```

**Confirming Railway deployment lineage (new code, not old container):**

A healthy `/health` response alone does NOT prove the new code is running — the old container also returned 200 before the new one came up. Confirm lineage explicitly:

```bash
# List deployments — the most recent one must show SUCCESS, not REMOVED/BUILDING
railway deployment list --service authentic-sparkle
```

The top entry must be:
- `SUCCESS` — the new build is live
- Timestamped at or after your `railway up` invocation
- The previous entry must show `REMOVED` (replaced by new)

If the top entry is still `BUILDING` or `DEPLOYING`, wait and re-poll. If it shows `FAILED`, check build logs via the URL printed by `railway up --detach`.

#### Vercel (frontend)
Use `mcp__claude_ai_Vercel__get_deployment` with the deployment ID from the latest push. State must be `READY` before testing any Next.js routes or pages.

The production domain aliases:
- `https://www.paulmalmquist.com` (canonical)
- `https://paulmalmquist.com` (redirects to www)

**Confirming Vercel deployment lineage (new code, not previous build):**

A `READY` state alone does not prove it is the new build. Confirm lineage by checking the `meta.githubCommitSha` in the deployment response matches your commit SHA:

```bash
# Get the deployment and verify the commit SHA
# mcp__claude_ai_Vercel__get_deployment idOrUrl=<deployment_id>
# Check: deployment.meta.githubCommitSha == git rev-parse HEAD
# Check: deployment.alias includes "www.paulmalmquist.com" (proves it is production)
```

Both conditions must be true:
1. `meta.githubCommitSha` == the SHA of the commit you pushed
2. `alias` array includes `www.paulmalmquist.com` (confirms it was promoted to production, not just a preview)

#### GitHub Actions CI
```bash
gh run list --repo paulmalmquist/Consulting_app --limit 1
gh run view <run_id>
```
CI must show `completed / success` before treating a merge as stable. If CI fails, fix before deploying.

---

### Env var checklist — things that silently break prod

Before testing, confirm these are set on the right service:

| Var | Service | Required for |
|-----|---------|-------------|
| `OPENAI_API_KEY` | Railway backend + Vercel | AI gateway, Winston answers |
| `DATABASE_URL` / `PG_POOLER_URL` | Railway backend + Vercel | Any DB query |
| `SUPABASE_SERVICE_ROLE_KEY` | Railway backend | Document storage, RAG indexing |
| `SUPABASE_URL` | Railway backend | Supabase Storage |
| `ALLOWED_ORIGINS` | Railway backend | CORS — must include `https://www.paulmalmquist.com` |
| `BOS_API_ORIGIN` | Vercel | Next.js proxy to BOS backend |

Set on Railway: `railway variables set KEY=VALUE --service authentic-sparkle`
Set on Vercel: `echo "value" | npx vercel env add KEY production` then redeploy

### Production credentials

| Credential | Value | Used for |
|---|---|---|
| `ADMIN_INVITE_CODE` | `SWvxEtVPMK_YanlB` | Login to `/admin` on paulmalmquist.com |

---

### Correct test order for a full-stack change

```
1. local unit tests pass (make test-backend, make test-frontend)
2. git commit + push
3. wait: GitHub Actions CI → completed/success
4. wait: Railway backend → SUCCESS + /health 200
5. wait: Vercel → READY
6. if schema changed: make db:migrate && make db:verify
7. curl smoke pass against live backend URL (Section 13 above)
8. curl smoke pass against Vercel Next.js API routes if those changed
9. if AI gateway changed: test Winston question → confirm real answer, not 503/501
10. declare done, report results
```

Steps 3–5 can be polled in parallel. Steps 6–9 must come after all deploys are healthy.

---

### Winston AI gateway smoke test

After any change touching the AI gateway, run this against production:

```bash
curl -sL -X POST "https://www.paulmalmquist.com/api/ai/gateway/ask" \
  -H "Content-Type: application/json" \
  -H "Cookie: bos_session=..." \
  -d '{"message":"How much capital is committed across all funds?"}' \
  --max-time 30
```

Expected: streaming SSE response with non-empty `content` tokens. A 503 means `OPENAI_API_KEY` is missing. A 501 means the backend gateway is disabled. A 404 means the route is missing or the backend hasn't redeployed yet.

---

## 15. Winston Conversation Log Review Protocol

### After every test session, pull and analyze the gateway logs

After testing Winston, fetch the most recent gateway logs and analyze whether the conversations routed and behaved correctly.

```bash
# Pull last 20 requests (replace with your business_id)
curl -s "https://authentic-sparkle-production-7f37.up.railway.app/api/ai/gateway/logs?limit=20" | jq .

# Filter by conversation
curl -s "https://authentic-sparkle-production-7f37.up.railway.app/api/ai/gateway/logs?conversation_id=<uuid>" | jq .

# Or query Supabase directly (use pooler URL — direct host is IPv6 only and unreachable from most local setups)
python3 -c "
import psycopg, json
conn = psycopg.connect('postgresql://postgres.ozboonlsplroialdwuxj:ripsalesforce8084@aws-1-us-east-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor(row_factory=psycopg.rows.dict_row)
cur.execute('SELECT route_lane, route_model, message_preview, tool_call_count, workflow_override, cost_total, elapsed_ms, created_at FROM ai_gateway_logs ORDER BY created_at DESC LIMIT 20')
for r in cur.fetchall(): print(json.dumps(dict(r), default=str))
conn.close()
"
```

### Ask the assistant to analyze the logs for these signals

After pulling the logs, paste them and ask:

> "Analyze these gateway logs. For each request: was the routing lane correct for the message? Did the workflow override fire when it should (or shouldn't) have? Were the right tools called? Were there any fallbacks or errors? What should have happened differently?"

### What to look for per request

| Field | What to check |
|---|---|
| `route_lane` | A = no tools/RAG, B = RAG only, C = tools (write), D = deep reasoning. Does the lane match the question type? |
| `workflow_override` | Should be `true` on slot-fill follow-ups (e.g., "2024 open-end core" after "create a fund called X") |
| `tool_call_count` | Should be > 0 for any create/update/lookup request. 0 on a write request = routing failure |
| `tools_skipped` | `true` means Lane A — verify this was intentional (simple greeting, identity query) |
| `rag_chunks_used` | Should be > 0 for document/property questions. 0 = possible miss |
| `fallback_used` | `true` = primary model failed. Investigate if frequent |
| `cost_total` | Sanity check — a $0.01+ cost on a simple greeting means wrong lane |
| `elapsed_ms` | > 10s on a simple lookup = probable tool loop or slow model |
| `message_preview` | Confirms what was actually sent (useful to catch frontend truncation) |

### Key routing expectations to verify

| Message type | Expected lane | Expected tools | Expected RAG |
|---|---|---|---|
| "hi", "thanks", "who are you" | A | none | none |
| "how many funds do we have" | A or B | none | optional |
| "what is the cap rate for Ashford" | B | optional lookup | yes |
| "create a fund called X" | C | `repe.create_fund` | no |
| "2024 open-end core" (after fund creation) | C (workflow override) | `repe.create_fund` | no |
| "yes" / "go ahead" (confirming action) | C (workflow override) | same tool + confirmed=true | no |
| "analyze our portfolio performance in detail" | D | multiple | yes |

---

## 16. Winston Slot-Fill Amnesia — Debugging Checklist

### Symptom
Winston asks for a parameter that the user already provided in a previous turn. Example: turn 1 provides fund name, turn 2 provides vintage/type/strategy, and Winston says "I need the fund name to proceed."

### Root causes

| Cause | Symptom in logs | Fix |
|---|---|---|
| Tool call failed validation (missing fields) → no PENDING CONFIRMATION annotation written | `wf_override=false` on turn 2; turn 1 tool call shows `success: false` + `"required"` in error | Treat validation-failed tool calls as pending slot-fill in both annotation logic and `_check_pending_workflow()` |
| Workflow detection only checks `success=true AND confirmed=false` | Same as above | Also check `success=false AND "required" in error` |
| Message on turn 2 doesn't match `_WRITE_RE` regex | Turn 2 routed to Lane A/B, `skip_tools=true`, workflow override not applied | Fix workflow detection so it fires regardless of regex match |

### What to check in gateway logs after a slot-fill failure

```bash
# Check the two consecutive turns
curl -s "https://authentic-sparkle-production-7f37.up.railway.app/api/ai/gateway/logs?limit=5" | jq '[.[] | {lane: .route_lane, wf_override: .workflow_override, msg: .message_preview, tools: .tool_calls_json}]'
```

Look for:
1. Turn 1: `route_lane=C`, tool call present with `success: false` and error containing "required" — this is the slot-fill trigger
2. Turn 2: `workflow_override` — must be `true`. If `false`, the pending workflow detection missed the failed call
3. Turn 2: tool args — must include ALL params from turn 1 plus the new ones from turn 2

### Annotation that gets written to conversation history (turn 1)

When a tool call fails due to missing required fields, this annotation is appended to the assistant message:

```
[SYSTEM NOTE: Tool calls this turn: - repe.create_fund(confirmed=N/A) → error: ...
PENDING CONFIRMATION for: repe.create_fund.
Known parameters: repe.create_fund(name="winston real estate I").
The tool call FAILED due to missing required fields. When the user provides the missing values,
you MUST call the tool again with ALL known parameters PLUS the new values.
NEVER re-ask for parameters already listed above.]
```

If this annotation is missing from the stored assistant message, the workflow override on turn 2 will not fire.

### Key files
- `backend/app/services/ai_gateway.py` — `_check_pending_workflow()` (detection) and annotation logic (~line 1024)
- Workflow override fires at ~line 422

---

## 17. Winston AI Gateway Architecture

### Payload contract

Frontend sends to `/api/ai/gateway/ask`:
```json
{"message": "...", "business_id": "uuid-or-null", "env_id": "uuid-or-null", "session_id": "..."}
```

Next.js proxy (`repo-b/src/app/api/ai/gateway/ask/route.ts`) forwards to FastAPI backend with the same shape matching `GatewayAskRequest`. If FastAPI is unreachable, falls back to direct OpenAI (no tools, no RAG).

### SSE event types (FastAPI backend)

| Event | Data shape | Purpose |
|---|---|---|
| `token` | `{"text": "..."}` | Streamed text content |
| `citation` | `{"chunk_id", "doc_id", "score", "snippet"}` | RAG document references |
| `tool_call` | `{"tool_name", "args", "result_preview"}` | MCP tool execution |
| `done` | `{"session_id", "prompt_tokens", "completion_tokens", "tool_calls", "elapsed_ms"}` | Stream complete |
| `error` | `{"message": "..."}` | Error during processing |

### Tool registration

`_register_all_tools()` in `backend/app/mcp/server.py` MUST be called from `backend/app/main.py` at startup. Without this, `_build_openai_tools()` returns an empty list and Winston has zero tools.

### REPE data tools

| Tool | Input | Purpose |
|---|---|---|
| `repe.list_funds` | `business_id` | List all funds for the business |
| `repe.get_fund` | `fund_id` | Fund details + terms |
| `repe.list_deals` | `fund_id` | Deals/investments in a fund |
| `repe.list_assets` | `deal_id` | Assets under a deal |
| `repe.get_asset` | `asset_id` | Asset details (NOI, occupancy, cap rate) |

### System prompt

Portfolio snapshot (fund list with IDs) is injected into the system prompt dynamically when `business_id` is provided. RAG context from `semantic_search()` is also appended. The prompt includes a "NEVER ask for data you can look up" directive.

### Railway deployment

Railway does NOT auto-deploy from git pushes for this project. Deploy manually:
```bash
cd backend && railway up --service authentic-sparkle --detach
```
Must run from `backend/` directory (where Dockerfile lives), not repo root.

### Winston production smoke

When smoke-testing `https://www.paulmalmquist.com/api/ai/gateway/ask`, send a valid `context_envelope` that matches `GatewayAskRequest` exactly:

- `conversation_id` must be a UUID if present
- `ui.visible_data.*` records must use `entity_type` / `entity_id` fields, not ad-hoc keys like `id`
- `ui.selected_entities` must match `AssistantSelectedEntity` and may not include extra keys such as `status`

If the backend rejects the payload with `422`, the Next.js route will fall back to direct OpenAI and the result will look like a generic chatbot response instead of Winston's SSE `context` / `tool_call` / `done` events.

### Workspace templates

When an environment needs a domain-specific operating system, add an explicit `workspace_template_key` instead of overloading `industry_type`. Resolution should follow:

- explicit `workspace_template_key` wins
- otherwise map legacy industry aliases like `pds_command` -> `pds_enterprise`
- use the same resolver in backend services, Next.js environment APIs, fallback environment storage, and frontend open-path routing

This avoids generic shells leaking back into mature environments just because provisioning metadata is old.

### Snapshot-first domain homepages

Executive homepages for real operating systems should read from snapshot-style management payloads, not ad hoc live aggregates or generic activity widgets.

- use fast read-model endpoints like `/api/<domain>/v2/command-center`
- keep homepage panels aligned to management questions, not CRUD modules
- feed AI briefing surfaces from the same snapshots that drive metrics, risk panels, forecast tables, and closeout queues

This keeps the homepage fast, coherent, and domain-specific.

## Dashboard Builder — Grouping Dimensions & Multi-Period Fetch

### group_by Dimensions
Prompts like "NOI over time **by investment**" or "occupancy **per asset**" set `group_by` on widget config. Supported values: `investment`, `asset`, `fund`, `market`, `region`. The backend `_detect_dimensions()` regex extracts these from natural language. The frontend `useWidgetData` hook fetches all entities × all periods in parallel (capped at 5 entities × 8 periods = 40 fetches).

### time_grain
Detected from phrases: "over time" → quarterly, "monthly" → monthly, "annual"/"year-over-year" → annual. Propagated to `time_grain` on trend_line and bar_chart widgets. `generatePriorPeriods()` in `period-utils.ts` generates the period array.

### Auto-KPI Suppression
If exactly 1 detected section AND it's in `{noi_trend, occupancy_trend, dscr_monitoring, pipeline_analysis, geographic_analysis}`, the `kpi_summary` strip is NOT auto-prepended. This prevents "NOI over time" from producing a KPI strip + trend chart when only a trend chart was requested.

### Adaptive Chart Sizing
Single non-kpi widget without `group_by` gets `w=8, x=2` (centered) instead of full width. Multi-entity charts remain full width.

### Widget Types (12 total)
`metric_card`, `metrics_strip`, `trend_line`, `bar_chart`, `waterfall`, `statement_table`, `comparison_table`, `sparkline_grid`, `sensitivity_heat`, `text_block`, `pipeline_bar`, `geographic_map`

### Intent → Widget Map
Hardcoded in `INTENT_WIDGET_MAP` in `dashboard_composer.py`. Maps intents like `"generate_watchlist"` → `["comparison_table", "trend_line"]`. The fallback is section-based composition from `SECTION_REGISTRY` in `layout-archetypes.ts`.

### Spec Round-Trip
1. Generate → spec written to `tmp/dashboard_specs/` as JSON
2. `spec_file` field returned in response, stored in `re_dashboards.spec_file` column
3. View via `/api/re/v2/dashboards/spec/{filename}` (path traversal protected)
4. Re-generate from saved spec file (future)

### Cross-Widget Filter Linking
`DashboardFilterContext` provides `{activeFilters, setFilter, clearFilters}`. Pipeline bar chart emits `deal_status` filter on bar click (toggle). Comparison table shows active filter badge and clear button. Geographic map filter linking is a future enhancement (underlying `DealGeoIntelligencePanel` doesn't expose selection callbacks).

### Table Inference Rules
`TABLE_INFERENCE_RULES` in `dashboard_composer.py` auto-inject companion tables. E.g., pipeline_bar → detail grid, geographic_map → asset table, comparison_table → ranked expandable.

### Free-Form Prompt Parsing (2026-03-12)

The composer now has **two paths**: free-form and archetype.

**Free-form path** (`_try_freeform_widgets`) triggers when the prompt describes specific
charts rather than a full dashboard.  It runs **before** archetype detection.  If it
returns widgets, the archetype path is skipped entirely (no KPI injection, no template
sections).

**Decision tree:**
```
prompt
├── matches ≥2 section phrases? → archetype path (existing behavior)
├── "Dashboard with X, Y, Z" → multi-widget free-form
├── "X and Y side by side" → side-by-side free-form
└── single chart intent? → single-widget free-form
    └── no explicit intent? → archetype path fallback
```

**Chart type detection rules** (ordered by priority):
| Prompt pattern | Widget type | Extra config |
|---|---|---|
| `"scatter plot"` | `trend_line` | fallback message |
| `"heatmap"` | `sensitivity_heat` | |
| `"stacked bar"` | `bar_chart` | `stacked: true` |
| `"line chart"` | `trend_line` | |
| `"bar chart"` | `bar_chart` | |
| `"table"` | `comparison_table` | |
| `"histogram"` / `"distribution"` | `bar_chart` | |
| `"budget vs actual"` / `"actual vs budget"` | `bar_chart` | `comparison: "budget"` |
| `"compare"` / `"comparison"` | `bar_chart` | |
| `"top N"` | `bar_chart` | `limit: N, sort_desc: true` |
| `"ranked by"` / `"sorted by"` | `comparison_table` | `sort_desc: true` |
| `"over time"` / `"trend"` | `trend_line` | `time_grain: "quarterly"` |

**Grouping dimension detection** (`_detect_dimensions`):
- `"by investment"` / `"per investment"` / `"across investments"` / `"each investment"` → `group_by: "investment"`
- Same patterns for: `asset`, `property` (→ asset), `fund`, `market`, `region`
- `"broken down by X"` / `"grouped by X"` → word-mapped to dimension

**Layout adaptation** (`_apply_freeform_layout`):
- 1 widget: centered `w=8` (or `w=12` if grouped/stacked, tables always `w=12`)
- 2 widgets: side-by-side `w=6` each (tables get own row at `w=12`)
- 3+ widgets: grid with charts at `w=6`, tables at `w=12` full-width

**KPI injection reform:** Free-form path NEVER injects KPI strips. Archetype path
preserves existing behavior (auto-prepends `kpi_summary` unless single simple section).

**Intent classifier routing (CRITICAL):** Free-form chart prompts must also trigger
`INTENT_GENERATE_DASHBOARD` in `repe_intent.py` — otherwise the SSE gateway routes
them to the LLM tool path (Lane D, 30-130s) instead of the dashboard fast-path (<200ms).
`_CHART_INTENT_RE` in `repe_intent.py` captures chart keywords (trend, bar chart,
scatter plot, heatmap, table of, compare, top N, etc.) and scores 0.90 for dashboard
intent. When chart keywords are present, the waterfall/radar/LP suppression is skipped
so chart language always wins over coincidental metric matches.

**Deploy-test lesson:** Unit tests for `dashboard_composer.py` pass locally because
they call `compose_dashboard_spec()` directly. But the production SSE endpoint goes
through `classify_repe_intent()` → fast-path gate → `compose_dashboard_spec()`. If
the classifier doesn't route the prompt to `generate_dashboard`, the composer is never
reached. Always test the full SSE path against production after deploying composer changes.

## Browser Automation for Agents (OpenClaw)

OpenClaw ships a built-in Playwright-backed browser tool (`openclaw browser *`).
It was not available to agents until 2026-03-12 because the `coding` tool profile
only includes `group:fs`, `group:runtime`, `group:sessions`, `group:memory`, `image`
— **not** `browser` (which is in `group:ui`).

### Config changes (2026-03-12)

1. **`builder-winston`** — added `"browser"` to `tools.allow` (on top of `coding` profile)
2. **`qa-winston`** — added `"browser"` to `tools.allow`
3. Gateway installed as macOS LaunchAgent (`ai.openclaw.gateway.plist`)

### Which agents can use the browser

| Agent | Browser | Why |
|---|---|---|
| builder-winston | YES | Live-site verification, Meridian flow |
| qa-winston | YES | Regression checks, screenshot verification |
| deploy-winston | NO | Deploy agent shouldn't drive UI |
| dispatcher-winston | NO | Routes only, no direct tool use |
| commander-winston | NO | Orchestrator, delegates to builder |

### Key browser commands (agent or CLI)

```bash
openclaw browser start                    # launch Chrome
openclaw browser open <url>               # open tab
openclaw browser snapshot                 # AI-readable page snapshot (refs)
openclaw browser screenshot               # PNG screenshot
openclaw browser click <ref>              # click element by snapshot ref
openclaw browser type <ref> "text"        # type into input
openclaw browser fill --fields '[...]'    # fill form fields
openclaw browser press Enter              # press key
openclaw browser wait --text "Done"       # wait for text
openclaw browser close                    # close tab
openclaw browser stop                     # quit browser
```

### Meridian live-site flow (browser automation)

```bash
openclaw browser start
openclaw browser open "https://paulmalmquist.com/admin"
openclaw browser snapshot          # find invite code input ref
openclaw browser type <ref> "SWvxEtVPMK_YanlB"
openclaw browser press Enter       # or click submit ref
openclaw browser wait --text "Institutional Demo"
openclaw browser screenshot        # verify admin dashboard
# click Open Institutional Demo, then navigate fund portfolio
```

### Gateway lifecycle

```bash
openclaw gateway start             # start managed service
openclaw gateway stop              # stop managed service
openclaw gateway restart           # restart (picks up config changes)
openclaw gateway health            # RPC health probe
openclaw gateway status            # service + probe status
```

If `gateway stop` says "service not loaded", the gateway was never installed as a
LaunchAgent. Fix: `openclaw gateway install` then `openclaw gateway start`.

If there is an orphaned gateway process (e.g. after a crash), kill it before
reinstalling: `kill $(lsof -ti :18789)`.

The gateway runs in **foreground** when started via `openclaw gateway` in a terminal
(parent PID = a shell). Config changes (openclaw.json edits) are not picked up until
the process restarts. Kill the terminal process, then restart.

### Subagent tool inheritance (CRITICAL)

Per-agent `tools.allow` only applies when that agent is the **primary** agent.
When an agent runs as a **subagent** (spawned via `sessions_spawn`), it inherits
tools from the **global** `tools.allow`, not its own agent config.

Fix: add any tool that subagents must use to the global `tools.allow`:
```json
"tools": {
  "allow": ["browser"]
}
```
Without this, a subagent will get "no nodes with browsing capabilities" even if
the agent definition has `tools.allow: ["browser"]`.

### CLI backend agents cannot call OpenClaw tools (CRITICAL)

Agents with `model: "codex-cli/gpt-5.4"` or `model: "claude-cli/opus-4.6"` are
**text-only**. They run in a subprocess CLI and have NO access to OpenClaw tool APIs
(`browser`, `sessions_spawn`, `sessions_send`, `session_status`, etc.).

For any agent that must spawn subagents or use browser automation, set:
```json
"model": "openai/gpt-5.1-codex"
```

### Telegram binding — bypass dispatcher for direct tool use

Binding Telegram DMs directly to `builder-winston` (instead of `dispatcher-winston`)
avoids the dispatcher-as-router reliability issue. The builder can still spawn
specialists via `sessions_spawn` when needed.

Current binding (2026-03-12): `builder-winston` handles all DMs from account 8672815280.

### Global default model (2026-03-12)

Changed `agents.defaults.model.primary` from `codex-cli/gpt-5.4` to
`openai/gpt-5.1-codex` to prevent `FailoverError: Unknown model: codex-cli/gpt-5.4`
in gateway logs (affected `main` agent and slug generator).

## Dashboard Composer Validation Lessons (2026-03-12)

### Prompt parsing pitfalls discovered

1. **Plural entity detection**: `\binvestment\b` does NOT match "investments" — always use `\binvestments?\b` (with optional `s`). Same for deals, returns, assets, funds.

2. **Time grain ordering matters**: If `_TIME_PATTERNS` checks `\btrend\b` before `\bmonthly\b`, then "asset value trend monthly" gets `time_grain=quarterly` (from "trend") instead of `monthly`. Always check explicit grains (monthly, quarterly, annual) BEFORE generic patterns (trend, over time).

3. **Section phrase collisions**: "watchlist dashboard" triggers both `ARCHETYPE_PHRASES["watchlist"]` AND `SECTION_PHRASES["underperformer_watchlist"]`. When the detected sections are a subset of the archetype's default sections, use the full archetype template — the user asked for a dashboard type, not specific charts.

4. **"across all X" dimension detection**: Regex `\bacross\s+assets\b` fails on "across all assets" because of "all" in between. Use `\bacross\s+(?:all\s+)?assets?\b`.

5. **"X vs Y" comparison detection**: The `_VS_METRICS_RE` regex was defined but never checked in `_parse_single_intent`. "revenue vs expenses by asset" fell through to the archetype path instead of producing a bar_chart.

### Validation test structure

Tests live in `backend/tests/dashboard_validation/`:
- `sql_reference.py` — 24 SQL ground truth queries
- `prompt_pairs.py` — 30 NL prompt → expected spec mappings
- `test_spec_validation.py` — widget type, metrics, group_by, time_grain assertions
- `test_layout_validation.py` — grid bounds, sizing rules, companion tables
- `test_data_reachability.py` — live DB data existence (mark `@pytest.mark.live`)

Run: `make test-dashboard-validation` (no DB needed)
Run with DB: `make test-dashboard-live`

## Winston Copilot Workspace (2026-03-12)

### Canonical assistant block protocol

- The full-screen copilot now treats assistant output as `response_blocks`, not just plain text. Persist them in `ai_messages.response_blocks` and keep per-message trace/status in `ai_messages.message_meta`.
- Supported block types in v1: `markdown_text`, `chart`, `table`, `kpi_group`, `citations`, `tool_activity`, `workflow_result`, `confirmation`, `error`.
- Backend emits `response_block` SSE events during the turn and a final `response_blocks` array in the `done` event. The workspace streams the interim blocks; the command bar remains a text-first wrapper.

### Chart rendering rules

- Reuse the existing chart stack instead of inventing a second one:
  - `TrendLineChart` for line charts
  - `QuarterlyBarChart` for bar / grouped bar / stacked bar
  - `WaterfallChart` for waterfall blocks
- `TrendLineChart` and `QuarterlyBarChart` still expect `quarter` as the x-axis key. The copilot renderer normalizes arbitrary `x_key` values into a `quarter` field before rendering. Do not fork the chart components just for copilot.
- Legacy `structured_result` cards are still emitted for command-bar compatibility. Map them to canonical blocks with `backend/app/services/assistant_blocks.py`; do not teach the workspace to reverse-engineer charts from markdown tables.

### Persistence and follow-up context

- Follow-up prompts like “turn that into a bar chart” depend on `AssistantThreadContext.active_artifact_id` and `artifact_refs`. Build those from recent chart/table/workflow blocks before each send.
- The workspace should reload the authoritative conversation from the backend after each streamed turn. This avoids client/server drift once the gateway persists enriched assistant content, response blocks, and tool metadata.
- “Clear context” means new conversation ID + cleared artifact refs + cleared pending attachments. Do not archive or delete historical conversations automatically.

### File upload path

- Use the generic document APIs: `initUpload` -> signed PUT -> `completeUpload` -> `/api/ai/gateway/index`.
- For copilot uploads, tag with `business_id` + `env_id`; `entity_type` is optional and should be omitted unless the chat is explicitly scoped to a fund/asset/investment detail surface.
- Show attachment chips with explicit status transitions: `uploading` -> `indexing` -> `ready` or `failed`.

### Latency and streaming lessons

- The workspace should create the assistant message immediately and stream tokens into it. Waiting for the final `done` event makes the surface feel broken even when the gateway is healthy.
- Emit a `tool_activity` block whenever a tool finishes. This keeps long analytical or action turns trustworthy without spamming raw tool JSON into the transcript.
- Persisting the conversation must stay after the final `done` event. Slow DB writes should never block the client from receiving the final streamed answer.

### Repeat-offense prevention

- If you add a new fast-path `structured_result`, also add the block mapping in `assistant_blocks.py`; otherwise the full-screen workspace silently loses the inline analytic render.
- If you extend `AssistantContextEnvelope`, update both backend Pydantic schemas and `repo-b/src/lib/commandbar/types.ts` together. The command bar, workspace, and Next proxy all rely on the same shape.
- Keep `askAi()` as a wrapper over the shared streaming client. Do not let the command bar and full-screen workspace drift into separate SSE parsers.

## Fund Operations Surface — Architecture Notes (March 2026)

### Investor / LP Data Model

The investor surface uses existing tables — no new schema was needed:
- `re_partner` — partner profile (name, type, business_id)
- `re_partner_commitment` — per-fund commitment amount + date
- `re_partner_quarter_metrics` — per-partner per-fund quarterly metrics (contributed, distributed, NAV, TVPI, IRR)
- `re_capital_ledger_entry` — append-only capital events (contribution, distribution, fee)

Investor list/detail pages live at `/lab/env/[envId]/re/investors/` (Pattern B — Next.js route handler → Postgres).

### Intent Classification Conventions

When adding new fast-path intents:
1. Add constant in `repe_intent.py` intent families section
2. Add compiled regex pattern (test with real phrases before committing)
3. Add scoring block in `classify_repe_intent()` — base score 0.90 for strong regex match
4. Add suppression rules to prevent collision with similar intents (e.g., `LIST_INVESTORS` vs `LP_SUMMARY`)
5. Add to the analytics_query suppression list so AQ doesn't steal strong matches
6. Import the constant in `ai_gateway.py` `_run_repe_fast_path`
7. Add `elif family ==` block in the fast-path with status → tool call → card build → structured_result → block mapping

### Card Builder Patterns

Card builder functions (`_build_*_card`) return dicts with these standard fields:
- `title`, `subtitle` — display header
- `metrics` — list of `{label, value, delta}` for KPI strip
- `table` — `{columns: string[], rows: dict[]}` for tabular data
- `sections` — list of `{title, content}` for explanatory prose (markdown)
- `parameters` — key-value context info
- `actions` — list of `{label, action, params}` for follow-up buttons

Action types handled by GlobalCommandBar:
- `open_dashboard` / `edit_dashboard` — navigate to dashboard builder
- `navigate` — open a path under `/lab/env/{envId}/re/{path}`
- `create_task` — sends a follow-up prompt to create a task via LLM + `work.create_item`
- `export_csv` — handled by StructuredResultCard directly (client-side CSV generation)
- Default — sends `{action.label} for fund {fund_id}` as a new chat prompt

### MCP Tool Naming

Investor/capital tools follow the `finance.*` namespace:
- `finance.list_investors` — list with commitment totals
- `finance.get_investor_summary` — single partner across funds
- `finance.list_capital_activity` — ledger entries with filters
- `finance.nav_rollforward` — NAV bridge between two quarters

Tools are registered in `backend/app/mcp/tools/repe_investor_tools.py` and loaded via `register_repe_investor_tools()` in `backend/app/mcp/server.py`.

### Regex Gotchas

- Always test regex against the exact phrases users type (e.g., "show me the investors" has "me the" between "show" and "investors")
- Use `(?:me\s+)?(?:the\s+)?(?:all\s+)?` as a flexible filler between verb and noun
- The classifier picks the highest-confidence intent — ties go to the first one scored, so order matters for suppression rules

## Instruction Routing Contract (March 2026)

- `CLAUDE.md` is now the single global markdown router for repo-local prompt behavior. Do not add repo-wide dispatch tables to downstream `agents/*.md`, `skills/*.md`, or prompt docs.
- Routed markdown docs now require the shared YAML front matter contract: `id`, `kind`, `status`, `source_of_truth`, `topic`, `owners`, `intent_tags`, `triggers`, `entrypoint`, `handoff_to`, `when_to_use`, `when_not_to_use`.
- Keep skill-loader fields like `name` and `description` when a skill already uses them; add routing metadata on top instead of replacing them.
- Every routed doc must be listed in `docs/instruction-index.md`. If a new routed markdown file is added and it is not in the index, the validator should fail.
- Run `npm run validate:instructions` after changing routed markdown metadata or the registry.
- Run `npm run test:instructions` after changing routing rules, triggers, or the example fixture set.
- Use `status: archived` plus `entrypoint: false` for legacy prompt docs that must remain in the repo for history but should no longer act like alternate execution entrypoints.

## Reusable REPE Index Page Patterns (Fund Portfolio UX Upgrade, March 2026)

**RepeIndexScaffold + table class constants** — The standard pattern for REPE index/list pages. Import `RepeIndexScaffold`, `reIndexTableShellClass`, `reIndexTableClass`, `reIndexTableHeadRowClass`, `reIndexTableBodyClass`, `reIndexTableRowClass`, `reIndexPrimaryCellClass`, `reIndexSecondaryCellClass`, `reIndexNumericCellClass`, `reIndexActionClass`, `reIndexControlLabelClass`, `reIndexInputClass` from `@/components/repe/RepeIndexScaffold`. This gives consistent table styling, filter bar styling, and page scaffolding across funds, assets, models, and other index pages.

**KpiStrip delta prop** — `KpiStrip` supports a `delta` field on each `KpiDef` with `{ value: ReactNode, tone: "positive" | "negative" | "neutral" }`. Use this for contextual subtext under each metric (e.g., "Across 3 strategies", "Q1 2026"). Use `variant="band"` for the institutional-style horizontal layout with border-b divider.

**STATUS_COLORS map pattern** — For status pills with semantic colors, define a `STATUS_COLORS: Record<string, { bg, text, dot }>` map and reference it in the render. Keeps color logic out of JSX. For statuses without a `bm-*` design token (e.g., "harvesting"), use Tailwind built-in colors like `purple-400`/`purple-500`.

**Sidebar grouped navigation** — REPE navigation now uses `repo-b/src/components/repe/workspace/repeNavigation.ts` as the source of truth for workflow order, icon mapping, and active-route matching. `RepeSidebarNav.tsx` renders the desktop/drawer grouped sidebar, `WinstonShell.tsx` renders the tablet compact rail, and collapse state now persists in `sessionStorage("repe-sidebar-collapsed-groups")` with active groups auto-expanding on route change.

**Column sorting pattern** — For table sorting: `useState<SortColumn | null>(null)` + `useState<SortDir>("desc")`. Toggle via `handleSort(col)` that flips direction on same column, defaults to desc on new column. Sort in a `useMemo` after filtering. Unicode `▲`/`▼` indicators in `<th>` are simpler than importing icon components.

## Reusable REPE Narrative Dashboard Patterns (Fund Detail UX Refresh, March 2026)

**Route-local narrative helpers** — For dense REPE dashboard pages, keep derived presentation logic in a route-local helper module beside the page (for example `overviewNarrative.ts`). Put quarter-merging, exposure weighting, health-summary generation, and hybrid table mapping there so the main route stays readable and the logic can be covered with pure Vitest tests.

**Narrative ordering for institutional dashboards** — Prefer a clear sequence: header + health summary, grouped KPI cards, one hero value-creation chart, then portfolio snapshot, performance drivers, capital activity/exposure, and only then the detailed holdings table. This reads much faster than a flat widget grid.

**Hybrid investment table pattern** — When asset-level return attribution is not available, keep the main table investment-level for IRR/NAV accuracy, but use row expansion to reveal asset-level real estate metrics. Show property type/market/current value in the collapsed row and reserve the expanded row for richer asset columns and hoverable drill-in links.

## REPE Lease Layer Patterns (Asset Leasing UI + DB, March 2026)

**Lease schema lives in `re_*` namespace, not `lease`** — The canonical REPE lease tables (`re_tenant`, `re_lease`, `re_asset_space`, `re_lease_step`, etc., migration 347) are distinct from the generic property-management `lease` table in 220_property.sql. Never mix them. FK refs go to `repe_asset`, not `property`.

**`re_asset_lease_summary_v` is the cockpit KPI source** — This SQL view aggregates active leases per asset and `LATERAL` joins the latest `re_rent_roll_snapshot` for PSF/WALT fields. Use it for summary reads; use raw table joins for rent roll and tenant detail endpoints.

**UNIQUE(asset_id, as_of_date) on `re_rent_roll_snapshot`** — Snapshot inserts use this constraint for idempotency (`ON CONFLICT (asset_id, as_of_date) DO NOTHING`). Always pair `as_of_date` + `quarter` fields; `quarter` is a text column like `'2026Q1'` for grouping.

**WALT computation** — Weighted average lease term = `SUM(SF × max(years_remaining, 0)) / SUM(SF)` over active leases. Use `EXTRACT(EPOCH FROM (expiration_date - CURRENT_DATE)) / (365.25 * 86400)` in SQL. Leases past expiry contribute 0 years, not negative values — use `GREATEST(..., 0)`.

**Below-market threshold** — Flag leases where `base_rent_psf < market_rent_psf * 0.97` (3% buffer prevents flagging leases that are effectively at market). Join lease table with latest snapshot's `market_rent_psf`.

**Mark-to-market column convention** — `mark_to_market_pct` stores the raw ratio (e.g., `0.099` = 9.9% upside). Multiply by 100 for display. A positive value means in-place rent is below market (upside). Store as `numeric(8,4)` for precision.

**Lazy-load leasing tab** — Use a `useRef(false)` guard + `useEffect` on `section === "Leasing"` to fire all 6 lease API calls via `Promise.allSettled` only on first activation. Partial failures degrade gracefully (panel renders with empty data) rather than blocking the whole tab.

**Mock-to-real panel migration pattern** — Add optional `realXxx` props to existing mock-data panels. Compute whether to use real data via `const useReal = realXxx && realXxx.length > 0`. Fall back to mock. This keeps Cockpit working for all non-office assets while enabling real data for leased assets without breaking existing pages.

**Rent roll table sort** — Keep sort state local to the table component (`useState<SortKey>("sf")`). Sort a derived array (`[...rows].sort(...)`) rather than mutating prop arrays. Offer 3 sort keys: SF (descending), PSF (descending), Expiry (ascending). Anchor tenant rows get `border-l-2 border-l-amber-400` for visual call-out.

**Lease type pill labels** — `full_service` → "Full Svc"; `nnn` → "NNN"; `modified_gross` → "Mod. Gross"; `ground` → "Ground". Compact labels prevent overflow in narrow table cells.

**Expiration bucket cap year** — `EXTRACT(year FROM expiration_date) >= capYear` goes into a single `'YYYY+'` bucket. Set `capYear = currentYear + 5`. Use PostgreSQL parameterized `$2` for the cap year and `$3` for the label string to avoid SQL injection.

**Staging table pattern** — `stg_lease_extract` and `stg_rent_roll_extract` store raw extraction output in `jsonb` with common flat fields denormalized for easy querying. No FKs to canonical tables (staging is pre-review). `re_lease_reconciliation_queue` holds human-reviewable discrepancy records. Promote to canonical only after analyst approval.

**Seed deterministic UUIDs for lease entities** — Use a distinct 8-char prefix segment per entity type: `b0010000-*` for tenants, `b0020000-*` for spaces, `b0030000-*` for leases, `c0010000-*` for documents, `d0010000-*` for events, `e0010000-*` for snapshots. This avoids collision with asset UUIDs (prefix `a1b2c3d4-9001-*`) while remaining readable in DB inspection.
