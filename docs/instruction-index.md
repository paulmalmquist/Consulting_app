---
id: instruction-index
kind: reference
status: informational
source_of_truth: false
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
when_to_use: "Use only as a human-facing overview of routed markdown docs that still exist on disk."
when_not_to_use: "Do not use as the source of truth for assistant runtime skills, prompts, or routing."
surface_paths:
  - docs/
notes:
  - Assistant runtime skills are canonical in backend/app/assistant_runtime/skill_registry.py.
  - This file is informational only and must not declare phantom runtime features.
---

# Instruction Index

This file is a human-facing overview of routed markdown docs that still exist on disk. `CLAUDE.md` remains the top-level markdown router. The deterministic assistant runtime does not route from this document; runtime skills live in `backend/app/assistant_runtime/skill_registry.py`.

## Primary Entry Points

| ID | Kind | Status | Owners | Entry | Path |
|---|---|---|---|---|---|
| `claude-router` | `router` | `active` | `cross-repo` | `yes` | `CLAUDE.md` |
| `telemetry-phase9-demo` | `demo-script` | `active` | `repo-b` | `no` | `docs/plans/03-implementation-plans/active/0013-telemetry-phase9-demo-rehearsal.md` |
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
| `azure-devops-intake` | `skill` | `active` | `cross-repo, orchestration` | `yes` | `.skills/azure-devops-intake/SKILL.md` |
| `telemetry-data-interrogation` | `skill` | `active` | `scripts, telemetry, data` | `yes` | `skills/telemetry-data-interrogation/SKILL.md` |
| `confluent-stargate-lifecycle` | `skill` | `active` | `confluent, kafka, cost-control, streaming-spine, infra` | `yes` | `skills/confluent-stargate-lifecycle/SKILL.md` |
| `feature-dev` | `skill` | `active` | `backend, repo-b, repo-c, scripts, orchestration` | `yes` | `.skills/feature-dev/SKILL.md` |
| `idea-to-delivery` | `skill` | `active` | `cross-repo` | `yes` | `.skills/idea-to-delivery/SKILL.md` |
| `plan-budget-augmentor` | `skill` | `active` | `cross-repo` | `yes` | `.skills/plan-budget-augmentor/SKILL.md` |
| `research-ingest` | `skill` | `active` | `docs, cross-repo` | `yes` | `.skills/research-ingest/SKILL.md` |
| `credit-decisioning` | `skill` | `active` | `backend, repo-b` | `yes` | `.skills/credit-decisioning/SKILL.md` |
| `ade-ops-orchestrator` | `skill` | `active` | `backend, repo-b` | `yes` | `.skills/ade-ops-orchestrator/SKILL.md` |
| `ai-provider-dispatch` | `skill` | `active` | `backend, cross-repo` | `no` | `.skills/ai-provider-dispatch/SKILL.md` |
| `gemma-vertex-stage` | `skill` | `active` | `backend, cross-repo` | `no` | `.skills/gemma-vertex-stage/SKILL.md` |
| `winston-post-deploy-verify` | `skill` | `active` | `cross-repo` | `yes` | `skills/winston-post-deploy-verify/SKILL.md` |
| `historyrhymes` | `skill` | `active` | `cross-repo` | `yes` | `skills/historyrhymes/SKILL.md` |
| `market-rotation-engine` | `skill` | `active` | `cross-repo` | `yes` | `skills/market-rotation-engine/SKILL.md` |
| `msa-rotation-engine` | `skill` | `active` | `cross-repo` | `yes` | `skills/msa-rotation-engine/SKILL.md` |
| `winston-agentic-prompt` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_AGENTIC_PROMPT.md` |
| `winston-behavior-guardrails` | `prompt` | `active` | `docs, backend` | `yes` | `docs/WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md` |
| `winston-document-asset-creation` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_DOCUMENT_ASSET_CREATION_PROMPT.md` |
| `winston-latency-optimization` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_LATENCY_OPTIMIZATION_PROMPT.md` |
| `winston-reranking-model-dispatch` | `prompt` | `active` | `docs, backend` | `yes` | `docs/WINSTON_RERANKING_AND_MODEL_DISPATCH_PROMPT.md` |
| `winston-credit-decisioning-prompt` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/WINSTON_CREDIT_DECISIONING_PROMPT.md` |
| `winston-sales-intelligence-prompt` | `prompt` | `active` | `docs, cross-repo` | `no` | `docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md` |

## Supporting And Registry Docs

| ID | Kind | Status | Owners | Entry | Path |
|---|---|---|---|---|---|
| `instruction-index` | `reference` | `active` | `docs, cross-repo` | `no` | `docs/instruction-index.md` |
| `meta-prompt-chat-workspace` | `prompt` | `active` | `repo-b, backend` | `no` | `META_PROMPT_CHAT_WORKSPACE.md` |
| `demo-features-meta-prompts` | `prompt` | `active` | `docs, backend, repo-b` | `yes` | `docs/plans/DEMO_FEATURES_META_PROMPTS.md` |
| `rs-analytics-platform-plan` | `plan` | `active` | `docs, TELEMETRY_TEMPLATE, RS-Analytics ADO` | `no` | `docs/plans/RS_ANALYTICS_PLATFORM_PLAN.md` |
| `automated-data-engineering-plan` | `plan` | `active` | `docs, backend, repo-b` | `no` | `docs/plans/automated-data-engineering/README.md` |
| `history-rhymes-telemetry-cockpit-refactor` | `plan` | `active` | `repo-b, backend, docs` | `no` | `docs/plans/03-implementation-plans/active/history-rhymes-telemetry-cockpit-refactor.md` |
| `consolidated-backlog` | `plan` | `active` | `cross-repo` | `yes` | `docs/plans/CONSOLIDATED_BACKLOG.md` |
| `winston-plan-relay` | `skill` | `active` | `cross-repo` | `yes` | `skills/winston-plan-relay/SKILL.md` |

## Archived Prompt References

| ID | Kind | Status | Owners | Entry | Path |
|---|---|---|---|---|---|
| `fix-all-test-failures-meta-prompt` | `prompt` | `archived` | `docs` | `no` | `docs/plans/FIX_ALL_TEST_FAILURES_META_PROMPT.md` |
| `fix-remaining-failures-meta-prompt` | `prompt` | `archived` | `docs` | `no` | `docs/plans/FIX_REMAINING_FAILURES_META_PROMPT.md` |
| `winston-development-meta-prompt` | `prompt` | `archived` | `docs` | `no` | `docs/plans/WINSTON_DEVELOPMENT_META_PROMPT.md` |
