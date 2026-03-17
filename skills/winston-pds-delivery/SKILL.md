---
id: winston-pds-delivery
kind: skill
status: active
source_of_truth: true
topic: pds-sequenced-delivery
owners:
  - backend
  - repo-b
  - docs
intent_tags:
  - pds
  - build
  - sequencing
triggers:
  - PDS meta prompts
  - PDS platform
  - PDS analytics
  - JLL PDS
  - executive automation
entrypoint: true
handoff_to:
  - feature-dev
  - data-winston
  - architect-winston
when_to_use: "Use when the task is to plan or implement the PDS platform through the sequenced Winston prompt set rather than as an unbounded greenfield build."
when_not_to_use: "Do not use for isolated one-off PDS bugs when feature-dev already has a narrower surface and file target."
surface_paths:
  - PDS_META_PROMPTS.md
  - PDS_report.md
  - PDS_EXECUTIVE_GAP_ANALYSIS.md
  - PDS_P0_DEPLOYMENT_RUNBOOK.md
  - docs/plans/
name: winston-pds-delivery
description: "Sequenced PDS delivery skill for Winston. Use for the staged PDS build, dependency-driven execution order, executive analytics gaps, and translating the PDS report into bounded implementation phases."
---

# Winston PDS Delivery

Treat the PDS materials as a staged program, not one giant prompt.

## Load Order

- `../../PDS_META_PROMPTS.md`
- `../../PDS_report.md`
- `../../PDS_EXECUTIVE_GAP_ANALYSIS.md`
- `../../PDS_P0_DEPLOYMENT_RUNBOOK.md`
- `../../docs/plans/PDS_DEEP_RESEARCH_PLAN.md` only when the request is still at the research/brief stage

## Working Rules

- Follow the dependency graph. Do not jump to a later PDS phase while an earlier prerequisite is still hypothetical.
- Split platform work, executive automation, and AI-query work into explicit phases with their own verification.
- Reuse Winston infrastructure where the source docs say to reuse it; do not fork a parallel PDS stack without cause.

## Prompt Lessons From The Source Docs

- The strongest PDS prompt pattern was sequencing: phase, context, prompt, verification, then execution notes.
- These docs show that big domain builds work when they are chunked into independently completable prompts.
- The failure mode to avoid is starting with the most ambitious analytics prompt before schema, data, and baseline dashboards exist.

## Exit Condition

- Name the active PDS phase and its dependencies.
- Verify the chosen phase before moving to the next one.

