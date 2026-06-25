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
- Direct-FastAPI clients (no Next proxy) drift silently: if `repo-b/src/lib/*/client.ts` paths or response shapes diverge from the shipped backend routes, nothing fails at build/typecheck — it only 404s at runtime. The HR research client is the shipped contract: `/api/hr/v1/research/*` with `GET enhancement-candidates` returning the `{ count, candidates }` wrapper (not a bare array), and `IngestResult` carrying `confidence`/`degraded`/`warnings`/`brief.freshness_score`. Pin it with a contract test that mocks `fetch` and asserts the exact URL + wrapper shape per function (`src/components/historyrhymes/historyrhymesClientContract.test.ts`) so drift fails CI, not production. When reconciling drift, fix the client to the tested backend — do not rename backend routes to chase the client.
- Route tests for a new `app.routes.<x>` module that imports `get_cursor` directly: patch `app.routes.<x>.get_cursor` locally in the test file (reuse `tests.conftest.FakeCursor`) rather than appending to the shared `_GET_CURSOR_TARGETS` list — same result, minimal blast radius. The shared `fake_cursor` fixture only covers `app.services.*` import sites.
- Scheduled-job → orchestration-route bridge: when a job needs the same orchestration an HTTP route already performs (run tracking + extract + persist), make the scheduled script a thin HTTP submitter to that route, not a second in-process re-implementation. Keeps the route the single orchestration path (no duplicated logic/entropy) and needs zero changes to the working, tested route. Use stdlib `urllib` (no `requests` in `backend/requirements.txt`) + a configurable base URL (`$HR_RESEARCH_API_BASE`). Contrast: `scripts/hr_weekly_brief.py` writes execution-layer tables in-process — fine because no route owns that orchestration. Decide by "who owns the orchestration," not by habit.
- Make submitter scripts unit-testable offline: keep pure helpers (metadata derivation, payload build) separate from I/O, and resolve the network transport at call time (`post = _post or _default_post`) so a module-level `monkeypatch.setattr(mod, "_default_post", fake)` works — a transport bound as a default arg is frozen at def-time and silently hits the real network in tests.
- Exit-code semantics for fail-closed ingest jobs: a *degraded* extraction (route returns HTTP 200, persisted, warnings, zero candidates) is a successful ingest → exit 0. Reserve exit 1 for genuine submission failures (network / non-2xx / unreadable input). Conflating the two makes schedulers alarm on healthy fail-closed runs.
- `scripts/` is not a Python package; to unit-test a script, `sys.path.insert(0, repo_root/"scripts")` in the test then `import <script_module>`. Mirrors how `scripts/hr_weekly_brief.py` adds `backend/` to `sys.path` at runtime.
- `POST /api/hr/v1/research/briefs` is NON-idempotent: no `ON CONFLICT`, no UNIQUE on `hr_research_briefs.brief_date` — every submit appends a new brief row + a fresh candidate set. `…/briefs/latest` reflects the newest, so a corrected re-run "wins" for the UI but stale earlier rows persist. Schedulers/retries must expect append semantics (operational handling in `docs/historyrhymes/HR_WEEKLY_RESEARCH_INGEST_RUNBOOK.md`). Don't add dedupe reflexively — "latest wins" is acceptable for v1; only revisit if duplicate accumulation becomes a real problem.
- Deterministic delta computation (Morning Book pattern): a "what changed since last period" surface must be observational, not interpretive — no narration, no inference, no LLM. Emit a bullet only when verifiable from structured fields, in a FROZEN order the renderer never reorders/sorts. Never return an empty changes list — emit an explicit dimension-naming no-change marker (`"No material regime, confidence, risk, or enhancement changes vs previous brief."`) so the operator always sees a verdict. Keep `current_regime` raw (the source field verbatim) — no enum/registry/ontology normalization.
- Triage / urgency clamp under degraded data: when the upstream parser flags input as degraded (`parsed_json.degraded`) or there is insufficient history, clamp the urgency label to its lowest tier (`Research Only`) and emit a warning — never let a bad parse produce fake urgency. `backend/app/services/hr_morning_book.py:_triage` checks the clamp first, before any escalation rule. Non-negotiable guardrail; future agents must not weaken it.
- `ORDER BY created_at DESC LIMIT 2` is the state-transition primitive for "latest vs previous" surfaces (e.g. `hr_morning_book` route). It survives the non-idempotent append semantics of `hr_research_briefs` — "latest" is whichever row was ingested last regardless of duplicate `brief_date`s. One route, two queries (briefs `LIMIT 2`, then candidates `WHERE brief_id = ANY(%s)`), group in Python — keeps the route the single orchestration owner for the delta and avoids a third round-trip.
- Distinguish "not yet populated" from "broken" in operator surfaces: a Morning Book with <2 briefs is initialization, not failure — surface a dedicated `"… operating in initialization mode."` warning alongside the specific cause. An operator must be able to tell a cold-start system from a degraded one at a glance.
- Route tests for a new `app.routes.<x>` module that imports `get_cursor` directly: patch `app.routes.<x>.get_cursor` locally in the test file (reuse `tests.conftest.FakeCursor`) rather than appending to the shared `_GET_CURSOR_TARGETS` list — same result, minimal blast radius. The shared `fake_cursor` fixture only covers `app.services.*` import sites.
- HR cockpit streaming: `HrSignalEvent.dedupe_key` is a `@property` (NOT an attribute named `idempotency_key`). The SQL column is `idempotency_key`; capture it as `dedupe_key = event.dedupe_key` once at the top of `persist_event` and use that local throughout. Model field for window is `event.window`; the schema column name is `window_label` — use the model field, bind with the column name alias in the INSERT.
- HR streaming health: the `hr_stream_health` table is a singleton (CHECK id=1). The health route reads from it in replay/live modes. Test environments have no real DB, so the route correctly falls back to `disconnected` + "health db unavailable" — patch the test assertion to match that, not the old "not implemented" string.
- HR cockpit Vitest mocks: when `HistoryRhymesCockpit` adds a new fetch call (e.g. `fetchStreamHealth`, `fetchStreamSignals`), add it to the `vi.mock("@/lib/historyrhymes/client", ...)` factory immediately — Vitest surfaces "No X export is defined on the mock" as a runtime error, not a type error.
- HR cockpit nav: `isHrItemActive(pathname, envId, "")` — the empty slug covers both the index route and `/routine` (plus `/routine/*` sub-paths). The `/routine` route is an alias for the cockpit, not its own nav item. All new nav items get an entry in `hrNav.ts` only; both the desktop rail and mobile drawer consume `HR_NAV` from that single file.
- HR calibration: `hr_agent_calibration.rolling_90d_brier` and `hr_predictions.brier_score` exist in the database but `GET /api/hr/v1/calibration/summary` is not implemented. The `CalibrationStatus` component is the honest planned-not-available surface — it names the DB fields explicitly and states the missing endpoint. Never fabricate or approximate calibration metrics in the UI.
- HR rhymes proxy: `fetchRhymesEpisodes` / `postRhymesMatch` / `fetchRhymesAlerts` / `acknowledgeRhymesAlert` all use same-origin relative paths (`/api/v1/rhymes/*`), NOT `NEXT_PUBLIC_API_BASE`. They go through the existing Next proxy at `repo-b/src/app/api/v1/rhymes/[...path]/route.ts`. `fetchHrState` / `fetchLatestDecision` etc. use `NEXT_PUBLIC_API_BASE` directly. Never mix the two conventions in the same file.

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
22. Fail-closed write-path validation: when a write accepts keys that must exist in a reference table, validate the **resulting** state (merge the update with the existing row for fields not in this request — don't validate only the delta) against the reference tables, and raise a typed error (e.g. `HierarchyValidationError(ValueError)`) the route maps to a **clean 400**, never a 500, never a silent write. Put a **DB-free fast path first**: if there's nothing to look up (all keys NULL / flat), `return` *before* opening a cursor — a flat/Ungrouped case must validate with no DB round-trip (also makes it unit-testable without a DB). Sentinel `_<field>_set` flags let an explicit `null` clear a field (vs. "not provided"); mirror the existing `_*_set` pattern in the service. (Pattern: Ticket 5 `validate_hierarchy` on `cro_execution_task`, 2026-05-19.)
23. Do not write a DB-backed test whose fixture calls `psycopg.connect`/opens a pool — in a no-`DATABASE_URL` unit run it does **not** skip cleanly, it **hangs** on connection timeout (psycopg pool waits ~5s then a fixture that retries can block the whole suite). `pytest.mark.skipif(not os.environ.get("DATABASE_URL"))` is unreliable if any `.env` sets it. Prefer FakeCursor-driven unit tests for branch logic + a documented manual `supabase db query --linked` check for the live path; if you must have a DB test, gate it behind an explicit opt-in marker, never a default-collected test. A hanging test is worse than no test. (Learned Ticket 5, 2026-05-19.)
24. **Read-time-derived views, not new tables.** When a "checklist"/"brief"/"digest"/"summary" feature wants to surface existing operational data through a different lens, **derive it at read time** from the source table via the existing service function (`list_tasks` in this case) — don't create a parallel table or persist the derived rows. The data already exists; what changed is the *view*. Same items can appear in multiple sections of the view because a view is not a partition (task in `top_priorities` AND in `web_properties` is correct). Persist only if a *later* ticket explicitly needs audit/review history, and then make that the migration's whole job. Cuts schema sprawl, eliminates a sync-drift class of bugs, and keeps the source-of-truth single. (Pattern: Ticket 6 Morning Checklist over `cro_execution_task`, 2026-05-20.)
25. **Grounded suggestions over fabricated ones.** When a UI surface offers "suggested prompts"/"recommended actions"/"quick links", emit each one **only when the underlying state actually contains the thing it would ask about** — never as a fixed menu. A `flowyorker` suggestion only when there's a web-property task; an `overdue` suggestion only when something is actually overdue. Each suggestion carries a `reason` string the user can see (`"3 overdue follow-up(s)"`) so the grounding is visible, not implicit. Honest empty state when there's nothing to suggest. Prevents the "AI suggestions" smell of a chatty UI promising things the data can't back up. (Pattern: Ticket 6 `_suggested_prompts`, 2026-05-20.)
26. **Don't expand the broad chat gateway for focused retrieval.** `backend/app/routes/ai_gateway.py` + `backend/app/services/ai_gateway.py` is a ~5000 LOC SSE streaming runtime with tool use, conversation persistence, RAG, model routing, and risky-action gating. When a feature only needs *read-only* retrieval grounded in a specific domain's data, **build a focused endpoint that returns structured JSON**, not a new path inside the gateway. The gateway can call your endpoint later if a chat surface needs it; the data layer guarantees the facts, the LLM only composes prose. Benefits: zero risk to existing chat behavior, deterministic intent classifier instead of an LLM round-trip, "no tools / no writes" becomes a structural invariant (`tool_calls: []` in the contract + a defense-in-depth source-code test that the module imports no writer entry points), tiny test surface (FakeCursor + mocked source-of-truth, no streaming/LLM mocks). When a chat UI later wants to expose the slice, it makes one HTTP call — not a tool-use migration. (Pattern: Ticket 7 `brief_assistant`, 2026-05-20.)
27. **Railway "Deploys have been paused temporarily" = wait, don't retry.** Railway throttles new builds during incidents; the CLI returns "Deploys have been paused temporarily" and your `railway up` adds to the queue without actually deploying. Running services keep serving the prior revision (so production is *not* regressed — only the new code is missing). Check the Railway status page; if it's an active incident affecting your plan tier, **stop pushing deploys** and document the pending state in the dispatch + backlog. Repeated `railway up` adds queue pressure without helping. The merge is durable; the deploy is mechanical and reversible — finish other work, redeploy when Railway is healthy. Verify `railway deployment list` against `git rev-parse origin/main` afterward to confirm parity. (Learned Ticket 7 during the 2026-05-20 Railway build-queue incident.)
28. **Scope DB cursors per unit of work — never hold one across a long multi-step run.** `get_cursor()` (`backend/app/db.py`) checks out a **whole connection** from a fixed pool (`max_size`). A service function that opens one `with get_cursor()` and holds it across many sequential steps (e.g. an 8-pass auto-generation loop) pins that connection for the *entire* run — often seconds. Under concurrency, N such requests pin N connections; once `max_size` is reached, **every** request that shares the pool blocks on acquisition — including light requests on the *same router* and beyond — and the route hangs (clients time out long before the pool's own `timeout` would fire). Diagnostic signature: one router hangs while sibling routers on the same process stay fast → suspect pool exhaustion from a long-held cursor in that router's hot path. Fix: wrap each independent step in its own short-lived `with get_cursor()` so the connection returns to the pool between steps; accumulate results in a plain dict, not in cursor state. Raising `max_size` is only margin — a long-held cursor still drains a bigger pool. Regression-guard it: instrument `get_cursor` in a test to assert max concurrent checkouts stays 1 and the function acquires one cursor per step. (Incident + fix: Ticket 7B `run_auto_generation`, 2026-05-21 — the consulting router hung 40–90s in production.)
29. **Sibling pages that hand-roll the same shell will drift — extract one frame.** The Consulting Revenue OS pages (Pipeline / Contacts / Tasks) each built their own `LeftSidebar` + 52px header + grid inline; over time they diverged (grid rows, `height:100%` vs `minHeight:100dvh`, brand-cell sticky behavior, content offset). Fix: one shared `ConsultingPageFrame` owns the chrome (brand cell, nav cell, header row, background, content region) and exposes slots (`headerContent`, optional `rightRail`) for per-page differences. But **don't force every page in** — Pipeline legitimately needs a 3-column layout with a header-toggled collapsible rail and a sticky-scroll board; wrapping it would special-case the frame into incoherence, so it keeps a bespoke shell and just *imports the shared constants/`winstonBrand`* so the brand can't drift. Two genuinely-similar pages share the frame; the one true outlier stays separate-but-aligned. Also: a nav item that deep-links into a *different route tree* (Consulting's "Accounting" → `/operator/*`) will never match the others' shell — that's an architecture fact, not a CSS bug; fix the label/scope, don't paper over it. (Pattern: Consulting shell-parity ticket, 2026-05-22 — `ConsultingPageFrame`.)
30. **Tenant/workspace labels must be data-driven, never hardcoded literals.** `OperatorShell.tsx` hardcoded `"Hall Boys"` in 5 spots (chip, heading fallback, drawer label, loading/error text). Hall Boys is one specific client environment — the literal bled into *every* operator workspace regardless of the active env, so Novendor's own accounting page read "Hall Boys Operating System". Always derive the label from the environment record (`environment.client_name` via the env-context provider) with a *generic* fallback (`"Operator"`), never a real tenant name as the fallback. A hardcoded tenant name is a forkability bug — it silently mislabels every other tenant. (Found + fixed in the Consulting shell-parity ticket, 2026-05-22.)

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
import os, psycopg, json
conn = psycopg.connect(os.environ['DATABASE_URL'])
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

- Superseded 2026-06-25: `config/instruction-routing.json` is the machine-readable routing source of truth. `CLAUDE.md` is the compact startup contract, not the complete route inventory.
- Claude Code discovers project skills under `.claude/skills/<name>/SKILL.md`. Generated wrappers delegate to canonical bodies under `skills/` or `.skills/`; edit the canonical body, then run `npm run generate:instructions`.
- `docs/instruction-index.md` is generated from the registry. Do not hand-edit its table.
- Root `agents/*.md` files are OpenClaw role contracts, not Claude Code subagent definitions.
- The validator must fail on missing route sources, missing Claude wrappers, duplicate IDs/commands, or unknown handoffs.
- Run `npm run generate:instructions`, `npm run validate:instructions`, and `npm run test:instructions` after routing, skill, or lifecycle changes.

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

## EnvironmentContract + Promotion Gate (2026-05-19)

- **Schema-file numbering has a reservation hazard.** `10003_consulting_task_hierarchy.sql` is *reserved by Dispatch 0002* but not yet written to disk — only `10000`–`10002` exist. Picking "highest on disk + 1" would have collided. Always check active dispatch records (`docs/plans/03-implementation-plans/active/`) for reserved-but-unwritten numbers, not just the filesystem. This work used `10004`.
- **`app.*` schema is exempt from the ARCHITECTURE.md public-prefix rule.** New governance tables (`app.environment_contract`, `app.environment_promotion_event`) go in the internal `app.` schema alongside `app.environments`/`app.environment_templates`. They are env_id-keyed and do NOT use the `public.*` `env_id TEXT + business_id UUID` + RLS template. No ARCHITECTURE.md prefix change is needed for `app.*` additions (but document the table in the §"Environment registries" section for discoverability).
- **`emit_log` is keyword-only and rejects `exc_info=`.** Signature: `emit_log(*, level, service, action, message, context=None, request=None, duration_ms=None, error=None)`. Pass the exception as `error=exc`. Passing `exc_info=` raises `TypeError` inside the logger (this is the exact bug Dispatch 0002 Ticket 1 fixed at `consulting.py:2449`).
- **New backend services that call `get_cursor()` must be registered in `backend/tests/conftest.py` `_GET_CURSOR_TARGETS`.** The `fake_cursor` fixture patches `get_cursor` at *each import site* (~200 entries). A new service file's `from app.db import get_cursor` is not patched until its dotted path is added to that list, so its tests will hit a real (absent) DB and fail confusingly.
- **`fake_cursor` is a single shared cursor across all `get_cursor()` blocks in one test.** Multiple `with get_cursor() as cur:` blocks all re-yield the same `FakeCursor`. `push_result([...])` queues one result set per `fetchone`/`fetchall` call, consumed strictly in query order across the whole call. When a service calls into another `get_cursor`-using module (e.g. `environment_templates_v2.get_template`), that module's queries also draw from the same queue — account for its (cache-dependent) `_load_templates_fresh` query, or rely on its `LookupError` fallback.
- **Fail-closed verifier rule: `pass` is the ONLY healthy status.** `fail` / `missing` / `unknown` / `not_available` are all non-pass and, if `severity=blocking`, force `eligible_for_promotion=False`. The single most dangerous failure mode is reporting a check as `pass` when its backing feature is unimplemented — e.g. capability binding (`environment_pipeline_v2._apply_template_metadata` is a no-op and there is no `app.environment_capabilities` table). Hard-code such checks to `not_available`/`blocking` until the feature actually exists; never silent-pass an unimplemented dependency.
- **`bosFetch(path)` is the frontend convention for backend calls; never hard-code an origin.** It prepends the same-origin `/bos` proxy prefix to any path and forwards to FastAPI via `BOS_API_ORIGIN`. `lab_v2.router` mounts at `/v2` with no extra prefix, so the frontend calls `bosFetch("/v2/environments/{id}/verify")`. There was no pre-existing frontend caller of `/v2/environments` — it is a newer backend surface.
- **`repo-b/src/app/lab/env/[envId]/blueprint/page.tsx` already existed as a `DomainPreviewState` placeholder.** "Create the blueprint page" meant *integrate additively* (render the new card above the existing preview), not overwrite — the route's layout (`DomainEnvProvider`/`DomainWorkspaceShell`, `useDomainEnv()` → `{envId, businessId}`) and preview intent were preserved.

### Ticket 2 — promotion state machine (2026-05-19)

- **A "read endpoint that writes" must make the write explicit and never touch promotion state.** Ticket 1's `verify_environment_contract` persisted `last_verification` on every GET. Ticket 2 split it: `materialize=False` (default, `GET /verify`) is a pure read; `materialize=True` (`?materialize=1` and the gate) records the report. Either way it NEVER transitions `promotion_state` or writes the event log. Contract-row derivation at `draft` on first touch is a separate, documented kind of materialization (not a promotion) — that distinction kept Ticket 1 tests green with zero edits.
- **Mirror the DB promotion guard in Python so the gate fails closed with a clean 4xx before the trigger ever raises.** `_LEGAL_TRANSITIONS` in `environment_contract_v2.py` is kept in lockstep with the `environment_contract_enforce_promotion` trigger (migration `10005`, mirroring `re_authoritative_enforce_promotion` from `459`). The trigger is the real backstop; the Python copy turns a would-be raw `psycopg` `P0001` 500 into a structured 409. If you change one, change both.
- **The released-immutability trigger needs `updated_at` in its allowed-keys list.** `app.environment_contract` has a separate `BEFORE UPDATE` `updated_at` touch trigger. If the promotion-guard's `to_jsonb(NEW) - allowed_keys <> to_jsonb(OLD) - allowed_keys` immutability check omits `updated_at`, every legitimate allowed-field update on a released row falsely trips "payload immutable". Allowed keys for env contract: `promotion_state, last_verification, last_verified_at, verified_by, released_at, released_by, updated_at`.
- **The gate must re-verify fresh, never trust a cached report.** `assert_environment_promotable` calls `verify_environment_contract(..., materialize=True)` itself and decides on that result. A promotion that reads a stale `last_verification` is a fail-open hole. Mirror `re_trace_gate.assert_fund_traceable`: typed result on success, `HTTPException` on refusal, downstream transition unreachable otherwise.
- **`supabase db query --linked` aborts the whole batch on the first error and returns a 400** — which is exactly what you want for validating a fail-closed trigger: wrap `BEGIN; <migrations>; <illegal UPDATE>; ROLLBACK;` and the expected `P0001` proves the guard fires AND nothing persisted. To validate the *legal* path, put the only intentional failure last (e.g. a final `released→draft`) so everything before it is exercised before the abort.
- **A no-param collection route (`/environments/promotion-drift`) declared after `/environments/{env_id}/verify` is NOT shadowed** — Starlette path structures differ (`promotion-drift` vs `{env_id}/verify`). Verified via TestClient. No reordering needed, but confirm rather than assume when adding sibling routes under a `{param}` prefix.

### Phase 3a — capability binding (2026-05-19)

- **`environment_templates_v2.get_template` has a 300s module cache that makes FakeCursor sequences non-deterministic across test order.** A cold cache issues a `_load_templates_fresh` query mid-verify that shifts every queued result by one; a warm cache (populated by an earlier test in the run) doesn't. Ticket 1's tests got lucky because the service caught the resulting `LookupError` and fell back to empty capabilities — which silently masked the real behavior once capabilities started being resolved. Fix: an `autouse` fixture that primes `_tpl._CACHE["templates"]` with the needed template and sets `fetched_at = float("inf")`, then `invalidate_cache()` on teardown. Any test that drives `verify_environment_contract`/the gate through a FakeCursor must prime this cache, or its sequence is order-dependent.
- **A verifier check that newly issues queries shifts every downstream `push_result` in existing tests.** Adding the `to_regclass` probe + bound-capabilities SELECT to `_capability_checks` re-sequenced both the Ticket 1 `_queue_verify_sequence` and Ticket 2 `_queue_gate` helpers. This is mock-faithfulness maintenance (the real query order changed by design), not assertion weakening — keep the assertions, fix the queued sequence. The conditional bound-caps SELECT only runs when the table is present AND `required_capabilities` is non-empty; the helper must mirror that conditional exactly.
- **`FakeCursor` silently accepts new INSERTs, so a pipeline test asserting only stage *names* will stay green when a no-op stage becomes a real write.** `test_full_create_writes_expected_rows` kept passing when `_apply_template_metadata` went from `skipped`/no-op to a real `INSERT INTO app.environment_capabilities` — because it only pins the stage-name list and v1-mirror inserts, not the stage status or capability rows. That is genuine zero-edit compatibility, but it is also a coverage gap: add a focused additive test that asserts the new write + idempotent `ON CONFLICT` rather than assuming the existing test covers it.
- **Capability fail-closed is now data-driven, not hard-coded.** `_capability_checks` resolves `contract.required_capabilities` against `app.environment_capabilities` (enabled rows only). `capability.binding_implemented` = `not_available`/blocking when `to_regclass('app.environment_capabilities')` is NULL (migration 10006 not applied); `capability.required_resolvable` = `fail`/blocking when any required capability has no enabled binding row; vacuous `pass` only when the contract requires none. A *disabled* binding row is NOT a satisfied capability — the resolution query filters `enabled = true`.
- **"Bind exactly what the template advertises" — no inference.** `_apply_template_metadata` binds only `template.enabled_modules`, `source='template'`, idempotent via `ON CONFLICT (env_id, capability_key) DO UPDATE SET enabled=true`. A template with no `enabled_modules` binds nothing (and the env then correctly fails closed at the verifier if its contract requires capabilities). Resist scope creep into a capability marketplace / module registry — the template is the single source of truth for what an env should have.
- **Capability binding does NOT make existing envs promotable.** Migration `10006` creates the table with zero backfill (verified live: `cap_rows = 0` post-apply). Existing v2 envs only gain bindings when re-provisioned through the v2 pipeline (or via a separately-ticketed explicit opt-in backfill). A force-promoted env with no bindings will be flagged by `GET /v2/environments/promotion-drift` — capability binding closes the gate's blocking check, it does not open a backdoor.

### Phase 3c — AI behavior contract registry (2026-05-19)

- **Each new fail-closed verifier check that queries adds queries to the verify path — keep mock helpers in lockstep.** Phase 3c's `_behavior_contract_check` added a `to_regclass` probe + a behavior-rows SELECT *after* `_runtime_backend_check`. Both the Ticket 1 `_queue_verify_sequence` (MISS path) and Ticket 2 `_queue_gate` (HIT path) helpers needed those two results appended in the exact code order. Trace the real order with a throwaway `FakeCursor` that records `sql[:52]` before editing helpers — guessing position causes off-by-one cascades.
- **When you make a hard-coded placeholder check real, the placeholder's test encodes the OLD behavior and must be rewritten to the NEW behavior.** `test_ai_behavior_contract_absent_is_missing_blocking` asserted the Phase-3 placeholder (`missing` hard-coded). Phase 3c replaced it with four honest fail-closed tests (absent table → not_available; no row → missing; disabled → fail; unsupported version → fail) + a valid-pass test. Deliverable, not assertion-weakening — same pattern as the Phase 3a capability rewrite. The rule that never bends: every non-pass branch stays blocking; no silent pass.
- **Closing one blocking check exposes the next genuine one — surface it, don't paper over it.** With AI behavior passing, the derive-only (`get_or_derive_contract` MISS) path's `eligible_for_promotion` was still False because `runtime.mode_explicit` is blocking (the verifier never derives `runtime_mode` without a confident source — correct fail-closed). The end-to-end "eligible" proof must use the contract-**HIT** path with a stored `runtime_mode`. Document the remaining blocker (a `runtime_mode` declaration field is its own small ticket) rather than loosen a check to make a green test.
- **No explicit declaration channel → bind nothing, document the exact field for a later ticket.** Neither `app.environment_templates` nor `EnvironmentManifestV2` has an `ai_behavior` field, and `MANIFEST_JSON_ALLOWED_KEYS` deliberately excludes structured concerns. Per the binding policy, Phase 3c added NO provisioning binding (that would require inventing schema = scope creep) — `_apply_template_metadata` got a docstring `TODO(phase-3c-followup)` naming the exact future columns (`ai_behavior_contract_key` + `ai_behavior_contract_version`). Rows are `source='manual'` until then; the verifier correctly blocks `missing` so nothing is silently promotable. Inferring an AI behavior contract from `enabled_modules` / "AI enabled" is explicitly forbidden.
- **Pin the governance-layer supported version to the AI runtime's constant.** `_SUPPORTED_AI_BEHAVIOR_VERSIONS = {"ai_behavior_v1"}` aligns with `response_contract_types.CONTRACT_VERSION = "v1"` so the governance check and the runtime cannot silently diverge. An enabled row with an unsupported `contract_version` is `fail`/blocking (malformed), never an optimistic pass.

## Domain Routing Notes (2026-05-19)

Both `paulmalmquist.com` (personal portfolio) and `novendor.ai` (consulting app / marketing) are served by the **same Vercel project** (`repo-b`). Routing is determined by hostname via middleware or config.

### Key routes to preserve

- **paulmalmquist.com/** — personal page + resume (shared component with `/paul`)
- **paulmalmquist.com/paul** — direct alias to personal page (backward-compatible)
- **paulmalmquist.com/paul/evidence** — Evidence Ledger (proof matrix with KPIs)
- **paulmalmquist.com/login** — Winston app login (Supabase auth)
- **novendor.ai/** — Novendor homepage + marketing
- **novendor.ai/login** — Novendor app login (same Supabase, same auth)

Both domains share the same backend at `https://authentic-sparkle-production-7f37.up.railway.app`. CORS headers on `BOS_API_ORIGIN` must include both domains.

### Before touching domain routing

1. Check `repo-b/src/app/layout.tsx` — does it have host-aware routing or middleware that distinguishes the domains?
2. Check `repo-b/vercel.json` or `.vercel/project.json` — are there rewrites or domain-specific routes configured?
3. Check `repo-b/src/middleware.ts` — is there middleware that routes based on hostname?
4. How is `repo-b/src/app/novendor/` organized? Is it a route group, a layout, or a slug-based path?

### Implementation pattern (if re-configuring)

The preferred pattern is **shared component extraction** — keep both `/` and `/paul` as working routes, backed by a single `PersonalPageBody` component. This avoids code duplication and keeps each route discoverable:

```tsx
// repo-b/src/components/resume/PersonalPageBody.tsx — the content
export function PersonalPageBody() { ... }

// repo-b/src/app/page.tsx
export default function RootPage() { return <PersonalPageBody />; }

// repo-b/src/app/paul/page.tsx
export default function PaulPage() { return <PersonalPageBody />; }
```

Do NOT:
- Move or rename `src/app/novendor/` — it is a separate routing boundary
- Use middleware to redirect `/paul` to `/` — preserve backward compatibility
- Break paulmalmquist.com/login — it is critical for team access

### Testing checklist

After any routing change:
- Smoke test: `paulmalmquist.com/` renders the personal page
- Smoke test: `paulmalmquist.com/paul` still works
- Smoke test: `paulmalmquist.com/paul/evidence` works and header says "Evidence Ledger"
- Smoke test: `paulmalmquist.com/login` works
- Smoke test: `novendor.ai/` renders Novendor homepage
- Smoke test: `novendor.ai/login` works
- Check Vercel deployment has both domains aliased under the project

### Root route conflict (`/`) — Next.js route group pitfall (2026-05-20)

Dual-root files in the same app cause build-time ambiguity. Vercel's post-build validation fails with `ENOENT: no such file or directory, lstat '.next/server/app/(marketing)/page_client-reference-manifest.js'` when two routes resolve to `/`:

- `src/app/page.tsx` → `/`
- `src/app/(marketing)/page.tsx` → `/` (route group does NOT prevent this)

**Fix:** Rename conflicting file to a subdirectory. In this case: `(marketing)/page.tsx` → `(marketing)/home/page.tsx` so Novendor homepage lives at `/home`, not `/`. Personal page remains at `/`.

**Prevention:** Before committing a new root page, check `git ls-files | grep 'src/app/.*page\.tsx' | grep -v '\['` to list all root-level page routes. Should be exactly one (`page.tsx` in `src/app/`).

**Why this happens:** Route groups `(marketing)` control *grouping and layout* but do NOT prevent a `page.tsx` inside from routing to `/`. The Next.js compiler resolves both as canonical roots, and Vercel's artifact check cannot determine which one should generate the manifest.

### Scheduled QA tasks on non-main branches: always read source via `git show main:` (2026-05-26)

Scheduled tasks (cron-style, like `happyco-nightly-qa`) run against whatever branch is checked out — often a long-lived feature branch that predates the feature being QA'd. Grepping the working tree returns nothing for files that only exist on `main`, making it look like routes and pages are missing when they aren't.

**Rule:** For any QA or smoke-check task, source verification must use `git show main:<path>` (or the relevant canonical branch), never grep/read from the working tree.

```bash
# Correct
git show main:repo-b/src/app/happyco/page.tsx
git show main:backend/app/routes/operator.py | grep "property-ops"

# Wrong on a stale branch
grep -r "property_ops" backend/app/routes/  # returns nothing if branch predates the feature
cat repo-b/src/app/happyco/page.tsx         # file doesn't exist on the branch
```

**Why this matters:** A false "missing" result will generate a spurious FAIL ticket and erode trust in the QA log. A false "present" result from cached working-tree state can mask a real regression on main.

**Prevention:** At the top of any QA task, run `git log --oneline HEAD..main | head -5` to see what main has that the current branch doesn't. If the output is non-empty, assume working-tree reads are unreliable for those files and switch to `git show main:`.

### Manifest `available` flags must match actual file state — verify both (2026-05-29)

When a JSON manifest (like `artifact_manifest.json`) declares files as `available: true`, a scheduled task can only trust that claim if it also verifies the target files exist and have non-trivial byte counts. A 67-byte PNG is a placeholder, not a real chart — the manifest can be out of sync with reality.

**Rule:** Any task that reads an artifact manifest should spot-check at least one of the claimed-available files for byte size. If size ≤ 100 bytes for a binary artifact, treat it as a stub regardless of what the manifest says.

```bash
# Check actual PNG size via git
git show origin/main:repo-b/public/happyco/weather-risk/latest/charts/weather_ops_risk_by_market.png | wc -c
# If ≤ 100 bytes → stub. Manifest flag should be false.
```

**Why this matters:** A manifest claiming `available: true` on stub files is an inaccuracy that can propagate to the frontend and mislead reviewers. In this case, the pending branch (`65251e33`) corrected all 6 chart entries to `available: false` — catching this before the branch merged prevented a false claim from reaching production.

**Prevention:** On any PR that updates a manifest or bundle JSON, include a verification step that cross-references the listed files' actual byte counts.

### Databricks is configured but not reachable by default in a coding session (2026-06-01)

The repo has a real Databricks workspace wired up — `dbc-2504bec5-b5ab.cloud.databricks.com`, Unity Catalog `novendor_1`, SQL Warehouse `0e56420fb707d861`, MLflow experiment `3740651530987773`, with a working REST client at `skills/historyrhymes/scripts/databricks_client.py` (config in `skills/historyrhymes/config/databricks.json`). But a fresh session usually **cannot** reach it: `DATABRICKS_PAT` is unset, the Databricks CLI isn't installed, `backend/app/data/databricks_source.py` is a `NotImplementedError` stub, and `mlflow`/`databricks-sql-connector`/`pyspark` are not in `backend/requirements.txt`.

**Rule:** Before promising live Databricks work, gate on `DATABRICKS_PAT` and verify with a read-only call (`DatabricksClient().warehouse_status()`). The repo-root `claude_token.txt` (gitignored) may hold the PAT — but it's named "claude", so confirm it's a Databricks `dapi…` token and not an Anthropic key before trusting it. Fail closed and document the blocker rather than silently falling back to local processing.

**Reuse, don't rebuild:** `DatabricksClient` already implements warehouse start/stop, `execute_sql`, MLflow run create/log, notebook import, Unity Catalog listing, and the Jobs API. To use a different Unity Catalog schema without disturbing historyrhymes, pass fully-qualified SQL (`novendor_1.<schema>.<table>`) — do not edit the shared `databricks.json`.

### New telemetry environment uses the lab-env + v2-provisioning conventions (2026-06-01)

Dispatch 0003 set up the Telemetry Platform as a hybrid build: ML/Databricks code + portfolio docs under top-level `telemetry-platform/`, but the serving API in `backend/` and the dashboard as a real Winston lab env at `repo-b/src/app/lab/env/[envId]/telemetry/` provisioned via `POST /v2/environments`. Migrations go to `repo-b/db/schema/NNN_*.sql` (not a per-project supabase dir). New table prefix `tel_` was registered in `ARCHITECTURE.md` first (the guardrail requires the file be updated before any migration), with full `env_id`/`business_id`/RLS.

**Rule:** A standalone-feeling build still routes through repo conventions. Put pointer-READMEs in the tempting-but-wrong folders (`telemetry-platform/{api,frontend,supabase}/README.md`) so a later session doesn't build a second orphaned implementation in the wrong place. The dispatch-record numbering is `NNNN-` (next was 0003); the migration number is non-monotonic on disk, so resolve it live against `supabase_migrations.schema_migrations`, never hardcode.

### Databricks ingestion without local PySpark: volume + Files API + read_files (2026-06-01)

The shared `DatabricksClient` (`skills/historyrhymes/scripts/databricks_client.py`) only exposes `execute_sql` against the SQL Warehouse plus the Jobs API — no Spark session, no Files API. To land real local data in Delta without installing pyspark locally, the working pattern (used for the telemetry platform) is: parse locally (pandas/numpy/stdlib) → write gzip CSV → upload to a Unity Catalog **managed volume** via the Files API (`PUT /api/2.0/fs/files/Volumes/<cat>/<schema>/<vol>/<path>?overwrite=true`, raw bytes, Bearer PAT) → `CREATE TABLE AS SELECT * FROM read_files('<volume path>', format=>'csv', header=>true, inferSchema=>true)`. `read_files` infers schema and handles gzip. Round-trips ~700K rows fine. The client has no upload method, so add a thin `_volume.py` helper rather than editing the shared client.

**Cost:** the warehouse (`0e56420fb707d861`) auto-stops after 15 min, but start it explicitly before a batch of statements and stop it in a `finally` — don't leave it running between scripts.

### Public NASA dataset sources rot — validate magic bytes, not just size (2026-06-01)

For the telemetry platform: C-MAPSS is reliably mirrored on GitHub (`hankroark/Turbofan-Engine-Degradation`, full FD001–FD004). The telemanom SMAP/MSL **labels** are on `khundman/telemanom` (`labeled_anomalies.csv`), but the original `data.zip` (Dropbox) now returns an HTML interstitial instead of the archive — the raw `.npy` channel arrays are mirrored on HuggingFace `appleparan/telemanom` under `data/data/{train,test}/*.npy` (resolve URLs, directly downloadable). The NASA PCoE IMS bearing direct link (`ti.arc.nasa.gov/.../IMS.7z`) 301-redirects to a generic landing page; the real 1.075 GB archive is on `phm-datasets.s3.amazonaws.com/NASA/4.+Bearings.zip` (zip → IMS.7z → three run-to-failure `.rar` + Readme).

**Rule:** a size check is not enough — a NASA redirect returns a *large* HTML page (344 KB) that passes `bytes > 1000`. Validate downloaded archives by magic bytes (`377abcaf271c` 7z, `PK\x03\x04` zip, `1f8b` gzip) and reject anything starting with `<`. When a source genuinely fails, record the blocker in the manifest and continue with what landed — do not synthesize data.

### No-look-ahead leakage from a too-coarse window partition (2026-06-01)

C-MAPSS train and test units share `(subset, unit)` ids. A rolling feature partitioned by `(subset, unit)` averaged a train unit's and the test unit's readings together at the same cycle — silent train/test leakage that a size/row-count check never catches. The tell: unit 1 cycle 1 `sensor_2_rmean5` = mean of the two splits' values instead of each row's own value. Fix: partition rolling windows by `(subset, split, unit)`. **Rule:** when building no-look-ahead rolling features, the window PARTITION must include every column that distinguishes independent series — including the split — or features leak across boundaries that share a natural key.

### Databricks-native training from a local driver: serverless notebook jobs (2026-06-01)

For the telemetry platform Phase 2, training runs *in* Databricks (where the Gold tables and MLflow live), driven from a local script. Pattern: write a `# Databricks notebook source` .py, upload via `POST /api/2.0/workspace/import` (base64 SOURCE), create a job with a serverless task, run-now, poll `GET /api/2.1/jobs/runs/get?run_id=...` to a terminal `life_cycle_state`, then read results via `GET /api/2.1/jobs/runs/get-output` (use the **task** run_id, not the parent, and parse `notebook_output.result` from `dbutils.notebook.exit(json...)`). The ML runtime already has sklearn/numpy, so no local ML deps. Two gotchas: (1) the shared `databricks_client.create_and_run_notebook_job` sets `environment_key='Default'` without an `environments` block — the current Jobs API rejects it; define `"environments":[{"environment_key":"default","spec":{"client":"3"}}]` and reference `"default"`. (2) On failure, the parent run's state message is generic ("Workload failed, see run output") — fetch the task run's get-output for the real Python traceback.

### Unity Catalog Model Registry needs a logged model WITH a signature (2026-06-01)

Registering `runs:/<id>/model` fails two ways if you only logged metrics: first "source artifact location does not exist" (you must `mlflow.<flavor>.log_model(...)` during training, not just `log_metric`), then "model did not contain any signature metadata" (UC requires `signature=infer_signature(X, y_pred)` — pass `input_example=` too). A rule-based detector (no sklearn estimator) registers fine as an `mlflow.pyfunc.PythonModel` subclass with a signature. Set `mlflow.set_registry_uri("databricks-uc")` and use `create_model_version(name="cat.schema.model", source="runs:/<id>/model", run_id=...)` + `set_registered_model_alias(..., "champion", version)`.

### Pick the demo replay channel where the PROMOTED model actually fires (2026-06-01)

The telemetry demo replays one fixed channel and the go/no-go flip must be the model's own output, not a hand-authored flag. The first pick (SMAP T-1) had a *contextual* anomaly — its max residual never crossed the residual-threshold detector's bound, so the promoted MAD model correctly fired 0 ticks there and the demo would never flip. Fix: query which channels the promoted model fires inside their labeled windows (`abs(value-rmean) > k*train_scale` within `is_anomaly=1`), and choose one with strong overlap (MSL D-4: 3,248 label ticks, model fires inside all of them). Lesson: validate that the *promoted* model produces the demo's visible event on the chosen replay slice before locking the channel — a label-only replay isn't enough.

### The backend uses column-filter tenancy, not the app.env_id RLS GUC (2026-06-01)

ARCHITECTURE.md's RLS template uses `current_setting('app.env_id', true)`, and every tenant table (e.g. `525_execution_board.sql`) does enable that policy. But the FastAPI serving code does NOT set the GUC at query time — it filters explicitly with `WHERE business_id = %s` and validates the business via `resolve_tenant_id(cur, business_id)` (`backend/app/services/reporting_common.py`, reads `public.business`). So a new serving slice should: (1) give tables both `env_id`/`business_id` columns AND the `current_setting` RLS policy (defense-in-depth, matches the guardrail + existing tables), and (2) in the service layer, filter by `business_id` + call `resolve_tenant_id`, not rely on the GUC. To actually prove RLS isolates, test under a non-owner role — the Supabase CLI's default role is the table owner and bypasses RLS: `SET ROLE authenticated; SET app.env_id='other'; SELECT count(*) ...` should return 0.

Backend serving conventions (verified, telemetry slice): routes `APIRouter(prefix="/api/{domain}")` registered in `backend/app/main.py` via `app.include_router(...)`; DB via `from app.db import get_cursor` (psycopg3, dict_row) in `with get_cursor() as cur:`; services are plain `def f(*, env_id, business_id, ...)` functions returning dicts; schemas are pydantic v2 with `null_reason: str | None` on fail-closed responses; tests use the `client` + `fake_cursor` fixtures and you must add your service's `get_cursor` import path to `_GET_CURSOR_TARGETS` in `backend/tests/conftest.py`. The system Python lacks uvicorn — run the server with `backend/.venv/Scripts/python -m uvicorn`.

### Serve a heavy ML model as a cheap rule when the champion IS a rule (2026-06-01)

The telemetry anomaly champion is a rolling-MAD dynamic threshold — so the FastAPI `/score` endpoint re-implements it in ~15 lines (`resid > k*scale`) with zero ML dependencies, instead of loading the registered model. This keeps `backend/requirements.txt` free of mlflow/pyspark/sklearn and makes the serving path Railway-friendly. Watch one trap: the registered model used `per_channel_scale.replace(0, NaN).fillna(global_scale)`, so for a near-constant training channel (D-4: train scale ≈ 2e-16) the *effective* scale is the global fallback (0.0339), not the raw ~0. The serving re-implementation must mirror that exact fallback or its verdicts won't match the registered model. Keep the live `/score` path and the deterministic demo replay distinct: replay reads precomputed champion outputs (no cold-start), `/score` is the live contract that persists a receipt per call.

### Adding a new lab environment: the exact wiring (2026-06-01)

To add a lab env that renders at `/lab/env/[envId]/<name>` (done for telemetry): (1) register the industry in `repo-b/src/components/lab/environments/constants.ts` — append to `industries`, add to `INDUSTRY_DISPLAY_MAP`, add an `is<Name>Environment()` helper, and add a branch in `resolveEnvironmentOpenPath()`; (2) add a v2 template row via a numbered migration mirroring `517_environment_templates_supply_chain.sql` (the live `app.environment_templates` has 18 columns incl. `default_auth_mode`, `theme_tokens`, `login_copy`); (3) add a seed pack in `backend/app/services/environment_seed_packs_v2/<name>_starter.py` and register it in `__init__.py` `SEED_PACKS` (import + dict entry); (4) provision with `POST /v2/environments {template_key, seed_pack, dry_run}`. The frontend reaches the backend via a per-domain proxy route handler `repo-b/src/app/api/<name>/[...path]/route.ts` (copy the rhymes one; it infers the upstream from `BOS_API_ORIGIN` or the host) — there is no global Next rewrite. Heads-up: the v2 `verify` gate and `create_rows` stage currently 500/skip because `app.environment_contract` is missing in this DB — platform-wide, not env-specific; the env still lands in both `app.environments` and `v1.environments` and routes fine.

### Force the dark operator console on a lab surface regardless of the global theme toggle (2026-06-01)

Tailwind dark mode here is `darkMode: ["selector", "html:not([data-theme='light'])"]`, and the light `--bm-*` token values are scoped to `html[data-theme="light"]`. The root layout defaults `data-theme="dark"`, but a persisted ThemeProvider choice (or a screenshot session) can flip html to light and wash out an operator surface. To pin a surface dark per the design charter, set `data-theme="dark"` on a wrapper AND pin the dark `--bm-*` token VALUES inline via `style` (the `consulting/pipeline/layout.tsx` pattern) — overriding the values is what actually wins, because `html[data-theme="light"]` would otherwise apply to the ancestor. Verified by Playwright screenshot.

### Demo replay: serve a precomputed fixture, not live inference (2026-06-01)

The telemetry demo's load-bearing moment is the replay-to-go/no-go flip. It reads a committed JSON fixture (`backend/app/data/telemetry/replay_fixture.json`, exported from the Databricks `gold_replay_feed_scored` table by `12_export_replay_fixture.py`) served at `GET /api/telemetry/replay` — so it never depends on Databricks or a cold model load at click time. Downsample with the anomaly ONSET kept dense (every tick around the first fire) and the calm/sustained regions strided, so the flip is crisp and the payload stays small (8,473 → 750 ticks, 73 KB). The flag the verdict flips on is the model's own `model_pred` from the fixture (real champion output), never hand-authored. Keep this distinct from the live `/score` contract: replay = deterministic precomputed; score = live scoring + receipt. Build and verify the replay page FIRST — everything else supports it.

### Deploying the shared backend + the repo-b frontend (2026-06-01)

Backend: there is ONE FastAPI app (`backend/`) serving all of production; it deploys to the Railway service `authentic-sparkle` (project production) via `scripts/deploy_backend.sh` (which captures the working-tree SHA into `backend/app/_git_sha.txt`, gitignored, exposed at `/version`) or directly `cd backend && railway up --service authentic-sparkle`. Live URL: `https://authentic-sparkle-production-7f37.up.railway.app`. `railway up` ships the LOCAL TREE, not a git ref — so on a feature branch it ships the whole branch + any uncommitted edits. Before deploying from a branch, `git stash` unrelated WIP and confirm how far ahead of the deployed `/version` SHA you are; the blast radius is the entire shared platform. Poll `/version` until it flips to your SHA (~2 min build).

Frontend: the lab/app frontend (`repo-b/`) deploys via the Vercel project **`consulting-app`** (Root Directory = `repo-b`, serves `novendor.ai`) — NOT a project literally named "repo-b" (the CLAUDE.md naming is stale; a project named repo-b may be on an inaccessible team). If `repo-b/.vercel` points at an inaccessible project, re-link the REPO ROOT (not `repo-b/`, or the configured `repo-b` root dir resolves to `repo-b/repo-b`): `vercel link --yes --project consulting-app --scope paulmalmquists-projects`, then `vercel deploy --prod --yes` from the repo root. Add a `.vercelignore` excluding `telemetry-platform/`, `backend/`, datasets, `*.zip`, etc. — Vercel uploads the working tree and rejects any file >100 MB (the 1 GB NASA IMS archive will fail the deploy otherwise). `BOS_API_ORIGIN` (the per-domain proxy upstream) was already set on consulting-app prod, so the telemetry proxy reached the backend with no env change. Repo-b does NOT auto-deploy on push — always `vercel deploy --prod` manually.

Cold-test like a stranger: a fresh Playwright context (no cookies, no dev server) hitting an authenticated lab route correctly redirects to `/login?returnTo=...` — that proves the route is live AND auth-gated. To screenshot the authenticated UI on prod you need the actual login password; ENV_KEYS only references the env var name, and it's not in the pulled `backend/.env`, so capturing the authenticated prod screenshot can be blocked even when the live API path is fully proven by curl.

### Enrich a demo DB authentically: scale the real pipeline, don't synthesize (2026-06-01)

When a live-but-thin demo needs to "look operated" (the telemetry platform had 1 run / 3 predictions / empty events+drift), the honest move is to scale REAL pipeline outputs over real source data, not seed plausible rows. For telemetry: 82 real SMAP/MSL channels in Databricks Gold → score per-channel windows with the frozen champion rule (real GO/REVIEW/NO_GO), parse the real labeled anomaly windows (point/contextual) → events, compute real PSI from real train-vs-test histograms → drift. Push the heavy aggregation into Databricks SQL (per-window peak residuals, binned histograms) and pull only compact results; apply the champion rule + PSI locally; emit a committed, reviewable seed SQL. Make the narrative coherent by *selecting a representative fleet* (mostly-nominal channels by real anomaly fraction + a degraded minority) — that yields ~70% GO / ~10% REVIEW / ~20% NO_GO from real data, not by tuning. Keep model-registry counts honest (4 real models; don't pad to a target). The one synthetic concession (operational timestamps spread over ~45d) must be flagged.

### Idempotent demo backfill that preserves live rows (2026-06-01)

To re-run a demo backfill without wiping real live writes, add `is_backfilled boolean DEFAULT false` + `backfill_batch_id text` to the target tables (additive migration). The backfill DELETEs only `WHERE env_id='<demo>' AND is_backfilled=true AND backfill_batch_id='<batch>'` then re-inserts with those flags set — so live `/score` receipts (`is_backfilled=false`) survive and re-runs don't double-count (verified: 363→363). Use deterministic uuid5(namespace, key) for row/run ids so FKs resolve and re-runs are stable. Reference an existing real run (e.g. the replay channel) by its known id rather than recreating it. The UI then shows a "deterministic backfill from public data; live receipts continue from current time" label so it never overclaims.

### Lab env full-bleed escape hatch: isDomainRoute (2026-06-01)

To render a lab environment with NO executive chrome (no department sidebar / breadcrumb / "+Dept"), add its route segment to the `isDomainRoute` regex in `repo-b/src/components/lab/LabEnvironmentShell.tsx` — when matched the shell renders only `<div className="min-h-screen bg-bm-bg">{children}</div>` and the env's own layout/shell becomes the sole chrome. Also add a `/<seg>(\/|$)` skip in `repo-b/src/components/lab/LabEnvTopBar.tsx` to drop the breadcrumb. One regex entry per domain; scoped, breaks no other env. A self-contained inline-style palette on the env's components (not `--bm-*`) keeps the surface dark regardless of the global theme toggle.

### Build a 256-d "multi-signal state vector" honestly: N real channels × M window features (2026-06-01)

When a résumé/demo claims a high-dimensional fused telemetry vector, make the dimension factor into real components, never padding. Phase 7A built `256 = 32 real SMAP/MSL channels × 8 window features` computed from the real `value` series in `gold_smap_msl_windows` (value_last/mean/std/min/max/slope + residual_last + residual_z). Two failure modes a skeptical reviewer checks for, and how they were caught by `verify_fused_vector.py` before any UI copy: (1) **padding/duplicate columns** — assert every one of the 256 columns has >1 distinct value across vectors (`count(DISTINCT a[i]) > 1`); near-flat channels (e.g. D-8) produced 2 constant columns, so the fix was to build features for ALL adequate candidates first, then a variance quality filter (every feature var > 1e-12) selecting 32 quality-passing channels, NOT just the 32 with the most rows. (2) **leakage / fabricated dims** — every dimension traces to a manifest row (`tel_feature_manifest`, 256 rows) with source_table + calc + leakage_risk; anomaly labels are evaluation-only, never inputs. Force-include the channel the rest of the demo depends on (D-4, the replay channel) so the vector and the money-shot stay consistent. If <N channels pass quality, stop and report the max honest dimension — do not pad.

### StandardScaler on a near-degenerate feature blows up test reconstruction error — winsorize to ±8 (2026-06-01)

Training a reconstruction model (PCA/autoencoder) on z-scored features: if one feature is near-constant on train, `StandardScaler` divides by a tiny std, so a modest raw deviation on a test outlier becomes a massive z-score and squared reconstruction error explodes (saw `test_recon_mse = 1.3e31`). Fit the scaler on train only (no leakage), then **clip the standardized values to ±8** (winsorized z-scores) before fitting/scoring — a documented, symmetric cap that kills the blow-up without distorting the bulk of the distribution. After: `test_recon_mse = 1277` (sane), and the AE still separated anomalous (1634) from nominal (347) windows ~4.7×. Store the standardized+clipped (model-ready) vector, not the raw one, so what's persisted is exactly what the model saw. Disclose the clip in the proof rather than hiding it — a reviewer who sees a 1e31 unmentioned assumes the whole table is junk.

### A grounded, governed copilot over an analytics platform: deterministic planner + allow-list + post-validator + fallback (2026-06-02)

To add "safe applied AI" to a data platform without it reading as a generic chatbot, keep the LLM as a *narrator over already-fetched evidence*, never as a tool-selector. The pattern (telemetry "Test Intelligence Copilot", `backend/app/services/telemetry_copilot*.py`): (1) **classify deterministically before any LLM call** — regex `REFUSAL_PATTERNS` catch out-of-scope (physical root cause, safety/flight disposition, proprietary) and return a fixed refusal with `null_reason=unsupported_question`, 0 tools, 0 model calls; anything not matching a supported intent is also refused, so a free-form `/ask` is a fixed question menu, not "ask anything". (2) **a frozen `INTENT_PLAN` maps each intent to a fixed tool list**; an `ALLOWED_TOOLS` dict is the security boundary (a tool not in it cannot run). (3) **assemble evidence with real ids** from thin read-only DB fns, fail closed (empty evidence ⇒ null_reason, no LLM). (4) **post-validate the prose**: every id/number must trace to the evidence, else fall back to a deterministic template (`answer_source=fallback_template`) — never a silent invention. (5) **log every interaction** to a table the governance UI aggregates (real numbers, never hardcoded). Keep it self-contained — do NOT import the big REPE `ai_gateway`/`assistant_runtime` (that drags in RAG/write-tools/streaming and the chatbot feel); reuse only the low-level OpenAI client + the already-wired model.

### Post-validator that won't false-flag its own grounded evidence: mask ids first, compare numbers by decimal tolerance (2026-06-02)

A naive "every id/number in the answer must appear in the evidence" check breaks two ways: (1) a hex/UUID regex like `[0-9a-f]{6,}` matches the *fractional digits of a decimal* ("0.0338668…") and the *numeric runs inside UUIDs* ("…-4000-…0001"), flagging real values as fabricated; (2) string-equality rejects the model's rounding ("F1 0.64" vs stored 0.6386571). Fix (`telemetry_copilot._postvalidate`): require a hex *letter* or full UUID shape so the id regex can't eat pure-digit decimals; **mask matched ids out of the prose before the numeric scan** so their fragments don't count as numbers; then accept a prose number if it equals any evidence value **rounded to the number of decimals the prose used** (`abs(a-v) ≤ 0.5·10^-d`). Allow small (≤2-digit) integers as benign prose. Net: faithful narration passes, a fabricated receipt id or an invented score (e.g. "7.99") fails → fallback.

### gpt-5 reasoning models return EMPTY content if max_completion_tokens is too low (2026-06-02)

`gpt-5`/`gpt-5-mini` (and o-series) burn `max_completion_tokens` on internal reasoning *first*. At `max_completion_tokens=500` the model spent all 500 on reasoning and returned **empty content** with `finish_reason=length` (and `reasoning_tokens=500`); at 800–1200 it completed normally (`reasoning_tokens=0`, ~515 visible tokens). For a chat-completions call to one of these models: set `reasoning_effort="minimal"` for narration tasks, use the `"developer"` role (not `"system"`), give `max_completion_tokens` real headroom (≥800), and **guard against empty/short responses** (treat them as a failure → fallback). Also tell it explicitly to "write prose, do not echo or reformat the input block" — given a fenced JSON evidence block, a terse model will otherwise regurgitate the JSON verbatim. Latency scales with output length (~10s for ~580 tokens from a cold connection), so wrap the call in an `asyncio.wait_for` timeout (the sync DB tool calls stay outside it) and keep a deterministic template fallback for the cold-reviewer path.

### Duplicate `content-type` header from apiFetch + a caller-set header mangles the POST body (2026-06-02)

A frontend copilot POST 500'd in the browser but worked via curl. Root cause: the shared `apiFetch` already sets `"Content-Type": "application/json"`, and the caller (`copilot-api.ts`) *also* passed `headers: {"content-type": "application/json"}`. The merge `{ "Content-Type": ..., ...(options.headers||{}) }` produced TWO case-differing keys, and undici/`fetch` emitted a **duplicate header** (`content-type: application/json, application/json`) — which dropped/mangled the request body. The backend then parsed a non-dict and returned `422 model_attributes_type`. curl sent a single header, so it never reproduced — a true production-only / browser-only bug a live walkthrough caught. Fix: callers pass only `{method, body}`; let `apiFetch` own the content-type (match the repo's other POST callers). Lesson: never set `content-type` in a caller when the shared fetch wrapper already sets it; confirm with `postman-echo.com/post` (it shows the received `content-type` and parsed `data`). Separately, harden the server: a FastAPI `RequestValidationError` handler must NOT return raw `exc.errors()` — for a body-parse failure Pydantic v2 puts the request **bytes** in `input`, which `JSONResponse` can't serialize (`TypeError: Object of type bytes is not JSON serializable`), turning a clean 422 into a 500. Return a sanitized loc/msg/type list.

### Turn grounded AI evidence into a persisted, reviewable artifact — deterministic assembler, fail-closed, provenance row (2026-06-02)

When the product story is "AI turns analytics evidence into an operational artifact" (a draft report), assemble the artifact **deterministically from the already-grounded evidence, not with another LLM call**. Phase 7's `draft_report()` reuses the copilot's fixed tool chain + `_assemble_evidence()`, then fills a fixed markdown template (verdict, triggering receipt, model basis, statistical interpretation, follow-up) — so it is grounded by construction and nothing can be fabricated, it's instant, and it needs no post-validator. Three properties make it credible: (1) **fail-closed** — no triggering receipt ⇒ `null_reason` and NO persisted row (assert "no INSERT issued" in tests, not just the return value); (2) **labeled** `ASSISTANT-GENERATED DRAFT — REQUIRES HUMAN REVIEW` in body + a `review_status='requires_human_review'` column; (3) **full provenance row** (`tel_copilot_reports`: run/receipt ids, score, threshold, champion, mlflow, prompt_version, evidence_payload jsonb, generated_markdown) so every report is a re-fetchable receipt. Keep the out-of-scope guard upstream: "write a report on the physical root cause" is refused by the same pre-LLM classifier before any assembly. Test the report's *text*: assert it cites each evidence token AND that it omits root-cause/safety-disposition claims (watch markdown `**bold**` — `**not**` breaks a naive "not a physical root cause" substring match; assert the un-bolded phrases).

### Best-effort event emits must fail closed to a no-op when no broker is configured (2026-06-03)

Adding an event-streaming backbone (`backend/app/events/`) to a synchronous backend: the publish path must be inert by default and never able to break a request. CI runs `pytest tests -q` with **no broker**, so any publisher that raises or blocks on a missing broker reds the build. The contract that holds: (1) a master `EVENTS_ENABLED` flag (default false) plus an empty `EVENTS_BROKER_URL` both resolve `get_transport()` to a `NoopTransport` whose `send()` does nothing and returns False; (2) the Kafka client is **lazy-imported inside the transport** so it stays an optional dependency — its absence (or any producer-init failure) also falls back to no-op, so Phase 1 adds no line to `requirements.txt`; (3) `publish_event()` wraps the send in try/except, never raises, returns a bool; (4) the Kafka producer uses a **bounded** `flush(timeout)` so a slow/unreachable broker can't hang the caller. Wiring it into `run_execution` (the first producer): emit `execution.started` after the `RETURNING execution_id` insert, wrap the work in `try/except` that emits `execution.failed` (with the error class) and **re-raises** so the txn rolls back and the API surfaces the error unchanged, and emit `execution.completed` only after the cursor context commits — the return value stays byte-identical. Test it with a `FakeBroker` modeled on conftest's `FakeCursor` (records offered envelopes, optional `raises=True`); assert the lifecycle order, that a raising broker still completes the execution, and that the no-op path publishes nothing. Postgres stays the system of record; the events are observational only (they feed a BigQuery event lake, never a read path).

### Do not run `check_repo_guardrails.mjs --write-baseline` on Windows — its path-walk collectors silently drop entries (2026-06-09)

The guardrail baseline is `current snapshot minus baseline = new violations`. `--write-baseline` rewrites the whole snapshot from disk, but two of its collectors filter with `file.endsWith("/page.tsx")` (forward slash). On Windows `walk()` returns backslash paths, so `collectPageLocalApiBaseFiles` matches **zero** files and `--write-baseline` writes `page_local_api_base_files: []` — silently erasing all grandfathered page-API entries. On Linux/CI the same files reappear and every one becomes a "new" failure → red build. (The schema-prefix collector — a single `readdir` of one dir — and the direct-DB/globalThis collectors — which `.endsWith(".ts"/".tsx")`, separator-agnostic, then `normalize()` the relative path — are fine cross-platform.) Rule: never regenerate the baseline on Windows. To grandfather one or two known entries, hand-edit `scripts/repo_guardrails.baseline.json` surgically (e.g. a tiny `node -e` that loads, pushes to the right array, sorts, and writes `JSON.stringify(b,null,2)+"\n"`), then `git diff` the baseline and confirm ONLY the intended keys changed. Also: the `^(\d{4})` schema-prefix regex was a latent bug — once migrations crossed into 5 digits (`10000`–`10012`) it truncated unique numbers onto a shared `1000`/`1001` prefix and false-flagged duplicates; the fix is `^(\d+)_` to capture the full migration number.

### New lab env via the v2 pipeline: schema numbering, SET LOCAL params, and the demo-env business_id gap (2026-06-08)

Building the Healthcare Subscription Analytics env (`hha_` prefix) surfaced three reusable gotchas. (1) **Schema numbering in `repo-b/db/schema/` is irregular** — files mix 3-digit and 4/5-digit prefixes and lexical `ls` hides the `10000+` files (they sort before `9985`). Derive the next number from the real numeric max — and check **`origin/main`, not just your local branch**, because parallel work lands numbers your branch base never saw. Here local max was `10011` so hha was authored as `10012`, but `origin/main` already had `10012_telemetry_copilot_fallback_reason.sql`; caught at pre-commit and renumbered to `10013`. Renumbering the file is safe even after the DDL was applied to prod — the DB objects are named (`hha_*`), not numbered, so the prefix only governs apply ordering; note the renumber in the file header to keep repo/DB history honest. (2) **`SET LOCAL app.env_id = %s` cannot be parameterized** — psycopg sends it as a prepared statement and Postgres errors `syntax error at or near "$1"`. Use `SELECT set_config('app.env_id', %s, true)` (the `true` = transaction-local, same effect). Existing `ai_usage_rules.py` uses the broken `SET LOCAL ... %s` form; don't copy it — it only "works" in tests because `FakeCursor` never executes real SQL. (3) **The v2 provisioning pipeline never assigns `business_id`** to fresh demo envs — `environment_pipeline_v2._create_rows` omits it, so the seed pack receives `business_id=""`. For any `env_id`/`business_id NOT NULL` table, synthesize `business_id` deterministically in the seed pack (`uuid5(ns, f"{env_id}:...")`) and scope **reads by the globally-unique `env_id`** alone. Provision in-process without running the HTTP server: import `environment_pipeline_v2.create_environment_v2` and call it with an `EnvironmentManifestV2` (config auto-loads `backend/.env` from CWD); the pipeline's own `health_check` sets `lifecycle_state='verified'`. Note `/v2/environments/{id}/verify` needs `app.environment_contract` (migration `10004`) which may be absent on a given DB — that's a verifier gap, not a provisioning failure. New-env templates live in the **DB-backed** `app.environment_templates` (not code); register the row in the same migration as the tables (idempotent `ON CONFLICT (template_key, version) DO UPDATE`).

### Standalone env UIs own their chrome — no app shell, ever (2026-06-08)

Lab environment UIs (`repo-b/src/app/lab/env/[envId]/<env>/`) must be standalone full-bleed designs, never wrapped in `DomainWorkspaceShell`/`RepeWorkspaceShell`/shared app chrome (standing user preference). The clean pattern: a thin async `page.tsx` that `await params` and renders `<EnvClient envId={envId} />`; the client component carries its own background, header, and footer. `LabEnvTopBar` is the one shared layer that remains. Backend access is domain-specific: HHA uses the universal same-origin `/bos` proxy from `lib/healthcare-subscription/client.ts`; do not reintroduce direct `NEXT_PUBLIC_API_BASE` fetching there. History Rhymes retains its separate direct-origin convention.

### Suppressed analytics rows must be projected safely at query time (2026-06-09)

For a masked cohort or other small cell, omitting fields from the response model is not enough. Run a separate suppressed-row query that selects only the safe identity fields needed for the marker (for HHA: cohort month and channel), then construct the masked object in the service. The prohibited count, denominator, rate, revenue, and LTV values should never be fetched into the service process, serialized to JSON, logged, or sent to the browser. Test both the JSON keys and the suppressed SQL projection.
## Backend + Frontend Wiring (2026-05-19, Outreach Personalizer)

- **The `/bos/[...path]` catch-all is the universal frontend→backend proxy and it is NOT auth-gated.** `repo-b/src/app/bos/[...path]/route.ts` forwards `/bos/<anything>` → `BOS_API_ORIGIN/<anything>` verbatim, attaching session/membership headers only if a session exists. A new backend route at `/api/foo/v1/...` is reachable from the browser at `/bos/api/foo/v1/...` with zero new proxy code, and public/anonymous pages can call it (the backend endpoint just must not require auth). Mirror `repo-b/src/lib/cro-api.ts`: a thin client using `apiFetch` from `@/lib/api` with a `/bos/...` base.
- **`backend/tests/conftest.py` has an explicit `_GET_CURSOR_TARGETS` allow-list.** The `fake_cursor` fixture only patches `get_cursor` for modules listed there. A new `app.services.<svc>` that imports `from app.db import get_cursor` MUST be added to that list or its DB calls hit a real connection in tests. One-line addition next to the other `cro_*` entries.
- **`FakeCursor` is FIFO across the whole request.** `push_result()` queues result sets consumed in order by `fetchone()`/`fetchall()` (execute does not consume). For a route-level TestClient test, trace every `cur.execute(...)+fetch` in call order across all service functions the endpoint touches and `push_result` once per fetch, in that exact order. Brittle but deterministic; keep route service-call order stable.
- **No uvicorn in the local Python env — but `TestClient(app)` against the real DB is a valid live smoke.** `load_dotenv("backend/.env")` (the streamlined-creds flow already populated it) + `TestClient` exercises the full ASGI stack with real Postgres. Run under a throwaway `env_id` and delete the rows afterward. Run scripts with `PYTHONPATH=.` from `backend/` (pytest works via rootdir; a bare `python script.py` does not put `app` on the path).
- **Migrations: `node apply.js` failed with `SELF_SIGNED_CERT_IN_CHAIN` against Supabase; `supabase db query --linked` works.** Node's `pg` enforces strict SSL on the pooled Supabase URL. The Supabase CLI auths via access token and applies the file cleanly: `cat repo-b/db/schema/NNN_x.sql | supabase db query --linked`. Prefer the CLI for applies; keep `node apply.js --files NNN --dry-run` for SQL-parse validation (no DB needed).
- **`crm_account`'s PK is `crm_account_id`, not `id`** (`repo-b/db/schema/260_crm_native.sql:5`). FKs into it must say `REFERENCES crm_account(crm_account_id)`.
- **Public/anonymous tables need an RLS escape hatch.** Use the 609-style policy `env_id = current_setting('app.env_id', true) OR current_setting('app.env_id', true) IS NULL` so a sessionless read still resolves. For an anonymous-insert table also allow `env_id IS NULL`. (Backend pool role also bypasses RLS, so this is defense-in-depth, but make it correct anyway.)
- **Don't overload an existing event table for a new event class if it forces weakening NOT NULLs.** `cro_engagement_event` is email-specific (`tracking_id`/`business_id` NOT NULL). Anonymous microsite events got a dedicated additive `cro_microsite_event` table instead — cheaper and safer than altering a production table's constraints, and explicitly the sanctioned path when the existing CHECK/NOT NULLs don't fit.

## PATCH / partial updates + URL safety (2026-05-19, Outreach Personalizer Phase 2A)

- **COALESCE-based update functions can't clear a column.** The Phase 1 `update_target()` uses `SET x = COALESCE(%s, x)` — passing `None` is a no-op, not a clear. For a PATCH that must support "blank to clear" (e.g. `loom_url`), add a separate `patch_target()` that builds a dynamic `SET` from only the explicitly-provided keys. Keep the COALESCE function for the seed path so you don't regress it.
- **Distinguish "field absent" from "explicitly null" with Pydantic v2.** Route does `payload.model_dump(exclude_unset=True)` — absent keys are dropped (leave column alone), a key sent as `null` is kept (clear it). The all-optional `MicrositeUpdateIn` plus `exclude_unset` is the whole mechanism; no sentinel objects needed.
- **Validate untrusted URLs on write AND re-validate on serve.** `loom_url` is validated/normalized by `normalize_loom_url()` in the PATCH path, and the public microsite payload re-runs the same normalizer at serve time so a tampered/legacy DB value can never reach the page as an arbitrary iframe `src`. The render-side `toEmbedUrl()` in `LoomEmbed.tsx` is a third guard. The shared regex requires the `^https?://(www\.)?loom\.com/(share|embed)/<id>` shape, which inherently rejects `javascript:`/`data:`/host-spoofed URLs.
- **Reuse the existing CRM surface; never add a parallel CRM model.** `crm_svc.list_accounts(business_id=UUID)` + `GET /api/crm/accounts` already exist (`backend/app/routes/crm.py:16`, `backend/app/services/crm.py:11`). For an FK link, a tiny read-only `SELECT 1 FROM crm_account WHERE crm_account_id=%s` existence guard + a `SELECT crm_account_id,name,website` summary is fine — that is reading the owned table, not duplicating its model. The frontend just calls `/bos/api/crm/accounts?business_id=` (the universal proxy again).
- **`/api/crm/accounts` is scoped by `business_id` only and requires it.** Outreach targets have a nullable `business_id`; when the env has none, the operator UI must fall back to manual `crm_account_id` entry rather than assuming the account list is available.
- **No migration when the columns already exist.** Phase 1's `611` schema already had `loom_url`/`crm_account_id`/`logo_url`/`accent_hsl` on `cro_outreach_target`. Phase 2A added zero schema — always grep the prior migration before assuming a new one is needed.

## Worktrees + branch divergence (2026-05-19, Outreach Personalizer Phase 2B)

- **The repo branch can change underneath a long session.** A prompt said "branch X, HEAD Y"; by the time work started the repo had been switched to a different branch and an unrelated commit made on it. Always re-run `git rev-parse --abbrev-ref HEAD` + `git log --oneline -3` at the *start of each work unit*, not just session start. The reflog (`git reflog`) is the ground truth for "what happened" — `checkout: moving from A to B` lines pinpoint external branch switches.
- **When the wrong-branch tree is dirty with someone else's uncommitted work, `git checkout <feature>` aborts** ("would be overwritten / commit or stash"). Do NOT stash or discard — that mutates another workstream's state. Use `git worktree add <path> <branch>` and do all work in the isolated checkout. The other checkout's dirty tree is then physically untouchable. (The repo's own tips item 18 already recommends worktrees for exactly this.)
- **A fresh worktree has no gitignored files.** No `node_modules` (so `npm run typecheck` fails with `'tsc' is not recognized`) and no `backend/.env` (so runners exit `DATABASE_URL is not set`). Fixes that need no install/secrets: junction the worktree's `repo-b/node_modules` to the main checkout's (PowerShell `New-Item -ItemType Junction`; deps are identical across these branches so it is valid and `node_modules` is gitignored so the junction never stages), and point `load_dotenv(r"C:\...\main\backend\.env")` at the main checkout's `.env` for live smokes.
- **A worktree makes scoped commits trivial.** Because the worktree only ever contained a clean checkout of the feature branch, its `git status` is *only* your change — no split-staging gymnastics, no risk of catching the unrelated History Rhymes / resume / `main.py`-residual dirt that plagues the primary checkout.
- **Enrich read endpoints, not the shared response builder, to avoid test-fixture churn.** Adding the engagement rollup to `_target_response` (used by POST/PATCH/GET) would have broken every Phase 1/2A `FakeCursor` push sequence. Adding it only inside the `GET /targets` and `GET /targets/{id}` handlers kept all 53 prior tests green with zero edits.
- **Reuse `crm_svc.create_activity` for follow-through; compose, don't fork.** Logging engagement as CRM activity is a *composition* over the existing service (build subject/body from the rollup, call `crm_svc.create_activity` with the linked `crm_account_id`). Requires both `crm_account_id` and `business_id` on the target (create_activity needs business_id to resolve the tenant) — fail closed with a clear 400 when either is missing. No new activity model, no new table.

## Pipeline progression + cross-table CHECKs (2026-05-20, Outreach Personalizer Phase 2C)

- **`crm_svc.move_opportunity_stage` accepts ANY `to_stage_id`.** No progression / `is_closed` / terminal check. All gating must live in the caller. The authoritative gate for outreach pipeline advancement is `compute_pipeline_advance_state` in `backend/app/services/outreach_personalizer.py` — it implements the 7-step chain (business_id → account → opportunity → opp-row-exists → same-business → not-closed → current-stage-not-terminal → next-stage-exists) and surfaces a 1-to-1 mapping from failure mode to operator `blocking_reason` string. Do NOT scatter these checks at call sites.
- **`crm_opportunity` carries no account-cardinality guarantee.** Schema (`260_crm_native.sql:53-72`) has no UNIQUE on `(business_id, crm_account_id)`, no partial unique on `status='open'`, and `crm_account_id` is even nullable on opportunities. The "one open opportunity per account" rule is a *convention* in `lead_ingest.py:462-473` only — every other CRM code path bypasses it. When a feature surface needs an FK link to a domain object, always verify the source-of-truth has a uniqueness/cardinality guarantee before deriving the link from an upstream FK. If not, require an explicit FK column (Option A in the Phase 2C plan).
- **`crm_opportunity.status` closed-set is mutable across migrations.** `260_crm_native.sql` had `'open','won','lost','on_hold'`; `10001_crm_opportunity_lifecycle.sql` added `'cold_hold','archived'`. Phase 2C codifies `_CLOSED_OPP_STATUSES = ("won","lost","archived")` as the single owner — `on_hold` / `cold_hold` are active-but-paused and CAN be advanced. Always re-read the latest CHECK before assuming the terminal set.
- **`crm_pipeline_stage.stage_order` is INT with no uniqueness.** Only `(tenant_id, business_id, key)` is unique. Next-stage resolution MUST use a deterministic secondary sort. Phase 2C's `_next_open_stage` uses `ORDER BY stage_order ASC, key ASC LIMIT 1`. Any future change to that policy must be made in that helper, not duplicated at call sites.
- **`crm_svc.move_opportunity_stage` return shape is partial.** `crm_opportunity_id, name, amount, status, expected_close_date` from the UPDATE RETURNING + `stage_key, stage_label` appended in Python ONLY if the to-stage row is found. Callers and TS types should mirror this exactly; do not invent a prettier wrapper, and handle the missing-stage-keys edge case.
- **Cross-table CHECK constraints have PATCH-clear consequences.** Adding `(crm_opportunity_id IS NULL OR crm_account_id IS NOT NULL)` to `cro_outreach_target` is correct defense-in-depth, but interacts with single-field PATCH-clear: a PATCH clearing `crm_account_id` while `crm_opportunity_id` remains set would fail at the DB layer with an opaque constraint-violation error. Always short-circuit at the route layer with a specific operator message — `"Clear the linked CRM opportunity before clearing the CRM account."` — before the constraint can fire. Test that the route guard, not the DB CHECK, is what fires.
- **Distinguish absent vs explicit-null in PATCH via `model_dump(exclude_unset=True)`.** Phase 2C extends `_PATCHABLE` with `crm_opportunity_id`; the existing dynamic-SET pattern continues to support null-clear because the route reads only keys actually sent. Generalise UUID-stringification via a small tuple (`_UUID_PATCH_COLS`) so every UUID column gets the same `str(val) if val is not None` treatment.
- **Live smokes that mutate stage MUST use Pattern A or Pattern B with try/finally.** Unlike `crm_activity` (clean by row delete), a stage move mutates `crm_opportunity.crm_pipeline_stage_id` AND inserts into `crm_opportunity_stage_history`. Phase 2C smoke uses Pattern A: INSERT a throwaway opportunity at the lowest open stage, run advance, then `DELETE FROM crm_opportunity_stage_history WHERE crm_opportunity_id=...; DELETE FROM crm_opportunity WHERE crm_opportunity_id=...` inside `finally:` so cleanup always runs. Print all resolved ids (target, opp, original stage, new stage) for manual recovery if anything goes wrong.
- **List-view enrichment: single bulk JOIN, never N+1.** Phase 2B's `engagement_rollup_bulk` and Phase 2C's `list_opportunity_summaries_bulk` both use `WHERE col = ANY(%s)` with an empty-input short-circuit. The short-circuit is what keeps existing per-row tests with unlinked targets from consuming an extra FakeCursor push.

## HappyCo Property Ops Proof Package (2026-05-20)

- **Use a clean `origin/main` worktree for tailored proof packages when the primary checkout is dirty.** The HappyCo work is a gated interview package and should not pick up unrelated environment-contract or local prompt files.
- **Generated proof artifacts are ignored by default.** `artifacts/`, `*.xlsx`, and `*.pptx` are gitignored, so workbook/deck/model outputs are local evidence unless a later ticket adds tracked templates, receipts, or gated download handlers.
- **Databricks support in the generic app data layer is still stub-only, but proof-package ML can use receipt-backed job runs.** `backend/app/data/databricks_source.py` raises `NotImplementedError`; for HappyCo Ticket 3B the allowed claim comes from `scripts/happyco/run_databricks_ml.py` producing a completed Databricks job receipt, not from the generic data source.
- **Tailored employer/client proof packages should be gated by default.** Public Novendor pages can show generic positioning, but company-specific demos, decks, workbooks, screenshots, and recruiter workflow proof should require invite-code access.
- **Canvas JSX is design reference, not source to paste.** Translate it into repo-native components and existing route/API patterns. Preserve the intent: HappyCo-colored SaaS proof package, tabbed Executive Demo/Data Flow/Automation Room/Artifact Factory/Build Log, and honest planned/draft/not-wired states.
- **Synthetic model metrics need an honesty rule.** If deterministic demo labels create unusually high accuracy, record that as a synthetic-data limitation in `model_metrics.json` and `model_card.md`; the point is platform capability and explainability, not fake predictive performance.
- **For large synthetic demo datasets, use compact seed JSON plus deterministic materialization.** Ticket 2 keeps core operators/properties/vendors/source records in `happyco_property_ops_seed.json`, then `operator_property_ops.py` expands buildings, units, inspections, findings, work orders, graph edges, benchmarks, recommendations, and ML feature rows. This avoids a hand-maintained 500-row JSON blob while preserving deterministic tests.
- **Keep recommendation evidence source-addressable.** HappyCo recommendations reference `evidence_ids`, and each evidence row points back to concrete work order/finding/vendor/benchmark source IDs so the UI, workbook, deck, and ML layer can reuse the same evidence without re-inventing claims.
- **ML demo scripts need a no-install fallback.** This Windows Python environment lacked `sklearn` even though backend requirements list it. `scripts/happyco/train_property_ops_ml.py` prefers scikit-learn, but falls back to a small NumPy logistic regression so the proof can run locally without package installation or Databricks.
- **ML artifacts should enrich APIs but never hard-depend the demo.** HappyCo's recommendation endpoint reads local ML predictions when present, but returns `ml_status: "not_available"` and deterministic benchmark-only recommendations when ignored artifacts are absent. This keeps CI/dev clones from failing just because `artifacts/` is intentionally untracked.
- **Full-width operator proof pages need shell integration, not just a route file.** Add the route to `OperatorShell` navigation and return `[]` from `anchorSections()` for the route so the page owns its HappyCo-colored tabbed chrome instead of inheriting the default operator anchor rail.
- **When spreadsheet artifact tooling is unavailable, keep the fallback scripted and validated.** `@oai/artifact-tool` was not installed in this workspace, so Ticket 6 uses an `openpyxl` builder script that writes the ignored workbook under `artifacts/`, validates required sheets, and keeps formulas visible for audit.
- **PowerPoint COM is a viable local artifact fallback on Windows.** When presentation artifact tooling and `python-pptx` are unavailable, `win32com.client.DispatchEx("PowerPoint.Application")` can generate a native editable `.pptx`; validate the saved file as a PPTX zip and count `ppt/slides/slide*.xml` before treating it as evidence.
- **Use route-scoped cookies for tailored share-package gates when full app auth is overkill.** The HappyCo `/happyco` gate reuses the repo's invite-code idea but sets `happyco_demo_access` only on path `/happyco`; production requires `HAPPYCO_DEMO_INVITE_CODE`, while local dev can use a documented fallback without exposing tailored artifacts publicly.
- **Keep Outlook proof-package workflows as templates until local mailbox context is approved.** The HappyCo WinCOM params live under `docs/runbooks/...` with placeholders, `dry_run: true`, and draft-only policy; real recruiter filters, addresses, summaries, and mailbox exports belong under ignored `artifacts/` or outside git.
- **For gated share pages, capture both locked and unlocked screenshots.** HappyCo Ticket 9 used a temporary Next dev server and Playwright to save `happyco_locked.png` and `happyco_unlocked.png` under ignored `artifacts/`; the locked screenshot proves the public surface is generic, and the unlocked screenshot proves the invite gate reveals the tailored package.
- **Databricks claims need receipt-backed wording.** For HappyCo Ticket 3B, the allowed claim is "Databricks ML training run executed on synthetic property operations data" only when `artifacts/happyco/databricks/databricks_run_receipt.json` exists and says the run completed. CLI/auth failures write `databricks_run_attempt_receipt.json`; the API/UI must show `not_configured`/`attempted_failed`/`not_run`, never "completed."
- **Serverless-only Databricks workspaces need notebook jobs without `new_cluster`.** The HappyCo workspace rejected classic job clusters with "Only serverless compute is supported in the workspace." For notebook tasks, omit cluster settings and let serverless run the workspace notebook; avoid `/dbfs` FUSE paths in serverless and return durable evidence through `dbutils.notebook.exit(...)` plus a sanitized tracked receipt fixture when deployed UI needs to show completion.
- **`artifacts/` is globally ignored, including source route folders named `artifacts`.** The HappyCo gated artifact hub intentionally adds `repo-b/src/app/happyco/artifacts` and `repo-b/src/app/api/happyco/artifacts`; those paths must be force-added with `git add -f` (or future routes should choose a non-ignored segment name). Never solve this by weakening the global ignore for generated proof artifacts.
- **If an env route is the share URL, bypass shell chrome at the shared shell boundary.** The HappyCo property-ops route needed the stable `/lab/env/[envId]/operator/property-ops-intelligence` URL but not the Hall Boys operator shell. The safest fix was route-specific presentation mode in `OperatorShell` plus rendering the clean presentation client in the page, leaving all other operator routes untouched.

## Environment scaffolding via `environment_pipeline_v2` (2026-05-20, Outreach Personalizer Phase 3)

- **`environment_pipeline_v2.create_environment_v2()` is synchronous, slug-idempotent, reaches `lifecycle_state='verified'` in one call,** and returns a `CreateEnvironmentV2Response` with `links["dashboard_url"]` already interpolated. Callers do not need to poll, wait, or invoke contracts. The dashboard-URL composition lives in `_build_response` (single line: `default_home_route.replace("{env_id}", env_id)`); there's no sibling helper to reuse, so any "read env summary later" path repeats that one-line substitution.
- **The v2 pipeline's `manifest_overflow` allowlist is small** — `{"custom_copy", "feature_flags", "onboarding_checklist", "integration_handles"}` (`backend/app/schemas/lab_v2.py:21-25`). Provenance for "env created by feature X" belongs on the calling table (reverse FK like `target.scaffolded_env_id`) + `created_by_actor`, NOT in `manifest_overflow`. Adding to the allowlist is a cross-cutting platform change deferred until needed.
- **Operator-facing idempotency contracts beat layer-internal idempotency.** The v2 layer is slug-idempotent (`_existing_env_by_slug`), but two operator targets with the same firm_slug would silently share an env without per-target tracking. Always persist a feature-side FK (e.g. `cro_outreach_target.scaffolded_env_id`) as the operator contract; the slug-based check is defense-in-depth.
- **`v1` slug-sharing across outreach targets is ACCEPTED v1 behavior, not a bug.** Two outreach targets in different operator envs but with the same `firm_slug` will resolve to the same scaffolded env via v2 slug-idempotency. This is the deliberate v1 design choice ("there should be one Artemis demo env"). If strict per-target separation is ever required, that decision is reviewed and made explicitly — do not silently retrofit a per-target slug suffix.
- **Cross-schema FK is valid Postgres** — `public.cro_outreach_target.scaffolded_env_id → app.environments.env_id` works fine. Use `ON DELETE SET NULL` so v2-side deletions detach rather than cascade destructively into feature state.
- **REPE-template envs cannot auto-seed fund/asset/investor data** per the authoritative-state lockdown (`docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`). The `repe_starter` seed pack is deal-pipeline-only by design (writes 5 rows to `v1.pipeline_stages`). If a demo env needs richer data, wire it through the snapshot service, not the seed pack.
- **`environment_contract_v2.promotion_state` starts at `'draft'`** and cannot be promoted to `'released'` until Ticket 2 of the contract workstream lands. Phase 3 envs work fully (`lifecycle_state='verified'`) without ever touching the contract service.
- **`EnvironmentManifestV2.slug` is constrained to `^[a-z0-9][a-z0-9-]{0,39}$` (max 40 chars).** Real outreach firm_slugs like `artemis-real-estate-partners` (28 chars) pass; longer ones must be truncated by the caller or surface a clean 400. Phase 3 passes the firm_slug directly; if a future caller has longer slugs, add a truncation rule and document it.
- **Live smokes that scaffold real envs MUST do FK inspection + dependency-ordered cleanup with try/finally.** Phase 3 smoke prints `(app.environments, v1.environments, v1.pipeline_stages, app.environment_memberships)` row counts BEFORE deleting, then deletes in order: seed-pack rows (v1.pipeline_stages) → v1.environments mirror → memberships → app.environments → outreach target/microsite events. Verify each DELETE's rowcount. Use a unique short slug (e.g. `p3-smoke-art-{6hex}`) and pre-check that the slug doesn't already exist; if it does, abort the smoke (not yours to delete).
- **Render the "already scaffolded" state as SUCCESS/LINK, NOT a warning.** The gate's `available=false, blocking_reason="Environment already exists."` is an idempotency signal, not an error. The operator UI must render the "Open environment ↗" link in success tone with a small `Scaffolded · {lifecycle_state}` label — warnings are reserved for genuine not-ready states (no business_id, no CRM account, assets not ready, template missing, stored env missing).
- **Public microsite must never expose scaffold-related affordances.** Add a regression test that asserts `"scaffold" not in payload`, `"scaffolded_env_id" not in payload`, `"dashboard_url" not in payload` on the public GET endpoint. The Phase 3 test `test_public_microsite_payload_excludes_scaffold` catches accidental future leakage via route refactors.

## Operator-controlled scaffolding (2026-05-20, Outreach Personalizer Phase 3.5)

- **`GET /v2/environments/templates` is reusable across feature surfaces** (`backend/app/routes/lab_v2.py:list_templates`, cached 5 min inside `environment_templates_v2.list_templates`). When a feature needs to surface a subset of templates to operators, filter client-side to a feature-appropriate allowlist (Phase 3.5 uses `{repe, internal_ops, client_delivery, trading_research, legal_ops}`); do NOT add a filtered endpoint variant. UI churn does not justify API surface growth.
- **Soft caps belong in env vars, not service code.** `OUTREACH_ENV_QUOTA_PER_BUSINESS` reads from `app.config` (default 25) so prod can tune without a redeploy. The sprawl check filters `lifecycle_state != 'retired'` — retired envs do not count against the cap. Add similar caps via `app.config.<FEATURE>_<LIMIT>: int = int(os.getenv(...))` and reference the same constant inside the service; never duplicate the magic number at call sites.
- **Recreate slug counter via `count(*) WHERE slug = ? OR slug LIKE ?-r%` is sufficient for low-volume operator flows.** Two simultaneous recreates pick the same `-r{n}`; the v2 unique-slug index (`idx_app_environments_slug`) causes one INSERT to win, the other re-enters the existing-by-slug branch via `_existing_env_by_slug`, and both operators end up linked to the same fresh env. Document this — debug sessions that find "two targets share env X after recreate" should not chase ghost bugs.
- **The Phase 3.5 `can_recreate` flag means "the stored env is gone or retired, recreate is the only sensible next step."** It does NOT mean "operator can rebuild a healthy env at will." Healthy envs require manual retirement in the v2 env UI first. This is deliberate (honors "idempotency beats cleverness" — one healthy env per target); the route's recreate endpoint must reject healthy-env recreate with the exact `"Cannot recreate a healthy environment. Retire it in the env UI first."` Phase 3.6 will add a "Retire and recreate" combo for the unusual case where an operator legitimately needs to swap a healthy env's template.
- **Template choice is not persisted on the feature-side table.** Read it back from `app.environments.template_key` via `env_summary`'s LEFT JOIN to `app.environment_templates` (latest row by `is_latest=true`). If you find yourself reaching for a `cro_outreach_target.scaffolded_template_key` column, ask whether re-reading the env row is actually a problem — most callers already need the env row anyway. The Phase 3.5 recreate path preserves the operator's prior template choice by reading `env_summary.template_key` and falling through `payload.template_key → prior_template → "repe"`.
- **Reshape an idempotency-signal gate into a multi-outcome gate by adding flags, not branches.** Phase 3.5 turned the Phase 3 already-scaffolded branch from "one failure" into three cases (healthy / retired / missing) by adding `can_recreate: bool` to the gate's return shape. Existing call sites (route handler, list-view summary) keep working unchanged because they only read `available` and `blocking_reason`; the new flag is opt-in for the recreate endpoint. Avoid splitting a gate into separate functions per outcome — the shared state-collection cost dwarfs the branching cost, and a single `compute_X_state` lets every consumer see the same shape.
- **Operator UI: collapsed `<details>` is the right disclosure for "advanced" choices with a sane default.** The Phase 3.5 template picker is `<details>`-wrapped with `repe` pre-selected so the 95% case (operator just wants a REPE env) is one click. Operators who want to choose a different template expand the disclosure; everyone else never sees it. Pair this with disabling the picker once the env is scaffolded (`detail.scaffold?.env_summary` exists) — the choice is moot at that point and a visible-but-disabled control is worse than a hidden one.

## Microsite Generator v1 (2026-05-21, Outreach Personalizer Phase 4)

- **A feature can be "done" in the backend and still unusable — the gap is operator UX.** The Outreach Personalizer microsite generator existed end-to-end after Phase 1 (create target → generate assets → public `/for/{slug}` → tracking), but the operator page only had a hard-coded "Seed Artemis" button. `seedOutreachTarget` already accepted an arbitrary firm. Phase 4 shipped almost entirely as a frontend Create-Microsite form + small backend additions. Before scoping an "enrichment" or "make it reusable" ticket, check whether the pipeline is already general and only the entry UI is hard-wired.
- **Free-form JSONB storage + a typed schema at the API edge is the right split.** `cro_outreach_target.profile_json` stays free-form JSONB (no migration to add a field), but the API request/response models use a typed `MicrositeProfilePatch` so the endpoint never accepts arbitrary object soup. Document the known key set in one place (schema docstring + the service that consumes it). Don't add a column for every JSONB key — re-reading the row is almost always fine.
- **Pydantic `field_validator` raising during request-body parsing does NOT reliably become a 422 in this app.** The backend's `BaseHTTPMiddleware` stack lets `RequestValidationError` propagate as a server exception in the TestClient instead of converting it to a clean 422. Enforce domain caps/limits (e.g. `proof_points` max 5) at the **route layer** by raising `ValueError` — the route's existing `except ValueError → domain_error_response(400)` handler turns it into a clean, testable response. Keep the schema validator for *normalization only* (trim, drop empties).
- **Merge-don't-clobber for partial JSONB edits.** `merge_profile_json(target_id, partial)` reads the current `profile_json`, shallow-merges `partial` (a key whose value is `None` is *removed* — operator clear), writes the result back. Keys not in `partial` are preserved. Never `UPDATE ... SET profile_json = <new dict>` from a partial — that silently drops every key the caller didn't include.
- **CTA / link URLs from operators must be validated on write AND re-validated at serve time.** `safe_cta_url()` allows only `http(s):`/`mailto:` and rejects `javascript:`/`data:` — mirrors the `normalize_loom_url` pattern. The PATCH route validates on write; `_microsite_payload` re-validates at serve time so a tampered or legacy DB value can never reach the public page as an unsafe `href` (it degrades to the next CTA fallback instead).
- **"Regenerate all" must return the full refreshed pack, not fire-and-forget.** `POST /regenerate-all` regenerates insight → loom → email from one fresh insight set and returns the complete asset list, so the operator UI swaps in all three at once and never shows a half-old/half-new state. It is AI-required and fails closed (no deterministic fallback) — regeneration is an explicit operator action, and a half-deterministic result would be misleading.
- **"Duplicate" can be pure frontend prefill — no endpoint needed.** Because `POST /targets` is idempotent on `(env_id, firm_slug)`, duplicating a microsite to a new firm is just prefilling the Create form (new blank slug) from an existing target's fields and submitting. Don't build a duplicate endpoint for what is a client-side form-population convenience.

## Azure DevOps Board Management (2026-05-21)

CLI quirks (Azure CLI `az` on Windows, devops extension):

- The `az` binary lives at `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`. A fresh shell after MSI install does not have it on PATH; reference the full path.
- `az devops configure --defaults organization=... project=...` persists defaults, **but** any command that passes an explicit `--org` flag stops honoring the default `--project`. When you pass `--org`, always also pass `--project Novendor`. This silently produced "must be specified" errors on `work-item create`.
- Iteration path format for `work-item update --iteration` is `\Novendor\Sprint N` — **not** `\Novendor\Iteration\Sprint N`, even though the iteration tree shows the `\Iteration\` segment. The tree path and the assignment path differ.
- Area path creation needs the absolute parent: `--path "\Novendor\Area"` (the root area node), not `--path "\Novendor"`. Discover the root node with `az boards area project list --depth 1` (it returns `\Novendor\Area`).
- `--assigned-to` requires the real identity, not a display name. `"Paul Malmquist"` fails with "unknown identity"; use the account `paulmalmquist1984@outlook.com`.
- `az boards work-item relation add` succeeds silently but **piping its output to `Out-Null` discards the result you need to verify the link took**. Capture the JSON and assert `fields.'System.Parent' -eq <parentId>`. A whole batch of parent links failed silently this way before being caught.
- `WIQL` queries via `az boards query` do not return `System.Parent` in table output by default even when selected. Verify parent links with `az boards work-item show --id <id> --expand Relations` and read the `relations` array (`rel: "Parent"`).
- PowerShell 5.1: redirecting native stderr with `2>&1` into `ConvertFrom-Json` wraps lines in ErrorRecord objects ("Invalid JSON primitive: WARNING"). Use `2>$null`.
- Work Item states on this board are the Agile-process set: `New → Active → Resolved → Closed` (plus `Removed`). There is no `In Dev` or `In Review` state — `--state "In Review"` fails with "not in the list of supported values". Map workflow stages: implementation-started → `Active`, ready-for-review → `Resolved`, merged and verified → `Closed`.
- Test Plans REST API rejects MSA OAuth tokens (`az account get-access-token`); it needs a dedicated ADO PAT. Workaround: use the `Test Case` **work item type** through the standard Boards API instead.
- There is no in-place process change for an ADO project. Basic process boards have 3 fixed columns; to get configurable columns you must recreate the project with the Agile process and restore work items from a backup JSON.

Hierarchy + board hygiene decisions:

- Canonical hierarchy is **Epic → Feature → User Story → Task/Bug**. Every Story gets a parent Feature; every Feature gets a parent Epic. Do not parent Stories directly to Epics.
- A work item has exactly one parent. `relation add` only adds — it does not replace. To re-parent, `relation remove` the old parent first, then add.
- Always export a backup JSON (`az boards query` → `ConvertTo-Json`) before bulk changes or deletes.
- Do not create speculative empty Epics. Domains that are really Features of an existing Epic (AI Runtime under AI Training, Reporting/Compliance under Investment Engine, Documents under Legal/RAG) should be Features, not peer Epics. Five empty Epics created speculatively were closed during cleanup.
- Do not make `Platform-Core` an area-path dumping ground. Each Epic domain gets its own area path; Investment Engine Features were created in `Platform-Core` by mistake and had to be moved to `Investment-Engine` to match their Epic.
- Keep an Epic's Features and Stories in the **same area path** as the Epic.
- Test scenarios belong as `Test Case` items linked to their Story (via parent relation), or as Tasks under a test Story — not as peer User Stories.
- Sprint 1 of a new ADO operating rhythm should be foundation work (board cleanup, CI confidence, app shell, auth, multi-tenant isolation, capability manifest), 5–8 Stories max. Defer not-yet-started feature work (Morning Book, REPE, IE) to later sprints even if it was drafted first.
- Only create child Tasks for the current sprint's Stories. Do not pre-task the whole backlog.
- Superseded 2026-06-25: ADO is risk-based. R0 read-only work needs no item; R1 focused reversible changes reuse an item when useful but do not require new intake; R2 schema/security/MCP/infra/production/deploy/governance/multi-session work requires an approved Story/Bug and Session Brief.
- ADO state discipline for coding agents: `Active` at start, `Resolved` when code/tests/evidence are ready, `Closed` only when the PR is merged and deploy/smoke is verified. A local-only pass never closes a work item. Every session also appends an ADO discussion comment (branch/commit/PR, files, tests, evidence, risks, next item) — a bare state change is not an audit trail.
- If ADO is unavailable, block R2 mutation and report the exact error. R0 analysis and safe R1 local work may continue.

### RS MLOps team board is the control tower for RS/telemetry work (2026-06-24)

- The `Novendor` project is already on the Agile process. Do not recreate it or change the shared `Novendor Team` board.
- RS Analytics and telemetry work uses the dedicated `RS MLOps` team, scoped to `Novendor\RS-Analytics` with child areas included. The existing Epic/Feature/Story hierarchy remains authoritative; team boards are views over those same work items.
- The source of truth is `scripts/azure-devops/rs-mlops-control-tower.json`; apply it with `setup-rs-mlops-control-tower.ps1`. Always run `-DryRun`, then `-Backup`, before `-Apply`, and finish with `-Verify`.
- Board columns carry the detailed MLOps lifecycle while work-item states remain `New`, `Active`, `Resolved`, and `Closed`. `Verified` maps to `Resolved`; `Done` maps to `Closed`.
- Azure Boards requires the outgoing/Closed column to be last. The live order therefore ends `Verified → Blocked → Done`; the originally proposed `Done → Blocked` order is not accepted by the API.
- Azure DevOps plan names reject `/`, so the live Delivery Plan is `RS - Winston MLOps Delivery Plan`.
- Swimlane placement is explicit. Azure Boards does not move cards to a swimlane based on tags.
- Test Plans remain represented by linked `Test Case` work items until a dedicated ADO PAT and license are confirmed. Service hooks remain disabled until the `Agent Ready` polling flow is stable.

## Confluent Cloud CLI Management (2026-06-24)

CLI quirks (`confluent` CLI v4.60 on Windows). Owned by `skills/confluent-stargate-lifecycle/`.

- **Exit 0 does not mean success.** `confluent flink compute-pool update --max-cfu 0` returns exit code 0 while *rejecting* the argument in stdout: `Error: Bad Request: Violations [MaxCfu is not one of 5, 10, 20, 30, 40, 50: 0]`. Never trust the exit code alone — scan output for rejection markers (`Bad Request`, `Violations`, `is not one of`). This silently produced a false "parked at 0 CFU" cost claim before it was caught.
- **Flink pools cannot be parked at 0 CFU.** `--max-cfu` only accepts `{5, 10, 20, 30, 40, 50}`. There is no scale-to-zero for a compute pool. CFU-hours bill on *running statements*, not on the pool's `max_cfu` ceiling, so an idle pool (no running statements) costs nothing — to stop Flink billing, `confluent flink statement stop <name>`, don't lower the ceiling.
- **`flink statement list` prepends a notice line to stdout** before the JSON: `No Flink endpoint is specified, defaulting to public endpoint: https://flink.us-east1.gcp.confluent.cloud`. Piping straight into `ConvertFrom-Json` fails with "Error parsing NaN value". Strip everything before the first `[`/`{` first.
- **Flink commands need cloud + region.** `confluent flink statement list` errors with "no cloud provider and region selected" unless you pass `--cloud gcp --region us-east1` (the Stargate lane's region).
- **Stopping serving ≠ deleting topics.** Deleting connectors + stopping Flink statements stops the *active* costs losslessly — topics, their data, and Schema Registry subjects survive. Topics are cluster-scoped and only disappear when you delete the Kafka cluster. Schema Registry is environment-scoped and *may* survive a cluster delete, but export before relying on it.
- **`cluster_0` (lkc-gqpvvyv) is STANDARD, not Dedicated** — it bills a flat hourly base, not CKU-hours. CKU/CKU-hour billing is Dedicated-only. Read the real cluster type (`confluent kafka cluster describe`) before writing any cost message; don't hardcode "CKU".
- **Connectors: delete, don't pause.** A paused managed connector keeps accruing task-hour charges. `confluent connect cluster delete <id>` to actually stop the cost.
- **PowerShell empty-array trap (not Confluent-specific but bites here):** a function that does `return @()` can hand back `$null` because PS unwraps empty arrays through `return`. Wrap the *call site* in `@(...)` before reading `.Count`, and wrap `ConvertFrom-Json` results in `@()` since an empty `[]` deserializes to `$null`.
- **A Confluent service-account API key CANNOT drive the `confluent` CLI's control-plane commands in CI.** `kafka cluster describe`, `connect cluster list`, `flink statement list` require a full `confluent login` (username/password); with only `CONFLUENT_CLOUD_API_KEY`/`_SECRET` env they fail with "you must log in to Confluent Cloud with a username and password" (and `confluent login` with API-key env yields "no credentials found" — it's not a valid login mode). Two real options for headless CI: (a) machine email/password (`CONFLUENT_CLOUD_EMAIL`/`_PASSWORD` → `confluent login`), which exposes full-account creds; or (b) **skip the CLI and call the Confluent Cloud REST API directly** with HTTP-basic API-key auth — what the broker-refresh job does. REST endpoints: cluster `GET https://api.confluent.cloud/cmk/v2/clusters/<lkc>?environment=<env>`; connectors `GET …/connect/v1/environments/<env>/clusters/<lkc>/connectors`. The service account needs a read role first (`confluent iam rbac role-binding create --principal User:sa-… --role Operator --environment <env>`) or cluster reads return **403 forbidden** even with a valid key. Flink statements live on a *regional* host (`https://flink.<region>.<cloud>.confluent.cloud/sql/v1/organizations/<org>/environments/<env>/statements`) and need a separate **Flink-scoped** key (the Cloud key gets 401 there) — make that check best-effort.
- **GH runner: the confluent CLI installer can't write `/usr/local/bin`** ("install: cannot change permissions … Operation not permitted") — install to `$HOME/.local/bin` and add it to `$GITHUB_PATH`. (Moot if you go the REST route and skip the CLI entirely.)
- **Age a status row from its own `as_of_ts`; never trust a stored "fresh" as still-current.** A row re-stamped on a fixed cadence (e.g. a 15-min refresh job) must be aged client-side: if `now − as_of_ts` exceeds ~2× the cadence, render it STALE regardless of the stored status. This keeps the surface honest if the writer stops, with no extra signal. Pair it with a *fail-closed writer*: when the periodic check itself fails, write an explicit `stale`/`check_failed` state — do **not** re-write the last good state as if freshly verified.
- **Fail-closed probe: distinguish 404 from auth/network failure before declaring a resource "gone".** A first cut classified *any* `cluster describe` error as "cluster missing → gone", so a CI auth failure wrote a false `broker=gone` while the cluster was UP. Only a genuine 404 may map to "deleted"; 401/403/timeout are *ambiguous* → write `stale`, never a confident absence. Lock it with a test that feeds a 403 and asserts the result is not `gone`.
- **Age a status row from its own `as_of_ts`; never trust a stored "fresh" as still-current.** A row re-stamped on a fixed cadence (e.g. a 15-min refresh job) must be aged client-side: if `now − as_of_ts` exceeds ~2× the cadence, render it STALE regardless of the stored status. This keeps the surface honest if the writer stops, with no extra signal. Pair it with a *fail-closed writer*: when the periodic check itself fails, write an explicit `stale`/`check_failed` state — do **not** re-write the last good state as if freshly verified (that would launder a stale value into a fresh-looking one).

### After a feature merges to main, do a docs-only "presentation hardening" pass before the next layer (2026-06-02)

When a multi-phase feature crosses from active build to production-shipped (merged to `main`, deployed, smoke-verified), freeze the win as portfolio artifacts *before* starting the next phase — it's cheap insurance against the demo decaying into "depends on the author's memory." Two docs carry it: a **reviewer runbook** (`telemetry-platform/REVIEWER_DEMO.md` — login/auth flow, exact production routes, a timed click-through script, the **exact expected evidence values** so a reviewer can confirm groundedness, what NOT to claim, and known caveats) and a **2-minute portfolio proof** (`telemetry-platform/docs/portfolio-proof.md` — problem → architecture → proof points → applied-AI controls → routes → tests → "what this demonstrates", pasteable into a recruiter message). Keep it docs-only (no runtime changes); reference the screenshots already in the repo rather than regenerating; pin the real IDs/metrics so the artifact and the live system can't silently drift. Do this on a clean branch off `main` in an isolated `git worktree` so an unrelated dirty primary working tree is never disturbed. Caveats a portfolio reviewer needs stated up front: public-analog-data-only (no proprietary / no physical root cause / no safety disposition), manual deploys (Railway/Vercel don't auto-deploy on push — state deploy↔main parity), auth-gated UI, and any legacy branch-name mismatch already merged.

### An honest AI-governance dashboard is an observability layer over existing logs, not a new platform (2026-06-02)

To build a "can we trust the AI layer, and how do we know?" page, surface what's ALREADY logged — don't add new copilot behavior or a policy engine. The whole dashboard reads from the existing interaction audit table + the active prompt-version row; the *only* instrumentation worth adding is recording **why** an answer fell back (a `fallback_reason` column: `postvalidate_block | timeout | empty_response | llm_error | no_api_key`), because that turns "fallback rate" into a real **post-validator block count** — the single most credible governance number. Honesty rules that make it convincing rather than decorative: (1) a null metric renders **"Not available"**, never a misleading 0 — and a *real* 0 (e.g. zero post-validator blocks because the LLM stayed grounded) is fine to show as 0; (2) eval pass/fail comes from a **committed artifact produced by a real pytest run** (`run_governance_evals.py` maps named eval cases → test `-k` exprs, writes `eval_results.json`), served labeled with the run timestamp + source — never hand-typed pass/fail; (3) production-smoke that isn't machine-automated is shown as the **last manually recorded** run (status + timestamp + source), explicitly not a live status; (4) empty example lists say "None recorded". Serve runtime-readable artifacts from `backend/app/data/telemetry/` (alongside the replay fixture) so the Docker image ships them. To run a REAL `tsc` from a fresh worktree that has no `node_modules` (the silent-no-op footgun), junction it to the primary checkout's: `New-Item -ItemType Junction -Path <wt>/repo-b/node_modules -Target <main>/repo-b/node_modules` — valid only when no deps changed between the two commits.

### Scope one environment behind a dedicated login without touching the Supabase admin path (2026-06-02)

repo-b auth = Supabase `signInWithPassword(email,pw)` → `/api/auth/session` → signed `bm_session` (HMAC `BM_SESSION_SECRET`); `middleware.ts` enforces *per-env membership* but has **no per-route/per-role scoping**, and `/api/telemetry/**` isn't in the matcher (public). To wall a single env behind a non-Supabase reviewer credential the smallest safe change is: (1) add a scoped role to `EnvironmentMembershipRole`; (2) a tiny route `/api/auth/telemetry-login` that checks env-var creds (`TELEMETRY_REVIEWER_*`; **fail closed = disabled if any unset**, never silently open) and mints the SAME `bm_session` with a single membership on that env, `platform_admin:false`, role=scoped — reusing `signPlatformSession` + `applyPlatformSessionCookies`, no Supabase user, no DB row; (3) a middleware gate, placed right after the `/api/auth/` passthrough, that confines the scoped role to `/lab/env/<its env>/telemetry*` (pages redirect to that home, APIs 403) — other envs are *already* denied by the per-env membership check, so this only closes the within-env and slug-route gaps; (4) route a non-email username on the login form to the new endpoint so emails (real accounts) keep the untouched Supabase path. Gotchas: the slim membership's `env_slug` must be a real `EnvironmentSlug` for typing — use the workspace's real slug and rely on the gate (not the slug) as the boundary; put the gate BEFORE the top-level-slug handler or the slug membership leaks `/＜slug＞/**`; extract the logic to a pure runtime-agnostic helper so it imports cleanly into both edge middleware and the node route AND is unit-testable; test the *exact* allowed-path matcher (a `…/telemetry-secret` lookalike must NOT match `…/telemetry`). Deploy is the dangerous step — set the env vars in the host and treat the prod cutover as a reviewed, separate action; don't hardcode the password in source.

### Compute honest metrics by reproducing the frozen rule offline — no retrain, no alias move (2026-06-02)

When a model's "champion metric" is suspected of being inflated (point-adjusted F1 is the classic case: one in-window hit credits the whole labeled segment), you do NOT need to retrain or rerun the training notebook to get an honest number — and you shouldn't, because that risks moving a production alias or the live serving path. If the champion is a *deterministic rule* (here: `resid = |value - rolling_mean50|`; per-channel scale = median TRAIN residual with a global fallback; flag when `resid > K·scale`, K=4.0), reproduce the rule locally against the raw public inputs + labels, in pure numpy, and score the SAME predictions two ways. Pin the reproduction to the lakehouse feature spec exactly — the rolling mean here is `ROWS BETWEEN 49 PRECEDING AND CURRENT ROW` partitioned by `(chan_id, split)`, i.e. a trailing window-50 mean with `min_periods=1`, no look-ahead, no train/test leak. Validate fidelity by re-deriving the stored metric: local point-adjusted F1 0.645 vs stored 0.639, with recall matching to three decimals, confirms the local champion == the promoted champion. Then report the honest floor beside the legacy number: point-wise P/R/F1 (every tick scored on its own), event recall (fraction of labeled segments with ≥1 in-window alarm), and alarm precision. Real result: point-adjusted F1 0.639 collapses to point-wise F1 0.313 — the honest story is "notices most segments (event recall 0.77), weak at the tick level." Persist the honest keys with an **idempotent jsonb merge into only the one champion row** (`UPDATE … SET metrics = metrics || jsonb_build_object(...) WHERE id = '<champion>' AND model_alias='champion' AND model_kind='anomaly'`) — `jsonb ||` overwrites just those keys, re-runs are safe, and the `WHERE` guard means unrelated RUL/challenger rows are never touched. `metrics` being `jsonb NOT NULL DEFAULT '{}'` means new keys need no migration. Render them in the UI conditionally (`rows.find(m => m.metrics?.f1_pointwise != null)` → null when absent) so older rows and other environments are unaffected. Defer harder range-aware metrics (VUS-PR/ROC, formal affiliation/PATE) until you can use a vetted library rather than hand-rolling under time pressure — a wrong range-aware number is worse than an honest simple one.

### Visual-receipt an auth-gated /app page with a jsdom render of the page component + mocked data — don't try to forge a session for a screenshot (2026-06-16)

ADO #622 wanted a browser screenshot of `/app/event-analytics` showing `available=true`. Three walls made the full-stack browser path expensive, and it's worth knowing them up front: (1) **`/app/*` is gated by `repo-b/src/middleware.ts`** — no `PLATFORM_SESSION_COOKIE` → server-side redirect to `/login` *before the page renders*, so Playwright's `page.route()` mock of `/api/auth/me` (the pattern in `tests/admin-environments-layout.spec.ts`) does NOT get you in; you'd need to forge a cookie, which needs `BM_SESSION_SECRET`. Don't reintroduce a production secret to forge auth for a screenshot. (2) **The backend won't boot without `DATABASE_URL`** (`config.py` `load_dotenv()` then a hard `FATAL: DATABASE_URL is not set` exit) — and `load_dotenv()` is CWD-relative, so a backgrounded uvicorn that doesn't actually run from `backend/` silently gets an empty env. (3) **`DATABASE_URL` is NOT in Vercel** — `vercel env pull` from `consulting-app` returns it as empty `""` (it's a Railway backend secret); CLAUDE.md's "secrets live on the repo-b project" note is stale (`repo-b` has zero env vars; `consulting-app` is the live project). The reliable receipt that closes the actual gap: a **vitest + @testing-library/react jsdom render of the page component** (`page.render.test.tsx` beside `page.tsx`), mocking `@/lib/bos-api`'s fetch function to return the LIVE-PROVEN payload (capture it once from the real backend `get_dashboard()` call), then assert every section renders — KPI values, all tables, the observability badge, preserved nested-dict/string cells — plus a second case asserting the `available=false` fail-closed "Not available" path. This proves the DOM the user sees and runs in CI forever, without DB/auth/screenshot infra. Query gotcha: labels that appear in both a KPI strip and a section header (e.g. "Dead letters", "Observability only", the dataset name) need `getAllByText(...).length > 0`, not `getByText` (which throws on multiple matches). A pixel PNG via a logged-in browser stays an optional extra for a preview deploy; the render test is the durable receipt. Cleanup: `vercel link` writes `.vercel/` + a `vercel.json`, and `vercel env pull` writes secrets to disk — delete all three before finishing (`rm -rf .vercel vercel.json backend/.env`) so nothing secret or tooling-scoped gets committed.

### When you remove a feature surface, a Context provider unmounted while a `useX()` consumer survives is a render-time crash, not dead code (2026-06-16)

PR #168 "removed Winston AI chat" by stripping the provider from `Providers.tsx` (`WinstonProviders` no longer wraps `WinstonCompanionProvider`) — but left `OperatorPages.tsx` calling `useWinstonCompanion()`. That hook does the standard `const ctx = useContext(Store); if (!ctx) throw new Error("must be used within WinstonCompanionProvider")`. So every `/lab/env/[envId]/operator/*` page that rendered the panel **threw on render** — a live crash that sat undetected because (a) the page needs the full DB/auth stack to render, so it never showed up in headless CI, and (b) the component unit tests *mocked* `useWinstonCompanion`, so they stayed green over a broken integration. Lesson: when removing a provider, grep for **every** `useThatContext()` consumer, not just the mount site — an orphaned consumer of a throwing context hook is worse than dead code because it crashes at render. The fix here was to delete the dead consumer panel + its now-unused imports (watch for an icon import like `ArrowRight` that was used *only* inside the removed JSX — it becomes an unused-import lint failure). Two more removal-hygiene notes: (1) a Playwright spec that's been `describe.skip`'d "until we decide" for a *retired* (not deferred) surface should be **deleted**, not left as a permanent skip — a skip is a TODO that never gets done; if the whole file only tested the retired surface, remove the file. **And grep the CI workflows for the spec path**: a dedicated release-gate job (`.github/workflows/ci.yml` `winston-first-mile`) ran `npx playwright test tests/global-commandbar.spec.ts ...` with a hardcoded path — deleting the spec made the gate fail with `Error: No tests found` (exit 1). The gate existed only to test the retired surface, so the whole job was removed too. Deleting a spec without checking the workflows that invoke it just moves the red from the spec to the gate. (Safe to remove a CI job when it has no `needs:` dependents and isn't a branch-protection required check — verified via `gh api repos/.../branches/main/protection` showing empty `required_status_checks`.) (2) Leaving the dormant component tree (`GlobalCommandBar`, `winston-companion/`) in place is fine when it's genuinely unmounted (grep confirms no import/JSX usage outside its own tree + tests) and a rebuild may reuse it — dormant-but-unreferenced ≠ crashing. Don't mass-delete a large component tree as part of a "cleanup" ticket: it risks the >100-file deletion gate and unrelated test imports, and discards reusable work. Fix the crash, resolve the skip, leave the dormant code.

### A BigQuery observability dashboard is a legitimate read path, but keep it structurally separate from operational reads — and encapsulate the one raw-table touch in a view (2026-06-15)

Plan 0004's hard invariant is "no app read path uses BigQuery." A read-only analytics dashboard over the deduped views is a *legitimate* read path, but it's a different class than the operational reads the invariant protects (execution status, REPE/finance KPIs, HR ledger — all Postgres-authoritative). Make the separation structural, not just documented: (1) a backend read service with an `ALLOWED_VIEWS` allowlist and a `_view_fqn(view)` guard that **raises** on anything not whitelisted — so querying the raw `winston_events_raw.events` table is a programming error caught by a unit test (`test_view_fqn_rejects_raw_table`), not a code-review hope; (2) fail closed exactly like the sink — lazy-import the bigquery client, gate on `BQ_ENABLED`/`BQ_PROJECT_ID`, and return `{available: false, reason}` (HTTP 200) when BQ is off/unreachable rather than 500-ing, so the UI renders a clean "Not available" instead of an error; (3) label the surface "observability only" in the UI so nobody mistakes it for operational truth. The subtle one: the dashboard's headline is "raw N → deduped M (replay dupes collapsed)", which *needs* a raw `COUNT(*)`. Don't let the API call `COUNT(*) FROM ...raw.events` directly — that's a raw read in the API, against the spirit of the invariant. Instead put the count inside an analytics **view** (`event_volume_summary` with `(SELECT COUNT(*) FROM raw)` baked in): the raw→deduped boundary legitimately lives in the analytics layer, and the API/UI then read only analytics views. A `COUNT(*)` is metadata, not content aggregation, but routing it through a view keeps the "API never names the raw table in a query" property clean and greppable. Backend route prefix conventions matter — `/api/analytics/v1` is already the analytics *workspace*, so use a distinct prefix (`/api/events/v1`) to avoid collision. Frontend: thin `bosFetch` binding + typed interface; the page reads via the `/bos` proxy like every other surface — no direct BigQuery client in the browser.

### Build the analytics semantic layer on a deduped view BEFORE any rollup or dashboard — never aggregate the append-only raw event table directly (2026-06-15)

An append-only raw event lake (here `winston_events_raw.events`) can contain replay duplicates — BigQuery `insertId` dedup is not durable beyond ~1 min (proven in Phase 5B). So the FIRST analytics deliverable is a `events_deduped` view, and every rollup builds on it, not on the raw table. The dedup is query-time on the stable content-addressed `idempotency_key`: `ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY ingested_at ASC, event_id ASC) = 1` — keep the earliest observation, tie-break on `event_id` for full determinism. This collapsed 22 raw rows to 17 (5 replayed rows removed) and a replayed HR bundle's 11 raw rows back to the correct 8. Dead-letter rows dedup the same way because the Phase 5A fix gave them a non-null `dead_letter:<sha256>` key — so distinct failures stay distinct and a replayed bad payload collapses to one. Practical BigQuery gotchas applying the SQL: (1) **semicolons inside `OPTIONS(description="...")` strings break naive `;`-splitting** when you apply a multi-statement file via the Python client — either keep descriptions semicolon-free or split more carefully; the symptom is a misleading "Unclosed string literal" error. (2) Strip `--` comments per-statement before splitting (comment text is otherwise sent mid-statement). (3) Apply view files statement-by-statement with `client.query(stmt).result()`; `CREATE OR REPLACE VIEW` is idempotent so re-running the whole folder is safe. (4) Keep `signal_value` as `JSON_QUERY(payload,'$.signal_value')` (not `JSON_VALUE`) so object/array values like `housing={"price_yoy":...}` survive — `JSON_VALUE` returns NULL for non-scalars. Why this ordering matters: do the semantic layer before the first dashboard, or the dashboard charts duplicated replay rows and lies convincingly. The views are read-only (no Postgres, no migration, BigQuery stays observational); a later phase can materialize them for cost/perf, but the deduped view is the permanent contract every consumer reads through.

### Wiring a real producer to a streaming spine: the real bundle shape rarely matches your synthetic fixture — adapt, don't overload (2026-06-15)

Phase 5A proved History Rhymes signals through the spine with a *synthetic* bundle shaped `{signal_name: {signal_value, signal_timestamp, units, confidence}}`. The REAL manual bundle (`scripts/hr_weekly_brief.py`) is shaped differently: signals are a **flat `{signal_name: value}` map** where value is a scalar (`mvrv_z: 1.4`), a nested dict (`housing: {price_yoy, starts_yoy}`), or a string (`fed_tone: "hawkish-hold"`), plus a *sibling* `per_signal_freshness` map and a `source` key living inside the same `signals` dict. Don't bend the existing `bundle_to_envelopes` to swallow both shapes — add a dedicated `real_bundle_to_envelopes` adapter that reuses the per-signal envelope builder underneath. Three things that matter for the adapter: (1) iterate a **canonical name list** (`HR_SIGNAL_NAMES`, the 8), not `signals.keys()`, so metadata keys (`per_signal_freshness`, `source`) never get emitted as signals and unknown/future signals are ignored (forward-compat) rather than crashing; (2) preserve the raw value as `signal_value` regardless of JSON type — the EventEnvelope payload is a free dict and BigQuery's payload column is JSON, so a nested dict or string rides through untouched; (3) map `per_signal_freshness[name]` to `staleness_status`, defaulting to `"unknown"` when absent. **Replay safety comes from a content-addressed idempotency_key + query-time dedup — NOT from insertId.** Republishing the same historical bundle produces identical keys (`hr.signal.observed:{as_of_date}:{signal_name}`). It's tempting to claim BigQuery's streaming-insert `insertId` dedup makes replay free — and a same-minute redelivery IS deduped — but **`insertId` dedup only holds for a short window (~1 min, same partition)**. A genuine historical replay lands minutes/days later, outside that window, and WILL write duplicate raw rows (verified: replaying 3 signals produced 2 rows each, not 1). That's fine and expected — the raw table is append-only by design. The canonical read collapses them: `QUALIFY ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY ingested_at) = 1` (verified to return exactly one row per signal after a duplicate-producing replay). So: a `--replay` flag is safe because duplicates are *collapsible at read time*, not because they're *prevented at write time* — don't conflate the two, and make sure any consumer of the raw events table reads through the dedup view, not the raw rows. `--max-signals N` (slice the canonical-ordered envelope list) gives bounded replay. Crucially this needed **no Postgres migration**: the producer only reads the bundle JSON and emits events; `hr_signal_snapshots` and the decision runner (which stays the authoritative Postgres reader) are untouched. When a ticket says "wire to the real path," inspect the real path's data shape *first* (read the existing manual script), because that shape — not your fixture — is the contract.

### A dead-letter row needs non-null values for every REQUIRED BigQuery column, or the dead-letter itself silently fails to land (2026-06-13)

The observational sink builds a dead-letter row when an envelope fails validation. The natural instinct is to set the missing source fields (`event_id`, `idempotency_key`) to `None` — the message had no valid envelope, so it has no real key. But if the BigQuery table marks those columns `REQUIRED` (the `events` table does, for both), the dead-letter `insertAll` fails with `Field value of <col> cannot be empty`, and now the dead-letter row is *also* lost — the worst case, because dead-lettering exists precisely so nothing is dropped silently. The `_route_dead_letter` catch logs it and moves on (correct — you don't dead-letter the dead-letter), so the consumer still returns `status=dead_letter` and the offset commits, but BigQuery never sees the bad record. Fix: synthesize deterministic non-empty values from a hash of the raw bytes — `event_id = uuid5(NAMESPACE_URL, "dead_letter:" + sha256(raw))`, `idempotency_key = "dead_letter:" + sha256(raw)[:32]`. Deterministic means a redelivered bad message dedups at the BQ insertId layer instead of piling up duplicate dead-letter rows. **This class of bug only surfaces when a dead-letter actually reaches BigQuery live** — unit tests that mock the BQ client pass, because the schema's REQUIRED constraint lives in BigQuery, not in the Python row dict. The first real malformed message through the deployed pod is what exposes it. Lesson: when you add a new event stream, deliberately publish one malformed payload end-to-end and confirm the dead-letter *row* lands in BQ (`WHERE dead_letter = TRUE`), not just that the consumer logged `status=dead_letter`.

### GKE Autopilot sink worker: Workload Identity over key files, and the deploy gotchas that actually cost time (2026-06-13)

Deploying a stateless consumer (Kafka → BigQuery) to GKE Autopilot. The architecture: a long-running `SinkWorker` loop (`subscribe → poll → process_message → commit`) with `enable.auto.commit=false` so the offset only advances after the sink durably handles the message — at-least-once, made idempotent by the BQ `insertId=idempotency_key` dedup. Commit happens after BOTH success and dead-letter (a dead-lettered message is "handled", don't reprocess it); a handler *exception* must NOT be caught at the loop (let the pod crash → k8s restarts → no commit past an unhandled message), which works because `process_message` is contracted to never raise (it dead-letters internally). Health for k8s probes is a stdlib `http.server` thread exposing `/healthz` (liveness) + `/readyz` (readiness, flipped false on graceful drain) — no web framework needed in a worker image. **BigQuery auth = Workload Identity, never a key file.** Bind the k8s SA to a GCP SA: annotate the KSA `iam.gke.io/gcp-service-account: <gsa>@<proj>.iam.gserviceaccount.com`, then `gcloud iam service-accounts add-iam-policy-binding <gsa> --role=roles/iam.workloadIdentityUser --member="serviceAccount:<proj>.svc.id.goog[<namespace>/<ksa>]"`. The GSA needs `roles/bigquery.dataEditor` + `roles/bigquery.jobUser`. No `GOOGLE_APPLICATION_CREDENTIALS`, no JSON in the pod. Workload Identity is on by default on Autopilot. **Two gotchas that cost real time:** (1) The entrypoint's `sys.path` bootstrap can't assume repo layout. `Path(__file__).resolve().parents[2]/"backend"` works in the repo (`scripts/streaming/run_sink_worker.py` → repo root → `backend/`) but **throws `IndexError` in the image** where the file is `/app/run_sink_worker.py` with the package at `/app/app/`. Make it layout-agnostic: probe candidate dirs (`__file__.parent`, then `parents[2]/backend` only if `len(parents) > 2`) and insert the first one that actually contains an `app/` dir. Always test the built image (`docker run`), not just the repo — this bug is invisible until containerized. (2) Pushing to Artifact Registry fails with `docker-credential-gcloud: executable file not found in %PATH%` if `gcloud auth configure-docker` set `credHelpers["<region>-docker.pkg.dev"]="gcloud"` but the helper binary isn't installed (common on Windows). Fix: remove that one `credHelpers` entry from `~/.docker/config.json` and authenticate with an access token instead — `gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://<region>-docker.pkg.dev`. Build context must be the repo root (`docker build -f backend/Dockerfile.sink-worker .`) so the image can COPY both `backend/app` and `scripts/streaming/run_sink_worker.py`. The image is deliberately lean — a `requirements-sink.txt` with only pydantic + confluent-kafka + google-cloud-bigquery, NOT the full backend requirements (no FastAPI, no DB driver). Autopilot cluster creation takes ~8–15 min (`create-auto`); kick it off in the background and build/push the image + create the GSA in parallel. Cluster cost is real (~$0.10/hr management + pod resources); `gcloud container clusters delete` to stop the bill. **`kubectl` on Autopilot needs `gke-gcloud-auth-plugin`** (`gcloud components install gke-gcloud-auth-plugin`) or every command dies with "client-go credential plugin not installed" — install it before `get-credentials`. **The receipt's real trap: a too-short producer flush silently drops the message.** When proving an end-to-end drain, the smoke publisher used `EVENTS_PUBLISH_TIMEOUT_MS=200` (a deliberately bounded best-effort flush for the hot path), which is far too short to ack a produce to Confluent Cloud from a developer machine — the process exits with the record still queued (`Producer terminating with 1 message still in queue or transit`), and it NEVER reaches the broker even though `publish_event` returned True (best-effort = "queued", not "delivered"). The consumer then correctly shows nothing because there's nothing there. Diagnose by checking watermarks: `consumer.get_watermark_offsets(tp)` reading `[0,0]` on the target partition means the message was never written, not that the consumer missed it. For a guaranteed-delivery test publish, use a dedicated producer with a real flush and a delivery callback: `p.produce(topic, value=..., callback=cb); p.flush(30)` and assert `cb` saw `err is None` with a concrete `partition`/`offset`. Also note a 6-partition topic spreads messages across partitions, so a single consumer must be assigned the right one — with one consumer in the group it gets all 6, but confirm the published partition (from the delivery callback) matches a `handled <topic>/<partition>@<offset>` line in the pod log.

### Confluent Cloud needs SASL_SSL on top of the local Redpanda transport; keep the security keys env-derived and default-off (2026-06-10)

A Kafka transport built for local Redpanda only sets `bootstrap.servers` (PLAINTEXT). Confluent Cloud — and any managed broker — needs SASL_SSL + PLAIN auth with an API key/secret, or `produce()` fails to connect. Don't fork the transport or add a `ConfluentTransport`: extend the producer config. Add `EVENTS_SECURITY_PROTOCOL` (default `PLAINTEXT`), `EVENTS_SASL_MECHANISM` (default `PLAIN`), `EVENTS_SASL_USERNAME`, `EVENTS_SASL_PASSWORD`, and a `producer_security_config()` helper that returns the librdkafka keys (`security.protocol`, `sasl.mechanisms`, `sasl.username`, `sasl.password`) **only when the protocol is non-PLAINTEXT** — so the default (local Redpanda) producer config is byte-identical and CI/local dev is untouched. The same security dict feeds both the producer (`KafkaTransport`) and any consumer (smoke script), so they stay in sync. librdkafka quirk: the key is `sasl.mechanisms` (plural) for the producer config dict, not `sasl.mechanism`. Confluent specifics: a **Basic cluster does not auto-create topics** — create `winston.executions.v1` / `winston.dead-letter.v1` in the console before the smoke, or the produce silently lands nowhere and the consumer polls forever. The API **secret is shown once** at key creation — capture it immediately. Bootstrap server is under Cluster Settings → Endpoints, port `:9092`. Test the security layer without a broker: patch `EVENTS_SECURITY_PROTOCOL`/SASL fields and assert `producer_security_config()` output, and patch a fake `confluent_kafka` module into `sys.modules` to assert `KafkaTransport` merges the keys into the producer conf — no network, no credentials, runs in CI. Keep the broker round-trip proof (`broker_smoke.py`: publish → consume → existing `sink.process_message` → BQ receipt) in a script, not the app — the long-running consumer belongs to the future GKE sink worker, not the request path. Never commit or log the API secret; the smoke redacts the username and never prints the secret. **API-key scoping is the real time sink — get it right first.** Three distinct failures, in order of how we hit them: (1) a **Global/Cloud API key** (account-level, shown with scope "Global" in the API Keys list) **cannot authenticate to a Kafka cluster** — `SASL authentication error: Authentication failed... if you are using a Global API key, check whether this cluster type is supported`. You need a key scoped to the Kafka cluster, not Global. (2) A **cluster-scoped key tied to a service account** authenticates but is **deny-by-default if the cluster has any ACLs** (e.g. a leftover Datagen/sample-data connector created a service account with ACLs, which flips the whole cluster to explicit-allow) → `TOPIC_AUTHORIZATION_FAILED`. The data-plane key cannot grant its own ACLs (`CREATE_ACLS needs ALTER permission` → `CLUSTER_AUTHORIZATION_FAILED`). (3) The clean fix: create an API key **associated with your user account** ("My account", shows your name in "Associated account"), scoped to the cluster — it carries your RBAC admin role, so it has full produce/consume/create with no ACL setup. The Confluent CLI's SSO login (`confluent login --no-browser`) is unusable from a non-interactive agent shell: each tool call is a fresh process, so the login process dies between printing the OAuth URL and reading the pasted code, and the code is bound to that process's `state` param — it can't span calls. For agent-driven setup, skip the CLI; either drive topic/ACL creation through a user-account Kafka key via `AdminClient`, or have the human do the one-click key creation in the console. A **Basic cluster does not auto-create topics**, so create them via `AdminClient.create_topics` (replication_factor=3 on Confluent Cloud) or the UI before the smoke; `replication_factor=1` is rejected.

### google-cloud-bigquery requires credentials to write; the no-op path (BQ_ENABLED=false) needs none (2026-06-10)

`google-cloud-bigquery` now belongs in `requirements.txt` once the sink worker ships (Phase 2+), even though `BQ_ENABLED` defaults to `false`. The package is lazy-imported inside `write_row_to_bq`: if it's missing, the call raises `BigQuerySinkError("google-cloud-bigquery is not installed")`, which the sink routes to dead-letter. No crash, no silent drop. For CI, `BQ_ENABLED=false` short-circuits the function entirely before the import, so CI needs no credentials and no package pin beyond listing it in requirements.txt. For local dev without a GCP project: run the smoke script without setting `BQ_ENABLED` — it prints the no-op path and exits 0. For a real write, the cheapest credential path on a developer machine is `gcloud auth application-default login` (ADC); in GKE, use Workload Identity (no key file, no `GOOGLE_APPLICATION_CREDENTIALS`). Never commit a service account JSON file — add `*.json` to `.gitignore` for any key directory and set `GOOGLE_APPLICATION_CREDENTIALS` to the path at runtime. BigQuery streaming inserts have a short propagation delay (~seconds); if the acceptance receipt query returns 0 rows immediately after a write, wait and re-run — the write happened, the table just hasn't made it visible yet. **Runbook:** gcloud CLI installed via `winget install Google.CloudSDK` (Windows); after install the binary lives at `%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud` — it is NOT on PATH until a new shell starts, so use the full path or restart. `bq mk` uses Python and requires `python3.14` or `python3` on PATH; if `python3.14: command not found`, create the dataset+table via the Python `google.cloud.bigquery` client instead (see smoke script). **Streaming inserts need a full GCP billing account.** `insert_rows_json` (the `insertAll` streaming API) is blocked with "Streaming insert is not allowed in the free tier" unless a billing account with a payment method is linked to the project. A "My Maps Billing Account" (Google Maps-specific) does NOT unlock BigQuery streaming inserts — it must be a general-purpose billing account. For smoke-testing on free tier, add `--batch` to `bq_smoke.py`: it uses `load_table_from_json` (a batch load job, free tier compatible) to prove auth + write + query-back without streaming billing; the sink code stays unchanged. Do not overclaim a real write in a commit message if you only have the no-op path — amend before pushing. Phase 3A proven 2026-06-10 via `--batch` on project `paultest-d3cb1`.

### BigQuery sink workers must be observational-only and must not swallow BQ errors silently (2026-06-09)

When a Kafka→BigQuery sink worker is the first GKE workload in a new streaming initiative, keep it to exactly four operations: consume → validate envelope → write raw row → dead-letter on any failure. "Observational-only" means no Postgres writes, no execution-status mutations, no downstream side effects, no AI. Violating this before the pipeline is trusted turns one initiative into three concurrent migrations. Two specific failure modes to cover in tests: (1) **BQ unavailable must route to dead-letter, never produce `status=ok`** — if the BQ write raises, the result must be `{"status": "dead_letter", ...}`, not silently swallowed; a test that patches `write_row_to_bq` with a raising mock and asserts `result["status"] != "ok"` is the minimal proof. The mock trap: `patch(..., side_effect=[callable_that_raises, None])` with a callable in a list does NOT raise — mock calls the callable and returns its return value; use `side_effect=ExceptionInstance` (not in a list, not a callable) for "raise unconditionally." (2) **`BQ_ENABLED=False` makes `write_row_to_bq` a no-op**, so tests that want to exercise the failure path must patch `BQ_ENABLED=True` (or patch `write_row_to_bq` directly) — a test that checks the raising path while `BQ_ENABLED=False` will see `status=ok` and pass for the wrong reason. Use `idempotency_key` as BigQuery `insertId` for best-effort dedup on streaming inserts; for hard dedup on replay use `QUALIFY ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY ingested_at) = 1`. The envelope field `source_service` maps to BQ column `source` — verify this explicitly in a `test_row_mapping_source_field` test so a rename in the envelope never silently breaks the BigQuery column contract.

### Scenario generators need whole-dataset key checks and integer-feasible anchors (2026-06-10)

Reserving "high" IDs for scenario rows is not enough unless the normal generator's range explicitly
excludes them. A two-row anchor using IDs 998/999 collided with a normal 1..998 sequence while all
table-specific tests still passed. Every deterministic generator suite should iterate the dataset's
declared natural keys and assert uniqueness for every table. Percentage anchors also need feasible
integer denominators before downstream facts are built: a 62/62 split cannot produce rounded 78% and
91% pass rates, while a configured 60/64 split can. Store denominator splits in scenario config,
validate they sum to the declared total, and make downstream generators consume that config instead
of deriving their own counts.

### Make the honest metric the GATE without destabilizing the live path; surface conformal as a diagnostic (2026-06-03)

Turning an honest metric from a *display* (Stage 0) into the *promotion gate* (Track A) does not require retraining or moving the live champion. Keep it offline + additive: (1) **Declare the gate thresholds in writing BEFORE you recompute**, and pick them so the current champion *clears its own gate* — check against the already-known live values first (here f1_pointwise 0.313 / event_recall 0.769 / alarm_precision 0.328 cleared 0.10/0.50/0.20 trivially; only `affiliation_f1`≥0.25 was unknown, set conservatively). A PR whose gate its own shipping champion fails is a self-own. (2) **Affiliation must be un-gameable**: define it as *capped* proximity `prox = max(0, 1 − dist/D)` with a FIXED tick budget `D` (e.g. 50), NOT normalized by the labeled-window length — otherwise a detector is rewarded for huge windows. Each event contributes exactly one recall term, each alarm one precision term; distances are within-channel. (3) **Conformal false-alarm "budget" on autocorrelated residuals is a DIAGNOSTIC, not a guarantee** — use a *blocked/contiguous* calibration slice (per-channel train tail), not an i.i.d. shuffle, and report "at the frozen K the measured FA rate is X vs an α target; K≈Y would hit α." Never claim distribution-free coverage. Surface it (Monitoring panel + a display-only band caption) but DON'T touch the live verdict thresholds — freeze them with a unit test (`_verdict_for(1.0)=="REVIEW"`, `(2.0001)=="NO_GO"`, …) and grep the diff to prove the bands didn't move. (4) The gate move in the Databricks notebooks (`train_anomaly.py` logs the honest+affiliation metrics; `promote_models.py` selects the winner by `affiliation_f1` among models that pass the fail-closed honest gate, legacy F1 reference-only) is **code-only — not executed in the PR**; the live `@champion` alias is untouched. Two `supabase db query` CLI footguns when persisting: the jsonb `?` operator and ANY expression in a `RETURNING` list both break (the CLI treats `?` as a bind param and chokes on RETURNING expressions) — keep `RETURNING` to bare columns and do checks in a separate `SELECT`; and **SQL-escape the payload** (`'`→`''`) because values like a `vus_status` string can contain single quotes that terminate the literal early. Also: a new field in a service dict won't reach the client if the route has a Pydantic `response_model` — add it to the schema too, or FastAPI silently strips it.

### A synthetic "similar but not identical" signature needs a SHAPE-over-TIME feature vector, not run-level averages (2026-06-10)

Building the SCN-005 hot-fire golden pair (two pre-failure runs that a demo claims "most resemble each
other") exposed a feature-vector design trap. The goal: cosine(00041, 00088) ≥ 0.92 yet < 1.0, with
00041 the unambiguous top-1 for 00088 — proven *from the features*, not from differing run IDs. Three
naive vectors all failed the spirit of the test while passing its letter:
(1) **Raw window-feature averages** → cosine pins at ~1.0000 for *every* pair. The mean/rms of pressure
(~480) and temperature (~450) are enormous and near-identical across all runs, so they swamp the
discriminating features; the vector is dominated by a constant magnitude block. The pair "passed"
(0.99999 < 1.0) but the similarity rounds to 1.0000 in any UI — reads as a copy, the opposite of the
point. (2) **Scale each feature by channel level** → still ~0.99999: after dividing by level, every
run's mean/rms ≈ 1.0, so the vector is still a near-constant block. (3) **Shape features only
(std/slope/peak_to_peak), run-averaged** → 0.9998 with a compressed 0.97–0.9998 spread and no
separation, because averaging 15 windows into one number *destroys the time signature* — a pre-failure
trajectory (rising oscillation + late bump) collapses into a single value indistinguishable from a flat
run. The fix that actually discriminates: build the vector from the **per-window trajectory** of shape
features (the window-by-window series, in window order), **mean-centered per dimension**. Cosine then
behaves like *correlation of how the signal evolves over time*: the two PF-TPL-01 runs rise-and-bump
together (0.9928) while normal/drift runs sit at 0.2–0.3 or negative. The golden-pair property is now
real (top-1 by a 0.7 margin), not an artifact of PF-TPL-01 being unique to the pair. Lessons: exclude
features that only encode "which channel/level is this" (they carry no cross-run signal and, being huge,
erase everything else); for any *signature* similarity, the vector must preserve the time axis the
signature lives on — center it so cosine measures shape, not magnitude; and assert separation from the
*second*-best match, not just "top-1 == expected" (the latter passes even when everything cosines to 1.0
because the anchor template is unique). Also: keep the determinism contract intact — the trajectory needs
a fixed windows-per-run across all runs so the centered series align element-wise, and that count plus
samples-per-run belong in `scenario_config.yaml` (single source of truth), not hardcoded in the
generator, or the volume test and the similarity math silently drift apart.

### Synthetic ML *outputs* should consume the upstream feature contract, not recompute it (2026-06-10)

Building g10 (deterministic synthetic ML/AI outputs — model registry, versions, predictions,
explainability, feedback) on top of g07's telemetry exposed the discipline that keeps a multi-generator
demo honest. (1) **Consume, don't reinvent.** g07 already realized the SCN-005 golden pair (00088's
nearest prior run is the failed 00041) via a specific feature-window similarity. g10's anomaly-detector
prediction must *surface that same number*, not recompute similarity its own way — so the similarity
logic lives in one place (`waveforms.run_vectors_from_windows` / `nearest_runs`) and both g07's tests and
g10 call it. A test asserts the prediction's `score` **equals** the canonical feature-window similarity to
the 4th decimal; if g10 had recomputed from raw samples or a different feature set, that equality breaks
and the SCN-005 story would quietly diverge between "the telemetry" and "what the model said." This is the
cross-generator-drift guard applied to ML outputs. (2) **Tie predictions to real causes, realize the
distribution exactly.** `top_drivers_json` names the actual anchors (`machine_id_WLD-07`,
`material_lot_ML-8821`, the matched failed run) so the UI can explain *why*; the human-feedback label mix
(65/15/15/5) is realized by computing integer counts from the config proportions and absorbing the
rounding drift into one label — never by sampling, which would be non-deterministic and rarely hit the
stated percentages. (3) **No silent volume caps.** The registry pads 6 canonical model types up to
`n('models')` with deterministic scoped variants (e.g. `defect_risk@ENG-VALVE`); when the medium profile
asked for 15 and the scope list only yielded 12, that was a silent cap (volume says 15, generator emits
12) — fix by widening the scope candidates so the configured number is actually produced, not by leaving
the gap. (4) **Explainable-not-identical is the assertion that matters.** The golden-pair test checks
score ≥ threshold AND < 1.0 AND top-1-by-a-margin (>0.3 over second place) — proving the match is the
shared pre-failure *shape*, not the anchor template being unique, and that the model isn't pretending two
distinct runs are the same record. Reusable rule: when generator B reasons about an entity generator A
already characterized, B imports A's contract function; a test pins B's output to A's computed value; and
every "how many / what mix" number traces to one config block.

### Gold/read-model frames must keep scenario cost SEPARATE from the group total to reconcile (2026-06-10)

Building g11 (gold frames + data-quality findings over the g01–g10 synthetic digital thread) re-taught
the discipline that keeps an aggregation layer honest: gold is a *traceable summary*, never a new source
of truth, and every headline number must reconcile to the rows it came from. The bug that proved it: the
cost-of-poor-quality frame grouped rework/scrap by (supplier, part_family), then stamped a group's
`scenario_id` with SCN-002 because *some* events in it carried that tag — and reported the whole group
total ($199,507) as the scenario figure, blowing past the $148K anchor. The group legitimately contains
SCN-002 events *plus* untagged AeroMetals/ENG-VALVE rework; collapsing them loses the named-scenario
number. Fix: track scenario-attributed cost in a **separate accumulator** (`scenario_cost[scenario_id] +=
cost` only for tagged events) and expose `scenario_cost_usd` alongside the group `cost_of_poor_quality_usd`.
The demo reads the scenario figure ($148K, reconciles exactly); the group total is still there for
drill-down. Rule: when an aggregate row carries a scenario tag, the scenario's *value* must be summed only
from tagged source rows, not inferred from the group the tag landed in. Other g11 reconciliation guards
worth copying: (1) **derive, don't re-derive** — SCN-004 FPY (0.78/0.91) is asserted by recomputing from
source ops + inspection `first_pass`, not by writing a yield number into gold; SCN-005's nearest-match in
the anomaly-review frame is *read from the g10 prediction* (whose similarity was consumed from g07 feature
windows), never recomputed. (2) **inject governance findings from config, deterministically** — the
"two flight-critical serials missing final signoff" finding doesn't exist upstream, so dq.py *creates* it
by selecting the first N (N from `scenario_config`, =2) flight-critical serials on the blocked vehicle
sorted by serial_id; a test asserts exactly 2, both flight-critical, both on TR-003, both SCN-001-tagged.
(3) **don't ship a rule that can't fire silently** — the telemetry-dropout DQ rule found 0 rows because
g07's pattern assignment never produces `sensor_dropout` in this dataset; that's a real upstream diversity
gap, so the rule stays (its logic is correct) but the test does NOT assert it produces rows — and the gap
is noted rather than hidden. Every finding row is explainable (a `detail` string naming the offending
records) and scenario-tagged when it maps to a named scenario; a determinism test asserts two builds
yield identical finding ids/rules/entities.

### Profile scaling must derive row mechanics from volume targets (2026-06-11)

A generator can expose `small` and `medium` profiles while still silently emitting small-profile
data if loop mechanics are hardcoded. The RS Factory medium smoke caught three examples: Jira key
reservation dropped one row when the anchor ID fell inside the normal sequence, test telemetry
kept the small run/sample/window allocation, and QMS emitted fewer inspections than requested
because one pass over completed operations could not fill the larger target. Reusable rule:
reserve anchor IDs with a fill-until-target loop, derive per-entity allocations from configured
row totals, and pad or fail explicitly when one source pass cannot satisfy a declared volume.
Smoke tests should query emitted row counts, not treat a zero-exit build as proof of scale.

### Measure "did the AI help a human" from logs + a capture layer — and stay honest at N=0 (2026-06-09)

To prove operator usefulness (Track B) credibly you need TWO halves, and only one is free. The **deterministic anchors** — unsupported-claim/post-validator block count, refusal rate, grounded rate — are already in the audit log (`tel_copilot_interactions`); reuse the existing `governance_summary` queries verbatim (don't re-derive — single source = provably from logs). The **human-outcome** half (time-to-verdict, agreement, override precision, confidence, evidence-open) does NOT exist until you capture it: add a `tel_copilot_review_actions` table + a `POST …/report/{id}/disposition` endpoint + frontend controls. Design rules that make it bulletproof rather than theater: (1) **read the model verdict server-side from the report** — the client may send its human verdict but must NOT assert what the model said (that's what `is_override` is scored against). (2) **time-to-verdict must be measured, not estimated** — a real `performance.now()` start/stop in the UI, with the verdict buttons disabled until the timer starts; never accept a client-claimed duration with no timer. (3) **override precision needs ground truth** — score the human verdict against the labeled window (`tel_anomaly_events` source='label', joined through `tel_test_runs.run_key`, bracketing the fire tick), DEFER and null-tick rows EXCLUDED (never silently score them as GO). (4) **honesty at N=0 is the whole game** — a usefulness panel that shows `0%`/`0ms` before any session is a lie; enforce "not measured" in three layers: SQL `avg(...) FILTER (...)` → NULL (no `COALESCE 0`), Python `x if x is not None else None` (never `or 0`), frontend `null → "not yet measured (N=0)"`; and the with-vs-without **delta stays blank until BOTH arms have N>0** (never one-sided). Ship the apparatus + the real anchors; let real review sessions fill the human numbers in-browser later — that's honest, and it's the only version a headless agent can build without fabricating. Within-reviewer paired A/B (`arm` assisted/unassisted, a client `pair_id` to link the pair) controls for reviewer variance at small N; aggregate per-arm and label it "per-arm on matched cases" rather than over-claiming strict pairing. No new auth: scope the disposition by `env_id`+`business_id`+`report_id`, with reviewer identity as an opaque label — avoids touching the session/proxy plumbing entirely. New service fns that use the lazy `from app.db import get_cursor` are auto-covered by the `fake_cursor` fixture (conftest patches `app.db.get_cursor`); `execute` consumes no queued result, only `fetchone/fetchall` advance — so a fail-closed validate-before-write is testable by asserting `fake_cursor.queries == []`.

### Demo a full ML pipeline honestly: synthetic corpus is the ONLY synthetic layer; everything downstream is a real run (2026-06-10)

When a demo needs an end-to-end ML story (corpus → embeddings → clustering → forecast → serving → UI) and no real domain data exists, draw the honesty line at the corpus and hold it: generate a deterministic synthetic corpus (stdlib-only `random.Random(SEED)`, fixed date anchor, byte-identical regeneration asserted in CI by importing the notebook by path — guard the spark section with `try: spark / except NameError` so the same file is both a Databricks notebook and an importable module), then make every layer above it a REAL model run with provenance carried row-by-row (`provenance='databricks'|'local_fallback'` column on every serving table + the mlflow_run_id, surfaced as a header chip in the UI). Engineer the corpus dynamics against the DECLARED analytics windows: a "rising" cluster must rise within the trailing-8-week trend window the notebook actually fits (slope ±0.44/wk vs declared ±0.35 thresholds), not over the full 16 weeks — the first run produced all-flat statuses because the drift lived mostly outside the window. Serverless Databricks gotchas: `%pip install` + `dbutils.library.restartPython()` as separate cells before any imports; `spark.createDataFrame` on dicts FAILS with CANNOT_INFER_TYPE_FOR_FIELD when a column is all-None in early rows (history rows carry None forecast cols and vice versa) — always pass an explicit StructType; fetch notebook results via the task-run's `get-output` (`dbutils.notebook.exit` payload), and `python -u` any long driver you background or stdout buffering hides all progress. The bounded local fallback (TF-IDF + SVD + seeded k-means standing in for sentence-transformers/UMAP/HDBSCAN) is worth shipping even when auth works: it cross-validates the deterministic layers (the local walk-forward forecast reproduced the Databricks MAE to the third decimal — same corpus, same math) and it keeps the page honest rather than empty if the workspace dies before a demo. Mirror to Supabase via an emitted idempotent seed (uuid5 ids, batch-scoped DELETE + ON CONFLICT DO UPDATE) and prove the serving path with a throwaway-postgres drill that asserts the FAIL-CLOSED state BEFORE the seed (`data_not_ingested`), the full payload after, and byte-identical payloads after a second apply. Two local footguns: a week-old dev server from another repo can be squatting your drill port and answering with ITS 404 (`Get-NetTCPConnection` + Win32_Process to identify before killing anything — move ports, don't kill foreign processes); and Windows-python `open()` defaults to cp1252, so drill receipts with UTF-8 content (e.g. "·" in c-TF-IDF labels) print as mojibake that looks like a real encoding bug in the pipeline — always `open(..., encoding="utf-8")` before concluding the data is corrupt (read the response BYTES to verify: clean C2 B7 = terminal rendering problem, not data).

### Stream demo dark in prod = env-var gating, not a code bug; and "no_stream_data" must split into actionable reasons (2026-06-10)

When a streaming/worker-backed demo surface is dark in production but works locally, check the deploy CONFIG before the code: the telemetry stream worker is started in the FastAPI lifespan only `if TELEMETRY_STREAM_ENABLED` (`main.py`), and that var defaults to `"0"` in `config.py`. It is NOT set on Railway, so the worker never starts → no bronze frames → `/stream/health` and `/stream/live` return empty. The fix to LIGHT IT UP is `railway variables set TELEMETRY_STREAM_ENABLED=1` (SOURCE already defaults to `capture`, and the CaptureAdapter fixture `backend/app/data/telemetry/iss_capture.json` ships via the Dockerfile `COPY app ./app`) + redeploy — no code change needed for the data to flow. Verify config from the linked `backend/` dir with `railway variables` (or check the live `/api/telemetry/stream/health` payload: `worker_present`, `rows_per_min`, `pipeline_status`). Capture mode is the production-safe demo floor — label it `CAPTURE` / "public telemetry adapted to RS-style interface", never as proprietary/live. The capture drill (`scripts/rs_stream_drill.sh`) boots a throwaway-postgres uvicorn in capture mode and is the fastest way to prove the worker produces moving data (expect ~45 rows/min, ingest-lag p50 ~1.1s under the 2s budget, all three pipeline surfaces `fresh`). SEPARATELY: a fail-closed surface must not collapse every absence to one vague reason. Add a PURE `derive_stream_reason(worker_present, channels_mapped, bronze_rows_recent, silver_rows, watermark_age_s)` checked in debuggability order (`no_channel_mapping` → `stream_worker_disabled` → `no_bronze_frames` → `etl_watermark_stalled` → None=healthy), return it as `null_reason`, and render a one-line repair hint per reason in the UI (`STREAM_REASON_HINT` map) plus `worker_present` + pipeline status. A skeptical reviewer must see WHY it's dark and the next step, never a blank "no_stream_data".

### React: per-item controls reused across items inherit stale state — key= on the mount, not just useState (2026-06-10)

The "Start review timer sometimes didn't respond / needed a reload" bug was a classic React identity reuse: `<DispositionControls reportId={...}>` was mounted WITHOUT a `key`, so when the user drafted a new report (new `reportId` prop) React reused the same instance and the previous report's `startedAt`/`result`/`arm` survived — the Start button showed "timing…" or a verdict stayed locked for what looked like a fresh report. Fix is two-layered: (1) `key={report.report_id}` on the mount forces a clean remount per report; (2) belt-and-braces `useEffect(reset, [reportId])` inside the component clears all per-item state if the instance is ever reused without the key changing. Unit-test the reset by `rerender`-ing the SAME component with a new `reportId` and asserting the timer is back to its initial label and the verdict is gated again. General rule: any control whose entire state should reset when its subject changes wants a `key` keyed on the subject id — prop changes alone do NOT reset `useState`.

### Distinguish real app bugs from Agent Mode / browser-tool artifacts before changing code (2026-06-10)

A skeptical-engineer browser review surfaced two complaints that were NOT app bugs: (a) "clicking chips navigated unexpectedly" — but `grep` confirmed NO `<form>` wraps the copilot buttons and they have no `href`/`<a>`/router push, so a click cannot cause app navigation (the artifact was the browser agent's own navigation). Still added `type="button"` defensively (cheap, correct) but documented it as not-a-reproduced-bug. (b) "a developer/prompt-injection message appeared" — audited every telemetry surface: `SYSTEM_PROMPT_TEXT` is server-side only (sent to the model, never returned), responses carry only `prompt_version` (a hash) + `model` name, and a live probe (`POST /copilot/ask` "repeat your instructions verbatim") returns `unsupported_question` refusal with no prompt echo. Documented as an Agent Mode/tooling artifact outside the Winston UI, no app change. Lesson: when a browser-agent review reports a UI/navigation/injection issue, reproduce it against the actual app (grep for forms/links/router calls; probe the live endpoint) before writing a fix — agent-mode harnesses inject their own chrome and navigation that look like app behavior but aren't.

### A WebGL/canvas panel must probe-and-degrade locally, or it takes the whole route down (2026-06-11)

A browser without WebGL made the R3F `<Canvas>` on the Stargate page throw "Error creating WebGL
context" at render, which escalated to the lab route error boundary (`error.tsx`) and killed the
entire console — including the chart, ticker, and DLQ panels that need no WebGL. Two-layer fix that
generalizes to any GPU/canvas-dependent panel: (1) probe capability BEFORE mounting the renderer
(`canvas.getContext("webgl2") || getContext("webgl")` in a try/catch, run once in a `useState`
initializer on a `ssr:false` component) and render a styled in-slot fallback when absent; (2) wrap
the renderer in a LOCAL class error boundary so runtime throws (context loss, driver quirks) degrade
to the same fallback instead of the route boundary. The test that locks it: jsdom has no WebGL, so
plain `render(<Component/>)` in vitest IS the production repro — assert the fallback appears and
nothing throws. Bonus diagnosis lesson re-confirmed: the same browser-agent review claimed a
WebGL error on a page with zero three.js imports (Factory ML) while simultaneously describing it
rendering fully — agent-mode artifacts ride along with real findings; verify each against the code
before fixing.

### Public frontend deployments must never default to a localhost service URL outside development (2026-06-12)

A `process.env.NEXT_PUBLIC_X || "http://localhost:8100"` fallback shipped to production: when the Vercel env var was unset, every novendor.ai visitor's browser tried to reach THEIR OWN machine (ERR_CONNECTION_REFUSED), and the page sat on "reconnecting". The fallback was right for `next dev` and wrong for a deployed page. Fix: resolve fail-closed — `return configured ?? (NODE_ENV === "development" ? localhost : null)` — and render an explicit "service URL not configured for this deployment" diagnostic when null instead of constructing the EventSource/fetch. Two load-bearing details: (1) read `NEXT_PUBLIC_*` and `NODE_ENV` by STATIC property access (`process.env.NEXT_PUBLIC_FOO`), never a dynamic `process.env[name]` — Next inlines the static form at build time and a dynamic lookup is `undefined` in the production bundle; (2) the test that locks it is the unconfigured render: jsdom has no EventSource, so asserting "zero EventSource constructions + diagnostic visible" both proves fail-closed AND that the page doesn't crash. The deeper fix was deploying the backing service (mount the standalone FastAPI bridge into the existing Railway backend behind a default-off flag, capture mode in prod) so the env var points at a real HTTPS origin — a public page needs a deployment contract, not a dev convenience. When a demo service is "standalone for the laptop", decide its production home before the page ships, or the localhost assumption leaks to real users.

### Making an inline-style surface responsive: literal Tailwind for layout, palette for paint (2026-06-12)

The telemetry console styles everything with inline `CSSProperties` from a palette object, which
means zero media queries — every grid was desktop-only. The retrofit that worked: a handful of
layout primitives in `primitives.tsx` (`StatGrid`, `SplitGrid`, `ScrollTable`, `ResponsiveSwap`,
`RowCard`) that carry **literal** Tailwind responsive classes (`grid grid-cols-2 lg:grid-cols-4`,
`lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]`) while color/typography stay inline. Rules learned:

- Class strings must be literal, keyed off a fixed variant union — Tailwind's content scanner never
  sees classes composed from props, so `lg:grid-cols-${n}` silently generates nothing.
- An inline `style={{ display: "flex" }}` beats `lg:hidden` (inline > any class), so an element that
  must hide per-breakpoint needs its display in classes too: `className="flex lg:hidden"`. This bit
  the mobile header and bottom nav on first pass — desktop showed both plus the rail.
- `ResponsiveSwap` (CSS-only `sm:hidden` / `hidden sm:block`) is the zero-hydration-risk way to swap
  a dense grid-table for a card list; reserve `useIsMobile()` for true behavior changes (e.g. not
  mounting the Stargate three.js canvas under 640px — and gate it behind a `mounted` flag, because
  the hook's SSR default is desktop and would otherwise mount the canvas for one frame on phones).
- Navigation cohesion came free once `TELEMETRY_NAV` became a single config consumed by the desktop
  rail, the mobile drawer, and the bottom tab bar (4 primaries + "More" opens the drawer). 12 flat
  items in a bottom bar don't fit; group the drawer instead.
- When re-verifying after a rebuild, confirm the new server actually bound the port — an EADDRINUSE
  leftover from the previous `next start` will happily serve the stale build and "disprove" the fix.

### ADE connector lifecycle: derive state, gate read_validated behind a real validator (2026-06-15)

PR 2 turns the static connector inventory (`ade_connectors.py`, `live|stub|script|missing`) into a read-only lifecycle (`declared→discovered→credential_pending→validating→read_validated→degraded→blocked→retired`) WITHOUT persisting anything or adding a migration — the state is *derived* per request in `ade_connector_lifecycle.compute_lifecycle()`. The honesty rule that makes it credible: the declared status only maps to a *floor* (`missing→declared`, `stub/script/live→discovered`), and a connector can only move UP to `read_validated` when a registered safe validator (`ade_connector_validators._VALIDATORS`) actually runs and returns `ok`, leaving a receipt. Never infer liveness from the declaration or from env-var presence. Only one validator is safe enough to wire by default — the in-process MCP registry tool count (no I/O, no creds). A Postgres `SELECT 1` validator is implemented but kept in `OPTIONAL_VALIDATORS` (not run by default) so the endpoint never blocks on a live DB in CI. The endpoint fails closed: any exception in the service → `{connectors:[], null_reason:"connector_lifecycle_unavailable"}`, never a 500. A validator that throws is caught and degrades that one connector (`null_reason:"validator_error"`) rather than failing the whole report.

### ADE read-only HTTP provider validators: missing-token = no-call is the honesty boundary (2026-06-15)

PR 3 added GitHub/Vercel/Railway reachability validators to the connector lifecycle. The one rule that makes "read-only reachability" honest rather than theater: a missing token returns `credential_missing` and makes **NO outbound call** — env-var presence is never treated as validation, and only a real 2xx read produces `ok`/`read_validated`. Enforce GET-only with a module constant (`_ALLOWED_HTTP_METHOD="GET"`) and a hard per-request `httpx` timeout (5s); map timeout/transport-error/401/403/5xx all to `degraded`, never `ok`. Two gotchas that bit during the build: (1) the existing `test_no_secrets_in_receipts` test rejects ANY receipt containing the substrings password/secret/**token**/api_key — so receipt `detail` must avoid the bare word "token" even in benign phrasing. Use neutral wording ("credential not configured" for missing, "credential accepted" for success, "auth rejected (HTTP 401)" for invalid) — never echo the env-var name or `f"{token_env} not set"`. (2) Test the no-call guarantee by monkeypatching `httpx.request` with a spy that raises if called, then asserting it was hit 0 times when the token is absent — a state-only assertion would pass even if a call leaked. Mock `httpx.request` (not the client) so `httpx.Response(status)` construction stays trivial; CI makes zero live calls. Wire Postgres `SELECT 1` from `OPTIONAL_VALIDATORS` into the default set via a `_build_validators()` factory gated by `ADE_ENABLE_POSTGRES_VALIDATOR` (default on, falsey to disable) — build once at import into `_VALIDATORS`.

---

## 2026-06-13 — Telemetry Trust Layer architecture review (Factory Pattern Intelligence)

Durable traps surfaced while assessing the "Factory Pattern Intelligence" idea against the repo. Full
review: `docs/plans/03-implementation-plans/active/factory-pattern-intelligence.md`. Working name going
forward is **Telemetry Trust Layer** (plain, accurate, doesn't overpromise).

**The telemetry platform is already shipped — do not propose greenfield GCP/Vertex/Dataflow for
Trust/Divergence work.**
Dispatch `0003` (`docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md`) shipped
Phases 0–6 on 2026-06-01: C-MAPSS RUL + SMAP/MSL anomaly on a Databricks medallion, MLflow registry
with promotion gates, `tel_*` serving (`backend/app/services/telemetry_serving.py`), a 5-page telemetry
env UI, deterministic replay, live on Railway + novendor.ai. Confluent Kafka + Flink already runs for
Stargate (`infra/confluent/stargate/`, `stargate_bridge.py`). A new prognostics feature is a capability
layer on this, not a platform build. Proposing Kafka→Dataflow→BigQuery→Vertex from scratch rebuilds
owned infrastructure and reads as not knowing the stack.

**The existing RUL champion is NOT literature-competitive — never call it so without improving RMSE.**
`telemetry-platform/databricks/notebooks/train_rul.py` ships a GBM at **RMSE 20.32 / PHM 1423 on FD001**
(its gate was ≤25). The literature-credible bar is **≤13** (SOTA ~11; Li et al. 2018 floor 12.61).
Citing 20.32 as "competitive" is a credibility hit. The PHM08 asymmetric score (`phm_score()`) is
already implemented and is comparable only on identical test sets.

**`tel_fused_state_vectors VECTOR(256)` already exists (Phase 7A scaffold) — reuse it, don't add a
parallel embedding table.** It is the intended home for telemetry degradation embeddings.

**History Rhymes pgvector retrieval is the proven analog-search template.**
`backend/app/services/history_rhymes_service.py` `_pgvector_search` (cosine `<=>`, top-k, HNSW over
`episode_embeddings VECTOR(256)`) is live and is the pattern to copy for fleet analog retrieval — swap
the encoder, keep the retrieval shape. Do not build a new nearest-neighbor path.

**"Factory Pattern Intelligence" is a naming collision and wrong framing.** It clashes with
`tel_ncr_records` "Factory & NCR Intelligence" (migration `10016`) and misdescribes aerospace turbofan
RUL content. Use **Telemetry Trust Layer** before any schema or route is created.

**Gate 0 must precede any infrastructure.** A within-band distance-vs-error Spearman ρ check (conditioned
on predicted-RUL band, with a bootstrap CI per band) over the existing C-MAPSS gold tables falsifies or
validates the whole trust thesis in ~½ day, training nothing — using the existing PCA/fused vector and
the shipped RUL predictions. Train the SupCon encoder only on a weak-but-real result; a dead ρ kills the
project before a dollar of build.

**Reusable lessons go to canonical `docs/tips.md` (~380 KB), never the root `tips.md` duplicate.**
The root file is do-not-write; this file is the one loaded for situational awareness.

---

---

## 2026-06-13 — Gate 0 credential + data reconciliation (Telemetry Trust Layer)

Verified creds and inspected the live workspace before writing any notebook. Two durable traps:

**Databricks CLI v1.0.0 rejects the cached PAT — force `DATABRICKS_AUTH_TYPE=pat`.**
With a valid `dapi…` PAT in `claude_token.txt`, `databricks current-user me` failed with "stored
credentials from older CLI versions are no longer used; run `databricks auth login` … or set
`DATABRICKS_AUTH_STORAGE=plaintext`". The fix that authenticates without an interactive login:
```
export DATABRICKS_HOST="https://dbc-2504bec5-b5ab.cloud.databricks.com"
export DATABRICKS_TOKEN="$(tr -d ' \t\r\n' < claude_token.txt)"
export DATABRICKS_AUTH_TYPE="pat"
export DATABRICKS_CONFIG_FILE="/dev/null"   # bypass the stale ~/.databrickscfg cache
```
For ad-hoc SQL, `databricks api post /api/2.0/sql/statements` returns "Not Found" in v1.0.0 — use
`curl` against `$HOST/api/2.0/sql/statements` directly (warehouse `0e56420fb707d861`). Capture stdout
to a file (don't pipe straight into `python`; CLI warnings on stderr corrupt the JSON parse), and use a
repo-relative temp dir — Git Bash `/tmp` paths don't round-trip to the Windows Python interpreter.

**The C-MAPSS RUL lane and the fused-vector embedding are DIFFERENT datasets — they don't join.**
In `novendor_1.telemetry`: `gold_cmapss_features` (FD001: 20,631 train / 13,096 test, 100 units) has
`unit, cycle, rul_target` + ~47 sensor/rolling features but **no embedding and no stored predictions**
(only ground-truth `rul_target`). `gold_fused_state_vectors` (and its Postgres mirror
`tel_fused_state_vectors`) is the **SMAP/MSL anomaly lane** (128 windows, `source_channels` = spacecraft
IDs A-1/D-4/E-12/…), not turbofans. So you cannot "reuse the existing fused vector for C-MAPSS RUL." A
Trust-Layer Gate 0 must **derive** a cheap C-MAPSS embedding from `gold_cmapss_features` (z-score + PCA
on existing features) and **derive** predictions by loading the registered `tel_rul_regressor` champion
for inference. Both are existing-feature transforms / frozen inference — still "no training." The Gate 0
ticket was reconciled to this reality before any run.

---

---

## 2026-06-13 — Gate 0 run (BLOCKED) — C-MAPSS test has no per-cycle RUL truth

Gate 0 ran on Databricks (4 attempts) and **blocked without a verdict**. Receipt:
`docs/plans/03-implementation-plans/evidence/telemetry-trust-gate0.{json,md}`. Three durable facts:

**C-MAPSS TEST rows have NO per-cycle `rul_target` — it is 100% NaN by dataset construction.**
`novendor_1.telemetry.gold_cmapss_features` FD001: `split=test` is 13,096 rows with **0** non-null
`rul_target`; `split=train` is 20,631 rows fully populated. C-MAPSS test units are truncated and publish
only ONE final-cycle RUL per unit, stored in `silver_cmapss_rul` (100 units). So any "score all test
cycles and correlate per-window error" design is impossible on the test split — there is no per-cycle
target. `train_rul.py` sidesteps this by evaluating **last-cycle-per-unit** (100 points) merged from
`silver_cmapss_rul`. For per-cycle density analysis, use the **train** split (truth exists) with a
held-out unit fold, not the test split.

**`tel_rul_regressor` requires `scikit-learn==1.4.2` to load — pin it or `predict()` raises.**
The champion (run `c970fdcc`, GBM) was pickled under sklearn 1.4.2. Newer sklearn removes
`GradientBoostingRegressor`'s `HalfSquaredError.get_init_raw_predictions`, so `predict()` throws
`AttributeError`. Always pin `scikit-learn==1.4.2` when loading it.

**Serverless ML job submission shape (what actually works).**
`POST /api/2.1/jobs/runs/submit` with the task carrying `environment_key: "Default"` AND a job-level
`environments: [{environment_key:"Default", spec:{client:"2", dependencies:["mlflow","scikit-learn==1.4.2"]}}]`.
A bare serverless task has no mlflow/sklearn (run 1 died on `No module named 'mlflow'`). Notebook output
only escapes via `dbutils.notebook.exit(json)`; serverless stdout is NOT returned by `runs/get-output`,
so a crash before `exit()` loses all printed results — persist intermediates if you need them on failure.
On Windows Git Bash, set `MSYS_NO_PATHCONV=1` or workspace paths like `/Users/...` get mangled to
`C:/Program Files/Git/Users/...`.

---

---

## 2026-06-13 — Gate 0 VERDICT: KILL — embedding distance anti-correlates with RUL error

Gate 0 completed (Option B: FD001 train split, 80 fleet / 20 held-out units, real per-cycle truth,
4,311 windows). Receipt: `docs/plans/03-implementation-plans/evidence/telemetry-trust-gate0.{json,md}`.

**The cheap z-score+PCA embedding's distance ANTI-correlates with RUL error — the thesis is refuted.**
Within-band Spearman ρ(kNN distance, |error|) is negative in ALL five predicted-RUL bands (overall
−0.127; bands −0.135, −0.160, −0.073, −0.053, −0.045), with 3 of 5 CIs excluding zero on the negative
side. Far-from-fleet windows have slightly *lower* error. The mechanical rule (positive-CI band →
continue/SupCon; else kill) lands on **kill** — a negative significant result is a stronger refutation
than flatness and does NOT route to SupCon. So: do not build the Trust Layer (no SupCon, no schema, no
UI) on the cheap-path thesis. Likely mechanism for the anti-correlation: late-life C-MAPSS windows are
both more self-similar (near the fleet) AND lower-error, so a generic feature embedding conflates "near
the fleet" with "easy to predict." Revisiting the thesis is a research question, not a build.

**Process note that held up:** Gate 0 did exactly its job — killed the idea cheaply (one ~½-day notebook,
frozen inference, no SupCon spend) before any infrastructure. The "no-training, falsify first" gate is
worth keeping as a pattern for future thesis-driven builds.

---

---

## 2026-06-13 — Killed-hypothesis guard + telemetry RUL benchmark/calibration notes

**Embedding-distance trust is KILLED for telemetry — do not revive it without a NEW falsification plan.**
Gate 0 proved that on C-MAPSS FD001, embedding distance from the fleet *anti-correlates* with RUL error
(see `docs/plans/03-implementation-plans/evidence/telemetry-trust-negative-result-writeup.md`). Any future
telemetry work that proposes SupCon, contrastive retrieval, novelty/embedding-distance trust, pgvector
analog trust, or a Trust/Divergence schema/UI is reviving a refuted thesis and must be rejected unless a
fresh, approved kill-test reopens it. The successor build is calibrated RUL uncertainty (conformal
intervals), NOT analog-distance trust — a different and defensible claim. Plan:
`docs/plans/03-implementation-plans/active/telemetry-calibration-layer.md`.

**C-MAPSS RUL benchmark comparability — three traps.** (1) The shipped champion is **RMSE 20.32 / PHM
1423 on the last-cycle-per-unit benchmark** (one row per test unit, truth from `silver_cmapss_rul`); the
literature-credible FD001 bar is **≤ ~13**. Never call 20.32 competitive. (2) **Last-cycle RMSE ≠
all-cycle/per-cycle RMSE** — they are different quantities; never compare across them. (3) The **PHM08
Score is comparable only on identical test sets** and is dominated by a few large late-prediction errors;
always report RMSE beside it. PHM08 is asymmetric — late (optimistic) RUL is penalized harder (a=10) than
early (a=13); `phm_score()` is already implemented at `telemetry-platform/databricks/notebooks/train_rul.py:58`.

**Conformal-calibration methodology — the gate that actually matters.** For honest RUL uncertainty: hold
out a dedicated **calibration split with units disjoint from train and test** (split-conformal or CQR),
target nominal 80%/90%, and judge by **PICP within ±0.03 of nominal** — but always report **MPIW/PINAW**
too, because an interval can "pass" coverage by being uselessly wide. Generate a reliability diagram
(observed vs nominal) and call out late-prediction cases explicitly. Coverage is a hard gate; build no UI
until it passes.

---

---

## 2026-06-13 — Calibration baseline ran: gate PASS, plus the per-cycle PHM trap

Ticket 1 (`telemetry-calibration-baseline.py`) reproduced the FD001 benchmark exactly (**RMSE 20.322 /
PHM 1423.33**, last-cycle-per-unit) and **passed the calibration gate**: split-conformal intervals on
disjoint train units give PICP 0.788 @ 80% and 0.895 @ 90% (both within ±0.03), reliability monotone
across 6 levels. Evidence: `docs/plans/03-implementation-plans/evidence/telemetry-calibration-baseline.{json,md}`.

**PHM08 is a per-UNIT (last-cycle) metric — NEVER compute it per-cycle.** Applied per-cycle over
thousands of early-life windows (large RUL gaps), the asymmetric exponential terms explode (this run hit
`phm_per_cycle` ~98,776, a meaningless artifact). Report PHM only on the last-cycle-per-unit benchmark;
use RMSE for per-cycle/windowed eval. `phm_score()` lives at `train_rul.py:58`.

**Conformal coverage can PASS while intervals are uselessly wide — always report MPIW/PINAW.** The
passing run had MPIW ~43–56 cycles (PINAW ~0.34–0.45). Coverage was honest *because* the band was
generous. A PICP-only report would hide that. Width is the next quality lever (stronger model / CQR for
adaptive width), not a reason to claim the calibration is "good" on coverage alone.

**Split-conformal recipe that worked here:** disjoint-unit fit/calib/internal-test (60/20/20 of the 100
FD001 train units, seed 0); conformal q = the ceil((m+1)·level)-th smallest |residual| on the calib set;
symmetric band pred±q clipped to [0, RUL_CAP]. Finite-sample valid, no distributional assumption, ~1 min
on serverless. Late-side miss rate at 90% was 0.8% — the band catches ~99% of dangerously-optimistic
predictions, which is the safety property worth showing.

---

---

## 2026-06-13 — CNN-LSTM challenger graduated; torch-on-serverless + asymmetric conformal

Ticket 2: a CNN-LSTM beat the GBM baseline and **graduated** as FD001 RUL champion (RMSE 17.33 vs 20.32,
PHM 742 vs 1423, calibrated 80/90% coverage, tighter intervals). Evidence:
`docs/plans/03-implementation-plans/evidence/telemetry-calibration-challenger.{json,md}`. Reusable bits:

**PyTorch CPU works on Databricks serverless — probe first, then it's cheap.** The Default serverless env
has NO tensorflow/keras/torch (only sklearn 1.3 / numpy / pandas). Adding `torch==2.2.2` to the job
`environments[].spec.dependencies` installs a CPU build that imports in ~3 s; a small CNN-LSTM (Conv1D×2
→ LSTM → Dense) over ~20k C-MAPSS windows trains in ~40 s. Always run a one-cell import probe before
authoring a DL notebook — a missing framework otherwise burns a full run.

**C-MAPSS sequence models read from `silver_cmapss`, not `gold_cmapss_features`.** Silver has the 21 raw
per-cycle sensors + op settings + per-cycle `rul_target` (on train) — the right source for 30-cycle
sliding windows. Gold is pre-rolled per-cycle features (good for tree models, wrong shape for a CNN-LSTM).
Standard FD001 sensor selection (drop near-constant): 2,3,4,7,8,9,11,12,13,14,15,17,20,21.

**Conformal undercoverage at one level is a calibration fix, NOT a model fix.** A challenger can win RMSE
but fail the gate because its 80% interval undercovers (symmetric ±q from a small calib set is the usual
culprit). Two no-retrain fixes that fixed it here: (1) **asymmetric** split-conformal (separate lower/upper
signed-residual quantiles — fits RUL's asymmetric error), and (2) enlarge the calibration pool (fold the
early-stopping val units into calib once they've done their job). Reuse the SAME model weights (same seed,
no retrain); change only the conformal step. Keep the gate logic byte-identical across the retry so the
pass is the calibration's doing, not a moved goalpost.

**Graduation gate that held:** a challenger replaces the champion only if RMSE better AND PHM not worse AND
PICP calibrated (±0.03) AND MPIW narrower-or-similar; if RMSE better but MPIW widens, it graduates only on
*materially* better PHM (≤90% of baseline) with written justification. PHM08 is the late-prediction safety
metric — RMSE-better-but-PHM-worse is a safety regression, not a tradeoff.

---

---

## 2026-06-13 — Telemetry calibration demo screen (Ticket 3) — UI conventions + honesty

Built the RUL Calibration screen at `/lab/env/[envId]/telemetry/calibration`
(`repo-b/src/components/telemetry/RulCalibration.tsx`). Reusable conventions:

**Adding a telemetry screen is 3 small edits — the shell does the rest.** (1) one entry in
`repo-b/src/components/telemetry/telemetryNav.ts` (desktop rail + mobile drawer + bottom bar all consume
it); (2) `app/lab/env/[envId]/telemetry/<slug>/page.tsx` that just renders the component; (3) the
component. `telemetry/layout.tsx` auto-wraps every page in `TelemetryShell` (full-bleed, dark palette),
so pages never import the shell. `/telemetry` is already a full-bleed `isDomainRoute` token — no shell work.

**Build telemetry UI from `components/telemetry/primitives.tsx`, inline styles only.** `C` (palette),
`PageHeading`, `Panel`, `MetricCard`, `StatGrid` (cols 3/4/5), `SplitGrid` (variants), `Tag`,
`EmptyState`/`ErrorState`, `DisclosureFooter`. The whole surface is inline-style on purpose (dark console,
theme-independent), so IDE "no inline styles" warnings are EXPECTED and match convention — do not refactor
to CSS files. Layout uses literal Tailwind classes inside primitives (never composed from props). Charts:
use inline SVG with `C` colors (band = filled path, lines = stroke); do NOT add a chart dependency.

**Calibration demo data: static fixture from the committed artifact, clearly labeled — never live.**
The evidence JSON has scalar metrics + real conformal q values but no per-cycle trajectory. Put a static
fixture in `lib/telemetry/<name>.ts` with metrics copied verbatim from the artifact and a representative
trajectory whose interval bands use the model's REAL q_lower/q_upper (so geometry is honest), label it
"Replay / evidence artifact" on screen, use deterministic pseudo-noise (no Math.random — identical every
build). No Databricks query from the frontend, no backend, no schema for a demo screen.

**Killed-claim hygiene in UI:** the screen mentions embedding-distance "trust" ONLY in the
negative-result bridge ("killed by Gate 0… this screen does not revive that claim"). A vitest assertion
guards it: `body.textContent` must NOT match `/SupCon|analog retrieval|pgvector|novelty distance/i`. Reuse
that pattern to keep killed hypotheses from creeping back into surfaces. repo-b runner is **vitest**
(`npx vitest run <file>`), no `test` script; typecheck `npx tsc --noEmit -p tsconfig.typecheck.json`.

### `az boards work-item relation add` rejects `--project` — links fail silently without it (2026-06-15)

The intake skill's example passes `--project Novendor` alongside `--org` on every board command, but `az boards work-item relation add` does NOT accept `--project` (only `create`/`update`/`show` do). Passing it makes the command exit with `ERROR: unrecognized arguments: --project Novendor` — and if you piped the result through a `--query` that swallows stderr, the parent link silently never gets created (the `System.Parent` field stays empty). Correct form for `relation add`: `--id`, `--relation-type parent`, `--target-id`, `--org` only. Always re-read `System.Parent` with `work-item show` afterward to confirm the link took — a created work item with no parent passes most checks but breaks the Epic→Feature→Story→Task hierarchy. Hit while creating ADE PR 2 items (#580 Feature → Epic #353): the first link attempt with `--project` failed silently, the field was empty on verify, re-running without `--project` set it.

---

---

## 2026-06-15 — Visual verification of a pure telemetry screen without auth/dev-server

The telemetry routes are auth-gated and `next dev` + Supabase login is unreliable here (dispatch 0003's
one gap was "authenticated production screenshot not capturable"). For a **pure, deterministic** component
(static fixture, no API/auth — like the RUL Calibration screen), you can screenshot the REAL component
without any of that: bundle a `renderToStaticMarkup(<Component/>)` entry with **esbuild** (already a dep;
`alias:{'@':path.resolve('src')}`, `jsx:'automatic'`, react/react-dom external), write the HTML, and
screenshot with **Playwright** (chromium already installed) at desktop (1280) + mobile (390) widths.
Caveat that MUST be stated: a `renderToStaticMarkup` harness has **no Tailwind**, so layout classes
(`StatGrid`/`SplitGrid` grids) collapse to single-column and the first screenshot looks wrong. Inject the
handful of real grid rules (`.lg:grid-cols-5`, the `minmax` split templates, `sm:` breakpoints) into the
page `<style>` to get a faithful layout. Keep the harness ephemeral (a temp `.veval/` dir); commit only
the PNGs. This verifies typography/color/chart/content/contrast/reflow honestly — but it is NOT an
end-to-end auth+route load; say so and don't claim the live route was exercised.

### repe_fast_path must never ship a structurally-empty success — fall through, don't return a 0-tool shell (2026-06-16)

The "empty REPE dashboards" demo-breaker (`tools=0, tokens=0`, "No response from Winston") was NOT an authoritative-read bug, an auth/scope bug, or a budget guard — it was AI-gateway routing in `ai_gateway.py::_run_repe_fast_path`. The `INTENT_GENERATE_DASHBOARD` branch called `compose_dashboard_spec()`, which builds widget STRUCTURE only (no `get_cursor`, no `_exec_fast_tool`, no data), then emitted a `done` event — a complete-looking empty shell. The catch-all `else` printed "let me use the full analysis pipeline instead" but the caller (the `if repe_intent.confidence >= 0.85:` block) unconditionally `return`ed afterward, so the promised fallback never ran. Diagnosis rule that saved time: trace whether each fast-path intent branch calls `_exec_fast_tool` — the ones that don't (dashboard, the `else`) are the empty-shell sources; compare against a known-good branch like `INTENT_LIST_INVESTORS`/`INTENT_FUND_METRICS` right next to it. Fix pattern: a module-level sentinel (`_FAST_PATH_FALLTHROUGH = "event: __fast_path_fallthrough__\n\n"`) that the generator yields INSTEAD of `done` when it can't serve real data; the caller intercepts it (string-equality compare), does NOT forward it to the client, does NOT return, and falls through to the full LLM+tools pipeline. Only fall through on exceptions when nothing substantive was streamed yet (`not tool_timeline and not response_blocks`) — otherwise you double-emit. Regression-test the ROUTING, not the composer: `test_repe_fast_path_nonempty.py` (composer-only) passes even with the bug present, because the composer always produced widgets — the bug was shipping those data-less widgets as a final answer. Drive `_run_repe_fast_path` directly as an async generator (asyncio.run + collect lines), patch `resolve_scenario_params`/`build_clarification_question`/`get_session`/`update_session` at the `ai_gateway` module level (NOT `extract_query_intent` — it's imported inside the function from `app.services.query_intent`), and assert: dashboard/unhandled intents yield the sentinel and emit NO `done`; a handled intent (`fund_metrics`, with `_exec_fast_tool` stubbed) still emits `done` with `tool_call_count > 0`.

### Telemetry "How This Works" exhibit + repo traps surfaced building it (2026-06-17)

Built the in-app architecture/evidence exhibit at `/lab/env/[envId]/telemetry/how-it-works` (dispatch 0008, ADO Story #654). Reusable lessons:

- **Glob / `ls` / git-pathspec silently break on the literal `[envId]` directory.** The brackets are a glob character class, so `Glob "…/telemetry/**/page.tsx"`, unquoted bash `ls …/[envId]/…`, and `git log -- '…/[envId]/…'` all match NOTHING and read as "file not found." Single-quote for `ls`; check file presence with `git cat-file -e HEAD:<path>` or by listing the parent dir; the Read tool handles the literal bracket path fine. (This made an Explore agent wrongly conclude the RUL Calibration page didn't exist.)
- **`az boards work-item relation add` silently no-ops when you pass `--project` alongside `--org` plus a `--query` filter** — the link doesn't take and `System.Parent` stays null even though the call "succeeds." Working form: `az boards work-item relation add --id <child> --relation-type parent --target-id <parent> --org <ORG>` (no `--project`, no `--query`), then VERIFY with `az boards work-item show --id <child> --query 'fields."System.Parent"' -o tsv`. Same for `--state` updates: pass `--org` only. (Cost a round of "tasks created but unparented" this session.)
- **JMESPath `--query` from Git Bash:** wrap the whole arg in single quotes and use double quotes for the dotted field keys: `--query 'fields."System.AreaPath"'`. Single-quoting the inner field names (`'System.AreaPath'`) is an invalid jmespath_type error.
- **Telemetry has no governed metric registry / lineage drawer / audit UI of its own** — those are REPE-only (`semantic_metric_def`, `unified_metric_registry`, `AuditDrawer` + `?audit_mode=1`). Telemetry model metrics live in `tel_model_runs.metrics` JSONB. Don't label them Built for telemetry; the exhibit shows the governed-KPI chain greyed as Planned with REPE named as the pattern proof.
- **repo-b has full Playwright e2e infra** (`playwright.config.ts` with a `webServer` that runs `npm run dev` + `PLAYWRIGHT_BYPASS_AUTH=1`, `reuseExistingServer` locally). Copy `tests/lab-environments-navigation.spec.ts` for a lab-route nav/deep-link smoke; the chromium + webkit(iPhone 14) projects give desktop + mobile screenshots in one run. Unit tests are separate (`vitest` via `npm run test:unit`). Don't run `npm run build` and the Playwright dev server at the same time — they contend on `.next`.
- **Telemetry console needs no chart/graph dependency for a flow diagram** — `mermaid` is absent and `@xyflow/react` is stateful/overkill. Hand-roll node cards on palette `C` (status bar via `boxShadow: inset 3px 0 0 {color}`) with literal Tailwind layout classes only (composed class strings are invisible to the content scanner — `primitives.tsx:101-106`).
- **For any demo-facing exhibit, carry two status axes, not one.** `impl` (built/partial/planned/blocked) is NOT the same as `verify` (prod_verified/stage_verified/code_verified/not_verified). Production (novendor.ai / Railway `authentic-sparkle`) can deploy from a different tree than `origin/main`, so "exists in code" ≠ "live." Ship `code_verified` and promote to `prod_verified` only after clicking the deployed route; a unit invariant (`howItWorksData.test.ts`) enforced "no prod_verified in v1."
- **`react/jsx-key` fires on JSX elements placed directly in an array literal** (e.g. row-cell arrays passed to a table renderer) even when the renderer wraps each in a keyed cell. Add a static `key` to the inline element (`<ImplChip key="impl" …/>`) — they aren't siblings at render time, so a constant key is fine.

### ADE Ops Orchestrator: build the ops layer on durable primitives, never on the deletable ADE surface (2026-06-16)

When building a new governed layer near "ADE", check `git status` first: the `ade_*` product surface (`ade_connectors`/`ade_connector_lifecycle`/`ade_connector_validators`, the `automated-data-engineering` frontend package, the `/api/ade/[...path]` proxy) is being removed on a parallel branch. Build the ops layer on what is NOT being deleted — the MCP registry (`backend/app/mcp/registry.py`), `ai_decision_audit_log` via `backend/app/services/governance.py` (`record_decision`/`list_decisions`/`compute_audit_stats`), and `backend/app/services/audit.py` (`redact_dict`). Name everything `ade-ops`/`ade_ops` (hyphen/underscore), use backend prefix `/api/ade/ops` and a separate frontend `ade-ops` proxy — none collide with the deletable `ade` names, on either branch.

**`ai_decision_audit_log.decision_type` has an inline CHECK** (`('tool_call','response','classification','fast_path')`) that is auto-named by Postgres. A new `decision_type` value (`ade_op`) is rejected — and `governance.record_decision` SWALLOWS the insert error and returns `None`, so receipts silently vanish. Fix: a migration that looks up the auto-named constraint via `pg_constraint`/`pg_get_constraintdef(... ILIKE '%decision_type%')`, drops it, and re-adds a stably-named CHECK preserving all prior values + the new one (idempotent). And surface the swallow: when `record_decision` returns `None`, set `receipt_status="failed"` + a `receipt_write_failed` null_reason — never claim a `receipt_id` you didn't get.

**Risk-tier gate belongs in the supervisor, before executor lookup.** A separate `OpsSkillDef` registry (not the MCP `ToolDef`) keeps write-capable skills out of the live MCP executor entirely; the supervisor returns `blocked`/`write_capability_not_enabled` for tier ≥2 without ever looking up an executor, so there is no reachable write path. Test it with a spy across the whole executor table asserting zero invocations.

**No-shell test false positive:** a substring token list (`"rm "`) matches innocent prose ("platfo**rm** billing"). Use word-boundary regex (`\brm\s+-`, `\bsnow\s+sql\b`, `\$\(`, `&&`) so the wall catches real command lines without flagging descriptions.

### ADE Ops freshness: read each durable product's own freshness contract; never fabricate an as-of (2026-06-16)

PR 2 made `ade.freshness.assess` real by reading the product's OWN durable freshness signal, not by inventing one. The strongest in-repo source is `tel_pipeline_status` (`status fresh|stale|failed`, `as_of_ts`, `reason`, RLS-scoped by env_id+business_id, surface='stream_ingest') — a purpose-built handshake the telemetry pages already fail-closed on. The pattern: a small `DURABLE_PRODUCTS` registry in `ade_ops/freshness.py` maps a product_id → (reader, surface, target cadence, business-impact note); the executor resolves the product, reads its contract, computes age vs target, recommends a cadence, and returns `ok` (fresh) or `degraded` (stale/failed). Fail closed — `data_source_not_configured` (unknown product / cloud platform) or `durable_source_unavailable` (registered product but no row / read error) — and crucially: a registered product whose freshness row is absent returns BLOCKED with empty evidence, NOT a guessed timestamp. Cloud-platform freshness (snowflake/databricks/gcp/aws/bigquery) is explicitly out of scope until the PR 3 read-only adapters and is gated by an explicit platform check at the top of the executor. When a command's behavior changes from "always fail closed" to "real or fail closed", update the PR-1 blanket fail-closed test (it listed freshness.assess among unconditional-blocked commands) — that assertion becomes stale.
### AI provider dispatch — standalone layer, decision_type CHECK, and the test-harness auth bypass (2026-06-17)

Building the standalone AI provider dispatch layer (`backend/app/services/ai_dispatch/`, route `/api/ai/dispatch`, CLI `scripts/ai_dispatch/`) turned up four gotchas worth keeping. (1) **`ai_decision_audit_log.decision_type` has a hardcoded CHECK** (`tool_call|response|classification|fast_path`) in `407_*.sql`; a new value like `provider_dispatch` is rejected by Postgres and **silently swallowed** by `governance.record_decision`'s try/except (returns `None`). You MUST ship a migration that extends the CHECK, and the receipt code must report `receipt_status="failed"` / `receipt_write_failed` (never a phantom id) when `record_decision` returns None. Migration number: origin/main is at **540** (the HR feature branch was *behind*, not ahead — don't trust the active branch's max), so this used **541**; the ADE Ops plan also wants to extend the same CHECK, so 541 unions both `provider_dispatch` and `ade_op` and is idempotent (`DROP CONSTRAINT IF EXISTS` by looked-up name, then re-`ADD`). (2) **The pytest harness auto-authenticates** — `TestClient(app)` requests come through with `user: anonymous` but are NOT rejected (a dev-auth bypass populates `request.state.auth`), so a plain unauthenticated request to an authed route returns 200/403, not 401. To test an auth gate, monkeypatch the route's `require_authenticated_request` to raise `HTTPException(401)` and assert 401; for authed paths, monkeypatch it to return a built `AuthContext(...)`. (3) **`redact_dict` redacts by KEY name** against `token|secret|password|apikey|authorization|service_role|signed.*url` — `api_key` (underscore) does NOT match `apikey`; use a key like `auth_token` in a redaction test. (4) **A CLI that imports `app.*` triggers `app.config`, which `sys.exit`s if `DATABASE_URL` is unset.** For pure CLI subcommands that never touch the DB, `load_dotenv(backend/.env)` first (real values win) then `os.environ.setdefault` placeholder `DATABASE_URL`/`SUPABASE_*` — exactly what `backend/tests/conftest.py` does. Keep the dispatch package free of any `ai_gateway`/`request_router` import so the standalone invariant holds (grep-verify before PR).

### ADE Ops cloud adapters: one shared observation model, parse-only, fail-closed (2026-06-17)

PR 3 added read-only Snowflake/Databricks/GCP/AWS inventory adapters. The architectural rule that keeps PR 4 sane: normalize all four providers into ONE `ProviderInventoryObservation` model (`backend/app/services/ade_ops/cloud/models.py`) — provider-specific detail goes into a nested `raw_summary`, never new core fields. Adapters are **parse-only**: they take mocked/provided read-only output and return observations; they never execute a command in PR 3 (a test greps the adapters module for write verbs — alter/drop/terminate/modify-instance/resize/run-now/start-job-run/insert — and asserts none appear, plus a `READ_ONLY_VERBS` allowlist). **Env-var presence is NOT "configured"** — only a real read producing usable rows flips a provider to `configured`; missing CLI/auth/account/project/workspace/region returns an explicit per-provider `null_reason`, and nothing read ⇒ `observed_at=None` (no fabricated timestamp). Keep cost/rightsize **recommendation-disabled** in PR 3: `show_cost_hotspots` reports per-provider cost-OBSERVATION availability but blocks (no recommendation) by default; `recommend_rightsize` stays blocked. `rightsizing_candidate_available` is hardcoded False until PR 4. Each behavior shift breaks the prior PR's blanket-fail-closed tests — update them deliberately (cost is now blocked-WITH-evidence, scan now reports per-provider `cloud:<provider>` labels instead of a single `cloud_pipelines` label).

### `ai_decision_audit_log.decision_type` CHECK: migrations 484 and 541 coexist (read both before adding a third) (2026-06-17)

Two separate efforts extended the same hardcoded `decision_type` CHECK in `407_ai_decision_audit_log.sql` (`tool_call|response|classification|fast_path`): **484** (ADE Ops, adds `ade_op`) and **541** (AI provider dispatch, PR #233 — adds `provider_dispatch` AND unions `ade_op`). Both are idempotent (`DROP CONSTRAINT` by looked-up auto-generated name, then re-`ADD`), so on a fresh apply they run in order without conflict and the final CHECK allows all of `tool_call|response|classification|fast_path|ade_op|provider_dispatch`. The future trap: a THIRD effort that extends this CHECK must (a) read both 484 and 541 first to preserve every prior value, and (b) NOT trust the active feature branch's max migration number — origin/main was at 540 while a feature branch was *behind*; pick the next free number off origin/main. Never write a new constant `decision_type` value without a migration — `governance.record_decision` swallows the insert error and returns None, so receipts vanish silently (the supervisor maps None → `receipt_status="failed"`/`receipt_write_failed`, which is the only reason it's visible).

### ADE Ops recommendations: one artifact shape, candidate-not-action, text-only dry-run (2026-06-18)

PR 4 turns provider/freshness/cost observations into governed recommendation ARTIFACTS, never actions. Keep all categories on ONE `AdeOpsRecommendation` shape (`backend/app/services/ade_ops/recommendations.py`) — finding/recommendation/confidence/risk_tier/expected_impact/evidence/assumptions/null_reason/dry_run_artifact/approval_required/next_step/observation_window/rollback_required. The lines that keep it trustworthy rather than reckless: (1) `dry_run_artifact` is descriptive TEXT clearly labelled "DRY-RUN (NOT EXECUTED)" — never an executable command; a test greps both the module and the dry-run text for write tokens (alter/resize/modify-instance/run-now/start-job-run/terminate/drop/gcloud/aws/snowsql/subprocess). (2) The ADO payload is import-ready only (`pushed:false`) — real tickets route through azure-devops-intake, ADE Ops never auto-creates one. (3) Cost asserts NO dollar savings (`expected_impact=None`) without billing evidence — ranking candidate only. (4) Rightsize needs runtime+cost+utilization; utilization has no adapter yet, so the executor is blocked-by-default (no resize ever recommended). (5) `risk_tier` on the ARTIFACT describes the recommended action (dry-run ⇒ Tier 2 + approval_required + rollback_required); the COMMAND that produced it stays tier-1 read-only, and the tier-2 *skills* in the registry remain non-executable — PR 4 changes neither. Wiring note: store `recommendations` on `OpsRunResult` as `list[dict]` (pre-serialized), not `list[AdeOpsRecommendation]` — recommendations.py imports from models.py, so a typed field there is a circular import.
### Platform (non-env) admin pages live at /lab/system; keep read-only surfaces GET-only at the proxy (2026-06-18)

The AI Provider Dispatch admin panel (PR 2) is a *platform* surface, not a lab-env one. Platform admin pages go under `repo-b/src/app/lab/system/<name>/page.tsx` — that directory's `layout.tsx` already gates access with `isAdminSession()` (server-side, redirects non-admins to `/app`), so the page needs **no** auth code of its own and does **not** touch `LabEnvironmentShell`/`isDomainRoute` (that edit is only for `lab/env/[envId]/*` routes). Existing siblings: `lab/system/ai-usage`, `control-tower`, `access`, `identity`. The proxy pattern is `repo-b/src/app/api/<name>/[...path]/route.ts` using `parseSessionFromRequest` (401 fail-closed) + `buildPlatformSessionHeaders(req)` from `@/lib/server/platformForwardHeaders` (forwards platform-session → backend auth context, incl. `business_id` for tenant-scoped reads). For a **read-only** panel, implement **only GET** in the proxy — then the UI structurally cannot POST `/run` or any mutation, no matter the component code. Two more: (a) keep a new surface independent of the *deletable* ade-ops module — copy the ~90-line dark-console primitives into your own `components/<name>/primitives.tsx` rather than importing `@/components/ade-ops/primitives` (don't couple to a surface that may be deleted). (b) For prod-safe "eval visibility", don't have the backend read repo-root `evals/*.jsonl` — the Railway image only ships `backend/`, so that file isn't present; inline the eval cases as a Python constant and run them through the pure `select_provider` (no model calls, no DB) so the endpoint works in prod.

### ADE Ops PR 5A: the approval/execution spine that executes nothing — and proves it three ways (2026-06-18)

"Approval-gated allowlisted execution" is where platforms get dangerous, so PR 5 was split: 5A = approval escrow + execution preflight with NO provider writes; 5B = simulated execution; 5C = one real, fully-gated write. PR 5A's no-execution invariant is enforced at three layers, not just asserted: (1) code — `approvals.EXECUTION_ENABLED = False`, no subprocess/provider-write path, and `can_execute()` returns `execution_not_enabled` even for an approved + preflight-passed request; `attempt_execution()` always returns `executed:false`. (2) schema — `ade_ops_approvals` (migration 614, RLS) has `CHECK (executed = false)`, so the DB itself rejects an execution row (verified: an `executed=true` insert raises 23514). (3) UI — `ApprovalsPanel` surfaces `executed:false` and a permanent "execution disabled" banner so it can't silently flip. Preflight requires six dimensions (rollback_plan, observation_window, target_ref, provider, risk_tier, evidence). Two reusable gotchas: (a) the no-execution-token test must strip docstrings before scanning — a prose promise like "no subprocess here" is otherwise a false positive (same lesson as the PR-1 no-shell test; here parse with `ast`, blank docstrings, `ast.unparse`). (b) RiskTier members are INVENTORY/RECOMMENDATION/DRY_RUN/NONPROD_WRITE/PROD_WRITE/ROLLBACK (0-5) — there is no WRITE_CONFIRMED on RiskTier (that's a PermissionMode); allowlist entries for provider writes use `RiskTier.PROD_WRITE`. Migration numbering: origin/main's feature range was at 613, so this used 614 (don't trust a feature branch's max — and 484/541 already coexist on the decision_type CHECK).
### Gemma-on-Vertex provider adapter: creds-gated availability, ADC auth, mock the two seams, ship-safe-to-prod (2026-06-18)

Wiring a real Vertex provider (PR 3) without provisioning GCP: the adapter can ship to prod **safely** because availability is credential-gated — move the provider into the registry `_IMPLEMENTED` set, and `available()` becomes `implemented AND all requires_env set`. With no `GEMMA_VERTEX_*` in prod, Gemma stays unavailable (fails closed), so merging the real adapter changes nothing live until creds exist. Auth: mint a token via **Application Default Credentials** — `google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])` then `creds.refresh(google.auth.transport.requests.Request())`; import `google.auth` **lazily inside the function** so a missing dep / missing ADC fails closed (`ProviderUnavailable` → `provider_not_configured`) instead of breaking module import. `google-auth` is already present transitively via `google-cloud-bigquery`, but declare it directly in `backend/requirements.txt` since the adapter imports it. Testing without a real endpoint: factor the two external seams into module-level functions — `_vertex_access_token()` and `_vertex_predict(url, token, payload)` — and monkeypatch BOTH (`monkeypatch.setattr(module, "_vertex_predict", fake)`); never hit the network. Config gotcha: `config.py` caches `os.getenv` at import, so a test must patch **both** `os.environ` (for `registry.available`, which reads `os.getenv`) AND `app.config.GEMMA_VERTEX_*` (for the adapter, which reads the config module) — setenv alone won't flip the adapter. Parse Vertex responses **defensively** (`{predictions:[{content|generated_text|text}]}` and `generateContent` candidates) because the response shape is serving-container-specific; document that it must be confirmed at provisioning. Receipts: record `provider=gemma_gcp` + model + latency + usage, never the service-account JSON or the raw answer (`output_summary` carries the routing trace only). Map the error classes deliberately: missing config/auth → `ProviderUnavailable` (provider_not_configured); transport/timeout/HTTP≥400 → `ProviderCallError` (provider_call_failed); `complete()` never raises out. Moving a provider into `_IMPLEMENTED` flips any prior "not-implemented" test — update it to assert env-gated availability instead.

### Railway `railway up` from a git worktree: link per-directory, and `/version` cannot self-report a CLI-deploy SHA (2026-06-18)

Deploying the backend from a **git worktree** (not the main checkout) needs `railway link` in that directory first — the link is per working-directory. Symptom of a missing link: `scripts/deploy_backend.sh` prints "captured git SHA …" then `railway up` fails with **"No linked project found"** and the script still exits 0 (SHA capture succeeds, deploy is a no-op). ALWAYS confirm the live SHA/behavior after deploy; never trust exit 0. Link non-interactively: `railway link -p authentic-sparkle -e production -s authentic-sparkle`.

Bigger trap: **`/version` (`resolve_git_sha()` in `backend/app/observability/deploy_state.py`) reads ONLY `os.environ["RAILWAY_GIT_COMMIT_SHA"]`**, which Railway sets for **GitHub-connected builds** but NOT for `railway up` CLI deploys → `{"git_sha": null}` after a CLI deploy. `railway variables --set RAILWAY_GIT_COMMIT_SHA=…` does NOT stick (Railway reserves `RAILWAY_*`). The deploy script writes `backend/app/_git_sha.txt`, but it's **gitignored** (so `railway up`, which respects `.gitignore`, never ships it) and nothing reads it. Net: **a CLI deploy structurally cannot self-report its SHA via `/version`.** Verify a CLI deploy by BEHAVIOR (a changed allow-list size, a new intent answering) — stronger than a SHA string. Real fix (follow-up): `resolve_git_sha()` should fall back to a shipped, non-gitignored stamp.

Telltale: `/version` flipping from the old SHA to a *different* value (incl. `null`) = a NEW container is live; a failed build keeps serving the OLD SHA. So `old_sha → null` after `railway up` means the deploy succeeded but the stamp didn't ship, NOT a deploy failure.

### ADE Ops PR 5B: simulated execution proves the ceremony; real providers stay impossible by construction (2026-06-18)

PR 5B runs the approved-execution lifecycle end-to-end (approved → preflight → execute → receipt → observation window → simulated rollback) against a SIMULATED executor only — and keeps real providers impossible rather than merely "off". How: (1) an `execution_mode` axis (simulation|nonprod|prod) — only `simulation` has an executor; `nonprod`/`prod` return `real_execution_not_enabled` because no real executor code exists. (2) `approvals.EXECUTION_ENABLED` stays False (untouched from 5A) — simulation is a SEPARATE capability in `simulation.py`, not a flip of the real gate. (3) schema enforcement: migration 615 relaxes the 5A `CHECK (executed = false)` to `CHECK (executed = false OR execution_mode = 'simulation')`, so the DB itself rejects `executed=true` for prod/nonprod (verified: 23514 on a prod insert, simulation insert succeeds). (4) a docstring-stripped module scan asserts the simulator imports no provider client / subprocess (boto3/snowflake.connector/databricks/requests/httpx/gcloud/aws/alter/run-now). The simulated execute records a text "plan" (`[SIMULATION] … no provider command issued`) and opens an observation-window timestamp — real paper trail, zero infra touched. UI rule: render `executed:true` ONLY as a "Simulated" tag with the mode visible, so a real write can never masquerade as done. Migration numbering held: 614 (5A) → 615 (5B), off origin/main's 613 feature-range max. PR 5C is the first PR that introduces a real provider write — do not start it until 5B's paper trail is proven clean.

### ADE Ops PR 5C: the first real provider write is one boring reversible Snowflake mutation, not a framework (2026-06-18)

Crossing from simulated to real execution: ADE Ops can now perform exactly ONE real action — `ALTER WAREHOUSE <allowlisted> SET AUTO_SUSPEND = <int>` (Snowflake, non-prod). Resist turning this into a "Snowflake write framework"; the safety comes from how narrow it is. The defense layers (all test- or DB-enforced): (1) SQL is BUILT from typed fields (an allowlisted warehouse name + a bounded int), never user-supplied — `execute_auto_suspend` has no `sql` parameter (a test asserts the signature). (2) A strict allow-only validator `validate_sql` accepts ONLY `^ALTER WAREHOUSE <ALLOWLISTED_IDENT> SET AUTO_SUSPEND = <int>$` and rejects semicolons, piggyback statements, comments, resize, lowercase, non-int, non-allowlisted — both the forward SQL and the rollback SQL are validated, and rollback is generated BEFORE execution (an invalid rollback blocks with nothing run). (3) Gate order: env flag `ADE_OPS_REAL_EXEC_ENABLED` (default off) → non-prod only (prod blocked) → approved → preflight → snowflake provider → allowlisted warehouse. (4) The Snowflake client is dependency-injected; CI passes a mock so no credential is needed, and `_default_client()` lazily imports `snowflake.connector` only behind the flag (keeps the module import-clean; mark it `# pragma: no cover`). (5) Schema enforcement — migration 616 tightens the CHECK so a real `nonprod` executed row is permitted only for `provider='snowflake' AND action_kind='warehouse_auto_suspend' AND generated_sql_hash IS NOT NULL AND rollback_sql_hash IS NOT NULL`; verified via Supabase CLI that a nonprod row missing hashes AND any prod row both raise 23514. The receipt stores before/after + both SQL hashes (not raw SQL). Migration sequence held: 614→615→616. The CHECK is the through-line of this whole arc: 5A `executed=false`, 5B add `OR simulation`, 5C add the single hashed nonprod snowflake action — each PR widens it by exactly one provable step.

### Gemma-on-Vertex stage provisioning: the real serving contract (Model Garden dedicated endpoints) (2026-06-18)

First real stage deploy + call of the Gemma Vertex adapter (project `novendor-events-prod`, gemma-3-1b-it on a single L4). Concrete gotchas, now automated in `.skills/gemma-vertex-stage/` (`scripts/gemma_vertex_stage/{deploy,run,teardown}.py`): (1) **A BigQuery service account can be reused** — the backend's `GOOGLE_APPLICATION_CREDENTIALS_JSON` (Railway) SA works for Vertex once you add **Agent Platform User + Administrator** (`roles/aiplatform.user`/`.admin`); the API also has to be enabled (the BQ SA can't enable it — `serviceusage` perm — so do it in the Console). (2) **First-ever Vertex deploy in a project 500s** with a bare `INTERNAL` (service-agent provisioning lag) — retry once and it succeeds; the deploy LRO that errored client-side created nothing, so just re-run. (3) **THE big one — Model Garden deploys create a *dedicated* endpoint** that REJECTS the shared `aiplatform.googleapis.com` domain with `FAILED_PRECONDITION` ("cannot be accessed through the shared Vertex AI domain"); you must POST to its **dedicated DNS** (`GET endpoints/<id>` → `dedicatedEndpointDns`, e.g. `<ep>.<region>-<routing>.prediction.vertexai.goog`) at `https://<dns>/v1/<endpoint_resource_name>:predict`. The adapter fix: a `GEMMA_VERTEX_DEDICATED_DNS` config var; when set the adapter uses `https://{dns}/v1/{resource}:predict`, else the shared `{location}-aiplatform.googleapis.com`. (4) **vLLM `:predict` returns a plain string** in `predictions[0]` (the full "Prompt:\n...\nOutput:\n..." text), which `_extract_text`'s `isinstance(first, str)` branch already handles. (5) **Cheapest deployable Gemma**: `OpenModel("google/gemma3@gemma-3-1b-it").list_deploy_options()` → pick the `g2-standard-12` + `NVIDIA_L4` option (accelerator_type enum 11); deploy ~6 min; **always teardown** (undeploy_all + endpoint.delete + model.delete) — an idle L4 bills ~$1/hr. (6) Keep the stage call OFF prod: capture the receipt payload via a `record_decision` shim (don't write to the prod audit log); a no-DB CLI run shows `degraded/receipt_write_failed` with a real answer — that's the receipt guard firing on a real call, not a failure.

### Telemetry Go/No-Go Control Tower: compose, don't rebuild — scoped registry, chain advisory lock, undeploy≠delete (2026-06-19)

Built the "Agent Control Tower" MVP (`backend/app/services/control_tower/`, `routes/telemetry_control_tower.py`, `repo-b/.../telemetry/control-tower/`, migration `10022_control_tower.sql`) entirely by composing what already shipped — no LangGraph/LiteLLM/OPA/SkyPilot. Reusable lessons: (1) **The ai_dispatch router already does sensitivity routing** — `run_dispatch(req, registry=…)` / `route_only(req, registry=…)` accept a scoped registry, so an ITAR-aware posture is a *second* `ProviderRegistry` instance (in-boundary Gemma `max_privacy=SENSITIVE`; external OpenAI/Claude capped at `INTERNAL`) passed in — **never mutate the global `provider_registry`**, and no need to add a 4th `Privacy` enum tier. A `privacy=SENSITIVE` request then makes Gemma the only eligible provider; cold Gemma → `UNAVAILABLE/provider_not_configured` (fail closed, no external leak). (2) **Table prefix guardrail is enforced** (`ARCHITECTURE.md`: "no new prefix until this file is updated") — `ct_` is unapproved; namespace under the approved `tel_` as `tel_ct_*`. (3) **Hash-chain receipts need a real lock, not just a unique index** — sign inside one txn holding `pg_advisory_xact_lock(hashtext('tel_ct_chain:'||env))` to read the chain head, plus `UNIQUE(env_id, chain_seq)` as the backstop; sign over a stored `payload_canonical` TEXT (not the jsonb) to avoid float round-trip drift breaking verification. (4) **Gemma teardown for "ready at a moment's notice" = `endpoint.undeploy_all()` ONLY** — keep the endpoint + model + `GEMMA_VERTEX_*` config so the endpoint id/DNS stay stable (re-warm just redeploys, ~6–20 min); `scripts/gemma_vertex_stage/teardown.py` additionally `delete()`s the endpoint, which churns the id. Vertex `endpoint.deployedModels` is the billing source of truth — DB state is a cache; `torn_down` only when it's empty. (5) **Lifecycle is async + quadruple-gated** (operator role + `CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED` + confirm token + prod guard) so a demo viewer can never spin a GPU; warm/teardown create a `tel_ct_gemma_job` and return immediately (UI polls) — never run the 6–20 min Vertex call in a request handler. (6) **Fresh worktree off `main` has no `node_modules`** — if the lockfile is identical to a sibling main worktree (it was, vs `Consulting_app-rs-demos`), junction it (`New-Item -ItemType Junction`) instead of a multi-GB `npm ci`; `tsc --noEmit -p tsconfig.typecheck.json` then runs clean. (7) New `app.services.*.get_cursor` modules must be added to `backend/tests/conftest.py` `_GET_CURSOR_TARGETS` for the `fake_cursor` fixture to mock them.
### Telemetry app: where things live + the honesty traps (2026-06-18)

From a research-vs-code gap inspection of the RS Telemetry app, file-location and overclaim lessons worth keeping:

- **Telemetry routes** live at `repo-b/src/app/lab/env/[envId]/telemetry/*`; the nav single source of truth is `repo-b/src/components/telemetry/telemetryNav.ts` (one `TELEMETRY_NAV` array read by rail, drawer, and bottom bar). Add/remove a screen by editing that array or you ship a nav entry to a route with no `page.tsx` (404).
- **RLS presence ≠ tested isolation.** All 21 `tel_*` tables enable RLS on `env_id = current_setting('app.env_id', true)`, but isolation was untested in CI. Add a cross-tenant test (tenant B sees 0 of tenant A's rows) before claiming it. Serving also filters by `business_id` via `resolve_tenant_id` as defense-in-depth — assert both layers.
- **The telemetry copilot does NOT do document RAG.** It grounds on fetched structured evidence with a two-pass anti-fabrication post-validator, then falls back to a deterministic template. `tel_fused_state_vectors` (pgvector) exists but the copilot never queries it. "Secure RAG" would be an overclaim — there is no retrieval-layer ACL because there is no retrieval corpus.
- **Platform MCP is robust; telemetry has zero MCP tools.** `backend/app/mcp/` has registry/audit/auth/rate-limit + typed tool families, but no telemetry-specific tool. The copilot uses an inline `ALLOW_LIST` in `telemetry_copilot.py`, separate from the MCP registry/audit.
- **Plan-folder convention:** `docs/plans/02-environments/` does not exist; per-env plans live at `docs/plans/<env>/` (telemetry = `docs/plans/telemetry-platform/`).

### Testing RLS / running the backend suite on this repo (2026-06-18)

- **The backend suite mocks the DB; you cannot exercise RLS in it.** `conftest.py` patches `get_cursor` with an in-memory `FakeCursor`. The `db_conn` fixture is real-DB integration and auto-skips without Postgres. The deterministic security-test pattern here is static-SQL assertion over the migration files (see `test_supabase_security_advisor_migration.py`).
- **The FastAPI runtime bypasses RLS.** `backend/app/db.py:get_cursor` uses a pooled privileged role and never `SET ROLE`/`app.env_id`; `tel_*` RLS is defense-in-depth for direct Supabase clients, and the runtime tenant boundary is app-layer `business_id` scoping.
- **Static RLS invariant must skip partition children** (`CREATE TABLE … PARTITION OF …` inherits RLS, has no own `ALTER … ENABLE RLS`); filter rows whose clause contains `PARTITION OF`.
- **A real-DB behavioral RLS test must be opt-in + read-only** — gate behind an env flag so it never runs against a pulled prod `DATABASE_URL`, and prove isolation by reading (non-owner role + foreign `app.env_id` → 0 rows), not seeding.
- **A branch cut from `HEAD` is not a branch cut from `main`.** Branching off an active feature branch's HEAD pulled 20 unrelated commits into a PR targeting main; cut scoped PRs from `origin/main`. `git status` + explicit-path staging only guard *uncommitted* drift, not committed ancestor commits.
- **`docs/tips.md` is an append magnet** — fast-moving `main` re-conflicts it on every rebase; resolve by taking main's version and re-appending your section at EOF.

## ML Algorithm Decision Lab — deterministic ML demo on the HR surface (2026-06-15)

Built a 10-algorithm teaching lab inside History Rhymes (`/lab/env/[envId]/historyrhymes/ml-algorithms`,
API `/api/hr/v1/ml-demo/*`). Reusable lessons:

- **The HR namespace is `/api/hr/v1/...`, not `/api/historyrhymes/...`.** A frontend contract test
  (`historyrhymesClientContract.test.ts`) bans the drifted namespace and 404s only at runtime. New HR
  client surfaces should ship a mirror contract test (`mlDemoClientContract.test.ts`) asserting exact
  paths and `not toContain("/api/historyrhymes/")`.
- **A synthetic ML demo wants in-memory deterministic generation, not a DB table.** One seeded
  `np.random.default_rng(42)` drawn in fixed order + fixed column order + floats rounded at the JSON
  boundary → byte-identical output every process. No migration, no RLS; determinism is stronger than a
  one-time seed job against a mutable table. Assert `generate_dataset(42).equals(...)` + metric equality.
- **Fail closed per-algorithm, not per-page.** `run_algorithm` wraps each trainer in try/except and
  returns a `not_available` envelope (static `model_card` still populated) so one broken model never
  blanks the other nine. Monkeypatch one trainer to raise; assert exactly one `not_available`.
- **Don't encode brittle "textbook" numeric directions in ML tests.** F1 under heavy imbalance is too
  volatile to assert e.g. `random_split_f1 >= grouped_split_f1`. Assert structure + that the mutation
  happened; let the mechanism (grouped split keeps `__group__` rows together) be correct.
- **Cloud links: a provider abstraction that never fabricates a URL.** `build_external_links(ResourceRef)`
  returns `{provider,label,resourceType,href,copyValue,unavailableReason}`. Incomplete config / provider
  `none` → `href` null + reason, but `copyValue` always present. GCP is the real materialized provider;
  Databricks is config-ready. Unit-test gcp/databricks/none/incomplete.
- **Reality Mode = mutate before training, overlay after.** `apply_scenario(df, scenario)` mutates a COPY
  and records into `scenario["_meta"]`; `augment_result()` reads that meta + computes honest overlays.
  Passing the same scenario dict to both halves is the clean channel without threading return values.
- **recharts had zero onClick usage in repo-b before this.** Scatter/Bar `onClick` hands you `{payload}`
  — wire it to a dark full-height drawer (own palette, not the `bm-glass` SlideOver). Confusion matrix
  and dendrogram have no recharts primitive — CSS-grid heat cells + a depth-capped SVG cluster tree
  (labeled "simplified") avoid adding a charting dep.
- **The lab UI is standalone/full-bleed** (`min-h-screen bg-neutral-950 ... p-6`), never wrapped in a
  domain shell, plain `useState`/`useEffect` — charts + drawer are the intentional polish, state stays raw.

## History Rhymes Feature Store — schema 10023 + gold materializer (B1, 2026-06-16)

- **Single-tenant `hr_` bronze→silver→gold.** Mirror `10017_history_rhymes_polymarket.sql`: `public.hr_*`, no env_id/RLS, justify the exemption in every `COMMENT ON TABLE`. Bronze is append-only (range-partitioned by `ts_ingest` with a **DEFAULT partition** so inserts never fail before time partitions exist; PK must include the partition key, `(id, ts_ingest)`). Silver idempotency key = `UNIQUE(connector, series_key, ts_source)`. Gold idempotency key = `UNIQUE(observation_id, as_of_date, model_obs_version)`.
- **pgvector dim verification in a DO block.** `format_type(a.atttypid, a.atttypmod)` returns `vector(256)` (pgvector stores the dimension in `atttypmod`); assert it equals `vector(256)` and that `pg_extension` has `vector`. Fail loudly — the spine bridge depends on the 256-dim contract.
- **Idempotent UPSERT with insert/update tally.** `INSERT … ON CONFLICT (keys) DO UPDATE SET …, updated_at=now() RETURNING (xmax = 0) AS inserted;` — `xmax = 0` is true for inserts, false for updates, so you can count inserted vs updated in one round-trip.
- **psycopg params for jsonb/vector.** Pass jsonb as `json.dumps(...)` + `%(col)s::jsonb`; pass vectors as a `"[v1,v2,…]"` string + `%(col)s::vector`. Keep missing values `None` (SQL NULL) — never coerce a missing reading to 0.
- **Deterministic, network-free encoding.** The spine encoder (`skills/historyrhymes/services/state_vector_encoder.py`) calls OpenAI for a non-empty narrative **when `OPENAI_API_KEY` is set** → non-deterministic + a network call (which broke a determinism test and slowed the suite 25s→11s). For offline/deterministic materialization, call `encode_state_vector(features_normalized, "")` (empty narrative hits its zero-text fast path) — the quant half stays identical to the spine's, the text half is a deterministic zero placeholder until a real Phase B/C embedding step.
- **Testing a DB loader without a DB.** Lazy-`import get_cursor` inside the function so the conftest `fake_cursor` fixture (which patches `app.db.get_cursor`) covers it; push `RETURNING` rows to tally inserted/updated; test the unavailable path by monkeypatching `app.db.get_cursor` to raise (the loader returns `{unavailable: N}`, never raises).

## History Rhymes Feature Store — Census connector (B3, 2026-06-16)

- **Auxiliary series with `quant_slot=None`.** A connector can ingest a real, useful series that is NOT in the 32-slot `QUANT_FEATURE_ORDER` (e.g. `housing_permits_saar`). Store it in silver with `quant_slot=None`; the import guard only requires NON-None slots ∈ the canonical order. Promoting an auxiliary series to the spine is a deliberate encoder-version bump — never edit `QUANT_FEATURE_ORDER` inside a connector PR. (`housing_starts_saar` IS a slot; permits is auxiliary.)
- **Unit scaling lives in the registry.** Census starts/permits are thousands-SAAR; pin a `scale` (0.001) so live values land on the canonical millions scale the spine/Foundry expects. Keep `unit` + `scale` in provenance.
- **Census `eits/resconst` is a 2D array** (header row + data rows). Parse by header index for `cell_value`/`time`; raise `CensusShapeError` for a structurally invalid response, but use `null_reason` (`census_missing_value` / `census_missing_period`) for per-cell issues — never zero-impute.
- **Testable ingest via dependency injection.** Put per-series orchestration in `run_ingest(..., fetch_fn, upsert_fn, status_fn)` so "dry-run doesn't write" and "write writes" are unit-testable with fakes (no network, no DB); the CLI script is a thin wrapper. (Better than B2's in-script logic; B4+ should follow.)
- **Network-free default script.** A keyless public source can't gate on key-presence (as FRED does), so gate the live fetch on `FS_<CONNECTOR>_ENABLED` (default false) — the default dry-run is network-free; live failures print + exit 0 (ops evidence, never CI).
- **Mocking a lazy httpx client.** The client does `import httpx` then `httpx.get(...)`; `monkeypatch.setattr(httpx, "get", fake)` works because the in-function import resolves to the same patched module — the client path is testable without network.

## History Rhymes Feature Store — VIX connector (B4, 2026-06-16)

- **Spot VIX is NOT term structure.** `vix_spot` (FRED VIXCLS) is real; `vix_term_structure` is a real canonical slot but has no source wired, so it is reported `unavailable` with `null_reason="term_structure_source_not_configured"` — contango/backwardation is NEVER computed from spot alone. Pattern: mark unsourced slots `source_available=False`; the ingest emits a `status:"unavailable"` summary item (no fetch, no row), and the normalizer *refuses* (raises) if asked to normalize an unsourced series. This is the honest way to surface a canonical slot you can't yet fill.
- **Reuse a sibling connector's key reader.** VIXCLS is a FRED series, so the VIX client reuses `fred.client.fetch_observations` + `fred_api_key` (no duplicated httpx/secret code) while staying a logically separate connector with its own `vix_*` null reasons and registry.
- **Omit unconfirmed series, don't proxy them.** MOVE / rate-vol was omitted from B4 (no confirmed public source) rather than emitting `move_index` from a guess — same discipline as not faking term structure.

## History Rhymes Feature Store — FOMC text connector (B5, 2026-06-16)

- **Text ingestion is NOT embedding.** The FOMC connector fetches + normalizes statement text only. B1's silver `value` is numeric, so text rows set `value=NULL`, `quality_flag='text'`, and carry the body/title/url/date/sha256/char_count in `provenance` (jsonb) — **no schema change**. Embedding is a separate, deferred materializer; the ingest surfaces `embedding_status="embedding_materializer_not_configured"` so it is explicit that text was stored but not embedded.
- **Connector tests must not need a live embedding provider.** Split the live fetch (lazy httpx, untested, needs page-structure verification) from a PURE `extract_document(html, url)` (tested with committed HTML fixtures) and a PURE normalizer. Never import `openai`/`anthropic`/`encode_state_vector` in a connector; a scope-guard test asserts those + `episode_embeddings` are absent.
- **Retain source provenance for narrative text.** Keep `url`/`date`/`title`/`source`/`text_sha256` in provenance so text is auditable + de-dupable; missing body → `fomc_missing_text` (value NULL, not 0), missing date → `fomc_missing_date` (no `ts_source` key, so the loader skips it).
- **No interpretation in a connector.** Do not summarize, classify hawkish/dovish, or score semantic shift in the ingest layer — that is downstream. The connector stores raw normalized text + provenance, nothing more.

## History Rhymes Feature Store — DefiLlama stablecoin connector (B6, 2026-06-16)

- **Stablecoin supply is a crypto-liquidity PROXY, not market liquidity.** Emit `stablecoin_supply_usd` + observed growth windows only. Do NOT derive `liquidity_fragmentation_score` / `central_bank_liquidity` / a "regime" label from supply alone — those need TradFi/CB inputs (out of scope). Provenance carries a `"crypto-liquidity proxy; not market liquidity"` note; all outputs are auxiliary (`quant_slot=None`, not in the 32-slot quant block) → no spine change.
- **Growth windows require observed history, or fail closed.** Compute `(current - past) / past` over the window from the supply series; if there are fewer than `window+1` observed daily points → `null_reason="defillama_growth_window_insufficient"` (value None), never a fabricated trend. State `window_days` + the exact `calculation` + current/past supply in provenance. Don't annualize unless named.
- **Fetch-once, derive-many.** The DefiLlama chart (`/stablecoincharts/all`) is fetched once per run and all three series derive from it (level + 7d + 30d) — avoids redundant network calls; growth rows are a single point at the latest date, the supply series is the per-day history.

## History Rhymes Feature Store — infra manifests (B7, 2026-06-17)

- **Two independent off-switches.** Feature-store workers default disabled via BOTH `FS_*_ENABLED: "false"` in the configmap AND `replicas: 0` in the Deployments. Public/keyless sources (Census / VIX-via-FRED / FOMC / DefiLlama) must NOT create secret dependencies; the SecretProviderClass references only `winston-database-url` + the already-provisioned `winston-fred-api-key`.
- **Infra is authored separately from the runtime worker.** A Deployment may reference a future entrypoint (`app.services.hr_feature_store.worker`) at `replicas: 0`, so `kubectl kustomize` validates structure while nothing can crash-loop. The worker loop + harmonizing the FRED connector's `run_ingest` with B3–B6 are a later runtime PR.
- **Don't contaminate a stacked branch from a divergent working tree.** When the working tree sits on a different branch, build a modified shared file from the STACK BASE's blob + your edit (`git show <base>:path` → edit → `git hash-object -w --path` → `git update-index`). NOTE: build the temp file with bash redirection, not Python `open("/tmp/...")` — native Windows Python resolves `/tmp` to `C:\tmp`, not Git-Bash's tempdir, so the blob comes back empty and `update-index --cacheinfo` fails silently-ish.
- **Validate with `kubectl kustomize <dir>`** (kubectl 1.34 ships it). Gate the pytest kustomize-build test on `shutil.which` so CI without kubectl skips rather than fails.

## History Rhymes Feature Store — gated embedding backfill (C1, 2026-06-18)

- **Embedding backfill is a gated PROMOTION, not a materializer side effect.** Promoting gold model-observations into the live analog spine (`episode_embeddings`) must pass every gate before a single write: Brier<0.22, permutation p<0.05, no-lookahead audit, a real `model_version` bump, 256-dim, `source_quality=='live'` (synthetic/fixture are NOT promotable — never poison the spine with synthetic), resolvable episode mapping, append-only non-overwrite, and 2:1 non-event:crisis coverage. Any failure ⇒ `status="blocked"`, `write_allowed=false`, no partial write.
- **Dry-run is the default; the write path needs two independent flags.** `--write` AND `--confirm` (plus `--model-version` + valid `--calibration-evidence`). `--confirm` without `--write` is still a dry-run; `--write` without `--confirm` is `confirm_required`. A blocked dry-run exits 0 with a structured receipt — blocked is a normal outcome, not an error.
- **`episode_embeddings` is keyed by `episode_id` (FK→episodes), NOT `observation_id`.** Gold rows have no `episode_id`, so the live DB repo resolves no mapping and the planner blocks on `episode_mapping_unresolved` + emits a C2 mapping proposal (read-only adapter OR a new fs-keyed embedding table) — do NOT hack a mapping or slide schema into C1.
- **Require calibration/permutation evidence; never fabricate it.** C1 does not run a calibration job or a full permutation engine — it consumes a committed fixture or `--calibration-evidence path`. Missing evidence ⇒ `missing_calibration_evidence` + `missing_permutation_evidence`. The no-lookahead audit IS computed deterministically (banned substrings: forward_return/future_return/target_/resolved_/actual_outcome/max_drawdown_next/next_30d over features_normalized + provenance + lineage inputs).
- **Tests exercise the write path with a fake repo only.** No production DB, no network. The fake repo supplies an episode mapping + live source so the eligible/write path is reachable; a second identical write inserts 0 (append-only ON CONFLICT DO NOTHING) — proving no in-place overwrite.

## History Rhymes Feature Store — observation embedding target (C2-B, 2026-06-18)

- **Feature-store observations are NOT historical episodes; give them their own table.** `episode_embeddings` is keyed by `episode_id` (FK→`episodes`); gold model-observations are keyed by `observation_id` with no `episode_id`. Don't hack the mismatch or force observations into the episode library — `10024_history_rhymes_observation_embeddings.sql` adds `hr_feature_store_observation_embeddings` keyed by `(observation_id, model_obs_version, embedding_model_version)`, additive, with `episode_embeddings` left entirely untouched (the COMMENT explains the deliberate separation).
- **Make the safe path available without weakening the unsafe one.** The C1 planner gained a `target`: `observation_embeddings` (default, no episode mapping needed, requires `--embedding-model-version`) vs `episode_embeddings` (the historical library — still BLOCKS on `episode_mapping_unresolved` and emits the C2 mapping proposal). C2 adds the safe target; it does not relax the episode gate.
- **`embedding_model_version` is part of the append-only key.** A new encoder produces a NEW row, never an in-place overwrite. Dedup is per-row on the full `(observation_id, model_obs_version, embedding_model_version)` triple; the repo's existing-keys lookup is keyed by `embedding_model_version` (batch-wide) and returns the full triples — querying it by `model_obs_version` is wrong because `model_obs_version` varies per candidate row.
- **Promotion into the episode library is a separate human-reviewed workflow (C3), not an implicit write.** Storing an observation embedding ≠ creating a historical episode. Reviewed candidate creation + non-event labeling + calibration-receipt attachment + explicit human approval come before any observation becomes an episode.
- **All C1 gates still apply under the new target** (Brier/permutation/no-lookahead/version-bump/256-dim/source_quality=live/non-event coverage/append-only). When you change a planner default that existing tests rely on, make the prior-behavior tests explicit (here: the episode-target tests now pass `target="episode_embeddings"`) rather than letting the default flip silently change their meaning.

## History Rhymes Feature Store — observation→episode promotion (C3 design, 2026-06-18)

- **Observation embeddings are NOT promoted by default; historical-episode promotion is a human-reviewed evidence workflow.** The flow is strictly left→right: `hr_history_rhymes_model_observations` (+ `hr_feature_store_observation_embeddings`) → reviewed candidate → human-approved candidate → `episodes` row → `episode_embeddings` row → immutable receipt. Never write an observation embedding straight into `episode_embeddings`; an embedding only enters the library AFTER an `episodes` row exists for it.
- **`episodes` is the real promotion target (defined in `434_history_rhymes_wss.sql`, not 503).** NOT NULL fields `name`/`asset_class`/`macro_conditions_entering`/`catalyst_trigger`/`timeline_narrative` must come from the reviewer at episode-creation — never auto-placeholdered. `episodes` has NO column for `model_obs_version`/`embedding_model_version`/calibration/lineage/no-lookahead or an originating `observation_id`; those gaps belong on a candidate/receipt store, not bolted onto the curated narrative library.
- **Reuse the existing non-event vocabulary, don't fork it.** `episode_detection_audit.classification` already defines `non_event|event|rejected_overlap|rejected_no_recovery|rejected_blip` + `content_hash` dedup; the promotion labeling stage should align with it. Enforce `non_event_to_event_ratio >= 2.0` before library expansion (block, or audited senior override) so the library never goes crash-only.
- **The retrieval contract is the regression guard.** `history_rhymes_service._search_analogs` does `episode_embeddings ee JOIN episodes e WHERE ee.embedding_type='full_state' ORDER BY ee.embedding <=> %s::vector`. Promotion is an ADDITIONAL gated writer into the same target — it must not change that query, the `embedding_type='full_state'` filter, or the Databricks population path. The `ai_decision_audit_log.decision_type` CHECK (`tool_call|response|classification|fast_path`) blocks an Option-C `promotion` audit type without a migration.
- **Recommendation pattern: agree the GATE before building the table.** Option A (`hr_episode_promotion_candidates`) is the eventual home, but the human-approval + calibration + no-lookahead + non-event-coverage gate is what prevents "cool-looking analogs" from becoming bad institutional memory — so design the semantics first (C3) and implement storage in C4 only after approval.

## History Rhymes Feature Store — promotion-candidate airlock (C4, 2026-06-18)

- **Promotion candidates are the staging airlock; the storage layer enforces the gate.** `hr_episode_promotion_candidates` (migration 10025) holds the C3 review packet + status machine in the DB (CHECK constraints on status/type/label/source_quality/readiness). The service (`promotion_candidates.py`) is storage only — `create/attach_evidence/mark_needs_review/approve/reject/supersede/record_promoted_episode_link` — and never creates episodes, writes `episode_embeddings`, calls an LLM, or auto-promotes.
- **Approval requires evidence AND a human actor; gates return explicit reasons, never silent.** `evidence_blockers` blocks `needs_review`/`approval` until calibration_evidence + no_lookahead_audit(passed=true) + non_event_context + features_snapshot + lineage + narrative are all present; approval additionally requires a non-empty `approval_actor`. A no-lookahead failure cannot be human-overridden; a `<2.0` non-event ratio blocks unless an audited `override_reason` is supplied (and that reason is written into the receipt).
- **Status machine is explicit and one-way at the ends.** `draft→needs_evidence→needs_review→approved→promoted` (terminal); `needs_review→rejected` (terminal — re-review needs a NEW candidate); `approved→superseded`. `approved→promoted` requires a `created_episode_id`. Illegal transitions raise `invalid_status_transition:<from>-><to>`.
- **Receipts must be immutable.** `promotion_receipts.append_receipt` never overwrites: the prior current receipt moves into `receipt_history` and `version` bumps. Evidence is fingerprinted with a canonical-JSON SHA-256 (`stable_hash`, sort_keys + tight separators) so a receipt is later verifiable without re-storing the payload; `None`/`{}` hash to the same stable sentinel so "missing evidence" is unambiguous.
- **C4 does not create episodes or embeddings.** `record_promoted_episode_link` only links an `episode_id` that ANOTHER ticket created and seals the receipt. The episode-creation + `episode_embeddings` write (still append-only, human-gated) belong to a later ticket; the `_search_analogs` retrieval contract stays the regression guard.

## History Rhymes Feature Store — promotion review surface (C5 design, 2026-06-18)

- **The review surface OPERATES the airlock; it adds no authority.** Every state change routes through the existing C4 service functions (`mark_needs_review`/`approve_candidate`/`reject_candidate`/`supersede_candidate`/`record_promoted_episode_link`), which already enforce the status machine, evidence gate, non-event coverage, and immutable receipts. The API/UI is a thin protected operator — it can never do anything C4 forbids, and it never creates episodes or writes `episode_embeddings`.
- **Blocked reasons must stay EXACT, never a generic "validation failed".** The surface displays C4's literal strings (`missing_calibration_evidence`, `no_lookahead_failed`, `insufficient_non_event_coverage`, `invalid_status_transition:<from>-><to>`, `missing_created_episode_id`, …). The blocked API response is HTTP 409 `{status, blocked_reasons[], candidate_id, current_status, allowed_actions[]}`.
- **A no-lookahead failure is non-overridable; a non-event-coverage shortfall is overridable but audited.** Leakage (`passed:false`) blocks approval with no human override. A `<2.0` non_event ratio blocks unless the reviewer supplies a `coverage_override_reason`, which is written into `non_event_context_json.override_reason` and surfaced in the receipt — visible, never silent.
- **Reuse the existing admin gate + namespace; don't invent one.** Protected internal routes follow `admin_prompt_receipts.py`: `require_authenticated_request` + `x-bm-platform-admin: true` (forwarded by the Next.js proxy), actor from `x-bm-actor`. HR routes live only under `/api/hr/v1/...`; the recommended family is `/api/hr/v1/promotion-candidates*`. Frontend = a new `HrSubNav` tab `promotions` + `repo-b/src/lib/historyrhymes/promotions.ts`, leaving `featureStore.ts`/`mlDemo.ts` frozen.
- **Audit lives in the receipt for now; the platform audit log needs a migration first.** `ai_decision_audit_log.decision_type` CHECK only allows `tool_call|response|classification|fast_path`, so a `promotion` audit type is blocked without a migration — keep promotion audit in the append-only receipt (actor/timestamp/status/evidence hashes) and defer audit-table integration to a later ticket (C7).

## History Rhymes Feature Store — protected promotion API (C6, 2026-06-18)

- **The API layer adds no authority — it delegates to the C4 service.** `backend/app/routes/hr_promotion_candidates.py` (`/api/hr/v1/promotion-candidates`) is a thin admin-gated wrapper; every transition calls `promotion_candidates.*` and never re-implements the status machine, gate, or coverage check. It creates no episodes, writes no `episode_embeddings`, calls no LLM.
- **Exact blocked reasons are part of the contract.** A `PromotionCandidateError` is caught and returned as HTTP 409 `{status:"blocked", blocked_reasons[], candidate_id, current_status, allowed_actions[]}` with C4's literal strings (`missing_calibration_evidence`, `no_lookahead_failed`, `invalid_status_transition:<from>-><to>`, `insufficient_non_event_coverage`, …). A test asserts no generic banner (`validation_failed`/`request_failed`/`not_allowed`) ever replaces them.
- **Reuse the existing admin gate exactly.** `require_authenticated_request` + `x-bm-platform-admin: true` (mirrors `admin_prompt_receipts.py`); the actor comes from `x-bm-actor`, never the client body — a missing actor on approve returns the C4 reason `missing_approval_actor`, not a generic 4xx.
- **`link-promoted-episode` only links an externally-created episode id.** It calls `record_promoted_episode_link`; it does not create the episode or its embedding. The coverage override flows through as `override_reason` and lands in the receipt.
- **Route tests: monkeypatch the module-level auth + repo factory.** The route calls `require_authenticated_request(request)` and `_repo_factory()` as module attributes, so a TestClient test patches `ROUTE.require_authenticated_request` (authenticated AuthContext) and `ROUTE._repo_factory` (in-memory fake) — no DB, no real auth middleware needed. The admin header is still required separately so the 403 path stays testable.

## History Rhymes Feature Store — promotion review UI (C7, 2026-06-18)

- **The UI operates the airlock; it never creates historical memory.** The promotions surface (`/lab/env/[envId]/historyrhymes/promotions`) calls ONLY the C6 `/api/hr/v1/promotion-candidates*` routes. No component creates an episode or writes `episode_embeddings`; `PromotedEpisodeLinkPanel`/the link action only record an externally-created `episode_id` and say so in copy. Avoid any "create episode automatically / generate with AI / write to analog library / promote instantly" language.
- **Preserve exact blocked reasons in the interface.** The client parses a 409 (FastAPI wraps the payload under `detail`) into a discriminated `{kind:"blocked"}` result and renders C4's literal strings (`missing_calibration_evidence`, `no_lookahead_failed`, `insufficient_non_event_coverage`, `invalid_status_transition:…`). A test asserts no generic "validation failed" replaces them. Transport errors stay a separate `{kind:"error"}` so a 500 never masquerades as a blocked-reason.
- **Gate actions on `allowed_actions` from the API, not local guesses.** The action bar enables a button only if its target status is in the candidate's `allowed_actions` (C6 derives it from the C4 status machine); approve is additionally disabled when `no_lookahead_audit_json.passed === false` (leakage is non-overridable). Reject/supersede/link stay disabled until their required reason/id field is filled.
- **Components are pure props; the shell owns fetch.** Panels take a `PromotionCandidate` and render — no fetching inside them — so vitest renders them with fixtures (no network). `PromotionReviewClient` does the fetch/select/refresh. This mirrors the Feature Foundry split and keeps tests fast and deterministic.
- **Don't dump raw JSON as the primary UI.** Evidence (features/lineage/calibration) lives in collapsible `<details>` drawers; the primary panels are structured (gate pass/fail, coverage dl, receipt version+hashes). Keep the cockpit readable.

## History Rhymes Feature Store — promotion audit integration (C8-A, 2026-06-18)

- **Platform audit SUPPLEMENTS the immutable candidate receipt; it doesn't replace it.** The C4 `promotion_receipt_json` stays the primary per-candidate receipt; C8-A adds an `ai_decision_audit_log` row per state-changing C6 action (success and blocked) for cross-domain governance. Two layers, neither authoritative over the other.
- **The audit layer adds no authority.** `promotion_audit.record_promotion_audit` only records what the C4 service already did or refused — it never changes status, approves, overrides coverage/no-lookahead, creates episodes, or writes embeddings. It runs AFTER the service call in the route.
- **Blocked actions are audit-worthy.** Both successful and blocked transitions write an audit row; the blocked row carries the exact `blocked_reasons` and `success=false`. The 409 envelope is unchanged except an additive `audit_status`; a blocked action is still a 409 with exact reasons.
- **CHECK widening must preserve every existing value.** The original `ai_decision_audit_log.decision_type` CHECK is INLINE/unnamed → Postgres auto-names it `<table>_<column>_check`. To widen: discover the constraint by `pg_get_constraintdef ILIKE '%decision_type%'` (don't assume the name), DROP it, re-ADD with ALL legacy values + the one new value. No wildcard, no table recreation; verify legacy survives in a DO block.
- **Audit failure must be visible, never silent.** The writer is best-effort (returns None on failure → `audit_status="failed"`); the route still returns the real service result but surfaces the failure so an approved action is never an unaudited silent success. `business_id` is NOT NULL on that table — a single-tenant `hr_` domain uses a documented sentinel UUID, not a fabricated tenant.

## History Rhymes Feature Store — approved-candidate→episode workflow (C9 design, 2026-06-18)

- **An approved candidate is NOT yet historical memory.** Only a human-authored `episodes` row joins the analog library, and it's searchable only after its `episode_embeddings` row exists. C9 designs the final stages: eligible approved candidate → reviewer-authored episode draft → field validation → episodes insert → embedding plan → embedding insert → C4 seal (`record_promoted_episode_link`) → receipt + C8-A audit → retrieval regression check.
- **Episode NOT NULL fields are human-authored, never auto-filled.** Verified `episodes` (434) requires `name`, `asset_class`, `start_date`, `macro_conditions_entering`, `catalyst_trigger`, `timeline_narrative`. The `proposed_*` candidate fields PRE-FILL the form; a reviewer confirms/edits. An empty/whitespace/placeholder value blocks with an exact per-field reason (`missing_macro_conditions_entering`, …) — no `"TBD"`/`"Unknown"`/LLM-generated text.
- **Embedding creation is what makes an episode searchable — assert it only then.** `episode_embeddings` already supports versioning via `UNIQUE(episode_id, embedding_type, model_version)` with `vector(256)`, so no schema change is needed; writes are append-only `ON CONFLICT DO NOTHING`, `embedding_type='full_state'` to preserve the retrieval contract. Recommended boundary: Option C (episode now, embedding async with a visible `embedding_pending`/`embedding_failed` state) when embedding may be slow/fail; else Option A (two-step, episode then embedding) — never Option B (atomic) that discards a human-authored episode on a transient embedding error. Episode creation and embedding creation are separately confirmed.
- **`episodes` has no origin column — documented gap, not a hack.** It has `source VARCHAR(50) DEFAULT 'manual'` (set `'promotion'`) but no `candidate_id`/`observation_id` column. Until a later schema ticket (C11) adds `origin_candidate_id`/`origin_json`, keep origin in the candidate `promotion_receipt_json` (`created_episode_id`) + the C8-A audit. Don't invent an `episodes` column in design or stuff origin into a narrative field.
- **The retrieval contract is the regression guard.** `_search_analogs` (`episode_embeddings JOIN episodes WHERE embedding_type='full_state'`) stays unchanged; a promoted episode appears only after BOTH the episode row and its full_state embedding exist; observation embeddings are never searched as episodes; Feature Foundry stays read-only wrt promotion.

## History Rhymes Feature Store — approved-candidate episode creation API (C10, 2026-06-18)

- **Creating an episode is NOT making it searchable.** C10's `create-episode` inserts one `episodes` row and returns `{searchable:false, embedding_status:"not_created", next_required_step:"create_episode_embedding"}`. The episode is reviewed historical memory but won't appear in `_search_analogs` until a later `episode_embeddings` (full_state) row exists. Never imply searchability before the embedding.
- **Human-authored episode fields are mandatory; placeholders are blocked.** The verified `episodes` NOT NULL set (`name`/`asset_class`/`start_date`/`macro_conditions_entering`/`catalyst_trigger`/`timeline_narrative`) must come from the reviewer payload (candidate `proposed_*` only PRE-FILL defaults, never invent). Missing OR placeholder values (`tbd`/`unknown`/`n/a`/`auto-generated`/…) → exact per-field `missing_<field>` reasons, all returned together; no LLM drafting.
- **Episode creation and embedding/seal stay separate explicit steps.** C10's service never calls `encode_state_vector`, never writes `episode_embeddings`, never calls `record_promoted_episode_link`, and never changes the candidate's `approval_status`. Scope-guard tests check for the CALL form (`record_promoted_episode_link(` / `encode_state_vector(`) so a docstring mention doesn't trip them.
- **Eligibility carries the C4 gate forward.** `eligibility_blockers` reuses `promotion_candidates.evidence_blockers` so a candidate that lost calibration/no-lookahead/non-event evidence can't create an episode even if `approved`. Non-approved statuses map to specific reasons (`candidate_not_approved`/`_rejected`/`_superseded`/`_already_promoted`).
- **Origin lives in audit/response until C11.** Set `episodes.source='promotion'`; keep the originating `candidate_id` in the C8-A audit payload + the create response — do NOT add an `episodes` origin column in C10 (the C9-documented gap is a separate schema ticket).

## History Rhymes Feature Store — episodes promotion-origin columns (C11, 2026-06-19)

- **Carry promotion origin on the episodes row, additively.** Migration 10023 adds nullable `origin_candidate_id`/`origin_observation_id`/`origin_model_obs_version`/`origin_embedding_model_version`/`origin_receipt_hash`/`origin_metadata_json jsonb` to `episodes` (no backfill, no `episode_embeddings` touch, COMMENTs + verify block). `episodes.source` already existed → set `'promotion'`. C10's `build_episode_preview` now attaches these via `build_origin_fields(candidate)` (receipt hash via the C8-A `stable_hash`).
- **Write origin only if the migration is in place — fail soft otherwise.** `DbEpisodeRepository.insert_episode` tries the full insert; on a `column "origin_..." does not exist` error it retries WITHOUT the origin columns (origin still lives in audit/response, exactly as pre-C11). This lets the code ship before the migration is applied without breaking episode creation. Cast `origin_metadata_json` with `::jsonb`.
- **C10 behavior unchanged by C11.** Creating an episode still returns `searchable:false` / `embedding_status:"not_created"`; origin columns don't make it searchable — only a C12 `episode_embeddings` row does.

## History Rhymes Feature Store — explicit episode-embedding creation (C12, 2026-06-19)

- **Embedding creation is the ONLY step that makes a promoted episode searchable.** C12 `create-episode-embedding` writes one append-only `episode_embeddings` row (`embedding_type='full_state'`, vector(256), `model_version`) for a real `episode_id`; success returns `searchable:true` + `next_required_step:"seal_promoted_candidate"`. C10 episode creation stays `searchable:false`. Never automatic — admin + actor + `confirm:true` required.
- **Validate the candidate↔episode relationship via the C11 origin link.** The episode's `origin_candidate_id` must equal the candidate (or fall back to the candidate's `created_episode_id` when origin is null pre-C11), else `episode_not_created_from_candidate`. Plus: approved candidate, 256-dim vector (`embedding_dimension_mismatch`), and dedup (`episode_embedding_duplicate`).
- **Append-only, never overwrite.** Insert is `ON CONFLICT (episode_id, embedding_type, model_version) DO NOTHING RETURNING id`; a None return means a row already existed → surface `episode_embedding_duplicate`, don't pretend success. The schema already versions by `model_version`, so a new encoder makes a new row.
- **C12 does NOT seal.** The embedding service never calls `record_promoted_episode_link`/changes candidate status (sealing is C13). It uses the existing retrieval contract constants (`full_state`/256) so `_search_analogs` is unchanged.

## History Rhymes Feature Store — seal promoted episode (C13, 2026-06-19)

- **Sealing is the final, terminal step; it delegates the state change to C4.** C13 `seal-promoted-episode` pre-checks the episode + its full_state embedding exist (never seal a non-searchable promotion → `episode_embedding_missing`/`episode_not_found`), then calls the C4 `record_promoted_episode_link` so the status machine (approved→promoted, created_episode_id required, promoted terminal) + immutable receipt advance stay the single source of truth. C13 adds no new authority and writes no episode/embedding.
- **The seal repo must satisfy the C4 CandidateRepository contract** (`get`/`update`/`existing_model_versions`/`insert_episode_embeddings`) because `record_promoted_episode_link` runs against the SAME repo object — plus the C13 existence checks (`episode_exists`/`embedding_exists`). In tests, one fake repo implements both and asserts `embedding_writes==0`.
- **Receipt history is preserved across the seal.** After seal, `promotion_receipt_json.version==2` with the prior v1 approval receipt in `receipt_history` (C4 `append_receipt`). A second seal sees `promoted` and blocks `candidate_already_promoted` — terminal.

## History Rhymes Feature Store — promotion workflow UI wiring (C14, 2026-06-19)

- **One panel, three explicit confirmed steps, honest searchability.** `EpisodePromotionPanel` (in the C7 detail) drives create-episode → create-embedding → seal, each its own confirmed action mapping to the C10/C12/C13 routes. The searchability badge reads `no episode yet` → `episode created · not searchable` → `searchable` → `promoted · searchable`; the seal button is disabled until the embedding exists. Only enabled for an `approved` candidate. No placeholders, no AI-generated narrative, no Feature-Foundry/feature-store client calls (FF stays read-only wrt promotion).
- **Mock the client module, not fetch, for workflow UI tests.** `vi.mock("@/lib/historyrhymes/promotions", …)` with `{...actual, createEpisode: vi.fn(), …}` lets component tests drive the create→embed→seal sequence and assert exact blocked reasons + the searchability badge transitions without a network. A static fs read of the panel source guards against `openai`/`anthropic`/`featurefoundry`/`featurestore` imports.
- **Thread an `onChanged` refresh from the client shell into the detail.** New workflow actions need the queue+detail to reload after an `ok` result; `PromotionCandidateDetail` takes an optional `onChanged` that `PromotionReviewClient` wires to its existing `refresh`.

## History Rhymes Feature Store — promotion workflow e2e smoke (C15, 2026-06-19)

- **One in-memory `WorldRepo` proves the whole protected flow.** A single fake implementing the C4/C10/C12/C13 repo contracts (candidate store + episodes dict + embeddings set) lets a TestClient walk approve → validate → create-episode → create-embedding → seal through the real routes, asserting the order invariants: no embedding before an episode (`episode_not_found`), `searchable:false` after episode creation, no seal before the embedding (`episode_embedding_missing`), `promoted` terminal, and audit rows at each step. No DB/network.
- **The safety invariants are the test, not a comment.** Each is an explicit assertion: confirm required on every write step; admin required on all workflow routes; the episode row carries `origin_candidate_id`/`source='promotion'` (C11); the retrieval-contract constants stay `full_state`/256; and `featureStore.ts` (Feature Foundry) contains no `promotion-candidates`/`create-episode`/`seal-promoted` calls → FF stays read-only wrt promotion.

### AI dispatch Gemma runtime toggle + controlled fallback (frontend on/off, gpt-5-mini default) (2026-06-19)

"Deploy on demand, frontend toggle, fall back when off" implemented WITHOUT a persistent GPU bill: (1) **Runtime toggle** = a module-level flag (`ai_dispatch/runtime.py`, lazy-init from `AI_DISPATCH_GEMMA_ENABLED`, flipped via `POST /api/ai/dispatch/config`) — process-local, resets to the env default on restart (safe: a restart can't leave Gemma silently on). For a durable toggle, back it with a DB row later. (2) **Controlled fallback** lives in `supervisor.run_dispatch`, NOT in `policy.select_provider` (keeps routing pure): for a *Gemma-home* mode (Gemma is `_PREFERENCE[mode][0]`), if `gemma_enabled() AND registry.available(GEMMA)` is false, dispatch to the small frontier model (`AI_DISPATCH_FALLBACK_MODEL`=gpt-5-mini on OpenAI) and mark `fallback_used=True` + `rejected[gemma_gcp]=gemma_disabled|gemma_unavailable`. **Recorded, never silent.** A **forced** Gemma request skips the fallback (honored literally → fails closed). Validate the fallback target with `select_provider(req.model_copy(update={forced_provider: fb}))` so it still respects risk/privacy ceilings; if the target isn't eligible/available, fall through to normal routing (fails closed). (3) **This flips the old "no silent fallback" tests** for Gemma-home modes — they now fall back; update them to assert `fallback_used=True` + Gemma-never-called instead of UNAVAILABLE. The no-silent-fallback invariant still holds for FORCED requests and the general `allow_fallback=False` path. (4) **Frontend**: the read-only GET-only proxy now allows POST for **`config` only** (allowlist `new Set(["config"])`) so the admin toggle works but the UI still can't POST `/run`/`/route`. The console's "no buttons" read-only test becomes "the only control is the toggle" (`getAllByRole("button")` length 1). (5) Test gotcha: a `gpt-5-mini` string appears in BOTH the OpenAI provider row and the fallback disclosure — use `getAllByText`, not `getByText`.

### Convert a static surface to a real "evaluate & recommend" backend via the analyzer, not a new mapping layer (2026-06-19)

The Spike Inspector shipped on static `DEMO_SPIKES`. The honest conversion was NOT a new `/spikes`
service that re-maps `tel_*` rows into a bespoke taxonomy — that just relocates the fabrication risk.
The telemetry **analyzer** (`backend/app/services/telemetry_analyzer.py`, `AnalyzerFinding` contract)
already turns the seeded serving reads (monitoring/model_performance) into rule-based-severity findings
with `null_reasons`. So the conversion was: (1) a **thin pass-through route** `GET /api/telemetry/findings`
that delegates to the analyzer and adds a provenance block, adding zero numbers of its own; (2) delete
`DEMO_SPIKES`/`ACTION_CATALOG` entirely; (3) render real findings, fail closed on each `null_reason`.
Reusable rules discovered:
- **Auth/proxy gotcha:** the analyzer's own route `POST /api/ade/analyze/telemetry` requires
  `require_authenticated_request`, but the `/api/ade/[...path]` proxy forwards only Content-Type +
  x-bm-request-id (drops cookies) — a browser call 401s. The `/api/telemetry/[...path]` serving routes
  are `business_id`-scoped and reachable. So expose analyzer output through a telemetry-router route
  rather than calling `/api/ade` from the browser. Check proxy header forwarding before wiring.
- **Provenance panel = regression tripwire.** A visible "Data Source Audit" block (surface · mode ·
  source · tenant · rows evaluated · last refresh · fallback used: NO), backed by a `provenance` field
  on the response, makes a silent slide back to static data obvious in one glance.
- **Empty-state wording is a correctness claim.** "No active telemetry findings." (factual) ≠ "No
  findings detected." (implies comprehensive observation). Use the former.
- **Don't fabricate fields the contract lacks.** `AnalyzerFinding` has no `risk_level`/`requires_human_gate`;
  derive the human gate from `severity` as a *documented UI rule*, never as a fake backend field.
- Verify the tenant is actually seeded before claiming "real" (read-only count): telemetry-demo had
  59,898 predictions / 104 drift / 102 anomaly events / 6 model runs — so the analyzer yields findings
  rather than fail-closed-everywhere.

### The Winston merge gate (scripts/winston/merge_gate.ps1) and its self-reference traps (2026-06-19)

`scripts/winston/merge_gate.ps1` is a local pre-PR sanity gate (dirty state, mass deletions, skip-marker
adds, route/nav integrity, schema readiness, secret-shaped content, CI). A local `.git/hooks/pre-push`
runs it with `-SkipCI`. Two traps that cost real time:

- **Parse/run it via native PowerShell, never through Git Bash.** Invoking it as `powershell -File …`
  from the Bash tool (or a Bash heredoc with escaped `$`) mangles the command/encoding and produces a
  bogus "parse error" / `ERRORS: 1`. The script is valid UTF-8-with-BOM and parses clean; confirm with
  `[System.Management.Automation.Language.Parser]::ParseFile(path,[ref]$null,[ref]$errs)` in PowerShell.
- **Exclude the gate from its own skip-marker diff.** Pattern definitions can look like new test
  annotations. The checker now diffs the branch while excluding
  `scripts/winston/merge_gate.ps1`; keep that exclusion when adding patterns. Test-skip matching also
  uses word boundaries so Python process exits are not mistaken for JavaScript disabled-test shorthand.
- **It lives only when present in the worktree.** It is referenced by `<toplevel>/scripts/winston/...`,
  so a branch/worktree cut from a base that lacks the file makes the hook fail file-not-found. Keeping it
  tracked on `main` is what lets the hook run from any worktree.

### Executable AI routes need auth AND tenant — `require_authenticated_request` is not enough (2026-06-19)

A cost-bearing route (`POST /api/ai/dispatch/run`) that only called `require_authenticated_request` executed real model calls for **tenantless** callers, then degraded the receipt (no `business_id`). Root cause: the MCP auth dev-bypass in `mcp_provider.py` — `authenticated = bool(token == MCP_API_TOKEN) if MCP_API_TOKEN else True`. **When `MCP_API_TOKEN` is unset (prod), every header-less request is authenticated as `roles=["admin"], business_id=None`.** So "authenticated" ≠ "has a tenant." Lessons:
- **For any route that calls a paid provider or writes a tenant-scoped row, gate on tenant, not just auth.** Add a `require_tenant_context(request)` = `require_authenticated_request` + `if not auth.business_id: raise 403`. Put it **first** in the handler so no routing / adapter / fallback / receipt runs before it (401 unauth, 403 authed-but-tenantless).
- **A degraded receipt with `receipt_write_failed` for missing `business_id` is a symptom of a missing auth gate, not a receipt bug.** Fix the gate; the receipt path was fine.
- **Take `business_id` from the auth context, never the request body** — a client-supplied tenant must be overridden (`model_copy(update={"business_id": auth.business_id})`).
- **Testing the gate deterministically:** monkeypatch `app.auth.platform.get_request_auth` to return a crafted `AuthContext` (anonymous / authed-no-tenant / authed-with-tenant) — both `require_authenticated_request` and `require_tenant_context` resolve it by module global, so the real gate logic runs. **Spy on `run_dispatch`** (`monkeypatch.setattr("app.routes.ai_dispatch.run_dispatch", spy)`); a blocked request asserting `spy == []` proves *no provider call happened* — much stronger than asserting a status code. Add one header-less end-to-end test through the real middleware asserting `status in (401, 403)` (robust to whatever `MCP_API_TOKEN` state CI runs with).
- The route flag (`AI_DISPATCH_ENABLED`) and the auth+tenant gate are **independent** layers — keep both, and keep the auth+tenant check before the flag so unauth fails 401 even when execution is enabled.
- **Follow-up worth filing:** the global `MCP_API_TOKEN`-unset dev-bypass is a platform-wide leak (every authed route trusts header-less requests as admin); requiring a real token in prod is a separate, broader change than per-route tenant gating.

### The 83-file deletion set is local-only WIP — inspect origin/main, not the dirty checkout (2026-06-19)

The `feat/hr-ml-algorithm-decision-lab` checkout carries a large uncommitted deletion set (RUL Calibration
screen + notebooks, ADE/audit-dashboard/workflow-registry, telemetry-trust/calibration plans — 100s of
files). **None of it is merged.** `origin/main` has always had the calibration page/component/evidence dep
and its `telemetryNav.ts` entry, and the route renders — there was never a dangling-nav 404 on main. Lesson:
judge "what the app has" from `origin/main` (`git show origin/main:<path>` / `git grep … origin/main`), never
from the working tree of an active feature branch. A "gap" the plan flagged may already be closed (or never
existed) on main — the telemetry How-It-Works exhibit (`repo-b/src/components/telemetry/howItWorksData.ts`:
`MCP_REGISTRY_HEADER`, `GOVERNED_KPI_NOTE`) already encodes the honest platform-vs-telemetry framing
(telemetry MCP = Partial/inline allow-list; copilot = grounded structured-evidence Q&A, not document RAG),
so reuse/extend it rather than re-stating.

## HappyCo proof package — landing-page polish lessons

- External proof packages should avoid interview-specific language. "Recruiter", "candidate", "please hire", and similar tells make the package read as a one-time interview artifact rather than a portable demonstration of an operating stack. Frame around the durable thing (the stack) and present the use case (here: HappyCo property ops) as the applied surface, not the subject.
- Local fallback ML bundles should read as **validated contract states**, not failed live runs. When the live training/scoring run is blocked, surface the prior receipt-backed run separately (job ID, run ID, allowed claim) and label the current local bundle explicitly as "Local fallback export — validates the site contract; live run replaces it after interactive auth." A single panel that only reads `local_fallback` looks broken; two stacked cards split the story cleanly.
- Duplicate "implementation view" routes should not be primary external CTAs. If a route is login-gated implementation evidence (the operator demo behind `/lab/env/.../operator/...`), don't link it from a public proof package header — it makes the package look like a sales tour into internal tooling. Keep external CTAs to gated demo + artifacts + evidence pages.
- Artifact hubs must distinguish available downloads from local/private pending files. The only allowed status phrases for non-downloadable artifacts are "Available in local proof package" (file exists on the builder's filesystem) or "Pending gated upload" (does not exist). Never render a "Download" affordance unless the gated API actually streams the file; vague "Generated local" + a button is the dishonest middle ground.

### ADE Ops PR 6A: the watcher closes the loop by recommending, never acting — and absence of signal is not success (2026-06-18)

PR 6A adds the post-change watcher (`watcher.py`) that evaluates an executed change (simulated 5B or real non-prod 5C) during its observation window and returns one of five verdicts: accepted / still_observing / degraded / rollback_recommended / insufficient_evidence. Two design rules carry the trust: (1) **absence of signal is not success** — missing observation evidence returns `insufficient_evidence` (window closed) or `still_observing` (window open), NEVER `accepted`; a good signal while the window is still open also stays `still_observing` (no early victory). (2) **rollback_recommended is an artifact, not an action** — the watcher reads only and recommends only; it never sets rolled_back, never calls the executor, and a docstring-stripped module scan asserts no execution token (execute_auto_suspend/client.execute/subprocess/snowflake.connector). Verdict logic order matters: check failed/stale telemetry → degraded FIRST (don't wait out the window on a known-bad signal), then missing evidence, then the expected-vs-observed comparison with a tolerance band (within ±10% = stable = accepted). Window parsing is forgiving: `parse_window_seconds` reads '14-day'/'6 hours'/'30m' and falls back to a 14-day default for fuzzy strings like 'next 3 refresh cycles' (don't fail closed on an unparseable human window — you'd never accept anything). The `GET /approvals/watch` state endpoint evaluates executed approvals with NO injected observation, so it honestly shows still_observing/insufficient_evidence until real telemetry is wired — accepted/degraded/rollback_recommended only appear via `POST .../watch` with evidence, or once a provider-read feeds observations. Keep auto-rollback OUT of the watcher: it's a later explicit decision (PR 6B is the incident state machine, not auto-rollback).

### ADE Ops PR 6B: incidents are governed records, decoupled from the watcher, with a DB-enforced no-silent-close (2026-06-19)

PR 6B turns failed/stale/degraded/rollback_recommended outcomes into incident records (`ade_ops_incidents`, migration 617, RLS) with a state machine: detected → triaged → owner_notified → mitigation_planned → resolved → closed. Three design choices worth keeping: (1) **Decouple from the watcher** — `incidents.open_from_verdict(verdict=…, evidence=…)` takes the verdict as a plain string + evidence list, NOT a `watcher.py` import. PR 6A (watcher) was unmerged and stuck behind a CI outage; decoupling let 6B branch off main and merge in any order instead of stacking. When a downstream PR only needs an upstream PR's *output shape*, pass the shape as data, don't import the module. (2) **No silent close, enforced twice** — `transition()` raises `resolution_note_required`/`evidence_required_to_close`, AND the table has `CHECK (state <> 'closed' OR (resolution_note IS NOT NULL AND jsonb_array_length(evidence) > 0))` so even a direct SQL write can't close an incident without a paper trail (verified via Supabase CLI: a bare `closed` insert raises 23514). (3) **Validated transition map** — a `dict[State, set[State]]` allows only forward moves; closed has an empty successor set so incidents can't reopen (open a new one instead). Module-scan test asserts no provider-execution token (incidents never roll back). Migration sequence: 614(5A)→615(5B)→616(5C)→617(6B).

### Collapsible `<details>` + interactive Flow Explorer: jsdom vs real-browser, and Playwright text-match traps (2026-06-19)

Building the telemetry "How This Works" Flow Explorer v2 (an interactive scenario trace board over the static exhibit) surfaced reusable UI lessons:

- **`<details>` collapse is test-safe in vitest/jsdom but NOT in Playwright.** Wrapping content in a `<details>` collapsed-by-default keeps existing `getByText`/`getByRole` unit assertions GREEN because **jsdom does not apply the `<details>` UA `display:none`** to closed-summary siblings → testing-library still sees them as accessible. In a REAL browser (Playwright), closed `<details>` children ARE `display:none` → `toBeVisible()`/`scrollIntoViewIfNeeded()`/`getByRole` (accessibility-filtered) on them FAIL. Fix the e2e by **expanding the `<summary>` first** (`page.locator("summary").filter({ hasText: /…/i }).click()`) — preserves the assertion's substance without weakening it. This let us honor "collapse the ledger by default" while keeping the 6 existing unit tests byte-for-byte.
- **Playwright `getByText` is SUBSTRING by default; testing-library `getByText` is EXACT by default.** A "Static trace" badge plus a caption that *starts* "Static trace — …" → the unit test (exact) sees 1, Playwright (substring) sees 2 → strict-mode violation. Use `page.getByText("…", { exact: true })` or target the specific element.
- **`getByText(/X/)` matches both a `<summary>` and its parent `<details>`** (the `<details>` `textContent` includes the summary's text). Target `page.locator("summary")` (filtered) rather than the text, or use `.first()` deliberately.
- **For interactive controls, do NOT use `ResponsiveSwap`** (`repo-b/src/components/telemetry/primitives.tsx` — it renders BOTH mobile+desktop branches into the DOM). Duplicated clickable buttons = accessibility + strict-mode test traps. Use single-DOM CSS reflow instead: `SplitGrid` + a literal responsive grid class string (`"grid grid-cols-1 gap-3 lg:grid-cols-6"`) — controls render once, stack on mobile, no duplication, and the new tests can use singular queries.
- **Subtle motion with zero deps + hydration-safe:** a constant inline `<style>` block gated by `@media (prefers-reduced-motion: no-preference)` for a staggered reveal (CSS keyframes + `animation-delay: calc(var(--fx-i,0)*40ms)`), plus inline `transition` for selection glow/dim. **Never `window.matchMedia`** (the vitest setup lacks it). Apply the reveal animation only where it won't fight an inline `opacity` (e.g. trace lines, not the dimmed lane cards — `animation-fill-mode: both` would override the inline dim).

### Telemetry metadata and lineage conventions (2026-06-12)

- Telemetry storage definitions are split across `repo-b/db/schema/10006_telemetry_serving.sql`
  through the later `10009`-`10016` telemetry/factory migrations, Databricks assets under
  `telemetry-platform/databricks/`, deterministic seed definitions under `rs_factory_seed/`, Factory
  ML exports under `skills/rs-factory-ml/` and `repo-b/public/labs/factory-ml/`, and Stargate
  contracts under `infra/confluent/stargate/` plus `scripts/streaming/stargate/`. Do not infer a
  complete platform schema from any one directory.
- The lab route `envId` and the telemetry serving scope are intentionally different concepts.
  Authorization uses `/lab/env/[envId]`; telemetry reads currently use the configured
  `TELEMETRY_SERVING_ENV_ID` (`telemetry-demo` by default). Metadata UI and API proxy code must keep
  those values separate and visible.
- Metadata discovery is reviewed and allowlisted, not dynamic. Keep committed objects in
  `backend/app/data/telemetry/metadata_catalog.json`; validate source references, duplicate object
  definitions, edge uniqueness, dangling references, and disconnected nodes before serving.
- Safe Postgres enrichment uses one static query over catalog-listed `tel_*` objects. Never construct
  identifiers or SQL from the client/catalog, and treat enrichment failure as sanitized `partial`
  status while preserving the valid base graph.
- `@xyflow/react` is already installed. Stable telemetry graphs work best with deterministic layer
  columns, non-draggable nodes, explicit edge IDs, `strokeDasharray` for inferred edges, and a generic
  reverse-edge traversal for metric/gold trace highlighting.
- Scoped telemetry reviewer sessions are DB-free. The login field must accept the non-email reviewer
  username, and `/api/auth/me` must return the signed reviewer membership without attempting UUID/DB
  rehydration.
- `next start` sets secure cookies, so authenticated HTTP localhost evidence should use `next dev`
  after the production build has been verified separately. Clear only the worktree `.next` directory
  when switching modes if stale dev asset 404s appear.

## Winston Plan Relay (`skills/winston-plan-relay/`)

Use the relay when starting a non-trivial Claude Code or Codex session and you want the agent to get a tight, repo-grounded prompt instead of a vague brief.

- **Dry-run only in Ticket 1.** `relay.py` always requires `--dry-run`. It assembles the prompt bundle and a sibling `<out>.receipt.md`; you paste the bundle into the target agent yourself. Subprocess invocation of Claude CLI / Codex CLI is intentionally deferred to Ticket 2 — don't build it until Ticket 1 has earned its keep on a real plan.
- **Suggested-not-written plan filenames.** `--mode route-and-plan` scans `docs/plans/03-implementation-plans/active/` and proposes the next `NNNN-` number in the bundle and receipt. It never writes the active plan file — the user copies the drafted plan into place. This is the right default because the relay can suggest the wrong environment slug, and you want a human in that loop.
- **Risks are flagged from the input, not the bundle.** The receipt's "Risks / assumptions flagged" section is computed in `flag_risks()` from a few cheap heuristics (missing "acceptance criteria" / "verification" / "environment" strings, very short inputs). Extend that function when a new recurring relay smell shows up — don't rely on the downstream agent to catch it.
- **The relay's repo-root check is portable on purpose.** It accepts any of `CLAUDE.md`, `AGENTS.md`, or `.git/` as proof of repo root, and `--allow-missing-context` further relaxes both repo-root and required-context-files checks. This means you can dry-run the relay against a non-Winston repo for prompt-shape testing; do not interpret a successful run there as a passing Winston review.
- **Prompt fragments are the unit of change.** When the system invariants or mode-specific instructions need updating, edit `skills/winston-plan-relay/prompts/*.md` directly. `relay.py` reads them at runtime; no code change needed.
- **Embedding markdown inside markdown needs a dynamic fence.** A plain ```` ```markdown ```` wrapper around an input file is closed prematurely by the first 3-backtick fence inside that file — Winston plans are full of ```` ```yaml ````/```` ```json ```` blocks, so this always breaks. `fence_for()` scans the input for the longest backtick run and returns a fence one tick longer (min 3); the relay uses 4-tick fences for plan inputs. Any tool that nests user-supplied markdown inside an outer markdown document needs this — don't hardcode 3.
- **A relay/handoff prompt must be imperative, not descriptive.** Ticket 1's `plan_review.md` and `implementation_handoff.md` *described* what a good review/handoff contains; the receiving agent then produced descriptions back instead of doing the work. Fix: prompt fragments must command exact output ("produce exactly these sections", "write the handoff prompt now"), and the bundle carries a `## Your task` header stating the imperative up front. A pile of correct context is not a prompt — the instruction to act on it is the prompt.
- **Substring risk heuristics false-positive on well-shaped plans.** The relay first flagged "no acceptance criteria" on a plan that defined exit codes, status enums, and a `## Verification` section — it just never used the literal phrase. `flag_risks()` now checks for *evidence shapes* (canonical row labels, `exit code`, a `## Verification` heading) before flagging. When a heuristic searches for a phrase, also accept the structural equivalents of that phrase.
- **`subprocess.run(..., text=True)` on Windows encodes pipes as cp1252, not UTF-8.** Feeding the relay bundle (which contains ✓/✗, U+2713/U+2717) to the `claude` CLI via stdin crashed with `UnicodeEncodeError: 'charmap' codec`. Fix: always pass `encoding="utf-8", errors="replace"` to `subprocess.run` when piping non-ASCII text on Windows. `text=True` alone is not enough — it picks `locale.getpreferredencoding()`, which is cp1252 on a US Windows box.
- **Reviewer-CLI adapters must fail loud, never silent.** The relay's adapter path: detect the CLI with `shutil.which()` before invoking; a missing CLI raises `AdapterUnavailable` carrying the attempted command + a `--dry-run` fallback, and the relay exits 3. A non-zero reviewer exit fails the relay (exit 1) with the receipt marked FAILURE and a stderr excerpt. The `claude --print` / `codex exec -` commands are kept minimal — no unsupported flags assumed. The exact prompt is always preserved at `<out>.bundle.md` so an adapter failure is debuggable.
- **`git worktree add` on Windows overflows MAX_PATH unless the worktree name is short.** The repo has ~200-char file paths under `verification/receipts/phase3b-rerun-*/`. Nesting them under a worktree path like `Consulting_app_sessions/session-0002-novendor-daily-operator-control-plane-<ts>/` blew past the 260-char limit — the checkout failed half-done with "Filename too long" + "Could not reset index file". Fix: name worktrees `session-<plan-number>-<ts>` (just the leading `NNNN`, not the full plan stem) and create with `git -c core.longpaths=true worktree add`. A failed `worktree add -b` still leaves the branch behind — clean up with `git worktree prune` then `git branch -D`.
- **A review run needs no worktree; isolation is for coding.** `session.py` (Ticket 3A) makes `--worktree` opt-in: a plan-review is text-in/text-out and edits nothing, so a full second 5759-file checkout per review is pure overhead. Worktree isolation becomes mandatory only in Ticket 3B where the agent actually edits files. Don't reflexively isolate read-only work.
- **A worktree clean-check should ignore untracked files.** `git status --porcelain` flags untracked files as dirty, but untracked files neither block `git worktree add` nor get carried into the new worktree. Use `git status --porcelain --untracked-files=no` for the "is the base clean enough to branch a worktree" preflight — otherwise unrelated scratch files block every session.

## Outlook MCP — multi-account search and attachment staging

The local Outlook MCP server (`mcp-servers/outlook-mcp/server.py`) talks to Classic Outlook over COM. Two lessons from wiring up the `info@novendor.ai` document workflow:

**Search the right mailbox.** A COM `MAPI` namespace exposes `GetDefaultFolder(...)` for the *default* account only. When the profile has more than one account, the default-folder path silently searches the wrong inbox. `outlook_search_mail` now takes an `account` argument: omitted, it keeps the default behavior; set, it resolves the store by iterating `namespace.Folders` and matching the store name, and **fails closed** (raises, lists available mailboxes) if there is no match — it never falls back to the default inbox. Always pass `account` when the user names a mailbox.

**Stage attachments, do not file in place.** `outlook_save_attachments` writes extracted files to `.local/outlook-wincom/attachments/` (repo-ignored — `.local/` is in `.gitignore`). It requires `confirm_save: true`, sanitizes filenames (strips path components + illegal chars), never overwrites (`' (n)'` suffix), and never marks read / moves / deletes the source mail. Filing staged documents into Google Drive or another destination is a separate follow-up step — keep extraction and filing decoupled.

**Testing FastMCP tools without COM.** `@mcp.tool(...)` returns the original function, so decorated tools are directly callable in tests. Keep COM-touching logic in small helpers (`resolve_mail_folder`, `resolve_message`, `sanitize_filename`, `unique_path`) that take a namespace/path argument — they unit-test cleanly against a mocked COM object tree, no Outlook or pywin32 required. Gates that short-circuit before COM (like `confirm_save`) are testable directly.

**PowerShell registration scripts — keep Python `-c` probes quote-clean.** When a `.ps1` invokes `py.exe -c "<snippet>"`, PowerShell's native-command argument handling mangles embedded double-quotes and `%`. A probe like `print("%d.%d" % sys.version_info[:2])` reaches Python broken — it fails with `SyntaxError: File "<string>", line 1`. Fix: store each snippet in a variable and pass the variable as the argument (`& $py -c $snippet`), and write the snippet with no embedded double-quotes, no `%` formatting, and no slice syntax — e.g. `import platform; print(platform.python_version())` rather than `print("%d.%d" % sys.version_info[:2])`.

## Skills framework v1 (2026-05-20) — `skills/<domain>/<skill-name>/` layout

CLI-runnable skills that ingest deal materials and produce deterministic institutional artifacts (xlsx, md, json) follow the v1 contract at `docs/plans/01-shared-standards/skills-framework/charter.md`. Proving stub: `skills/repe/lbo-model/`. Template: `skills/_templates/skill-template/` (plural `_templates`).

**Standard.** `SKILL.md` with YAML frontmatter (`runtime`, `entrypoint`, `inputs_contract`, `outputs_contract`, `deterministic`, `ai_dependency`, `db_dependency`, `network_dependency`) + `scripts/runner.py` + `examples/manifest.example.json` + `tests/test_runner_smoke.py`. No `__init__.py` in `tests/` — see pytest gotcha below.

**CLI shape.** `runner.py --manifest <path> [--output-dir <path>] [--dry-run] [--strict] [--run-id <uuid>]`.

**Status enum (8).** `completed`, `completed_with_warnings`, `dry_run_ok`, `failed_invalid_manifest`, `failed_missing_inputs`, `failed_validation`, `failed_io`, `failed_runtime`. **Exit codes:** 0 = completed/completed_with_warnings/dry_run_ok; 1 = failed_runtime; 2 = failed_invalid_manifest OR failed_validation; 3 = failed_missing_inputs; 4 = failed_io. No ad-hoc statuses.

**Receipt.** Every run writes `run_receipt.json` even on failure (best-effort to `output_dir`; on IO failure, falls back to `./run_receipt.<timestamp>.json` in CWD). Schema `receipt.v1`: `manifest_hash` (canonicalized sorted-key JSON), per-input sha256 + bytes, per-artifact sha256 + bytes, per-stage timings, host metadata.

**Stage order matters.** Prepare `output_dir` **before** semantic/input validation. Otherwise a missing-input failure leaves the receipt falling back to CWD instead of landing in `output_dir` — which breaks the contract's "on any failure status, only `run_receipt.json` is written" rule (which implies *to the output_dir*). The canonical order: `load_manifest → validate_manifest (schema) → prepare_output_dir → validate_semantics → validate_inputs → build_*`. Initial implementations got this wrong; the smoke test caught it.

**Audit banner on every non-receipt artifact.** Keys: `skill`, `skill_version`, `artifact_contract`, `run_id`, `generated_at`, `manifest_hash`. xlsx: first 6 rows of the first (or dedicated `Audit`) sheet. md: first HTML comment block. Lets artifacts stay identifiable when detached from the receipt.

**stdout/stderr discipline.** stdout = exactly one JSON line on completion: `{"status":"…","receipt_path":"…","run_id":"…"}`. All logs to stderr with `[<skill-name>] ` prefix. Downstream callers parse the last stdout line.

**Hard constraints (inside a v1 skill).** No AI calls. No DB. No network. No frontend. No hidden fallbacks for missing inputs. All paths driven by `--manifest` / `--output-dir`. `pathlib.Path` throughout — no string-concat path math. Relative source paths resolve against the manifest directory first, CWD second.

### Skill-runner-specific gotchas

- **Pytest `__init__.py` collision.** Multiple skills each with their own `tests/__init__.py` cause `ModuleNotFoundError: No module named 'tests.test_X'` at collection time when pytest is invoked over both at once — both `tests/` directories become the same `tests` package. **Don't add `__init__.py` to skill `tests/` directories.** Pytest auto-discovers files without them.
- **Validation order.** Schema must validate before output_dir prep (you need a trusted `output_dir` value), but output_dir prep must beat semantic + input validation (so failure receipts land in the right place). Schema → prep → semantics → inputs.
- **openpyxl is the default Excel library** in this repo — already imported by `re_excel_export.py` and `pitch-forge-deck/runner.py`. No new requirement needed for v1 framework skills.
- **JSON canonicalization for `manifest_hash`.** Use `json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")` then `sha256`. Anything else produces hash drift across runs that load the same file differently.
- **Cross-platform deterministic IO-failure test.** Point `--output-dir` at a path *under* a non-directory: `blocked = tmp / "not_a_directory"; blocked.write_text("..."); output_dir = blocked / "child"`. `mkdir(parents=True)` fails reliably on both win32 and POSIX.

Any newly discovered repo-specific convention, test command, path convention, or reusable implementation lesson hit during a skills-framework coding session should be appended here (under this section), not in the plan file.

**Open follow-on:** real LBO math (IRR, debt amort, S&U, exit, returns) arrives in ticket 0007. The v1 stub deliberately produces empty-but-structured workbooks so the framework contract can be validated independently of the domain logic.

## Telemetry data contracts, lineage, and null-state conventions (2026-06-22)

Inventory of the real data behind the telemetry env (full per-surface contracts in `docs/plans/telemetry-platform/redesign-data-contracts.md`). Reusable lessons:

- **Design follows the data.** Before building a telemetry surface, read its endpoint contract and decide measured / modeled / projected / unavailable per field. Never seed a UI number; fail closed instead.
- **Every telemetry endpoint already fails closed with a `null_reason` enum** — never hardcoded fallback data. Known enums: `model_not_promoted`, `data_not_ingested`, `stream_unavailable`, `etl_watermark_stalled`, `telemetry_findings_unavailable`, and `verdict="NOT_AVAILABLE"`. Reuse these strings; don't invent parallel ones.
- **Null-state vocabulary for the redesign** (render one of these + a `null_reason`, never a blank or a fake value): *Not available · Missing source data · No lineage yet · Modeled relationship unavailable · Projection unavailable · Stale input · Requires metric registry · Requires backend endpoint.*
- **Freshness is always explicit, never implicit.** Markers in use: `created_at`, `kpi.last_scored_at` (max `tel_predictions.created_at`), `stream.as_of_ts` (`tel_pipeline_status.as_of_ts`), `watermark_ts` ages computed vs now, `generated_at` (metadata graph). If a payload has no freshness field, the UI must say "as-of unknown", not imply live.
- **Lineage already exists end-to-end via `/api/telemetry/metadata/graph`** — nodes carry `layer` (source→bronze→silver→gold→metric→consumer) + `metadata`, edges carry typed `relationship`s. Frontend helpers `getMetadataGraph` + `getUpstreamTrace` live in `repo-b/src/lib/telemetry/metadata.ts`. Build the reusable lineage drawer on this; do not invent a second lineage store. Backed by committed `metadata_catalog.json` + enrichment SQL over `tel_*`.
- **The provenance/audit pattern to reuse** is the Spike Inspector "Data Source Audit" panel + the `provenance` object on `/api/telemetry/findings` (surface · mode · source · tenant · rows evaluated · last refresh · fallback used: NO). Put one on every converted surface so a regression back to static data is obvious.
- **Demo tenant is `env_id=telemetry-demo`, `business_id=7e1eb000-0000-4000-a000-000000000001`** (frontend constants `TELEMETRY_DEMO_ENV_ID` / `TELEMETRY_DEMO_BUSINESS_ID`). Data is keyed to this tenant regardless of the URL's `[envId]` — pages read the constants, not the route param, for the seeded backfill (46 runs / 2000+ predictions).
- **No composite/derived telemetry metric exists yet** — no Mission Readiness score, no month-over-month delta (no snapshot store), no debt→launch causal edges. Any of these must be (a) defined with a ratified formula and (b) backed by a registry before it can render; otherwise fail closed. A "Program Control Tower" has **no backend at all** (would need a `tel_ct_program` table + endpoints).
- **Backend telemetry map:** routes `backend/app/routes/telemetry.py|telemetry_copilot.py|telemetry_control_tower.py|telemetry_analyzer.py`; services `backend/app/services/telemetry_serving.py|telemetry_metadata.py|telemetry_registry.py|telemetry_factory.py|telemetry_stream_etl.py|control_tower/*`; schemas `backend/app/schemas/telemetry*.py|control_tower.py`; fixtures `backend/app/data/telemetry/{replay_fixture,metadata_catalog}.json`.

### Executive landing composition + prod backend-stale gotcha (2026-06-22)

- **An executive landing page links to detail pages; it does not re-host their tables.** The Mission Summary
  redesign first stacked a new readiness panel on top of the *entire* old Overview (KPI strip + full model
  registry + verdict panel + runs table + serving inventory + fused-vector + the full Bottleneck Map). Result:
  ~7 panels, duplicate KPIs (the readiness component cards repeated the metric strip verbatim), and a wall of
  five identical "Projection unavailable" cards. The fix was **subtraction**: one readiness block (the
  component cards ARE the KPIs — no duplicate strip), a one-line scoring posture, a single compact
  Operational-Leverage line, and **launchpad cards into `/registry`, `/runs`, `/system-health`,
  `/metric-lineage`, `/copilot`** instead of inline tables. Rule: a landing should read in ~1–1.5 screens and
  answer "how are we doing / what changed / where do I go", with detail one click away on its owning page.
- **Fail closed with a dignified null state, never a raw error string.** A page whose data fetch can 404 must
  render a labeled state ("Lineage index unavailable" + `null_reason: metadata_graph_unreachable` + a Retry),
  not the generic `ErrorState` "Could not load: Error: Not Found". A primary CTA must never point at a page
  that dumps a raw error.
- **The prod Railway backend is NOT auto-deployed, so it lags the merged code.** `/api/telemetry/summary`
  returns 200 in prod but `/api/telemetry/metadata/graph` returns **404** even though the route exists in
  `backend/app/routes/telemetry.py` — it was added after the last `railway up`. Any new backend route reads as
  "Not Found" in prod until the backend is shipped (`scripts/deploy_backend.sh` from `main`, then
  `curl /version` to confirm the live SHA). When a frontend surface depends on a freshly-added endpoint,
  assume the prod backend is stale and either ship it or fail the page closed. Quick prod check:
  `curl -s -o /dev/null -w "%{http_code}" https://novendor.ai/api/telemetry/<path>` (200 vs 404 tells you
  whether the route is deployed; 401 just means the unauth proxy gate, not a routing answer).

### Telemetry presentation polish (RS visual language) — durable lessons (2026-06-22)

- **Polish the shared design system, not each page.** Every telemetry surface consumes
  `repo-b/src/components/telemetry/primitives.tsx` (the `C` palette + `PageHeading`/`Panel`/`MetricCard`/
  `Tag`/`EmptyState`/`ErrorState`). Brightening the `C` tokens and enlarging those shared components lifts
  all ~18 pages at once, consistently, with one low-risk edit — far better than per-page restyling. Keep the
  **token names stable** (only move the values) so nothing breaks. `C` is telemetry-scoped (nothing outside
  `components/telemetry/` imports it — `historyrhymes/cockpit/primitives.tsx` only *references* it in a
  comment), so the blast radius is just telemetry.
- **Contrast: the killer is dim/faint used for *important facts*.** The old `faint #56616f` at 9–11px on
  panel titles and key labels read as unreadable gray. Fixes that landed: panel titles use `dim` (not
  `faint`); `dim`→`#9fb0c4`, `faint`→`#6f7e90` (raised luminance); accents moved to the RS set
  (cyan `#67e8f9`, green `#6ee7a0`, amber `#f5b452`, red `#f4715f`); `PageHeading` title 26→30 with an accent
  eyebrow bar; `MetricCard` value 26→30. Reserve true faint only for genuinely tertiary footnotes.
- **Fail-closed states must look *designed*, not broken.** Replace dashed "sad box" empties and raw
  "Could not load: …" dumps with a composed card: a status dot (amber for unavailable, red for error,
  cyan for loading) + a clear label + a `null_reason`/hint line. An honest "Lineage index unavailable" or
  "Projection unavailable" should read as a deliberate posture a reviewer trusts, not a crash.
- **Lineage-card layout (the trust spine):** list each governed metric as a row with name + one-line
  definition on the left, and on the right a status tag **plus a bordered "Trace source →" pill** (border +
  tinted bg, not bare text) so the affordance is unmistakable. The drawer renders the upstream chain grouped
  by medallion lane (source→bronze→silver→gold→metric). Verified live: 8 governed metrics / 22 gold tables /
  133 lineage edges from `/api/telemetry/metadata/graph`.
- **Mobile/contrast gotchas:** layout stays in literal Tailwind classes (the content scanner only sees
  literal strings — never compose class names from props); color/typography stay on the inline `C` palette.
  Telemetry grids already reflow at `sm`/`lg` via `StatGrid`/`SplitGrid`. When polishing, change inline
  *style* (color/size/spacing) but never the Tailwind class strings, and keep panel titles ≤ one line on a
  375px viewport. Verify both widths with a Playwright screenshot at 1600px and 390px.
- **Verification without leaking secrets:** drive prod with a throwaway Playwright `.cjs` (deleted after run,
  never committed); have it read the admin login from the memory index (`MEMORY.md` records it in backticks)
  and print only the password *length*, never the value. Login form on `/login` uses
  `input[autocomplete=username]` (type=text, not `type=email`) + `input[type=password]` + a "Sign in" submit.

## Telemetry Databricks pipeline — running, inspecting, and judging the ML

Lessons from running the full `novendor_1.telemetry` pipeline (probe → anomaly → RUL → promote → score →
fused → NCR corpus/clustering/forecast) on serverless and reviewing it for ML quality.

**Running notebooks remotely (no new client):**
- Auth: set `DATABRICKS_PAT` or drop the gitignored repo-root `claude_token.txt`; `telemetry-platform/databricks/_bootstrap.py:get_client()` reads it. Host `dbc-2504bec5-b5ab`, catalog `novendor_1.telemetry`, warehouse `0e56420fb707d861`, MLflow exp `3740651530987773`.
- Use `_jobs.py` (`upload_notebook` + `run_notebook_and_wait`, serverless, polls every 15 s) — see the `08_*`…`16_*` drivers. A reusable runner that also cancels-on-timeout and appends to a `run_manifest.json` is `telemetry-platform/runs/*/runner.py`.
- The PowerShell tool does NOT persist env vars between calls — persist the PAT via the `claude_token.txt` fallback (gitignored by `*token*.txt`), or inline `$env:DATABRICKS_PAT=…` per invocation.
- Read-only inspector pattern: `DatabricksClient.execute_sql` + `search_mlflow_runs` + UC REST. The UC alias field is `version` (e.g. `GET /api/2.1/unity-catalog/models/{full}/aliases/champion` → `.version`), **not** `version_num`; the registered-models *list* endpoint returns empty `aliases`.
- **Workspace drifts from repo source.** Deployed notebooks differed from `notebooks/*.py` for 6/8 here, and the live champion had been built by stale code (only point-adjusted metrics). Always back up workspace source (`/api/2.0/workspace/export`) before re-uploading, and treat the repo as the only source of truth.

**threadpoolctl "Exception ignored on calling ctypes callback … 'NoneType' has no attribute 'split'":**
- Root cause on DBR Python 3.12: bundled `libgomp` reports `version: null` and **threadpoolctl 2.2.0** doesn't guard against it. **Non-fatal** introspection noise — fit/predict return finite, correct results; the warning is intermittent and off the result path. Fix only if the noise bothers you: notebook-scoped `%pip install "threadpoolctl>=3.1.0"` (3.x guards `version=None`); never change the global cluster image. Prove non-fatality before any package change.

**Judging the ML (notebook success ≠ done):**
- **Point-adjusted F1 inflates ~2×.** SMAP/MSL MAD reported 0.639 point-adjusted vs 0.309 honest point-wise. Lead with honest/affiliation metrics (the pipeline logs both + a fail-closed gate).
- **Watch for the always-positive baseline.** Fused PCA-256 and the autoencoder both hit f1=0.757 with fn=0 — that's exactly the all-positive baseline (2·p·1/(1+p)). A 99th-pctl-of-*train* threshold under the min *test* reconstruction error → constant classifier. Always compute the trivial baseline.
- **RMSE can hide the dangerous failure mode.** RUL GBM wins RMSE (20.3 vs 21.7) but loses PHM (1423 vs 1036) and predicts LATE 58% of the time (optimistic on near-failure units). For asymmetric-cost targets, make the gate PHM-/late-rate-aware, not RMSE-only; check error-by-regime.
- **Negative control = cheapest leakage test.** Shuffle training labels, refit; RMSE should collapse to naive (here 41.65 ≈ naive 41.71 → no leakage). Add naive baselines (train-mean/median) — a model that can't beat them isn't skillful (RUL beats them ~2×; the NCR drift forecast only ties / loses on MAPE).
- **Clustering: measure family purity, don't tune to the answer.** MiniLM→UMAP→HDBSCAN recovered 3/6 synthetic families cleanly, split 2, scattered 1, and missed the engineered *declining* trend (slopes didn't cross −0.35). Add a "needs human review" bucket + family-level trend rather than lowering thresholds.
- **Curated replay feeds overstate recall.** `gold_replay_feed_scored` showed fn=0 (100% recall) because it's a curated D-4 fixture; the honest test recall is 0.30. And the `anomaly_score` display column is uncalibrated (10⁰–10¹³) — gate on the binary `model_pred`, clamp the score for UI.

When building any Relativity / aerospace telemetry feature, every technical surface should answer three
questions, or it reads as an isolated demo rather than part of one argument:

1. **How is the data collected?** (the stream / sensor / test-stand / record source, and its provenance)
2. **How is trust established?** (lineage to source, calibration / coverage, governed metrics, fail-closed nulls)
3. **How does the result change a test/build/launch action?** (the operator decision it informs — abort/review,
   go/no-go, manufacturing feedback, readiness margin).

The thesis the demo must consistently support: modern launch operations are increasingly constrained not by
hardware or cost alone but by the ability to collect, process, trust, and act on telemetry/model/lineage/operational
data fast enough to improve test, build, and launch outcomes. Frame the Kafka/streaming surface as the live proof
of that thesis (recorded capture replayed through real streaming infra + anomaly routing + provenance + a
human-facing review state), never as an isolated technical demo. Do not present specific historical launch-program
claims as fact unless sourced; keep era framing general (access → cost → reuse → manufacturing scale → data velocity).

## Regime-conditioned anomaly detection (Phase 3, Story #718)

- **The multi-condition reconstruction trap.** On C-MAPSS FD004 (six operating conditions set by
  op_setting_1/2/3), a global reconstruction-error detector calibrated on the data you have (one dominant
  condition) flags ~100% of HEALTHY points in the other conditions as anomalous — measured recon-error variance
  is 100% explained by operating regime (η²=1.0), not faults. Per-regime standardization (subtract per-regime
  mean, divide per-regime std, computed on fit rows only) cuts the worst-regime false-positive rate from 100%
  to ~10% (90% reduction). This is the classic FD001→FD004 generalization failure and why operating-condition
  normalization is standard preprocessing for multi-condition C-MAPSS.
- **The op-settings live in `silver_cmapss`, not gold.** `06_gold.py` drops op_setting_1/2/3 (keeps only 7
  rolling sensor features); `silver_cmapss` preserves the 3 settings + all 21 sensors. Pull regime experiments
  from silver, filter `subset='FD004' AND split='train' AND rul_target >= 100` for the healthy population.
- **No labels → measure false positives on healthy rows.** FD004 has no anomaly labels, so the honest metric is
  the false-positive rate on high-RUL (nominal) rows, grouped fit/eval split by unit. Report it as FP, never as
  detection recall. Use η² (between-regime variance / total variance of recon error) to show the error tracks
  regime — it's the unfakeable number.
- **Avoid the strawman trap.** A too-smart "global" baseline (global StandardScaler + PCA) absorbs the six-mode
  structure and shows NO gap (η²≈0). The real naive baseline is the single-operating-mode assumption (fit +
  threshold on one condition, apply everywhere). State explicitly that a model accounting for all conditions
  also works — the point is that operating-condition awareness is required, and per-regime normalization is the
  scalable way to get it. Keep the testable math (regime z-score, per-regime FP, η²) in a numpy-only core
  module so the eval test runs in CI without Databricks.

## Pre-test competence-envelope gate (Phase 4 / Spin 5, Story #719)

- **Flip drift upstream.** Instead of "today vs training" calendar drift, ask BEFORE scoring: is this input
  inside the model's trained operating envelope? Fit a transparent envelope (Mahalanobis distance to the FD001
  training distribution over standardized sensors); band by in-envelope (≤ τ, τ = FD001 99th pctl → score),
  near-boundary (τ..3τ → review), out-of-envelope (>3τ → abstain). Measured: FD001 held-out 98.9% in-envelope;
  FD004 (six conditions) 90.5% out-of-envelope. The gate abstains on the shift instead of issuing a confident
  score — caught before scoring, not after deployment.
- **Mahalanobis on a single-condition training set explodes on shifted regimes.** FD001's covariance is tiny in
  near-constant sensor directions, so FD004's different-condition values produce astronomically large d² (e.g.
  1e8 vs τ=62). That's real and is exactly the "way outside the envelope" signal — display it (scientific
  notation) rather than clipping. Ridge-regularize the covariance inverse (`cov + 1e-3·I`, pinv) for stability.
- **Wording discipline.** Use "abstain", "review", "outside trained envelope", "within trained scope" — never
  "safe" or "certified". The envelope gates INPUT distribution (operating regime), not label correctness:
  in-envelope ≠ correct prediction. FD004 is a regime-shift STRESS TEST, not rocket hot-fire data.
- **Reuse FD001→FD004 across spins.** The same split powers Spin 3 (regime-conditioned anomaly) and Spin 5
  (competence envelope) — one stress test, two findings. Keep the testable math (mahalanobis, band, band_rates)
  in a numpy-only core so the eval test runs in CI without Databricks.
**RUL gate hardening (PR-1) — don't let RMSE alone promote a dangerous model:**
- **"Late" is the unsafe direction for RUL.** Late = predicted RUL *higher* than actual (model says more safe life remains than is true). Log `rul_late_prediction_rate` and slice it by RUL regime — on C-MAPSS FD001 the models were ~58% late overall but **73–93% late in the near-failure regime**, exactly where it's dangerous. Aggregate RMSE hid this completely.
- **Gate on more than RMSE.** The hardened `promote_models.py` RUL gate is fail-closed over 5 checks: beats strongest-naive RMSE by a margin (≤0.75×), PHM improves over naive (PHM is asymmetric — *lower is better*, late penalized harder), `late_prediction_rate ≤ 0.55`, and the label-shuffle leakage control passes. Select the **safest** passer (lowest PHM), not the lowest RMSE.
- **A gate that nothing passes is a valid, honest result.** Both FD001 models cleared 4/5 but missed the late-rate ceiling, so the gate held closed and promoted nothing — the existing champion stayed (the gate never demotes or silently overwrites). Set thresholds conservatively and do *not* tune them to force a promotion in either direction.
- **Log baselines + leakage control as repeatable diagnostics in the training notebook**, on *every* candidate run, so the promotion notebook can read them from MLflow (it gates on logged metrics, not hand-passed numbers). The label-shuffle control must never train/influence the champion — it's diagnostic only.
- **Model card must state approved/not-approved use + the known unsafe failure mode.** For RUL: *Approved — telemetry demo / maintenance-risk investigation; Not approved — autonomous launch, flight-safety, or maintenance authorization.* Point predictions ≠ calibrated risk; say so explicitly until intervals/coverage exist.

**Two-tier ML pipeline (notebooks = experimental, `telemetry-platform/pipeline/` = production):**
- **Keep notebooks as the sandbox; put governance in an importable, locally-tested package.** Databricks notebooks run as single uploaded files and *can't import a local package*, so the production path that enforces gates + writes the registry runs **locally** (REST/MLflow), importing the shared module. Notebooks are allowed to drift; the module is authoritative. `promote_models.py` notebook is now reference-only.
- **Separate the decision from the side-effect.** `promote.decide(anomaly, rul)` is pure (no I/O) → unit-testable and can't accidentally mutate the registry. A thin runner does the read + the alias write around it.
- **Dependency-inject the registry backend so CI never touches Databricks.** The runner takes a duck-typed backend; tests pass a `FakeRegistry` (no network, no MLflow server, deterministic, ~0.3s). The real `DatabricksBackend` is constructed only for an actual run — and its constructor calling `get_client()` is exactly where "missing PAT → fail-closed" is tested (mock `DatabricksBackend` to raise).
- **Dry-run by default; writes only behind `--apply`; verify the write.** After setting a UC alias, *re-read it* and assert version+run match; treat an unverifiable write as a hard failure (distinct exit code). Fail closed (explicit reason, never notebook fallback) on missing creds / missing candidate run / missing-or-malformed metrics / **ambiguous "latest"** (two runs sharing the newest `start_time`).
- **UC Unity Catalog alias REST gotchas:** the alias-list field is `version` (not `version_num`); read a champion with `GET /api/2.1/unity-catalog/models/{full}/aliases/champion` (404 → no alias). The registered-models *list* endpoint returns empty `aliases` — use the per-alias GET. Resolve a run→version via `.../versions` (a run can back multiple versions — take the max).
- **Pin regression fixtures from real runs.** Hard-code the actual logged metrics (e.g. GBM late-rate 0.58) into gate/decision tests so a future formula/threshold change that would silently re-promote a known-bad model breaks CI loudly. Write a per-run JSON **receipt** (plan + rejected-with-reasons + before/after alias) as CI/debug/demo evidence; gitignore the transient one, check in a small example.
- **Reconcile a shared metric against code you can't import (a Spark notebook) by transcription.** Extracting duplicated metric math into the package, you can't `import` a Databricks notebook (Spark refs at module top blow up). Pin a *verbatim transcription* of the notebook's algorithm inside the test and assert the canonical matches it — plus hand-computed ground truth, plus the one duplicate you *can* import (the local `.py` evaluator). Three-way agreement is the safety net. Then make the importable copy (`eval_honest_metrics.py`) **delegate** to the canonical (output shape preserved: rounds to 6 dp + count keys), so only the notebook keeps a sanctioned copy — guarded by the transcription test. Canonical anomaly metrics are channel-keyed numpy (no pandas) so they stay CI-testable.

## Telemetry frontend production-readiness refactor (Story #722, 2026-06-24)

- **The telemetry `C` palette is the env theme adapter — extend it, don't replace it.** `repo-b/src/components/telemetry/primitives.tsx` is intentionally inline-style-token based so the console stays dark regardless of the global theme. The refactor routes pages/components THROUGH primitives; it does NOT migrate telemetry to Tailwind theming or the global `--nv-*` CSS vars, and it keeps telemetry's 9/11/13px density.
- **Primitive naming: prefix `Telemetry*` only on collision; alias, never duplicate.** Generic atoms stay unprefixed (`Panel`, `Tag`, `MetricCard`, `PageHeading`, `StatGrid`, `EmptyState`, `MetricRow`, `StatusDot`). Reuse-before-rename-before-create: PR A aliased `TelemetryPanel = Panel`, `TelemetryPageHeading = PageHeading`, `TelemetryNullState = EmptyState` rather than re-implementing them.
- **Inline-style boundary.** Inline `style={}` is for runtime/data-derived values and chart/SVG geometry only (e.g. `MetadataGraphNode.LAYER_COLORS`, `ReplayConsole.pathFor`, xyflow/d3 positions). Typography/spacing/borders/dots/chips/buttons/panels go through a primitive. `next lint` (next/core-web-vitals) does NOT enforce a no-inline-styles rule — the IDE warns but CI is fine; and jsx-a11y only flags *literal* invalid roles, so dynamic `role`/`aria-live`/`aria-pressed` pass CI (the IDE over-reports them).
- **Evidence-card contract** (`evidenceCard.tsx` `TelemetryEvidenceCard`/`EvidenceContract`): title · thesisRole · sourceStatus · asOf · coreMetrics · method · claimBoundary · null_reason · detail · provenance. Fail-closed precedence is error > loading > null_reason > body — the body never shows partial data. But DON'T force every existing card into the compact wrapper: the Evidence page's per-claim *section* layout (each card with its own PageHeading) is the intended story; collapsing it is a redesign, not a dedup.
- **Replay/chart component separation.** `TelemetryChartFrame` owns the chrome (title/legend/caption/empty-state); the chart body keeps its geometry inline. Recharts `isAnimationActive=false` must survive the frame. Status/verdict text gets `aria-live`; the replay loop needs reduced-motion handling.
- **Drawer dedup.** Both metadata drawers now share `DrawerWrapper`/`DrawerHeader`/`FieldRow` (Radix Dialog contract preserved: right/bottom, close-on-Escape, focus trap). `LineageDrawer`'s `FieldRow` is the simple String(value) form; `MetadataDetailDrawer` keeps its richer local `DetailRow`/`displayValue` (arrays/objects/booleans) — don't force the simple one on it.
- **Fail-closed UI is load-bearing copy.** Every `null_reason` string (`model_not_promoted`, `no_upstream_edges_in_catalog`, `metadata_graph_unreachable`, "Unavailable reason", governance N=0 reason) and every honesty label ("recorded capture", "not live serving", honest-F1 dual labels, GO/REVIEW/NO_GO) is a constant a refactor may MOVE but never edit or strengthen. The card `.test.tsx` files assert these exact strings — they ARE the behavior-preservation safety net; run `vitest run src/components/telemetry` before merging.
- **One token system per file.** `rsTokens` (RS demo palette) had accent hexes byte-identical to `C`, so unifying was a one-file recolor (point `RS` at `C`, keep only the RS-specific teal/violet/blue chart hexes) — zero layout change. Cheaper and safer than swapping `RsPanel`→`Panel` (different radius/size) across files.
- **Production-refactor gotchas.** (1) A *near*-duplicate (6px vs 8px dot glow, 9.5px vs 9px label) is NOT an exact-swap dedup — folding it normalizes pixels, which is a visual change to screenshot-gate, not a free behavior-preserving win. (2) This repo is edited by multiple concurrent agents in one checkout — work in a `git worktree` off `origin/main` + junction `node_modules`; see the concurrent-agent memory. (3) When a squash-merged commit lingers on a follow-up branch, `git rebase origin/main` drops it so the next PR diff stays clean.

**Telemetry stream lineage / Lakebase DDL ownership (Ticket 1, 10034):**
- **`tel_*` serving tables live on Databricks Lakebase, not Supabase.** They were migrated off Supabase to Lakebase (managed Postgres) via `TELEMETRY_DATABASE_URL`. Supabase no longer has them — `to_regclass('public.tel_stream_kafka_rows')` returns `null` on the Supabase `DATABASE_URL`. Never apply `tel_*` migrations against Supabase; you'll get "relation does not exist."
- **The runtime `telemetry_app` role is DML-scoped and is NOT the table owner**, so `apply.js` DDL (`ALTER TABLE` / `DROP CONSTRAINT` / `CREATE TABLE`) fails with `SQLSTATE 42501 must be owner of table ...`. The Lakebase `tel_*` tables are owned by the human Databricks identity `paulmalmquist@gmail.com`. **DDL migrations to `tel_*` must be run as that owner** — Databricks SQL editor authenticated as the human, or an owner connection string — not the Railway `authentic-sparkle` `TELEMETRY_DATABASE_URL` (that's `telemetry_app`). This is the same family of limit as "Lakebase telemetry_app can't CREATE partitions."
- **Where the creds actually live:** `TELEMETRY_DATABASE_URL` is on **Railway `authentic-sparkle`** (read via `railway variables --service authentic-sparkle --kv`), not on any Vercel project. Backend `DATABASE_URL` (Supabase) is on the **`consulting-app`** Vercel project (serves novendor.ai), and several values export as empty strings from `vercel env pull` (sensitive/encrypted) — pull is unreliable for secrets; Railway `--kv` is the dependable source for the telemetry URL.
- **Architecture line to hold:** Databricks/Delta is the durable RAW telemetry lake; Lakebase/Postgres is the serving/provenance slice (latest rows, anomaly/triage summaries, receipts, and *pointers* into the lake). Do **not** copy full raw Kafka telemetry into Postgres — persist a deterministic sample (`kafka_offset % sample_rate = 0`) plus anomalies, agg5s, triage, DLQ, and offset receipts in full.
- **Fail closed on missing lineage.** No concrete Databricks Delta table is mapped to the Stargate *printer* stream (`novendor_1.telemetry.*` is the separate NASA C-MAPSS/SMAP/IMS ML lane). So Databricks pointer columns default `databricks_lineage_status='not_available'` with `databricks_null_reason='databricks_table_mapping_not_configured'`. Never fabricate a Delta pointer or a Kafka offset.
- **10033 already shipped the Kafka-provenance core** (`tel_stream_kafka_rows` + `tel_stream_consumer_offsets` + the replay-safe `UNIQUE (env_id, business_id, kafka_topic, kafka_partition, kafka_offset)`). Lake pointers + triage came as **additive `10034`** (next free number after committed `10033`) — extend committed migrations, never rewrite them. `apply.js`'s SQL splitter respects `DO $$ ... $$` dollar-quoting, so multi-statement `DO` blocks (drop+re-add CHECK, RLS policy, verification) stay intact under `--files N`.

**Stargate fixture: four printer personalities + v3 schema evolution (Phase 7 T1):**
- **The Stargate Live page is fed by an in-memory bridge over SSE, not the FastAPI `/api/telemetry` routes.** Bridge core = `backend/app/services/stargate_bridge.py` (ring buffers, no DB in the hot path; hard import purity — never imports `app.config`/`app.db` at module load). Capture mode replays `backend/app/data/stargate/replay_capture.jsonl` and is the CI/Railway/demo default; `local`/`cloud` need confluent-kafka + `proto_gen` that ship only in the laptop tooling venv.
- **The anomaly predicate is a *cold* melt pool, not high temp:** `melt_pool_temp_c < 1400 AND arm_vibration_g > 0.08` ("cold pool + shaking arm, together"). `test_stargate_codec.py::TestFlinkSqlLock` regex-parses `flink/02_anomaly_route.sql` and fails if it drifts from `signal_mapping.TEMP_THRESHOLD_C/VIBRATION_THRESHOLD_G`. Keep all logic additive; never edit the rule to force a demo outcome.
- **`signal_mapping.py` exists twice but is one definition:** `scripts/streaming/stargate/signal_mapping.py` is a re-export shim of `backend/app/services/stargate_signal_mapping.py` (which ships in the Railway image — Docker build context is `backend/` only). Edit only the backend copy. Derived features (`toolpath_speed_mm_s`/`acceleration_mm_s2`/`temp_slope_c_per_s`) live there as pure stdlib so producer, fixture, and bridge compute them identically.
- **Schema evolution is demonstrated by hand-built wire bytes, not regenerated pb2.** `proto_gen/stargate_telemetry_pb2.py` is generated from v1 (10 fields); v2 (`laser_power_w`, tag 11) and v3 (process-context, tags 12–17) live as separate `.proto` files with NO bindings — the evolution tests append raw field bytes and assert a v1 reader skips them. So adding the v3 fields needs no protoc run for capture mode (the JSON fixture carries them); regenerate pb2 only for the live cloud round-trip. Tags ≥16 need a two-byte tag varint (field 16 → `0x82 0x01`).
- **Capture fixture determinism is load-bearing** (bridge `TestCaptureDeterminism` asserts two cold starts are byte-identical). Every value must be a pure function of the per-(printer,segment) seed `np.random.default_rng(SEED + p*1000 + seg_idx)` — no wall clock, no unseeded RNG. The "redline" personality (abrupt cold-pool + vibration step that crosses both thresholds at once) is authored locally in `capture_fixture.py`, NOT added to `rs_factory_seed/waveforms.py` (that module is owned by the generator PRs and has its own PATTERNS/test lock). DLQ beats are plain unparseable/`kind!=telemetry` lines; flavor their text with the target printer id since `DlqRow` carries no printer field.

**Telemetry replay forensics surface (ReplayConsole drawer upgrade):**
- **The replay page is DB-free and payload-driven.** `GET /api/telemetry/replay` → `telemetry_serving.replay_feed()` just reads the committed JSON fixture `backend/app/data/telemetry/replay_fixture.json` (cached in-process). The `ReplayFeed`/`ReplayTick` types in `repo-b/src/lib/telemetry/api.ts` are the whole contract. Top-level: `channel`,`spacecraft`,`fixture_ticks`,`total_ticks_source`,`first_model_fire_t`,`model_fired_ticks`,`label_anomaly_ticks`,`provenance{source_table,champion_model,champion_mlflow_run_id,note}`,`feed[]`,`null_reason?`. Per tick exactly 6 keys: `t,value,rmean,score,model_pred,is_anomaly`.
- **`feed[].score` is numerically degenerate — never plot it as a threshold axis.** It's `|value-rmean|/median(resid)`; on near-constant D-4 the residual median collapses so score reads ~1e12 at fire ticks and ~0.1–0.7 elsewhere. There is NO single score value that separates fired from not-fired. The detector fires on `model_pred` (a MAD rule `resid > 4*scale` inside the champion, `MAD_K=4`, `GLOBAL_TRAIN_SCALE≈0.0339` in `telemetry_serving.py` — NOT in the payload). For any deviation visual use the raw residual `abs(value-rmean)` (bounded, since value∈[-1,1]); render threshold/margin/score-in-units as explicit "Not available".
- **Honesty landmine: the model fires BEFORE the label.** First `model_pred==1` is `t=728`, but the first NASA `is_anomaly==1` label is `t=5232` (window [5232,8472]); ~141 fires precede the label. So "detection latency" = `728-5232 = -4504` (negative) — those are pre-label false alarms on this public benchmark, NOT lead time. A confusion matrix from `model_pred` vs `is_anomaly` over the fixture is replay-feed AGREEMENT (in-sample, single channel, strided), never held-out validation — always caption it. Held-out P/R/F1 live on `/api/telemetry/model-performance` (`tel_model_runs.metrics`) and the conformal false-alarm budget on `/api/telemetry/monitoring` (`conformal_budget`, often null=Track A not populated) — fetch those for real metrics, fail closed.
- **Compute-where rule that kept the env "no frontend metric constants" clean:** all diagnostics math lives in a pure adapter `repo-b/src/lib/telemetry/replayDiagnostics.ts` (`computeReplayDiagnostics(feed)` / `inspectTick(feed,t)` + an `NA_REASONS` map of the exact "Not available — <reason>" strings shared by component and test). The React components only render it; the adapter is unit-tested against a synthetic `ReplayFeed`.
- **Reusable telemetry drawer + tab + copy primitives (alias, don't re-implement):** `repo-b/src/components/telemetry/drawerPrimitives.tsx` exports `DrawerWrapper`/`DrawerHeader`/`FieldRow` (Radix `@radix-ui/react-dialog`; right 460px on lg / bottom sheet on mobile; Escape+overlay-click close; focus trap; `FieldRow` renders "Not available" for empty values). Tabs = `SectionTabButton` from `primitives.tsx` driven by local `useState` (no shared `<Tabs>`; only `@radix-ui/react-dialog` is installed, no Radix Tabs). A telemetry-native copy control is trivial (`navigator.clipboard` with a `typeof navigator` guard — jsdom-safe); `historyrhymes/mlUi.tsx` has a `CopyButton` but it's off-palette (neutral/sky Tailwind), so a local C-token copy chip reads better in the dark telemetry theme.
- **Radix Dialog renders fine under Vitest/jsdom** — `render(<Drawer open .../>)` then `screen.getByText(...)` queries the portal in `document.body`; assert `queryByText(...).not.toBeInTheDocument()` for the closed state. Render only the active tab's panel so non-active tabs (and their fetches) stay unmounted/lazy. Test commands: `npm run typecheck` (`tsc -p tsconfig.typecheck.json`), `npm run lint` (`next lint`; the telemetry inline-`C`-style "CSS inline styles should not be used" notes are warnings, exit 0), `npx vitest run <file>` / `npm run test:unit`. Stabilize a `const ticks = feed?.feed ?? []` in a `useMemo([feed])` or `react-hooks/exhaustive-deps` warns for every memo that depends on it.

- **Factory ML "click anything → evidence" drawer (2026-06-24):** the Factory ML page (`repo-b/src/components/telemetry/factory-ml/`) is now drillable across Model Quality / Registry / NCR / Readiness. One `FactoryEvidenceDrawer` lives in `FactoryMlConsole` (`useState<DrillObject|null>`); each tab takes `onDrill` and emits a discriminated-union `DrillObject` (`factoryDrill.ts`, kinds: model_metric/feature/model_version/mlflow_run/ncr/ncr_category/vehicle). Reuse note: there IS a shared `telemetry/drawerPrimitives.tsx` (`DrawerWrapper`/`FieldRow`) — but `metadata/LineageDrawer.tsx` and this drawer both copy the raw Radix shell instead; if you touch either, consider consolidating onto drawerPrimitives. Every drawer carries an "Operational use" decision-relevance line (readiness hold/release · NCR triage · extra inspection · promotion review · informational only) — that one line answers the executive "what changes because of this?".
- **factory-ml data is committed static JSON, not an API** (`repo-b/public/labs/factory-ml/*.json`, generated by `skills/rs-factory-ml/scripts/export_dashboard_json.py` against a live Databricks warehouse). So drill metadata that isn't already in the JSON must come from committed frontend catalogs (`factoryFeatureCatalog.ts` name-inferred defs, `factoryMetricGlossary.ts` honest weak bands, `factoryPromotionRationale.ts` derived from registry fields) — NEVER hand-edit per-row data into the JSON, and mark inferred/derived content as such. Data-backed units/gates are a documented export-script TODO.
- **Databricks/MLflow deep links, live-by-default pattern** (`factoryEvidenceLinks.ts`): resolve workspace = `NEXT_PUBLIC_DATABRICKS_WORKSPACE_URL || <committed default>`. The committed default is the owner's own workspace `https://dbc-2504bec5-b5ab.cloud.databricks.com` org `7474657239253594` (confirmed in `skills/rs-factory-ml/config/databricks.json` + `telemetry-platform/runs/*/run_manifest.json`). MLflow run URL format that actually works: `<ws>/?o=<org>#mlflow/experiments/<expId>/runs/<runId>` (rs_factory expId `3740651530987773`). A builder returns href=null + unavailableReason + copyText ONLY when the workspace is empty OR the specific identifier (runId/modelName/tableName) is missing — never fabricate a link or imply a target exists. A bare seed model_key (no dots) is not a UC path → disabled-with-reason, not a guessed link.
- **Left-justified clickable chart labels: drop recharts, use a CSS grid bar list.** recharts YAxis category labels can't be left-justified-in-a-gutter AND be real click targets cleanly. Replacement in `FeatureImportancePanel.tsx`: `display:grid; gridTemplateColumns:"220px 1fr auto"` per row — a left-justified truncating `<button>` label (title= full name), a bar area (`width: impact/maxImpact*100%` over a `C.panelHi` track), and a right-aligned value. Each row is a real `<button style={{all:"unset",cursor:"pointer"}}>` so keyboard/focus come free. Telemetry inline-`C`-style triggers IDE "CSS inline styles" warnings — these are NOT in the project ESLint ruleset (`npx eslint <files>` exits clean); the inline-token system is the intentional convention (see primitives.tsx header).

**Stargate "Rules vs baseline" scorer + the SMAP-threshold trap (Phase 7 T3):**
- **Re-express the frozen champion pure-stdlib + lock it with a test; never import it.** The promoted anomaly champion is a rolling-MAD dynamic threshold living in `telemetry_serving.py`, which imports `app.db`. The SSE bridge must stay import-pure (no `app.config`/`app.db` — the laptop venv has no `DATABASE_URL`, and a config import kills `uvicorn bridge:app`). So `score_baseline` is re-expressed in `stargate_signal_mapping.py` (pure stdlib) and a test asserts its constants AND bands equal `telemetry_serving.MAD_K`/`GLOBAL_TRAIN_SCALE`/`_verdict_for`, plus that it reproduces the live ETL's `normalize_window`+`rolling_mean` math. Same lock pattern as the Flink/python predicate lock — two spellings of one rule, a test prevents drift.
- **The champion threshold is SMAP/MSL-calibrated (≈0.1355 in fractional-deviation units) — it's COARSE for smooth high-magnitude signals.** A rolling-MAD on melt-pool temperature (~1500°C, smooth) needs a residual of ~13.5% of the median (~196°C) to reach score 1.0 (REVIEW). A gentle `pre_failure` ramp peaks around score 0.25 — the baseline never fires. Empirically probe before assuming a "baseline leads the rule" story works; it usually doesn't on a smooth ramp because the trailing mean tracks it (residual is lag-limited). **A momentary excursion is what the rolling-MAD catches:** a single sample dipping to ~1220°C from a ~1500 baseline gives residual ~0.18 → score ~1.4 → REVIEW.
- **To make "model catches what the rule misses" honest, exploit the rule's structure, not the scorer's threshold.** The hard rule needs BOTH cold pool AND high vibration. Author an early melt-pool temperature excursion with vibration still nominal: the two-condition rule legitimately stays silent (vibration hasn't risen) while the single-channel baseline flags the temperature excursion. That's a real "the rule missed a temp-only excursion the model caught, ~13s earlier" — not a rigged threshold. Tune the seeded fixture values for the scenario printer only; leave the predicate and scorer constants frozen.
- **`scored` (current per-printer state) vs `anomalies` (cursored events) on the SSE frame.** The Rules-vs-baseline lane needs the *current* baseline verdict per printer (to show REVIEW before any anomaly routes), so emit a tiny `scored` list (≤ printer count) in full every frame — distinct from the `anomalies` ring which is cursored (`since`) for the ticker/drawer. A static `/stargate/snapshot` (autoplay off) shows end-of-replay `scored` state (back to GO after the excursion passes); the REVIEW-leads-rule beat is a mid-stream event, so lock it with a replay regression test, not a snapshot assertion.
- **Capture-mode Kafka provenance must be synthesized-but-labeled, never faked silently.** No broker exists in capture mode, so coordinates are deterministic: `kafka_partition = stable_hash(printer_id) % 6` (matches how the real key-partitioned topic would place it — Kafka keys Stargate on printer_id), monotonic per-partition `kafka_offset`, sentinel `schema_id=null` with `schema_null_reason="capture_mode_synthetic_schema_id"`, and an explicit `synthetic:true` + `provenance_source:"recorded_capture"`. Use a NON-salted hash (not Python's `hash()`) so two cold starts and the durable sink agree. Real broker coords thread in via an optional `kafka_meta` arg on `ingest_telemetry` (default None → synthesize), so the capture path is unchanged and the cloud path wires real `msg.topic()/partition()/offset()` later.

**Stargate "Rules vs baseline" UI: drawer, deep link, two-state fail-closed route (Phase 7 T4):**
- **Test the lane and drawer as pure prop-driven components, not through the SSE hook.** `RulesVsBaselineLane({scored})` and `AnomalyInspectionDrawer({anomaly,...})` take their data as props, so vitest renders them with mock objects — no EventSource plumbing. Reserve the frame-dispatching `MockEventSource` (with a settable `onmessage` + an `emit()` helper) for the ONE thing that genuinely needs it: the `StargateConsole` deep-link reopen test.
- **`next/navigation` is aliased to a mock in vitest** (`src/test/mocks/next-navigation.ts`): `useSearchParams`/`useRouter`/`usePathname`/`useParams` are `vi.fn`s. Override per-test with `vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("inspect=…") as unknown as ReturnType<typeof useSearchParams>)` — the cast is required because next's real return type is `ReadonlyURLSearchParams`, not `URLSearchParams`. Reset it in `afterEach`.
- **Two fail-closed reasons must be visibly different, and the route must be real even before the writer exists.** `GET /api/telemetry/stargate/provenance` returns `durable_sink_not_enabled` (sink flag off — the everyday state) vs `provenance_not_found` (404, sink on but no row). The UI button calls the real route, never a mock-only path; the drawer renders distinct copy ("Durable sink not enabled in this deployment — provenance shown from the live stream" vs "No durable serving row for these coordinates yet"). The table (`tel_stream_kafka_rows`) already exists from 10033, so the route reads it directly; only the WRITER is deferred to T2.
- **Deep link = stable event id `topic:partition:offset`.** Mirror drawer-open state to `?inspect=…` via `router.replace(..., {scroll:false})`; on load, resolve the token against the live anomaly buffer (`anomalies.find`), open if present, else show an explicit "not in the current window" note (the ring keeps only recent events and the replay loops, so a shared link can legitimately miss). Never silently render nothing.
- **The honesty guardrail is specific: don't say "caught before the rule" unless BOTH channels are abnormal at the lead timestamp.** On v4-02 only temperature is abnormal at the baseline-REVIEW moment (vibration is still nominal). The exact honest wording: "the baseline scorer flagged an early melt-pool temperature residual while vibration was still below the rule threshold; the hard two-condition rule routed the anomaly later when cold melt-pool and high arm vibration co-occurred." The "baseline scorer (rolling-MAD residual) · not LSTM" tag contains the string "LSTM" by design (the disclaimer) — so test for the honest label's presence, not the mere absence of the substring.

**Stargate durable sink: add to the existing consumer, don't rewrite it (Phase 7 T2):**
- **A broker `TelemetryStreamConsumer` may already exist** (`backend/app/services/telemetry_stream_consumer.py`) for the live Confluent path. The capture-mode durable sink is ADDITIVE: a cursor+kwargs API (`make_provenance`, `persist_kafka_row`, `commit_stream_offset`, `get_kafka_row_by_coords`, `tail_kafka_rows`) beside the broker worker. Both write the same idempotent `tel_stream_kafka_rows` row; don't merge or rewrite the worker.
- **`get_telemetry_cursor()` does NOT set the `app.env_id` RLS GUC.** It works in prod because the Lakebase `telemetry_app` role has BYPASSRLS, but locally (Supabase fallback) RLS is enforced. So every sink/read function must `SELECT set_config('app.env_id', %s, true)` before its query — harmless under BYPASSRLS, necessary under RLS. (`SET LOCAL app.env_id = %s` can't be parameterized; use `set_config(..., true)`.)
- **`tel_stream_kafka_rows.schema_id` is `NOT NULL`, but capture mode has no Schema Registry.** Write a `SYNTHETIC_SCHEMA_ID` sentinel (0) WITH `schema_null_reason='capture_mode_synthetic_schema_id'` — the row is honestly flagged as carrying no real SR id rather than failing the INSERT or faking a plausible id. The 10034 `record_kind` CHECK admits `telemetry_sample|anomaly|agg5s|dlq` (plus triage/execution/signal); `source_system` and `databricks_lineage_status` have safe defaults.
- **Each record kind needs its OWN topic coordinate or they collide on the durable UNIQUE** `(env,business,topic,partition,offset)`. A raw telemetry message and the anomaly derived from it would share `(telemetry.v1, P, O)` and the second INSERT would `ON CONFLICT DO NOTHING` away. Give the bridge per-`(topic,partition)` synthetic offset counters and route the anomaly to `stargate.printer.anomalies.v1` (where Flink routes it anyway) — and use that SAME anomalies coordinate in the SSE frame so the drawer's deep-link `topic:partition:offset` resolves to the durable row.
- **Gate the bridge hook so flag-off means zero DB coupling.** Check `STARGATE_DURABLE_SINK_ENABLED` BEFORE the `from app.db import get_telemetry_cursor` (the import lives inside the gated branch), wrap the write in a bare `try/except: pass`, and never let a durable-write failure escape — the in-memory SSE bridge has a hard no-DB-in-hot-path contract. A subprocess test with no `DATABASE_URL` and the flag off proves purity; a `get_telemetry_cursor`-raises test proves the hot path survives a DB outage.

**Live Confluent round-trip from a workstation (Phase 7 sign-off):**
- **The `confluent-kafka` SR/protobuf client needs extras the bare wheel doesn't pull.** `from confluent_kafka.schema_registry.protobuf import ProtobufSerializer` fails with `ModuleNotFoundError: authlib` then `cachetools` then more — install `pip install "confluent-kafka[schemaregistry,protobuf]"` (also drags httpx/attrs). A bare `confluent-kafka` install only does plain produce/consume, not Schema-Registry-framed protobuf.
- **`build_confluent_conf` reads `CONFLUENT_BOOTSTRAP_SERVERS` / `CONFLUENT_API_KEY` / `CONFLUENT_API_SECRET`; the SR client reads `CONFLUENT_SR_URL` / `CONFLUENT_SR_API_KEY` / `CONFLUENT_SR_API_SECRET`.** Cluster + SR are SEPARATE resources needing SEPARATE API keys: `confluent api-key create --resource lkc-…` (cluster) and `--resource lsrc-…` (SR). Get the SR cluster id from `confluent schema-registry cluster describe -o json` → the `cluster` field (NOT `cluster_id`, which renders blank). Bootstrap is `confluent kafka cluster describe <lkc> -o json` → `endpoint` (strip the `SASL_SSL://` prefix). API-key secrets are shown ONCE at creation — capture them in the same shell session; you cannot reuse a key whose secret you didn't save.
- **The delivery callback's `msg.partition()/msg.offset()` IS the authoritative broker coordinate** — you don't need a separate consumer to learn where a produced record landed. For a real-coordinate provenance proof, produce with an `on_delivery` callback, then persist with `make_provenance("cloud", {kafka_partition, kafka_offset, …})` so the durable row's coordinate equals the broker's (`source_system=confluent_cloud`, `synthetic=false`).
- **`lkc-gqpvvyv` is shared infra** — it also hosts `history-rhymes.signals.v1`, `winston.executions.v1`, `sample_data*`. "Kill all cost" after a test does NOT mean delete the cluster (that destroys those other subsystems' topics and only saves the small STANDARD flat hourly base). The right teardown is: delete the API keys you created + `stop-serving` (lossless: 0 connectors, 0 running Flink statements, topics retained). A STANDARD cluster has no CKU-hour billing; produce + idle pools accrue ~nothing.

**Follow-up: proto_gen bindings lag the registered SR schema (Phase 7).** After registering proto v3 on the Confluent SR, the in-repo `scripts/streaming/stargate/proto_gen/stargate_telemetry_pb2.py` bindings can still be v1 — the capture-mode JSON fixture carries the v3 fields, so capture/CI/Railway/demo are unaffected, and the cloud round-trip can still prove real-coordinate provenance with v1-payload messages. But do NOT claim full on-the-wire v3 FIELD production in cloud mode until the bindings are regenerated: `pip install grpcio-tools` then `python -m grpc_tools.protoc -I infra/confluent/proto --python_out=scripts/streaming/stargate/proto_gen stargate_telemetry_v3.proto` (emit as `stargate_telemetry_pb2.py`, the name producer.py imports). "Schema registered in SR" and "producer serializes the new fields" are two different milestones.

**Composing a feature over existing surfaces instead of rebuilding (Data Engineering section, PR #337):**
- **Look for the data layer before you build one.** The "Automated Data Engineering" reframe LOOKED like a big new build (grain, lineage, relationships, pipelines) but ~70% already existed: the telemetry **metadata catalog** (`backend/app/data/telemetry/metadata_catalog.json`, enriched live from Postgres) already carries per-node `layer`/`grain`/`primary_key`/`foreign_keys`/`owner`/`freshness`/`status` and typed edges with `confidence`, surfaced by `repo-b/src/lib/telemetry/metadata.ts` + `metadata/{MetadataDetailDrawer,LineageDrawer,MetricLineageExplorer}.tsx`. The right move was re-presentation, not reimplementation. Always sweep for an existing catalog/lineage/metadata layer first.
- **Compose without breaking a portability ADR.** ADE is platform-core per ADR 0002 ("grep telemetry in the core package returns nothing"). The composed section lives entirely in the telemetry package (`repo-b/src/components/telemetry/data-engineering/`), which is allowed to IMPORT `@/lib/automated-data-engineering/api` and even the ADE components — importing into telemetry adds no telemetry ref to the core, so the grep test still passes. Verify with `rg -n "telemetry|RS_" repo-b/src/{components,lib}/automated-data-engineering` (only a benign `WorkflowDomain` enum value `"telemetry"` matches today).
- **Telemetry route pages are SERVER components** (`async` + `await params`), NOT the client `useParams` pattern — `await params` on Next-14's plain `params` object just returns it (see `telemetry/metadata/page.tsx`). The client `use(params)` crash (React #438) only bit `"use client"` pages; server pages were always fine. New nested sections: add page.tsx server wrappers + components.
- **Adding a telemetry sidebar group is data-only** in `telemetryNav.ts` (add to `TelemetryNavGroup` union + `TELEMETRY_NAV_GROUPS` + `TELEMETRY_NAV`); the sidebar auto-renders. BUT `TelemetrySidebar.tsx` has a `GROUP_ACCENT: Record<TelemetryNavGroup, string>` — a new group breaks tsc until you add its accent. Nested slugs like `data-engineering/grain` work directly through `telemetryHref`/`isTelemetryItemActive` (the parent overview item also highlights on child routes — acceptable).
- **Old-route compatibility = server `redirect()`** from `next/navigation` in each old page.tsx (Next 14, env params via `await params`). The wrapping layout still renders, so also strip its shell wrap (`AdeLayout` → `return <>{children}</>`) since the redirect short-circuits anyway.
- **vitest unhandled-rejection guard fails "fail-closed" tests** that mock a fetch with `mockRejectedValue` (already-rejected promise rejects before the component's `.catch` attaches; the rejection fires post-teardown via the timer and is attributed to the test). Fix: mirror the repo pattern — `mockResolvedValue(null)` and make the component treat a null/falsy fetch result as the fail-closed state too (real `apiFetch` can both throw AND the test can resolve-null). One branch, both paths covered, no rejection.

## Telemetry page header system (dispatch 0009, 2026-06-24)

- **One header family across a 20-route env.** `TelemetryPageHeader` with four role-based variants
  (`hero` opening page only · `evidence` evidence/lineage · `standard` analytical · `compact` operational)
  makes every route scan as one typographic system. Migrate page-by-page (one ticket per role group),
  each with tsc + the page's vitest + a screenshot, so a bad swap is caught before merge.
- **Reuse the env's already-loaded fonts.** Cormorant (`--font-editorial`) + Inter Tight (`--font-display`)
  + JetBrains Mono were already wired via next/font in `app/layout.tsx` and exposed as CSS vars on `<html>`
  — the header references the vars; no new font infra. Editorial serif for hero/evidence titles, Inter
  Tight for standard/compact, mono for eyebrows/ids/metrics; colors stay on the `C` palette.
- **The header carries no data.** It exposes `metadata`/`actions`/`metrics` slots; callers move their
  EXISTING live chips/lag/verdict/controls/source-strips into those slots verbatim (preserve onClick,
  disabled, live state, and every string). Fail-closed states and copy never change in a header migration.
- **Migrating a header ≠ touching the body.** For RS consoles (Registry, Factory/NCR, Mission Control)
  swap only the top strip to the header; keep the RS body, charts, drawers, and honesty copy. For a page
  whose error/empty branch returns BEFORE the header (e.g. MetadataExplorer), the header won't show in
  that state — that's fine; cover it with the component's unit test, not a data-dependent screenshot.
- **Parallel subagents per file work well for a mechanical, well-specified swap** with strict
  "byte-identical strings, run tsc+test+lint" rules — but always re-run a CENTRAL tsc+lint+vitest after,
  because a `next lint` run issued mid-edit by one agent will report a transient parse error in a file
  another agent is still writing (it resolves once both finish).
- **Local screenshot harness for env pages:** dev server with `PLAYWRIGHT_BYPASS_AUTH=1` (admin session →
  env access) + `BOS_API_ORIGIN=<railway backend>` so `/api/telemetry/*` proxies to real data; junction
  `node_modules` into the worktree; Playwright at 1440×900, env `telemetry-demo`. The playwright.config
  webServer already sets `PLAYWRIGHT_BYPASS_AUTH=1` for `tests/*.spec.ts`.

**Schema Registry exports — validate after export; don't blind-redirect stderr:**
- **`confluent schema-registry schema describe` has NO `-o`/`--output json` flag** (unlike `kafka cluster/topic describe` and `flink compute-pool describe`, which do). Passing `-o json` errors; a blind `… -o json 2>&1 > file.json` writes the CLI error dump INTO the file. This silently corrupted all 4 `infra/confluent/stargate/schemas/*-value.json` at birth — they looked exported but contained `Error: unknown shorthand flag: 'o'`.
- **`describe` prints a human `Schema ID:/Type:/Schema:` block, not JSON.** To make a `.json` artifact: capture stdout only (no `2>&1`), parse out id/type, and emit `{subject, version, id, schemaType, schema}`. **JSON**-type subjects embed the parsed schema object; **PROTOBUF/AVRO** subjects embed the raw schema text as a string (the protobuf telemetry subject's body is a `.proto`, not JSON — don't `JSON.parse` it).
- **Always validate exported schema JSON before committing:** `json.load` each file AND grep for `Error:`, `Usage:`, `failed`, `Unauthorized`, `Forbidden`. (Note `confluent` alone is a false-positive grep: real Avro schemas contain `io.confluent.connect.*` annotation keys.)
- **Never hand-write a schema export when live Schema Registry is reachable** — query it (`confluent schema-registry schema list` / `describe --subject … --version latest`) so the artifact matches the registered subject/id exactly.

## Claude session and routing lessons (2026-06-25)

- Claude project skills must be discoverable under `.claude/skills/`. Keep the
  procedural source in one canonical `skills/` or `.skills/` body and generate a
  thin wrapper; otherwise direct skill invocation fails as "Unknown skill."
- The shared checkout is unsafe when multiple agents run. Create a dedicated
  worktree from fresh `origin/main` before mutation, and never branch-switch,
  reset, clean, stage, or commit the shared checkout.
- A continuation starts with a state delta: git HEAD/diff, worktrees, selected
  plan, active PR, ADO item, tests, and deploy state. Conversation history is
  supporting context, not the current source of truth.
- The current runtime map is `backend/`, `repo-b/`, `telemetry-platform/`,
  `excel-addin/`, `orchestration/`, `scripts/`, and persistence assets.
  `repo-c/` is retired; lab compatibility APIs live in `backend/`.
- ADO is risk-based: R0 read-only, R1 focused reversible, R2 governed.
- Full delivery means tests → commit/push → PR/CI → merge → applicable
  main-branch deploy → smoke verification. Frontend deploys from merged main;
  backend deploys only from a clean main checkout.
- `docs/tips.md` stores durable repeated lessons. Temporary branch, PR, and task
  state belongs in ADO, the active plan, `next-session.md`, or local memory.
- Instruction validation must be Windows-safe and fail when an active target or
  generated Claude wrapper is missing.
- Never store credential values in instructions, reports, transcripts, tips, or
  automatic memory.
- `vercel env ls production` proves only that a variable name exists, not that it has a usable
  value. Before authenticated production smoke, pull the environment to a temporary file, verify
  required reviewer values are non-empty without logging them, and delete the file immediately.

## Overview pages as thesis pages (telemetry Overview redesign)

- **An Overview page is the thesis, not a gallery.** The job is to make the rest of the product feel
  necessary in one coherent surface — stop saying "here are some interesting visuals," start saying
  "this is why the rest of this exists." Lead with one argument, one hero visualization, one strong
  explanatory card, and a clear path onward; cut anything that doesn't serve that line.
- **Reduce chart fragmentation: one integrated hero beats three widgets.** Three sibling tabs
  (Bottleneck Map / Cost to LEO / Who Flies) read as disconnected dashboards. Collapsing them — keep the
  primary chart, demote one series to a headline number, fold the third into the hero as a contextual
  layer — turns "three things to explain" into "one thing to absorb."
- **Integrate a contextual layer as a subordinate underlay, not a co-equal series.** Render it FIRST in
  a recharts ComposedChart (DOM order = paint order, so it sits behind bars/scatter), give it its own
  hidden axis, and keep it quiet (low fill/stroke opacity). Label it honestly ("contextual underlay") so
  it reads as backdrop, never as the primary signal. Map its domain so the wave stays low in the frame.
- **A Play/guided-story control beats a generic "Present" button.** A ▶ Play affordance implies a
  walkthrough; reuse the existing presenter step-state instead of building new behavior. If full
  step-through isn't feasible, still replace the control visually and leave the behavior staged honestly
  — never fake hidden pseudo-functionality.
- **Make explanatory burden explicit with a rail, not inference.** A compact "constraint solved → new
  burden created" strip tied to the chart does the thesis work the bubbles alone can't. Keep it
  qualitative — never fabricate volume numbers to make a point land.
- **Preserve evidence/claim integrity during a visual redesign.** A composition pass must not touch
  shipped ML/evidence values, artifacts, caveats, or fail-closed behavior. Keep edits to
  page-composition/narrative/visualization; render Big Numbers locally rather than editing a *shared*
  header component (blast radius); and keep source honesty loud — if an ETL isn't wired, say
  "source ETL not connected — curated/static anchors," don't imply a live feed.
- **In a contended frontend zone, ship the conflict-free way.** Confirm the target files are settled
  (no in-flight PRs touching them) before editing, work in an isolated worktree off origin/main with a
  junctioned node_modules, stay strictly within the assigned files, and land fast.

**Telemetry Data Engineering Phase 2A–2D (relationship safety, workbench, workflows, real receipt):**
- **Infer verdicts from existing metadata; require positive evidence for the "good" verdict.** Metadata edges carry NO join keys, so `relationshipSafety.ts` derives safe/bridge/unsafe/unverifiable from node `grain` + `primary_key`/`foreign_keys` + `status` + edge `relationship`/`confidence`. The rule that keeps fake greens off the screen: "safe" ONLY with a declared FK to the target's `object_name` OR identical declared grain (explicit + both fresh); everything else fails closed to "unverifiable" with a null_reason. Transform edges are always bridge-required (grain changes by design); consumption/quality edges aren't joins. Unit-test "no safe without metadata" explicitly.
- **A grounded scenario beats an illustrative one — and stays honest for free.** The "vibration+temperature → failed Stargate prints" walkthrough resolves REAL node ids (`stream_stargate_telemetry`, `metric_stargate_signature`, committed predicate `melt_pool_temp_c < 1400.0 AND arm_vibration_g > 0.08`) and runs the SAME classifier on the real edges; missing nodes → fail closed. Verify ids against the MINIFIED `metadata_catalog.json` with `rg -o '"id":"[a-z_]*stargate[a-z_]*"'` (no space after the colon).
- **Match curated capabilities to the live registry with SPECIFIC tokens; check the real registry before writing copy.** Curl `/api/ade/skill-registry` and grep first: only `sql.validate_query` truly backs dry-run SQL; `receipt`/`pr`/`contract` substring hits are wrong-domain (accounting receipts, approvals, a sql-with-contract runner). Loose substring matchers fabricate backing. The honest outcome (8 of 9 capabilities declared-only) IS the product story.
- **Executability must never claim more than the runtime offers.** `workflowTemplates.ts` returns at most `read_only_template` (never `executable` — no run path is wired); unbacked skill-step → `blocked`; registry unreadable → `unavailable`. Test that NO template is ever "executable" even when every step is mocked as backed.
- **To surface a NEW receipt without editing ADE core, write your own audit stream.** `/api/ade/runs` hard-filters `action == "mcp.tool_call"` — adding an action there means editing off-limits ADE core. Instead a telemetry-router endpoint writes a real `app.audit_events` row via `app.services.audit.record_event(action="ade.de.…")` (reusable service, not ADE core), and a sibling GET reads `list_events` filtered to `ade.de.*`. Both demos share business_id `7e1eb000-0000-4000-a000-000000000001`, so the action-prefix split keeps the two receipt streams separate.
- **A read-only action can legitimately leave one write — its own receipt.** Record a FAILED attempt honestly (`success=false`+`error_message`), don't hide it. `apiFetch` applies `params` as a query string on POST too, so `apiFetch(path,{method:"POST",params})` sends `?env_id=…&business_id=…` with no body.
- **Backend-touching slices need an explicit Railway deploy to verify in prod.** Vercel auto-deploys the frontend from main; the Railway backend does NOT. After merge, set a worktree to origin/main, run `scripts/deploy_backend.sh` (ships CWD tree, stamps SHA into `/api/version`), poll `/api/version` for the SHA, then curl the new endpoint. A frontend PR calling a not-yet-deployed backend endpoint 404s until you deploy.
- **Backend route tests run in CI's Backend Lint job and need no live DB** — mirror `test_telemetry_findings.py`: the `client` TestClient fixture + `monkeypatch.setattr` on lazily-imported service modules (`app.services.audit`, `app.services.telemetry_metadata`). Patch `record_event`/`list_events`/`get_metadata_graph`; assert the route's own shaping + fail-closed branches.

## Replay model diagnostics — sources, MLflow/Databricks linking, null-reason contracts (ADO #734, 2026-06-25)

Shipped `scoringDiagnostics` + `lineage` on `GET /api/telemetry/replay` (PR #369). The drawer's Model/Evidence/Operator/Lineage tabs now show real provenance instead of only fail-closed placeholders. Durable lessons:

- **The replay endpoint is DB-free — it reads the committed `backend/app/data/telemetry/replay_fixture.json` (cached in `_replay_cache`).** Any new replay diagnostic must be computable from that fixture + backend constants, or fetched on the frontend from a *different* endpoint. Never add a DB read to the public `/replay` path. To force a fresh fixture load in tests: `svc._replay_cache = None`.
- **The real detector threshold is a backend constant, not a payload field:** `DETECTOR_THRESHOLD = MAD_K * GLOBAL_TRAIN_SCALE = 4.0 * 0.033866801182436346 = 0.13546720472974538` (residual units). Expose it from the backend so the frontend never hard-codes a metric (telemetry env rule). A test pins `threshold == live /score threshold` so the surface can never invent a second threshold.
- **`feed[].score` is degenerate (~1e12 at fire ticks) — NEVER a threshold axis.** Severity must be derived from `residual = abs(value - rmean)`, the quantity the MAD rule actually thresholds.
- **THE TRAP that drove a full rework:** the intake assumed `score_t = residual / threshold` reproduces `model_pred`. It does NOT for D-4 — **0 of 412 fired ticks** exceed the global-fallback threshold (max fired residual 0.070 << 0.135). The champion fired on a tighter **per-channel** scale the serving constants do not carry. A per-tick "honest score → GO" rendered next to a fired model is a contradiction, not honesty. **When a recomputed statistic diverges from the model's own output, surface the divergence as the diagnostic and let the model's flag stay authoritative — don't invent a verdict.** Verify the assumption against the real fixture (`for p in feed if p['model_pred']==1: count residual>threshold`) BEFORE building the per-tick UI.
- **Held-out metrics come from a different endpoint.** Replay is in-sample (single channel D-4, strided) → any P/R/F1 from it is replay-feed *agreement*, not validation. Real promoted-model metrics are served by `/api/telemetry/model-performance`; the Model tab fetches that lazily and the caveat travels with the numbers.
- **MLflow/Databricks deep-links: reuse `@/lib/lab/factoryEvidenceLinks` (`mlflowRunLink`, `mlflowExperimentLink`, `deltaTableLink`).** Each returns `{label, kind, href, copyText, unavailableReason}`; `resolveWorkspace()` falls back to the committed default workspace `https://dbc-2504bec5-b5ab.cloud.databricks.com`, so links are **live by default even in jsdom tests** (no env needed). A `LinkRow` renders a real `<a target="_blank">` when `href` is set, else a fail-closed `NaRow` with `unavailableReason`. Note the two conflicting MLflow run ids (fixture `4a48cb6a…` vs real Databricks `b93e13f7…`) — surface both, never reconcile.
- **Null-reason contract:** every absent field renders `Not available — <specific reason for THIS payload>` from the shared `NA_REASONS` map in `replayDiagnostics.ts` (component + tests import the same strings so copy and assertions never drift). The reason names the missing source, not a generic "no data."
- **Visual gate without booting the whole backend:** the backend validates `DATABASE_URL` at import, so a local backend needs the full secret set. Instead run a ~50-line stdlib mock (`http.server`) that serves `/api/telemetry/replay` with the exact new shape (real fixture + the same constants the backend emits) and **proxies every other `/api/telemetry/*` to the live prod backend** so model-performance/copilot stay real. Point the worktree dev server's `BOS_API_ORIGIN` at it (`PLAYWRIGHT_BYPASS_AUTH=1`, a dummy `NEXT_PUBLIC_SUPABASE_*`). Restart the mock after editing the shape — it loads the fixture once at startup.
- **Test commands that worked (from the worktree `repo-b/`):** `npm run typecheck`; `npx vitest run src/lib/telemetry/replayDiagnostics.test.ts src/components/telemetry/ReplayForensicsDrawer.test.tsx` (adapter + drawer); `npx vitest run src/components/telemetry src/lib/telemetry` (full suite, 208). Backend (from `backend/`): `python -m pytest tests/test_telemetry_serving.py -q`.

**Telemetry lineage live rehearsal (Ticket 8) — what bit us:**
- **New tel_* tables need an out-of-band GRANT to `telemetry_app`.** Migrations don't manage grants in this repo; `10033`'s tables were granted manually, so `10034`'s `tel_stream_triage_events` had NONE and the triage routes 500'd `permission denied`. Symptom: a route reads one table fine (kafka_rows) but 500s on a sibling. Fix as Lakebase owner: `GRANT SELECT,INSERT,UPDATE,DELETE ON <table> TO telemetry_app;` (via the Databricks-CLI owner credential). Add tel_* grants to a repeatable role-setup script.
- **The durable Kafka consumer can't run on the Railway backend image.** It needs `confluent-kafka` (ships only in the laptop tooling venv, not the backend image) AND `CONFLUENT_*` creds (not on `authentic-sparkle`). With the flag on but no client/creds it fails closed (not_available offset receipt + idle) — correct, but it means "enable the prod consumer" never lands rows. Run the consumer from the laptop tooling venv instead.
- **Confluent Flink AI `CREATE MODEL` option names are version-specific.** This CLI (v4.60) wants `OPENAI.MODEL_VERSION` / `OPENAI.SYSTEM_PROMPT` / `OPENAI.INPUT_FORMAT` / `OPENAI.OUTPUT_CONTENT_TYPE` — not lowercase `openai.*` + `task`/`provider`. `ML_PREDICT` takes the model as a **backtick identifier**, not a string (`ML_PREDICT(\`model-name\`, input)`), and use `LATERAL TABLE(ML_PREDICT(...))` (not `CROSS JOIN LATERAL`). Even with valid SQL, the OpenAI call 400'd until output/response format is configured — budget iterations (each spins Flink CFU + an OpenAI call). Check `confluent flink statement describe <name>` for the real error; the `list` view truncates.
- **Always verify Flink teardown drained to 0 CFU.** Deleting statements doesn't instantly drop the pool's CFU — wait ~30-60s and re-check `confluent flink compute-pool list`. Delete the model with `DROP MODEL` (a statement), the connection with `flink connection delete`, and any Flink-owned topic you created. The STANDARD Kafka cluster bills while it exists — park/delete via the lifecycle skill, don't leave it for the demo to discover.

## Stargate Bronze Delta loader (lineage Ticket A) — bounded batch + dry-run (2026-06-25)

Scaffold for landing the raw Stargate printer Kafka stream into `novendor_1.telemetry.bronze_stargate_printer`, so Ticket B can stamp the `tel_stream_*` Databricks pointer columns and the lineage drawer's lake layer flips to `available`. ADR: `docs/adr/telemetry-lineage/0001-databricks-lake-mapping.md`.

- **All decision logic is pure and testable in `telemetry-platform/stargate_bronze_core.py`** (no pyspark/kafka/databricks imports): the table contract + DDL, the `GuardRails`, the bounded `plan_offsets()`, the `bronze_select_exprs()` Kafka→bronze mapping, and the run-receipt builder. Tests: `python -m pytest telemetry-platform/test_stargate_bronze_core.py -q` (mirrors the `test_*_core.py` convention; **not run in CI** — CI only runs `backend/tests` and `rs_factory_seed/tests`, so run telemetry-platform core tests locally).
- **The loader `telemetry-platform/databricks/notebooks/stargate_bronze_loader.py` is the thin Spark/Kafka shell.** Default mode is `--dry-run`; writing needs `--execute` AND a non-empty bounded plan. There is no unbounded read path — a cold partition (no checkpoint) reads only the last `cold_start_tail` offsets, never the whole backlog.
- **Credential-free evidence path (no Kafka, no Spark, no secrets):** `python telemetry-platform/databricks/notebooks/stargate_bronze_loader.py --dry-run --fixture telemetry-platform/databricks/notebooks/fixtures/stargate_bronze_dryrun.example.json` prints the receipt (planned ranges, `rows_written: 0`, clamp reasons). Use this to validate the plan before any credentialed run.
- **Checkpoint = `MAX(kafka_offset)+1` per partition already in the bronze table** (no separate offset table). Re-running is idempotent: once a range is consumed, the next plan is `caught_up` with 0 records.
- **Real Databricks run is human-gated.** Broker creds come from env only (`CONFLUENT_BOOTSTRAP_SERVERS` / `CONFLUENT_API_KEY` / `CONFLUENT_API_SECRET`), never committed. Submit as a one-shot job so the job cluster tears down after the bounded read — no long-running stream. Exact commands are at the bottom of the loader file.
- **The loader never touches Postgres.** Pointer stamping is Ticket B (separate PR), which reads this table's `DESCRIBE HISTORY` version and UPDATEs `tel_stream_kafka_rows` / `tel_stream_triage_events` matched on `(kafka_topic, kafka_partition, kafka_offset)`.
