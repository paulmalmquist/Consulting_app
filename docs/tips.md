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

## Analytical Feature + Winston AI Twin Pattern

Every analytical feature in an environment (variance analysis, debt surveillance, portfolio KPIs, etc.) should have both a **direct UI page** and a **Winston AI-assisted version** that share the same backend service. This avoids duplicating business logic and ensures the AI assistant returns the same numbers the page shows.

### The Architecture (5 layers)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. BACKEND SERVICE (single source of truth)                     │
│    e.g. re_debt_surveillance.py, re_variance.py                 │
│    Queries canonical tables, computes metrics, returns raw dict │
├─────────────────────────────────────────────────────────────────┤
│ 2a. DIRECT UI PATH              │ 2b. WINSTON AI PATH           │
│  API route (re_v2.py)           │  MCP tool (repe_analysis_     │
│  → calls service directly       │  tools.py) → calls same svc   │
│  → returns JSON to frontend     │  → returns raw dict            │
├──────────────────────────────────┤                                │
│ 3a. FRONTEND PAGE               │ 3b. CARD BUILDER               │
│  (funds/[fundId]/page.tsx)      │  (ai_gateway.py)               │
│  KPI strip + table + charts     │  _build_<feature>_card()       │
│  from API response fields       │  shapes raw dict → chat card   │
├──────────────────────────────────┤                                │
│ 4a. USER SEES PAGE              │ 4b. USER SEES CHAT CARD        │
│  Navigated directly             │  Asked Winston a question      │
│  Same numbers, same quarter     │  Same numbers, same quarter    │
└─────────────────────────────────────────────────────────────────┘
```

### Build Checklist (adding a new analytical feature)

**Step 1 — Backend service** (the shared truth)
- File: `backend/app/services/re_<feature>.py`
- Reads from canonical `re_asset_quarter_state` or related tables
- Returns a plain dict with raw values (no formatting, no card structure)
- Handles period scoping, hierarchy filtering, NULL-safe math

**Step 2a — API route** (direct UI path)
- File: `backend/app/routes/re_v2.py` or `re_financial_intelligence.py`
- Thin handler that resolves context (env_id, business_id, fund_id) and calls the service
- Returns the raw dict as JSON

**Step 2b — MCP tool** (Winston AI path)
- File: `backend/app/mcp/tools/repe_analysis_tools.py`
- Register a tool: `registry.register(ToolDef(action="finance.<feature>", handler=_handler))`
- Handler calls the SAME backend service as Step 2a
- Returns the raw dict (card building happens in Step 3b)

**Step 3a — Frontend page** (direct UI rendering)
- File: `repo-b/src/app/lab/env/[envId]/re/<feature>/page.tsx`
- Calls the API endpoint from Step 2a via `bos-api.ts`
- Renders KPI strip, tables, charts from response fields

**Step 3b — Card builder** (Winston chat rendering)
- File: `backend/app/services/ai_gateway.py`
- Function: `_build_<feature>_card(result, scenario)` shapes the raw dict into:
  ```python
  {
      "title": "Feature Name",
      "metrics": [...],    # KPI tiles at top of card
      "table": {...},      # Optional detail rows
      "chart": {...},      # Optional visualization
      "actions": [...]     # Drill-down links back to the direct page
  }
  ```
- Emitted as SSE `structured_result` event with `result_type` matching the feature

**Step 4 — Intent classification** (how Winston knows to route here)
- File: `backend/app/services/repe_intent.py`
- Add intent constant: `INTENT_<FEATURE> = "<feature>"`
- Add regex pattern: `_<FEATURE>_RE = re.compile(r"\b(trigger|words|here)\b", re.I)`
- Add scoring block in `classify_repe_intent()` — target confidence ≥ 0.90
- Wire dispatch in `ai_gateway.py::_run_repe_fast_path()`:
  ```python
  elif family == INTENT_<FEATURE>:
      result = await _exec_fast_tool(ctx, "finance.<feature>", params, ...)
      card = _build_<feature>_card(result, scenario)
      yield _sse("structured_result", {"result_type": "<feature>", "card": card})
  ```

### Fast-Path Confidence Gate

Winston's fast-path fires when `classify_repe_intent()` returns confidence ≥ 0.85. Below that threshold, the query falls through to the full LLM pipeline (slower but handles ambiguous requests). When adding a new feature intent:
- Use high-signal trigger words that are unlikely to appear in general conversation
- Set base score to 0.90 for exact matches
- Add suppression rules if your keywords collide with existing intents

### Validation Pairing Rule

When you build the direct UI page, also build the matching intent + card builder so Winston can answer the same question conversationally. When you write tests for the backend service, those tests validate both paths since they share the same code.

### Existing Feature Twins

| Feature | Direct Page | Intent Family | MCP Tool Action | Card Builder |
|---------|-------------|---------------|-----------------|--------------|
| NOI Variance | `variance/page.tsx` | `noi_variance` | `finance.noi_variance` | `_build_variance_card` |
| Dashboard Gen | `dashboards/page.tsx` | `generate_dashboard` | `finance.compose_dashboard` | SSE `dynamic_dashboard` |
| Debt Surveillance | fund detail panels | `debt_surveillance` | `finance.debt_surveillance` | `_build_debt_card` |
| Portfolio KPIs | `re/page.tsx` | `portfolio_summary` | `finance.portfolio_kpis` | `_build_portfolio_card` |

### Key Files

- `backend/app/services/repe_intent.py` — intent families (line ~16) + scoring logic (line ~398)
- `backend/app/services/ai_gateway.py` — fast-path dispatch (~line 761) + card builders
- `backend/app/mcp/tools/repe_analysis_tools.py` — MCP tool registration
- `backend/app/services/dashboard_composer.py` — dashboard generation as worked example

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

## Winston Eval + Surfacing Lessons (2026-04-30)

- Env-scoped Winston evals must run separately per environment (`--environment meridian`, `--environment novendor`) so baselines and regressions do not mix. Do not include environment-less fixtures unless they are explicitly marked global.
- Canonical assistant evals require `runtime_identity`; a good-looking answer from the wrong runtime path is a fail.
- Contract validation must be part of eval scoring, not just Postgres persistence. Missing terminal states, post-terminal events, contract-enforced fallback, empty dashboard shells, and raw ID leakage are hard failures.
- `/lab` can mount the Winston companion provider only with fail-closed context guards. Hide the launcher and refuse conversation boot until env id, business id, and scope agree.
- The managed-agent/operator route must fail visibly. Never fall back from `/api/ai/operator/*` to the gateway path.
- On mobile workspace cards (`repo-b/src/app/app/page.tsx`), treat the title row as `min-w-0` + `truncate` + chip `shrink-0` whenever a badge/chip sits next to a long client name. Without that trio, long names can clip a lifecycle pill into a tiny colored artifact.
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
- Visual Resume environments can have meaningful data in `resume_roles`, `resume_skills`, and `resume_projects` even when the generic `/lab/env/[envId]` shell looks empty. If the page shows blank admin-style KPI cards, check whether the env is `visual_resume` and surface the resume summary/projects/roles instead of relying on generic document/work-item placeholders.
- For binary UI controls like theme mode, prefer a single direct toggle over a trigger-plus-popover. If there are only two states, the extra layer usually adds friction without adding clarity.
- Audit note (2026-03-14): legacy direct-DB Next routes in `repo-b/src/app/api/re/v1/*` and `repo-b/src/app/api/v1/environments/*` should reuse `repo-b/src/lib/server/db.ts` and shared query helpers instead of re-declaring file-local `getPool()` / `resolveBusinessId()` logic.
- Audit note (2026-03-14): Lab/Data Studio pages under `repo-b/src/app/lab/env/[envId]/...` have repeated `API_BASE` + `qs()` + account-bootstrap fetch patterns. New pages in that surface should land on a shared hook/client, not another page-local copy.
- Audit note (2026-03-14): assistant response rendering is now split across both `repo-b/src/components/copilot/` and `repo-b/src/components/winston/`. Before adding a third assistant surface, extract shared response blocks or add mirrored tests so charts/tables/confirmations do not drift silently.
- REPE sidebar UX source of truth now lives in `repo-b/src/components/repe/workspace/repeNavigation.ts`. Desktop grouped nav, tablet compact icon rail, and mobile quick-nav all derive from that config; if you change section order or labels, update that file and `repo-b/src/components/repe/workspace/__tests__/repeNavigation.test.ts` together.
- RE create/list flows are easy to break when the page mixes a legacy direct-DB Next route with the canonical BOS API contract. For models, the durable contract is `env_id` + `primary_fund_id` on `/api/re/v2/models`; validate inline before submit, disable only during the in-flight save, and refetch the list from that same source of truth after success instead of hand-appending a stale payload.
- Winston execution now has a BOS-owned paper-first surface: add new trade/risk/order/control writes under `backend/app/routes/trades.py` + `repo-b/src/lib/bos-api.ts`, not under the legacy direct-DB `repo-b/src/app/api/v1/trading/*` routes. Keep `business_id` as the primary scope, use nullable `env_id` only for lab filtering, and treat live mode as audit-only unless `TRADES_ENABLE_LIVE_SUBMISSION=true`.
- Fund detail exposure on `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx` should come from `/api/re/v2/funds/[fundId]/exposure` backed by `repo-b/src/lib/server/reFundExposure.ts`, not from page-local guesses off `sector_mix` and `primary_market`. The durable rollup uses asset-level `attributable_nav` with fallbacks to `current_value_contribution` and non-disposed `attributable_equity_basis`, and it preserves `Unclassified` / `Unknown` buckets plus coverage metadata instead of collapsing to a false empty state.
- Environment-scoped auth now uses a signed `bm_session` cookie plus explicit environment memberships. Treat `demo_lab_env_id`, `bos_business_id`, and `bm_env_slug` as derived client cache only — route guards and backend authorization should trust `bm_session` + forwarded `x-bm-*` headers, not localStorage.
- Winston conversation creation depends on both clean auth context and the `ai_conversations` schema level. If `/api/ai/gateway/conversations` starts failing after an auth or UI refactor, first confirm the client is sending a real UUID `env_id` instead of a route token or label, then confirm `repo-b/db/schema/424_winston_conversation_metadata.sql` has been applied before backend code tries to write `thread_kind` and `scope_*` fields.
- The four canonical branded auth surfaces are `/novendor`, `/floyorker`, `/resume`, and `/trading` with matching `/login`, `/unauthorized`, `/logout`, and callback routes. If a user is authenticated but lacks membership, the correct fallback is that environment’s unauthorized screen, not a generic login redirect.
- Auth-aware Playwright coverage now lives in `repo-b/tests/environment-auth.spec.ts` and uses `repo-b/playwright.auth.config.ts`. That harness needs a clean production-style build (`rm -rf .next && next build --no-lint && next start`) because `next dev` was unstable for these dynamic auth routes on this machine.
- StonePDS home now treats `/api/pds/v2/command-center` as a richer command-center contract, not just dashboard tiles. Keep `operating_brief`, `alert_filters`, `map_summary`, `intervention_queue`, `insight_panel`, and `pipeline_summary` in sync across `backend/app/schemas/pds_v2.py`, `backend/app/services/pds_enterprise.py`, and `repo-b/src/lib/bos-api.ts` whenever the homepage interaction model changes.
- StonePDS homepage interventions reuse the PDS executive queue instead of a separate action store. Correlation-key dedupe in `backend/app/services/pds_executive/queue.py` is what keeps homepage-generated intervention items idempotent when they do not map cleanly to a project id.
- Stone/PDS demo environments now lazy-seed pipeline deals from `backend/app/services/pds_enterprise.py` when the pipeline is too empty. Keep that seed path idempotent and broad enough to power both the homepage operating brief and the dedicated Pipeline page.
- Databricks Workspace Import API (`POST /api/2.0/workspace/import`): use `format=SOURCE` with base64-encoded content. Set `language=PYTHON` for `.py` files and `language=SQL` for `.sql` files. Workspace paths use `/Users/{email}/...` not `/Workspace/Users/{email}/...` — the `/Workspace` prefix is a UI-only convention, not a valid REST path.
- Databricks Runs Submit API (2.1): `DATABRICKS_CLUSTER_ID` is required for v1 deploy scripts. Guard ephemeral cluster provisioning behind an explicit flag (`DATABRICKS_ALLOW_NEW_CLUSTER=true`) to prevent accidental cluster creation on shared workspaces. A cluster ID and a SQL Warehouse ID are different resources — they cannot be substituted for each other.
- Databricks SQL Statement Execution API (`POST /api/2.0/sql/statements`): requires a SQL Warehouse ID, not a cluster ID. Poll `GET /api/2.0/sql/statements/{statement_id}` until state is `SUCCEEDED`. Rows are in `result.data_array` as a list of lists (all values are strings).
- Databricks `get-output` (`GET /api/2.1/jobs/runs/get-output`): `notebook_output.result` is only populated if the notebook explicitly called `print()`. Structure seeding notebooks to print a row-count report at the end — otherwise the caller sees empty output even on a successful run.
- `hr_*` tables are RLS/`env_id`-exempt by design (ARCHITECTURE.md — single-tenant analytics). Do NOT add `env_id`/`business_id`/RLS to new `hr_*` tables even when a task spec asks; match siblings (`hr_weekly_briefs`, `hr_predictions`) or you create a guardrail conflict and inconsistent isolation across the module. Record the deliberate deviation in the plan for honesty.
- The History Rhymes frontend calls FastAPI directly via `NEXT_PUBLIC_API_BASE` (`repo-b/src/lib/historyrhymes/client.ts`) — there is intentionally no Next.js `/api/hr/*` proxy route. Extend that client with new endpoints; do not add a `proxyToBos` route for HR or you fork the calling convention.
- Markdown-extractor pattern for research→action bridges: deterministic parse against a canonical section/alias map, a module-level degraded result, fail closed with explicit `warnings`, and never fabricate missing sub-fields (leave `None`). Keep "confidence" a simple displayed fraction, not a tunable scorer — unclear structure degrades, it is never "recovered."
- Route tests for a new `app.routes.<x>` module that imports `get_cursor` directly: patch `app.routes.<x>.get_cursor` locally in the test file (reuse `tests.conftest.FakeCursor`) rather than appending to the shared `_GET_CURSOR_TARGETS` list — same result, minimal blast radius. The shared `fake_cursor` fixture only covers `app.services.*` import sites.

## 1. Repo Inventory

### Primary surfaces

| Surface | Directory | Stack | Default port | Main role |
|---|---|---|---:|---|
| Frontend | `repo-b/` | Next.js 14 App Router + TS | `3001` | Main Winston / Business OS UI |
| BOS backend | `backend/` | FastAPI + psycopg | `8000` | Business OS APIs, documents, AI gateway, RE/PDS/etc. |
| Demo Lab compatibility routes | `backend/` | FastAPI + psycopg | `8000` | Canonical `/v1/*` environments, uploads, chat, pipeline, Excel API |
| Excel add-in | `excel-addin/` | React + Webpack | n/a | Talks to backend `/v1/*` APIs |
| SQL schema source | `repo-b/db/schema/` | ordered `.sql` bundle | n/a | Canonical schema/migrations |

### Important conclusion

Do not describe this repo as "a Next app with a Python backend" without clarifying which backend and which API surface.

It is:

1. `repo-b` frontend
2. `backend` Business OS backend
3. `backend` canonical Demo Lab compatibility routes
4. Shared Postgres / Supabase-backed data model
5. Mixed direct-DB and proxied API patterns inside `repo-b`

## 2. Source Of Truth By Concern

| Concern | Source of truth |
|---|---|
| Frontend pages/components | `repo-b/src/app`, `repo-b/src/components` |
| Frontend direct DB route handlers | `repo-b/src/app/api/re/v2/*`, selected `repo-b/src/app/bos/api/*` |
| Business OS API contracts | `backend/app/routes/*`, `backend/app/schemas/*`, `backend/app/services/*` |
| Demo Lab API contracts | `backend/app/routes/lab.py`, `backend/app/services/lab*.py` |
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
4. FastAPI in `backend/` owns both `/api/*` and `/v1/*`
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

If a Demo Lab page works while `/v1/*` is failing, verify that you are hitting the canonical backend rather than a stale browser base URL or local proxy misconfiguration.

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

### Demo Lab compatibility routes (`backend`)

- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS`
- `EXCEL_API_KEY` if Excel flows matter

### Default local ports

- frontend: `3001`
- BOS backend: `8000`
- Canonical backend: `8000`

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
- `ARCHITECTURE.md` is the policy layer that defines approved prefixes, RLS requirements, and migration naming guardrails.

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
3. Treating `/v1/*` as separate from the canonical backend when it now lives in `backend/`
4. Forgetting that RE v2 is largely implemented inside `repo-b/src/app/api/re/v2/*`
5. Forgetting env/business binding requirements
6. Confusing document upload with RAG indexing
7. Targeting `app.document_chunks` when the task is really about `rag_chunks`
8. Forgetting Supabase Storage is part of the document path
9. Assuming production uses localhost-based API origins
10. Changing UI without checking matching tests in `repo-b/tests` and `repo-b/src/components/**/*.test*`
11. Changing backend contracts without checking frontend callers in `bos-api.ts` or `api.ts`
12. Forgetting that `repo-b` can fail because DB env vars are missing even if `backend` is healthy
13. Mistaking stale browser aliases or same-origin proxies for a second live backend
14. Creating new `"use client"` React components without `import React from "react"` — Next.js auto-injects it for production builds but the vitest/jsdom test environment does NOT, causing `ReferenceError: React is not defined` in CI
15. Pushing Python changes without running `ruff check` locally first — CI will catch it but it wastes a deploy cycle
16. Hardcoded `%` in SQL strings passed to psycopg3 `execute()` — must be `%%` to avoid format-string errors (e.g. `LIKE '%%broker%%'`)
17. Calling `emit_log()` with stdlib-`logging` ergonomics. `app/observability/logger.py:emit_log` is **keyword-only** (`def emit_log(*, level, service, action, message, context=None, request=None, duration_ms=None, error=None)`). It does **not** accept `exc_info=` and does **not** accept positional args. Pass exceptions via `error=exc` — `build_error()` auto-captures name/message/traceback into the logged `error` field (logs only, never returned to the client), and `request_id`/`env_id`/`business_id` are auto-enriched from request context. The stdlib `logger` (`logger.warning("...", exc_info=True)`) is fine and unrelated — only `emit_log` has this contract. A positional/`exc_info=` `emit_log` call inside an `except` block raises `TypeError` and masks the original failure. (Found + fixed at `backend/app/routes/consulting.py:2449`, 2026-05-19.)
18. A committed/merged fix is **not** a live fix. Backend production runs on **Railway** (`authentic-sparkle`, deploys from `main` via `cd backend && railway up --service authentic-sparkle`); repo-b/novendor.ai Vercel also does **not** auto-deploy on push. After merging a backend fix you MUST `railway up` from `main`, then production-smoke the real endpoint and tail `railway logs` to confirm parity. Verify the fix commit is an ancestor of `origin/main` (`git merge-base --is-ancestor <sha> origin/main`) before claiming production is fixed. `main` is **unprotected** and its CI is frequently already red for pre-existing repo-wide reasons (repo-wide `ruff check app tests` F401s in unrelated test files; Repo Guardrails `1000` duplicate-prefix because `10000_/10001_` schema filenames both match the `^(\d{4})` regex) — these don't block merge and aren't introduced by a small unrelated PR. Fix only what your change touched, backlog the rest, don't chase repo-wide lint debt into scope creep. Use `git worktree add` for unrelated branch work (lint PR, rebase, deploy) so a dirty primary working tree is never disturbed. (Learned shipping `consulting.py` emit_log fix, 2026-05-19: the fix was correct but invisible in prod for an hour because the PR was open, not merged+deployed.)
19. `crm_opportunity` has **no `stage`/`status`-as-stage column for the pipeline stage**. Pipeline stage is a FK: `crm_opportunity.crm_pipeline_stage_id → crm_pipeline_stage(crm_pipeline_stage_id)`, and the stage identity is `crm_pipeline_stage.key` (stable machine key, e.g. `'proposal'`, `'qualified'`, `'closed_won'`) with a human `label` (e.g. `'Proposal'`). `crm_opportunity.status` is a *separate* lifecycle field with CHECK `('open','won','lost','on_hold')` — do not conflate it with stage. To filter "deals in stage X": `JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id WHERE lower(s.key) = 'x'`. Use an inner join when stage is required (an opportunity with NULL `crm_pipeline_stage_id` cannot be "in" a stage — inner join correctly excludes it and preserves fail-closed zero-result behavior). Verified against canonical `repo-b/db/schema/260_crm_native.sql` + live Supabase. (Bug: `execution_auto.py` filtered `lower(o.stage)='proposal'` against a non-existent column, 2026-05-19, Ticket 2B.)
20. A fresh `git worktree` has **no `node_modules`** — `npm run typecheck` / `npx --no-install tsc` will *silently no-op* and report success without checking anything. Do **not** claim local typecheck passed from a fresh worktree. Either `npm ci` in the worktree (slow, heavy) or explicitly defer to the CI **Frontend Lint + Typecheck + Unit** gate and say so; for type-additive/optional changes, manual review + green CI is acceptable. Always sanity-check `test -d node_modules` before trusting a JS toolchain command in a worktree. (Learned Ticket 4, 2026-05-19.)
21. Extending a board/list response: add new columns to the service SELECT **and** the Pydantic response model as `Optional`/`= None`, plus the matching optional TS type field — Pydantic silently drops dict keys absent from the model, so a SELECT-only change won't reach the client; and a non-optional new field breaks existing rows that lack it. LEFT JOIN reference tables for labels so unknown/NULL keys resolve to NULL (honest empty state) instead of dropping rows. This keeps the response purely additive and backward-compatible (existing clients ignore extra fields). (Pattern: Ticket 4 hierarchy fields on `cro_execution_task` board, 2026-05-19.)

## 8. Pre-Flight Checklist Before Prompting A Coding Assistant

Ask the assistant to confirm all of these before making changes:

1. Which app is in scope: `repo-b`, `backend`, or `excel-addin`?
2. Is the user flow using `bosFetch`, `apiFetch`, or a direct browser fetch to a Next route?
3. Is the endpoint implemented in `backend/app/routes/*` or `repo-b/src/app/api/*`?
4. Does the route talk to Postgres directly, or proxy to FastAPI?
5. Which IDs are required: `env_id`, `business_id`, `fund_id`, `asset_id`, `document_id`, etc.?
6. Does the feature require auth/session cookies?
7. Does the DB schema already contain the required tables/columns?
8. If documents are involved, is the task about storage metadata, extracted text, or vector retrieval?
9. If AI/RAG is involved, is the canonical table `rag_chunks` or a demo KB table?
10. Which test suite must pass: `backend` pytest, `repo-b` vitest, Playwright, Excel smoke, or DB verify?

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

## 10. Color System Governance (Design Pass Lessons)

When doing a color correction pass on this dashboard:

- **Prefer CSS variable references over hardcoded rgba for app-shell surfaces.** Two styling systems coexist: `bm-*` semantic tokens and hardcoded `rgba(15,23,42,0.82)` inline gradients (slate-900 territory). The hardcoded values drift from token values when themes change. Always use `dark:bg-bm-surface/[0.92]` over `dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),...)]` for surfaces that belong to the app shell.

- **Electric blue at full saturation (74% S) reads as interactive UI signal, not brand.** Using it for active nav borders and icons competes with data. Reducing to ~52% S keeps the selected state clearly visible while reducing visual noise. Change `--accent` in both `:root` and `html[data-theme="light"]` simultaneously — both share the same variable.

- **Deal lifecycle stages are sequence states, not severity levels.** Using a 8-hue rainbow (teal, purple, yellow, orange, blue, gray, green, red) for pipeline stages adds noise without semantic meaning. Map them to 3–4 existing semantic tokens: `bm-muted` (sourced), `bm-accent` (active evaluation), `bm-warning` (caution stages), `bm-success` (closed), `bm-danger` (dead). The palette stays narrow and meaningful.

- **"Low" severity colored blue reads as interactive, not informational.** In `RiskIndicatorsPanel`, `bg-blue-500/10 text-blue-600` for low risk signals "click me" rather than "minor note." Use `bm-muted / bm-border` for low-severity items to keep the accent color exclusively interactive.

- **`briefing-colors.ts` is the right place to centralize dark-mode surface tokens for the asset cockpit.** All cockpit panels import `BRIEFING_CONTAINER` and `BRIEFING_CARD` from this file. Fixing the two constants there propagates to 14 files automatically — no need to touch individual panels.

## 11. Fast Sanity Commands

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

This repo is a multi-surface monorepo where `repo-b` is the UI, `backend` is the canonical API for both `/api/*` and `/v1/*`, `repo-b` still owns some direct-to-Postgres route handlers, and the current canonical vector store is `rag_chunks`, not the older demo KB chunk tables.

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

Expected: streaming SSE response with non-empty `content` tokens. A 503 with `reason: "backend_unreachable"` means the FastAPI backend is down. A 503 with `reason: "backend_error"` means the backend returned a server error. A 401 with `reason: "unauthorized"` means the session is invalid. All error responses include a `runtime` object for diagnostics.

### Winston AI runtime: fail-closed policy (March 2026)

The Winston frontend AI gateway (`repo-b/src/app/api/ai/gateway/ask/route.ts`) enforces a **fail-closed** policy:

- The backend FastAPI AI Gateway is the **only** valid runtime for user-facing Winston chat.
- If the backend is unavailable, broken, or unauthorized, the route returns a structured JSON error — it does **NOT** silently fall back to a direct OpenAI call.
- Direct OpenAI fallback was removed because it strips tools, RAG, and changes product semantics without the user knowing.
- The frontend (`assistantApi.ts`) no longer parses OpenAI-format SSE tokens (`choices[].delta.content`). If such tokens appear, they are logged as `rejected_openai_token` and ignored.
- Empty SSE streams (no tokens, no response blocks, no structured results) are treated as unavailable, not as "No response from Winston."
- The consistent user-facing message for all failure modes is: **"Winston is not available right now."**
- All error responses include a `runtime` object: `{ backend_gateway_reached, canonical_runtime, degraded, tools_enabled, rag_enabled }`.
- Regression tests cover: backend 503, backend unreachable, 401 unauthorized, OpenAI-format token rejection, empty stream, successful canonical path, and fetch exception.

**Key files:**

- `repo-b/src/app/api/ai/gateway/ask/route.ts` — gateway proxy (no fallback)
- `repo-b/src/lib/commandbar/assistantApi.ts` — SSE parser + fail-closed client
- `repo-b/src/components/winston/WinstonChatWorkspace.tsx` — unavailable UX state
- `repo-b/src/lib/commandbar/assistantApi.test.ts` — 7 fail-closed regression tests
- `backend/app/services/ai_gateway.py` — canonical backend emits `runtime` in done trace

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

## Prompt-to-Skill Normalization (March 2026)

- Prefer a skill wrapper over a loose prompt file when both exist. Keep the long prompt as reference context, not as the first execution entrypoint.
- The prompt shape that keeps working in this repo is: owning surface, current state, missing state, exact files, ordered phases, verification, and explicit non-goals.
- The prompt shape that keeps needing correction is: "fix everything", mixed architecture plus implementation plus deploy in one pass, or any doc that skips data/seed/entity-resolution details.
- Root bootstrap markdown (`BOOTSTRAP.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `SOUL.md`, `HEARTBEAT.md`) now maps to `skills/winston-session-bootstrap/SKILL.md`.
- `META_PROMPT_CHAT_WORKSPACE.md` now maps to `skills/winston-chat-workspace/SKILL.md`.
- `prompts/dashboard-composition-engine.md`, `prompts/composition-engine-v2.md`, `prompts/llm-intent-data-validation-query-transparency.md`, and `prompts/fix-dashboard-entity-ids.md` now map to `skills/winston-dashboard-composition/SKILL.md`.
- `docs/WINSTON_AGENTIC_PROMPT.md` now maps to `skills/winston-agentic-build/SKILL.md`.
- `docs/WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md`, `docs/plans/CLAUDE_CODE_FIX_ALL_AUDIT_ISSUES.md`, and the archived fix/meta prompts now map to `skills/winston-remediation-playbook/SKILL.md`.
- `docs/WINSTON_DOCUMENT_ASSET_CREATION_PROMPT.md` now maps to `skills/winston-document-pipeline/SKILL.md`.
- `docs/WINSTON_LATENCY_OPTIMIZATION_PROMPT.md` and `docs/WINSTON_RERANKING_AND_MODEL_DISPATCH_PROMPT.md` now map to `skills/winston-performance-architecture/SKILL.md`.
- `docs/WINSTON_CREDIT_DECISIONING_PROMPT.md` plus `.skills/credit-decisioning/SKILL.md` now map to `skills/winston-credit-environment/SKILL.md`.
- `PDS_META_PROMPTS.md`, `PDS_report.md`, `PDS_EXECUTIVE_GAP_ANALYSIS.md`, and `PDS_P0_DEPLOYMENT_RUNBOOK.md` now map to `skills/winston-pds-delivery/SKILL.md`.
- When creating a new prompt in this repo, start from the latest corrective doc in the lineage, not the oldest aspirational prompt.

## Consumer Credit Decisioning Environment (March 2026)

The credit decisioning environment is the second domain surface after REPE. It implements three architectural layers not present in REPE: (1) Deny-by-Default Walled Garden, (2) Chain-of-Thought Orchestration, (3) Format Locks.

**Key files:**
- Schema: `repo-b/db/schema/274_credit_core.sql` (origination), `275_credit_object_model.sql` (portfolio/loan/borrower), `277_credit_workflow.sql` (corpus/policy/decision/audit)
- Backend routes: `backend/app/routes/credit.py` (v1 origination), `backend/app/routes/credit_v2.py` (v2 consumer credit — 26 endpoints at `/api/credit/v2`)
- Service: `backend/app/services/credit_decisioning.py` — core engine with `evaluate_loan()`, corpus ops, format lock validation, seeder
- MCP tools: `backend/app/mcp/tools/credit_tools.py` (18 tools: 12 read + 6 write), schemas at `backend/app/mcp/schemas/credit_tools.py`
- Frontend: 8 pages under `repo-b/src/app/lab/env/[envId]/credit/` (hub, portfolio detail, loan detail, decisions, exceptions, corpus, policies, audit)
- AI behavior contract: `.skills/credit-decisioning/SKILL.md`
- System prompt: `_CREDIT_DOMAIN_BLOCK` in `backend/app/services/ai_gateway.py`

**Data model hierarchy:** Business → Environment → Portfolio → Loan → Loan Event. Borrowers linked to loans. Policies per portfolio. Decision logs are immutable (no UPDATE, no updated_at).

**MCP tool pattern:** Same as REPE — two-phase writes (`confirmed=false/true`), scope resolution via `_scope_value()`, environment/business auto-resolved from context.

**Request routing:** `_CREDIT_WRITE_RE` and `_CREDIT_POLICY_RE` patterns in `request_router.py` route credit queries to Lane C with `temperature=0.0` (deterministic decisioning).

**Seeder:** `POST /api/credit/v2/seed` creates 4 corpus documents, 1 portfolio, 10 borrowers, 10 loans, decision policy, runs evaluate on all loans, creates scenarios.

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

## Scenario Modeling Engine v2

### Architecture

The scenario system has three layers: **canonical data** (repe_asset, re_loan, schedules — never mutated), **scenario overrides** (re_scenario_overrides with flexible key-value JSON), and **scenario results** (structured output tables: scenario_asset_cashflows, scenario_fund_cashflows, scenario_return_metrics, scenario_waterfall_results).

### directFetch vs bosFetch

Scenario CRUD reads (`listScenarioAssets`, `listAvailableAssets`, `listScenarioOverrides`) must use `bosFetch`, not `directFetch`. The `/api/re/v2/model-scenarios/*` routes only exist on the FastAPI backend. `directFetch` hits Next.js at `window.location.origin` and silently 404s — the reads return empty arrays while writes (which use `bosFetch`) succeed. This was the root cause of the "empty selected assets" bug.

### Override Key System

The AssetModelingDrawer defines 73 override keys across 6 categories (Operating, Expenses, Capital, Debt, Exit, Overrides). These are stored as key-value pairs in `re_scenario_overrides(scenario_id, scope_type, scope_id, key, value_json)`. The v2 engine maps all 73 keys into a typed `AssetAssumptions` dataclass. When adding new override fields: (1) add to the `OverrideField[]` array in `AssetModelingDrawer.tsx`, (2) add to `AssetAssumptions` in `re_scenario_types.py`, (3) wire in `_resolve_assumptions()` in `re_scenario_engine_v2.py`.

### Execution Pipeline (8 steps)

1. Resolve assumptions (base + overrides merged)
2. Project operations (revenue, expenses, NOI with compound growth)
3. Model debt (IO vs amortizing, refi handling)
4. Model exit (terminal NOI / cap rate, disposition costs)
5. Compute levered cashflows (NOI - capex - debt service + exit)
6. Translate to fund share (ownership % applied)
7. Waterfall (placeholder — future integration with finance_repe)
8. Return metrics (IRR via numpy polynomial roots, MOIC, DPI, RVPI, TVPI)

### IRR Computation

numpy's `np.irr` was removed in numpy 1.20+. The v2 engine uses `np.roots()` on the cashflow polynomial, filters for real positive roots, and converts `1/root - 1` to quarterly rates, then annualizes. Always check for sign changes in the cashflow series before attempting IRR.

### Live Preview

The `POST /model-scenarios/{id}/preview-asset/{assetId}` endpoint runs steps 1-5 only (no persist, no waterfall, no fund rollup). The `useAssetPreview` hook debounces at 800ms. The preview fires on draft changes and on saved override count changes, so the right panel stays current whether the user is editing or after they save.

### Seed Data Convention

Scenario seed UUIDs: `a0000001-*` for funds, `b0000001-*` for deals, `c0000001-*` for assets, `d0000001-*` for models, `e0000001-*` for scenarios. All seed inserts use `ON CONFLICT DO NOTHING` for idempotency.

### Comparison

The v2 comparison reads from structured output tables (not JSONB blobs), computes deltas on IRR/MOIC/DPI/RVPI/TVPI/NAV, and includes by-asset attribution showing NOI and equity CF deltas per asset. The first selected scenario is always the base reference.

## Institutional Scenario UX Patterns

### Baseline-vs-Override Display

Every editable assumption field shows three values: base (placeholder), scenario (current input), and delta (computed inline). Use the `placeholder` from the field catalog as the base value. When a field is modified, show a `MODIFIED` badge and a base/scenario/delta strip below the input in 9px text. Color deltas green for positive, red for negative. Unmodified fields render in subdued border/background; modified fields get `border-blue-500/40 bg-blue-500/5`. This lets analysts scan instantly for what changed.

The "Show Modified Only" toggle filters all sections to only display fields with overrides or drafts. This is critical for scenarios with 73+ fields — analysts shouldn't scroll through 6 sections looking for the 3 things they changed.

Per-field reset (X button) and per-section reset ("Reset" in section header) must both work alongside the global "Reset All" in the footer. The per-field reset calls `deleteScenarioOverride` for saved overrides and removes the draft entry.

### Workbench Layout

The Asset Modeling Drawer uses `max-w-7xl` with a two-column layout: left column for assumptions (scrollable), right column for live consequences (sticky). The right column is 340px fixed width with `overflow-y-auto` and `sticky top-0` for the content container.

Assumptions are organized in collapsible sections (not tabs). Sections have a header with chevron, label, modified count badge, and section-level reset. This is more scannable than tabs because you can see multiple sections and their modification state simultaneously.

### Valuation Bridge

The valuation bridge shows a waterfall from Base Value through NOI Change, Cap Rate Impact, Capex Change, Debt/Refi Change to Scenario Value. Base and total rows get `bg-bm-surface/20 font-medium`; delta rows get conditional green/red coloring. This appears in both the live preview panel (asset level) and the comparison drilldown (driver level).

### Multi-Level Comparison Drilldown

The comparison panel implements a 3-level drill: Fund Summary → Asset Attribution → Driver Bridge. State is tracked with `drillLevel` (fund/asset/driver) and `drillAssetId`. A breadcrumb shows the current drill path with clickable levels. The "Back" button navigates up one level.

Level A (Fund): Table of return metric deltas (IRR, MOIC, DPI, RVPI, TVPI, NAV) with base/scenario/delta columns. Drill prompt at bottom leads to Level B.

Level B (Asset): Table with per-asset NOI and equity CF comparisons. Each row is clickable to drill to Level C. Includes a bar chart with positive/negative coloring per asset.

Level C (Driver): Bridge decomposition of the equity cashflow delta for a single asset: NOI Change, Cap Rate Impact, Timing/Sale, Capex Change, Debt/Refi. Summary cards show base vs scenario values.

### Visual Language

- Blue for interaction/modified state (not amber — amber reads as warning, blue reads as analytical selection)
- Emerald for positive deltas, red for negative deltas
- `text-[9px]` for metadata, `text-[10px]` for labels, `text-xs` for values
- `tabular-nums` on all numeric cells
- `tracking-[0.1em]` on uppercase section labels
- Borders at `/30` to `/50` opacity — never full opacity
- `bg-bm-surface/5` to `/10` for card backgrounds — deeper than `/20` looks like startup cards
- No emoji, no decorative icons except functional ones (chevrons, X, play)

### Scenario Header Actions

The scenario header strip shows: name, type (dot + label), created date, asset count, override count, modified asset count. Actions on the right: Run (primary accent button), Clone (border button), Compare (border button). Run navigates to results tab on success. Clone creates a copy and switches to it.

---

## Cross-Domain Bridge Pattern (Development ↔ REPE)

### Bridge Architecture
When connecting two independent domains (e.g., PDS projects → REPE assets), use a dedicated bridge table (`dev_project_asset_link`) rather than adding FKs to existing tables. This keeps both domains clean and the bridge disposable.

### Bridge Service Rules
- Bridge service reads from both domains but **writes only to bridge tables** (dev_*, not re_* or pds_*)
- Calculated outputs (yield_on_cost, stabilized_value, IRR, MOIC) live in the bridge assumption set, not in the asset quarter state
- Use `_recalculate_outputs()` on every assumption update — never let derived fields go stale
- For IRR approximation: `(stabilized_value / TDC) ^ (1 / years) - 1` is acceptable for display; use XIRR with cashflow stream for precision

### Seed Data Coherence
- Use `uuid5(namespace, descriptive_name)` for deterministic, idempotent seed IDs
- Every seed function must use `ON CONFLICT DO NOTHING` for re-runnability
- Construction budgets must add up: `hard + soft + contingency + financing = total_development_cost`
- Cap rates must be in 4.5–6.5% range, IRRs in 8–18%, construction loans at 70–80% LTC
- Draw schedules should use bell-curve distribution (not uniform) — front/back are lighter

### Cross-Domain Query Pattern
When JOINing across domains (dev_project_asset_link → pds_analytics_projects → repe_asset → repe_deal → repe_fund → re_fund_quarter_state), always use LEFT JOINs and handle nulls gracefully. Missing quarter state should return `data_status: "no_quarter_state"`, not 500.

### Navigation Extension Pattern
To add a new section to REPE sidebar: import icon from lucide-react, add item to the appropriate nav group in `buildRepeNavGroups()`, create page at `/app/lab/env/[envId]/re/{section}/page.tsx`. The RepeWorkspaceShell auto-detects new routes.

### System Integration Checklist for New Domains
When adding a new domain that bridges existing ones, check these integration points:
1. **Accounting**: Does this produce financial events that should post to GL?
2. **AI/Winston**: Should the copilot be able to query this data? Add intent patterns.
3. **Documents**: Will documents link to these entities? Use entity_link pattern.
4. **Tasks**: Should events trigger task creation? Define event → task rules.
5. **Compliance**: Are mutations auditable? Call `emit_log()` on writes.
6. **Reporting**: Should this data appear in dashboards? Add widget archetypes.
7. **Scenarios**: Can this data feed scenario overrides? Map fields to re_model_override keys.
8. **Excel**: Should users edit this in Excel? Ensure BM_PULL/BM_PUSH work against the tables.
9. **MCP**: Should Winston automate workflows? Register tools in the MCP registry.

---

## Executive Command Surface Design (PDS Redesign Lessons)

When converting a data-heavy dashboard into an executive decision surface:

### Color severity must be earned, not default
- **Critical (red)**: Reserve for genuinely critical items. If >30% of cards are red, nothing is critical.
- **Warning (amber/orange)**: The default severity for items needing attention.
- **Neutral (gray/dim border)**: The default for all non-problem states.
- Never use colored background fills for KPI cards. Use neutral backgrounds with a left accent stripe to communicate tone. The value itself should dominate — not the card's background color.

### Layout hierarchy maps to decision sequence
The order of sections must match how a leader scans a page:
1. **What's wrong right now?** (Top issues strip — 3-5 bullets max)
2. **How are we performing?** (KPI diagnostics — neutral cards, small variance indicators)
3. **Where specifically?** (Market table — sortable, worst-first, subtle row highlights)
4. **Who do I talk to?** (Action center — name + issue + impact + suggested action)
5. **Deep context** (AI briefing, forecast, client health — below the fold)

### The "action card" format
Resource/staffing cards become decision-ready when they contain four fields:
- **Name**: Who
- **Issue**: What's wrong (e.g., "Low utilization (43%) + 2 delinquent timecards")
- **Impact**: Why it matters (e.g., "CI miss risk")
- **Action**: What to do (e.g., "Review allocation")

Without the impact and action fields, a resource card is just data — not a decision surface.

### Signal strips should be compact, not chatty
- Remove "all clear" signals (green checkmarks). Leaders scan for problems, not confirmations.
- Collapse similar items (e.g., 6 delinquent timecards across 3 resources → one line).
- Use terse labels: "3 markets below plan" not "⚠ 3 markets are currently below revenue plan".
- No background fill — border-only pills at ~11px font keep the strip visually subordinate.

### The `toneClasses()` pattern
A shared function that maps tone → CSS classes is the right architecture, but it must default to neutral:
```
danger  → neutral bg + red accent stripe (not red bg)
warn    → neutral bg + orange accent stripe
positive → neutral bg + green accent stripe
default → neutral bg + gold accent stripe
```
The previous version used `bg-pds-signalRed/10` for danger, creating a wall of red cards when multiple KPIs were below plan.

## WinstonShell Layout System (Sidebar + Content Grid)

### Sidebar width is set in one place
`WinstonShell.tsx` defines the desktop sidebar width via CSS Grid column templates:
```
xl:grid-cols-[288px_minmax(0,1fr)]           // without rail
xl:grid-cols-[288px_minmax(0,1fr)_280px]     // with rail
```
`RepeSidebarNav.tsx` has no width — it inherits from the grid column. To change sidebar width, only edit the grid template values in WinstonShell.

### Content centering within CSS Grid cells
To constrain main content width without breaking the grid:
```
<main className="... xl:max-w-[1320px] xl:mx-auto">
```
The `xl:` prefix keeps mobile/tablet full-width. The `mx-auto` centers within the `minmax(0,1fr)` cell. This only visually activates when the viewport is wide enough that the grid cell exceeds 1320px (roughly 1920px+ viewport).

### Workspace name text handling
Use `line-clamp-2 leading-snug` instead of `truncate` for primary identity labels (workspace name). This allows 2-line wrapping with ellipsis only at line 2, keeping the name readable. Reserve `truncate` for nav item labels where single-line clip is acceptable.

### Responsive breakpoint ownership
- Mobile (<768px): single column, drawer sidebar (`w-72`), bottom nav
- Tablet (768-1279px): compact icon rail (`76px`), no right rail
- Desktop (>=1280px): full sidebar (`288px`), optional right rail (`280px`), content max-width

## Environment Immersive Layout Mode

### Problem: "App inside a card inside an admin shell"
When an environment page (e.g. Trading Lab) renders inside the standard `AppShell` + `LabEnvironmentShell` layout, the environment's themed surface gets boxed inside multiple layers of padding, borders, and light backgrounds. This creates a "website inside a website" effect that breaks immersion.

### Root cause layers
1. `AppShell.tsx` → `<main className="flex-1 p-6">` adds padding around all child content
2. `LabEnvironmentShell.tsx` → wraps children in a `grid gap-4 lg:grid-cols-[240px,1fr]` with a sidebar, rounded borders, and `space-y-4`
3. The parent `<div className="min-h-screen bg-bm-bg">` in AppShell provides a light background that shows through padding gaps

### Solution pattern: two escape hatches
1. **`LabEnvironmentShell.tsx` → `isDomainRoute` regex**: Add the route segment (e.g. `markets`) to the domain route regex so the page bypasses the department tab bar and sidebar grid entirely, rendering `{children}` directly.
2. **`AppShell.tsx` → `isImmersiveRoute` check**: Detect immersive environment routes and strip `p-6` from the `<main>` element so the environment background reaches edge-to-edge. Keep sidebar and header for navigation, but let the environment own the workspace canvas.

### Implementation checklist for new immersive environments
- Add route segment to `isDomainRoute` regex in `LabEnvironmentShell.tsx` (line ~167)
- Add route segment to `isImmersiveRoute` regex in `AppShell.tsx` (line ~32)
- Environment page root: use `flex-1 flex flex-col min-h-full` instead of `min-h-screen`
- Environment page manages its own padding internally (`p-6` inside its own sections)
- Status/error notices: use intentional banner components, not bare text

### Key principle
The shell should **frame** the environment, not **compete** with it. From the right edge of the sidebar onward, the entire canvas should belong to the environment's theme.

## Fund Footprint Map (Geographic Lifecycle Map, March 2026)

### Pattern: Fund-scoped Leaflet map with lifecycle status toggle

The fund overview page now includes a full-width geographic map between the Value Creation chart and Performance Drivers, showing owned/pipeline/disposed assets for the current fund.

### Key implementation decisions

1. **Reuse existing Leaflet stack** — React-Leaflet + OpenStreetMap tiles are already installed and battle-tested in `PortfolioAssetMapInner`. The fund map follows the same `dynamic(() => import(...), { ssr: false })` pattern for SSR safety.

2. **Three-state marker differentiation** — Owned (solid emerald fill), Pipeline (outlined amber, transparent fill), Disposed (muted slate at 20% fill opacity + 70% overall opacity). This lets all three states coexist visually in the "All" view without confusion.

3. **Fund-scoped API query** — The `/api/re/v2/funds/asset-map` route now accepts an optional `fund_id` param. When present, the SQL adds `AND f.fund_id = $N::uuid`. The route also LEFT JOINs `re_asset_realization` for disposed metadata (sale_date, proceeds).

4. **Status classification order matters** — The CASE expression checks `exited`/`written_off` BEFORE pipeline/deal-stage checks. An exited asset should never show as "owned" even if the deal stage is "operating".

5. **Component handles its own data fetching** — `FundFootprintMap` calls `getAssetMapPoints` internally on mount, keeping the parent OverviewTab clean. This matches the pattern of other self-fetching cards on the fund page.

### Files involved
- `repo-b/src/app/api/re/v2/funds/asset-map/route.ts` — API route (fund_id filter + disposed + realization join)
- `repo-b/src/lib/bos-api.ts` — `AssetMapPoint`, `AssetMapSummary`, `getAssetMapPoints` types
- `repo-b/src/components/repe/fund/FundFootprintMap.tsx` — Wrapper (toggle, summary, loading states)
- `repo-b/src/components/repe/fund/FundFootprintMapInner.tsx` — Leaflet map (3-state markers, rich popups)
- `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx` — Integration into OverviewTab

### Gotcha: Leaflet icon fix
Every Leaflet inner component must include the icon URL fix block (importing marker-icon.png, marker-icon-2x.png, shadowUrl and calling `L.Icon.Default.mergeOptions`). Without this, Next.js bundling breaks the default marker paths and markers render as broken images.

## Fund-Level Scenario Workspace (Phase 1 — 2026-03-24)

### Architecture decision: sibling route, not replacement
The fund-level scenario workspace lives at `models/[modelId]/fund-scenario/` as a sibling to the existing `models/[modelId]/` page. This avoids breaking the existing asset-level modeler while introducing the new fund-first entry point. Models with a `primary_fund_id` route to `fund-scenario` by default; the old page is preserved as "Asset Modeler" via secondary action.

### Key reuse: `computeFundBaseScenario()` already does everything
`repo-b/src/lib/server/reBaseScenario.ts` exports `computeFundBaseScenario()` which returns a `FundBaseScenarioResult` containing: summary (IRR, TVPI, DPI, RVPI, NAV, LP/GP allocations, fees, carry), waterfall (tier breakdown, partner allocations), assets[] (per-asset contribution with attributable NAV/NOI/proceeds), bridge (value creation waterfall data), and value_composition. The API endpoint is `GET /api/re/v2/funds/{fundId}/base-scenario`. No new backend computation was needed for Phase 1.

### Type import gotcha: `ModelScenario` has two definitions
- `repo-b/src/components/repe/model/types.ts` has `ModelScenario` with `description: string | null`
- `repo-b/src/lib/bos-api.ts` has `ModelScenario` with `description?: string`
- The `ScenarioSidebar` and bos-api functions use the bos-api version. Always import from `bos-api.ts` for consistency.

### `cloneModelScenario()` requires two args
`cloneModelScenario(scenarioId, newName)` — the second param is the new name, not optional. Always provide it.

### Files created
- `repo-b/src/components/repe/fund-scenario/types.ts` — shared workspace types
- `repo-b/src/components/repe/fund-scenario/useFundScenario.ts` — hook managing model, scenarios, base scenario state
- `repo-b/src/components/repe/fund-scenario/FundScenarioHeader.tsx` — header with quarter picker, status, actions
- `repo-b/src/components/repe/fund-scenario/FundMetricsBand.tsx` — 6-card strip (Gross IRR, Net IRR, TVPI, DPI, RVPI, NAV) with delta vs base
- `repo-b/src/components/repe/fund-scenario/WaterfallSummaryBand.tsx` — LP/GP waterfall tier bar + table
- `repo-b/src/components/repe/fund-scenario/AssetContributionTable.tsx` — sortable asset attribution table
- `repo-b/src/components/repe/fund-scenario/FundScenarioTabBar.tsx` — 10-tab bar (Overview enabled, rest scaffolded)
- `repo-b/src/components/repe/fund-scenario/OverviewTab.tsx` — composes metrics + waterfall + bridge + asset table
- `repo-b/src/app/lab/env/[envId]/re/models/[modelId]/fund-scenario/page.tsx` — main workspace page

### Formatting: use canonical `format-utils.ts`
All formatting uses `@/lib/format-utils` (`fmtPct`, `fmtMoney`, `fmtMultiple`). Do not create inline formatters in new components.

## Revenue Operating Program (2026-03-26)

The repo now has a full revenue operating program at `docs/REVENUE_OPERATING_PROGRAM.md`. Key things for coding assistants to know:

### Revenue Context Matters for Coding Priorities

- Demo friction that blocks REPE or PDS sales conversations is **higher priority than feature work**
- The `docs/revenue-ops/demo-friction-log.md` and `docs/revenue-ops/objection-log.md` files feed directly into coding session priorities
- Thursday's demo-objection-cycle task identifies what to fix; Friday's review scores the week
- Always check `docs/revenue-ops/product-backlog-feed.md` — it contains revenue-driven feature requests

### CRM Is Enterprise-Grade — Don't Rebuild It

The Consulting Revenue OS is already built across 6+ backend services:
- `crm.py` — accounts, opportunities, pipeline stages, activities, stage history
- `cro_leads.py` — lead creation with scoring (ai_maturity, pain_category, lead_score, qualification_tier)
- `cro_engagements.py` — engagement tracking with budget/margin
- `cro_proposals.py` — proposal CRUD with version history, margin calc, acceptance flow
- `cro_outreach.py` — templates, outreach logging, reply tracking, analytics
- `cro_strategic_outreach.py` — long-horizon relationship campaigns

Tables include: `crm_account`, `crm_opportunity`, `crm_pipeline_stage`, `crm_opportunity_stage_history`, `crm_activity`, `crm_contact`, `cro_lead_profile`, `cro_engagement`, `cro_proposal`, `cro_outreach_template`, `cro_outreach_log`, `cro_strategic_outreach`.

### Autonomous Task Reliability Protocol

All autonomous tasks now follow `docs/AUTONOMOUS_RELIABILITY_PROTOCOL.md`. The 6 protocols are:
1. **Refusal Protocol** — write `UNCERTAIN:` or `CANNOT COMPLETE:` instead of guessing
2. **Confidence Scoring** — `[HIGH]` / `[MEDIUM]` / `[LOW]` on every factual claim
3. **Source Attribution** — cite file path, URL, or `[UNSOURCED]` for every key claim
4. **Assumption Audit** — list assumptions before starting work
5. **Hard Constraints** — never invent stats, never skip verification, never rebuild existing capabilities
6. **Self-Critique Pass** — re-read output as hostile reviewer, flag and fix issues

Every task output should have: `## Assumptions` section at top, source citations inline, `## Self-Critique` section at bottom.

### Revenue-Ops Directory Structure

```
docs/revenue-ops/              — Weekly pipeline reviews, outreach logs, scoreboard
docs/proof-assets/             — Ranked proof-asset backlog
  offer-sheets/                — 1-page offer PDFs
  roi/                         — ROI calculators and framing
  workflows/                   — Before/after workflow diagrams
  proposal-templates/          — Reusable proposal sections
  demo-scripts/                — Click-by-click demo walkthroughs
  diagnostics/                 — Diagnostic questionnaires and sample outputs
  competitive/                 — Competitive positioning docs
docs/REVENUE_OPERATING_PROGRAM.md  — Master revenue program (11 sections)
docs/AUTONOMOUS_RELIABILITY_PROTOCOL.md — Reliability rules for all tasks
```

### Pipeline Stage Configuration

The default stages in `crm.py` map to the revenue-backwards framework:
- `target` (0.05) → `outreach` (0.10) → `qualified` (0.20) → `discovery` (0.35) → `proposal` (0.50) → `negotiation` (0.70) → `closed_won` (1.00) / `closed_lost` (0.00)

### Offer Architecture

Three packaged offers exist in the revenue program:
1. **AI Operations Diagnostic** — $7,500, 5 days, targets COOs/VPs Ops
2. **Workflow Automation Sprint** — $15,000, 2 weeks, targets department heads with process pain
3. **Winston REPE Pilot** — $35,000, 90 days, targets REPE funds $500M-$5B AUM

Plus: Workshop ($200-500/seat), Fractional CAIO ($5-10K/mo retainer)

### Weekly Revenue Rhythm

- Monday: Pipeline review + target discovery
- Tuesday: Proof asset building
- Wednesday: Outbound push + follow-ups
- Thursday: Demo fixes + objection handling
- Friday: Revenue review + reprioritization

Coding sessions should align: revenue-blocking demo fixes before feature work.

## Winston MCP Platform (2026-03-26)

Winston is now an MCP platform — any AI interface can operate Winston's backend through MCP tools.

### Architecture

- **Stdio transport** (existing): `backend/app/mcp/server.py` — for Claude Code / Codex CLI
- **HTTP transport** (new): `backend/app/mcp/http_transport.py` — for Claude Desktop, ChatGPT, web apps
- **REST proxy** (new): `POST /mcp/tools/{tool_name}` — simpler REST for ChatGPT function calling
- **Tool discovery**: `GET /mcp/tools` — lists all 80+ tools with JSON schemas
- **Module discovery**: `GET /mcp/modules` — lists tool modules with counts
- **Health check**: `GET /mcp/health` — no auth required

### CRM MCP Tools (21 new tools)

Registered as module `crm` in the MCP registry:
- `crm.list_accounts`, `crm.create_account`, `crm.get_account`
- `crm.list_pipeline_stages`, `crm.list_opportunities`, `crm.create_opportunity`, `crm.move_opportunity_stage`
- `crm.list_activities`, `crm.create_activity`
- `crm.create_lead`, `crm.list_leads`
- `crm.create_proposal`, `crm.list_proposals`, `crm.send_proposal`
- `crm.list_outreach_templates`, `crm.create_outreach_template`, `crm.log_outreach`, `crm.record_reply`
- `crm.create_engagement`, `crm.list_engagements`
- `crm.pipeline_scoreboard` — live revenue metrics

### Key Files

- `backend/app/mcp/schemas/crm_tools.py` — Pydantic schemas for CRM tools
- `backend/app/mcp/tools/crm_tools.py` — CRM tool handlers + registration
- `backend/app/mcp/http_transport.py` — HTTP transport with MCP + REST endpoints
- `docs/WINSTON_MCP_PLATFORM.md` — Full architecture doc with client integration patterns

### Important: `crm_activity` uses `payload_json`

The `crm_activity` table has no `body` column. Use `payload_json` (jsonb) to store activity content:
```python
payload = json.dumps({"body": body_text})
# INSERT ... payload_json = %s::jsonb
```
The MCP tool handlers extract body from `payload_json.body` for the API response.

### Auth for HTTP transport

All `/mcp/*` endpoints require `Authorization: Bearer <MCP_API_TOKEN>` header.
Write operations require `ENABLE_MCP_WRITES=true` server-side.
Write tools use two-phase: `confirm: false` = dry run, `confirm: true` = execute.

### Adding new MCP tools

Follow the existing pattern:
1. Schema in `backend/app/mcp/schemas/{module}_tools.py` (Pydantic, `extra: "forbid"`)
2. Handlers in `backend/app/mcp/tools/{module}_tools.py` (signature: `(ctx: McpContext, inp: Schema) -> dict`)
3. Registration function: `register_{module}_tools()` called from `server.py._register_all_tools()`
4. Every handler returns a dict. Write tools need `confirm: bool` field in schema.

## Winston Companion (2026-03-26)

- The persistent Winston companion is mounted globally from `repo-b/src/components/Providers.tsx` through `WinstonCompanionProvider` and `GlobalCommandBar` is now just a compatibility wrapper around the shared companion surface.
- `repo-b/public/winstonpic.png` is Winston’s canonical avatar. Use `repo-b/src/components/winston-companion/WinstonAvatar.tsx` for Winston-branded launcher or nav affordances instead of generic sparkles when the UI is explicitly Winston-entry UI.
- Canonical full-page Winston workspace is `/lab/env/[envId]/copilot`. Keep `/lab/env/[envId]/re/winston` as an alias/redirect only, and use `/app/winston` for the business/global fallback workspace.
- The shared companion uses dual lanes: `contextual` threads stay pinned to entity/environment/business scope metadata, while `general` threads stay business/global. Conversation metadata relies on `thread_kind`, `scope_type`, `scope_id`, `scope_label`, `launch_source`, `context_summary`, and `last_route`.
- Preserve the `winston-prefill-prompt` browser event and the `global-commandbar-toggle` test id. Existing pages dispatch that event to open the shared Winston drawer with a seeded prompt.
- When adding or refactoring high-context pages, publish both environment and page context through `appContextBridge` so Winston can ground itself correctly. Important surfaces now covered include RE models, RE development, PDS home, and consulting home.
- Convergence note (2026-03-28): `backend/app/routes/lab.py` is now the canonical owner for Demo Lab `/v1/*` business logic. New lab behavior belongs in `backend/`, while `repo-b/src/app/v1/[...path]/route.ts` and `repo-b/src/app/api/v1/*` should stay proxy-only.
- Convergence note (2026-03-28): `repo-b/src/app/api/re/v1/*` now proxies to the BOS backend. Do not reintroduce direct-DB stubs or fake bootstrap/context responses in that surface.
- Guardrail note (2026-03-28): run `node scripts/check_repo_guardrails.mjs` before landing repo-shape changes. It freezes today’s known schema-duplication, page-local API-base, `globalThis`, and direct-DB route debt so we stop adding more.
- Resume workspace note (2026-03-29): Zustand v5 selectors in `repo-b/src/components/resume/**` must not return fresh objects without `useShallow` or equivalent stable selection. The `/lab/env/[envId]/resume` route can otherwise hit `getSnapshot should be cached`, then `Maximum update depth exceeded`, and blank-screen in client render.
- Resume workspace note (2026-03-29): `WinstonCompanionProvider` and `contextEnvelope` need a deterministic first-render route context for env pages before layering browser-only state. If SSR and first client render disagree on `/lab/env/[envId]/resume`, `ContextCard` can hydrate with mismatched copy and crash the route.
- Resume narrative note (2026-03-29): the public visual-resume timeline now has three explicit phase bands only: `JLL (2014-08-01 -> 2018-01-31)`, `Kayne Anderson (2018-02-01 -> 2025-03-31)`, and `JLL (2025-04-01 -> present)`. Treat Winston/Novendor as overlay milestones and KPI anchors, not a fourth employer band.
- Resume narrative note (2026-03-29): `backend/app/services/resume.py::seed_demo_workspace()` now backfills the narrative-engine tables even when the legacy resume roles already exist. Do not reintroduce the old early return or older environments will miss phases, capability layers, accomplishment cards, and metric anchors.
- Resume narrative note (2026-03-29): `repo-b/src/components/resume/ResumeWorkspace.tsx` must hydrate URL state before syncing it back to the router. If the sync effect runs first, deep links like `?view=impact&metric=properties_integrated` get overwritten back to the default `career` view.

- Auth entry note (2026-03-29): The shared auth shell and root Winston entry now use the local Mandalore font from `repo-b/src/app/fonts/mandalore/` via `repo-b/src/lib/brandFonts.ts`. Keep auth entry language framed as environment resolution (system -> context -> workspace), not a product switcher. Prefer `Environment` / `Control Tower` labels over `Enter product` copy on platform-auth surfaces.
- Environment registry note (2026-03-29): Meridian Capital Management and Stone PDS are now canonical top-level auth environments alongside Novendor, Floyorker, Resume, and Trading. Keep the slug registry, middleware top-level matcher, branded environment catalog, bootstrap-admin membership list, and canonical environment seed migrations in sync whenever adding or promoting another environment.

## Mobile Sweep (2026-03-29)

- Mobile work in `repo-b` should keep desktop as the source of truth. Prefer mobile-only branches or viewport-conditional rendering over shared breakpoint simplifications that dilute desktop density.
- Shared mobile shell source of truth now lives in `repo-b/src/components/repe/workspace/WinstonShell.tsx` and `repo-b/src/components/repe/workspace/MobileBottomNav.tsx`. Consulting, PDS, and generic domain shells now project from that vocabulary instead of inventing ad hoc mobile chrome.
- Bottom-nav config currently lives next to the owning shell: RE in `repo-b/src/components/repe/workspace/MobileBottomNav.tsx` / `repeNavigation.ts`, consulting in `repo-b/src/components/consulting/ConsultingWorkspaceShell.tsx`, PDS in `repo-b/src/components/pds-enterprise/PdsEnterpriseShell.tsx`.
- Resume mobile rail/assistant must be conditionally rendered by viewport, not just hidden with CSS. Rendering both mobile and desktop assistant branches at once creates duplicate DOM targets and breaks existing Playwright assertions.
- Heavy dashboard/analytics surfaces should use viewport-aware conditional rendering on mobile when they have desktop-only rails or many offscreen panels. Current examples: RE dashboard widget config rail and lower PDS analytic panels.
- Placeholder command pages for domain modules now use `repo-b/src/components/domain/DomainPreviewState.tsx` and PDS preview pages use `repo-b/src/components/pds-enterprise/PdsPlaceholderPage.tsx`. Reuse those instead of adding more `Full functionality coming soon` cards.
- Targeted mobile Playwright coverage added in `repo-b/tests/app-public-mobile.spec.ts` and `repo-b/tests/resume-workspace.spec.ts`. Run with:
  `BOS_API_ORIGIN=http://127.0.0.1:8000 NEXT_PUBLIC_BOS_API_BASE_URL=http://127.0.0.1:8000 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 DEMO_API_ORIGIN=http://127.0.0.1:8000 DEMO_API_BASE_URL=http://127.0.0.1:8000 NEXT_PUBLIC_DEMO_API_BASE_URL=http://127.0.0.1:8000 npx playwright test tests/app-public-mobile.spec.ts tests/admin-environments-layout.spec.ts tests/resume-workspace.spec.ts --project=chromium`
- Control Tower Playwright specs are intentionally skipped under the current bypass-auth harness because the local harness resolves `/lab/system/control-tower` back through `/app`. Re-enable once a stable admin-session harness exists.
- Local webkit/iPhone Playwright coverage is currently blocked on missing browser binaries. Install with `npx playwright install` before expecting the `webkit` project to run.

## Logo / Wordmark Typography

- The Mandalore display font has decorative fills on A and O glyphs that don't match the brand. These are overridden at the CSS `@font-face` level using `unicode-range` so every `.font-command` element gets clean A/O automatically — no per-component spans needed.
- The O override uses system sans-serif (Inter → Helvetica Neue → Arial) via `local()`. The A override uses a self-hosted woff2 with a custom-drawn thin glyph (hairline Didot-inspired, ~400 bytes).
- Three A variants live in `repo-b/src/app/fonts/logo-a/`: v1-geometric (ultra-thin sans), v2-hairline (Didot-inspired serif, active), v3-condensed (narrow light sans). Swap by changing the `src` line in the `MandaloreA Override` @font-face in `globals.css`.
- The `@font-face` unicode-range approach is zero-JS, zero-CLS, and automatically applies to any text using `.font-command` without touching component code. Prefer this over span-wrapping individual letters.
- When refining individual logo glyphs, keep font files tiny (subset to only the characters you need). A single-glyph woff2 is ~400 bytes — no performance concern.
- If the O and A treatments feel imbalanced after a change, the O is system sans-serif (Inter) and can be swapped to a custom woff2 the same way. Keep the two @font-face declarations separate so they can evolve independently.

## Authenticated Home / Workspace Launcher UX (Mobile-First)

- **Font discipline rule:** Reserve `font-command` (Mandalore) exclusively for wordmark/branding moments (the "Winston" `<h1>`). All operational text — environment names, card titles, labels, dropdown values, descriptions — must use the standard body font (`font-semibold` or `font-medium` as appropriate). Applying display fonts to operational content reads as a developer dashboard, not a product.
- **Internal ID rule:** `env_id`, `schema_name`, and `env_slug` must never appear in rendered JSX. Route silently with internal identifiers; render only `client_name` and human-readable `industry`/`industry_type` (via `humanIndustry()`). Verify by grepping for `schema_name` and `env_` in JSX expressions before committing.
- **Direct-launch pattern:** Workspace/environment cards should call `openEnvironment(env_id, slug)` on tap directly. Never split the interaction into select + secondary button. If the auto-launch effect (single-env shortcut in `useEffect`) already handles the one-env case, the multi-env case should still be one tap per card.
- **AccountMenu reusability:** Isolated sign-out buttons (`logoutPlatformSession()`) should be replaced with the reusable `AccountMenu` component (`repo-b/src/components/AccountMenu.tsx`). The component bundles theme toggle (Light/Dark), Settings placeholder, and Sign out in a single account avatar dropdown. Import it anywhere a sign-out or account action is needed.
- **AccountMenu implementation pattern:** Use a `containerRef` + `document mousedown` listener for outside-click close. Add a `document keydown → Escape` listener for keyboard close. Both listeners go in the same `useEffect` cleanup pair. The trigger is a circular button with `aria-expanded` and `aria-label="Account menu"`. The panel uses `role="menu"` with `role="menuitem"` on each item.
- **Mobile tap targets:** Interactive cards should have minimum `py-4` padding. Add `active:scale-[0.98]` to all tappable cards for tactile press feedback. Disabled states should use `pointer-events-none opacity-70` rather than the native `disabled` attribute on non-button elements.
- **"Authenticated Home" label is a debug artifact:** Any sticky header label that reads like an internal state name (e.g., "Authenticated Home", "Admin Mode", "Dev Env") should be removed before shipping. The signed-in state is self-evident from the content shown.
- **Env card glow + border pattern:** The `environmentTone()` helper returns a raw RGB triple (e.g. `"148, 163, 184"`) for use in `rgba(...)` expressions. Apply it to `borderColor` and `boxShadow` inline styles on cards. This gives each workspace a subtle visual identity without hardcoding colors per environment.

## Multi-Entity Operator Template (2026-04-07)

- When adding a new top-level environment workspace, wire the template in three places together: frontend `workspaceTemplateRegistry`, backend `resolve_workspace_template_key()`, and the environment open-path resolver tests. If one lags, auth can resolve the environment correctly but still launch the wrong surface.
- For demo environments, keep one canonical seed fixture and derive the backend read model, UI totals, drilldowns, and Winston page context from that same fixture. This avoids the classic "numbers drift across pages" failure mode.
- On cross-entity finance pages, label `weighted margin` explicitly when it is derived from consolidated revenue and expense. If you also show an average of entity margins, label it separately so CFO views do not reconcile incorrectly.
- Keep vendor consolidation and close tracking inside the main operator workspace when standalone vendor/workflow surfaces are still preview stubs. It preserves one clear narrative instead of forcing the user through half-built side routes.
- Publish the operator snapshot into assistant page context on the executive and project-detail surfaces. Winston is materially more grounded when the page already hands it the same project, vendor, blocker, and metric facts the user is seeing.
- The existing extraction pipeline becomes reusable across new business document types once the schema is added in `extraction_profiles.py` and `_store_fields()` flattens fields generically instead of assuming one legacy document shape.

## Environment Blueprint (v2) — Lessons Learned

- **Coexist, don't replace.** The v2 create pipeline lives alongside the legacy `/v1/environments` path. Existing canonical envs (novendor, floyorker, resume, trading, meridian, stone-pds) are intentionally not migrated. Trying to retrofit them into a new manifest model was the first scope I cut; the second was right. Reference patterns > conformance.
- **v1.environments FK mirror is non-optional.** Pipeline stages (`v1.pipeline_stages`) key off `v1.environments(env_id)`, not `app.environments`. Any new env-creation path that needs pipeline/document/card seeding must mirror into `v1.environments` the same way `lab._sync_v1_environment` does, or the seed pack FKs fail silently.
- **Structured columns first, JSON second.** `manifest_json` is overflow-only with an allowlisted key set (`custom_copy`, `feature_flags`, `onboarding_checklist`, `integration_handles`). Routing, auth, template, and lifecycle all get real columns. Enforcing this at the schema layer would require a trigger; enforcing at the Pydantic layer gives a clearer error message earlier.
- **Keep seed packs tiny.** `internal_ops_minimal`, `client_delivery_starter`, `repe_starter`, `trading_research_starter`, `empty`. Each writes a small pipeline-stage set and stops. "Realistic enterprise data" is a separate project that layers on top. Resist the urge to build big fixtures during a blueprint pass.
- **Authoritative state lockdown applies to REPE seed packs.** The REPE starter pack must NOT write `re_authoritative_snapshots`. Released periods must always flow through the snapshot service. Document this in the pack's module docstring so the next person who extends it knows.
- **Idempotency via slug lookup.** `POST /v2/environments` with an existing slug returns the existing env with a `create_rows: skipped` stage. Don't treat duplicate-slug as an error; treat it as a no-op that still runs health check.
- **Dry-run returns a full pipeline preview before touching the DB.** This is the cheapest safety net for a forward-looking creator. Every example manifest in `docs/examples/environment-manifests/` ships with `dry_run: true` on purpose.
- **Template cache TTL matters.** `environment_templates_v2.list_templates()` caches for 5 minutes. Calling `invalidate_cache()` after a template seed migration is the fast path; otherwise the next deploy picks it up. Don't skip the TTL or every create hits the DB unnecessarily.
- **Next sequential schema file matters.** At time of writing, 513 was the last non-9xxx migration. Always check `ls repo-b/db/schema/ | sort -n | tail` before picking a number — the plan file had 460 but the correct number was 514.

## NCF environment scaffold — lessons (2026-04-15)

- **JSX text does NOT interpret `\uXXXX` escapes.** Escape sequences like `\u2014` work inside JavaScript/TypeScript string literals but render literally as `\u2014` when placed directly in JSX children or JSX-attribute-quoted strings. Use the HTML entity (`&mdash;`, `&rarr;`) or move the string into a curly-braced JS expression: `note={"... \u2014 ..."}`.
- **Adding a new env = 4 registry edits, not 1.** `SUPPORTED_ENVIRONMENT_SLUGS`, `environmentCatalog`, and the `environmentHomePath` switch in `repo-b/src/lib/environmentAuth.ts`; the `TOP_LEVEL_ENV_RE` regex + `matcher` paths in `repo-b/src/middleware.ts`; the default-membership slug array in `repo-b/src/lib/server/platformAuth.ts`. Missing any one silently disables part of the login/selector flow.
- **`reporting_lens` is better as a column than a tag.** If a domain has multiple legitimate reporting views (financial / operational / impact, audited / managerial, GAAP / IFRS), make the lens a NOT NULL FK column on every fact table from day one. Retrofitting later requires backfilling every row and every metric definition — painful. A tiny `*_reporting_lens` reference table costs almost nothing and makes lens-aware queries trivial.
- **Fixture-shaped executive pages de-risk the demo.** A client-ready executive view that reads from a typed fixture file (not live DB) still gives you real KPI cards, a drill drawer, and provenance — and the shape of the response matches what the future `ncf_metric` table will return. Wiring data later is a fetch-replacement, not a rewrite. This is the right posture when the underlying data isn't ready but the sales story is.
- **Environment `env_id` is a uuid FK, not a text slug.** New `*_env_isolation` RLS policies should cast via `NULLIF(current_setting('app.env_id', true), '')::uuid`, matching the established PDS/REPE pattern in `513_pds_data_health.sql`. The CLAUDE.md DB rule phrasing ("env_id TEXT NOT NULL") describes an older compat layer — the actual foreign-key column in new tables is uuid.
- **Env home = one route segment per slug.** `environmentHomePath` maps a slug to `/lab/env/{envId}/{deptKey}`. Spec language like "/app/ncf/home" is almost always shorthand for the canonical `/lab/env/{envId}/{slug}/*` pattern; verify before planning a new top-level shell.
- **"Not available in current context" beats fake data.** A small reusable empty-state component with status chip + lens chip + "contact admin to enable" is more credible than lorem ipsum or mocked charts. Use it wherever a page is scaffolded but unwired.

## Winston Audit Session — 2026-04-15 (Tier 1 execution loops)

- **McpContext is a silent SSE killer and a silent HTTP 500 generator.** The dataclass has exactly four fields (`actor`, `token_valid`, `resolved_scope`, `context_envelope`). Passing any other kwarg raises `TypeError` at construction. In streaming contexts the error fires before the SSE `try/except`, terminating with no event. In synchronous FastAPI routes the outer `except Exception` converts it into a `_to_http` 500 — same silent failure, different layer. Add an AST lint at `verification/lint/mcp_context_contract.py` and a pytest at `backend/tests/test_mcp_context_contract.py`; pattern mirrors `no_legacy_repe_reads.py` and `test_state_lock_invariants.py`.
- **Put `env_id` / `business_id` into `resolved_scope`, never into kwargs.** The correct pattern is `McpContext(actor="api", token_valid=True, resolved_scope={"env_id": env_id, "business_id": str(business_id)})`. Downstream tool functions in `backend/app/mcp/tools/repe_finance_tools.py` already accept these via their `inp` (Pydantic payload); ctx is structurally present but semantically unused by today's tools. Flag for a future cleanup: either wire ctx into scope enforcement or remove it from tool signatures.
- **Exempt the contract-test file from its own lint.** A test that deliberately constructs `McpContext` with forbidden kwargs (to prove they raise) will flip the lint red. Use an `EXEMPT_FILES` set keyed by filename — simpler than per-line pragmas and explicit in intent.
- **LATEST.md staleness is a Claude-decision P0, not just an ops P1.** When `docs/LATEST.md` claims "unpushed fix at commit X" and `git merge-base --is-ancestor X origin/main` exits 0, the agent spends cycles investigating a resolved bug. Treat intel-pipeline freshness as a correctness constraint on the agent runtime, not a hygiene issue.
- **Composer-layer regression guards are cheap; tool-execution-layer guards are expensive.** `backend/app/services/dashboard_composer.py` is pure-Python and has 34 tests covering widget shape. Adding 11 more parametrized canonical-prompt tests at `backend/tests/test_repe_fast_path_nonempty.py` runs in 0.05s and locks the "empty dashboard shells" vector forever. Integration-level tests against the async tool-execution branches (LIST_INVESTORS, LIST_CAPITAL_ACTIVITY, waterfall) need a test DB and are an order of magnitude more expensive — file those separately.
- **`_build_dashboard_card` was the silent-empty-shell accomplice, not the cause.** It reads `widget_count = len(spec.get("widgets", []))` and happily advertises "0 widgets · Custom" if the composer returns empty. Always test card builders against zero-widget specs if the composer ever returns one.
- **Pre-existing CI-failing state-lock lint (e.g. `repe_hybrid_search.py:268,301`) is not your loop's problem unless you touched the file.** Record it in §9 Remaining Risks, don't scope-creep the current loop to fix it. Fix-forward discipline scales better than one-diff-to-rule-them-all.
- **Discipline-enforcing plan structure is a productivity multiplier.** Hard rules like "do not start Loop N+1 until Loop N is patched + tested + documented" prevent the dreaded half-fixed-everywhere failure mode. Add "if a loop cannot be completed, stop and document the blocker" explicitly — it prevents the worse failure mode of silently skipping.
- **Live-browser verification is a real gap in Claude Code audits.** `WebFetch` can't log in (no JS, no cookies). Any UX claim that depends on authenticated state is code-derived, not experiential. Say so explicitly in the audit rather than implying a live walkthrough happened.
- **AST-based lints beat regex-based lints for dataclass contracts.** Regex for banned SQL patterns is fine; regex for function-call kwarg validation is fragile (handles multi-line calls poorly, false-positives in strings). The `ast.NodeVisitor` pattern in `verification/lint/mcp_context_contract.py` is ~100 lines and structurally correct.

## Databricks ↔ Winston ML integration (from NCF Grant Friction workflow, 2026-04-15)

- **Reuse the `novendor_1` catalog + bronze/silver/gold layout for every new ML workload.** Schema `{domain}_ml` (e.g. `ncf_ml`), tables `bronze_*` / `silver_*` / `gold_*`. Matches HistoryRhymes and keeps lineage legible across domains — one training DAG pattern, one sync job shape.
- **Point-in-time joins are non-negotiable for operational targets.** Rolling features must compute `window.end < event.timestamp` (e.g. `recommended_at`). Random splits leak queue state on ops-chronology targets; use `TimeSeriesSplit` with an expanding window, 5 folds, mirroring `skills/historyrhymes/templates/regime_classifier.py`.
- **Calibrated probability > raw score for UI-facing risk signals.** Isotonic calibration on a held-out walk-forward fold. Log the Brier score; surface the reliability diagram in the lineage drawer. "0.73 risk" without calibration is vibes — and the demo audience will spot it.
- **Mirror the HistoryRhymes service → route → dataclass pattern for every new model consumer.** `backend/app/services/*_service.py` returns dataclasses; `backend/app/routes/*.py` wraps with FastAPI; the UI renders one shape. Gives Winston one integration contract, not a new one per model.
- **Every prediction table gets a `null_reason` column and a `score XOR null_reason` CHECK constraint.** Fail-closed mirrors the authoritative-state lockdown philosophy: a missing prediction is surfaced as a named absence, not a fabricated score or a 404. The UI then renders "Not available in current context" rather than a blank card or a misleading zero.
- **Prediction tables are not authoritative-state reads.** They produce new signals, so they don't go through `re_authoritative_snapshots` or trigger `verification/lint/no_legacy_repe_reads.py`. Document this explicitly in the service docstring so future audits don't flag the direct DB access as a lockdown violation.
- **Sync Databricks → Supabase via a staging table + single upsert.** JDBC write to `*_stage` table, then one `INSERT ... ON CONFLICT DO UPDATE` round-trip keyed on `(env_id, grant_id)`. Avoids long transactions on the live table and keeps RLS policies untouched.
- **Load the chosen threshold from the MLflow run, not from hardcoded config.** `06_batch_score.py` reads `run.data.metrics["chosen_threshold"]`; bands derive from it (`watch = 0.6 × threshold`). When retraining shifts the precision/recall balance, inference follows automatically — no second deploy.
- **SHAP drivers belong on the prediction row, not re-computed at read time.** Store top 3 as a `jsonb` array `[{feature, direction, contribution}]`. Service layer parses tolerantly (malformed JSON → empty list, never a 500). Keeps the API contract stable even when the model evolves.

## Hostile ML audit patterns (reusable checklist)

These are the questions to ask before any ML surface lands in front of executives. They caught most of the holes in the NCF Grant Friction v1 design in a 90-minute red-team pass.

- **First question is always: "what is the target, actually?"** If the label is a time threshold, a flag derived from ops behavior, or a proxy for something else, the model is not predicting what its name claims. Rename the surface to match the label, not the aspiration.
- **Rolling-rate features computed over the label are almost always leaky.** `{group}_exception_rate_{window}` where the aggregate uses the same label the row will carry is one `end_date < window_end` mistake away from ~0.95 AUC. Write the point-in-time correctness as a unit test on a seeded fixture — not as a comment in the notebook.
- **If the stage column or any terminal-state column reaches the feature matrix, the model has the answer.** Maintain an explicit `EXCLUDED_LEAKAGE_COLS` list in the training notebook and assert on it before `.fit()`. Don't trust "we dropped it somewhere upstream."
- **Walk-forward split on recommendation date but labels resolve on payment date?** Your test fold still overlaps the train fold in *operational* time. The fix is to split on whichever date defines label-knowability, not on event-start.
- **Calibration with `cv="prefit"` inherits every leak present in the fit data.** If features are contaminated, so are calibrated probabilities — confidently and fatally.
- **Correlated features × SHAP = credit-allocation roulette.** Two near-identical rows produce different "top drivers." Executives read this as inconsistency. Use a coarse structured reason strip (3–5 bins) instead of raw SHAP for non-technical surfaces.
- **SHAP computed on the uncalibrated model does not correspond to the probability shown in the UI.** The XGBoost logit → isotonic step destroys the linear reconciliation. If you show drivers next to a probability, either explain both are in the raw space or don't show drivers.
- **The single most revealing question to ask about any ML product: "what does a user do differently because of this score?"** If the answer is "review it," ask "compared to what?" If there's no counterfactual, there's no ROI, and the model will be quietly shelved in a year.
- **No feedback loop = no defensible model.** Without a mechanism to observe whether flagged cases actually produced the outcome AND whether unflagged controls did not, you cannot defend the model 12 months later when someone asks for ROI. Design the A/B split in the training phase, not after deployment.
- **Silent drift vectors to enumerate before shipping:** new categories (new office, new gift type), policy changes to the label definition, schema evolution, macro shifts in the underlying process, feature-definition hardcodes (e.g. hardcoded fiscal-year-end month). For each, ask: "how would we know if this happened?" A model without any of those alarms is on a 90-day shelf life.
- **Proxy targets are reputation traps, not just modeling problems.** The first time a stakeholder figures out the label isn't what the UI claims, they will cite it every time AI comes up. Prefer "unsexy but true" framings from the start: not "friction risk" but "predicted processing-time exceedance."
- **Every model-backed KPI needs a pilot-stage badge until real-world performance is measured.** Not a disclaimer buried in lineage — a visible affordance on the tile. Removing the badge is a deliberate act with evidence, not an omission.
- **Sign direction in explanation strips is harder to get right than it looks.** Under correlated features, sign can flip across near-identical inputs. Magnitude is usually safer; sign requires stability tests before it reaches non-technical audiences.
- **Class-imbalance fixes (scale_pos_weight, SMOTE) make raw probabilities uncalibrated by construction.** You must calibrate afterwards. And you must calibrate on data not used for early stopping. Track both the raw AUC and the calibration Brier — AUC can hold steady while Brier rots.
- **Threshold selection should fail loud.** If no PR-curve point meets the precision/recall floor and the code silently falls back to F1-optimal, you just deployed a different operating point than the team signed off on. Emit a warning metric when the fallback fires; consider making it a training-job failure.

## Hall Boys Operating System — Environment Build Lessons

- **Fixture-driven prototyping** is faster than database-first. Define the data model as JSON in `fixtures/winston_demo/`, build services that read from it, and iterate. Swap to DB reads later without changing the API contract.
- **Domain block injection** (`_OPERATOR_DOMAIN_BLOCK` in `ai_gateway.py`) is the key to non-generic AI responses. Tell the assistant what tools to call, what grounding rules to follow, and what response format to use.
- **MCP tool registration** follows a simple 3-file pattern: schemas in `mcp/schemas/`, handlers in `mcp/tools/`, and registration in `mcp/server.py`. Tag tools with the domain name for lane filtering.
- **Context publishing** via `publishAssistantPageContext()` must include `visible_data` with the actual on-screen data. This prevents the AI from contradicting what the user sees.
- **Seed data realism**: margin compression, budget overruns, vendor duplication, blocked workflows, and multi-stage pipeline sites produce better demos than happy-path data.
- **Shell + anchor navigation** (tabs for pages, sidebar anchors for sections) scales cleanly for multi-page environments without custom routing complexity.

## Data-state honesty banner for AI/ML surfaces (Winston audit 2026-04-17)

AI/ML UI often ships with hardcoded mock arrays while the pipeline is scaffolded. Users then see polished-looking intelligence with fake numbers and don't realize it. The fix is a three-state, painfully-honest banner at the top of every such surface.

- **States (locked by `HistoryRhymesDataStateBanner`):** `preview` → synthetic fixture data, none of the numbers are real. `seeded` → backend-connected to a static historical library but not a live current-market match. `live` → current-market output computed from live inputs. `live` is reserved — the component accepts it but the fetcher must never produce it until every numeric surface is backend-sourced.
- **Promotion rule:** mixed-mode pages (real episodes + fake forecaster) stay `preview`. The banner promotes only when every rendered numeric surface is backend-sourced. This prevents silent drift where "we wired one panel" gets labeled `seeded` and the audience assumes everything is real.
- **Scope-guard for a single loop:** hardcode the banner state when the loop only wires one surface. A `bannerState = "preview"` line with a comment explaining why is safer than exposing a prop that will get called with wrong values during subsequent partial wiring.
- **Location:** [repo-b/src/components/market/HistoryRhymesDataStateBanner.tsx](../repo-b/src/components/market/HistoryRhymesDataStateBanner.tsx). Copy lives in the component itself (not i18n yet) so the honesty text is obvious to future reviewers.
- **Cost of not having this:** a serious prospect notices mock data in a demo, cites it every time AI comes up, and the product loses the room. Same pattern as the NCF Grant Friction proxy-target trap in the hostile ML audit checklist above.

## Context-preserving route resolution for cross-tenant navigation (Winston audit 2026-04-17)

Multi-tenant apps need an in-env workspace switcher. The naive implementation (preserve the full path) generates 404s and wrong-tenant errors because entity ids don't cross env boundaries. The safe implementation is a pure helper that returns `{ path, preservesModule, reason }`.

- **Never carry deep entity sub-paths across envs.** Fund ids, asset ids, deal ids are env-scoped. `/re/funds/fund-123` in Meridian → `/re/funds/fund-123` in Novendor will fail; at best 404, at worst renders a wrong-tenant error.
- **Preservation policy (three levels):** (1) module matches target's primary landing → preserve at module root (`/lab/env/{target}/{module}`); (2) module is in a known shared allowlist (`documents`, `executive`, `analytics`, `admin`, `audit`) → preserve at module root; (3) otherwise → fall back to target env's home path via `environmentHomePath`.
- **Always strip deep path even when preserving.** The module's own landing page handles further navigation. Don't try to guess "the same sub-path exists in the target" — if you're wrong, you broke nav; if you're right, the module was going to navigate there anyway.
- **Tell the user with a tooltip, never silently.** `"Opens the same module in X"` vs `"Switches to X's home workspace"` — the tooltip is how the switcher stays trustworthy. No silent redirects.
- **Keep the resolver pure + unit-testable.** `resolveSwitchTarget(currentPath, targetEnv)` at [repo-b/src/lib/lab/resolveSwitchTarget.ts](../repo-b/src/lib/lab/resolveSwitchTarget.ts) has zero React deps and 10 unit tests. The React component just consumes it.
- **Useful data attributes for QA:** `data-preserves-module="true|false"` and `data-target-path="/lab/env/.../..."` on every menu item. Makes both automated UX audits and manual QA trivial.

## Single-source state taxonomy for capability + environment lifecycle (Winston audit 2026-04-17)

When "not fully working" is expressed in four different UI patterns (polished component, experimental eyebrow, ad-hoc error banner, silent empty state), users can't tell "not enabled for this env" from "preview" from "service down" from "experimental." Collapse them all into one taxonomy.

- **Five states, locked:** `not_enabled`, `preview`, `temporary_error`, `experimental_partial`, `archived`. Same words everywhere. Add states only via the registry file, never improvise.
- **Single source of truth:** [repo-b/src/lib/lab/capability-state-taxonomy.ts](../repo-b/src/lib/lab/capability-state-taxonomy.ts) — `CAPABILITY_STATES` const, `CAPABILITY_STATE_META` (pill label, tone, default headline, default detail), `CAPABILITY_STATE_TONE_CLASSES` (Tailwind classes per tone). Consumed by both `CapabilityUnavailable` and `EnvLifecyclePill`.
- **One component per scope, shared vocabulary:** `CapabilityUnavailable` for per-capability states (renders full card). `EnvLifecyclePill` for per-environment lifecycle (renders small pill). They *look* different — but they *speak* the same taxonomy.
- **Every surface must emit `data-state="..."` attr** for automated telemetry + QA. A single `document.querySelectorAll("[data-state='temporary_error']").length` sweep audits the whole app in one query.
- **Default-but-override contract for backwards compatibility:** `CapabilityUnavailable` accepts an optional `state` prop defaulting to `not_enabled`. Existing 3 callers didn't need to change; new callers opt into explicit states for clarity.
- **Fallback rule when consolidation gets invasive:** if aligning a parallel component (e.g. `DomainPreviewState` — 9 call sites) turns into a multi-hour refactor, stop at taxonomy-aligned copy/pill parity in the current session and file full wrapper consolidation as follow-up. Goal is unified *language*, not unified *component tree*.
- **Lifecycle not = capability:** `not_enabled` and `temporary_error` don't apply at env level (those are per-capability). `preview` / `experimental_partial` / `archived` can apply to either. Keep the distinction in type signatures (see `EnvLifecycleState` narrow type).

## Plan mode discipline: repo inventory confirmation before patching (Winston audit 2026-04-17)

Approved plans can drift from the actual code by the time execution starts. A 60-second read-pass across every assumption saves an hour of patching the wrong file.

- **Loop 0.5 pattern:** before any code changes, read each file the plan references and either `confirmed:` it in the report or note `drift:` with the corrected location.
- **Common drift:** plan references line numbers for error banners but those lines hold helpers; the banner is 90 lines below. Fix the plan reference first, then patch.
- **Report drift in §2 of the audit.** Makes the trail visible to reviewers: the plan predicted X, reality was Y, here's the corrected location. Don't silently re-route the fix and hope no one notices.
- **Also catches orphaned code.** A plan target that's imported nowhere reveals the real render path. In this session: `HistoryRhymesTab` was orphaned, the real path was `CommandCenterLayout` using `useDecisionEngine` + `useAssetScopedData` fallback. The banner had to mount in both places to actually reach users.

## Seed migration FK ordering: conditional parents must match conditional children (2026-04-17)

`re_asset_operating_qtr` has a `NOT NULL REFERENCES repe_asset(asset_id)` FK. A seed file that inserts child rows unconditionally will violate that FK on any fresh DB where the parent seed ran conditionally (e.g., guarded by a fund-existence check).

**Root cause pattern:** File 508 (`granite_peak_bottom_up_seed.sql`) inserts `repe_asset` rows only inside a `FOR v_fund_row IN SELECT ... FROM repe_fund WHERE name = '...' LOOP` block. File 511 (`repe_calibrated_asset_seed.sql`) originally inserted `re_asset_operating_qtr` rows for the same asset UUIDs as bare unconditional statements — violating the FK when the fund didn't exist yet.

**Fix:** Move all child inserts that depend on conditionally-created parents into the same `DO $$` guard block. The guard checks for the fund, inserts parent rows if the fund is present, then inserts children inside the same branch. If the fund is absent the `DO $$` block exits early and no child rows are written.

**Rules to follow:**

- If a parent row is inserted conditionally (inside a loop or IF block), every child row for that parent must also be conditional.
- Do not use a two-block pattern (DO block for parents, bare INSERTs for children) — the guard exits the DO block but doesn't suppress the bare statements below it.
- Add a guardrail test (`test_seed_fk_integrity.py`) that asserts zero orphan rows in every REPE child table: `re_asset_operating_qtr`, `re_asset_exit_event`, `re_authoritative_asset_state_qtr`.
- When diagnosing a "duplicate identifier" TS error after a rebase: check if the conflict resolver kept both an old interface and a new one with the same name. Rename the old one to `Legacy*` and use import type aliases (`import { type X as Y }`) in files that still need the old shape.
- psycopg3 `%` in SQL strings: any literal `%` character (e.g. `LIKE '%broker%'`) must be escaped as `%%` — psycopg3 treats `%b` as a binary placeholder and raises `ProgrammingError`.

## Winston autonomous eval loop — build lessons (2026-04-22)

We already had ~70% of an eval system built (`eval_loop/` Python package with 917-line runner, 39-scenario registry, golden corpus, chaos engine, SQLite regression store, Playwright `repo-b/tests/ai-evals/`, and `scripts/winston-eval-loop.mjs` orchestrator). The missing pieces were durable Postgres persistence, autonomous scheduling, and contract-grounded assertions. We wired the existing runner into the real loop rather than rebuilding.

- **Always inventory first.** Before writing any new eval code, grep for `eval_loop/`, `tests/ai-evals/`, `ai-testing/`, and `scenario_registry.json`. The repo had richer infrastructure than any single doc described.
- **Canonical runtime = `run_request_lifecycle`**. `eval_loop.runner.run_assistant_turn` already calls it directly, bypassing HTTP. This is the correct eval target — not the SSE endpoint. Do not eval through the HTTP layer when the lifecycle function is a clean seam.
- **Lane F is a regression signal, not another path.** Any case that expects `A_FAST`/`B_LOOKUP`/`C_ANALYSIS` but observes `F` = `fallback_to_lane_f` hard fail. The legacy `_run_repe_fast_path` is being phased out and should not show up in canonical evals.
- **Missing terminal state = fail.** If the SSE stream ends without a `done` or `error` event, the case MUST fail. Never "pass with warnings" when the contract isn't finished. This is the single most common silent-failure mode.
- **Baselines need a composite key, not just `(case_id, env_id)`.** Use `(case_id, env_id, contract_version, expected_lane)` — bumping `contract_version` in the scenario file naturally invalidates stale baselines when you change the expected shape. Otherwise a legitimate contract evolution looks like a regression.
- **Separate alarm from repair.** V1 of the eval loop is the alarm system — fail loudly, file one issue per `(case_id, failure_category)` tuple (matched via hidden HTML comment marker), never PR. Auto-PR is v1.5 repair automation; wiring both at once causes flaky regressions to spam branches.
- **Cap auto-filed issues.** If >5 regressions in a single run, file a single infra-failure issue instead of 5+ real ones. That count almost always means DB credentials / API keys / scenario-loader broke, not 5 simultaneous real regressions.
- **Subprocess the runner from FastAPI.** The backend service wrapper (`backend/app/services/winston_eval_runner.py`) shells out to `python -m eval_loop.runner` rather than importing it. The runner bootstraps its own env, loads a lot of heavy modules, and owns a long-lived event loop — keep that out of the FastAPI worker.
- **Schema table convention is `NNN_description.sql` but the repo's `repo-b/db/schema/` dir mixes `000`–`020` reserved and `9990`–`9999` ai-observability siblings.** Use the mid-range gap (e.g. `030_winston_eval_core.sql`) for new AI-observability tables so they don't collide with existing 5-digit migrations.
- **Match living convention over docs.** ARCHITECTURE.md prescribes `env_id TEXT NOT NULL` with RLS on `app.env_id`, but `ai_tool_calls`/`ai_ui_events` actually use `business_id uuid NOT NULL` + `env_id uuid` with RLS on `app.current_business_id`. Sibling tables should match the living sibling convention, not the older doc.
- **Docs report writer is separate from the rich SQLite reporter.** `eval_loop/reporters.py:write_reports` emits a huge artifact dump. For human-readable daily output in `docs/ai-testing/reports/YYYY-MM-DD_HHMM.md` + a `docs/LATEST.md` pointer, keep it as a thin sibling module (`docs_report_writer.py`) that takes the same summary + results and writes markdown only.
- **psycopg `ON CONFLICT` with composite unique must list columns in the same order as the constraint.** `UNIQUE (business_id, case_id, env_id, contract_version, expected_lane)` → `ON CONFLICT (business_id, case_id, env_id, contract_version, expected_lane)`. Order matters; PG will complain otherwise.
- **`IS NOT DISTINCT FROM` for nullable baseline keys.** `expected_lane` and `env_id` can both be NULL. Use `(col IS NOT DISTINCT FROM %s)` rather than `col = %s` so NULL matches NULL in baseline lookups.

## Absorbing a marketing site into repo-b (Consulting_site → repo-b lessons)

- **Auth middleware has opinions about `/`.** `repo-b/src/middleware.ts` redirects authenticated users from `/` to `/app` (lines 130–135) and redirects unauthenticated users from gated paths back to `/` via `buildLoginRedirect` (lines 21–29). When swapping `/` from login-portal to marketing home, both must change in the same commit: delete the `/` redirect block and point `buildLoginRedirect` at `/login` — otherwise signed-in visitors to novendor.ai bounce straight into the app.
- **Route group vs literal folder is a safety control, not a style choice.** Shipping marketing pages under a physical `/m/` prefix first (Phase 1) is safe to merge to `main` because the URLs are externally invisible. Renaming `src/app/m/` → `src/app/(marketing)/` (a route group, no URL prefix) is a single-commit "swap" that promotes them to `/`. Having phase 1 live in `main` while DNS still points to GH Pages lets you verify the port without time pressure.
- **`robots: { index: false }` in the root layout is a global noindex trap for marketing.** Root layout in repo-b explicitly sets noindex. A nested `(marketing)/layout.tsx` with `robots: { index: true, follow: true }` overrides per-subtree. Don't try to flip the root — Winston and `/login` should stay noindex. Per-route-group override is the clean split.
- **Don't co-locate static `public/robots.txt` with dynamic `app/robots.ts`.** Next.js serves whichever the build resolves first; the combo is a silent-conflict bug. Pick one strategy for the whole repo. Dynamic `app/robots.ts` wins because it can read `process.env.NEXT_PUBLIC_MARKETING_ORIGIN` so dev and prod emit the right sitemap URL.
- **Provider topology drives what marketing pages load.** A single `<Providers>` at root layout means marketing pages pay the cost of every Winston context (command bar, BOS state, app loader). Split into `RootProviders` (safe universal) at root and `WinstonProviders` at `/app/layout.tsx`. Login and marketing routes naturally get only `RootProviders`.
- **`metadataBase: new URL('https://{{DOMAIN}}')` is a placeholder, not valid config.** Consulting_site shipped this literal string. At copy time, convert to `new URL(process.env.NEXT_PUBLIC_MARKETING_ORIGIN ?? 'https://novendor.ai')` and set the env var per Vercel environment (Production = novendor.ai, Preview on develop = paulmalmquist.com).
- **Static-export Next configs don't port cleanly.** Consulting_site had `output: 'export'` (opt-in via `NEXT_EXPORT=true`), `trailingSlash: true`, `images: { unoptimized: true }`, `basePath`. Don't copy the `next.config.js` file at all — port only the `redirects()` array into repo-b's config.
- **Trailing-slash cutover is automatic but has an SEO tail.** Going from `trailingSlash: true` (old site) to `false` (repo-b) means Next auto-308s `/about/` → `/about`. Google will re-crawl and dedup over 2–4 weeks. Lower DNS TTL to 300 s 24 h before DNS cutover for fast rollback; raise back to 3600 s after a stable week.
- **Nested layouts must NOT render `<html>` or `<body>`.** The Consulting_site `app/layout.tsx` becomes a nested layout when copied to `(marketing)/layout.tsx`. Strip the outer wrappers and the `globals.css` import — they're inherited from root. Load marketing-only fonts (Orbitron, IBM_Plex_Mono) on a wrapping `<div>` via `next/font/google` CSS variables.
- **Vercel domain → branch mapping is how you get two domains one repo.** In Vercel project settings, assign `novendor.ai` to `main` (production) and `paulmalmquist.com` to `develop` (branch-scoped custom domain). Set `NEXT_PUBLIC_MARKETING_ORIGIN` per environment scope so canonical URLs and sitemap base URL stay correct on each.
- **Archive the old repo; don't delete.** After DNS cutover, delete the GH Actions workflow and `public/CNAME` from Consulting_site, then archive the GitHub repo (Settings → Danger Zone). Keep history; don't hard-delete. If DNS reverts are needed in the first week, GH Pages must still be serving.
- **Inbound link audit is the hidden cost of swapping `/`.** After making `/` = marketing, `grep -rn 'href="/"' repo-b/src` reveals every stale link that meant "home as login." Most are inside `/app/**` nav and should point to `/app`. A handful in auth flows should point to `/login`. The login flow's post-login `returnTo` default also needs to change from `/` to `/app` — otherwise users land on marketing after sign-in.

### Phase 1 execution notes (what the plan didn't predict)

- **Per-page `metadata.ts` files can be dead code.** Consulting_site shipped `app/<route>/metadata.ts` for 16 routes, but page files never imported them. Next.js app router only picks up `export const metadata` from `page.tsx` or `layout.tsx` — sibling `metadata.ts` files are inert unless re-exported. Before spending time porting, grep the page files: `grep -l "from './metadata'" app/*/page.tsx`. If empty, the metadata files are parity scaffolding, not live SEO.
- **Don't override Tailwind `cyan` or `violet` scales during a marketing merge.** Winston code uses `bg-cyan-500/10`, `text-cyan-300`, `bg-violet-400`, `text-violet-300` in 10+ files across accounting, REPE, and lab surfaces. Marketing brought its own `cyan` and `violet` scales (slightly different hex values). Extending Tailwind's `extend.colors.cyan` merges key-by-key and silently shifts every Winston shade. Add only tokens with no default collision — `ink`, `accent`, `gold` — and let marketing components use Tailwind's default cyan/violet. Exact-brand-match is a Phase 4 polish concern.
- **Font CSS-variable collisions bite in the CSS file, not the layout.** The layout uses `next/font/google` and can rename `variable: '--font-marketing-display'` easily. But the ported `globals.css` (→ `marketing.css`) references `var(--font-display)` and `var(--font-sans)` and `var(--font-mono)` in class rules like `.nv-headline`, `.nv-mark-badge`, `.nv-subheadline`. Forgetting to rename those in the CSS file gives you styles silently binding to Winston's fonts. Search the ported CSS: `grep -E 'var\(--font-[^)]+\)' marketing.css` and rename every one.
- **Port Consulting_site `globals.css` into a scoped `marketing.css`, not the root `globals.css`.** The ported file contained unscoped `body { ... }` rules that would fight Winston's root `body` styles. Wrap the whole contents in a `.marketing-shell { ... }` class on the root marketing wrapper `<div>`, and only add `@apply` utilities inside descendant selectors (`.marketing-shell h1 { @apply ... }`). Import `./marketing.css` from `m/layout.tsx` only — side-effect is contained to the marketing subtree.
- **Nested `components/marketing/marketing/` is a cosmetic nest, not a bug.** Consulting_site had a `components/marketing/` subfolder; porting it into `src/components/marketing/` produces `src/components/marketing/marketing/`. Imports resolve fine as `@/components/marketing/marketing/CredibilitySection`. Don't flatten — flattening invites Phase-3-style collision risk for zero value.
- **Add a `@content/*` path alias instead of rewriting every JSON/TS import.** Marketing components do things like `import navigation from '../../content/navigation.json'` and `import { INDUSTRY_VERTICALS } from '../../content/industry-verticals'`. After the port, the content folder lives at repo root (`repo-b/content/`), 4+ levels up from `src/components/marketing/X/Y.tsx`. Adding `"@content/*": ["content/*"]` to `tsconfig.json` `paths` makes `@content/navigation.json` work from any depth. One change; dozens of imports fixed.
- **Bulk sed doesn't cover single-level relative imports.** A Python/sed rule matching `(?:\.\./){2,}content/` catches `../../content/` and deeper, but misses `../content/` — which is exactly what `Consulting_site/lib/industryThemes.ts` uses (one level up from `lib/`). Build caught this only at TypeScript compile. Lesson: after bulk-rewrite, run `grep -rn "from ['\"]\\.\\.?/content/\|from ['\"]\\.\\.?/lib/" src/` to catch the single-level stragglers before `npx next build`.
- **`legacy-saas-migration/page.tsx` in the source is `export { default } from '../legacy-saas/page'` — a sibling re-export.** Looks like a straggler relative import. It's not; don't rewrite it. Reserved for Phase 3 redirect migration anyway.
- **Ported pages that intentionally `notFound()` are parity, not bugs.** Consulting_site shipped `demo/page.tsx` and `insights/page.tsx` that call `notFound()`. The smoke test will show 404s — that's correct, the original site 404'd those routes too. Don't "fix" them in Phase 1 by porting placeholder content.
- **Post-port dev-server smoke test needs `node`'s `http`, not `curl`.** Claude Code sandbox Bash doesn't guarantee `curl` / `rm` / `tr` on PATH. A tiny Node script with `http.get` iterating a URL list is more portable and gives you status code + byte count in one pass.
- **Consulting_site has more `lib/` files than the plan enumerated.** Audit said `content.ts`, `mailer.ts`, `calendar.ts`. Actual files also include `booking-store.ts`, `industryThemes.ts`, `search.ts`. Components import from them (e.g. `IndustryVerticalPage.tsx` imports `INDUSTRY_THEME_STYLES` from `industryThemes`). Copy the whole `lib/` subtree under `src/lib/marketing/`, not a hand-picked subset.
- **Consulting_site had 28 `page.tsx` files, not 24.** The plan's route map missed: `docs/page.tsx` (index), `industries/page.tsx` (index), and 4 `research/*` subroutes. Both index files matter because the dynamic `[slug]` children share the parent namespace. Always run `find app -name 'page.tsx'` before counting.
- **Marketing `href="/..."` links inside `/m/*` will 404 during Phase 1 only.** The ported sidebar links to `/contact`, `/industries/...`, etc. While marketing is mounted at `/m/*`, those hrefs don't resolve. Phase 1 smoke test should verify each marketing route **directly by URL**, not by sidebar navigation. Phase 3 rename to `(marketing)` route group fixes every link automatically with zero edits. Resist the urge to add a `MARKETING_BASE_PATH` helper — it's temporary scaffolding you'd have to rip out.

## Winston response contract — Phase 1 lessons (2026-04-22)

Built the shared response-contract module (`backend/app/assistant_runtime/response_contract.py`) as the single source of truth for "valid Winston turn." Both the runtime and the eval loop now import from it. No production enforcement yet — Phase 2 adds shadow validation, Phase 3 adds hard-fail + UI gating. All 78 backend tests green (48 new + 30 pre-existing).

- **Inventory the real emission set before declaring a contract.** Grep showed `progress`, `context`, `session`, `safety` events in active use beyond the "canonical 9" docs. A bounded `EventType` enum that silently rejected them would have flagged the entire live runtime as invalid. Whitelist what's actually emitted today; add a `RUNTIME_ONLY_EVENTS` subset for ones that may eventually be deprecated.
- **FSM rules must match canonical behavior, not aspirational behavior.** The meridian structured-executor path legally streams tokens after `structured_result`. A naive "no tokens after structured output" rule would break canonical turns on day one. Codify the FSM from what the audit shows, not what the ideal would be.
- **`error` is itself terminal** in the current runtime (see `backend/app/assistant_runtime/request_lifecycle.py:858` and `:1748`). Do not require `error → done` pairing unless you're willing to refactor the runtime too. Codify what exists; propose change in a later phase if needed.
- **One code path for the shape hash, even if it means a tiny re-export.** `eval_loop/regression_store.py:_response_shape_hash` and the new `response_contract.response_shape_hash` must produce identical bytes forever. Re-export (with a local fallback for tests that haven't set `sys.path`) is cleaner than defining it twice.
- **Stamp runtime metadata at the single trace-builder site, not at each `yield _sse("done", ...)`.** The audit listed 8 separate `done` emissions but all went through `_build_trace`. Adding `runtime_identity` once in `_build_trace` is O(1) lines and non-breaking — piggyback on the existing `trace` dict, which the frontend already ignores extra keys on.
- **Lazy-import backend modules from eval-loop code.** `canonical_assertions.py` imports `app.assistant_runtime.response_contract` inside the detection function, not at module load, because the backend path isn't on `sys.path` until `bootstrap_backend_imports()` has run. Module-level import would crash any unit test of the eval loop.
- **Back-compat matters even for refactors inside the same repo.** `postgres_sink.py` imports `_response_shape_hash` by name; `failure_taxonomy.py` is imported by multiple eval-loop modules. Preserve every top-level name and public function signature. Change what's *behind* the name; never change the name itself in a refactor PR.
- **`contract_drift_unversioned` starts as `warning`, not `critical`.** The rule is that a shape change without a `contract_version` bump should be caught — but hard-failing on day one would block every legitimate change while the versioning discipline is still being learned. Ship at severity `warning`; soak 2 weeks; Phase 3 flips to `critical`. This is a **one-line change** in `response_contract_types.py:RUNTIME_SEVERITY_BY_CATEGORY` when the soak ends — make sure it stays that way.
- **Test the validator with real audit-derived event streams, not invented ones.** Golden fixtures live in `backend/tests/fixtures/contract/*.json`. The `meridian_tokens_after_structured` fixture is the single most load-bearing test — it proves the FSM doesn't flag canonical behavior as invalid. Any future FSM change must re-pass it.
- **Severity-based validity: don't mark a turn `invalid` on a `warning`-level violation.** `validate_turn` marks `valid: False` only if a violation's severity is critical OR its category is in `RUNTIME_CRITICAL_CATEGORIES`. `contract_drift_unversioned` is `warning` in Phase 1, so it does NOT flip `valid` to False — it gets recorded but doesn't fail the eval. This is the difference between observation and enforcement.
- **Runtime identity separates "what lane ran" from "what path the lane is on."** `lane = F` means fallback; `execution_path starts with meridian_structured_` means fast. The `RuntimeIdentity.path` field is the coarse classifier; `.lane` is the fine-grained one. Phase 3 will reject `path == "fallback"` requests — keep that in mind when adding new execution paths.

## Winston response contract — Phase 2 lessons (2026-04-22)

Shipped shadow-mode enforcement. `contract_enforcer.wrap_lifecycle_stream` now wraps `run_request_lifecycle` at the single call site in `ai_gateway.py`; events are parsed, validated via `validate_turn`, and one row per turn is written to the new `ai_contract_observations` table. Feature-flagged via `WINSTON_CONTRACT_SHADOW_MODE=1`. Default off — production is untouched until the flag is flipped.

- **Don't bolt the enforcer's output onto the hot-path log row.** `ai_gateway_logs` is written inside `request_lifecycle.py` in a `run_in_executor` block, which finishes *before* the enforcer's generator has observed the terminal event. Trying to share that row would require threading a future back through the generator — ugly and racy. A separate `ai_contract_observations` table is simpler, append-only, and leaves the hot-path row untouched.
- **Put the wrapper at the gateway boundary, not inside `request_lifecycle`.** The gateway's `run_gateway_stream` is the single point of entry for all Winston turns. Wrapping it there means (a) one call site, (b) the enforcer sees the exact bytes the client will see, (c) no entanglement with the already-complex lifecycle code.
- **The wrapper MUST be a pure passthrough when the flag is off.** If disabled, skip the parse step entirely — don't just skip the persist. The SSE parser is fast, but every microsecond on the hot path earns real money. The code has an early `async for ... yield` loop for the disabled path and a separate instrumented loop for the enabled path, by design.
- **Enforcer-internal exceptions are quarantined three ways**: (1) `_parse_sse_line` catches and returns None; (2) `_persist_observation` catches and logs; (3) the `finally` block around the whole validator+persist step re-catches anything that escaped. Production traffic cannot die because the observation layer misbehaves — that's a hard rule.
- **Persist even when the upstream raises.** The `finally` block runs the validator on whatever events were seen before the crash. Partial-stream observations are still useful signal — a turn that died after `status` but before `token` is exactly the kind of thing shadow mode should surface. Tests enforce this.
- **Tolerate malformed upstream blocks silently.** The parser returns None for garbage; the wrapper yields the garbage to the client unchanged and just skips it in the event list. We don't know what downstream consumers do with non-standard blocks and shadow mode isn't the place to find out.
- **SSE parsing is simple but has a few gotchas.** Blocks end in `\n\n`. Event lines are `event: NAME`. Data lines are `data: JSON`. A block can have no data (bare `event: X\n\n`). A block with malformed JSON should yield an empty data dict rather than None — the event name alone is still useful signal (a sequence of `token → token → [bad]` is still a sequence of tokens for FSM purposes).
- **`mode='shadow'` parameter overrides the env var.** Useful for tests, but also for future Phase 3 work where we want to enforce on a subset of traffic (per-lane, per-env, per-business) without a global flag. The hook is already there — Phase 3 just extends the mode to `'enforce'` and adds the short-circuit logic.
- **Every new jsonb-writing route gets a text[] column for the event sequence.** `event_type_sequence` on `ai_contract_observations` is a `text[]`, not a jsonb array. Postgres native arrays are queryable with `= ANY()` and `@>` operators without jsonb extraction. Faster, cleaner SQL for the soak dashboards. Only cap at 40 — a runaway turn with 10k events shouldn't bloat the row.
- **The wrapper measures, but does not measure overhead on itself.** Don't add internal timing telemetry. If shadow mode adds measurable latency at p95, Datadog / the existing `elapsed_ms` field will show it. The enforcer's code path should be so tight that it doesn't deserve its own instrumentation.

## Marketing merge — Phase 2: provider split (2026-04-23)

Split the monolithic `<Providers>` at `repo-b/src/components/Providers.tsx` into `RootProviders` (site-wide) and `WinstonProviders` (app-only). Root layout now uses `RootProviders`; `/app/layout.tsx` wraps its subtree in `WinstonProviders`. Build clean. No URL changes.

- **Audit `useToast` callers before moving `ToastProvider` out of root.** The first instinct was to put `ToastProvider` in `WinstonProviders` because toasts are app-flavored. But `/tasks/page.tsx` and `/design-system/ShowcaseClient.tsx` also call `useToast()` — both sit outside the `/app/*` layout boundary. Moving `ToastProvider` to `WinstonProviders` broke their prerender with `useToast must be used within ToastProvider`. `ToastProvider` is a UI primitive with no session assumption; marketing and login pages simply never call it. Belongs at root.
- **`next build` catches provider boundary violations during static prerender.** Routes that are prerendered (static) will throw during `Generating static pages` if they call a hook whose context isn't in scope. This is the fastest way to discover that a context was removed from root — faster than any runtime test. The error message names the hook and the route.
- **Keep `RouteChangeListener` inside `WinstonProviders`.** It intercepts anchor clicks to fire `winstonLoader.routeStart()`. Marketing and login pages navigating to other pages would trigger Winston's loading bar even without the loader UI rendering — the invisible event listener would still run. Keep it app-subtree-only.
- **Three named exports from one file: named `RootProviders`, named `WinstonProviders`, default `Providers`.** The legacy default was kept to avoid breaking any test fixtures that wrap components in `<Providers>`. It delegates to both named exports. New code only uses the named exports directly. The default is effectively a composition alias — it'll be deleted in Phase 3 cleanup once any test references are updated.
- **`WinstonProviders` renders `GlobalCommandBar` and `WinstonLoader` as children of `BosAppShell`, not siblings above it.** The nesting order in `app/layout.tsx` is `WinstonProviders > EnvProvider > BusinessProvider > BosAppShell`. This is correct: the command bar and loader overlay the full app shell, including the shell chrome. If `WinstonProviders` wrapped only the inner `{children}` and not `BosAppShell`, the overlay elements would be orphaned above the shell's z-index context.
- **Provider split is Phase 2 precisely because URL changes aren't safe yet.** The whole point of splitting providers before the root swap (Phase 3) is that you want the split to be a provably-isolated change. If you combined provider split + root swap in one commit, a prerender failure could have two possible causes. Atomic, independently-revertable commits are worth the extra PR.

## Marketing merge — Phase 3: root swap (2026-04-23)

Renamed `src/app/m/` → `src/app/(marketing)/` (route group, no URL prefix). Deleted `src/app/page.tsx`. Marketing now owns `/`; login at `/login` unchanged. Middleware updated: `buildLoginRedirect` points to `/login`, the `/` session redirect block removed, `/public/:path*` removed from matcher. Full audit of root-path assumptions across src, tests, specs. Build clean. No DNS change, no SEO activation.

- **The dangerous part of a root swap is not renaming the folder — it's all the code that assumed `/` = login.** The rename is one bash command. The audit takes hours and has many places to miss: middleware, server components, `[environmentSlug]/page.tsx`, test files, Playwright specs, and the middleware test suite itself. Run the grep battery before touching anything.
- **`buildLoginRedirect` has no unit test for its URL output — the middleware test does.** `middleware.test.ts:56` was the authoritative test for the redirect destination. It expected `/?returnTo=...`. Updating the middleware function without updating the test would have produced a green build but a broken test suite. Always grep test assertions when changing redirect targets.
- **Authenticated users hitting `/` should NOT get force-redirected to `/app` after the swap.** The old behavior (middleware lines 130–135) was: session at `/` → redirect to `/app`. That made sense when `/` = login portal. After the swap, `/` = marketing home — an authenticated user should be able to read marketing content. Removing that block is the right call. The `/login` redirect-to-`/app` behavior (lines 115–120) stays intact.
- **`path: "/"` in Playwright cookie setup is cookie scope, not navigation.** About 8 test files had `path: "/"` as part of `context.addCookies()` — this is the `path` attribute on the cookie, scoping it to all paths. Not the same as navigating to `/`. Only flag `goto("/")` and `url: "..."` strings as navigation assumptions.
- **`smoke.spec.ts` "Marketing home loads" test was named correctly but tested the wrong content.** The test asserted `getByRole("heading", { name: "Business OS" })` at `/` — that was the old `WinstonPublicHome` component's heading. After the swap, `/` is Novendor marketing. Update the assertion to match the actual content, or make it structural (verify body renders, not redirect to login). Don't delete the test — the intent (verify `/` loads without error) is still correct.
- **`[environmentSlug]/page.tsx` unauthenticated branch had a hardcoded `/?returnTo=...` redirect.** This was not in the middleware — it was a server component using `redirect()`. Middleware audits don't catch server-component redirects. Always grep `redirect(` across all `page.tsx` and `route.ts` files separately.
- **Removing `/` from the middleware matcher is the right call, not adding a pass-through.** Once marketing owns `/`, there's nothing for middleware to decide there — no session check needed, no redirect needed. Removing it from the matcher means Next.js never invokes middleware on that path. Cleaner than a `return NextResponse.next()` no-op.
- **Route group rename (`m/` → `(marketing)/`) is atomic and zero-downtime.** Next.js route groups don't appear in URLs. The rename is invisible to external links, existing bookmarks, and crawlers. The 280 build pages all resolve the same after the rename. The only visible change is that `/m/about` is gone and `/about` is live — but `/m/` was never externally linked.
- **Check for toast artifacts on marketing by inspecting SSR HTML.** `ToastProvider` renders a `[role=region]` container with the toast viewport. Grep the rendered body for `toast-viewport` or the `radix-ui` data attributes. In our case: clean. The provider provides a context, not visible DOM, unless a component calls the API.
- **The `src/app/public/` folder stays — the 308 redirect in `next.config.js` covers it.** Don't delete `src/app/public/` in Phase 3 — the page file at `src/app/public/page.tsx` and `src/app/public/onboarding/page.tsx` can be safely ignored because the `redirects()` config in `next.config.js` intercepts those paths before Next.js routes them. Delete the files in a Phase 6 cleanup pass.

## Marketing merge — Phase 4: SEO activation (2026-04-23)

Added `robots: { index: true, follow: true }` + `metadataBase` to `(marketing)/layout.tsx`. Created dynamic `app/robots.ts` and `app/sitemap.ts`. Deleted `public/robots.txt`. No DNS, no forms, no search.

- **`NEXT_PUBLIC_MARKETING_ORIGIN` must be set per Vercel environment, not just production.** Production: `https://novendor.ai`. Develop/preview (paulmalmquist.com branch): `https://paulmalmquist.com`. Without the develop value, the sitemap on develop would emit `novendor.ai` canonical URLs — making Google potentially index dev URLs as production canonical. The env var is the single source of truth for every origin-dependent string: `metadataBase`, `robots.txt` sitemap pointer, and sitemap `<loc>` entries.
- **Delete `public/robots.txt` the same commit you add `app/robots.ts`.** Next.js precedence is undefined when both exist — in practice, the static file in `public/` may win over the dynamic route, or they may conflict depending on the build. Leaving both in place is a silent correctness bug. The transition is atomic: one PR removes the static file and adds the dynamic handler.
- **The static `public/robots.txt` pointed at the old paulmalmquist.com sitemap.** After DNS cutover, this would have been wrong (sitemap at the wrong domain). The dynamic `app/robots.ts` reads `NEXT_PUBLIC_MARKETING_ORIGIN` and always emits the correct sitemap URL for the current environment.
- **`metadataBase` in a nested layout works as a subtree override.** The root `src/app/layout.tsx` has no `metadataBase`. The `(marketing)/layout.tsx` adds one. Next.js uses the nearest ancestor's `metadataBase` when resolving relative OG/Twitter image URLs in page-level metadata. Winston app routes (`/app/*`) inherit the root (no metadataBase) — they won't accidentally use `novendor.ai` as an image base.
- **`alternates.canonical: "/"` in the layout sets the default canonical for every marketing page.** Per-page overrides (e.g., `alternates: { canonical: '/about' }`) in individual `page.tsx` files will take precedence. The layout default is a safety net for pages that don't declare their own canonical.
- **Sitemap content-reader try/catch is load-bearing, not defensive paranoia.** `getAllDocs()`, `getAllInsights()`, and `getAllResearchEntries()` read from the filesystem at build time. If the build runs in an environment where the `content/` directory is missing (e.g., a Docker layer that only includes `src/`), a hard throw would break the entire build. Silent fallback to empty arrays is correct — a sitemap with only static routes is better than a failed deploy.
- **`/robots.txt` and `/sitemap.xml` both prerender as `○` (static).** Next.js statically evaluates the exported functions at build time when no dynamic data (cookies, headers, `generateMetadata` with external fetch) is involved. This means the sitemap is baked at deploy time — it won't reflect content added after the last deploy until the next build. That's acceptable for a marketing site updated via MDX commits.

## Marketing merge — Phase 5 / post-cutover fixes (2026-04-23)

DNS cutover complete: novendor.ai → Vercel. Added account icon to marketing topbar. Verified all routes live.

- **A 404 inside the marketing shell after DNS cutover is usually the old site, not a code bug.** During DNS propagation, some visitors still hit the GitHub Pages origin. The old Consulting_site had its own sidebar that rendered a 404 for routes that didn't exist there. If you see the marketing shell + 404, check whether the URL is resolving to the old IP first (`nslookup novendor.ai`) before touching any code.
- **`echo "value" | vercel env add` appends a trailing newline.** Use `printf "value"` instead. The trailing newline embeds in the env var value, which then emits as a line break in `robots.txt` (`Sitemap: https://novendor.ai\n/sitemap.xml`) and in every sitemap `<loc>` URL. The build succeeds silently — only inspecting the live endpoint reveals the bug. Always verify env-var-driven URLs in the live output after deploy, not just in the build log.
- **Pre-add Vercel domains before the registrar switch.** Adding `novendor.ai` and `www.novendor.ai` to the Vercel project while DNS still points at GitHub Pages starts the TLS cert challenge early. By the time you flip the registrar records, the cert is already staged — no cold-start delay after propagation.
- **Soft cutover: add new records before deleting old ones (except conflicting CNAMEs).** For A records, GoDaddy stacks them — old GitHub Pages IPs coexist briefly with the new Vercel IP. Fine. For CNAME www, you cannot have two — delete the old one when adding the new one. The apex A records overlap is actually useful: gives you 10–15 min to watch Vercel go active before the old records fully propagate out.
- **Account icon in marketing needs only a cookie check, not a session provider.** Reading `document.cookie` for `bm_session=` is enough to decide `/login` vs `/app`. No `useSession`, no `WinstonProviders`, no context — just a `useEffect` that runs on the client after hydration. Defaults to `/login` on SSR (safe for unauthenticated visitors); updates on mount if cookie is present.
- **One domain migration at a time.** The temptation to wire paulmalmquist.com → repo-b at the same time as novendor.ai → repo-b is real. Resist it. Two simultaneous domain migrations means two blast radii, two rollback surfaces, and two things to debug if something goes wrong. novendor.ai first, soak 7–14 days, then paulmalmquist.com.
- **`DATABASE_URL` / `PG_POOLER_URL` must be set in Vercel Production for login to work.** `issuePlatformSession` in `platformAuth.ts` calls `withTransaction` → `getPool()`, which returns `null` when neither env var is present, throwing "Database pool not available". That raw message was leaking to the UI. Fix: (1) set `PG_POOLER_URL` (Supabase transaction pooler URL) in Vercel Project → Settings → Environment Variables → Production; (2) the session route now returns 503 with a clean user message when the pool is unavailable; (3) `WinstonLoginPortal` normalizes all 5xx / infra error messages client-side to "Login is currently unavailable. Please try again shortly." Log the real cause server-side via `console.error` so it appears in Vercel runtime logs.
- **`@font-face` with only a `url()` source will 404-spam if the font file is absent.** Adding `local('Abadi')` as the first `src` candidate means the browser checks system fonts first and never makes the network request on macOS (which ships Gill Sans / Abadi-family). Only add the `url()` WOFF2 when the file is actually deployed. The fallback stack still applies.
- **Always provide a static `/public/search-index.json` placeholder when the search build script is not yet wired in.** `InlineSearch.tsx` `fetch('/search-index.json')` fires on every marketing page mount. A missing file causes a 404 on every page load in the browser. A 20-byte `{"documents":[]}` placeholder eliminates the noise until the real build script is wired into `prebuild`.
- **`BM_SESSION_SECRET` is required in Vercel Production to sign JWTs.** `signPlatformSession` in `sessionAuth.ts` reads `BM_SESSION_SECRET || AUTH_SESSION_SECRET || NEXTAUTH_SECRET` and throws "BM_SESSION_SECRET (or AUTH_SESSION_SECRET) must be configured" when all are blank. This is a 500 at `/api/auth/session` after Supabase auth succeeds but before the JWT cookie is issued. Generate a production secret with `openssl rand -hex 32` — never reuse the local dev placeholder.
- **Full required env var checklist for repo-b Production login:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser Supabase client), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side identity fetch), `DATABASE_URL` or `PG_POOLER_URL` (platform_users / environment_memberships queries), `BM_SESSION_SECRET` (JWT signing). All 6 must be present or `/api/auth/session` returns 500. Missing any one of them silently fails at a different step in the same request.
- **Always `cd repo-b/` before running `vercel` CLI for novendor.ai.** The repo root contains a different `.vercel/project.json` (consulting-app project). Running `vercel env add` or `vercel deploy` from the repo root silently targets the wrong Vercel project. `BOS_API_ORIGIN` got set on consulting-app instead of repo-b, leaving repo-b's proxy falling back to `https://api.novendor.ai` (nonexistent) → 502 on every `/v1/*` call → empty environments list.
- **`BOS_API_ORIGIN` is required in Vercel Production for repo-b.** Without it, `inferBosOrigin()` in `bosProxy.ts` constructs `https://api.<hostname>` from the request host header. For novendor.ai that becomes `https://api.novendor.ai` which has no DNS record. Set it to the Railway service URL: `https://authentic-sparkle-production-7f37.up.railway.app`. All `/v1/*` and `/bos/*` proxying depends on this var.

## Pitch Forge (2026-04-26)

- **Bound the AI loop before writing any prompts.** The first thing to design is the exit condition, not the prompt. For Pitch Forge: max 3 iterations, enforced at the DB layer (CHECK constraint + app raise), not just in prompt instructions. If you only enforce it in prompts, a bad AI response can silently loop.
- **Separate DB service from AI orchestration.** `pitch_forge.py` (DB) and `pitch_forge_ai.py` (AI) stay separate. The route layer calls both. This makes each testable independently and prevents the AI layer from making undiscoverable DB calls.
- **Embed banned phrases in the prompt, not just in post-processing.** The red team prompt and final output prompt both include the full banned phrase list. This reduces the chance the AI generates them in the first place. Post-processing check (`check_banned_phrases`) is a safety net, not the primary gate.
- **Every AI kill must have a specific criterion, not a vague summary.** The red team prompt requires a named criterion (from a fixed list: `generic_language`, `no_economic_delta`, etc.) plus a client-specific reason. "Weak overall" is rejected at parse time. This is what makes the red team useful instead of annoying.
- **Fatal / fixable / acceptable / missing-input is the right 4-way distinction.** Looping forever because the AI calls everything fatal is as bad as never flagging anything. Giving the AI these 4 categories forces it to distinguish between "kill it" and "fix this specific thing."
- **Seed data should include intentional flaws.** Each seeded use case has a documented `flaw` field. This is what makes the red team demo credible — it finds real problems in real use cases, not a sanitized toy example. Without flaws, the demo just shows "AI approved things."
- **`NOT AVAILABLE: <reason>` is a content pattern, not just a UI label.** Gaps in `pf_claim` with `is_available=false` surface through the full pipeline: research synthesis, use case generation prompts, and the research board UI. The claim text is the canonical record; the UI renders it with a visual label.
- **Score weights must sum to 100 — tested.** The score breakdown is: specificity 25 + economic_value 25 + client_fit 20 + evidence_quality 15 + demo_readiness 15 = 100. If weights are adjusted, the test `test_score_weights_sum_to_100` will fail. This is intentional.
- **The frontend for this pattern is a 4-tab operating surface, not a form.** Research Board → Pitch Builder → Red Team Panel → Final Output. Each tab shows a different stage of the pipeline. The user advances by clicking AI action buttons, not by filling in forms. This is what makes it feel like an operating surface rather than a report viewer.

## Adding a new vertical environment (e.g. Supply Chain · 2026-04-27)

Three edits register a new top-level Winston environment vertical. Miss any one and the env appears broken in subtle ways:

- **`repo-b/src/components/lab/environments/constants.ts`** — three places: the `industries` tuple, `INDUSTRY_DISPLAY_MAP`, and a new `isXEnvironment` predicate plus a clause inside `resolveEnvironmentOpenPath`. The resolver clause is what makes "Open" from the env list route to your custom URL slug.
- **`repo-b/src/components/lab/LabEnvironmentShell.tsx`** — append your URL slug to the `isDomainRoute` regex (around line 167). Without this, the generic department/capability shell will render *on top of* your custom shell. Easy to miss because nothing throws — you just get visual clutter.
- **`repo-b/src/components/lab/LabEnvTopBar.tsx`** — if your custom shell has its own top bar, suppress the parent `LabEnvTopBar` for your slug (the file already has a list of slugs — just add yours). Otherwise you get a duplicate workspace identity bar above your top bar.

Convention: one typed seed module per vertical at `repo-b/src/lib/<slug>/seed.ts` with a `// SEED DATA — replace with API in next pass` header comment. Use `bm-*` Tailwind tokens (`bg-bm-bg`, `bg-bm-surface/35`, `border-bm-border/70`, `text-bm-muted`, `text-bm-accent`) for chrome — they already adapt to `data-theme`. For status-coded chips (red/amber/green), define light defaults plus `dark:` overrides; relying on a single color set never holds across both themes.

The repo's `darkMode` config is `["selector", "html:not([data-theme='light'])"]`, so the `dark:` variant applies whenever `<html>` does *not* have `data-theme="light"`. Light mode is the explicit case; dark mode is the default and applies on initial SSR before the ThemeProvider mounts.

For the demo pass, skip `DomainEnvProvider` entirely — it eagerly hits `/v1/environments/:id` and a domain-context endpoint, both of which fail if the env doesn't have a real DB record. Pass `envId` directly from your layout's `params`. When you actually have backend rows, swap to `DomainEnvProvider` later — the upgrade is local to the layout file.

## Marketing design system (`(marketing)` route group)

The marketing surface uses its own design system (`docs/assets/Novendor_Design_System.html`) scoped to the `.marketing-shell` wrapper in `repo-b/src/app/(marketing)/layout.tsx`. Don't confuse it with Winston/Bloomberg — they share zero tokens.

- **Route group is `(marketing)`, not `/m/*`.** URLs are still `/`, `/about`, `/the-shift`, etc. The folder is parenthesized to keep the route group out of URLs.
- **Theme attribute lives on `.marketing-shell`, not `<html>`.** The root `<html data-theme="dark">` belongs to Winston/Bloomberg; never touch it from marketing code. Marketing's theme is a separate `data-theme="dark|light"` on the `.marketing-shell` div, with parallel token blocks in `marketing.css`.
- **Light mode is parallel tokens, not inverted colors.** Same `--nv-*` token names, different values per theme. Components reference tokens only and never know which theme is active. Don't reach for Tailwind `dark:` utility classes inside marketing — that creates a third theming source on top of the token system.
- **Tailwind radius collision.** Inside `.marketing-shell`, `rounded-lg` / `rounded-xl` / `rounded-2xl` are 6px (Bloomberg/Winston legacy override in `tailwind.config.js`). Use `rounded-nv-sm/md/lg/xl` for the design system's intended 4/8/12/18px. Same with spacing — use `mt-nv-section` (96px) over `mt-24` for semantic intent.
- **Fonts.** Marketing loads Geist + Geist Mono via the `geist` package (`geist/font/sans` and `geist/font/mono`). They expose `--font-geist-sans` / `--font-geist-mono`; `marketing.css` aliases them to `--font-marketing-sans` / `--font-marketing-mono`. Abadi (display) is shipped as TTF in `repo-b/public/fonts/Abadi-{Regular,Bold}.ttf` with `local()` first in `@font-face`, and weight 500 is mapped onto Regular because the Abadi package has no native Medium cut.
- **No italics in marketing prose.** The design system bans italics. `<em>` resolves to `font-style: normal; color: rgb(var(--nv-accent-teal))` via the `.nv-prose` and `.nv-h1` rules. If a component renders italic text, it's a bug.
- **Don't reintroduce a global heading rule on `.marketing-shell`.** A previous `.marketing-shell h1, h2, h3 { @apply font-semibold tracking-tight }` blanket override was removed because it overrode the per-class `.nv-h1` / `.nv-h2` / `.nv-h3` typography. All headings should use the `.nv-h*` classes explicitly.
- **`text-wrap: balance` belongs on display headings only.** It's set on `.nv-h1` / `.nv-h2` / `.nv-headline`. Don't move it back to `.marketing-shell` — it produces ragged short lines on body paragraphs.
- **React primitives (`NvButton`, `NvCard`, `NvHero`).** Use these for buttons, surface cards, and hero blocks. Don't hand-roll `rounded-full bg-slate-900/55` — that's the generic-SaaS look the redesign is moving away from. Pass `variant="primary|secondary|ghost"` to `NvButton`; `padded` and `liftOnHover` to `NvCard`.
- **MarkdownRenderer uses `.nv-prose`.** Editing Tailwind `prose` overrides to style markdown is a dead end inside marketing — the `nv-prose` ruleset in `marketing.css` is the source of truth.
- **Marketing CSS is fully scoped under `.marketing-shell`.** No marketing rule can leak into `/app`, `/lab`, `/operator`, or `/login` unless someone edits `repo-b/src/app/globals.css`. Don't.
- **Theme selectors on `.marketing-shell` must use `.marketing-shell[data-theme="light"]`, NOT `[data-theme="light"] .marketing-shell`.** The descendant form matches whenever any ancestor (notably `<html data-theme="light">` set globally by Winston) has the attribute, so Winston's user-toggled theme silently overrides marketing's wrapper-scoped theme. Use the same-element selector form. Same rule for descendant overrides: write `.marketing-shell[data-theme="light"] .nv-card`, never `[data-theme="light"] .nv-card`.
- **Smoke a marketing change against an HTML-light environment.** `<html data-theme>` reflects Winston's app-wide theme, which can be `light` whenever a user has toggled it that way. If your marketing CSS responds to the wrong cascade, you'll only notice when a user happens to be in light mode — i.e., never in your dev session. Either explicitly set `<html data-theme="light">` while smoke-testing or run `repo-b/scripts/marketing-smoke.mjs`, which captures `htmlTheme` and `shellBgVar` and will catch this kind of cascade leak.
- **Don't `npm run build` against a running `npm run dev` in the same directory.** Both write to `.next/`. If `dev` was started first, `build` will overwrite the dev chunks and the dev server will keep emitting 404s for `/_next/static/...` until you restart it. You can detect this with a single `curl http://localhost:3000/_next/static/css/app/layout.css` — a 404 there means dev is broken even though the page HTML still serves. Either stop `dev` before running `build`, or `build` from a separate worktree.
- **Marketing hero background images live at `/public/assets/bg-{home,repe,consumer,medical,legal}.jpg`.** The path map is in [`src/lib/marketing/industryThemes.ts`](repo-b/src/lib/marketing/industryThemes.ts) (`industryBackgrounds`, `HOMEPAGE_BACKGROUND`). The `<HeroBackground>` component checks each path with `fileExistsInPublic()` (server-side `fs.statSync`) and falls back to an on-brand gradient when the file is missing — so a missing JPEG never crashes the build. To add a real image, just drop the file in; no code change needed.
- **`<HeroBackground>` is the full-bleed escape from `.nv-page`.** Render it OUTSIDE the `.nv-page` container so the image can span the viewport, then continue the page content inside `.nv-page` with `paddingTop: 0` to avoid a double top-pad. Inside the hero-bg, `.nv-hero` automatically drops its bottom border (the image edge replaces the hairline divider).

## Trading Analytics Copilot (2026-05-09)

- **The Energy Trading Command Center is additive to Trading Platform.** Keep `/lab/env/[envId]/markets` as the default Trading Platform workspace. The interview analytics demo lives at `/lab/env/[envId]/trading` and needs the same immersive-shell exclusions as `/markets`.
- **Trading analytics demo data is fixture-labeled, not live.** Seed with `python backend/scripts/seed_trading_analytics_demo.py --env-slug trading`; the script prints the resolved `env_id` and writes `source='demo_fixture:v1'`. Do not claim Bloomberg/ICE/CME/live coverage unless a real feed replaces the fixtures.
- **Use migration 610 for the trading analytics tables.** Apply with `cd repo-b && node db/schema/apply.js --files 610`, then seed. The backend endpoints are under `/api/trading/v1/environments/{env_id}/...`, separate from the older `/api/v1/trading` write API.

## Enterprise OIDC (2026-05-11)

- **`bm_session` is the one session cookie.** OIDC callbacks mint the same HMAC-signed JWT shape the Supabase login issues (see `backend/app/auth/session_mint.py` mirroring `signPlatformSession` in `repo-b/src/lib/server/sessionAuth.ts`). Middleware, `apiFetch`, `isPlatformAdminSession`, and the environment switcher stay untouched. If you add a third sign-in path, mint `bm_session` — do not invent a parallel cookie.
- **JWKS belongs in-process, even when Redis is in `requirements.txt`.** A round-trip to Redis on every request regresses p50 for what is a 5 KB hot blob. `backend/app/auth/oidc_keys.py` uses a singleton `OidcKeyResolver` with a 1 h TTL and refresh-on-kid-miss. Same lesson applies to any small, frequently-read piece of authentication state — keep it in-process unless you measure a reason to move it.
- **Audit denials, not just successes.** Every `gate_app_role` 403 writes a `permission.denied` row to `app.audit_events` carrying `action_attempted`, `permission_checked`, `user_app_role`, and `user_membership_role`. Auditors ask for denials before successes, and the storage cost is zero compared to a single login session.
- **Group → role mapping uses immutable group IDs, never display names.** Both Okta (`00g...`) and Entra (group object IDs) expose stable IDs. Display names rename without warning and silently grant or revoke access if you key off them.
- **Backend is authoritative for `enabled`.** The Next.js OIDC routes may pre-check `identity_providers.enabled` to skip the redirect for UX, but `backend/app/routes/auth_oidc.py:exchange` re-checks. Disabling a provider in the DB must stop logins even if a stale Next.js cache says otherwise.

## Planning System Notes (2026-05-16)

- `docs/plans/` is the durable planning and coding-session orchestration layer. It covers all 13 major product environments.
- Every coding session should read `docs/plans/<environment>/next-session.md` before writing code and update it before finishing.
- Every coding session should write new bugs to `docs/plans/<environment>/backlog.md` and durable architecture discoveries to `docs/plans/<environment>/architecture.md`.
- Reusable repo-wide lessons belong here in `docs/tips.md`, not buried in environment-specific plan files.
- `docs/plans/README.md` is the index. `docs/plans/PLAN_MAINTENANCE_RULES.md` is the rule set.
- `docs/plans/_templates/` contains reusable scaffolds for adding new environment folders.
- Implementation tickets live in `docs/plans/03-implementation-plans/active/`. File naming: `NNNN-environment-short-title.md`. Each dispatch record classifies by environment, shared standard impact, deliverable type, and required reading — filling this out before coding is the discipline that keeps sessions from sprawling.

## Leaflet Dark Mode (2026-05-16)

- **Leaflet tooltip content is injected as static DOM into `document.body`, outside the React tree.** Tailwind `dark:` classes on the map container or parent do not cascade into `.leaflet-tooltip` — the tooltip renders in light mode even when the rest of the page is dark. Fix with a global CSS override: `.dark .leaflet-tooltip { background: var(--bm-surface); color: var(--bm-text); border-color: var(--bm-border); }`. Add this to the REPE environment's CSS or to `repo-b/src/app/globals.css` scoped under `.dark`.
- **Leaflet tile layers are always light (OpenStreetMap default).** In the dark operator shell, OSM light tiles produce a bright white map inside a dark panel. Swap the `url` prop on `<TileLayer>` to a dark-appropriate tile: CARTO Voyager Dark (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`) works well and requires only attribution update. No library change needed.
- **Leaflet `FitBounds` zoom resets on every client-side filter change if it depends on filtered array references.** The `useEffect` dep array `[assetPoints, marketPoints, map, viewMode]` fires every time the filtered arrays are new references (every `useMemo` recompute). Fix: pass a `fitKey` string prop that only increments when a new server response arrives. The `FitBounds` dep array becomes `[fitKey, map, viewMode]` — client-side filter changes no longer reset zoom or pan.
- **Leaflet map marker selection resets on API refetch if `setSelection` is unconditional.** If `setSelection({ mode: 'portfolio' })` is called in every `.then()` callback, it fires on every filter change that triggers a new API call, even when the selected entity exists in the new result. Fix: use the functional `setSelection((prev) => ...)` form and check whether the previously selected `assetId`/`marketKey` exists in the new result set before resetting.
- **`FundFootprintMap.tsx` and similar components use hardcoded light hex colors** (`#F8FAFC`, `#0F172A`, `#64748B`). These must be replaced with Tailwind semantic dark variants or CSS vars. Pattern: `text-[#0F172A]` → `text-slate-900 dark:text-slate-100`, `bg-[#F8FAFC]` → `bg-slate-50 dark:bg-bm-surface`.

## XIRR Sparse-History Guard (2026-05-18)

- **XIRR bisection produces extreme outliers for funds with sparse cash flow history.** When a fund has fewer than 4 cash flow entries, the bisection algorithm can output values like 456% or 366%. These are not plausible IRRs — they are artifacts of extreme compounding over a single short interval (e.g., one contribution + one NAV snapshot). The guard `if len(cashflows) < 4: return None` eliminates these before they reach any display path.
- **The sign-change check is also necessary.** `xirr()` must return `None` when all cash flows have the same sign. A fund with only capital calls and no distributions has no IRR by definition.
- **Null-reason codes must flow from the computation engine to the display layer.** `irr_engine.py → _xirr_from_series → compute_fund_rollup → FundRollup.null_reason → _v2_canonical_metrics null_reasons dict → LpSummary.fund_metric_null_reasons → UnavailableTile`. Breaking any link in this chain silently restores a raw number.
- **LP summary reads from `re_fund_metrics_qtr`, not from canonical_metrics.** A plausibility gate must live in `re_sale_scenario.get_lp_summary` (not just in canonical_metrics) because LP summary has its own read path from the metrics table. Check `abs(raw_irr) > 2.0` → `"irr_implausible_early_period"` before returning the payload.
- **`UnavailableTile` does not accept a `size` prop.** The full-card null-state component has `{ label, nullReason, className? }` — no `size`. If a KPI grid uses `MetricCard` with `size="large"`, switch to a conditional render: `{nullReason ? <UnavailableTile label=... nullReason=... /> : <MetricCard ... size="large" />}`.
