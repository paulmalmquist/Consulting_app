---
name: winston-router
description: Route Winston / Business Machine and Novendor requests to the correct agents, harnesses, and Lobster workflows. Use when the user mentions Winston, Business Machine, Claude Code, Claude CLI, Codex, Codex CLI, Telegram-controlled development, or the Novendor phone command surface.
---

# Winston / Novendor Router

Use this skill for Winston / Business Machine and Novendor work that needs deliberate routing.

## Repo target

- Winston repo root: `/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app`
- Never route Winston coding work to `main` or `~/.openclaw/workspace` unless the user explicitly asks for the generic workspace.

## Business workspaces

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

## Command surface

- `/research` -> `architect-winston`
- `/build` -> `commander-winston` + `orchestration/openclaw/novendor-dev-pipeline.lobster`
- `/propose` -> `operations` + `orchestration/openclaw/novendor-proposal-pipeline.lobster`
- `/outreach` -> `outreach`
- `/content` -> `content`
- `/status` -> `commander-winston`
- `/brief` -> `operations` + `orchestration/openclaw/morning-brief.lobster`
- `/cost` -> `operations`

## Routing rules

### Non-threaded chats and DMs

This includes ordinary Telegram DMs and normal local `main` sessions unless the current conversation is explicitly thread-bound.

- In Telegram DMs, prefer `dispatcher-winston` as the entrypoint and keep routing light.
- For ordinary Telegram DM questions that only require local reading of the Winston repo, answer directly from `dispatcher-winston` without spawning subagents.
- For `research`, `/research`, repo architecture, or planning questions, route to `architect-winston`.
- For `build`, `/build`, implementation workflow requests, or multi-step Winston feature work, route to `commander-winston` and use the Lobster dev pipeline.
- For `propose`, `/propose`, or proposal approval flow requests, route to `operations` and use the Lobster proposal pipeline.
- For `/outreach`, route to `outreach`. For `/content`, route to `content`.
- For `/status`, `/brief`, or `/cost`, route to `operations` or `commander-winston` depending on whether the user needs business-side or delivery-side focus.
- For `push`, `push please`, `deploy this`, `ship it`, `release this`, `push to GitHub`, or requests to monitor CI/Vercel/Railway after a code change, route to `deploy-winston`.
- For push/deploy requests, do not use ACP or generic coding-agent delegation unless the user explicitly requests Claude or Codex by name.
- For `check whether Winston is up to date`, `fetch origin`, `pull the latest Winston changes safely`, `sync Winston`, `git status`, or `stop if the repo is dirty`, route to `sync-winston`.
- For sync requests, this routing is mandatory. Do not answer from memory. Spawn or reuse `sync-winston`, run `scripts/openclaw_safe_sync.sh` with `status`, `fetch`, or `pull`, and summarize the result.
- For `use Claude`, `run this in Claude CLI`, or `start a persistent Claude session`, prefer `claude-cli-winston`.
- For `use Codex`, `run this in Codex CLI`, or `start a persistent Codex session`, prefer `codex-cli-winston`.
- For persistence in non-threaded chats, create or reuse a child session with `sessions_spawn` targeting the CLI worker agent and continue it with `sessions_send`.
- Keep the worker cwd rooted in the Winston repo.

### Thread-bound chats

- Once a Telegram forum supergroup exists, topic routing is configured by `scripts/openclaw_setup_forum.mjs`:
  - `General` -> `commander-winston`
  - `Research` -> `architect-winston`
  - `Builds` -> `builder-winston`
  - `Client Ops` -> `operations`
  - `Sales` -> `outreach`
  - `Status` -> `commander-winston`
- Use ACP only when the current surface actually supports a bound thread/topic conversation or the user explicitly asks for ACP thread behavior.
- For thread-bound persistent Claude work, use `sessions_spawn` with:
  - `agentId: "claude"`
  - `runtime: "acp"`
  - `mode: "session"`
  - `thread: true`
- For thread-bound persistent Codex work, use the same pattern with `agentId: "codex"`.
- Always set the Winston repo root as cwd for ACP Winston work.

## Session reuse policy

- Prefer reusing the active Winston worker for the same harness in the current conversation.
- For sync requests, prefer reusing the active `sync-winston` worker and run `scripts/openclaw_safe_sync.sh` with `status`, `fetch`, or `pull` as appropriate.
- For deploy requests, prefer reusing the active `deploy-winston` worker and interpret `push` as the full commit/push/deploy/verify sequence from `tips.md`.
- If the sync worker reports a dirty tree, wrong branch, or rebase conflict, surface that refusal clearly and do not fall back to any other agent.
- If a child worker or subagent times out in Telegram, stop delegating and send a direct best-effort answer from the current session instead of leaving the chat without a reply.
- If a late internal child result arrives after the user already has a valid answer, or if it only reports a blocked or abandoned route, return `NO_REPLY`.
- If the user switches harnesses, say so briefly and then start or reuse the matching Winston worker.
- When the user asks `What repo are you in?` or `What is your current working directory?`, answer from the selected Winston worker whenever one is active.

## Practical default

- Ordinary Telegram DM: `dispatcher-winston` first, then the correct Winston or Novendor specialist.
- Telegram topic or other thread-bound flow: ACP harness agents when persistence in-thread is desired.
