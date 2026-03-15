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
  - Winston
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
| implementation, bug fix, endpoint, page, component | `.skills/feature-dev/SKILL.md` |
| architecture, audit, repo mapping, plan | `agents/architect.md` |
| Winston or Novendor routing, harness selection, Telegram command surface | `skills/winston-router/SKILL.md` |
| repo sync, fetch, pull, dirty-tree checks | `agents/sync.md` |
| push, deploy, CI, Railway, Vercel, production verification | `agents/deploy.md` |
| QA, regression, smoke test, validation | `agents/qa.md` |
| schema, SQL, migrations, ETL, seeds | `agents/data.md` |
| research ingestion from `docs/research/*` | `.skills/research-ingest/SKILL.md` |
| business-side Novendor commands | `agents/operations.md`, `agents/outreach.md`, `agents/proposals.md`, `agents/content.md`, `agents/demo.md` |
| explicit prompt or playbook request | selected `docs/WINSTON_*PROMPT*.md` |

## Owning-Surface Map

| Surface | Owner | Typical downstream docs |
|---|---|---|
| `repo-b/` | Next.js frontend and direct-DB handlers | `feature-dev`, `qa-winston`, `data-winston` |
| `backend/` | FastAPI Business OS APIs and MCP server | `feature-dev`, `architect-winston`, `qa-winston`, `data-winston` |
| `repo-c/` | Demo Lab backend | `feature-dev`, `qa-winston` |
| `repo-b/db/schema/`, `supabase/` | SQL-first schema and data contracts | `data-winston`, `feature-dev` |
| `orchestration/`, `scripts/` | operational tooling and agent workflows | `commander-winston`, `sync-winston`, `deploy-winston`, `feature-dev` |
| `docs/` | prompts, playbooks, references | explicit prompt docs or `architect-winston` |
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
- If a user explicitly names a legacy prompt, open it as reference but route active execution through the current primary doc.
- Use `docs/instruction-index.md` when the route is unclear or a new routed doc must be registered.

## Concrete Routing Examples

- `Review backend/app/routes/nv_ai_copilot.py and explain how it fits the repo` -> `agents/architect.md`
- `Implement a loading fix in repo-b/src/app/lab/env/[envId]/page.tsx` -> `.skills/feature-dev/SKILL.md` with `agents/builder.md` as support
- `/research compare assistant routing approaches` -> `agents/architect.md`
- `ingest research: docs/research/2026-03-11-irr-libs.md` -> `.skills/research-ingest/SKILL.md`
- `use Codex CLI for this Winston bug` -> `skills/winston-router/SKILL.md`
- `push this and watch Railway and Vercel` -> `agents/deploy.md`
- `sync Winston, stop if the repo is dirty, and summarize incoming commits` -> `agents/sync.md`
- `run QA on the REPE regression path` -> `agents/qa.md`
- `add a migration in repo-b/db/schema and coordinate the backfill` -> `agents/data.md`
- `/propose a scope for this client` -> `agents/operations.md`
- `open the latency optimization prompt` -> `docs/WINSTON_LATENCY_OPTIMIZATION_PROMPT.md`
- `help me improve the frontend and backend together` -> stay in `CLAUDE.md` and ask one clarifying question
