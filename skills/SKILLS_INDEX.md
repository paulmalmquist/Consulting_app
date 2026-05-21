# Skills Index

Inventory of all `SKILL.md` files in this repo. Counts derived from `find . -name SKILL.md | sort` — not hardcoded.

**Total skills tracked:** 42 (29 in `skills/`, 3 in `.skills/`, 6 in `novendor-crm/skills/`, 1 in `novendor-crm/scripts/`, 1 in `backend/.venv/` — excluded from active count, 1 in `.skills/research-ingest/` — externally managed, 1 in `backend/.venv/` — dependency, not a repo skill)

Repo-owned active skills (skills/ + .skills/): **32**

---

## 1. Coding / repo operations

| Path | Name | Purpose | Sandbox | Local deps |
|---|---|---|---|---|
| `skills/apply-pending-migrations/SKILL.md` | apply-pending-migrations | Run pending Supabase migrations via CLI or MCP | yes | — |
| `skills/clean-tree/SKILL.md` | clean-tree | Working tree hygiene: gitignore, stage, commit, deploy | yes | — |
| `skills/supervised-build-review-loop/SKILL.md` | supervised-build-review-loop | Multi-agent build → review → revision loop with human checkpoints | yes | — |
| `skills/triaged-execution/SKILL.md` | triaged-execution | Route plan steps to the right model/budget by complexity | yes | — |
| `skills/winston-plan-relay/SKILL.md` | winston-plan-relay | Dry-run prompt-bundle assembler for the ChatGPT ↔ Claude Code ↔ Codex planning relay | yes | Python 3.10+ (stdlib only) |
| `skills/chatgpt-agent-validate/SKILL.md` | chatgpt-agent-validate | Produce a ChatGPT agent-mode prompt for browser-based build verification | yes | — |
| `skills/winston-post-deploy-verify/SKILL.md` | winston-post-deploy-verify | Post-deploy smoke test: log in, check key environment pages | yes | — |
| `skills/altered-mind-prod-fix/SKILL.md` | altered-mind-prod-fix | Diagnose, patch, deploy, and verify the Altered Mind production page | yes | — |
| `skills/lab-page-prod-fix/SKILL.md` | lab-page-prod-fix | Production fix for broken lab environment pages | yes | — |

---

## 2. Winston environments

| Path | Name | Purpose | Sandbox | Local deps |
|---|---|---|---|---|
| `skills/winston-create-environment/SKILL.md` | winston-create-environment | Provision a new Winston environment from template + manifest | yes | — |
| `skills/winston-dissensus-build/SKILL.md` | winston-dissensus-build | Build dissensus / debate view for Winston environments | yes | — |

---

## 3. AI runtime / evals / governance

| Path | Name | Purpose | Sandbox | Local deps |
|---|---|---|---|---|
| `skills/winston-investment-engine-module/SKILL.md` | winston-investment-engine-module | Per-module scaffold for Winston Investment Engine (accounting, risk, OMS, etc.) | yes | — |
| `skills/winston-investment-snapshot/SKILL.md` | winston-investment-snapshot | Locked versioned snapshot lifecycle (NAV, P&L, risk, performance) | yes | — |

---

## 4. Data / reporting / analytics

| Path | Name | Purpose | Sandbox | Local deps |
|---|---|---|---|---|
| `skills/historyrhymes/SKILL.md` | historyrhymes | Financial ML: feature engineering, model training, backtests on Databricks | yes | Databricks, MLflow |
| `skills/historyrhymes-execution-layer/SKILL.md` | historyrhymes-execution-layer | Daily decision build, paper trading ledger, Morning Book | yes | — |
| `skills/market-rotation-engine/SKILL.md` | market-rotation-engine | Market regime detection and rotation signal engine | yes | — |
| `skills/msa-rotation-engine/SKILL.md` | msa-rotation-engine | MSA-level rotation engine for real estate market signals | yes | — |

---

## 5. Marketing / design / website

| Path | Name | Purpose | Sandbox | Local deps |
|---|---|---|---|---|
| `skills/novendor-cyberpunk-accents/SKILL.md` | novendor-cyberpunk-accents | Cyberpunk neon brand layer: glow tokens, purple/pink/red accents | yes | — |
| `skills/novendor-icons-system/SKILL.md` | novendor-icons-system | Icon system: swap Lucide, add Remix/Iconoir, status marks | yes | — |
| `skills/pitch-forge-deck/SKILL.md` | pitch-forge-deck | Autonomous pitch deck builder with Sarat Mode critique loop | yes | python-pptx |
| `skills/outreach-personalizer/SKILL.md` | outreach-personalizer | Personalized BD microsite generator for prospect outreach | yes | — |

---

## 6. Local machine / external tools

