---
id: winston-credit-environment
kind: skill
status: active
source_of_truth: true
topic: credit-environment-build
owners:
  - backend
  - repo-b
  - supabase
intent_tags:
  - credit
  - build
  - decisioning
triggers:
  - credit environment build
  - credit workspace implementation
  - credit MCP tools
  - consumer credit AI
entrypoint: true
handoff_to:
  - feature-dev
  - data-winston
  - credit-decisioning
when_to_use: "Use when the user wants to build or extend the Winston credit environment itself: schema, routes, tools, prompt injection, context wiring, pages, seed data, and tests."
when_not_to_use: "Do not use for operating or querying the existing credit decisioning engine without environment-build work; use .skills/credit-decisioning/SKILL.md for that."
surface_paths:
  - backend/app/routes/credit*
  - backend/app/services/credit*
  - backend/app/mcp/tools/credit_tools.py
  - repo-b/src/app/lab/env/[envId]/credit/
  - repo-b/db/schema/274_credit_core.sql
  - repo-b/db/schema/275_credit_object_model.sql
  - repo-b/db/schema/277_credit_workflow.sql
name: winston-credit-environment
description: "Credit environment build skill for Winston. Use for schema, routes, MCP tools, system prompt wiring, frontend pages, and tests that bring the consumer credit decisioning environment to parity with REPE."
---

# Winston Credit Environment

This skill is the build wrapper around the existing credit governance skill.

## Load Order

- `../../docs/WINSTON_CREDIT_DECISIONING_PROMPT.md`
- `../../.skills/credit-decisioning/SKILL.md`

## Working Rules

- Separate environment build work from decisioning-governance work, but keep them aligned.
- Build in the repo's real order: migrations, routes, tools, prompt block, scope resolution, pages, seed data, tests.
- Do not implement credit AI behavior without the walled-garden, chain-of-thought, and format-lock contract from the existing skill.

## Prompt Lessons From The Source Docs

- This cluster worked because the infrastructure prompt and the behavior contract complement each other instead of duplicating each other.
- The strong prompting pattern here is explicit parity with REPE plus a named list of what exists versus what is missing.
- Credit prompts fail when they talk about "underwriting AI" without also naming schema state, tool registry state, and corpus/audit constraints.

## Exit Condition

- Verify at least one credit surface works end to end.
- Keep the chosen phase tied to its migration, API, UI, and test implications.

