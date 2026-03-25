# Winston Command Ontology Audit

Date: 2026-03-06
Repo: `BusinessMachine / Winston`

## 1. Executive Summary

- The current Winston command surface is not one system. It is four overlapping systems:
  1. A narrow chat planner in `repo-b/src/lib/server/commandOrchestrator.ts` that recognizes 9 tool operations and only 4 domains (`lab`, `bos`, `tasks`, `system`).
  2. A much richer AI Gateway + MCP layer in `backend/app/services/ai_gateway.py` and `backend/app/mcp/tools/*` that already exposes documents, work items, reports, REPE, model/scenario execution, environment control, and system introspection.
  3. A very large deterministic UI/API surface in `repo-b/src/lib/bos-api.ts`, `repo-b/src/lib/cro-api.ts`, `repo-b/src/lib/tasks-api.ts`, `repo-b/src/lib/ecc/api.ts`, `repo-b/src/lib/pipeline-api.ts`, and `backend/app/routes/*`.
  4. Assistant-only quick-action and natural-language prompts in `repo-b/src/components/commandbar/GlobalCommandBar.tsx`, REPE workspace components, and prompt/spec documents.

- Quantitatively, the repo exposes far more action surface than the planner knows about:
  - `9` planner catalog entries in `repo-b/src/lib/server/commandOrchestrator.ts`
  - `15` quick-action prompts in `repo-b/src/components/commandbar/GlobalCommandBar.tsx`
  - `75` MCP tool registrations under `backend/app/mcp/tools/*`
  - `302` exported `bos-api` functions
  - `31` exported `cro-api` functions
  - `596` backend route handlers under `backend/app/routes/*`

- What the current command surface really is:
  - Read/query coverage is broad across funds, investments, assets, models, documents, reports, metrics, portfolio health, tasks, CRM, PDS, consulting, legal, credit, medical office, and finance.
  - Mutation coverage exists in product APIs for almost every major domain, but only a small subset is assistant-exposed, and most of it is not normalized into one canonical command layer.
  - Real user language is already implied in the UI and prompts: "draft LP update", "compare to underwriting", "identify covenant risk", "downside scenario impact", "run re-underwrite", "add surveillance", "approve", "delegate", "defer", "capture", "import CSV", "create change order", "seed workspace", "run report pack", and many more.

- What is missing:
  - No canonical command ontology spanning all domains.
  - No shared command schema that separates `domain`, `entity`, `action_family`, `args`, `safety`, `routing`, and `audit`.
  - No full natural-language translation layer for colloquial business phrasing.
  - No shared field grammar for phrases like "push the exit", "haircut rents", "move this along", "tighten assumptions", "mark it done", "lock this down", "pressure test it".
  - No consistent clarification policy for deictic and vague requests.
  - No unified assistant exposure for most deterministic routes.

- What is unsafe today:
  - The request router write detector only catches simple `create/add/register fund/deal/investment/asset/property` patterns and misses most update/delete/approve/tag/assign/run verbs (`backend/app/services/request_router.py:74-81`, `167-181`).
  - The chat planner forces confirmation for its tiny surface, but the broader UI/API mutation layer often writes directly with no assistant-specific confirmation contract.
  - MCP write confirmation is strongest in REPE create tools, but not consistently normalized across all mutation-capable domains.
  - Multiple surfaces can mutate the same business object through different paths with different confirmation/audit behavior.

- What is inconsistent:
  - Planner domains are `lab|bos|tasks|system`, while assistant entity/scope types already include `fund`, `investment`, `deal`, `asset`, and `model` (`repo-b/src/lib/commandbar/types.ts:1-10`, `30-52`).
  - The AI layer knows that "deals" and "investments" are the same REPE entity, but the canonical command layer does not normalize that globally.
  - `ai_gateway.py` still keys some RE metadata off `industry == "real_estate"` even though much of the product language uses `repe` semantics (`backend/app/services/ai_gateway.py:882-896`).
  - Some write paths use confirm tokens (`commandOrchestratorStore`), some use `confirmed=true`, some rely on UI form submission only.

- What should become part of the canonical command layer:
  - `system/environment`
  - `documents/knowledge`
  - `work/tasks`
  - `crm/consulting`
  - `reports/metrics`
  - `finance`
  - `repe/institutional real estate`
  - `underwriting`
  - `pipeline`
  - `sustainability`
  - `pds`
  - `credit`
  - `legal`
  - `medical office`
  - `assistant/meta`
  - `ecc/executive queue`

- Architectural conclusion:
  - Winston should not continue growing by adding more regexes to the current planner.
  - The right architecture is: `natural language -> canonical command schema -> clarification rules -> confirmation -> domain adapter -> deterministic execution or assistant-only response -> audit trail`.

## 2. Full Command Inventory

Status legend:
- `clean`: implemented and reasonably aligned with the intended command shape
- `hidden`: implemented in API/UI but not exposed as a canonical assistant command
- `partial`: exposed in one path but incomplete across read/write/confirm
- `unsafe`: available but lacking a normalized confirmation/audit layer
- `missing`: product should support it, but no clean canonical path exists yet

Path legend:
- `Planner`: `repo-b/src/lib/server/commandOrchestrator.ts`
- `AI+MCP`: `backend/app/services/ai_gateway.py` + `backend/app/mcp/tools/*`
- `UI/API`: frontend page/component -> `bos-api`/other client -> `backend/app/routes/*`
- `Assistant-only`: no deterministic write; answer/draft/explain only

### System / Environment / Business / Execution

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `system.environment.list` | environment | list/show/get | clean | Planner, UI/API, repo-c API | deterministic API | no | Already supported in planner and lab APIs. |
| `system.environment.get` | environment | get | hidden | UI/API, repo-c API | deterministic API | no | Needed for "show env details", "what environment is this". |
| `system.environment.create` | environment | create | partial | Planner, UI/API, repo-c API | planner + confirmation + deterministic API | yes | Planner supports it, but no shared schema across all env flows. |
| `system.environment.update` | environment | update | partial | Planner, UI/API, repo-c API | planner + confirmation + deterministic API | yes | Covers rename/notes/industry changes. |
| `system.environment.delete` | environment | delete/archive/close | partial | Planner, UI/API, repo-c API | planner + double confirmation + deterministic API | yes, double | High-risk destructive op. |
| `system.environment.reset` | environment | run/execute | hidden | UI/API, repo-c API | planner + double confirmation + deterministic API | yes, double | Distinct from delete. |
| `system.workspace.health.get` | workspace | list/show/get | clean | Planner, quick action | assistant-only + deterministic checks | no | Good read-only command candidate. |
| `system.workspace.snapshot.get` | workspace | summarize/compose/export | clean | quick action, AI+MCP (`repe.get_environment_snapshot`) | assistant-only + MCP read tool | no | Good default landing command. |
| `system.business.create` | business | create | partial | Planner, AI+MCP, UI/API | planner + confirmation + deterministic API | yes | Canonical business bootstrap action. |
| `system.business.template.list` | template | list/show/get | clean | Planner, AI+MCP, UI/API | deterministic API | no | Current planner exposes read-only. |
| `system.business.template.apply` | business/template | run/execute/generate | hidden | AI+MCP, UI/API | planner + confirmation + deterministic API | yes | High-value bootstrap command. |
| `system.business.custom.apply` | business/capability | run/execute/generate | hidden | AI+MCP, UI/API | planner + confirmation + deterministic API | yes | "Enable these departments/capabilities". |
| `system.execution.run` | execution | run/execute/generate | hidden | AI+MCP, UI/API | planner + confirmation + deterministic API | yes | Generic business execution trigger. |
| `system.execution.list` | execution | list/show/get | clean | AI+MCP, UI/API | deterministic API | no | Useful for "latest run" / "show recent runs". |
| `system.audit.list` | audit event | list/show/get | hidden | AI+MCP (`work.list_audit_events`), repo-c API | deterministic API | no | Important for traceability queries. |

### Documents / Extraction / Knowledge

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `documents.document.upload.init` | document | import/upload/sync | clean | AI+MCP, UI/API | deterministic API | yes | First half of upload. |
| `documents.document.upload.complete` | document | import/upload/sync | clean | AI+MCP, UI/API | deterministic API | yes | Second half of upload. |
| `documents.document.list` | document | list/show/get/find | clean | AI+MCP, quick action, UI/API | deterministic API | no | Supports "recent docs", "show docs for this asset". |
| `documents.document.version.list` | document version | list/show/get | clean | AI+MCP, UI/API | deterministic API | no | Needed for "show versions". |
| `documents.document.download` | document version | export | clean | AI+MCP, UI/API | deterministic API | no | Download URL generation. |
| `documents.document.tag` | document | assign/move/tag/link | partial | AI+MCP only | planner + confirmation + MCP or deterministic API | yes | Important but not surfaced in planner/UI commands. |
| `documents.document.extract.init` | extracted document | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Extraction workflow exists but is not canonicalized. |
| `documents.document.extract.run` | extracted document | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Needed for "extract this agreement". |
| `documents.document.search` | document chunk | list/show/get/find | clean | `rag.search`, RE pipeline doc search, AI Gateway RAG | MCP read tool + assistant answer | no | Good canonical search verb. |
| `documents.document.index` | document | import/upload/sync | partial | UI/API background call | deterministic API | yes | Best-effort today; should be first-class. |
| `documents.document.summarize` | document | summarize/compose/export | clean | Assistant-only | assistant-only + RAG | no | Canonical summary/read path. |
| `documents.document.find_by_entity` | document | list/show/get/find | hidden | UI/API filters | deterministic API | no | "Show docs tied to this fund/asset/project". |

### Work / Tasks

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `work.item.list` | work item | list/show/get | clean | AI+MCP, UI/API | deterministic API | no | Good support for operational queues. |
| `work.item.get` | work item | get | clean | AI+MCP, UI/API | deterministic API | no | Supports "open this work item". |
| `work.item.create` | work item | create | clean | AI+MCP, UI/API | planner + confirmation + MCP | yes | Good example of first-party work intake. |
| `work.item.comment.add` | work comment | add | clean | AI+MCP, UI/API | planner + confirmation + MCP | yes | Annotation write, lower risk than destructive ops. |
| `work.item.status.update` | work item | update | clean | AI+MCP, UI/API | planner + confirmation + MCP | yes | "mark waiting/blocked/resolved". |
| `work.item.resolve` | work item | close/resolve | clean | AI+MCP, UI/API | planner + confirmation + MCP | yes | Outcome-bearing mutation with audit implications. |
| `tasks.project.create` | task project | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Route exists, planner does not expose. |
| `tasks.status.create` | task status | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Needed for board setup. |
| `tasks.issue.list` | issue | list/show/get/find | clean | UI/API, assistant summary | deterministic API | no | Search/filter already supported in UI. |
| `tasks.issue.get` | issue | get | clean | UI/API | deterministic API | no | Drawer load action. |
| `tasks.issue.create` | issue | create | partial | Planner, UI/API | planner + confirmation + deterministic API | yes | Planner supports only create, not follow-on issue ops. |
| `tasks.issue.update` | issue | update | hidden | UI/API | planner + confirmation + deterministic API | yes | Title/description/status/priority/assignee/labels/due date/sprint. |
| `tasks.issue.move` | issue | assign/move/tag/link | hidden | UI/API drag/drop | planner + confirmation + deterministic API | yes | Covers status and sprint moves. |
| `tasks.issue.comment.add` | task comment | add | hidden | UI/API | planner + confirmation + deterministic API | yes | Common "add note/comment". |
| `tasks.issue.link.add` | issue link | assign/move/tag/link | hidden | UI/API | planner + confirmation + deterministic API | yes | "block", "relates to", "duplicate". |
| `tasks.issue.attachment.add` | attachment | assign/move/tag/link | hidden | UI/API | planner + confirmation + deterministic API | yes | Document linking. |
| `tasks.issue.context_link.add` | context link | assign/move/tag/link | hidden | UI/API | planner + confirmation + deterministic API | yes | Links to env, report, metric, run. |
| `tasks.sprint.create` | sprint | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Common sprint-planning command. |
| `tasks.sprint.start` | sprint | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | State transition. |
| `tasks.sprint.close` | sprint | close | hidden | UI/API | planner + confirmation + deterministic API | yes | State transition with workflow impact. |
| `tasks.analytics.get` | task analytics | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | Good for read-only task summaries. |
| `tasks.metrics.get` | task metrics | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | Good structured read. |

