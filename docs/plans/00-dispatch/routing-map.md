# Routing Map

When a raw idea arrives, classify it across these axes, then route to the correct plan folders.

> Intake note: this map routes *plan documentation*. Work-item creation goes
> through the CLAUDE.md Work Intake Gate (`.skills/azure-devops-intake/SKILL.md`
> — R0/R1/R2 risk tiers, ADO Story + Session Brief for R2) — this map does not
> replace it.

## Step 1 — Identify the environment(s)

| Environment | Primary plan folder |
|---|---|
| Control Tower / provisioning | `control-tower/` |
| Novendor CRM / Accounting Command Desk | `novendor-crm-accounting/` |
| Meridian / REPE Finance | `meridian-repe/` |
| Stone PDS / Professional Services | `stone-pds/` |
| Supply Chain / Databricks | `supply-chain-databricks/` |
| Winston Legal | `winston-legal/` |
| History Rhymes / Trading | `history-rhymes/` |
| Healthcare Subscription Analytics (Hone demo) | `healthcare-subscription/` |
| Senior Housing | `senior-housing/` |
| Demo Lab / RAG / Pipeline | `demo-lab/` |
| Excel Add-in | `excel-addin/` |
| Telemetry Platform (Relativity demo, tel_*/rel_* surfaces) | `telemetry-platform/` |
| AI Provider Dispatch | `ai-provider-dispatch/` |
| ADE Ops Orchestrator | `ade-ops-orchestrator/` |
| Automated Data Engineering | `automated-data-engineering/` |
| BigQuery schemas / events spine | `bigquery-schemas/` |
| Investment Engine | `investment-engine/` |
| MCP / Orchestration / AI Runtime | `mcp-orchestration-ai-runtime/` |
| Marketing / Public site | `marketing-domain-routing/` |
| Multiple environments / platform-wide | `01-shared-standards/` |

## Step 2 — Identify shared standard impact

Ask each question. If yes, add the secondary folder.

### Design system impact?

| Question | Secondary folder |
|---|---|
| Does this touch color tokens, spacing, or typography? | `01-shared-standards/design-system/tokens.md` |
| Does this touch the page shell or top navigation? | `01-shared-standards/design-system/shell-navigation-rules.md` |
| Does this touch cards, tables, drawers, or charts? | `01-shared-standards/design-system/component-contracts.md` |
| Does this change how an environment looks different from others? | `01-shared-standards/design-system/environment-theming.md` |

### AI runtime impact?

| Question | Secondary folder |
|---|---|
| Does this touch how the AI gateway handles requests? | `01-shared-standards/ai-runtime/ai-runtime-charter.md` |
| Does this touch SSE events, streaming, or response lifecycle? | `01-shared-standards/ai-runtime/canonical-event-contract.md` |
| Does this touch when AI should refuse, return null, or fail closed? | `01-shared-standards/ai-runtime/fail-closed-rules.md` |
| Does this touch prompts, instructions, or model behavior? | `01-shared-standards/ai-runtime/prompt-contracts.md` |
| Does this touch MCP tools, confirmation gates, or receipts? | `01-shared-standards/ai-runtime/tool-use-policy.md` |

### Eval and testing impact?

| Question | Secondary folder |
|---|---|
| Does this change what success looks like on screen? | `01-shared-standards/evals/golden-paths.md` |
| Does this risk breaking something that currently works? | `01-shared-standards/evals/regression-suite.md` |
| Does this require a Playwright or screenshot test? | env `qa-checklist.md` |
| Does this require an AI answer eval? | `01-shared-standards/evals/eval-taxonomy.md` |

### Data / schema impact?

| Question | Secondary folder |
|---|---|
| Does this require a new table or column? | env `architecture.md` + `agents/data.md` |
| Does this require a migration? | `skills/apply-pending-migrations/SKILL.md` |
| Does this touch RLS or tenant isolation? | env `architecture.md` (data map section) |

### Deployment impact?

