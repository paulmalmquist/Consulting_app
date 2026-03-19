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
notes:
  - Global routing lives here. Downstream docs should link back instead of repeating repo-wide dispatch tables.
---

# CLAUDE Router Contract

`CLAUDE.md` is the canonical router for repo-local prompt behavior. It decides which downstream `agents/*.md`, `skills/*.md`, `.skills/*.md`, or selected `docs/*.md` file should own the next step.

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
| schema, SQL, migrations, ETL, seeds | `agents/data.md` |
| research ingestion from `docs/research/*` | `.skills/research-ingest/SKILL.md` |
| CRM lookup, prospect enrichment, contact record, Apollo search, add to CRM, find contact, is [company] in Apollo, track outreach | `docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md` with `agents/outreach.md` as support |
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
| `PDS_*.md`, `docs/plans/PDS_*` | PDS staged delivery prompt set | `winston-pds-delivery`, `architect-winston` |
| `docs/` | normalized skills, prompt references, and playbooks | matching skill, explicit prompt reference, or `architect-winston` |
| external Novendor workspaces | business-side workstreams | `operations`, `outreach`, `proposals`, `content`, `demo` |

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
- `is Branford Castle Partners in Apollo` -> `docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md`
- `add James Reddington to CRM` -> `docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md`
- `find the CFO of [REPE firm]` -> `docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md`
- `look up [person] at [company]` -> `docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md`

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
- `push this and watch Railway and Vercel` -> `agents/deploy.md`
- `sync Winston, stop if the repo is dirty, and summarize incoming commits` -> `agents/sync.md`
- `run QA on the REPE regression path` -> `agents/qa.md`
- `add a migration in repo-b/db/schema and coordinate the backfill` -> `agents/data.md`
- `/propose a scope for this client` -> `agents/operations.md`
- `open the latency optimization prompt` -> `skills/winston-performance-architecture/SKILL.md` with `docs/WINSTON_LATENCY_OPTIMIZATION_PROMPT.md` as reference
- `help me improve the frontend and backend together` -> stay in `CLAUDE.md` and ask one clarifying question