### CRM / Consulting / Revenue OS

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `crm.account.list` | account | list/show/get/find | clean | UI/API | deterministic API | no | Basic CRM read path. |
| `crm.account.create` | account | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Needed for "create account/customer". |
| `crm.opportunity.list` | opportunity | list/show/get/find | clean | UI/API | deterministic API | no | Basic pipeline read path. |
| `crm.opportunity.create` | opportunity | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Needed for "open an opportunity". |
| `crm.activity.create` | activity | add | hidden | UI/API | planner + confirmation + deterministic API | yes | "log a CRM note/call/email". |
| `consulting.pipeline.stage.list` | pipeline stage | list/show/get | clean | UI/API | deterministic API | no | Used for kanban and stage metadata. |
| `consulting.opportunity.advance` | opportunity | assign/move/tag/link | hidden | UI/API | planner + confirmation + deterministic API | yes | "move this deal/opportunity forward". |
| `consulting.lead.list` | lead | list/show/get/find | clean | UI/API | deterministic API | no | Supports lead dashboards. |
| `consulting.lead.create` | lead | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Strong candidate for chat-driven intake. |
| `consulting.lead.score.update` | lead | update | hidden | UI/API | planner + confirmation + deterministic API | yes | "bump score", "score this lead". |
| `consulting.lead.qualify` | lead | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | State-changing. |
| `consulting.lead.disqualify` | lead | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | Requires rationale where available. |
| `consulting.outreach.template.create` | outreach template | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Template authoring. |
| `consulting.outreach.log.create` | outreach log | add | hidden | UI/API | planner + confirmation + deterministic API | yes | "log outreach", "record email". |
| `consulting.outreach.reply.record` | outreach reply | update | hidden | UI/API | planner + confirmation + deterministic API | yes | "mark replied", "meeting booked". |
| `consulting.proposal.create` | proposal | create | hidden | UI/API | planner + confirmation + deterministic API | yes | High-value document/business action. |
| `consulting.proposal.status.update` | proposal | update | hidden | UI/API | planner + confirmation + deterministic API | yes | sent/viewed/accepted/rejected/expired. |
| `consulting.proposal.version.create` | proposal version | create | hidden | UI/API | planner + confirmation + deterministic API | yes | "new version", "re-cut proposal". |
| `consulting.client.convert` | client | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | Converts account/opportunity/proposal to client. |
| `consulting.client.status.update` | client | update | hidden | UI/API | planner + confirmation + deterministic API | yes | Active/paused/etc. |
| `consulting.engagement.create` | engagement | create | hidden | UI/API | planner + confirmation + deterministic API | yes | "start engagement". |
| `consulting.engagement.spend.update` | engagement | update | hidden | UI/API | planner + confirmation + deterministic API | yes | Budget/spend mutation. |
| `consulting.engagement.complete` | engagement | close | hidden | UI/API | planner + confirmation + deterministic API | yes | State transition. |
| `consulting.revenue.entry.create` | revenue entry | create | hidden | UI/API | planner + confirmation + deterministic API | yes | "book revenue schedule". |
| `consulting.revenue.entry.status.update` | revenue entry | update | hidden | UI/API | planner + confirmation + deterministic API | yes | scheduled/invoiced/paid/overdue/written_off. |
| `consulting.metrics.compute` | metrics snapshot | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Deterministic recompute. |
| `consulting.metrics.latest.get` | metrics snapshot | get | clean | UI/API | deterministic API | no | Good for dashboard asks. |
| `consulting.loop.create` | loop | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Operational diagnostics object. |
| `consulting.loop.update` | loop | update | hidden | UI/API | planner + confirmation + deterministic API | yes | Changes role mix, frequency, maturity, etc. |
| `consulting.loop.intervention.create` | intervention | create | hidden | UI/API | planner + confirmation + deterministic API | yes | "log intervention", "capture improvement". |
| `consulting.strategic_outreach.monitor.run` | strategic monitor run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Agentic but deterministic run. |
| `consulting.strategic_outreach.outreach.approve` | outreach sequence | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | Executive approval verb. |

### REPE / Institutional Real Estate / Modeling

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `repe.context.get` | REPE context | get | clean | UI/API | deterministic API | no | Env/business setup. |
| `repe.context.init` | REPE context | create/initiate | hidden | UI/API | planner + confirmation + deterministic API | yes | Workspace bootstrap. |
| `repe.fund.list` | fund | list/show/get/find | clean | AI+MCP, UI/API | deterministic API | no | Already supported. |
| `repe.fund.get` | fund | get | clean | AI+MCP, UI/API | deterministic API | no | Includes terms. |
| `repe.fund.create` | fund | create | partial | AI+MCP, UI/API | planner + confirmation + deterministic API or MCP | yes | One of the few write tools with good confirm behavior. |
| `repe.fund.update` | fund | update | missing | UI forms only in some places | planner + confirmation + deterministic API | yes | Product should support edit/rename/status/targets/terms. |
| `repe.investment.list` | investment/deal | list/show/get/find | clean | AI+MCP (`list_deals`), UI/API | deterministic API | no | Canonicalize `deal` and `investment` synonyms. |
| `repe.investment.get` | investment/deal | get | clean | UI/API | deterministic API | no | |
| `repe.investment.create` | investment/deal | create | partial | AI+MCP, UI/API | planner + confirmation + deterministic API or MCP | yes | Write tool exists but assistant language mapping is narrow. |
| `repe.investment.update` | investment/deal | update | hidden | UI/API | planner + confirmation + deterministic API | yes | stage, sponsor, target close, capital amounts. |
| `repe.asset.list` | asset | list/show/get/find | clean | AI+MCP, UI/API | deterministic API | no | |
| `repe.asset.get` | asset | get | clean | AI+MCP, UI/API | deterministic API | no | |
| `repe.asset.create` | asset | create | partial | AI+MCP, UI/API | planner + confirmation + deterministic API or MCP | yes | Good confirmable MCP path exists. |
| `repe.asset.update` | asset | update | hidden | UI/API | planner + confirmation + deterministic API | yes | property type, units, market, NOI, occupancy, location, debt fields. |
| `repe.entity.create` | fund entity / GP / LP / SPV | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Ownership graph support exists. |
| `repe.ownership_edge.create` | ownership edge | assign/move/tag/link | hidden | UI/API | planner + confirmation + deterministic API | yes | "link LP/GP/SPV ownership". |
| `repe.ownership.get` | ownership graph | get | clean | UI/API | deterministic API | no | "show ownership stack". |
| `repe.partner.list` | partner | list/show/get/find | clean | UI/API | deterministic API | no | |
| `repe.partner.create` | partner | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `repe.commitment.create` | commitment | create | hidden | UI/API | planner + confirmation + deterministic API | yes | LP/GP commitment. |
| `repe.commitment.list` | commitment | list/show/get | clean | UI/API | deterministic API | no | |
| `repe.capital_entry.record` | capital ledger entry | create | hidden | UI/API | planner + confirmation + deterministic API | yes | contributions/distributions/fees/etc. |
| `repe.capital_ledger.list` | capital ledger | list/show/get | clean | UI/API | deterministic API | no | |
| `repe.cashflow_entry.record` | cashflow ledger entry | create | hidden | UI/API | planner + confirmation + deterministic API | yes | operating CF, capex, debt events, sale proceeds. |
| `repe.quarter_state.get` | quarter state | list/show/get | clean | UI/API | deterministic API | no | fund/investment/jv/asset state queries. |
| `repe.metrics.get` | quarter metrics | compare/analyze/explain | clean | UI/API | deterministic API | no | |
| `repe.quarter_close.run` | quarter close run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | High-value deterministic run. |
| `repe.waterfall.run` | waterfall run | run/execute/generate | hidden | AI+MCP (scenario flavor), UI/API | planner + confirmation + deterministic API | yes | Canonical "run waterfall". |
| `repe.waterfall.run.list` | waterfall run | list/show/get | clean | UI/API | deterministic API | no | |
| `repe.scenario.list` | scenario | list/show/get | clean | AI+MCP, UI/API | deterministic API | no | |
| `repe.scenario.create` | scenario | create | hidden | AI+MCP, UI/API | planner + confirmation + deterministic API | yes | Base/stress/upside/downside/custom. |
| `repe.scenario.clone` | scenario | create | hidden | AI+MCP, UI/API | planner + confirmation + deterministic API | yes | "spin up a copy", "fork the base case". |
| `repe.scenario.override.set` | override | update | partial | AI+MCP, UI/API | planner + confirmation + deterministic API | yes | Central field grammar command. |
| `repe.scenario.override.reset` | override set | delete/archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | "reset to base", "clear overrides". |
| `repe.model.list` | model | list/show/get/find | clean | AI+MCP, UI/API | deterministic API | no | |
| `repe.model.get` | model | get | clean | AI+MCP, UI/API | deterministic API | no | |
| `repe.model.create` | model | create | hidden | AI+MCP, UI/API | planner + confirmation + deterministic API | yes | Fund-specific and cross-fund models. |
| `repe.model.update` | model | update | hidden | UI/API | planner + confirmation + deterministic API | yes | name/description/status/type/strategy. |
| `repe.model.approve` | model | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | State transition. |
| `repe.model.archive` | model | archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | High-risk state transition. |
| `repe.model.scope.add` | model scope | assign/move/tag/link | hidden | UI/API | planner + confirmation + deterministic API | yes | Add fund/investment/jv/asset to model. |
| `repe.model.scope.remove` | model scope | delete/archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | Remove scope nodes. |
| `repe.model.override.set` | model override | update | hidden | UI/API | planner + confirmation + deterministic API | yes | Cross-fund model override system. |
| `repe.model.run` | model run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Generic model execution. |
| `repe.model.monte_carlo.run` | Monte Carlo run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Expensive compute; confirmation and resource guard needed. |
| `repe.scenario_version.create` | scenario version | create | hidden | UI/API | planner + confirmation + deterministic API | yes | "save a version", "cut version 3". |
| `repe.scenario_version.lock` | scenario version | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | "lock this version down". |
| `repe.model_scenario.create` | model scenario | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Cross-fund scenario. |
| `repe.model_scenario.clone` | model scenario | create | hidden | UI/API | planner + confirmation + deterministic API | yes | "duplicate downside". |
| `repe.model_scenario.delete` | model scenario | delete/archive/close | hidden | UI/API | planner + double confirmation + deterministic API | yes, double | Destructive. |
| `repe.model_scenario.asset.add` | scenario asset | assign/move/tag/link | hidden | UI/API | planner + confirmation + deterministic API | yes | "add these assets to the model". |
| `repe.model_scenario.asset.remove` | scenario asset | delete/archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `repe.model_scenario.override.set` | scenario override | update | hidden | UI/API | planner + confirmation + deterministic API | yes | revenue/expense/noi/capex/amort/etc. |
| `repe.model_scenario.override.reset_asset` | scenario override | delete/archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | Reset one asset to base. |
| `repe.model_scenario.override.reset_all` | scenario override set | delete/archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | "reset all overrides". |
| `repe.model_scenario.run` | scenario run | run/execute/generate | hidden | AI+MCP, UI/API | planner + confirmation + deterministic API | yes | "run scenario", "pressure test it". |
| `repe.model_run.get` | model run | get | clean | AI+MCP, UI/API | deterministic API | no | |
| `repe.model.compare` | model compare | compare/analyze/explain | clean | AI+MCP, UI/API | assistant-only + deterministic API | no | "compare scenarios" is analytical. |
| `repe.lineage.get` | lineage | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | Provenance queries. |
| `repe.uw_vs_actual.get` | UW vs actual report | compare/analyze/explain | clean | UI/API, quick actions | assistant-only + deterministic API | no | Strong assistant summary target. |
| `repe.attribution.get` | attribution bridge | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | |
| `repe.sale_assumption.create` | sale assumption | create | hidden | UI/API | planner + confirmation + deterministic API | yes | sale price/date/fees/buyer costs/memo. |
| `repe.sale_assumption.delete` | sale assumption | delete/archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `repe.sale_scenario.compute` | scenario metrics run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | "compute sale scenario impact". |
| `repe.valuation.compute` | valuation | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Asset valuation compute. |
| `repe.valuation.save` | valuation | update | hidden | UI/API | planner + confirmation + deterministic API | yes | Persist valuation result. |
| `repe.valuation_override.upsert` | valuation override | update | hidden | UI/API | planner + confirmation + deterministic API | yes | Colloquial valuation edits. |
| `repe.valuation_override.delete` | valuation override | delete/archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `repe.waterfall_scenario.run` | waterfall scenario run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Scenario-specific waterfall run. |
| `repe.waterfall_scenario.validate` | waterfall scenario ingredients | compare/analyze/explain | hidden | UI/API | deterministic API | no | Good preflight command. |
| `repe.capital_snapshot.compute` | capital snapshot | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `repe.asset.report.generate` | asset report | summarize/compose/export | hidden | UI/API | planner + confirmation + deterministic API | yes | "build asset report". |
| `repe.asset.export_excel` | Excel export | summarize/compose/export | hidden | UI/API | planner + confirmation + deterministic API | yes | "export this fund/model". |
| `repe.property_comps.list` | property comp | list/show/get/find | clean | UI/API | deterministic API | no | Supports "show sale/lease comps". |
| `repe.lp_summary.get` | LP summary | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | Drafting target. |

