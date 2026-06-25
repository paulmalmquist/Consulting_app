# Winston Repository Contract

This is the Claude Code startup contract for the Winston / Business Machine
repository. Keep it compact. Detailed procedures belong in discoverable skills,
surface-specific architecture docs, and targeted sections of `docs/tips.md`.

Follow `docs/anti-ai-style.md` for prose, comments, commit messages, and docs.

## Current repository map

- `backend/` — canonical FastAPI Business OS API, Demo Lab compatibility APIs,
  AI gateway, MCP server, and domain services.
- `repo-b/` — Next.js 14 frontend, lab UI, route handlers, and ordered SQL in
  `repo-b/db/schema/`.
- `telemetry-platform/` — telemetry ML, Databricks notebooks, governed pipeline,
  evidence, and local evaluation code.
- `excel-addin/` — Excel integration.
- `orchestration/` and `scripts/` — agent workflows and operational tooling.
- `supabase/` — Supabase assets. Not every domain uses Supabase; verify the
  owning database before running SQL.
- `docs/` — architecture, plans, runbooks, and durable operational lessons.

The former standalone Demo Lab backend is retired. Lab compatibility now runs
through `backend/`.

Root `agents/*.md` files are OpenClaw role contracts, not Claude Code subagents.
Claude-discoverable project skills live under `.claude/skills/` and delegate to
canonical bodies under `skills/` or `.skills/`.

The machine-readable routing source of truth is
`config/instruction-routing.json`; `docs/instruction-index.md` is generated.

## Routing precedence

Choose the narrowest valid route in this order:

1. Explicit user command, skill, agent, ticket, or requested harness.
2. Resume artifact: selected plan, active PR, `next-session.md`, or approved
   Session Brief.
3. Explicit file path and owning surface.
4. Work type and ADO risk class.
5. Ask one question only when the primary write owner or production authority
   remains ambiguous.

Use one primary write owner. Supporting agents remain read-only unless they are
assigned explicit, non-overlapping files.

Common ownership:

- Shared Next.js UI and route handlers → `agents/frontend.md`.
- FastAPI domain routes and services → `agents/bos-domain.md`.
- Lab/environment and telemetry product slices → `agents/lab-environment.md`.
- AI gateway, RAG, prompts, conversations, model routing → `agents/ai-copilot.md`.
- MCP tool names, schemas, permissions, registry, audit → `agents/mcp.md`.
- SQL, migrations, ETL, and persistence contracts → `agents/data.md`.
- Architecture, audits, explanations, planning → `agents/architect.md`.
- Validation and regressions → `agents/qa.md`.
- Commit, PR, deploy, and production verification → `agents/deploy.md`.

Use `/winston-router` when agent or harness selection itself is the task.

## Session start

For continuation or implementation work, use `/winston-session-start`.

Before mutation:

1. Resolve the repo with `git rev-parse --show-toplevel`; do not trust the
   current directory.
2. Report branch, HEAD, dirty files, worktrees, active matching PRs, selected
   plan, and ADO item.
3. Reconstruct current state from git, plans, PRs, tests, deployment state, and
   ADO. Conversation memory is supporting context, not authority.
4. Identify PLAN or CODE from the request.
5. Select the primary write owner and ADO risk.
6. Read the relevant architecture and `next-session.md`; search
   `docs/tips.md` for targeted sections instead of loading the entire file.
7. Create a dedicated worktree from fresh `origin/main` before editing.

The shared checkout may be changed by another agent at any time. Never switch
its branch, reset it, clean it, or stage its files.

## Risk-based Azure DevOps gate

- **R0 — read-only:** explanation, audit, architecture review, planning,
  inventory, or validation. No ADO requirement.
- **R1 — focused reversible change:** scoped UI, code, test, or documentation
  work. Reuse an existing ticket when present; new intake is optional unless
  requested.
- **R2 — governed change:** schema, migration, security/auth, MCP contracts,
  cloud infrastructure or cost, production data, deploy/release, agent
  governance, or multi-session/cross-surface work. An approved ADO Story/Bug
  and Session Brief are required.

Use `/azure-devops-intake` for R2 work or explicit board requests. ADO
unavailability blocks R2 mutation, but not R0 analysis or R1 local work.

## Implementation rules

Use `/feature-dev` for code or behavior changes.

- Scope by ticket and acceptance criteria, not by forcing work into one
  directory. Cross-surface changes are allowed when one coherent ticket owns
  them.
- Inspect adjacent code before editing.
- Preserve unrelated user changes.
- Run focused baseline checks. Record unrelated pre-existing failures instead
  of expanding scope or stopping automatically.
- Use actual project commands:
  - frontend typecheck: `npm --prefix repo-b run typecheck`
  - frontend lint: `npm --prefix repo-b run lint`
  - frontend unit tests: `npm --prefix repo-b run test:unit`
  - backend focused tests: `python -m pytest <paths>`
  - instruction checks: `npm run validate:instructions && npm run test:instructions`
- For schema work, read `ARCHITECTURE.md`, identify the actual database and
  owner, and use `/apply-pending-migrations` only for reviewed migrations.
- Never fabricate data, lineage, status, metrics, external capability, or
  deployment success. Missing evidence stays unavailable with a reason.
- Never print or persist secret values in transcripts, plans, `docs/tips.md`,
  or machine memory.
- No commit or PR may delete more than 100 files without explicit approval.

## Full delivery

CODE sessions default to full delivery through `/winston-full-delivery`:

1. Run focused tests and the relevant full gate.
2. Commit and push from the isolated worktree.
3. Open the PR, monitor CI, address scoped failures, and merge.
4. Frontend: let the `main` Vercel build deploy and verify its commit.
5. Backend: deploy only after merge, from a clean `main` checkout.
6. Apply migrations only when explicitly scoped and with the correct owner.
7. Run production smoke verification.
8. Update ADO when the work was gated.
9. Update `next-session.md` only if work remains.
10. Add to `docs/tips.md` only for a durable repo-wide lesson.

For instruction-only changes, delivery means merge, green routing checks, and
verification in a fresh Claude session. Do not deploy Railway or Vercel.

If delivery is blocked, report the exact completed stage, blocker, preserved
artifacts, and next command. Do not describe partial delivery as complete.

## Durable versus temporary context

Durable architecture, commands, and repeated traps belong in `docs/tips.md` or
the owning architecture document. Current branches, PR numbers, one-off task
state, and temporary observations belong in `next-session.md`, ADO, or local
session memory. Credentials belong nowhere in these files.
