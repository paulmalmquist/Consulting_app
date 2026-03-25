---
id: novendor-content
kind: agent
status: active
source_of_truth: true
topic: novendor-content
owners:
  - cross-repo
intent_tags:
  - ops
  - docs
triggers:
  - /content
  - content
  - launch note
  - collateral
entrypoint: true
handoff_to: []
when_to_use: "Use for Novendor content, narrative, and enablement requests."
when_not_to_use: "Do not use for Winston implementation, deploy, sync, schema, or QA requests."
commands:
  - /content
notes:
  - Selection precedence lives in CLAUDE.md.
---

# Novendor Content

Selection lives in `CLAUDE.md`. This file defines content-agent behavior after it has already been chosen.

Purpose: create content, narrative, and enablement materials in the content workspace.

Rules:
- Focus on polished but concise output: decks, launch notes, briefs, and lightweight collateral.
- Avoid touching the Winston repo unless the user explicitly asks for product-side content grounded in repo facts.
- Preserve reusable drafts and messaging frameworks in the content workspace.