### Finance v1

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `finance.fund.create` | finance fund | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Separate from REPE fund object. |
| `finance.fund.list` | finance fund | list/show/get | clean | UI/API | deterministic API | no | |
| `finance.participant.create` | participant | create | hidden | UI/API | planner + confirmation + deterministic API | yes | investor/gp/lp/provider/etc. |
| `finance.participant.list` | participant | list/show/get | clean | UI/API | deterministic API | no | |
| `finance.commitment.create` | commitment | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.commitment.list` | commitment | list/show/get | clean | UI/API | deterministic API | no | |
| `finance.capital_call.create` | capital call | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.capital_call.list` | capital call | list/show/get | clean | UI/API | deterministic API | no | |
| `finance.contribution.create` | contribution | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.distribution_event.create` | distribution event | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.distribution_event.list` | distribution event | list/show/get | clean | UI/API | deterministic API | no | |
| `finance.distribution_payout.list` | distribution payout | list/show/get | clean | UI/API | deterministic API | no | |
| `finance.asset_investment.create` | asset investment | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.asset_investment.list` | asset investment | list/show/get | clean | UI/API | deterministic API | no | |
| `finance.waterfall.run` | finance run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Deterministic engine. |
| `finance.waterfall.allocations.list` | waterfall allocation | list/show/get | clean | UI/API | deterministic API | no | |
| `finance.capital_rollforward.run` | finance run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.capital_rollforward.get` | capital rollforward | list/show/get | clean | UI/API | deterministic API | no | |
| `finance.partition.snapshot.create` | snapshot | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Live-vs-sim baseline capture. |
| `finance.simulation.create` | simulation | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.simulation.diff.get` | simulation diff | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | |
| `finance.matter.create` | matter | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Legal-finance crossover. |
| `finance.trust_transaction.create` | trust transaction | create | hidden | UI/API | planner + confirmation + deterministic API | yes | deposit/disbursement/etc. |
| `finance.contingency.run` | contingency run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.mso.create` | MSO | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.clinic.create` | clinic | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.provider.create` | provider | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.provider_comp_plan.create` | provider comp plan | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.provider_comp.run` | comp run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.claim.create` | claim | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.denials_reconciliation.get` | denial reconciliation | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | |
| `finance.project.ensure` | construction project | create/initiate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.budget.create` | budget | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.budget_version.create` | budget version | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.change_order.create` | change order | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `finance.forecast.run` | forecast run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |

### Underwriting / Reports / Metrics / Intelligence

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `underwriting.run.create` | underwriting run | create/initiate | hidden | UI/API | planner + confirmation + deterministic API | yes | New underwriting base case. |
| `underwriting.run.list` | underwriting run | list/show/get | clean | UI/API | deterministic API | no | |
| `underwriting.run.get` | underwriting run | get | clean | UI/API | deterministic API | no | |
| `underwriting.research.ingest` | research payload | import/upload/sync | hidden | UI/API | planner + confirmation + deterministic API | yes | Great target for document-to-model workflows. |
| `underwriting.scenario.run` | underwriting scenarios | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | default + custom scenario levers. |
| `underwriting.report.get` | underwriting report | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | Good drafting/explanation surface. |
| `underwriting.research_contract.get` | research contract | get | clean | UI/API | deterministic API | no | |
| `reports.metric_definitions.list` | metric definition | list/show/get | clean | AI+MCP, UI/API | deterministic API | no | |
| `reports.metrics.query` | metric query | list/show/get/find | clean | AI+MCP, UI/API | deterministic API | no | |
| `reports.report.create` | report | create | clean | AI+MCP, UI/API | planner + confirmation + deterministic API or MCP | yes | |
| `reports.report.list` | report | list/show/get | clean | AI+MCP, UI/API | deterministic API | no | |
| `reports.report.get` | report | get | clean | AI+MCP, UI/API | deterministic API | no | |
| `reports.report.run` | report run | run/execute/generate | clean | AI+MCP, UI/API | planner + confirmation + deterministic API or MCP | yes | |
| `reports.report.explain` | report explanation | compare/analyze/explain | clean | AI+MCP, UI/API | assistant-only + deterministic API or MCP | no | |
| `reports.overview.get` | business overview report | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | |
| `reports.department_health.get` | department health report | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | |
| `reports.doc_register.get` | document register report | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | |
| `reports.doc_compliance.get` | document compliance report | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | |
| `reports.execution_ledger.get` | execution ledger report | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | |
| `reports.template_adoption.get` | template adoption report | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | |
| `reports.template_drift.simulate` | drift simulation | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `reports.readiness.get` | readiness report | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | |
| `fi.quarter_close.run` | FI run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `fi.covenant_tests.run` | covenant test run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `fi.waterfall_shadow.run` | waterfall shadow run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `fi.noi_variance.get` | NOI variance | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | |
| `fi.fund_metrics.get` | FI fund metrics | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | |
| `fi.loans.get` | FI loan dataset | list/show/get/find | clean | UI/API | deterministic API | no | |
| `fi.covenant_results.get` | covenant result | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | |
| `fi.watchlist.get` | watchlist | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | |
| `cre.ingest.run` | CRE ingest run | import/upload/sync | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `cre.forecast_question.create` | forecast question | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `cre.forecast_signals.refresh` | forecast signal refresh | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `cre.forecasts.materialize` | forecast materialization | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |

### Pipeline / Real Estate Credit / Sustainability

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pipeline.deal.list` | pipeline deal | list/show/get/find | clean | UI/API | deterministic API | no | |
| `pipeline.deal.get` | pipeline deal | get | clean | UI/API | deterministic API | no | |
| `pipeline.deal.create` | pipeline deal | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pipeline.deal.update` | pipeline deal | update | hidden | UI/API | planner + confirmation + deterministic API | yes | status, source, strategy, close date, price, IRR, MOIC, notes. |
| `pipeline.property.create` | pipeline property | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pipeline.property.update` | pipeline property | update | hidden | UI/API | planner + confirmation + deterministic API | yes | occupancy, NOI, asking cap, address, units, sqft. |
| `pipeline.tranche.create` | tranche | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pipeline.tranche.update` | tranche | update | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pipeline.contact.create` | contact | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pipeline.activity.create` | activity | add | hidden | UI/API | planner + confirmation + deterministic API | yes | note/call/meeting/email/document/status_change/milestone. |
| `pipeline.doc_search.run` | vector search | list/show/get/find | clean | UI/API | assistant-only + deterministic API | no | Search documents for a deal. |
| `real_estate.trust.list` | trust | list/show/get | clean | UI/API | deterministic API | no | |
| `real_estate.trust.create` | trust | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `real_estate.loan.list` | loan | list/show/get | clean | UI/API | deterministic API | no | |
| `real_estate.loan.get` | loan | get | clean | UI/API | deterministic API | no | |
| `real_estate.loan.create` | loan | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Includes borrower/property seed info. |
| `real_estate.surveillance.list` | surveillance row | list/show/get | clean | UI/API | deterministic API | no | |
| `real_estate.surveillance.create` | surveillance row | create | hidden | UI/API | planner + confirmation + deterministic API | yes | NOI, occupancy, DSCR, notes. |
| `real_estate.underwrite_run.list` | underwrite run | list/show/get | clean | UI/API | deterministic API | no | |
| `real_estate.underwrite_run.create` | underwrite run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Cap rate/NOI/debt/expense assumptions. |
| `real_estate.workout_case.list` | workout case | list/show/get | clean | UI/API | deterministic API | no | |
| `real_estate.workout_case.create` | workout case | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `real_estate.workout_action.create` | workout action | create | hidden | UI/API | planner + confirmation + deterministic API | yes | collect docs, outreach, term sheet, etc. |
| `real_estate.event.list` | loan event | list/show/get | clean | UI/API | deterministic API | no | |
| `real_estate.event.create` | loan event | create | hidden | UI/API | planner + confirmation + deterministic API | yes | servicing note, covenant breach, default, etc. |
| `real_estate.amortization.get` | amortization schedule | list/show/get | clean | UI/API | deterministic API | no | |
| `real_estate.amortization.generate` | amortization schedule | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `sustainability.overview.get` | sustainability overview | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | |
| `sustainability.asset.dashboard.get` | asset dashboard | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | |
| `sustainability.asset.profile.update` | asset sustainability profile | update | hidden | UI/API | planner + confirmation + deterministic API | yes | Many property attributes. |
| `sustainability.utility_account.create` | utility account | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `sustainability.utility_monthly.create` | utility monthly row | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `sustainability.utility_monthly.import` | utility import run | import/upload/sync | hidden | UI/API | planner + confirmation + deterministic API | yes | CSV import. |
| `sustainability.certification.create` | certification | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `sustainability.regulatory_exposure.create` | regulatory exposure | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `sustainability.emission_factor_set.create` | emission factor set | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `sustainability.scenario.run` | projection run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | 5-year decarbonization projections. |
| `sustainability.report.get` | sustainability report | summarize/compose/export | clean | UI/API | assistant-only + deterministic API | no | GRESB, LP ESG, TCFD, etc. |

### PDS / Credit / Legal / MedOffice / Executive

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pds.project.list` | PDS project | list/show/get/find | clean | UI/API | deterministic API | no | |
| `pds.project.get` | PDS project | get | clean | UI/API | deterministic API | no | |
| `pds.project.create` | PDS project | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.project.update` | PDS project | update | hidden | UI/API | planner + confirmation + deterministic API | yes | stage/status/manager/budget/milestones/dates. |
| `pds.budget.baseline.create` | baseline budget | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.budget.revision.create` | budget revision | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.contract.create` | contract | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.commitment.create` | commitment | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.change_order.create` | change order | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.change_order.approve` | change order | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | Critical approval verb. |
| `pds.invoice.create` | invoice | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.payment.create` | payment | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.forecast.create` | forecast | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.schedule.baseline.create` | schedule baseline | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.schedule.update.create` | schedule update | update | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.risk.create` | risk | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.survey_response.create` | survey response | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.site_report.create` | site report | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.rfi.list` | RFI | list/show/get/find | clean | UI/API | deterministic API | no | |
| `pds.rfi.create` | RFI | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.rfi.update` | RFI | update | hidden | UI/API | planner + confirmation + deterministic API | yes | assigned_to, due date, response, status, priority. |
| `pds.submittal.create` | submittal | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.document.create` | PDS document | create | hidden | UI/API | planner + confirmation + deterministic API | yes | Not same as raw upload flow. |
| `pds.permit.create` | permit | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.contractor_claim.create` | contractor claim | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.vendor.create` | vendor | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.vendor.update` | vendor | update | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.portfolio.health.get` | portfolio health | compare/analyze/explain | clean | UI/API | assistant-only + deterministic API | no | Great dashboard read. |
| `pds.snapshot.run` | snapshot run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `pds.report_pack.run` | report pack run | run/execute/generate | hidden | UI/API | planner + confirmation + deterministic API | yes | Board/report workflow. |
| `pds.executive.queue.list` | executive queue item | list/show/get | clean | UI/API | deterministic API | no | |
| `pds.executive.queue.act` | executive queue item | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | approve/delegate/escalate/defer/reject. |
| `pds.executive.messaging.generate` | messaging draft | summarize/compose/export | hidden | UI/API | assistant-only + deterministic API | no | Drafting surface. |
| `pds.executive.draft.approve` | executive draft | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `credit.case.create` | credit case | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `credit.underwriting.create` | credit underwriting | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `credit.committee_decision.create` | committee decision | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `credit.facility.create` | facility | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `credit.covenant.create` | covenant | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `credit.watchlist.create` | watchlist item | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `credit.workout.create` | workout item | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `legal.matter.create` | legal matter | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `legal.contract.create` | legal contract | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `legal.deadline.create` | legal deadline | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `legal.approval.create` | legal approval | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `legal.spend.create` | legal spend | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `medoffice.property.create` | medical property | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `medoffice.tenant.create` | medical tenant | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `medoffice.lease.create` | medical lease | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `medoffice.compliance.create` | medical compliance item | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `medoffice.work_order.create` | work order | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |

