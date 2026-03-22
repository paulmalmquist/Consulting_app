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
| `ai-copilot-winston` | `agent` | `active` | `backend, repo-b` | `yes` | `agents/ai-copilot.md` |
| `architect-winston` | `agent` | `active` | `cross-repo` | `yes` | `agents/architect.md` |
| `bos-domain-winston` | `agent` | `active` | `backend` | `yes` | `agents/bos-domain.md` |
| `builder-winston` | `agent` | `active` | `repo-b, backend, cross-repo` | `yes` | `agents/builder.md` |
| `commander-winston` | `agent` | `active` | `orchestration, scripts, cross-repo` | `yes` | `agents/commander.md` |
| `data-winston` | `agent` | `active` | `backend, repo-b, supabase` | `yes` | `agents/data.md` |
| `deploy-winston` | `agent` | `active` | `scripts, cross-repo` | `yes` | `agents/deploy.md` |
| `dispatcher-winston` | `agent` | `active` | `cross-repo` | `yes` | `agents/dispatcher.md` |
| `frontend-winston` | `agent` | `active` | `repo-b` | `yes` | `agents/frontend.md` |
| `lab-environment-winston` | `agent` | `active` | `repo-c, repo-b, excel-addin` | `yes` | `agents/lab-environment.md` |
| `mcp-winston` | `agent` | `active` | `backend, orchestration` | `yes` | `agents/mcp.md` |
| `novendor-content` | `agent` | `active` | `cross-repo` | `yes` | `agents/content.md` |
| `novendor-demo` | `agent` | `active` | `cross-repo` | `yes` | `agents/demo.md` |
| `novendor-operations` | `agent` | `active` | `cross-repo` | `yes` | `agents/operations.md` |
| `novendor-outreach` | `agent` | `active` | `cross-repo` | `yes` | `agents/outreach.md` |
| `novendor-proposals` | `agent` | `active` | `cross-repo` | `yes` | `agents/proposals.md` |
| `qa-winston` | `agent` | `active` | `cross-repo` | `yes` | `agents/qa.md` |
| `sync-winston` | `agent` | `active` | `scripts, cross-repo` | `yes` | `agents/sync.md` |
| `feature-dev` | `skill` | `active` | `backend, repo-b, repo-c, scripts, orchestration` | `yes` | `.skills/feature-dev/SKILL.md` |
| `research-ingest` | `skill` | `active` | `docs, cross-repo` | `yes` | `.skills/research-ingest/SKILL.md` |
| `credit-decisioning` | `skill` | `active` | `backend, repo-b` | `yes` | `.skills/credit-decisioning/SKILL.md` |
| `winston-router` | `skill` | `active` | `cross-repo` | `yes` | `skills/winston-router/SKILL.md` |
| `winston-session-bootstrap` | `skill` | `active` | `cross-repo` | `yes` | `skills/winston-session-bootstrap/SKILL.md` |
| `winston-chat-workspace` | `skill` | `active` | `repo-b, backend` | `yes` | `skills/winston-chat-workspace/SKILL.md` |
| `winston-dashboard-composition` | `skill` | `active` | `repo-b, backend` | `yes` | `skills/winston-dashboard-composition/SKILL.md` |
| `winston-agentic-build` | `skill` | `active` | `backend, repo-b` | `yes` | `skills/winston-agentic-build/SKILL.md` |
| `winston-remediation-playbook` | `skill` | `active` | `docs, backend, repo-b` | `yes` | `skills/winston-remediation-playbook/SKILL.md` |
| `winston-prompt-normalization` | `skill` | `active` | `docs, cross-repo` | `yes` | `skills/winston-prompt-normalization/SKILL.md` |
| `winston-ai-architecture` | `skill` | `active` | `backend, repo-b, docs` | `yes` | `skills/winston-ai-architecture/SKILL.md` |
| `winston-document-pipeline` | `skill` | `active` | `backend, repo-b` | `yes` | `skills/winston-document-pipeline/SKILL.md` |
| `winston-performance-architecture` | `skill` | `active` | `backend, repo-b` | `yes` | `skills/winston-performance-architecture/SKILL.md` |
| `winston-credit-environment` | `skill` | `active` | `backend, repo-b, supabase` | `yes` | `skills/winston-credit-environment/SKILL.md` |
| `winston-development-bridge` | `skill` | `active` | `backend, repo-b, supabase` | `yes` | `skills/winston-development-bridge/SKILL.md` |
| `winston-pds-delivery` | `skill` | `active` | `backend, repo-b, docs` | `yes` | `skills/winston-pds-delivery/SKILL.md` |
| `winston-agentic-prompt` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_AGENTIC_PROMPT.md` |
| `winston-behavior-guardrails` | `prompt` | `active` | `docs, backend` | `yes` | `docs/WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md` |
| `winston-document-asset-creation` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_DOCUMENT_ASSET_CREATION_PROMPT.md` |
| `winston-latency-optimization` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_LATENCY_OPTIMIZATION_PROMPT.md` |
| `winston-reranking-model-dispatch` | `prompt` | `active` | `docs, backend` | `yes` | `docs/WINSTON_RERANKING_AND_MODEL_DISPATCH_PROMPT.md` |
| `winston-credit-decisioning-prompt` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_CREDIT_DECISIONING_PROMPT.md` |
| `winston-sales-intelligence` | `skill` | `active` | `docs, cross-repo` | `yes` | `skills/winston-sales-intelligence/SKILL.md` |
| `winston-demo-generator` | `skill` | `active` | `docs, cross-repo` | `yes` | `skills/winston-demo-generator/SKILL.md` |
| `winston-sales-intelligence-prompt` | `prompt` | `active` | `docs, cross-repo` | `no` | `docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md` |

## Supporting And Registry Docs

| ID | Kind | Status | Owners | Entry | Path |
|---|---|---|---|---|---|
| `instruction-index` | `reference` | `active` | `docs, cross-repo` | `no` | `docs/instruction-index.md` |
| `meta-prompt-chat-workspace` | `prompt` | `active` | `repo-b, backend` | `no` | `META_PROMPT_CHAT_WORKSPACE.md` |
| `demo-features-meta-prompts` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/plans/DEMO_FEATURES_META_PROMPTS.md` |

## Archived Prompt References

| ID | Kind | Status | Owners | Entry | Path |
|---|---|---|---|---|---|
| `fix-all-test-failures-meta-prompt` | `prompt` | `archived` | `docs` | `no` | `docs/plans/FIX_ALL_TEST_FAILURES_META_PROMPT.md` |
| `fix-remaining-failures-meta-prompt` | `prompt` | `archived` | `docs` | `no` | `docs/plans/FIX_REMAINING_FAILURES_META_PROMPT.md` |
| `winston-development-meta-prompt` | `prompt` | `archived` | `docs` | `no` | `docs/plans/WINSTON_DEVELOPMENT_META_PROMPT.md` |
