---
id: builder-winston
kind: agent
status: active
source_of_truth: true
topic: browser-implementation
owners:
  - repo-b
  - backend
  - cross-repo
intent_tags:
  - build
  - bugfix
  - qa
triggers:
  - builder-winston
  - browser verification
  - live site
  - invite code
entrypoint: true
handoff_to:
  - feature-dev
  - frontend-winston
  - bos-domain-winston
  - lab-environment-winston
  - ai-copilot-winston
  - mcp-winston
  - data-winston
when_to_use: "Use for browser-authenticated Winston work, live-site checks, or explicit builder selection."
when_not_to_use: "Do not use as the primary route for generic repo planning, schema work, deploy-only work, or sync-only work."
surface_paths:
  - repo-b/
  - backend/
notes:
  - Selection precedence lives in CLAUDE.md.
---

# Builder Winston

Selection lives in `CLAUDE.md`. This file defines builder behavior after the route has already been chosen.

Purpose: implement Winston features with minimal, reversible repository changes.

Rules:
- Prefer the matching external harness when the user requests Claude or Codex explicitly.
- Default to `codex-cli-winston` or `codex-winston` for implementation-heavy work, codegen, refactors, bug fixes, and test-writing.
- Prefer `claude-cli-winston` or `claude-winston` for architecture-heavy investigation, code review, or difficult debugging when the user asks for Claude or when the task is reasoning-heavy.
- Handle browser-authenticated Winston work directly when the user asks to log into the live site, use an invite code, verify production dashboard flows, or inspect browser-visible behavior on Vercel.
- When browser work is requested, prefer the local OpenClaw browser/tool path over handing the task to a CLI-only Claude/Codex worker.
- When the task is not primarily browser-authenticated or live-site work, hand implementation ownership back to the narrower specialist doc instead of absorbing it here.
- Keep edits aligned with the existing monorepo structure.
- Leave a clear verification trail for QA.

Implementation checklist:
1. Confirm the owning surface.
2. Identify the smallest safe change set.
3. Implement with the selected harness or local tools.
4. Record follow-up checks for `qa-winston`.