### Compliance / ECC / Lab Pipeline / Assistant-only

| canonical command id | entity | action family | current status | current execution path | recommended execution path | requires confirmation | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `compliance.control.list` | control | list/show/get | clean | UI/API | deterministic API | no | |
| `compliance.evidence.export` | evidence export | summarize/compose/export | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `compliance.access_review.create` | access review | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `compliance.access_review.signoff` | access review | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `compliance.backup.verify` | backup verification | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `compliance.incident.create` | incident | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `compliance.incident.timeline.add` | incident timeline entry | add | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `compliance.config_change.record` | config change | add | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `compliance.deployment.record` | deployment | add | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `compliance.event_log.list` | compliance event | list/show/get | clean | UI/API | deterministic API | no | |
| `lab.pipeline.stage.create` | pipeline stage | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `lab.pipeline.stage.update` | pipeline stage | update | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `lab.pipeline.stage.delete` | pipeline stage | delete/archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `lab.pipeline.card.create` | pipeline card | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `lab.pipeline.card.update` | pipeline card | update | hidden | UI/API | planner + confirmation + deterministic API | yes | Includes move between stages. |
| `lab.pipeline.card.delete` | pipeline card | delete/archive/close | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `ecc.queue.get` | ECC queue | list/show/get | clean | UI/API | deterministic API | no | |
| `ecc.message.complete` | ECC message | close | hidden | UI/API | planner + confirmation + deterministic API | yes | "reply", "done" semantics vary. |
| `ecc.message.snooze` | ECC message | assign/move/tag/link | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `ecc.payable.approve` | payable | approve/confirm/reject | hidden | UI/API | planner + confirmation + deterministic API | yes | Financial approval verb. |
| `ecc.item.delegate` | ECC item | assign/move/tag/link | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `ecc.payable.create_from_message` | payable | create | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `ecc.capture.quick` | captured item | create/initiate | hidden | UI/API | planner + confirmation + deterministic API | yes | "capture this loose commitment". |
| `ecc.brief.generate` | brief | summarize/compose/export | hidden | UI/API | assistant-only + deterministic API | no | Drafting/reporting. |
| `ecc.demo.mode.update` | demo mode | update | hidden | UI/API | planner + confirmation + deterministic API | yes | |
| `ecc.demo.reset` | demo state | delete/archive/close | hidden | UI/API | planner + double confirmation + deterministic API | yes, double | Destructive reset. |
| `assistant.summary.asset_risk` | asset | compare/analyze/explain | clean | quick action, Assistant-only | assistant-only | no | Summaries, not mutations. |
| `assistant.compare.uw_vs_actual` | asset/fund | compare/analyze/explain | clean | quick action, Assistant-only | assistant-only + deterministic data reads | no | |
| `assistant.draft.lp_update` | fund/asset | summarize/compose/export | clean | quick action, Assistant-only | assistant-only + data reads + RAG | no | |
| `assistant.analysis.covenant_risk` | investment/fund | compare/analyze/explain | clean | quick action, Assistant-only | assistant-only + deterministic data reads | no | |
| `assistant.analysis.nav_sensitivity` | asset/fund | compare/analyze/explain | clean | quick action, Assistant-only | assistant-only + deterministic data reads | no | |
| `assistant.summary.task_report` | task workspace | summarize/compose/export | clean | quick action, Assistant-only | assistant-only + deterministic data reads | no | |
| `assistant.summary.documents_recent` | document workspace | summarize/compose/export | clean | quick action, Assistant-only | assistant-only + deterministic data reads | no | |
| `assistant.summary.board_ready` | board/report package | summarize/compose/export | partial | Prompt/docs only | assistant-only + planner for optional artifact creation | no by default | High-value missing productized command. |

## 3. Natural Language Translation Catalog

Each entry below is a major canonical command. The phrases are representative real-user variants the parser should normalize.

### `repe.fund.create`

- Phrases that should map automatically:
  - create a fund
  - create Fund IV
  - add a new fund
  - spin up a fund
  - start a new vehicle
  - open a new fund
  - set up a closed-end fund
  - launch a debt fund
  - create a new REPE vehicle
  - start Fund III as a value-add fund
  - create a fundraising fund
  - seed a new fund shell
- Colloquial / shorthand:
  - spin up Fund V
  - stand up a new vehicle
  - tee up a new fund
  - open another sleeve
  - create the next vintage
- Requires clarification:
  - start another one
  - make me a new vehicle
  - set up the next fund
- Structured payload:

```json
{
  "command_id": "repe.fund.create",
  "domain": "repe",
  "entity_type": "fund",
  "action": "create",
  "args": {
    "name": "Fund V",
    "fund_type": "closed_end",
    "strategy": "equity",
    "vintage_year": 2026
  }
}
```

### `repe.investment.create`

- Phrases that should map automatically:
  - add an investment
  - create a deal
  - create an investment in this fund
  - add a new deal to Fund III
  - start a new acquisition
  - log a new opportunity under this fund
  - create a debt deal
  - add an operating investment
  - open a closing-stage deal
  - create the ABC Sponsor deal
  - add a sourcing deal
  - add a new investment to this vehicle
- Colloquial / shorthand:
  - tee up a deal
  - drop a new deal in the fund
  - add another paper
  - open a new line in the pipeline
  - put this sponsor into Fund II
- Requires clarification:
  - add another one
  - create the next deal
  - put this in the fund
- Structured payload:

```json
{
  "command_id": "repe.investment.create",
  "domain": "repe",
  "entity_type": "investment",
  "action": "create",
  "args": {
    "fund_id": "resolved-from-scope",
    "name": "Downtown JV",
    "deal_type": "equity",
    "stage": "underwriting",
    "sponsor": "ABC Sponsor"
  }
}
```

### `repe.asset.create`

- Phrases that should map automatically:
  - add an asset
  - create an asset
  - add a property
  - create a property asset
  - attach a new property to this deal
  - add another building
  - add a CMBS asset
  - create an industrial asset
  - create a multifamily property
  - put 123 Main into the deal
  - add an asset under this investment
  - create the Dallas property
- Colloquial / shorthand:
  - drop this asset in
  - pluck this property into the deal
  - add another building to the stack
  - put this collateral in the deal
  - load the property
- Requires clarification:
  - add this
  - create the property
  - put this in there
- Structured payload:

```json
{
  "command_id": "repe.asset.create",
  "domain": "repe",
  "entity_type": "asset",
  "action": "create",
  "args": {
    "deal_id": "resolved-from-scope",
    "name": "123 Main Street",
    "asset_type": "property",
    "property_type": "multifamily",
    "market": "Chicago",
    "units": 240
  }
}
```

### `repe.model.create`

- Phrases that should map automatically:
  - create a model
  - create a cross-fund model
  - start a new model
  - build a portfolio model
  - create a downside model
  - start a scenario workspace
  - set up a forecast model
  - open a new cross-fund model
  - create a Q4 portfolio review model
  - make a mixed-strategy model
- Colloquial / shorthand:
  - spin up a model
  - tee up a model
  - open a sandbox
  - build me a scenario shell
  - set up a workbench
- Requires clarification:
  - start a new one
  - make a model for this
  - build a workspace
- Structured payload:

```json
{
  "command_id": "repe.model.create",
  "domain": "repe",
  "entity_type": "model",
  "action": "create",
  "args": {
    "name": "Q4 2026 Portfolio Review",
    "strategy_type": "mixed",
    "model_type": "scenario",
    "env_id": "resolved-from-context"
  }
}
```

### `repe.model_scenario.create`

- Phrases that should map automatically:
  - create a scenario
  - add a downside scenario
  - create a stress case
  - make an upside case
  - build a custom scenario
  - create a new case under this model
  - add a scenario version
  - make a pressure-test case
  - create a downside for this model
  - add a new what-if
- Colloquial / shorthand:
  - spin up a downside
  - make me a stress test
  - give me a tougher case
  - add another case
  - fork the base
- Requires clarification:
  - do a scenario
  - make a new case
  - add one for rates
- Structured payload:

```json
{
  "command_id": "repe.model_scenario.create",
  "domain": "repe",
  "entity_type": "model_scenario",
  "action": "create",
  "args": {
    "model_id": "resolved-from-scope",
    "name": "Downside 75bps",
    "is_base": false
  }
}
```

### `repe.model_scenario.asset.add`

- Phrases that should map automatically:
  - add this asset to the model
  - put this asset in scope
  - include this building in the scenario
  - add these properties to the stress case
  - add all assets from Fund III to this model
  - bring this deal into the model
  - include the Dallas assets
  - add the office assets to the downside
  - add this portfolio to the scenario
  - put the shopping centers into scope
- Colloquial / shorthand:
  - pluck these assets into the model
  - pull these into the case
  - bring them into the sandbox
  - scope these in
  - add them to the run set
- Requires clarification:
  - add these
  - include that one
  - bring in the assets
- Structured payload:

```json
{
  "command_id": "repe.model_scenario.asset.add",
  "domain": "repe",
  "entity_type": "scenario_asset",
  "action": "add",
  "args": {
    "scenario_id": "resolved-from-scope",
    "asset_ids": ["from-selection-or-clarification"]
  }
}
```

### `repe.model_scenario.override.set`

- Phrases that should map automatically:
  - update the assumptions
  - change revenue by 5 percent
  - haircut rents by 5%
  - bump capex by 250k
  - cut NOI by 8 percent
  - increase expenses 3 percent
  - push the exit out 12 months
  - make debt tougher
  - adjust amortization by 10 percent
  - set capex to 1.5 million
  - take this to base case
  - make this more conservative
  - tighten the assumptions
  - roll this forward a year
  - bump the exit cap
- Colloquial / shorthand:
  - haircut rents
  - bump capex
  - push the exit
  - pressure test the NOI
  - make debt uglier
  - tighten it up
