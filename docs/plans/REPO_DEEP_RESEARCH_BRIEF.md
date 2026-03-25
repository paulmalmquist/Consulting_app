# Business Machine Repo Deep Research Brief

Last updated: 2026-03-02

This document is a practical repo-wide summary intended to tee up deep product, architecture, and feature research.
It is based on a static codebase scan of the current monorepo.


## 1. What This Repo Is

This is a multi-app business operations platform with a strong real estate private equity (REPE) focus, but it also includes:

- A primary Next.js frontend (`repo-b`)
- A primary FastAPI backend (`backend`)
- A secondary "Demo Lab" FastAPI app (`repo-c`)
- Database schema and migrations centered in `repo-b/db`
- Supabase local config (`supabase`)
- Orchestration and automation tooling (`orchestration`, `scripts`)
- An Excel add-in surface (`excel-addin`)

At a product level, this repo is trying to be:

- A business operating system
- A multi-domain workflow platform
- A finance and real estate execution engine
- A demo/sandbox environment system for creating environment-scoped workspaces
- A command/orchestration-enabled app with AI and MCP-style tooling


## 2. Main Product Surfaces

### A. Business OS / App Shell

The app has a central shell with multiple domain workspaces and navigation patterns:

- General app shell and landing routes
- Department/capability routing
- Admin views
- Public onboarding and login
- A "lab" environment-driven experience

The frontend is built with Next.js App Router and has both:

- User-facing pages (`src/app/.../page.tsx`)
- Many internal API route handlers (`src/app/api/.../route.ts`)


### B. Demo Lab (Environment-Driven Sandbox)

Demo Lab is a core concept across the repo.

It allows creation of isolated environments (`env_id`) with:

- A client/company identity
- An industry or industry type
- A dedicated schema name
- Environment-scoped workflows and seeded records

Users can:

- Create environments
- List environments
- Update environments
- Reset environments
- Upload documents
- Inspect environment metrics
- Work inside environment-specific domain pages

This is the main sandboxing model for demos, simulations, and domain-specific workflows.


### C. Real Estate Private Equity (REPE)

REPE is the deepest and most mature vertical in the codebase.

Major REPE capabilities present:

- Fund management
- Deal / investment management
- Asset management
- Quarter-state tracking
- Fund metrics
- LP summary
- Debt surveillance
- Run history / provenance
- Scenarios
- Waterfall scenario tooling
- Valuation and rollup endpoints
- Sustainability / footprint reporting
- Lineage / auditability views
- Capital and ledger-style views

There are both:

- Legacy-ish RE v1 endpoints
- REPE-specific routes
- RE v2 routes with a more detailed institutional data model
- Finance REPE engine routes under backend finance APIs

This is clearly the strategic center of the platform.


### D. Finance Engine Layer

The backend contains a large finance engine surface under `backend/app/finance` and related services.

Capabilities include:

- Allocation engine
- Capital account engine
- Waterfall engine
- IRR engine
- Trust engine
- Scenario engine
- Construction forecast engine
- Provider compensation engine
- Execution runtime
- Task queue / Celery app

There is a deliberate architecture rule in `RULES.MD` that all financial math should be deterministic and backend-owned.

The platform is trying to support:

- Repeatable runs
- Ledger-backed outputs
- Idempotent calculations
- Audit trails
- Background execution for heavy compute


### E. Consulting Revenue OS

The consulting domain appears to be a native CRM / revenue workspace.

Capabilities present:

- Pipeline stages
- Kanban pipeline
- Leads
- Outreach templates
- Outreach logs and analytics
- Proposals
- Clients
- Revenue metrics
- Strategic outreach

This looks like a services-firm operating layer built on the same platform.


### F. Other Domain Workspaces

Other verticals or operational modules exist:

- Credit
- PDS (project/delivery / project controls style workspace)
- Legal Ops
- Medical / med office
- Compliance
- CRM
- Reports
- Tasks
- ECC command center
- Website content / rankings / analytics
- Documents
- Winston demo / institutional demo surfaces

These are at different maturity levels, but the platform is clearly aiming to become a multi-vertical business OS.


### G. AI / Command / Orchestration Layer

There is an AI and orchestration capability spanning:

- Codex-style command planning and execution routes
- MCP-like tool routing
- Context snapshots
- AI ask/chat routes
- Sidecar processes
- Orchestration session contracts
- Risk controls and scope enforcement

