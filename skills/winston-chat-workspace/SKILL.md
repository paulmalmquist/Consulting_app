---
id: winston-chat-workspace
kind: skill
status: active
source_of_truth: true
topic: chat-workspace-delivery
owners:
  - repo-b
  - backend
intent_tags:
  - build
  - chat
  - analytics
triggers:
  - chat workspace
  - response blocks
  - inline charts
  - inline tables
  - query intent
  - conversational transforms
entrypoint: true
handoff_to:
  - feature-dev
  - qa-winston
when_to_use: "Use when the task is to build or repair Winston's full-screen chat workspace, response block rendering, conversational chart/table output, or analytical follow-up behavior."
when_not_to_use: "Do not use for standalone dashboard-builder work that stays inside compose/generate routes without chat UX changes."
surface_paths:
  - repo-b/src/app/
  - repo-b/src/components/commandbar/
  - backend/app/services/
name: winston-chat-workspace
description: "Build or repair Winston's chat workspace, response-block rendering, analytical follow-ups, and chat-specific data shaping. Use for full-screen chat, inline chart/table blocks, multi-series follow-ups, and related seed/data gaps."
---

# Winston Chat Workspace

This skill wraps the long-form chat workspace brief into a repeatable execution pattern.

## Load Order

- `../../META_PROMPT_CHAT_WORKSPACE.md`
- `../../docs/WINSTON_AGENTIC_PROMPT.md` only if the chat work touches write flows or live execution feedback

## Working Rules

- Keep the work split into four tracks: workspace shell, response blocks, analytical intent/state, and seed/data fixes.
- Preserve the existing command bar path while adding the full-screen route. Chat work here is additive, not a rewrite.
- Any backend change should map to a visible chat behavior change, not just a cleaner abstraction.

## Prompt Lessons From The Source Doc

- The strong pattern was: current production state, confirmed bugs, ordered priorities, file summary, and acceptance checks.
- Chat prompts got better when they stopped saying just "build chat" and instead named the missing contract: emitted block types, session fields, renderers, and seed gaps.
- If a chat request includes both UX and data issues, treat both as first-class. The UI alone will not close the loop.

## Exit Condition

- Verify one chat path that streams text plus a structured block.
- Verify one follow-up transform or group-by path that uses prior result state.