- Requires clarification:
  - update the numbers
  - change the assumptions
  - clean this up
  - make it more conservative
- Structured payload:

```json
{
  "command_id": "repe.model_scenario.override.set",
  "domain": "repe",
  "entity_type": "scenario_override",
  "action": "update",
  "args": {
    "scenario_id": "resolved-from-scope",
    "scope_type": "asset",
    "scope_id": "resolved-asset-id",
    "key": "revenue_delta_pct",
    "value_json": -5
  }
}
```

### `repe.waterfall.run`

- Phrases that should map automatically:
  - run the waterfall
  - rerun the waterfall
  - calculate the promote
  - run fund distributions
  - compute the waterfall
  - show waterfall allocations
  - run a shadow waterfall
  - execute the distribution waterfall
  - process the promote tiers
  - calculate LP/GP splits
- Colloquial / shorthand:
  - run promotes
  - spin the waterfall
  - cut the distributions
  - do the split
  - show the carry math
- Requires clarification:
  - run it
  - do the distribution
  - calculate payouts
- Structured payload:

```json
{
  "command_id": "repe.waterfall.run",
  "domain": "repe",
  "entity_type": "waterfall_run",
  "action": "run",
  "args": {
    "fund_id": "resolved-from-scope",
    "quarter": "2026Q1",
    "scenario_id": null,
    "run_type": "shadow"
  }
}
```

### `repe.quarter_close.run`

- Phrases that should map automatically:
  - run quarter close
  - close the quarter
  - process Q1 close
  - run valuation and metrics for Q2
  - close 2026Q1
  - run the quarter-end
  - execute the fund close
  - refresh quarter-end marks
  - recompute quarter state
  - run close with waterfall
- Colloquial / shorthand:
  - close the books
  - roll quarter close
  - process quarter-end
  - cut the quarter
  - rerun the close
- Requires clarification:
  - close this
  - run quarter end
  - refresh the quarter
- Structured payload:

```json
{
  "command_id": "repe.quarter_close.run",
  "domain": "repe",
  "entity_type": "quarter_close_run",
  "action": "run",
  "args": {
    "fund_id": "resolved-from-scope",
    "quarter": "2026Q1",
    "accounting_basis": "accrual",
    "valuation_method": "cap_rate",
    "run_waterfall": true
  }
}
```

### `documents.document.upload`

- Phrases that should map automatically:
  - upload this document
  - attach this file
  - add this agreement to the asset
  - upload the lease
  - put this PDF on the fund
  - attach the term sheet
  - add this deck to the workspace
  - upload and index this doc
  - file this under the project
  - add this to the diligence room
- Colloquial / shorthand:
  - drop this in
  - throw this on the asset
  - load this doc
  - stick this in the folder
  - put this into Winston
- Requires clarification:
  - upload this
  - add the file
  - attach it here
- Structured payload:

```json
{
  "command_id": "documents.document.upload.complete",
  "domain": "documents",
  "entity_type": "document",
  "action": "upload",
  "args": {
    "entity_type": "asset",
    "entity_id": "resolved-from-scope",
    "filename": "lease.pdf"
  }
}
```

### `documents.document.tag`

- Phrases that should map automatically:
  - tag this document
  - label this as a lease
  - mark this as underwriting
  - retag this doc
  - classify this agreement
  - tag this term sheet as debt
  - label the file as compliance
  - set the document type to purchase agreement
  - mark this as fund-level evidence
  - assign this doc to the asset
- Colloquial / shorthand:
  - retag this
  - fix the doc type
  - clean up the tagging
  - classify this file
  - file this under debt
- Requires clarification:
  - fix this doc
  - clean this up
  - tag it right
- Structured payload:

```json
{
  "command_id": "documents.document.tag",
  "domain": "documents",
  "entity_type": "document",
  "action": "tag",
  "args": {
    "document_id": "resolved-from-context",
    "tags": ["lease", "asset", "compliance"]
  }
}
```

### `tasks.issue.create`

- Phrases that should map automatically:
  - create a task
  - open an issue
  - add a work item
  - create a bug
  - create a story
  - log a task for this
  - make a ticket
  - open a WIN issue
  - add this to the backlog
  - create a follow-up item
  - assign a new task to Sarah
- Colloquial / shorthand:
  - tee up a task
  - make me a ticket
  - drop this in the backlog
  - open a card
  - file an issue
- Requires clarification:
  - make a task for this
  - add it to tasks
  - log follow-up
- Structured payload:

```json
{
  "command_id": "tasks.issue.create",
  "domain": "tasks",
  "entity_type": "issue",
  "action": "create",
  "args": {
    "project_id": "resolved-project",
    "title": "Review covenant breach in asset 123 Main",
    "type": "task",
    "priority": "high",
    "assignee": "Sarah Kim"
  }
}
```

### `tasks.issue.update`

- Phrases that should map automatically:
  - update this issue
  - change the due date
  - reassign this task
  - edit the description
  - change priority to critical
  - add labels
  - set estimate to 5 points
  - rename the ticket
  - change the assignee
  - update the title
- Colloquial / shorthand:
  - clean up this ticket
  - tighten the task
  - retitle it
  - put a date on this
  - change the owner
- Requires clarification:
  - update this
  - fix the ticket
  - edit it
- Structured payload:

```json
{
  "command_id": "tasks.issue.update",
  "domain": "tasks",
  "entity_type": "issue",
  "action": "update",
  "args": {
    "issue_id": "resolved-from-scope",
    "patch": {
      "assignee": "Sarah Kim",
      "due_date": "2026-03-20",
      "priority": "critical"
    }
  }
}
```

### `tasks.issue.move`

- Phrases that should map automatically:
  - move this to in progress
  - mark this done
  - put this in the sprint
  - move the ticket to blocked
  - take this out of backlog
  - close this issue
  - send this to review
  - move this to Sprint 12
  - put it in active sprint
  - move it along
- Colloquial / shorthand:
  - mark done
  - move this forward
  - drag this to blocked
  - pull this into sprint
  - kick this to done
- Requires clarification:
  - move it
  - advance this
  - put it in there
- Structured payload:

```json
{
  "command_id": "tasks.issue.move",
  "domain": "tasks",
  "entity_type": "issue",
  "action": "move",
  "args": {
    "issue_id": "resolved-from-scope",
    "status_id": "resolved-status",
    "sprint_id": null
  }
}
```

### `crm.opportunity.create`

- Phrases that should map automatically:
  - create an opportunity
  - open a CRM opportunity
  - add a deal in CRM
  - create a pipeline opportunity
  - log a new sales opportunity
  - create a Dallas Multifamily Rollup opportunity
  - open a 25 million opportunity
  - add an opportunity for GreenRock
  - create a new revenue opportunity
  - add a pipeline item for this account
- Colloquial / shorthand:
  - open a new opp
  - tee up a CRM deal
  - add it to the pipeline
  - start a new opp
  - put this into sales
- Requires clarification:
  - create a deal
  - open one for this
  - add it to CRM
- Structured payload:

```json
{
  "command_id": "crm.opportunity.create",
  "domain": "crm",
  "entity_type": "opportunity",
  "action": "create",
  "args": {
    "business_id": "resolved-from-context",
    "name": "Dallas Multifamily Rollup",
    "amount": "25000000",
    "crm_account_id": "resolved-account",
    "crm_pipeline_stage_id": "resolved-stage"
  }
}
```

### `consulting.proposal.create`

- Phrases that should map automatically:
  - create a proposal
  - draft a proposal
  - open a proposal for this opportunity
  - make a proposal for GreenRock
  - create a new SOW
  - generate a proposal draft
  - build a proposal for this client
  - create a pricing proposal
  - start a new proposal version
  - prepare a client proposal
- Colloquial / shorthand:
  - spin up a proposal
  - tee up an SOW
  - cut a proposal
  - build me a bid
  - write up a scope doc
- Requires clarification:
  - make a proposal
  - put together something
  - start the doc
- Structured payload:

```json
{
  "command_id": "consulting.proposal.create",
  "domain": "consulting",
  "entity_type": "proposal",
  "action": "create",
  "args": {
    "crm_account_id": "resolved-account",
    "crm_opportunity_id": "resolved-opportunity",
    "title": "Finance Automation Advisory",
    "total_value": "150000",
    "scope_summary": "Close, reporting, and KPI automation"
  }
}
```

### `pds.change_order.approve`

- Phrases that should map automatically:
  - approve this change order
  - sign off on the CO
  - approve the change order
  - clear the pending change
  - approve CO-17
  - sign the budget change
  - move this change order through
  - approve the contractor change
  - okay the change request
  - greenlight this CO
- Colloquial / shorthand:
  - sign it off
  - approve this change
  - push the CO through
  - clear it
  - greenlight it
- Requires clarification:
  - approve this
  - sign this
  - push it through
- Structured payload:

```json
{
  "command_id": "pds.change_order.approve",
  "domain": "pds",
  "entity_type": "change_order",
  "action": "approve",
  "args": {
    "change_order_id": "resolved-from-context",
    "approved_by": "current-user"
  }
}
```

### `real_estate.underwrite_run.create`

- Phrases that should map automatically:
  - run a re-underwrite
  - rerun underwriting
  - calculate a new mark
  - rerun this loan with a higher cap rate
  - run underwriting with tougher debt
  - re-underwrite the loan
  - update assumptions and rerun
  - run the loan model
  - refresh surveillance underwriting
  - rerun value with 6.5 cap
- Colloquial / shorthand:
  - rerun with tougher debt
  - re-cut the loan
  - mark it with higher cap
  - rerun the loan
  - pressure test this note
- Requires clarification:
  - run the model
  - re-underwrite it
  - rerun this
- Structured payload:

```json
{
  "command_id": "real_estate.underwrite_run.create",
  "domain": "real_estate",
  "entity_type": "underwrite_run",
  "action": "run",
  "args": {
    "loan_id": "resolved-from-scope",
    "cap_rate": 0.065,
    "stabilized_noi_cents": 180000000,
    "amortization_years": 30
  }
}
```

### `sustainability.scenario.run`

- Phrases that should map automatically:
  - run a sustainability scenario
  - project a carbon tax case
  - run a 5-year decarbonization projection
  - model a retrofit scenario
  - run the solar case
  - project utility shock
  - show a five-year ESG projection
  - run the carbon scenario for Fund III
  - model decarb downside
  - show projected IRR under retrofit
- Colloquial / shorthand:
  - run the carbon case
  - give me the retrofit view
  - project the ESG hit
  - stress the utilities
  - show the green case
- Requires clarification:
  - run sustainability
  - do the ESG scenario
  - show the decarb view
- Structured payload:

```json
{
  "command_id": "sustainability.scenario.run",
  "domain": "sustainability",
  "entity_type": "projection_run",
  "action": "run",
  "args": {
    "fund_id": "resolved-fund",
    "scenario_id": "resolved-re-v2-scenario",
    "base_quarter": "2026Q1",
    "projection_mode": "retrofit"
  }
}
```

### `finance.capital_call.create`

- Phrases that should map automatically:
  - create a capital call
  - issue a capital call
  - send a call for 2 million
  - open a new capital call
  - request capital from LPs
  - create the March call
  - add a capital call for Fund IV
  - call capital next week
  - create an LP call
  - raise capital for this fund
- Colloquial / shorthand:
  - call capital
  - send the call
  - raise a call
  - do an LP draw
  - issue the next call
- Requires clarification:
  - do the capital thing
  - create the call
  - request money
- Structured payload:

```json
{
  "command_id": "finance.capital_call.create",
  "domain": "finance",
  "entity_type": "capital_call",
  "action": "create",
  "args": {
    "fund_id": "resolved-from-scope",
    "call_date": "2026-03-15",
    "amount_requested": "2000000",
    "purpose": "capex reserve"
  }
}
```

### `assistant.summary.portfolio_risk`

