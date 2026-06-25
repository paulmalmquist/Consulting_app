---
id: instruction-index
kind: reference
status: informational
source_of_truth: false
topic: instruction-registry
owners:
  - docs
  - cross-repo
entrypoint: false
---

# Instruction Index

Generated from `config/instruction-routing.json`. Do not hand-edit this table.

The registry is the machine-readable routing source of truth. `CLAUDE.md`
contains only the durable startup contract. Root `agents/*.md` files are
OpenClaw role contracts; Claude-discoverable skills live under
`.claude/skills/` and delegate to canonical skill bodies.

| ID | Kind | Canonical source | Owners | ADO risk | Delivery | Claude command |
|---|---|---|---|---|---|---|
| `ai-copilot-winston` | agent | `agents/ai-copilot.md` | backend, repo-b | R1 | full | — |
| `apply-pending-migrations` | skill | `skills/apply-pending-migrations/SKILL.md` | repo-b, supabase, telemetry-platform | R2 | full | `/apply-pending-migrations` |
| `architect-winston` | agent | `agents/architect.md` | cross-repo | R0 | none | — |
| `azure-devops-intake` | skill | `.skills/azure-devops-intake/SKILL.md` | cross-repo, orchestration | R2 | none | `/azure-devops-intake` |
| `bos-domain-winston` | agent | `agents/bos-domain.md` | backend | R1 | full | — |
| `claude-router` | router | `CLAUDE.md` | cross-repo | R0 | none | — |
| `clean-tree` | skill | `skills/clean-tree/SKILL.md` | cross-repo | R1 | full | `/clean-tree` |
| `confluent-stargate-lifecycle` | skill | `skills/confluent-stargate-lifecycle/SKILL.md` | orchestration, telemetry-platform | R2 | full | `/confluent-stargate-lifecycle` |
| `data-winston` | agent | `agents/data.md` | backend, repo-b, supabase, telemetry-platform | R2 | full | — |
| `deploy-winston` | agent | `agents/deploy.md` | cross-repo, scripts | R2 | full | — |
| `feature-dev` | skill | `.skills/feature-dev/SKILL.md` | backend, repo-b, telemetry-platform, excel-addin, orchestration, scripts, docs | R1 | full | `/feature-dev` |
| `frontend-winston` | agent | `agents/frontend.md` | repo-b | R1 | full | — |
| `lab-environment-winston` | agent | `agents/lab-environment.md` | backend, repo-b, excel-addin, telemetry-platform | R1 | full | — |
| `mcp-winston` | agent | `agents/mcp.md` | backend, orchestration | R2 | full | — |
| `qa-winston` | agent | `agents/qa.md` | cross-repo | R0 | verify | — |
| `research-ingest` | skill | `.skills/research-ingest/SKILL.md` | docs, cross-repo | R0 | none | `/research-ingest` |
| `sync-winston` | agent | `agents/sync.md` | cross-repo, scripts | R0 | none | — |
| `telemetry-data-interrogation` | skill | `skills/telemetry-data-interrogation/SKILL.md` | telemetry-platform, data | R0 | none | `/telemetry-data-interrogation` |
| `winston-full-delivery` | skill | `skills/winston-full-delivery/SKILL.md` | cross-repo, scripts | R2 | full | `/winston-full-delivery` |
| `winston-plan-relay` | skill | `skills/winston-plan-relay/SKILL.md` | cross-repo, orchestration | R0 | none | `/winston-plan-relay` |
| `winston-post-deploy-verify` | skill | `skills/winston-post-deploy-verify/SKILL.md` | cross-repo | R0 | verify | `/winston-post-deploy-verify` |
| `winston-router` | skill | `skills/winston-router/SKILL.md` | cross-repo, orchestration | R0 | none | `/winston-router` |
| `winston-session-start` | skill | `skills/winston-session-start/SKILL.md` | cross-repo | R0 | none | `/winston-session-start` |
