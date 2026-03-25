# OpenClaw Config Audit — 2026-03-12

## Starting Point

OpenClaw 2026.3.8 gateway was running but had 11 configuration issues identified by a prior ChatGPT-assisted inspection of `~/.openclaw/`. This session planned and executed the fixes.

---

## Issues Fixed

### 1. Telegram Binding: builder-winston → dispatcher-winston
- **Problem**: The Telegram DM binding on line 516 of `openclaw.json` routed directly to `builder-winston`, bypassing the dispatcher routing layer.
- **Fix**: Changed `agentId` to `dispatcher-winston`.
- **Evidence**: All routing docs (dispatcher.md, SKILL.md, openclaw-novendor.md) consistently say dispatcher is the Telegram entrypoint.

### 2. Heartbeat Intervals: 30m → 4h
- **Problem**: Four agents (commander, architect, outreach, operations) polled HEARTBEAT.md every 30 minutes, but the file was empty — wasting ~192 API calls/day.
- **Fix**: Changed all four `"every": "30m"` to `"every": "4h"`.

### 3. Builder Narration for Telegram
- **Problem**: Builder-winston had no instruction to send progress updates during long Telegram tasks, causing 2-minute typing TTL timeouts.
- **Fix**: Appended to builder-winston's identity theme: "When working on a Telegram-routed task, send short progress updates at major milestones."

### 4. Error Log Cleared
- Truncated `~/.openclaw/logs/gateway.err.log` to remove historical noise from gateway restart loops.

---

## Issues Resolved as Non-Actionable

### Model Assignments (No Change Needed)
Seven agents on `codex-cli/gpt-5.4` were flagged as inconsistent with the global default `openai/gpt-5.1-codex`. Investigation revealed this is **intentional**:
- `codex-cli/gpt-5.4` routes through `~/.openclaw/bin/codex` (the Codex CLI binary) — it's a backend choice, not just a model choice
- `docs/openclaw-novendor.md` explicitly states: "Non-Claude control agents run on codex-cli/gpt-5.4"
- `claude-cli/opus-4.6` for architect and claude-cli-winston is also intentional (Claude CLI binary backend)

### apply_patch / cron Plugin Warnings
- `openclaw plugins list` showed 38 available plugins — none provide `apply_patch` or `cron`
- These are built-in `coding` profile references that produce non-fatal warnings
- No fix available; accepted as expected noise

### /status Command Conflict
- Already mitigated (config uses `/ops_status`)
- No `openclaw channels ... sync` subcommand exists to clear the warning

### Other Deferred Issues
- Slug-gen timeout (15s): non-fatal, auto-recovers
- Bot token in plaintext: acceptable for local `~/.openclaw/` config
- ACPX approve-all: fine for dev, revisit for production

---

## Critical Discovery: Dispatcher Model Must Be codex-cli

### The Problem
After fixing the Telegram binding to dispatcher-winston, the dispatcher still failed to route tasks. Two failure modes were observed:

1. **Wall-of-text hallucination** (screenshots at 3:40-3:41 PM): The dispatcher tried to invoke `sessions_spawn` by writing JSON tool-call syntax as plain chat text — trying `assistant to=browser`, code blocks with `{"tool":"browser"}`, etc. — never making an actual tool call.

2. **Polite refusal** (screenshot at 4:57 PM): After gateway restart with fresh session, dispatcher said "the tooling interface for spawning a QA/browser session isn't available in my current runtime."

### Root Cause
`sessions_spawn` is a **CLI-backend-native tool**, not a direct OpenAI API tool. When the dispatcher was on `openai/gpt-5.1-codex` (direct API), the gateway didn't inject `sessions_spawn` as a function definition. When it was on `codex-cli/gpt-5.4`, the Codex CLI binary provided `sessions_spawn` natively.

Evidence from gateway logs:
- Earlier sessions using `codex-cli/gpt-5.4` → `sessions_spawn` worked, builder-winston was successfully spawned
- Sessions using `openai/gpt-5.1-codex` → model never saw `sessions_spawn` as a callable tool

### Fix
Changed dispatcher-winston model back to `codex-cli/gpt-5.4`:
```json
"model": "codex-cli/gpt-5.4"
```

### Implication
**Any agent that needs `sessions_spawn`, `sessions_send`, `session_status`, or `lobster` must use a CLI backend** (`codex-cli` or `claude-cli`), not the direct OpenAI API provider. This explains why commander-winston and operations were already on `codex-cli/gpt-5.4` — they also use these orchestration tools.

---

## Remaining Open Issue: Browser in Subagent Sessions

Browser works when:
- builder-winston runs from a main/local session (webchat)
- the legacy `winston` agent handles Telegram directly

Browser fails when:
- dispatcher spawns builder-winston as a subagent via `sessions_spawn` — "no nodes with browsing capabilities"

This is likely an OpenClaw node propagation limitation in subagent sessions, not a config issue. The browser server is running (`127.0.0.1:18791`), but spawned child sessions don't inherit the browser node connection.

---

## Final Config State

| Agent | Model | Why |
|-------|-------|-----|
| dispatcher-winston | `codex-cli/gpt-5.4` | Needs `sessions_spawn` (CLI-native tool) |
| commander-winston | `codex-cli/gpt-5.4` | Needs `sessions_spawn` + `lobster` |
| architect-winston | `claude-cli/opus-4.6` | Read-only reasoning via Claude CLI |
| builder-winston | `openai/gpt-5.1-codex` | Direct API for coding + browser |
| qa-winston | `openai/gpt-5.1-codex` | Direct API for testing + browser |
| data-winston | `codex-cli/gpt-5.4` | CLI backend for SQL/schema work |
| Novendor agents (5) | `codex-cli/gpt-5.4` | Per openclaw-novendor.md design |
| claude-cli-winston | `claude-cli/opus-4.6` | Explicit Claude CLI fallback |
| codex-cli-winston | `codex-cli/gpt-5.4` | Explicit Codex CLI fallback |

## Backups Created
- `~/.openclaw/openclaw.json.pre-audit-backup` — snapshot before all changes

## Gateway Restarts
Multiple restarts during the session due to config iteration. Final gateway PID: 35373.