- Phrases that should map automatically:
  - show me what is off
  - what is dragging performance
  - summarize portfolio risk
  - give me the latest picture
  - what changed this quarter
  - where are the pressure points
  - summarize risks across the fund
  - what is hurting NOI
  - what looks broken
  - give me a read on the portfolio
- Colloquial / shorthand:
  - what is off
  - what is dragging us
  - give me the picture
  - where is the pain
  - what is wobbling
- Requires clarification:
  - how are we doing
  - give me an update
  - what's going on
- Structured payload:

```json
{
  "command_id": "assistant.summary.portfolio_risk",
  "domain": "assistant",
  "entity_type": "fund",
  "action": "summarize",
  "args": {
    "scope": "resolved-from-page-or-selected-fund",
    "focus": ["risk", "noi_drag", "covenant_pressure", "changes"]
  }
}
```

## 4. Datapoint Update Catalog

The high-value update grammar Winston needs is below. Anything that changes persisted business state or model outputs should be treated as a write and should normally require confirmation.

### REPE Funds

| entity | field | natural-language variants | safety | execution path | validation |
| --- | --- | --- | --- | --- | --- |
| fund | `name` | rename the fund, change fund name, call it Fund V | confirm | deterministic API | non-empty, unique enough for resolution |
| fund | `strategy` | switch strategy to debt, make this equity, change strategy | confirm | deterministic API | enum or allowed value set |
| fund | `fund_type` | make this open-end, change fund type | confirm | deterministic API | enum |
| fund | `status` | move fund to investing, mark fundraising, close the fund | confirm | deterministic API | enum, high-risk if `closed` |
| fund | `vintage_year` | update vintage, make it 2026 | confirm | deterministic API | integer, sensible range |
| fund | `target_size` | raise target size, set target to 500 million | confirm | deterministic API | decimal >= 0 |
| fund | `term_years` | change term to 10 years | confirm | deterministic API | integer >= 1 |
| fund | `base_currency` | switch base currency to EUR | confirm | deterministic API | ISO code |
| fund | `target_leverage_min/max` | set leverage band, tighten leverage range | confirm | deterministic API | decimals, min <= max |
| fund | `target_hold_period_min/max_years` | shorten hold, extend target hold period | confirm | deterministic API | ints, min <= max |
| fund | `preferred_return_rate` | change pref, move hurdle to 8 | confirm | deterministic API | decimal >= 0 |
| fund | `carry_rate` | change carry to 20%, move promote to 25 | confirm | deterministic API | decimal >= 0 |
| fund | `waterfall_style` | make this European, switch to American waterfall | confirm | deterministic API | enum |

### REPE Investments / Deals

| entity | field | natural-language variants | safety | execution path | validation |
| --- | --- | --- | --- | --- | --- |
| investment | `name` | rename the deal, change investment name | confirm | deterministic API | non-empty |
| investment | `stage` | move stage, put this into IC, advance to closing | confirm | deterministic API | enum |
| investment | `sponsor` | change sponsor, update counterparty | confirm | deterministic API | string |
| investment | `target_close_date` | push close, move target close, slip closing date | confirm | deterministic API | valid date |
| investment | `committed_capital` | update commitment, set committed capital | confirm | deterministic API | decimal >= 0 |
| investment | `invested_capital` | update invested capital | confirm | deterministic API | decimal >= 0 |
| investment | `realized_distributions` | update realized distributions | confirm | deterministic API | decimal >= 0 |

### REPE Assets / Asset Detail

| entity | field | natural-language variants | safety | execution path | validation |
| --- | --- | --- | --- | --- | --- |
| asset | `name` | rename asset, change property name | confirm | deterministic API | non-empty |
| asset | `asset_type` | make this CMBS, switch asset type | confirm | deterministic API | enum |
| asset | `property_type` | change sector, switch to industrial | confirm | deterministic API | enum/open taxonomy |
| asset | `units` | update units, set unit count to 240 | confirm | deterministic API | int >= 0 |
| asset | `market/city/state/address` | move market, fix address, change city/state | confirm | deterministic API | string/state validation |
| asset | `current_noi` | update NOI, change in-place NOI | confirm | deterministic API | decimal >= 0 where required |
| asset | `occupancy` | revise occupancy, set occupancy to 92%, haircut occupancy | confirm | deterministic API | decimal 0..1 |
| asset | `coupon` | update coupon, change bond coupon | confirm | deterministic API | decimal >= 0 |
| asset | `rating` | change rating | confirm | deterministic API | string/rating taxonomy |
| asset | `maturity_date` | push maturity, change maturity date | confirm | deterministic API | valid date |

### Scenario / Model Override Grammar

| entity | field/key | natural-language variants | safety | execution path | validation |
| --- | --- | --- | --- | --- | --- |
| scenario override | `revenue_delta_pct` | haircut rents, cut revenue 5%, lower top line | confirm | deterministic API | numeric percent within configured band |
| scenario override | `expense_delta_pct` | raise expenses 3%, bump opex | confirm | deterministic API | numeric percent |
| scenario override | `noi_override` | set NOI to 4.5m, override NOI | confirm | deterministic API | numeric |
| scenario override | `capex_override` | bump capex, add 250k of capex | confirm | deterministic API | numeric |
| scenario override | `amort_delta_pct` | tighten amortization, increase amortization burden | confirm | deterministic API | numeric percent |
| waterfall scenario | `cap_rate_delta_bps` | widen cap 50 bps, add 75 bps to exit cap | confirm | deterministic API | integer bps |
| waterfall scenario | `noi_stress_pct` | stress NOI 10%, haircut NOI | confirm | deterministic API | numeric percent |
| waterfall scenario | `exit_date_shift_months` | push the exit 12 months, delay sale a year | confirm | deterministic API | integer months |
| sale assumption | `sale_price` | set sale price to 45m, mark exit value at 45 million | confirm | deterministic API | numeric > 0 |
| sale assumption | `sale_date` | push sale date, sell this later, shift disposition | confirm | deterministic API | valid date |
| sale assumption | `disposition_fee_pct` | set disposition fee to 1%, broker fee 1% | confirm | deterministic API | decimal >= 0 |
| sale assumption | `buyer_costs` | add buyer costs, set closing costs | confirm | deterministic API | decimal >= 0 |
| sale assumption | `memo` | add a note, document rationale | confirm | deterministic API | string |

### Valuation / Loan / Underwrite

| entity | field | natural-language variants | safety | execution path | validation |
| --- | --- | --- | --- | --- | --- |
| loan surveillance | `noi_cents` | update NOI, latest NOI is 180m cents | confirm | deterministic API | integer |
| loan surveillance | `occupancy` | occupancy is 90%, revise occupancy | confirm | deterministic API | decimal 0..1 |
| loan surveillance | `dscr` | DSCR is 1.2x, update coverage | confirm | deterministic API | numeric >= 0 |
| underwrite run | `cap_rate` | run at 6.5 cap, bump cap rate | confirm | deterministic API | decimal (0,1] |
| underwrite run | `stabilized_noi_cents` | use stabilized NOI of X | confirm | deterministic API | integer |
| underwrite run | `vacancy_factor` | use 8% vacancy, higher vacancy | confirm | deterministic API | decimal 0..1 |
| underwrite run | `expense_growth` | tougher expenses, 3% expense growth | confirm | deterministic API | decimal 0..1 |
| underwrite run | `interest_rate` | use 7% debt, higher rate | confirm | deterministic API | decimal 0..1 |
| underwrite run | `amortization_years` | 30-year amort, shorten amort | confirm | deterministic API | int 1..40 |
| valuation | `valuation override key` | change cap rate, update exit cap, change hold period | confirm | deterministic API | key-specific validation |

### Sustainability

| entity | field | natural-language variants | safety | execution path | validation |
| --- | --- | --- | --- | --- | --- |
| asset profile | `square_feet` | update square footage, set SF to 250k | confirm | deterministic API | decimal >= 0 |
| asset profile | `year_built` / `last_renovation_year` | built in 1998, renovated in 2021 | confirm | deterministic API | year range |
| asset profile | `hvac_type` / `fuel` / `lighting_type` | switch HVAC, update heating fuel, change lighting | confirm | deterministic API | string/taxonomy |
| asset profile | `onsite_generation` / `solar_kw_installed` | mark solar installed, add 250kW solar | confirm | deterministic API | bool / decimal >= 0 |
| asset profile | `battery_storage_kwh` / `ev_chargers_count` | add battery, add 20 chargers | confirm | deterministic API | numeric >= 0 |
| asset profile | `energy_star_score` / `leed_level` / `fitwel_score` | update scores/certs | confirm | deterministic API | numeric / enum |
| utility account | `provider_name` / `account_number` / `utility_type` | add utility account, change provider | confirm | deterministic API | required fields |
| utility monthly | `usage_kwh` / `usage_therms` / `usage_gallons` | update usage, load bill | confirm | deterministic API | numeric >= 0 |
| utility monthly | `cost_total` / `peak_kw` / `renewable_pct` | update bill cost, demand, renewable share | confirm | deterministic API | numeric >= 0 |
| certification | `certification_type` / `level` / `score` / `status` | add LEED Gold, update score | confirm | deterministic API | valid status |
| regulatory exposure | `regulation_name` / `compliance_status` / `target_year` / `estimated_penalty` | mark as at risk, set target year | confirm | deterministic API | enum/year/decimal |

### Tasks / Work

| entity | field | natural-language variants | safety | execution path | validation |
| --- | --- | --- | --- | --- | --- |
| issue | `title` | rename ticket, retitle issue | confirm | deterministic API | non-empty |
| issue | `description_md` | rewrite description, update notes | confirm | deterministic API | string |
| issue | `status_id` | move to in progress/done/blocked | confirm | deterministic API | valid status in project |
| issue | `priority` | make this critical/high/low | confirm | deterministic API | enum |
| issue | `assignee` | assign to Sarah, reassign owner | confirm | deterministic API | string/user resolution |
| issue | `labels` | add label, tag as covenant | confirm | deterministic API | list of strings |
| issue | `estimate_points` | make it 5 points | confirm | deterministic API | int |
| issue | `due_date` | due Friday, set due date | confirm | deterministic API | valid date |
| issue | `sprint_id` | put this in Sprint 12, move to backlog | confirm | deterministic API | valid sprint or null |
| sprint | `name/start/end/status` | rename sprint, start sprint, close sprint | confirm | deterministic API | date/status validation |
| work item | `status` | mark waiting, block this, resolve this | confirm | MCP or deterministic API | enum |

### CRM / Consulting / Pipeline / PDS / Other Ops

| entity | field | natural-language variants | safety | execution path | validation |
| --- | --- | --- | --- | --- | --- |
| CRM account | `name/account_type/industry/website` | rename account, mark as customer, update website | confirm | deterministic API | strings |
| opportunity | `name/amount/stage/expected_close_date` | update amount, move stage, push close | confirm | deterministic API | decimal/date/stage |
| lead | `score/status/company/contact` | score this lead, qualify it, change contact email | confirm | deterministic API | type-specific |
| proposal | `title/total_value/status/valid_until/scope_summary/risk_notes` | revise proposal, re-cut scope, mark sent | confirm | deterministic API | decimal/date/status |
| engagement | `budget/actual_spend/status/start/end` | update budget, log spend, complete engagement | confirm | deterministic API | decimal/date/status |
| loop | `frequency/status/maturity/readiness/wait/rework/roles` | tighten process, change frequency, update roles | confirm | deterministic API | numeric enums and role list |
| pipeline deal | `status/source/strategy/headline_price/target_irr/target_moic/notes` | move to DD, change source, update price | confirm | deterministic API | enums and numeric checks |
| pipeline property | `occupancy/noi/asking_cap_rate/units/sqft/address` | revise NOI, fix address, update asking cap | confirm | deterministic API | numeric/address checks |
| PDS project | `stage/status/project_manager/budgets/dates/milestone` | move project to execution, update PM, shift milestone | confirm | deterministic API | date/budget validation |
| PDS RFI | `assigned_to/due_date/priority/response_text/status` | assign RFI, answer RFI, close RFI | confirm | deterministic API | string/date/status |
| PDS vendor | `trade/license/insurance_expiry/contact/status` | update vendor, mark inactive | confirm | deterministic API | date/status validation |
| legal matter | `risk_level/status/budget/outside_counsel/internal_owner` | raise risk, close matter, update owner | confirm | deterministic API | enum/decimal |
| credit case | `stage/requested_amount/risk_grade/status` | move case to committee, bump amount, change grade | confirm | deterministic API | enum/decimal |
| medoffice lease | `start/end rent/escalator/status` | renew lease, change base rent, close lease | confirm | deterministic API | date/decimal/status |
| compliance incident | `title/severity/timeline/status` | open incident, add incident note, raise severity | confirm | deterministic API | enum/string |
| ECC queue item | `action` | approve, delegate, escalate, defer, snooze, done | confirm | deterministic API | valid action + rationale when required |

