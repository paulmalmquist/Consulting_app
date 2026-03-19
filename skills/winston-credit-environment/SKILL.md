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
  - doc completion
  - document completion agent
  - borrower document outreach
entrypoint: true
handoff_to:
  - feature-dev
  - data-winston
  - credit-decisioning
when_to_use: "Use when the user wants to build or extend the Winston credit environment itself, including the document-completion workflow: schema, routes, tools, prompt injection, context wiring, pages, seed data, and tests."
when_not_to_use: "Do not use for operating or querying the existing credit decisioning engine without environment-build work; use .skills/credit-decisioning/SKILL.md for that."
surface_paths:
  - backend/app/routes/credit*
  - backend/app/services/credit*
  - backend/app/mcp/tools/credit_tools.py
  - backend/app/routes/doc_completion.py
  - backend/app/services/doc_completion.py
  - repo-b/src/app/lab/env/[envId]/credit/
  - repo-b/src/app/lab/env/[envId]/credit/doc-completion/
  - repo-b/db/schema/274_credit_core.sql
  - repo-b/db/schema/275_credit_object_model.sql
  - repo-b/db/schema/277_credit_workflow.sql
  - repo-b/db/schema/386_doc_completion.sql
name: winston-credit-environment
description: "Credit environment build skill for Winston. Use for credit schema, routes, MCP tools, doc-completion flows, system prompt wiring, frontend pages, and tests that bring the consumer credit environment to parity with the rest of Winston."
---

# Winston Credit Environment

This skill is the build wrapper around the existing credit governance skill.

## Load Order

- `../../docs/WINSTON_CREDIT_DECISIONING_PROMPT.md`
- `../../DOC_COMPLETION_AGENT_BUILD_PROMPT.md` when the work is about borrower-file intake, outreach, followups, audit trails, or the doc-completion UI
- `../../.skills/credit-decisioning/SKILL.md`

## Working Rules

- Separate environment build work from decisioning-governance work, but keep them aligned.
- Build in the repo's real order: migrations, routes, tools, prompt block, scope resolution, pages, seed data, tests.
- Treat doc completion as a credit-adjacent operational workflow: deterministic completeness rules, outreach controls, and auditability matter more than generic "agent" language.
- Do not implement credit AI behavior without the walled-garden, chain-of-thought, and format-lock contract from the existing skill.

## Prompt Lessons From The Source Docs

- This cluster worked because the infrastructure prompt and the behavior contract complement each other instead of duplicating each other.
- The strong prompting pattern here is explicit parity with REPE plus a named list of what exists versus what is missing.
- The document-completion brief added a durable pattern worth keeping: business loop, guardrails, exact repo conventions, then sprintable implementation slices.
- Credit prompts fail when they talk about "underwriting AI" without also naming schema state, tool registry state, and corpus/audit constraints.

## Exit Condition

- Verify at least one credit surface works end to end.
- If the task is doc completion, verify one intake or file-management path plus the corresponding dashboard/detail UI.
- Keep the chosen phase tied to its migration, API, UI, and test implications.