| Path | Name | Purpose | Sandbox | Local deps |
|---|---|---|---|---|
| `skills/outlook-wincom-cowork/SKILL.md` | **outlook-wincom-cowork** | **Read/search any Outlook mailbox (account-aware), list & save message attachments, graph, draft, and send via Outlook Desktop. MCP-first (Claude calls tools directly); fallback to params-file CLI.** | **no** | pywin32, pandas, matplotlib, openpyxl |
| `skills/outlook-draft-creator/SKILL.md` | outlook-draft-creator | Bulk draft creation in a specific Outlook account via win32com script | no | pywin32 |
| `skills/outlook-draft/SKILL.md` | outlook-draft | Single Outlook draft creation via COM (Windows, classic Outlook) | no | pywin32 |
| `skills/outlook-email-drafting/SKILL.md` | outlook-email-drafting | Draft Outlook emails on Mac via novendor-outreach MCP | no | novendor-outreach MCP |
| `skills/read-texts/SKILL.md` | read-texts | Read and summarize iMessage/SMS threads for any contact (macOS) | no | macOS chat.db |
| `skills/rich-texts/SKILL.md` | rich-texts | Read and summarize Rich Oliveira's iMessage threads specifically | no | macOS chat.db |

---

## 7. Outreach / CRM / business development

| Path | Name | Purpose | Sandbox | Local deps |
|---|---|---|---|---|
| `skills/novendor-crm-supabase/SKILL.md` | novendor-crm-supabase | Direct CRM CRUD via Supabase MCP (contacts, deals, accounts, outreach) | yes | Supabase MCP |
| `skills/novendor-outreach-sync/SKILL.md` | novendor-outreach-sync | Import outreach email from Gmail/Outlook/Graph into Novendor CRM | yes | Gmail MCP, Supabase MCP |
| `skills/winston-sales-intelligence/SKILL.md` | winston-sales-intelligence | Apollo lead lookup, contact enrichment, CRM add, outreach tracking | yes | Apollo MCP |

---

## 8. Research / planning

| Path | Name | Purpose | Sandbox | Local deps |
|---|---|---|---|---|
| `skills/ncf-grant-friction/SKILL.md` | ncf-grant-friction | NCF grant friction research and analysis | yes | — |

---

## 9. Skills framework v1 (institutional artifact skills)

CLI-runnable skills that conform to the v1 contract at `docs/plans/01-shared-standards/skills-framework/charter.md`. Manifest in, deterministic artifacts + `run_receipt.json` out. No AI / DB / network / frontend dependencies.

| Path | Name | Purpose | Sandbox | Local deps |
|---|---|---|---|---|
| `skills/_templates/skill-template/SKILL.md` | skill-template | Copy-and-rename template for new v1 framework skills (not a runnable end-user skill) | yes | openpyxl |
| `skills/repe/lbo-model/SKILL.md` | repe-lbo-model | Build a stub LBO model artifact set from a deal manifest (v0.1.0 — real math in ticket 0007) | yes | openpyxl |

---

## .skills/ — externally managed

These files are managed outside the `skills/` conventions. Do not edit them directly. Included here for inventory completeness.

| Path | Name | Purpose | Sandbox |
|---|---|---|---|
| `.skills/feature-dev/SKILL.md` | feature-dev | General-purpose feature implementation, bug fix, endpoint, page, component | yes |
| `.skills/credit-decisioning/SKILL.md` | credit-decisioning | Consumer credit decisioning: walled garden, chain-of-thought, corpus, citation chain | yes |
| `.skills/research-ingest/SKILL.md` | research-ingest | Ingest research documents from `docs/research/` | yes |

---

## novendor-crm/ skills — separate sub-repo

These live in `novendor-crm/skills/` and are part of the novendor-crm package, not the main skills directory.

| Path | Name | Purpose |
|---|---|---|
| `novendor-crm/skills/add-contact/SKILL.md` | add-contact | Add a contact to the Novendor CRM |
| `novendor-crm/skills/deploy-crm/SKILL.md` | deploy-crm | Deploy the Novendor CRM |
| `novendor-crm/skills/log-outreach/SKILL.md` | log-outreach | Log an outreach event in the CRM |
| `novendor-crm/skills/log-task/SKILL.md` | log-task | Log a task in the CRM |
| `novendor-crm/skills/pipeline-summary/SKILL.md` | pipeline-summary | Summarize the CRM pipeline |
| `novendor-crm/skills/update-deal/SKILL.md` | update-deal | Update a deal record |

---

## Metadata gaps

Skills with missing or inconsistent frontmatter (not normalized — noted for awareness, not urgent):

- `skills/historyrhymes/SKILL.md` — no YAML frontmatter; uses inline header fields
- `skills/historyrhymes-execution-layer/SKILL.md` — no YAML frontmatter; uses inline header fields  
- `skills/market-rotation-engine/SKILL.md` — no YAML frontmatter; uses inline header fields
- `skills/msa-rotation-engine/SKILL.md` — no YAML frontmatter (assumed — not confirmed)
- `skills/winston-sales-intelligence/SKILL.md` — no YAML frontmatter; uses inline header fields
- `skills/pitch-forge-deck/SKILL.md` — no YAML frontmatter; uses inline header fields
- `skills/outreach-personalizer/SKILL.md` — no YAML frontmatter; uses inline header fields
- `skills/ncf-grant-friction/SKILL.md` — not confirmed to have frontmatter

These skills work fine without frontmatter — the gaps are cosmetic. Normalize on touch, not proactively.
