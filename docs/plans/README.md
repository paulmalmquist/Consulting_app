# docs/plans — Environment Planning and Session Orchestration

This directory is the durable planning layer for every product environment in the Novendor / BusinessMachine platform. It is not documentation for its own sake. It is the operating manual that every coding session — Claude Code, Codex, or ChatGPT — should read before writing a line and update before finishing.

## Why this exists

Context loss between sessions is the single biggest drag on development velocity. Every session that starts without a plan wastes 10–20 minutes re-discovering what was already known. Every session that ends without updating the plan wastes the same time for the next session.

This directory is the antidote.

## How routing works

Every new idea, bug report, or feature request enters the system through `00-dispatch/` before any code is written.

1. Read `00-dispatch/routing-map.md` to classify the idea by environment and shared standard impact.
2. Fill out `00-dispatch/idea-intake-template.md` to produce a dispatch record.
3. Route to the correct environment folder(s) and any `01-shared-standards/` subfolder(s) the work touches.
4. If the session produces a durable architectural decision, record it in `00-dispatch/decision-log.md`.
5. If an unresolved question surfaces, add it to `00-dispatch/open-questions.md`.

Only after the dispatch record exists should a coding session open any implementation file.

## How to use this system

### At the start of a coding session
0. Read [`CONSOLIDATED_BACKLOG.md`](CONSOLIDATED_BACKLOG.md) — the single source of truth for open work across all former in-flight sessions (priorities, blocked items, and what already shipped). It supersedes the per-environment `next-session.md` notes for *status*.
1. Check `00-dispatch/open-questions.md` and `00-dispatch/decision-log.md` for anything that affects your work.
2. Identify which environment you are working on.
3. Open `docs/plans/<environment>/next-session.md` — it contains a copy-paste-ready prompt with context, files, and acceptance criteria.
4. Read `docs/plans/<environment>/architecture.md` to understand the current implementation map.
5. Check `docs/plans/<environment>/backlog.md` for known bugs and open work.

### At the end of a coding session
1. Update `docs/plans/<environment>/next-session.md` with what the next session should pick up.
2. Move newly discovered bugs into `docs/plans/<environment>/backlog.md`.
3. Move confirmed architecture discoveries into `docs/plans/<environment>/architecture.md`.
4. Update `docs/plans/<environment>/qa-checklist.md` if new acceptance criteria were found.
5. Update `docs/plans/<environment>/release-readiness.md` if gates changed.
6. Update `01-shared-standards/` if any shared design, AI, or eval contract changed.
7. Add reusable repo-wide lessons to `docs/tips.md`.

## Directory structure

```
docs/plans/
  00-dispatch/              ← Entry point for all new ideas
  01-shared-standards/      ← Cross-environment design, AI, and eval contracts
  control-tower/
  novendor-crm-accounting/
  meridian-repe/
  stone-pds/
  supply-chain-databricks/
  winston-legal/
  history-rhymes/
  senior-housing/
  demo-lab/
  excel-addin/
  mcp-orchestration-ai-runtime/
  marketing-domain-routing/
  _templates/
```

## 00-dispatch contents

| File | Purpose |
|---|---|
| `00-dispatch/README.md` | How dispatch works and what belongs here |
| `00-dispatch/routing-map.md` | Step-by-step classification and routing guide with examples |
| `00-dispatch/idea-intake-template.md` | Fill-in template for a dispatched idea record |
| `00-dispatch/decision-log.md` | Durable architectural and product decisions — do not relitigate these |
| `00-dispatch/open-questions.md` | Unresolved cross-environment questions blocking plan completion |

## Environment index

| Environment | Folder | Status |
|---|---|---|
| Control Tower / Environment Provisioning | `control-tower/` | Draft |
| Novendor CRM / Accounting Command Desk | `novendor-crm-accounting/` | Draft |
| Meridian / REPE Finance | `meridian-repe/` | Draft |
| Stone PDS / Professional Services | `stone-pds/` | Draft |
| Supply Chain / Databricks | `supply-chain-databricks/` | Draft |
| Winston Legal | `winston-legal/` | Draft |
| History Rhymes / Trading | `history-rhymes/` | Draft |
| Senior Housing | `senior-housing/` | Draft |
| Demo Lab / RAG / Pipeline | `demo-lab/` | Draft |
| Excel Add-in | `excel-addin/` | Draft |
| MCP / Orchestration / AI Runtime | `mcp-orchestration-ai-runtime/` | Draft |
| Marketing / Public Site / Domain Routing | `marketing-domain-routing/` | Draft |

## Existing strategic plans (do not duplicate)

These files already exist in `docs/plans/` and should be linked from environment folders rather than duplicated:

- `ROADMAP.md` — top-level platform roadmap
- `INVESTMENT_ENGINE_PLAN.md` — investment engine full plan
- `HISTORY_RHYMES_BUILD_PLAN.md` — History Rhymes build plan
- `TRADING_LAB_ENHANCEMENT_PLAN.md` — trading lab enhancements
- `TRADING_PLATFORM_REBUILD_PLAN.md` — trading platform rebuild
- `PDS_DEEP_RESEARCH_PLAN.md` — PDS deep research plan
- `MIGRATION_ENGINE_SPEC.md` — migration engine spec
- `investment-engine/` — investment engine per-module plans and handoffs

## File roles

Every environment folder contains these files:

| File | Purpose |
|---|---|
| `README.md` | Entry point. What the environment is and where to start. |
| `architecture.md` | Verified implementation map: routes, services, tables, components, tests. |
| `roadmap.md` | Phased delivery plan. Phase 0–4 from stabilize to demo-ready. |
| `backlog.md` | Active bugs, improvements, and open work. Updated every session. |
| `qa-checklist.md` | Specific checks that prove the environment works. |
| `next-session.md` | Copy-paste-ready prompt for the next coding session. Updated every session. |
| `release-readiness.md` | Binary gate list. What must pass before this is shippable. |

Three additional per-environment files now exist alongside these:

| File | Purpose |
|---|---|
| `design-adaptation.md` | How this environment adapts shared design tokens — colors, shell chrome, card styles, dark/light mode rules. Read before any UI work in this environment. |
| `ai-behavior.md` | Environment-specific AI behavior rules — which tools are active, what the assistant should refuse, what null reasons apply, persona and tone constraints. Read before any AI or prompt work. |
| `eval-plan.md` | Structured test fixtures with prompts, rubrics, and pass/fail criteria for this environment. Includes both AI answer evals and screenshot/Playwright evals. |

## Templates

Reusable templates are in `_templates/`:
- `environment-plan-template.md` — full environment plan scaffold
- `coding-session-handoff-template.md` — session handoff scaffold
- `qa-checklist-template.md` — QA checklist scaffold
- `architecture-inventory-template.md` — architecture inventory scaffold
- `release-readiness-template.md` — release readiness scaffold
- `backlog-template.md` — backlog scaffold

## Maintenance rules

See `PLAN_MAINTENANCE_RULES.md` for the full rule set.