## 5. Compound Workflow Catalog

| workflow | decomposition into atomic commands | dependencies | planning required | parse / execute / verify recommendation | confirmation points |
| --- | --- | --- | --- | --- | --- |
| Create a fund and seed three assets | `repe.fund.create` -> `repe.investment.create` (1..n) -> `repe.asset.create` (1..n) | fund before investments; investment before assets | yes | parse `GPT-5 mini`, plan `GPT-5.1`, execute deterministic, verify `GPT-5 mini` | once at plan approval, optionally per entity batch |
| Build a downside scenario and run it | `repe.model_scenario.create` -> `repe.model_scenario.asset.add` -> `repe.model_scenario.override.set` -> `repe.model_scenario.run` | scenario must exist before overrides/run | yes | parse `mini`, plan `5.1`, verify `mini` | before creating scenario and before final run |
| Compare all funds under higher rates | `repe.model.create` or reuse existing model -> `repe.model_scenario.create` -> set rate/debt overrides -> `repe.model_scenario.run` -> `repe.model.compare` | asset/fund scope resolution | yes | parse `5.1`, plan `5.1`, analyze `5.4` if broad synthesis | before scenario writes and run |
| Upload docs and tag them | `documents.document.upload.init` -> `documents.document.upload.complete` -> `documents.document.tag` -> `documents.document.index` | file present; entity scope resolved | yes | parse `mini`, execute deterministic, verify `mini` | before upload if user intent is explicit |
| Create a report and assign it | `reports.report.create` -> optional `tasks.issue.create` or `work.item.create` -> link report context | report before work item | yes | parse `mini`, plan `5.1`, execute deterministic | before report creation and task creation |
| Make a model from these assets | `repe.model.create` -> `repe.model_scenario.create` -> `repe.model_scenario.asset.add` | model context first | yes | parse `mini`, plan `5.1` | before model creation |
| Prepare a board-ready summary | deterministic reads (`reports.*`, `repe.*`, `documents.*`) -> assistant synthesis -> optional `reports.report.create` artifact | reads first; optional artifact write | yes | parse `5.1`, synthesize `5.4`, verify `mini` | only if creating/persisting artifact |
| Move this deal to next stage and notify team | `consulting.opportunity.advance` or `pipeline.deal.update` -> `tasks.issue.comment.add` or `work.item.comment.add` | entity resolution by domain | yes | parse `mini`, plan `5.1` | before stage mutation |
| Update assumptions and rerun outputs | `repe.model_scenario.override.set` -> `repe.model_scenario.run` -> optional `repe.waterfall.run` | run depends on overrides | yes | parse `mini`, plan `5.1` | before override write and before run |
| Push lease terms to model from document | `documents.document.search` / extraction -> map extracted fields -> `repe.model_scenario.override.set` or underwriting inputs -> run | extraction confidence threshold | yes | parse `5.1`, plan `5.4`, execute deterministic, verify `5.1` | before every write because inference risk is high |
| Create issue from a document and assign it | `documents.document.get/list` -> `tasks.issue.create` -> `tasks.issue.attachment.add` | document resolution first | yes | parse `mini`, plan `5.1` | before issue creation |
| Run quarter close and explain deltas vs prior quarter | `repe.quarter_close.run` -> `repe.quarter_state.get` current/prior -> `assistant.compare` | close must finish before comparison | yes | parse `5.1`, execute deterministic, analyze `5.4` | before quarter close |
| Create proposal and version it | `consulting.proposal.create` -> optional `consulting.proposal.version.create` -> optional `assistant.draft` | base proposal first | yes | parse `mini`, plan `5.1` | before each write |
| Approve a PDS executive item and draft the follow-up message | `pds.executive.queue.act` -> `pds.executive.messaging.generate` | queue item must exist | yes | parse `5.1`, execute deterministic, draft `5.1/5.4` | before approval action |
| Capture a loose commitment from email | `ecc.capture.quick` -> optionally `ecc.payable.create_from_message` or `tasks.issue.create` | capture before downstream conversion | yes | parse `5.1`, plan `5.1` | before creating payable/task |

## 6. Ambiguity and Clarification Rules

These phrases should never execute as writes without follow-up.

| phrase | plausible meanings | minimum clarification required | may infer from page context? | block until clarified? |
| --- | --- | --- | --- | --- |
| clean this up | reset overrides, retag docs, fix task fields, normalize model inputs | target entity + intended action | sometimes | yes |
| fix the numbers | update assumptions, correct ledger data, rerun report, change valuation | what numbers, what entity, new value or source | rarely | yes |
| update this | any field mutation | field + new value | only if one editable entity and one probable field | yes |
| move it forward | task status, opportunity stage, deal stage, proposal status, PDS project stage | which object + destination state | sometimes | yes |
| make it more conservative | increase cap rate, reduce revenue, increase vacancy, tighten debt, alter waterfall assumptions | which assumption set and how | sometimes for scenario page | yes |
| pressure test it | run downside scenario, run Monte Carlo, run covenant tests, run sustainability projection | which model/asset/fund and what stress type | sometimes | yes |
| lock this down | lock scenario version, archive model, freeze permissions, close issue | exact object + intended lock action | rarely | yes |
| run the model | underwriting run, model scenario run, quarter close, waterfall run, sustainability projection | which model/run type + scope | sometimes | yes |
| change the assumptions | any override write | which assumptions + new values | sometimes | yes |
| update the numbers | same as above | field/value pairs | sometimes | yes |
| give me the latest picture | read-only summary of current page, portfolio snapshot, recent documents, last run | summary target | yes | no, if treated read-only |
| show me what is off | read-only anomaly/risk summary | scope | yes | no, if read-only |
| take this to base case | reset scenario overrides, switch selected scenario, archive custom case | whether to reset or merely view base | yes | yes |
| roll this forward | push exit date, copy scenario, move quarter, advance schedule | which dimension/time shift | sometimes | yes |
| rebuild the report | rerun report, create a new report version, explain current report | report id + whether to overwrite or new version | sometimes | yes |
| mark this as done | close issue, resolve work item, complete message, complete engagement | object type | yes if unambiguous | yes |
| add another asset | create asset under deal, add existing asset to scenario, add property to pipeline | create new vs include existing | sometimes | yes |
| retag this doc | document exists, but tags/type unclear | desired tag(s) | yes | yes |
| re-run with tougher debt | underwriting, scenario run, quarter close, waterfall sensitivity | target run + debt parameters | sometimes | yes |
| compare this to last quarter | compare fund, asset, model, report, covenant results | entity scope | yes | no for read-only compare |

Clarification policy:
- If the command is a read-only summary and the page context clearly resolves scope, Winston may answer without clarification.
- If the command changes data, starts a run, approves/rejects something, or deletes anything, Winston should clarify until the target entity and required arguments are explicit.

## 7. File Inventory

### Frontend UI

- `repo-b/src/components/commandbar/GlobalCommandBar.tsx`
- `repo-b/src/components/repe/SaleScenarioPanel.tsx`
- `repo-b/src/components/repe/WaterfallScenarioPanel.tsx`
- `repo-b/src/components/repe/RepeEntityDocuments.tsx`
- `repo-b/src/components/repe/PropertyComps.tsx`
- `repo-b/src/components/repe/sustainability/SustainabilityWorkspace.tsx`
- `repo-b/src/components/tasks/TasksProjectClient.tsx`
- `repo-b/src/components/lab/PipelineBoard.tsx`
- `repo-b/src/components/pds-executive/DecisionQueue.tsx`
- `repo-b/src/components/pds-executive/DecisionDetailDrawer.tsx`
- `repo-b/src/components/ecc/EccClient.tsx`
- `repo-b/src/app/app/repe/funds/new/page.tsx`
- `repo-b/src/app/app/repe/deals/page.tsx`
- `repo-b/src/app/app/repe/assets/page.tsx`
- `repo-b/src/app/app/repe/models/page.tsx`
- `repo-b/src/app/app/repe/models/[modelId]/page.tsx`
- `repo-b/src/app/app/real-estate/page.tsx`
- `repo-b/src/app/app/real-estate/trust/[trustId]/page.tsx`
- `repo-b/src/app/app/real-estate/loan/[loanId]/page.tsx`
- `repo-b/src/app/app/crm/page.tsx`
- `repo-b/src/app/app/finance/repe/page.tsx`
- `repo-b/src/app/lab/env/[envId]/consulting/page.tsx`
- `repo-b/src/app/lab/env/[envId]/pds/projects/new/page.tsx`
- `repo-b/src/app/lab/env/[envId]/credit/page.tsx`
- `repo-b/src/app/lab/env/[envId]/legal/page.tsx`
- `repo-b/src/app/lab/env/[envId]/medical/page.tsx`

### Frontend Command Engine / API

- `repo-b/src/lib/server/commandOrchestrator.ts`
- `repo-b/src/lib/server/commandOrchestratorStore.ts`
- `repo-b/src/lib/commandbar/types.ts`
- `repo-b/src/lib/commandbar/assistantApi.ts`
- `repo-b/src/lib/bos-api.ts`
- `repo-b/src/lib/cro-api.ts`
- `repo-b/src/lib/tasks-api.ts`
- `repo-b/src/lib/pipeline-api.ts`
- `repo-b/src/lib/ecc/api.ts`

### Backend Router / Assistant Layer

- `backend/app/services/request_router.py`
- `backend/app/services/assistant_scope.py`
- `backend/app/services/ai_gateway.py`
- `backend/app/routes/business.py`
- `backend/app/routes/documents.py`
- `backend/app/routes/work.py`
- `backend/app/routes/executions.py`
- `backend/app/routes/repe.py`
- `backend/app/routes/re_v2.py`
- `backend/app/routes/re_pipeline.py`
- `backend/app/routes/re_sustainability.py`
- `backend/app/routes/real_estate.py`
- `backend/app/routes/underwriting.py`
- `backend/app/routes/reports.py`
- `backend/app/routes/tasks.py`
- `backend/app/routes/crm.py`
- `backend/app/routes/consulting.py`
- `backend/app/routes/pds.py`
- `backend/app/routes/pds_executive.py`
- `backend/app/routes/credit.py`
- `backend/app/routes/legal_ops.py`
- `backend/app/routes/medoffice.py`
- `backend/app/routes/compliance.py`
- `backend/app/routes/finance.py`
- `repo-c/app/main.py`

### MCP / Tool Registry

- `backend/app/mcp/tools/repe_tools.py`
- `backend/app/mcp/tools/re_model_tools.py`
- `backend/app/mcp/tools/document_tools.py`
- `backend/app/mcp/tools/work_tools.py`
- `backend/app/mcp/tools/report_tools.py`
- `backend/app/mcp/tools/business_tools.py`
- `backend/app/mcp/tools/env_tools.py`
- `backend/app/mcp/tools/metrics_tools.py`
- `backend/app/mcp/tools/execution_tools.py`
- `backend/app/mcp/tools/repo_tools.py`
- `backend/app/mcp/tools/rag_tools.py`

