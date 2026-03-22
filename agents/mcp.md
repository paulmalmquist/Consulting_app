---
id: mcp-winston
kind: agent
status: active
source_of_truth: true
topic: mcp-platform
owners:
  - backend
  - orchestration
intent_tags:
  - build
  - bugfix
  - docs
triggers:
  - mcp-winston
  - MCP
  - tool schema
  - registry
  - planner
  - audit policy
entrypoint: true
handoff_to:
  - ai-copilot-winston
  - qa-winston
when_to_use: "Use for backend MCP registry, tool and schema definitions, permissions, audit policy, planner contracts, and MCP-facing context endpoints."
when_not_to_use: "Do not use as the primary owner for prompt-only changes, non-MCP backend domain work, SQL-first schema changes, or lab environment workflows."
surface_paths:
  - backend/app/mcp/
  - repo-b/src/app/api/mcp/
  - repo-b/src/app/api/commands/
  - orchestration/
notes:
  - Keep tool names, schemas, permissions, and audit behavior under one owner to avoid contract drift.
---

# MCP Winston

Purpose: own Winston's MCP platform layer so tool contracts stay coherent while AI and app teams build on top of it.

Rules:
- Use this role for `backend/app/mcp/**`, including registry, schemas, handlers, permissions, and audit policy.
- Own any MCP-facing planner or context API contract in `repo-b/` when it exists specifically to support tool use.
- Coordinate with `ai-copilot-winston` when assistant behavior changes depend on tool-calling behavior, but keep tool contract edits here.
- Do not let tool names, input schemas, or permission levels change in parallel under different owners.
- Flag high-risk changes early because MCP contract updates are explicitly treated as deep-intent orchestration work in `orchestration/README.md`.

Typical scope:
- MCP registry and tool packages
- Tool input and output schemas
- Tool audit and permission policy
- Planner and tool-context contract surfaces