| Question | Secondary folder |
|---|---|
| Does this require a Vercel deploy? | `agents/deploy.md` |
| Does this require a Railway restart? | `agents/deploy.md` |
| Does this touch environment variables? | `docs/reference/ENV_KEYS.md` |

## Step 3 — Determine the deliverable type

| Deliverable type | Required artifacts |
|---|---|
| **Code change** | Dispatch record, updated env plan, updated next-session.md, tests to run |
| **Research / spike** | Dispatch record, findings written to env `architecture.md` or `01-shared-standards/` |
| **Migration** | Dispatch record, SQL file in `repo-b/db/schema/`, RLS check |
| **UI verification** | Dispatch record, screenshots, browser checklist |
| **Eval / test** | Dispatch record, test fixtures, pass/fail criteria |
| **Design update** | Dispatch record, token or component contract change, screenshot baseline |

## Step 4 — Required reading per route type

Always read:
- `CLAUDE.md` — routing rules and coding standards
- `docs/plans/00-dispatch/routing-map.md` — this file
- env `README.md` and `architecture.md`

If touching design system → also read:
- `docs/plans/01-shared-standards/design-system/design-system-charter.md`
- env `design-adaptation.md`

If touching AI/prompts → also read:
- `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` (for REPE work)
- `docs/plans/01-shared-standards/ai-runtime/ai-runtime-charter.md`
- env `ai-behavior.md`

If writing evals/tests → also read:
- `docs/plans/01-shared-standards/evals/eval-charter.md`
- env `eval-plan.md`

If touching data → also read:
- `ARCHITECTURE.md`
- env `architecture.md` data map section

## Step 5 — Quick routing examples

**"Fix the ugly top shell above Accounting Command Desk"**
- Primary: `novendor-crm-accounting/`
- Secondary: `01-shared-standards/design-system/shell-navigation-rules.md`
- Eval: env `qa-checklist.md` (screenshot check)

**"Make History Rhymes show daily regime and alerts on open"**
- Primary: `history-rhymes/`
- Secondary: `01-shared-standards/ai-runtime/prompt-contracts.md`, `01-shared-standards/evals/golden-paths.md`
- Eval: env `eval-plan.md` (AI answer eval + screenshot eval)

**"AI is giving hallucinated fund metrics in Meridian"**
- Primary: `meridian-repe/`
- Secondary: `01-shared-standards/ai-runtime/fail-closed-rules.md`, `01-shared-standards/ai-runtime/canonical-event-contract.md`
- Eval: `01-shared-standards/evals/regression-suite.md`
- Required reading: `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`

**"Add AI-ready lakehouse capability to Supply Chain"**
- Primary: `supply-chain-databricks/`
- Secondary: `01-shared-standards/ai-runtime/tool-use-policy.md`, `mcp-orchestration-ai-runtime/`

**"Homepage copy is weak"**
- Primary: `marketing-domain-routing/`
- Secondary: `docs/site-improvements/` (read latest audit), `docs/sales-positioning/`
- Deliverable: code change + Vercel deploy + production verification

**"Receipt intake is dropping receipts silently"**
- Primary: `novendor-crm-accounting/`
- Secondary: `01-shared-standards/ai-runtime/fail-closed-rules.md`
- Deliverable: bug fix + integration test

**"Design tokens look inconsistent between REPE and PDS"**
- Primary: `01-shared-standards/design-system/tokens.md`
- Secondary: `meridian-repe/design-adaptation.md`, `stone-pds/design-adaptation.md`
- Deliverable: token audit + fix in shared layer

## Step 6 — Update rules after session

After every session:
1. Update env `next-session.md` — what the next session should pick up
2. Update env `backlog.md` — new bugs or open items
3. If a design contract changed → update `01-shared-standards/design-system/`
4. If an AI behavior changed → update `01-shared-standards/ai-runtime/` and env `ai-behavior.md`
5. If a test was added → update env `eval-plan.md` or `qa-checklist.md`
6. Add any reusable lesson to `docs/tips.md`