### Domain Schemas / Service Contracts

- `backend/app/schemas/repe.py`
- `backend/app/schemas/re_institutional.py`
- `backend/app/schemas/re_sustainability.py`
- `backend/app/schemas/re_pipeline.py`
- `backend/app/schemas/real_estate.py`
- `backend/app/schemas/underwriting.py`
- `backend/app/schemas/reporting.py`
- `backend/app/schemas/documents.py`
- `backend/app/schemas/work.py`
- `backend/app/schemas/tasks.py`
- `backend/app/schemas/crm.py`
- `backend/app/schemas/consulting.py`
- `backend/app/schemas/pds.py`
- `backend/app/schemas/credit.py`
- `backend/app/schemas/legal_ops.py`
- `backend/app/schemas/medoffice.py`
- `backend/app/schemas/compliance.py`
- `backend/app/schemas/finance.py`

### Docs / Tests / Config

- `WINSTON_AGENTIC_PROMPT.md`
- `WINSTON_DOCUMENT_INTELLIGENCE_PLAN.md`
- `WINSTON_RERANKING_AND_MODEL_DISPATCH_PROMPT.md`
- `WINSTON_TESTING_STRATEGY.md`
- `repo-b/tests/global-commandbar.spec.ts`
- `repo-b/tests/commands-contract.spec.ts`
- `backend/tests/test_assistant_scope.py`
- `backend/tests/test_underwriting_api.py`
- `backend/tests/test_underwriting_normalization.py`

## 8. Gap Analysis

### Supported but hidden

- Most deterministic CRUD and run actions across REPE, PDS, consulting, CRM, credit, legal, medoffice, finance, sustainability, pipeline, and tasks.
- Document tagging, extraction, and entity-scoped document workflows.
- Model approval/archive, scenario version locking, scope add/remove, override reset.
- PDS executive queue actions, ECC actions, finance capital calls/distributions/waterfalls.

### Supported but unsafe

- Direct UI/API mutations with no canonical assistant confirmation contract.
- Router write detection that misses most write verbs and business shorthand.
- Same user intent can hit different code paths with different safety behavior.
- Destructive actions like delete/remove/archive/reset exist in UI/API layers but are not centrally governed by assistant policy.

### Unsupported but should exist

- Canonical `update` commands for funds, investments, assets, scenarios, reports, documents, CRM objects, PDS objects, and finance objects.
- Canonical `approve/reject/defer/delegate` command family across PDS executive, ECC, consulting, credit committee, legal approvals, and compliance signoffs.
- Canonical `document.upload + index + tag + extract + push to model` workflows.
- Canonical `compare/analyze/explain` verbs for quarter-over-quarter, base-vs-scenario, UW-vs-actual, benchmark-vs-current, and document-vs-model reconciliation.

### Duplicated paths

- REPE create/list flows exist through UI/API and MCP separately.
- Reports exist through UI/API and MCP.
- Environment CRUD exists through planner, repo-c APIs, and UI components.
- Quick actions invoke assistant-only prompts that overlap deterministic read surfaces but do not normalize into command IDs.

### Bypass paths

- UI buttons and forms call deterministic routes directly without going through the assistant planner.
- AI Gateway can use MCP write tools, but the planner does not know most of those tools.
- Some flows rely on background fetches and ad hoc API calls instead of a command adapter layer.

### Missing confirmation coverage

- Updates almost everywhere outside the toy planner.
- Approval verbs in PDS executive and ECC.
- Scenario override resets, archive actions, version locks, report reruns, finance runs, sustainability projections.
- Document tagging and extraction-driven writes.

### Missing audit coverage

- Anything done by direct frontend forms that is not wrapped in a canonical assistant command record.
- Cross-surface mutations where the same entity can change through UI, MCP, or route without a shared audit payload.
- Natural-language-to-write translations that should preserve parsed intent, clarified fields, and confirmation evidence.

## 9. Recommended Canonical Command Schema

```json
{
  "command_id": "repe.model_scenario.override.set",
  "domain": "repe",
  "entity_type": "scenario_override",
  "entity_id": "uuid-or-null",
  "action_family": "update",
  "action": "set",
  "args": {
    "scenario_id": "uuid",
    "scope_type": "asset",
    "scope_id": "uuid",
    "key": "revenue_delta_pct",
    "value": -5,
    "unit": "percent"
  },
  "scope": {
    "environment_id": "uuid-or-null",
    "business_id": "uuid-or-null",
    "page_entity_type": "asset",
    "page_entity_id": "uuid-or-null",
    "selected_entities": [],
    "visible_context_used": true
  },
  "nl_source": {
    "raw_user_message": "haircut rents by 5%",
    "canonical_phrase": "decrease revenue by 5 percent",
    "language_variant": "finance_shorthand"
  },
  "inferred_from_context": {
    "fields": ["scope_id", "scenario_id"],
    "confidence": 0.92
  },
  "clarification": {
    "required": false,
    "questions": [],
    "ambiguity_flags": []
  },
  "safety": {
    "is_write": true,
    "requires_confirmation": true,
    "requires_scope": true,
    "requires_entity_resolution": true,
    "requires_permissions": true,
    "environment_restrictions": [],
    "audit_required": true,
    "reversible": true,
    "user_visible_risk": "medium"
  },
  "routing": {
    "execution_mode": "deterministic_api",
    "planner_required": false,
    "tool_name": null,
    "adapter": "repe.model_scenario_override_adapter"
  },
  "audit_metadata": {
    "actor": "user-or-session-id",
    "conversation_id": "optional",
    "confirmation_artifact": "token-or-tool-summary",
    "source_surface": "chat|quick_action|ui",
    "trace_id": "uuid"
  }
}
```

Required schema rules:
- `command_id` must be canonical and stable.
- `action_family` must be one of the ontology families, even when `action` is more specific.
- `args` must use domain-native field names, not raw NL fragments.
- `scope` and `inferred_from_context` must preserve what Winston inferred versus what the user explicitly supplied.
- `clarification` must be first-class, not implicit in assistant prose.
- `safety` must travel with the command from parse through execution.
- `routing` must name the adapter/tool/service, not just the domain.

## 10. Recommended Routing Rules

### Assistant-only

- Narrative summaries, explanations, drafts, comparisons, and board-ready text where no business state changes.
- Examples:
  - portfolio risk summaries
  - LP update drafts
  - covenant-risk explanations
  - report explanations
  - quarter-over-quarter deltas
  - "what's dragging performance?"

### Deterministic API / Service Layer

- First-party CRUD and run endpoints that already exist and do not need arbitrary tool autonomy.
- Examples:
  - REPE create/update/run flows
  - tasks, CRM, consulting, PDS, credit, legal, medoffice, finance, sustainability, pipeline
- This should be the default for most canonical commands.

### MCP Tool

- Read/query commands already wrapped as stable tools.
- Mutation commands only where the tool itself enforces `needs_input` and `pending_confirmation`.
- Good current fits:
  - `repe.*` read/create tools
  - `documents.*`
  - `work.*`
  - `reports.*`
  - `env.*`
  - `metrics.*`

### Command Planner

- Multi-step deterministic workflows where one user request decomposes into multiple atomic commands.
- Examples:
  - create fund + seed investments/assets
  - upload + tag + index document
  - create report + create task + attach report
  - run quarter close + compare to prior quarter + summarize deltas

### Command Planner + Confirmation

- Any workflow containing writes, approvals, destructive actions, or costly runs.
- Planner should summarize the atomic steps, show the resolved entities and fields, then obtain one explicit approval.

### Agentic Workflow Executor

- Use only when:
  - the request spans multiple systems and requires dynamic decision-making
  - document extraction and verification feed later writes
  - deterministic APIs alone are insufficient
- Examples:
  - "load the rent roll from this OA into the underwriting model and rerun downside"
  - "compare current quarter vs prior, find the source docs, and draft the board summary"

General routing policy:
- Read-only + visible UI answer available: respond directly from visible context.
- Read-only + deterministic query exists: use deterministic service or MCP read tool.
- Single-write + stable endpoint exists: use deterministic adapter with confirmation.
- Multi-write or run chain: use planner, then deterministic adapters.
- Never let free-form assistant prose become an implicit mutation.

## 11. OpenAI Model / Task Routing Recommendation

Use the following model split.

### Command classification

- Default: `GPT-5 mini`
- Reasoning effort: `low`
- Why: intent classification is usually bounded and should be cheap.
- Add rules before model use for obvious identity/count/list queries.

### Colloquial-to-canonical translation

- Default: `GPT-5 mini`
- Escalate to `GPT-5.1` when:
  - the utterance includes business shorthand
  - multiple entities are in scope
  - field grammar is ambiguous
- Reasoning effort: `low` by default, `medium` on escalation.

### Ambiguity detection

- Hybrid rules + `GPT-5 mini`
- Escalate to `GPT-5.1` when:
  - a write is possible
  - multiple plausible command families match
  - the system is deciding whether it can safely infer from page context
- Do not waste `GPT-5.4` here.

### Multi-step planning

- Default: `GPT-5.1`
- Reasoning effort: `medium`
- Escalate to `high` only for document-driven or cross-domain workflows.
- `GPT-5.1` is the right center of gravity for coding/agentic task routing and plan generation.

### Hardest professional reasoning / ontology design / broad repo analysis

- `GPT-5.4`
- Reasoning effort: `high`
- Use for:
  - ontology revisions
  - command schema design
  - cross-domain policy work
  - edge-case governance rules
  - major compound workflow design

### Verification / judge pass

- Default: `GPT-5 mini`
- Escalate to `GPT-5.1` for high-risk writes or when checking document-to-field extraction before mutation.
- Use a strict structured checklist:
  - entity resolved?
  - args complete?
  - safety flags set?
  - confirmation artifact present?
  - adapter chosen correctly?

### Code / repo inspection

- `GPT-5.1` for regular implementation work
- `GPT-5.4` only when the task is broad, architectural, or heavily ambiguous

Summary:
- `GPT-5.4` for hardest professional reasoning, ontology design, deeper planning, and broad repo analysis
- `GPT-5.1` where coding/agentic task routing and configurable reasoning are central
- `GPT-5 mini` for fast classification, bounded transforms, and cheap verification
- higher reasoning effort only where ambiguity/planning warrants it
- do not waste the heaviest model on trivial intent classification

## 12. Final Implementation Sequence

1. Define the canonical ontology.
   - Freeze domains, entities, action families, safety enums, and execution modes.

2. Define the command schema.
   - Implement one stable payload shape shared by parser, planner, executor, and audit.

3. Build the translation layer.
   - Map natural language, shorthand, and colloquial variants to canonical command IDs and typed args.

4. Build clarification rules.
   - Add deterministic ambiguity rules before execution.
   - Make clarification structured, not ad hoc prose.

5. Build deterministic adapters.
   - Wrap existing route/client/MCP calls behind adapter names for each command family.

6. Build planner support for compound workflows.
   - Planner should compose atomic commands, not invent new backend semantics.

7. Normalize confirmation.
   - One confirmation contract for all writes, destructive actions, approvals, and expensive runs.

8. Add tracing and audit.
   - Persist parsed command, clarified fields, scope inference, confirmation artifact, execution adapter, result, and actor.

9. Add safety policy enforcement.
   - Permissions, environment restrictions, destructive-op guardrails, reversible/irreversible flags.

10. Add comprehensive tests.
   - intent classification
   - colloquial translation
   - ambiguity handling
   - confirmation enforcement
   - adapter routing
   - regression tests for real user phrasing

11. Expose the command layer consistently in UI and chat.
   - Quick actions, button clicks, command bar, and assistant suggestions should all emit canonical commands.

12. Replace the toy planner incrementally.
   - Do not expand the existing regex-only planner much further.
   - Route it into the canonical parser, then deprecate the legacy command catalog once coverage is in place.
