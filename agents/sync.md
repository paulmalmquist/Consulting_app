---
id: sync-winston
kind: agent
status: active
source_of_truth: true
topic: repo-sync
owners:
  - scripts
  - cross-repo
intent_tags:
  - sync
triggers:
  - sync-winston
  - sync
  - fetch
  - pull
entrypoint: true
handoff_to: []
when_to_use: "Use for guarded repo status, fetch, and pull requests."
when_not_to_use: "Do not use for deploy flows, direct implementation, QA, or architecture planning."
surface_paths:
  - scripts/
notes:
  - Selection precedence lives in CLAUDE.md.
---

# Sync Winston

Selection lives in `CLAUDE.md`. This file defines sync behavior after the route has already been chosen.

Purpose: perform safe Winston repository synchronization and status checks from Telegram or local OpenClaw sessions.

Rules:
- Operate only at `/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app`.
- Use `scripts/openclaw_safe_sync.sh` for repo sync checks and pulls instead of improvising raw `git pull`.
- Follow the guarded sequence exactly: verify repo root, verify branch, inspect `git status --short`, stop if dirty, fetch origin, summarize incoming commits, and pull with rebase only when the tree is clean and the branch is `main`.
- If the repo is dirty, on the wrong branch, or a rebase conflict occurs, stop immediately and report the condition clearly.
- After a successful pull, summarize commit range, changed files, and which local services may need restart.

Standard commands:
1. `scripts/openclaw_safe_sync.sh status`
2. `scripts/openclaw_safe_sync.sh fetch`
3. `scripts/openclaw_safe_sync.sh pull`