This is not just "AI chat in app."
It is moving toward controlled task orchestration with:

- Plans
- Confirmations
- Execution sessions
- Tool registries
- Validation and audit logging


### H. Excel Add-In Support

The repo contains an `excel-addin` package and `repo-c/app/excel_api.py`.

This suggests the platform supports:

- Spreadsheet-like access to entities
- Read/write style operations against structured records
- Excel-authenticated API access
- Audit support for spreadsheet interactions

This could become a major enterprise adoption lever if made robust.


## 3. How the System Works (Architecture)

### Frontend (`repo-b`)

The frontend is the main user surface.

It provides:

- App Router pages
- Client components and server components
- Domain workspace shells and providers
- Internal proxy/API routes
- Browser-side API clients

There are multiple fetch layers:

- `apiFetch` for Demo Lab / same-origin style calls
- `bosFetch` for Business OS backend calls
- Direct Next route handlers that query Postgres directly

This means the frontend is not only UI.
It is also acting as:

- A proxy layer
- A mini-BFF
- In some cases, a direct DB-backed API surface


### Primary Backend (`backend`)

The FastAPI backend is the main business logic and engine layer.

It includes:

- Route modules per domain
- Service modules with business logic
- Pydantic schemas
- DB cursor helpers
- Observability / request logging
- MCP/tooling surfaces
- AI gateway integration

This is where the platform wants critical logic to live, especially:

- Finance
- Deterministic calculations
- Audited operations
- Domain contracts


### Demo Lab Backend (`repo-c`)

`repo-c` is a second FastAPI application that powers the Demo Lab environment model.

It handles:

- Environment lifecycle
- Environment-scoped pipeline boards
- Documents and uploads
- Queue / HITL style actions
- Audit and metrics
- Excel API
- LLM helper functions

It is effectively a second backend with its own responsibilities.


### Data Layer

The real schema source of truth is mostly in:

- `repo-b/db/schema/*.sql`
- `repo-b/db/migrations/*.sql`

There are many numbered SQL modules covering:

- Backbone entities
- Reporting
- Accounting
- CRM
- Finance
- RE institutional model
- Domain templates
- RLS
- Security hardening
- Indexes
- Views
- Seed data

The database model is broad and ambitious.


### Proxies and Routing

There are same-origin proxy handlers for:

- `/bos/*` to the Business OS backend
- `/v1/*` to the Demo Lab backend

This is designed to avoid browser CORS issues and keep frontend routes stable.


## 4. Key Features Already Implemented

### Core platform features

- Multi-workspace app shell
- Environment-based sandboxing
- Multiple domain modules
- Next.js frontend with route handlers
- FastAPI backend with broad domain surface
- Structured logging and request IDs
- Playwright and Vitest test surfaces

### REPE features

- Funds list and detail
- Deal/investment drilldowns
- Asset pages
- Quarter-state and metrics
- Fund rollups
- LP summaries
- Debt surveillance
- Scenarios
- Models
- Runs and lineage
- Valuation compute/save
- Waterfall and capital views
- Sustainability reports

### Finance/engine features

- Deterministic engine modules
- Finance execution runtime
- Waterfall and allocation logic
- Background task hooks
- Materialization/report-style support

### Consulting / ops features

- CRM-like revenue operations
- Pipeline and kanban
- Leads and outreach
- Proposals
- Client analytics

### Demo / workflow features

- Demo environment creation
- Demo seeding
- Winston institutional demo
- ECC demo state and command center

### AI / orchestration features

- Command planning APIs
- Command confirmation / execute APIs
- Context snapshots
- MCP tool definitions and registries
- Sidecar routes and scripts


## 5. Product Direction Implied by the Repo

The codebase suggests the intended product is:

- A system of record for business operations
- A system of simulation for finance and real estate decisions
- A system of execution for workflows, tasks, and approvals
- A system of insight for reporting, metrics, and AI-assisted analysis

The strongest product thesis appears to be:

"Build a business operating system where workflows, finance, documents, and AI all run in one environment-aware platform, with REPE as the flagship vertical."


## 6. What Feels Most Valuable Today

If you want to decide what to add next, the highest-leverage areas appear to be:

### A. Make REPE world-class

This is already the deepest vertical.
The biggest ROI likely comes from making it materially better rather than adding a random new domain.

