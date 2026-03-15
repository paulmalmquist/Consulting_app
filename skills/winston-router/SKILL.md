---
id: winston-router
kind: skill
status: active
source_of_truth: true
topic: winston-routing-skill
owners:
  - cross-repo
intent_tags:
  - docs
  - ops
triggers:
  - use Claude
  - use Codex
  - Telegram
  - Novendor
  - Winston router
entrypoint: true
handoff_to:
  - dispatcher-winston
  - commander-winston
when_to_use: "Use after CLAUDE.md selects Winston or Novendor routing, harness selection, Telegram command handling, or workspace selection."
when_not_to_use: "Do not use as the generic repo-wide router after CLAUDE.md has already selected a more specific build, QA, deploy, sync, data, or research workflow."
surface_paths:
  - skills/
  - orchestration/
  - scripts/
commands:
  - /research
  - /build
  - /propose
  - /outreach
  - /content
  - /ops_status
  - /brief
  - /cost
name: winston-router
description: Route Winston / Business Machine and Novendor requests to the correct agents, harnesses, and Lobster workflows. Use when the user mentions Winston, Business Machine, Claude Code, Claude CLI, Codex, Codex CLI, Telegram-controlled development, or the Novendor phone command surface.
---

# Winston / Novendor Router

`CLAUDE.md` owns the global routing contract. This skill applies the Winston-specific handoff rules once the repo-level router has already decided that the request is about Winston or Novendor orchestration.

## Scope

- Winston repo root: `/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app`
- Never route Winston coding work to `main` or `~/.openclaw/workspace` unless the user explicitly asks for the generic workspace
- Prefer Winston or Novendor specialists over generic workers when the request is explicitly about this repo or these operator workflows

## Business Workspaces

- `outreach`: `~/.openclaw/workspaces/novendor-outreach`
- `proposals`: `~/.openclaw/workspaces/novendor-proposals`
- `content`: `~/.openclaw/workspaces/novendor-content`
- `operations`: `~/.openclaw/workspaces/novendor-operations`
- `demo`: `~/.openclaw/workspaces/novendor-demo`

## Agent map

- `dispatcher-winston`: lightweight Telegram dispatcher
- `commander-winston`: Codex-first delivery orchestrator and Lobster runner
- `architect-winston`: read-only planning
- `builder-winston`: implementation coordinator
- `deploy-winston`: git push and deployment worker
- `sync-winston`: guarded repo sync worker
- `qa-winston`: validation
- `data-winston`: schema/data work
- `outreach`: prospect research and outbound drafts
- `proposals`: proposal drafting
- `content`: content and narrative work
- `operations`: proposal approvals, briefs, and operator workflows
- `demo`: demo collateral and walkthroughs
- `claude-cli-winston`: non-threaded Claude CLI worker
- `codex-cli-winston`: non-threaded Codex CLI worker
- `claude-winston`: thread-bound Claude ACP harness
- `codex-winston`: thread-bound Codex ACP harness

## Handoff Map

- repo planning, audits, `/research`, and architecture questions -> `architect-winston`
- broad implementation workflows and `/build` -> `commander-winston`
- explicit feature work in repo surfaces -> `.skills/feature-dev/SKILL.md`
- push, deploy, CI, Railway, or Vercel checks -> `deploy-winston`
- sync, fetch, pull, branch, or dirty-tree checks -> `sync-winston`
- QA and regression checks -> `qa-winston`
- schema, migrations, ETL, and seed coordination -> `data-winston`
- proposal, outreach, content, demo, brief, or cost flows -> the matching Novendor business agent
- explicit `Claude` or `Codex` harness requests -> the matching Winston CLI or ACP worker

OpenClaw `2026.3.8` reserves `/status` as a native Telegram command. Route plain `status`, `/ops_status`, or the forum `Status` topic to the status rollup instead of trying to register `/status` as a custom command.

## Operating Rules

- In Telegram DMs, start with `dispatcher-winston` unless the request explicitly names another Winston or Novendor specialist
- For long-running Telegram work, send a short acknowledgment first and then brief milestone updates
- For thread-bound persistence, use the matching Winston ACP harness only when the current surface actually supports it or the user explicitly asks for ACP thread behavior
- Keep the Winston repo root as cwd for Winston coding work
- Prefer the dedicated Novendor workspaces for outreach, proposals, content, demo, and operations work

## Session reuse policy

- Prefer reusing the active Winston worker for the same harness in the current conversation.
- For sync requests, prefer reusing the active `sync-winston` worker and run `scripts/openclaw_safe_sync.sh` with `status`, `fetch`, or `pull` as appropriate.
- For deploy requests, prefer reusing the active `deploy-winston` worker and interpret `push` as the full commit/push/deploy/verify sequence from `tips.md`.
- If the sync worker reports a dirty tree, wrong branch, or rebase conflict, surface that refusal clearly and do not fall back to any other agent.
- If a child worker or subagent times out in Telegram, stop delegating and send a direct best-effort answer from the current session instead of leaving the chat without a reply.
- If a late internal child result arrives after the user already has a valid answer, or if it only reports a blocked or abandoned route, return `NO_REPLY`.
- Prefer Telegram progress messages that map to user-visible milestones: `Checking git status now.`, `Claude worker is inspecting the repo now.`, `QA checks are running now.`, `Deploy checks complete.`
- If the user switches harnesses, say so briefly and then start or reuse the matching Winston worker.
- When the user asks `What repo are you in?` or `What is your current working directory?`, answer from the selected Winston worker whenever one is active.

## Practical default

- Ordinary Telegram DM: `dispatcher-winston` first, then the downstream specialist chosen by `CLAUDE.md`
- Telegram topic or other thread-bound flow: ACP harness agents when persistence in-thread is desired
