---
id: claude-router
kind: router
status: active
source_of_truth: true
topic: global-routing
owners:
  - cross-repo
intent_tags:
  - build
  - bugfix
  - research
  - qa
  - deploy
  - sync
  - data
  - docs
  - ops 
triggers:
  - CLAUDE.md
  - Winston`
  - Business Machine
entrypoint: true
handoff_to:
  - instruction-index
  - winston-router
when_to_use: "Use first for any repo-local request when the correct downstream agent, skill, or prompt is not already explicit."
when_not_to_use: "Do not stay here after a downstream doc is clearly selected by command, file path, owning surface, or explicit agent or skill mention."
surface_paths:
  - backend/
  - repo-b/
  - repo-c/
  - excel-addin/
  - orchestration/
  - scripts/
  - docs/
  - supabase/
commands:
  - /research
  - /build
  - /propose
  - /outreach
  - /content
  - /ops_status
  - /brief
  - /cost

## Mass Deletion Protection

**Policy**: No commit or PR may delete >100 files without explicit review and approval.

**Enforcement**:
- `.githooks/pre-commit`: Blocks staged deletions >100 files before commit (local safety)
- `.github/workflows/ci.yml` `check-mass-deletion` job: Fails PR if >100 files deleted (remote gate)

**If you hit the limit**:
1. Break the change into smaller commits (one logical refactor per commit)
2. Document why the deletions are necessary in the commit message
3. Request explicit review in the PR description

**Exception process**: If a mass deletion is legitimate (e.g., removing a deprecated subsystem), add `[MASS_DELETE_APPROVED]` to the commit message AND include a link to a discussion/issue that approved the deletion.

notes:
  - Global routing lives here. Downstream docs should link back instead of repeating repo-wide dispatch tables.
  - Use `PORTABILITY.MD` when a request touches client forkability, white-labeling, tenant packs, or new-client spin-up.
---

# CLAUDE Router Contract

`CLAUDE.md` is the canonical router for repo-local prompt behavior. It decides which downstream `agents/*.md`, `skills/*.md`, `.skills/*.md`, or selected `docs/*.md` file should own the next step.

When a request touches client portability or white-labeling, keep the three-layer split from `PORTABILITY.MD` in view: `platform core`, `environment package`, and `client config`.

## Routing Precedence

1. Explicit skill, agent, harness, or command mention
2. Explicit file path or owning surface match
3. Dominant intent in the request
4. Supporting docs from the selected doc's `handoff_to`

## Intent Taxonomy

| Intent | Primary target |
|---|---|
| bootstrap, session startup, repo identity, working directory sanity check | `skills/winston-session-bootstrap/SKILL.md` |
| implementation, bug fix, endpoint, page, component | `.skills/feature-dev/SKILL.md` |
| chat workspace, response blocks, inline charts/tables, conversational transforms | `skills/winston-chat-workspace/SKILL.md` |
| dashboard composition, intent parsing, query transparency, blank widgets, entity_ids | `skills/winston-dashboard-composition/SKILL.md` |
| REPE write tools, mutation flow, AdvancedDrawer, live status | `skills/winston-agentic-build/SKILL.md` |
| behavior guardrails, post-mortem, audit remediation, fix-all regressions | `skills/winston-remediation-playbook/SKILL.md` |
| prompt normalization, convert meta prompt to skill, instruction cleanup, retire legacy prompt | `skills/winston-prompt-normalization/SKILL.md` |
| attached document ingestion, document-to-asset creation, extraction pipeline | `skills/winston-document-pipeline/SKILL.md` |
| latency, reranking, model dispatch, prompt budget, performance architecture | `skills/winston-performance-architecture/SKILL.md` |
| shared Next.js UI, app shell, component fixes, proxy routes, client integration glue | `agents/frontend.md` |
| Business OS FastAPI routes, schemas, services, and non-AI domain logic | `agents/bos-domain.md` |
| Demo Lab environments, industry templates, repo-c APIs, lab pages, uploads, pipeline, Excel touchpoints | `agents/lab-environment.md` |
| AI gateway, prompt policy, RAG, assistant behavior, model routing, response rendering | `agents/ai-copilot.md` |
| MCP registry, tool schemas, permissions, audit policy, planner and tool-context contracts | `agents/mcp.md` |
| credit decisioning, walled garden, chain-of-thought, format lock, consumer credit AI, credit underwriting, corpus, citation chain | `.skills/credit-decisioning/SKILL.md` |
| credit environment build, credit workspace implementation, credit MCP tools | `skills/winston-credit-environment/SKILL.md` with `.skills/credit-decisioning/SKILL.md` as support |
| PDS platform build, PDS prompt sequence, executive automation, JLL PDS analytics | `skills/winston-pds-delivery/SKILL.md` |
| architecture, audit, repo mapping, plan | `agents/architect.md` |
| Winston or Novendor routing, harness selection, Telegram command surface | `skills/winston-router/SKILL.md` |
| repo sync, fetch, pull, dirty-tree checks | `agents/sync.md` |
| push, deploy, CI, Railway, Vercel, production verification | `agents/deploy.md` |
| QA, regression, smoke test, validation | `agents/qa.md` |
| site audit, design review, tour paulmalmquist.com, mobile audit, site performance, REPE usefulness, PDS usefulness, AI synchronicity | `skills/site-audit/SKILL.md` |
| post-deploy verification, smoke test production, verify deploy, check if fix worked, log in and check environments | `skills/winston-post-deploy-verify/SKILL.md` |
| schema, SQL, migrations, ETL, seeds | `agents/data.md` |
| research ingestion from `docs/research/*` | `.skills/research-ingest/SKILL.md` |
| CRM lookup, prospect enrichment, contact record, Apollo search, add to CRM, find contact, is [company] in Apollo, track outreach | `skills/winston-sales-intelligence/SKILL.md` with `docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md` as reference and `agents/outreach.md` as support |
| demo idea generation, demo script, demo pipeline, demo concepts for Winston sales, what should we demo, demo for this week | `skills/winston-demo-generator/SKILL.md` |
| autonomous loop setup, self-improving environment, autonomous coding schedule, set up autonomous improvement | `skills/winston-autonomous-loop/SKILL.md` |
| historyrhymes, financial ML, quantitative research, feature engineering, Databricks ML, MLflow, model training, backtest strategy, trading ML, crypto ML, prediction market models | `skills/historyrhymes/SKILL.md` with `skills/market-rotation-engine/SKILL.md` as support |
| portability, forkability, white-labeling, tenant pack, client pack, environment package, capability pack, hardcode audit, clone Winston for a client | `agents/architect.md` with `PORTABILITY.MD` as reference |
| business-side Novendor commands | `agents/operations.md`, `agents/outreach.md`, `agents/proposals.md`, `agents/content.md`, `agents/demo.md` |
| explicit prompt or playbook request | matching normalized skill when one exists; otherwise selected `docs/WINSTON_*PROMPT*.md` |

## Owning-Surface Map

| Surface | Owner | Typical downstream docs |
|---|---|---|
| root bootstrap markdown (`BOOTSTRAP.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `SOUL.md`, `HEARTBEAT.md`) | Winston session bootstrap | `winston-session-bootstrap`, `winston-router` |
| `repo-b/` | Shared Next.js UI, app shell, and direct-DB handlers | `agents/frontend.md`, `feature-dev`, `qa-winston`, `data-winston` |
| `repo-b/src/app/lab/`, `repo-b/src/lib/lab/`, `repo-b/src/app/api/v1/`, `excel-addin/` | Demo Lab frontend, environment workflows, and Excel touchpoints | `agents/lab-environment.md`, `feature-dev`, `qa-winston` |
| `backend/app/mcp/` | MCP registry, tools, schemas, audit, and permissions | `agents/mcp.md`, `qa-winston` |
| `backend/app/services/ai_gateway.py`, `backend/app/services/ai_conversations.py`, `backend/app/services/assistant_blocks.py`, `repo-b/src/components/copilot/`, `repo-b/src/components/winston/` | AI gateway, RAG, assistant behavior, and response rendering | `agents/ai-copilot.md`, `feature-dev`, `qa-winston` |
| `backend/` | FastAPI Business OS APIs and domain services outside MCP and AI-specialist slices | `agents/bos-domain.md`, `feature-dev`, `architect-winston`, `qa-winston`, `data-winston` |
| `repo-c/` | Demo Lab backend and environment provisioning | `agents/lab-environment.md`, `feature-dev`, `qa-winston` |
| `META_PROMPT_CHAT_WORKSPACE.md` | Winston chat workspace brief | `winston-chat-workspace`, `feature-dev` |
| `prompts/` | Dashboard composition prompt lineage | `winston-dashboard-composition`, `feature-dev` |
| `repo-b/src/app/lab/env/[envId]/credit/`, `backend/app/services/credit*.py`, `backend/app/routes/credit*.py` | Consumer credit decisioning surface | `credit-decisioning`, `feature-dev`, `data-winston` |
| `repo-b/db/schema/274_*`, `repo-b/db/schema/275_*`, `repo-b/db/schema/277_*` | Credit schema and data contracts | `data-winston`, `credit-decisioning` |
| `repo-b/db/schema/`, `supabase/` | SQL-first schema and data contracts | `data-winston`, `feature-dev` |
| `orchestration/`, `scripts/` | operational tooling and agent workflows | `commander-winston`, `sync-winston`, `deploy-winston`, `feature-dev` |
| `skills/historyrhymes/`, Databricks notebooks, `novendor_1.historyrhymes.*` | Financial ML, feature engineering, model training, backtesting | `historyrhymes`, `market-rotation-engine` |
| `PDS_*.md`, `docs/plans/PDS_*` | PDS staged delivery prompt set | `winston-pds-delivery`, `architect-winston` |
| `docs/` | normalized skills, prompt references, and playbooks | matching skill, explicit prompt reference, or `architect-winston` |
| external Novendor workspaces | business-side workstreams | `operations`, `outreach`, `proposals`, `content`, `demo` |

## Portability Guardrails

- Classify meaningful work as `platform core`, `environment package`, or `client config` before spreading behavior across shared code.
- Keep source-system quirks in adapters, mappings, and sync layers; shared UI and business logic should depend on canonical contracts.
- Treat branding, module labels, prompts, report wrappers, email copy, URLs, and role templates as overridable unless the request is explicitly repo-internal only.
- Prefer capability flags and environment manifests over scattered per-client conditionals in routes, components, or services.
- New-client onboarding should trend toward `load config + bind secrets + run bootstrap`, not repo-wide source edits.
- If a request is specifically about forkability or transferability, route planning to `agents/architect.md`; for implementation, keep the owning surface but still use `PORTABILITY.MD` as a design constraint.
  
## Database Guardrails

Every autonomous coding session that can touch SQL, seeds, schema contracts, or direct-DB handlers must read [`ARCHITECTURE.md`](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/ARCHITECTURE.md) before proposing or writing a migration.

Mandatory database rules:

1. Every `CREATE TABLE` must be followed by `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and a tenant-isolation policy using `env_id = current_setting('app.env_id', true)`.
2. Every new user-facing table must include `env_id TEXT NOT NULL` and `business_id UUID NOT NULL` unless the table is a shared dimension or reference table explicitly exempted in `ARCHITECTURE.md`.
3. Before creating a table, query the existing schema and confirm an equivalent table does not already exist.
4. New schema files must follow `NNN_module_description.sql` in [`repo-b/db/schema/`](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/repo-b/db/schema), using the next sequential number.
5. Only approved prefixes from `ARCHITECTURE.md` may be used for new tables.
6. New indexes require a named query path or workload justification.
7. Add `COMMENT ON TABLE` for every new table explaining its purpose and owning module.

## Autonomous Intelligence Directory

22+ scheduled tasks run daily and write structured outputs to `docs/`. **Any coding agent should check relevant intelligence folders before starting work** — they contain competitor findings, feature ideas, test results, and production health data that directly inform implementation decisions.

### Quick Bootstrap

Read `docs/LATEST.md` first — it's a machine-readable manifest updated every morning with pointers to the most recent output from every scheduled task. One file, full situational awareness.

### Capability Inventory

Read `docs/CAPABILITY_INVENTORY.md` before suggesting new features or builds. It catalogs every deployed capability (258 pages, 208 services, 31 MCP tool categories, 32 lab environments). **If a capability already exists, suggest an enhancement — not a duplicate build.** All suggestion-generating scheduled tasks must cross-reference this file.

### Intelligence Folder Map

| Folder | Updated | What's in it | When to consult |
|---|---|---|---|
| `docs/LATEST.md` | Daily 7:30 AM | Manifest of all latest task outputs with dates and 1-line summaries | **Always — read this first in any new session** |
| `docs/CAPABILITY_INVENTORY.md` | Daily 7:30 AM | What's already built: 258 pages, 208 services, 31 MCP categories, 32 environments | **Before suggesting ANY new feature or build** |
| `docs/daily-intel/` | Daily 7 AM | AI/REPE market news, newsletter summaries, strategic implications | Before any positioning or feature prioritization work |
| `docs/feature-radar/` | Daily 12 PM | Prioritized feature ideas with market signals and implementation scores | Before starting any new feature build |
| `docs/competitor-research/daily-summary/` | Daily 8 AM | Competitor capabilities, Winston gaps, positioning opportunities | Before building features competitors already ship |
| `docs/competitor-research/product-opportunities/` | Daily 8 AM | Feature-by-feature comparison vs. Yardi, Juniper Square, etc. | When deciding what to build next |
| `docs/competitor-research/positioning-opportunities/` | Daily 8 AM | Messaging gaps and counter-positioning angles | Before writing any marketing copy or proposals |
| `docs/ops-reports/regression/` | Daily 2 AM | Nightly test results, DB health, deploy status | Before any deploy or after seeing test failures |
| `docs/ops-reports/deploy/` | Daily 10:30 AM | Post-deploy smoke test results, Bug 0 regression status | After any production deploy |
| `docs/ops-reports/code-quality/` | Weekly Saturday | Dead code, test gaps, CLAUDE.md violations, tech debt scorecard | Before cleanup sprints or Monday planning |
| `docs/ops-reports/digests/` | Daily 7:30 AM | Consolidated morning digest of all overnight results | Quick situational check at start of any session |
| `docs/ai-testing/` | Daily 11 PM | Winston AI feature test pass/fail report with screenshots | Before touching any AI gateway or chat code |
| `docs/ai-test-cases/` | As needed | Structured test fixtures with prompts, rubrics, and pass criteria | When writing new AI features or fixing AI bugs |
| `docs/sales-signals/` | Daily 4 PM | Qualified prospects with outreach angles | Before outreach or proposal work |
| `docs/sales-positioning/` | Daily 8 AM | Sharp counter-positioning angles vs. each competitor | Before any sales call, email, or deck |
| `docs/site-improvements/` | Daily 11 AM | Page-by-page website positioning audit with suggested copy | Before any frontend marketing changes |
| `docs/linkedin-content/` | Daily 9 AM | 3 ready-to-post LinkedIn posts with hooks and positioning | When Paul asks for content or outreach |
| `docs/demo-ideas/` | Daily 2 PM | Demo scripts with build status and persona targeting | Before building demos or preparing for sales calls |

### Meta Prompts (Build Directives)

| File | What it drives | Status |
|---|---|---|
| `META_PROMPT_CHAT_WORKSPACE.md` | Chat workspace + 6 confirmed bugs (Bug 0 = execution narration) | Active — primary build target |
| `META_PROMPT_VISUAL_RESUME.md` | Visual resume lab environment + AI assistant | Active — needs career data filled in |

### Agent Context Rule

When starting implementation work, a coding agent SHOULD:
1. Read `docs/LATEST.md` for situational awareness (30 seconds)
2. Read `docs/CAPABILITY_INVENTORY.md` to know what's already built — never suggest rebuilding existing capabilities
3. Check `docs/feature-radar/` for the latest feature priority scores if building a new feature
4. Check `docs/ai-testing/` for the latest test results if touching AI code
5. Check `docs/ops-reports/code-quality/` if doing cleanup or refactoring
6. Check `docs/competitor-research/product-opportunities/` if the feature overlaps with a competitor capability

This is not optional busywork — these files contain real production data (test failures, competitor capabilities, market signals) that prevent wasted effort and duplicated work.

## Dispatch Algorithm

1. Read the request once and extract any explicit command, harness name, agent name, skill name, or file path.
2. If a routed doc is named directly, select it unless the request also contains a stronger exclusion in that doc's `when_not_to_use`.
3. If a repo path is present, map the path to the owning surface before scoring intent.
4. Score candidate entrypoints by trigger match, surface ownership, and intent tag overlap.
5. Break ties by preferring:
   - `source_of_truth: true`
   - closer surface ownership over generic cross-repo ownership
   - `active` over `deprecated` or `archived`
   - one primary doc plus up to two supporting docs from `handoff_to`

## Ambiguity And Fallback

- Stay in `CLAUDE.md` and ask one clarifying question when the request spans multiple surfaces and no dominant intent wins.
- Do not send the user to an archived doc as a primary route.
- Prefer a normalized skill over a raw prompt doc when both exist; keep the raw prompt doc as reference material.
- If a user explicitly names a legacy prompt, open it as reference but route active execution through the current primary doc.
- Use `docs/instruction-index.md` when the route is unclear or a new routed doc must be registered.

## Concrete Routing Examples

- `bootstrap a new Winston repo-local session` -> `skills/winston-session-bootstrap/SKILL.md`
- `build the full-screen chat workspace with inline charts` -> `skills/winston-chat-workspace/SKILL.md`
- `fix blank dashboard widgets when entity_ids disappear` -> `skills/winston-dashboard-composition/SKILL.md`
- `add REPE write tools and live status feedback` -> `skills/winston-agentic-build/SKILL.md`
- `post-mortem why Winston lost the plot on writes` -> `skills/winston-remediation-playbook/SKILL.md`
- `scan our meta prompts and convert the durable ones into skills` -> `skills/winston-prompt-normalization/SKILL.md`
- `turn an attached document into an asset record` -> `skills/winston-document-pipeline/SKILL.md`
- `reduce Winston latency and improve reranking` -> `skills/winston-performance-architecture/SKILL.md`
- `build the credit decisioning MCP tools` -> `skills/winston-credit-environment/SKILL.md` with `.skills/credit-decisioning/SKILL.md` as support
- `evaluate a loan against the underwriting policy` -> `.skills/credit-decisioning/SKILL.md`
- `what does the auto loan policy say about DTI limits` -> `.skills/credit-decisioning/SKILL.md` (walled garden query)
- `add a document to the credit corpus` -> `.skills/credit-decisioning/SKILL.md`
- `build the credit portfolio detail page` -> `.skills/feature-dev/SKILL.md` with `skills/winston-credit-environment/SKILL.md` as reference
- `deploy the credit schema migrations` -> `agents/data.md`
- `execute PDS phase 8 for AI query` -> `skills/winston-pds-delivery/SKILL.md`
- `is Branford Castle Partners in Apollo` -> `skills/winston-sales-intelligence/SKILL.md`
- `add James Reddington to CRM` -> `skills/winston-sales-intelligence/SKILL.md`
- `find the CFO of [REPE firm]` -> `skills/winston-sales-intelligence/SKILL.md`
- `look up [person] at [company]` -> `skills/winston-sales-intelligence/SKILL.md`
- `generate today's Winston demo ideas` -> `skills/winston-demo-generator/SKILL.md`
- `what demos should we run for [persona]` -> `skills/winston-demo-generator/SKILL.md`
- `give me a demo script for the CFO` -> `skills/winston-demo-generator/SKILL.md`
- `audit Winston so it can be forked cleanly for a new client` -> `agents/architect.md` with `PORTABILITY.MD` as reference
- `design a client pack or tenant pack model` -> `agents/architect.md` with `PORTABILITY.MD` as reference
- `remove hardcoded Winston branding from the shared UI` -> `.skills/feature-dev/SKILL.md` with `agents/frontend.md` and `PORTABILITY.MD` as reference
- `train a regime classifier on Databricks` -> `skills/historyrhymes/SKILL.md`
- `run a backtest on the momentum strategy` -> `skills/historyrhymes/SKILL.md`
- `build features for the directional predictor` -> `skills/historyrhymes/SKILL.md`
- `check MLflow experiment results` -> `skills/historyrhymes/SKILL.md`
- `bootstrap the historyrhymes schema on Databricks` -> `skills/historyrhymes/SKILL.md`

- `Review backend/app/routes/nv_ai_copilot.py and explain how it fits the repo` -> `agents/architect.md`
- `Implement a loading fix in repo-b/src/app/lab/env/[envId]/page.tsx` -> `.skills/feature-dev/SKILL.md` with `agents/builder.md` as support
- `Fix the shared shell layout in repo-b/src/app/app/reports/page.tsx` -> `agents/frontend.md`
- `Update a FastAPI service in backend/app/services/reports.py` -> `agents/bos-domain.md`
- `Change how lab environments map industry templates and pipeline defaults` -> `agents/lab-environment.md`
- `Tune assistant response rendering and RAG behavior for Winston copilot` -> `agents/ai-copilot.md`
- `Add a new MCP tool schema and registry entry` -> `agents/mcp.md`
- `/research compare assistant routing approaches` -> `agents/architect.md`
- `ingest research: docs/research/2026-03-11-irr-libs.md` -> `.skills/research-ingest/SKILL.md`
- `use Codex CLI for this Winston bug` -> `skills/winston-router/SKILL.md`
- `verify the deploy landed` -> `skills/winston-post-deploy-verify/SKILL.md`
- `log in and check if the market intel fix worked` -> `skills/winston-post-deploy-verify/SKILL.md`
- `push this and watch Railway and Vercel` -> `agents/deploy.md`
- `sync Winston, stop if the repo is dirty, and summarize incoming commits` -> `agents/sync.md`
- `run QA on the REPE regression path` -> `agents/qa.md`
- `add a migration in repo-b/db/schema and coordinate the backfill` -> `agents/data.md`
- `/propose a scope for this client` -> `agents/operations.md`
- `open the latency optimization prompt` -> `skills/winston-performance-architecture/SKILL.md` with `docs/WINSTON_LATENCY_OPTIMIZATION_PROMPT.md` as reference
- `help me improve the frontend and backend together` -> stay in `CLAUDE.md` and ask one clarifying question
