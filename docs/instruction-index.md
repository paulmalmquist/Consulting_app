---
id: instruction-index
kind: reference
status: active
source_of_truth: true
topic: instruction-registry
owners:
  - docs
  - cross-repo
intent_tags:
  - docs
triggers:
  - instruction index
  - routing registry
  - markdown registry
entrypoint: false
handoff_to: []
when_to_use: "Use when you need the complete registry of routed markdown docs or need to confirm whether a doc has been normalized."
when_not_to_use: "Do not use as the primary router when CLAUDE.md or a more specific routed entrypoint already matches the request."
surface_paths:
  - docs/
notes:
  - Every routed markdown doc must appear in this registry.
---

# Instruction Index

This file is the human-facing registry for every routed markdown doc in the repo. `CLAUDE.md` is the only global router. Everything else is either a downstream entrypoint or a supporting reference.

## Primary Entry Points

| ID | Kind | Status | Owners | Entry | Path |
|---|---|---|---|---|---|
| `claude-router` | `router` | `active` | `cross-repo` | `yes` | `CLAUDE.md` |
| `architect-winston` | `agent` | `active` | `cross-repo` | `yes` | `agents/architect.md` |
| `builder-winston` | `agent` | `active` | `repo-b, backend, cross-repo` | `yes` | `agents/builder.md` |
| `commander-winston` | `agent` | `active` | `orchestration, scripts, cross-repo` | `yes` | `agents/commander.md` |
| `data-winston` | `agent` | `active` | `backend, repo-b, supabase` | `yes` | `agents/data.md` |
| `deploy-winston` | `agent` | `active` | `scripts, cross-repo` | `yes` | `agents/deploy.md` |
| `dispatcher-winston` | `agent` | `active` | `cross-repo` | `yes` | `agents/dispatcher.md` |
| `novendor-content` | `agent` | `active` | `cross-repo` | `yes` | `agents/content.md` |
| `novendor-demo` | `agent` | `active` | `cross-repo` | `yes` | `agents/demo.md` |
| `novendor-operations` | `agent` | `active` | `cross-repo` | `yes` | `agents/operations.md` |
| `novendor-outreach` | `agent` | `active` | `cross-repo` | `yes` | `agents/outreach.md` |
| `novendor-proposals` | `agent` | `active` | `cross-repo` | `yes` | `agents/proposals.md` |
| `qa-winston` | `agent` | `active` | `cross-repo` | `yes` | `agents/qa.md` |
| `sync-winston` | `agent` | `active` | `scripts, cross-repo` | `yes` | `agents/sync.md` |
| `feature-dev` | `skill` | `active` | `backend, repo-b, repo-c, scripts, orchestration` | `yes` | `.skills/feature-dev/SKILL.md` |
| `research-ingest` | `skill` | `active` | `docs, cross-repo` | `yes` | `.skills/research-ingest/SKILL.md` |
| `winston-router` | `skill` | `active` | `cross-repo` | `yes` | `skills/winston-router/SKILL.md` |
| `winston-agentic-prompt` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_AGENTIC_PROMPT.md` |
| `winston-behavior-guardrails` | `prompt` | `active` | `docs, backend` | `yes` | `docs/WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md` |
| `winston-document-asset-creation` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_DOCUMENT_ASSET_CREATION_PROMPT.md` |
| `winston-latency-optimization` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_LATENCY_OPTIMIZATION_PROMPT.md` |
| `winston-reranking-model-dispatch` | `prompt` | `active` | `docs, backend` | `yes` | `docs/WINSTON_RERANKING_AND_MODEL_DISPATCH_PROMPT.md` |

## Supporting And Registry Docs

| ID | Kind | Status | Owners | Entry | Path |
|---|---|---|---|---|---|
| `instruction-index` | `reference` | `active` | `docs, cross-repo` | `no` | `docs/instruction-index.md` |

## Archived Prompt References

| ID | Kind | Status | Owners | Entry | Path |
|---|---|---|---|---|---|
| `fix-all-test-failures-meta-prompt` | `prompt` | `archived` | `docs` | `no` | `docs/plans/FIX_ALL_TEST_FAILURES_META_PROMPT.md` |
| `fix-remaining-failures-meta-prompt` | `prompt` | `archived` | `docs` | `no` | `docs/plans/FIX_REMAINING_FAILURES_META_PROMPT.md` |
| `winston-development-meta-prompt` | `prompt` | `archived` | `docs` | `no` | `docs/plans/WINSTON_DEVELOPMENT_META_PROMPT.md` |
