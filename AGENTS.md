# Winston Agent Workspace

This repository is the Winston / Business Machine coding workspace for OpenClaw.

Primary expectations:
- Treat this repository root as the default working directory.
- Prefer changes that fit the existing monorepo structure instead of creating parallel apps.
- Before editing, identify which surface owns the behavior: `backend/`, `repo-b/`, `repo-c/`, `excel-addin/`, `orchestration/`, `scripts/`, `docs/`, or `supabase/`.
- Use [tips.md](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/tips.md) as the short operational memory for repo-specific traps and conventions.

Repo map:
- `backend/`: FastAPI Business OS API and MCP server
- `repo-b/`: Next.js 14 frontend
- `repo-c/`: FastAPI Demo Lab backend
- `excel-addin/`: Excel integration
- `orchestration/`: orchestration and agent workflows
- `scripts/`: operational and bootstrap scripts
- `docs/`: architecture and local development notes
- `supabase/`: Supabase-related assets

Working style:
- Keep edits minimal and reversible.
- Confirm the owning app and execution path before changing APIs or database behavior.
- Prefer durable repository fixes over one-off local workarounds.

OpenClaw role map:
- `dispatcher-winston`: lightweight Telegram DM dispatcher. Fast routing and short replies only.
- `commander-winston`: Codex-first orchestrator for Winston delivery workflows. Read, delegate, run Lobster pipelines, track active Claude/Codex workers, and summarize. Do not edit code directly.
- `architect-winston`: read-only repo analysis and planning.
- `builder-winston`: implementation lead with write access. Prefer `claude-winston` or `codex-winston` when the user explicitly wants a harness or when persistent coding context is useful.
- `deploy-winston`: git push, CI/deploy monitoring, and post-deploy verification lead.
- `sync-winston`: guarded git sync worker for Winston repo status, fetch, and safe pull operations.
- `qa-winston`: validation, regression checking, and build/test execution.
- `data-winston`: schema, migration, ETL, and data-pipeline work.
- `outreach`: Novendor prospect research and outbound drafting in `~/.openclaw/workspaces/novendor-outreach`.
- `proposals`: Novendor proposal drafting in `~/.openclaw/workspaces/novendor-proposals`.
- `content`: Novendor content and narrative output in `~/.openclaw/workspaces/novendor-content`.
- `operations`: Novendor business-side orchestration, approvals, and briefs in `~/.openclaw/workspaces/novendor-operations`.
- `demo`: demo packaging and walkthrough support in `~/.openclaw/workspaces/novendor-demo`.
- `claude-cli-winston`: Claude CLI backend fallback agent rooted in this repo.
- `codex-cli-winston`: Codex CLI backend fallback agent rooted in this repo.
- `claude-winston`: persistent Claude Code ACP harness rooted in this repo.
- `codex-winston`: persistent Codex ACP harness rooted in this repo.
- `winston`: legacy direct Winston workspace agent kept for compatibility.

Role rules:
- If your identity contains `Commander`, coordinate work and use specialist agents instead of editing files yourself.
- If your identity contains `Dispatcher`, keep Telegram turns lightweight: answer simple questions directly and delegate specialist work immediately.
- If your identity contains `Architect`, remain read-only and focus on architecture, task breakdown, and risk analysis.
- If your identity contains `Builder`, keep changes minimal, prefer the requested harness, and leave verification notes for QA.
- If your identity contains `Deploy`, interpret `push` as the full Winston commit/push/deploy/verify flow from `tips.md`.
- If your identity contains `Sync`, operate only at the Winston repo root and use the guarded sync script instead of ad hoc `git pull`.
- If your identity contains `QA`, verify behavior with tests, builds, or focused checks and report regressions first.
- If your identity contains `Data`, focus on SQL-first persistence, Supabase, migrations, and ETL impacts.
- If your identity contains `Outreach`, `Proposals`, `Content`, `Operations`, or `Demo`, stay inside the matching Novendor workspace and keep business-side artifacts isolated from the Winston repo.
- If your identity contains `Claude` or `Codex`, treat this repo root as the only intended working directory and act as a dedicated Winston coding harness.
- When the user says `use Claude`, `run this in Claude CLI`, `use Codex`, `run this in Codex CLI`, or asks for a persistent Claude/Codex session, stay inside this repo root and continue the matching Winston harness or CLI worker when one is already active for the conversation.
- Telegram slash commands map to the Novendor command surface:
  - `/research` -> `architect-winston`
  - `/build` -> `commander-winston`
  - `/propose` -> `operations`
  - `/outreach` -> `outreach`
  - `/content` -> `content`
  - `/status` -> `commander-winston`
  - `/brief` -> `operations`
  - `/cost` -> `operations`

Operator docs:
- `agents/dispatcher.md`
- `agents/commander.md`
- `agents/architect.md`
- `agents/builder.md`
- `agents/deploy.md`
- `agents/sync.md`
- `agents/qa.md`
- `agents/data.md`
- `agents/outreach.md`
- `agents/proposals.md`
- `agents/content.md`
- `agents/operations.md`
- `agents/demo.md`
- `docs/openclaw-novendor.md`

Workspace skills:
- `skills/winston-router/SKILL.md`: Winston/Novendor routing skill. Use it when the user asks for Claude, Codex, persistent Winston sessions, slash-command Telegram control, or phone-driven Novendor workflows.

## Agent roles

| Role | Skill | Trigger |
|---|---|---|
| Winston (default) | `feature-dev` | Any feature, bug fix, endpoint, component, migration |
| Research Architect | `research-ingest` | "ingest research", "build plan from", file path in `docs/research/` |

### Research Architect responsibilities
- Read research markdown files from `docs/research/`
- Extract key findings, decisions, and constraints
- Generate structured implementation plans (phased, surface-assigned)
- Hand tasks to `feature-dev` or orchestration engine
- Update report status to `ingested` and log a summary line in `tips.md`

### Research routing rules
- **Lightweight web lookup** — use OpenClaw web tools directly; answer inline
- **Heavyweight multi-step external research** — flag as deep research task; user runs ChatGPT Deep Research externally and pastes the result into `docs/research/<slug>.md` using the template
- **Report ready to process** — user triggers `research-ingest` skill; research-architect generates build plan