High-value additions:

- Institutional reporting packs
- Better underwriting and model versioning
- Scenario comparison and approvals
- Portfolio construction / strategy analytics
- Investor reporting and self-service portals
- Asset operations workflows tied to metrics


### B. Unify the platform around one clear execution model

Right now the repo contains:

- Frontend DB routes
- Backend routes
- Demo Lab backend routes
- Multiple API styles

This creates product and engineering drag.
One of the best "feature" investments may be making the experience feel like one coherent system:

- Stable contracts
- One permission model
- One execution trace model
- One consistent error model


### C. Turn AI into workflow acceleration, not just chat

The repo already has orchestration pieces.
The best next AI features are likely:

- Guided next-best-actions
- Operator copilots inside domain screens
- Explainability for financial outputs
- Approval-aware automation
- Draft generation for memos, outreach, reports, and work items

This is stronger than generic chatbot features.


### D. Make Demo Lab a real product differentiator

The environment-scoped model is powerful.
It could become:

- Sales demo generator
- Customer onboarding sandbox
- Scenario lab for pre-production experimentation
- Training simulator
- Tenant template system


### E. Make Excel and external integrations enterprise-grade

The Excel surface could become a major adoption wedge if it supports:

- Controlled writeback
- Auditable edits
- Versioned imports/exports
- Portfolio reporting templates
- Bulk review workflows


## 7. Biggest Gaps / Research Questions

These are the best areas to research before deciding what to build next.

### Product gaps

- Which single buyer is this product truly for right now?
- Is REPE the product, or is REPE the anchor for a broader Business OS?
- Which domain modules are real strategic bets vs exploratory prototypes?
- What workflows are highest frequency and highest pain for current users?
- What should be first-class: analysis, execution, reporting, or collaboration?


### UX / workflow gaps

- How should users move between environment-level, fund-level, and asset-level work?
- Which dashboards should be analytical vs operational?
- Which tasks should be one-click, wizard-based, or automation-driven?
- How should approvals, audit trails, and scenario promotion feel in the UI?


### Data / architecture gaps

- Which APIs should remain in Next.js route handlers vs move fully to FastAPI?
- Should Demo Lab remain a separate backend or merge into the primary backend?
- What is the long-term boundary between demo data, tenant data, and scenario data?
- How should model versioning and run provenance be exposed to end users?


### Commercial gaps

- What is the fastest path to monetizable value?
- Which feature set is strong enough to sell as a standalone product?
- Which modules are table stakes vs premium enterprise differentiators?


## 8. Best Features to Consider Adding Next

These are the most defensible additions to research deeply.

### Option 1: Institutional REPE Command Center

A true operator cockpit for:

- quarter close
- covenant breaches
- watchlist assets
- scenario deltas
- approval queues
- investor deliverables

Why it matters:

- It builds on existing REPE depth
- It is sticky for real users
- It aligns with the platform's finance + workflow strengths


### Option 2: Model Governance and Scenario Promotion

Formal workflow for:

- create model
- fork assumptions
- run scenario
- compare versions
- request review
- approve / reject
- publish to official state

Why it matters:

- The data model already hints at model/version lineage
- It adds serious enterprise credibility
- It connects analysis to governed execution


### Option 3: Investor / LP Reporting Portal

Extend LP summary into:

- investor-specific views
- statements
- commitments / distributions history
- scenario-based exposure views
- downloadable report packs

Why it matters:

- High buyer value
- Directly monetizable
- Extends existing fund and LP data rather than inventing a new domain


### Option 4: Asset Operations Workflow Layer

Move beyond reporting into actual operating actions:

- assign issues
- create remediation plans
- attach documents
- schedule follow-ups
- track milestone completion

Why it matters:

- Makes the platform operational, not just analytical
- Increases daily active usage
- Bridges tasks/workflow with REPE data


### Option 5: AI-Assisted Decision Layer

A governed copilot that can:

- summarize fund health
- explain metric changes
- draft IC memos
- draft outreach or reports
- suggest next actions with linked evidence

Why it matters:

- The repo already has orchestration hooks
- This can be differentiated if tied to real data and auditability


## 9. Recommended Research Focus

If the goal is "what is best to add to this app and how to design it," the best research path is:

