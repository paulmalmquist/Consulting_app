---
id: winston-remediation-playbook
kind: skill
status: active
source_of_truth: true
topic: audit-remediation
owners:
  - docs
  - backend
  - repo-b
intent_tags:
  - audit
  - remediation
  - guardrails
triggers:
  - fix all audit issues
  - behavior guardrails
  - what went wrong
  - post mortem
  - regression recovery
entrypoint: true
handoff_to:
  - architect-winston
  - feature-dev
when_to_use: "Use when the user wants to turn audits, post-mortems, or broad failure reports into an ordered remediation plan or implementation pass."
when_not_to_use: "Do not use for fresh feature work that already has a clean build brief."
surface_paths:
  - docs/
  - docs/plans/
  - backend/
  - repo-b/
name: winston-remediation-playbook
description: "Audit and remediation skill for Winston. Use for behavior guardrails, post-mortems, regression recovery, and turning broad 'fix everything' prompts into bounded workstreams with verification."
---

# Winston Remediation Playbook

Start from the newest corrective document, not the oldest meta prompt.

## Load Order

- `../../docs/plans/CLAUDE_CODE_FIX_ALL_AUDIT_ISSUES.md`
- `../../docs/WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md`
- `../../AUDIT_WINSTON_PRODUCTION_HARDENING.md` if the failure spans multiple layers
- `../../docs/plans/FIX_ALL_TEST_FAILURES_META_PROMPT.md`
- `../../docs/plans/FIX_REMAINING_FAILURES_META_PROMPT.md`
- `../../docs/plans/WINSTON_DEVELOPMENT_META_PROMPT.md` for historical context only

## Working Rules

- Rewrite broad remediation asks into workstreams with problem, root cause, fix, and verification.
- Keep archived meta prompts as evidence of prior failures, not as the current execution format.
- Prefer one bounded failure family at a time over giant two-wave cleanup asks.

## Prompt Lessons From The Source Docs

- The older "fix all failures" prompts were useful emergency scaffolding, but they were too broad and had to be corrected repeatedly.
- The stronger newer pattern is workstream-based: exact problem, observed cause, concrete fix, verification, then execution order.
- Guardrail prompts work best when they explain the system contract that failed, not just the symptom list.

## Exit Condition

- Produce an ordered remediation plan or implement one bounded workstream.
- Keep every item attached to a surface and a verification path.

