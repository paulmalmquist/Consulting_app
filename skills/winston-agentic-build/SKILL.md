---
id: winston-agentic-build
kind: skill
status: active
source_of_truth: true
topic: agentic-capability-build
owners:
  - backend
  - repo-b
intent_tags:
  - build
  - agentic
  - mutation
triggers:
  - agentic prompt
  - write tools
  - mutation flow
  - AdvancedDrawer
  - live status
entrypoint: true
handoff_to:
  - feature-dev
  - qa-winston
when_to_use: "Use when the task is to add or repair Winston's agentic write capabilities, mutation UX, debug visibility, or live execution feedback."
when_not_to_use: "Do not use for read-only post-mortems or guardrail analysis without implementation work; use winston-remediation-playbook for that."
surface_paths:
  - backend/app/mcp/
  - backend/app/services/
  - repo-b/src/components/commandbar/
name: winston-agentic-build
description: "Agentic capability build skill for Winston. Use for write-tool registration, mutation routing, confirmation flows, AdvancedDrawer/debug updates, and live execution status UX."
---

# Winston Agentic Build

This skill turns the raw agentic implementation brief into a repeatable build workflow.

## Load Order

- `../../docs/WINSTON_AGENTIC_PROMPT.md`
- `../../docs/WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md` before changing mutation rules, confirmations, or write routing

## Working Rules

- Do not claim a mutation capability unless the write tool exists, is registered, and is visible in the trace path.
- Treat the backend tool registry, router, prompt contract, and frontend debug state as one feature.
- Keep write flows structurally confirmable; do not rely on prompt wording alone for approval semantics.

## Prompt Lessons From The Source Docs

- The good prompt named what already worked and what was still missing, which kept the implementation bounded.
- The corrective guardrail doc shows the failure mode to avoid: prompts that promise writes before the registry and confirmation path exist.
- For agentic work, the repo's prompts work best when they tie capability claims to real infrastructure.

## Exit Condition

- Verify at least one real write path or a deterministic read-only degradation path.
- Verify the debug surface exposes lane, timing, and write-state feedback.