1. Treat REPE as the flagship product.
2. Focus on the highest-value institutional workflow, not a generic feature.
3. Design for execution + governance, not just dashboards.
4. Use the environment model as a strategic differentiator.
5. Make AI a controlled operator tool, not a novelty.

The strongest candidate theme is:

"Institutional REPE operating system: scenario-governed decision making, asset/fund execution workflows, and investor-grade reporting."


## 10. Deep Research Prompt (Use This)

Copy the prompt below into your research workflow.

---

You are a principal product strategist, enterprise UX architect, and systems researcher.

I need a deep research report and product design recommendation for a software platform called Business Machine.

This platform is a multi-app monorepo with:

- A Next.js frontend app
- A FastAPI backend
- A second FastAPI "Demo Lab" backend
- A large SQL schema and migration system
- Heavy real estate private equity (REPE) functionality
- Finance engines for deterministic calculation
- Workflow / tasks / approvals features
- Consulting CRM/revenue features
- AI orchestration and command-planning features
- Environment-scoped demo/sandbox workspaces
- An Excel add-in API surface

Current product traits:

- Strongest vertical is REPE
- Existing REPE features include funds, deals, assets, quarter-state, metrics, scenarios, models, lineage, LP summary, debt surveillance, valuation, waterfall, and sustainability
- The system is trying to combine analytics, workflow execution, auditability, and AI assistance in one platform
- There are multiple domain modules beyond REPE, including consulting, credit, legal ops, medical, compliance, tasks, documents, and reporting

I want you to research and recommend what the best next product additions should be, and how the app should be designed to become a stronger, more coherent product.

Your job:

1. Infer the most likely product strategy options for this platform.
2. Identify the most commercially viable wedge product.
3. Recommend the best next feature investments for the next 6-18 months.
4. Propose how the UX and information architecture should evolve.
5. Recommend what should be consolidated, simplified, or removed.
6. Suggest how AI should be integrated in a way that is actually useful and differentiated.
7. Suggest how to use the environment-based sandbox model as a strategic advantage.
8. Suggest which user personas and buyer types this product should target first.
9. Provide a prioritized roadmap with MVP, growth, and enterprise phases.
10. For the top 3 feature bets, provide:
   - problem solved
   - target user
   - why it matters
   - key screens
   - core workflows
   - data model implications
   - API implications
   - risks
   - success metrics

Constraints and preferences:

- Be opinionated.
- Assume this product should preserve backwards-compatible routes where possible.
- Prefer high-ROI additions over giant unfocused expansions.
- Favor features that increase daily usage, enterprise credibility, and differentiation.
- Treat REPE as the current strongest wedge unless a better one is clearly justified.
- Assume finance-related outputs must be deterministic, auditable, and backend-owned.
- Avoid generic AI-chat recommendations unless tied to a real workflow.
- Emphasize design systems, workflow clarity, and enterprise trust.

I want the final output in this structure:

1. Executive thesis
2. Most likely product positioning options
3. Best wedge product recommendation
4. Top 5 feature bets
5. UX / IA redesign recommendations
6. AI strategy recommendations
7. What to cut / de-emphasize
8. 6-month roadmap
9. 12-18 month roadmap
10. Detailed product concepts for the top 3 bets
11. Suggested technical architecture direction
12. Risks and tradeoffs

Be specific, commercially grounded, and design-forward.
Do not give vague startup advice.
Treat this like a serious platform strategy review for an enterprise software product.

---


## 11. Design Guidance for Future Research

When evaluating what to add next, use these filters:

- Does it make REPE materially more useful for institutional operators?
- Does it increase execution and workflow stickiness, not just read-only analytics?
- Does it make the platform feel more coherent instead of more fragmented?
- Does it leverage existing strengths already present in the repo?
- Does it improve auditability, trust, and enterprise credibility?
- Does it create a clear sales narrative?

Features that pass those filters are likely good investments.
Features that only add another disconnected page or another shallow domain module are likely noise.


## 12. Bottom Line

This repo already contains the bones of a serious product.

The strongest path is not "add more random modules."
The strongest path is:

- pick the flagship buyer
- deepen the flagship workflow
- unify the system
- make execution and governance first-class
- use AI as a controlled accelerator

If you want one sentence to anchor future decisions, use this:

"Turn Business Machine into the operating system for institutional real estate decision-making and execution, then expand outward from that credibility."
