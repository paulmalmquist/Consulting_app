# Winston / Novendor Capability Inventory

> **Auto-refreshed daily at 7:30 AM by `morning-ops-digest`.**
> Last verified: 2026-03-20
>
> **Purpose:** Single source of truth for what's already built. Every suggestion-generating scheduled task MUST read this file before recommending new features, improvements, or demos. If it's listed here, don't suggest building it — suggest enhancing it instead.

---

## Platform Statistics

| Metric | Count |
|---|---|
| MCP tool categories | 31 |
| Frontend pages | 258 |
| React components | 288 |
| Lab environment types | 32 |
| Backend services | 208 |
| Backend routes | 87 |
| Database migrations | 161 (latest: 410) |
| Credit decisioning pages | 15 |

---

## Deployed Capabilities by Domain

### REPE (Real Estate Private Equity) — FULLY BUILT

- **Fund Management:** Fund list, fund detail, fund metrics, fund waterfall engine
- **Asset Management:** Asset list, asset detail, asset financials, asset variance (UW vs Actual)
- **Deal Pipeline:** Deal Radar, deal detail, deal scoring, pipeline tracking
- **LP/Investor:** LP summary, LP waterfall, capital call management, investor statement PDF, IR draft assembly
- **Financial Modeling:** IRR timeline, Monte Carlo simulation, scenario engine (v1 + v2), stress testing (cap rate), sale scenarios, amortization
- **Portfolio Analytics:** Rollup views, geography analysis, risk scoring, integrity checks, sustainability/ESG (5 modules)
- **Quarter Close:** Period close workflow, reconciliation, TB upload
- **Covenant Tracking:** Covenant monitoring and alerting
- **Debt Surveillance:** Loan monitoring, rate sensitivity analysis

### Winston AI / Chat Workspace — BUILT, HAS KNOWN BUGS

- **Chat UI:** Full-screen copilot with Composer, Context Panel, History Drawer, Viewport, Response Renderer, Top Bar
- **AI Gateway:** 189KB service — request routing, model dispatch, token budget, prompt policy, response filtering
- **RAG System:** Vector indexing (rag_indexer), semantic reranking (rag_reranker), custom PsychRAG implementation (5 modules)
- **Assistant Blocks:** Structured response rendering with block types
- **Assistant Scope:** Context isolation per workspace
- **Known bugs (6):** Bug 0 = raw tool call spam exposed in UI (execution narration regression). See META_PROMPT_CHAT_WORKSPACE.md for full list.

### Dashboard Composition — BUILT

- **Dashboard Composer:** 38KB service for widget layout and composition
- **Environment Binding:** Dynamic dashboard context per environment
- **Query Intent:** Natural language → dashboard query translation

### Credit Decisioning — FULLY BUILT

- **Frontend:** 15 pages (cases, loans, portfolios, decisions, policies, exceptions, audit trail, corpus, doc-completion)
- **Backend:** 1,427-line decisioning engine with underwriting policy evaluation, risk assessment, decision generation, exception handling
- **MCP Tools:** Full credit tool suite
- **Routes:** v1 and v2 credit API endpoints
- **Schema:** credit_decision, credit_policy, credit_exception, credit_case, credit_portfolio tables

### PDS (JLL Platform) — BUILT, MULTI-PHASE

- **Core Engine:** 3,083-line PDS service
- **Analytics:** Revenue, utilization, satisfaction, adoption, account-level analytics (6 specialized service files)
- **Enterprise Features:** Enterprise PDS module
- **Executive Reporting:** Executive-level reporting directory
- **Routes:** v1 and v2 PDS routes, plus PDS chat, PDS query, PDS analytics endpoints
- **Data Seeding:** Synthetic data seeder for demos

### Capital Projects — BUILT

- **Project Management:** 26KB capital projects service
- **Draw Management:** Draw processing, pay app variance analysis, draw auditing
- **Routes:** Capital project and draw endpoints

### CRM / Client Operations — BUILT

- **CRM Core:** Client management, lead tracking, pipeline
- **Engagement:** Engagement tracking, proposals, revenue
- **Outreach:** Strategic outreach, outreach tracking
- **Metrics Engine:** CRM metrics calculation
- **Data Seeding:** CRM seed data

### Document Management — BUILT

- **Documents:** Document CRUD, document content management
- **Extraction:** Extraction engine with profiles and writeback
- **Text Parsing:** OCR parser, text extractor
- **Doc Completion:** Document completion engine with file-level detail pages

### Finance (Multi-Industry) — BUILT

- **REPE Finance:** 43KB core financial service
- **Construction Finance:** Industry-specific financial workflows
- **Healthcare Finance:** Industry-specific financial workflows
- **Legal Finance:** Industry-specific financial workflows
- **Scenarios:** Financial scenario modeling and runtime
- **EPI Finance:** EPI-specific financial endpoints

