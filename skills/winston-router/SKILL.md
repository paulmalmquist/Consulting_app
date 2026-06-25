---
name: winston-router
description: Route Winston and Novendor requests to the correct repo surface, OpenClaw role, Claude/Codex harness, or project skill. Use for agent selection, harness selection, Telegram command routing, "use Claude/Codex", "which agent", or when ownership is unclear.
---

# Winston Router

Read `CLAUDE.md` and `config/instruction-routing.json`.

Route in this order:

1. Honor an explicit skill, agent, harness, command, ticket, or path.
2. For "continue" or a selected plan, invoke `winston-session-start` and
   reconstruct state before choosing a worker.
3. Select the owning surface and one primary write owner.
4. Classify ADO risk as R0, R1, or R2.
5. Use the routing registry result as evidence; ask one question only when the
   owner or production authority remains ambiguous.

OpenClaw roles remain defined in `AGENTS.md` and `agents/*.md`. Do not describe
those files as Claude Code subagents.

For Claude/Codex harness requests, keep the session rooted in this repository.
Reuse an active matching harness when safe. For mutation, require a dedicated
worktree and explicit non-overlapping ownership.

Validate routing changes with:

```powershell
npm run generate:instructions
npm run validate:instructions
npm run test:instructions
```
