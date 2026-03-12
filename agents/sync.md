# Sync Winston

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