### Consulting / Opportunity Engine — BUILT

- **Opportunity Engine:** 67KB service for deal/opportunity sourcing
- **Analytics Workspace:** Coordinated analytics delivery
- **Legal Ops:** Legal operations workflows
- **Medical Office:** Medical office management

### Website Analytics — BUILT

- **Analytics:** Website performance tracking
- **Rankings:** Website ranking monitoring
- **Content:** Website content management
- **Seeder:** Website data seeding

### Governance & Compliance — BUILT

- **Governance:** Governance logging and audit
- **Compliance:** Compliance rule management
- **Audit:** Audit trail infrastructure

### Resume Environment — PARTIALLY BUILT

- **Backend:** resume.py service, resume_rag_seed.py for RAG seeding
- **Routes:** Resume API endpoints
- **MCP Tools:** Resume tools registered
- **Frontend:** Resume builder UI components
- **Status:** Needs career data populated (META_PROMPT_VISUAL_RESUME.md has [FILL] placeholders)

---

## Lab Environment Types (32 Active)

All environment types below are deployed and routable:

analytics, blueprint, case-factory, consulting, content, copilot, **credit** (fully built), data-chaos, data-studio, definitions, demo, discovery, documents, ecc, funds, impact, legal, medical, metric-dict, opportunity-engine, outputs, pattern-intel, **pds** (fully built), pilot, pipeline, rankings, re, **resume** (partial), underwriting, vendor-intel, workflow-intel

---

## MCP Tool Categories (31)

meta, business, document, execution, work, repo, env, git, fe, api, db, metrics, report, re_model, rag, repe, repe_finance, repe_investor, repe_workflow, repe_ops, repe_analysis, repe_platform, query, **credit**, covenant, lp_report, notice, **resume**, governance, ir, rate_sensitivity

---

## Novendor Platform Services (12 — Mostly Stubs)

| Service | Size | Status |
|---|---|---|
| nv_discovery.py | 15KB | Substantial — working |
| nv_ai_copilot.py | Small | Stub |
| nv_case_factory.py | Small | Stub |
| nv_data_chaos.py | Small | Stub |
| nv_data_studio.py | Small | Stub |
| nv_engagement_output.py | Small | Stub |
| nv_exec_blueprint.py | Small | Stub |
| nv_impact_estimator.py | Small | Stub |
| nv_metric_dict.py | Small | Stub |
| nv_pilot_builder.py | Small | Stub |
| nv_vendor_intel.py | Small | Stub |
| nv_workflow_intel.py | Small | Stub |

---

## Active Meta Prompts & Build Directives

| Meta Prompt | Status | Top Priority |
|---|---|---|
| META_PROMPT_CHAT_WORKSPACE.md | Active | Bug 0: execution narration regression |
| META_PROMPT_VISUAL_RESUME.md | Active | Needs career data from Paul |
| PDS_META_PROMPTS.md | Active | Multi-phase PDS delivery |
| DEMO_FEATURES_META_PROMPTS.md | Active | D1-D5 demo feature specs |

---

## What NOT to Suggest Building

The following are common false positives — things that scheduled tasks have previously suggested but that already exist:

1. **"Add a waterfall engine"** — Already built: `re_waterfall.py`, waterfall MCP tools, waterfall UI pages
2. **"Build CRM capabilities"** — Already built: Full CRM service suite (9 files), CRM routes, CRM UI
3. **"Add document extraction"** — Already built: Extraction engine with profiles and writeback
4. **"Create LP reporting"** — Already built: LP report assembler, investor statement PDF, IR drafts
5. **"Build compliance tracking"** — Already built: Compliance service, governance logging, audit trail
6. **"Add AI chat"** — Already built: Full copilot workspace, AI gateway, RAG, assistant blocks
7. **"Build deal pipeline"** — Already built: Deal Radar, deal scoring, pipeline tracking
8. **"Add credit decisioning"** — Already built: 15-page credit environment with full backend
9. **"Create scenario modeling"** — Already built: Scenario engine v1 + v2, Monte Carlo, stress testing
10. **"Add MCP tools for X"** — Check the 31 tool categories first. Most domains already have tools.

---

## How Scheduled Tasks Should Use This File

```
1. Read this file BEFORE generating suggestions
2. Cross-reference your suggestion against "Deployed Capabilities by Domain"
3. If the capability exists → suggest an ENHANCEMENT, not a new build
4. If the capability is partial → note what's missing and suggest completing it
5. If the capability truly doesn't exist → suggest it as net-new with a build estimate
6. Always cite this file: "Per CAPABILITY_INVENTORY.md, Winston already has [X]"
```
