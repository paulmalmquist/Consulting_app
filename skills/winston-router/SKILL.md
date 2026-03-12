---
name: winston-router
description: Route Winston / Business Machine requests to the correct Winston agents and harnesses. Use when the user mentions Winston, Business Machine, Claude Code, Claude CLI, Codex, Codex CLI, persistent Winston coding sessions, or Telegram-controlled Winston development.
---

# Winston Router

Use this skill for Winston / Business Machine work that needs deliberate harness routing.

## Repo target

- Winston repo root: `/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app`
- Never route Winston coding work to `main` or `~/.openclaw/workspace` unless the user explicitly asks for the generic workspace.

## Agent map

- `commander-winston`: Telegram-facing orchestrator
- `architect-winston`: read-only planning
- `builder-winston`: implementation coordinator
- `sync-winston`: guarded repo sync worker
- `qa-winston`: validation
- `data-winston`: schema/data work
- `claude-cli-winston`: non-threaded Claude CLI worker
- `codex-cli-winston`: non-threaded Codex CLI worker
- `claude-winston`: thread-bound Claude ACP harness
- `codex-winston`: thread-bound Codex ACP harness

## Routing rules

### Non-threaded chats and DMs

This includes ordinary Telegram DMs and normal local `main` sessions unless the current conversation is explicitly thread-bound.

- For ordinary Telegram DM questions that only require local reading of the Winston repo, answer directly from `commander-winston` without spawning subagents.
- For `check whether Winston is up to date`, `fetch origin`, `pull the latest Winston changes safely`, `sync Winston`, `git status`, or `stop if the repo is dirty`, route to `sync-winston`.
- For sync requests, this routing is mandatory. Do not answer from memory. Spawn or reuse `sync-winston`, run `scripts/openclaw_safe_sync.sh` with `status`, `fetch`, or `pull`, and summarize the result.
- For `use Claude`, `run this in Claude CLI`, or `start a persistent Claude session`, prefer `claude-cli-winston`.
- For `use Codex`, `run this in Codex CLI`, or `start a persistent Codex session`, prefer `codex-cli-winston`.
- For persistence in non-threaded chats, create or reuse a child session with `sessions_spawn` targeting the CLI worker agent and continue it with `sessions_send`.
- Keep the worker cwd rooted in the Winston repo.

### Thread-bound chats

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
- If the sync worker reports a dirty tree, wrong branch, or rebase conflict, surface that refusal clearly and do not fall back to any other agent.
- If a child worker or subagent times out in Telegram, stop delegating and send a direct best-effort answer from the current session instead of leaving the chat without a reply.
- If the user switches harnesses, say so briefly and then start or reuse the matching Winston worker.
- When the user asks `What repo are you in?` or `What is your current working directory?`, answer from the selected Winston worker whenever one is active.

## Practical default

- Ordinary Telegram DM: CLI worker agents first.
- Telegram topic or other thread-bound flow: ACP harness agents when persistence in-thread is desired.
