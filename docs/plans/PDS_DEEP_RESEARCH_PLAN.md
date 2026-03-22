# PDS Deep Research Plan

## Purpose

Use this document as the prompt and framing brief for a deep research pass on how an institutional Project & Development Services (PDS) platform should operate if the goal is to approximate the operating rigor of a firm like JLL, then translate those findings back into this repository for implementation.

This is not a greenfield prompt. The repo already contains a real PDS prototype, shared Business OS infrastructure, and a Demo Lab environment model. The research should therefore focus on:

1. What best practices a serious PDS operator actually performs.
2. Which of those practices matter most for a software platform.
3. How those capabilities should map into this codebase and its current architecture.
4. What should be built first versus deferred.

## Current Repo Inventory And Constraints

### Monorepo shape

- `backend/`: FastAPI Business OS backend on `/api/*`.
- `repo-b/`: Next.js frontend serving both Business OS (`/app/*`) and Demo Lab (`/lab/*`).
- `repo-c/`: FastAPI Demo Lab backend on `/v1/*`.
- `repo-b/db/schema/`: canonical SQL schema bundle used by the backend database.
- `docs/`: product and architecture docs.
- `orchestration/`: execution-control framework for deterministic agent work.

### Existing PDS surface already in the product

The system already has a PDS workspace. Research should assume this is a prototype that must be deepened, not replaced from scratch.

- UI workspace: `repo-b/src/app/lab/env/[envId]/pds/page.tsx`
- API namespace: `backend/app/routes/pds.py` at `/api/pds/v1/*`
- Request/response contracts: `backend/app/schemas/pds.py`
- Domain service logic: `backend/app/services/pds.py`
- Deterministic engines: `backend/app/services/pds_engines.py`
- PDS data model: `repo-b/db/schema/272_pds_core.sql`
- PDS constraints/indexes: `repo-b/db/schema/273_pds_indexes_and_constraints.sql`
- PDS product spec: `docs/pds-command.md`
- Existing gap assessment: `docs/pds-replacement-gap-analysis.md`

### What already exists in the current PDS prototype

The current prototype already models:

- programs and projects
- budget versions and budget lines
- budget revisions
- contracts and commitment lines
- change orders and approvals
- invoices and payments
- forecast versions
- milestones and schedule snapshots
- risks and risk snapshots
- survey responses and vendor score snapshots
- portfolio snapshots and report-pack runs

The current frontend already supports:

- a portfolio command center view
- project creation
- portfolio KPI display
- snapshot execution
- report-pack execution

### Important architectural constraints

- The product uses an `env_id -> business_id` context binding for domain workspaces.
- `/lab/*` is the environment-scoped operational workspace.
- `/app/*` is the broader Business OS workspace.
- The backend database schema is authored in `repo-b/db/schema/*.sql` and then applied by the backend.
- The frontend uses `repo-b/src/lib/bos-api.ts` as the shared client for Business OS APIs.
- This repo already favors deterministic engines, snapshotting, auditability, and replayable flows.

## Research Objective

Produce a practical, implementation-oriented model for how this product should evolve from a PDS prototype into a credible digital operating system for capital projects and project/development services, using institutional best practices commonly seen in firms like JLL, CBRE, Cushman, Turner & Townsend, and owner-rep / cost-management / PMO organizations serving enterprise real estate and capital programs.

The research should answer:

1. What are the core operating motions of a high-performing PDS organization across planning, preconstruction, procurement, construction, closeout, and post-occupancy?
2. Which workflows are mandatory to be credible with institutional clients, and which are nice-to-have?
3. What data objects, approvals, controls, and KPIs are standard?
4. Which processes should be deterministic workflow engines versus human-in-the-loop collaboration tools?
5. What is the correct product and system shape for this repo specifically?

## Deep Research Prompt

Use the following as the actual prompt for ChatGPT deep research:

> You are designing the target operating model and software capability map for an institutional-grade Project & Development Services (PDS) platform.
>
> Context:
> - The target product is a monorepo application called Business Machine.
> - It already has:
>   - a FastAPI backend (`backend/`) for Business OS functions
>   - a Next.js frontend (`repo-b/`) serving both core Business OS views and environment-scoped Demo Lab views
>   - a FastAPI Demo Lab backend (`repo-c/`)
>   - an early PDS domain already implemented at `/api/pds/v1/*` and `/lab/env/[envId]/pds`
> - The current PDS prototype already supports projects, budgets, commitments, change orders, invoices, payments, forecasts, milestones, risks, vendor score snapshots, portfolio snapshots, and report packs.
> - The system architecture favors deterministic engines, explicit schemas, auditability, snapshots, and replayable business logic.
>
> Goal:
> Define what an institutional PDS platform should do if it is intended to approximate the delivery discipline of a top-tier PDS provider (for example, JLL-like owner representation / project management / cost management practices), but implemented as software inside this architecture.
>
> I do not want a generic product brainstorm. I want a concrete operating model and implementation blueprint.
>
> Please research and synthesize:
>
> 1. Core PDS service lines and workflows
> - Break down the lifecycle into planning, capital planning, due diligence, preconstruction, procurement, construction administration, change management, cost control, schedule control, risk management, vendor management, closeout, turnover, and post-occupancy.
> - For each stage, identify:
>   - key actors
>   - standard artifacts
>   - required approvals
>   - common SLAs / cadence expectations
>   - KPIs and executive reporting expectations
>
> 2. Data model and system-of-record expectations
> - Define the canonical entities a serious PDS platform should manage.
> - Include portfolio/program/project hierarchy, budgets, revisions, forecast versions, commitments, contracts, vendors, invoices, payments, schedules, milestones, risks, RFIs, submittals, meeting logs, site reports, punch lists, closeout packages, and capital plan rollups.
> - Distinguish:
>   - transactional records
>   - derived snapshots
>   - audit artifacts
>   - external-system mirrors
>
> 3. Best-practice controls and governance
> - Describe approval gates, segregation of duties, threshold-based approvals, contingency controls, budget-to-forecast reconciliation, payment validation, change-order governance, schedule-variance escalation, document version control, and executive reporting controls.
> - Explain what would be considered table stakes for institutional clients versus differentiated capability.
>
> 4. Integration expectations
> - Identify which external systems normally matter most in real-world PDS delivery (for example: ERP, accounting, project management, procurement, document systems, e-mail, spreadsheets).
> - Focus on what the software must normalize from those systems instead of assuming the platform replaces everything immediately.
> - Recommend a phased integration strategy for a v1 product.
>
> 5. Practical software product shape
> - Convert the operating model into product modules and workflows.
> - Separate:
>   - must-have v1 modules
>   - phase-2 modules
>   - later enterprise modules
> - For each module, describe:
>   - user jobs-to-be-done
>   - minimum viable data structures
>   - minimum viable APIs
>   - minimum viable UI surfaces
>   - critical audit and compliance needs
>
> 6. Explicit mapping back to this repo
> - Based on the architecture below, recommend where each major capability should live:
>   - `repo-b/db/schema/*.sql` for canonical schema
>   - `backend/app/schemas/*.py` for request/response contracts
>   - `backend/app/routes/*.py` for APIs
>   - `backend/app/services/*.py` for domain logic and deterministic engines
>   - `repo-b/src/app/lab/env/[envId]/pds/*` for the environment-scoped operational PDS workspace
>   - `repo-b/src/app/app/*` or shared Business OS areas for broader cross-business dashboards when appropriate
>   - `repo-b/src/components/*` for reusable UI modules
>   - `repo-b/src/lib/bos-api.ts` for frontend API bindings
>   - `docs/*` for durable product and implementation specs
> - Be specific about what should remain in the current PDS workspace versus what should become shared cross-domain platform infrastructure.
>
> 7. Implementation sequencing
> - Propose a phased roadmap:
>   - Phase 1: highest-leverage work to make the current PDS prototype materially more credible
>   - Phase 2: operational depth and controls
>   - Phase 3: integrations, analytics, and enterprise governance
> - Include dependencies, risk, and what should not be built too early.
>
> 8. Output format
> Provide:
> - an executive summary
> - a lifecycle map
> - a capability matrix
> - a canonical data model proposal
> - a control matrix
> - a module-by-module software blueprint
> - a phased implementation roadmap
> - a "map to current repo" section
> - a "minimum credible PDS v1" recommendation
> - a list of open questions and assumptions that should be resolved before implementation
>
> Quality bar:
> - Be concrete, not aspirational.
> - Prefer operational reality over marketing language.
> - Call out where firms like JLL typically provide service through process discipline and reporting rigor rather than unique software.
> - Distinguish owner-rep workflows from general contractor workflows where relevant.
> - Distinguish what should be system-of-record data versus generated narratives or AI recommendations.
> - If there are multiple valid approaches, present the tradeoffs and recommend one.

## Specific Research Questions To Prioritize

The deep research should spend extra attention on these questions because they will directly affect implementation here.

### 1. What is the minimum credible institutional PDS core?

We already have budget, schedule, risk, and basic reporting primitives. Identify which missing capabilities make the largest jump in credibility:

- approval routing and delegated authority
- cost-code normalization and crosswalks
- contract and vendor compliance
- RFI and submittal control
- executive portfolio rollups
- document linkage and version-aware decision support
- issue, action-log, and meeting-cadence discipline

### 2. What belongs in the first serious data model expansion?

The existing `272_pds_core.sql` schema is a start. Research should recommend the next tables and relationships to add first, with emphasis on:

- portfolio/program/project hierarchy depth
- approval policy and approval action tables
- vendor master and compliance records
- schedule tasks or dependency structures beyond milestone-only tracking
- RFI and submittal lifecycles
- action items, meeting logs, and decision records
- closeout and turnover artifacts

### 3. What should be deterministic engines in this repo?

This codebase already prefers deterministic snapshot engines. Research should identify where that pattern should continue:

- budget state rollups
- forecast variance rollups
- schedule health scoring
- risk exposure scoring
- vendor performance scoring
- portfolio health scoring
- threshold-based exception generation
- report-pack assembly

And where it should not be overused:

- narrative explanation
- low-confidence reconciliation
- external-source interpretation
- subjective risk commentary

### 4. What should remain environment-scoped versus move into shared Business OS?

The product currently has a lab-style environment workspace. Research should explicitly recommend:

- which day-to-day PDS workflows stay in `/lab/env/[envId]/pds`
- which cross-portfolio / executive / admin workflows should become broader Business OS surfaces
- which controls should be shared platform primitives used by multiple domains, not PDS-only logic

## Expected Mapping Back Into This Repo

When the research comes back, assume implementation will likely land in these places.

### Database and canonical model

Most net-new durable business entities should land as new numbered SQL files in:

- `repo-b/db/schema/`

Likely categories:

- core PDS transactional tables
- approval and governance tables
- vendor/compliance master data
- rollup and reporting support tables
- shared cross-domain control tables if the pattern is reusable beyond PDS

### Backend APIs and domain logic

Most PDS service expansion should land in:

- `backend/app/schemas/pds.py`
- `backend/app/routes/pds.py`
- `backend/app/services/pds.py`
- `backend/app/services/pds_engines.py`

Additional backend modules will likely be warranted once scope grows, for example:

- `backend/app/services/pds_approvals.py`
- `backend/app/services/pds_ingestion.py`
- `backend/app/services/pds_reporting.py`
- `backend/app/services/pds_integrations.py`

If the research surfaces capabilities that are reusable across domains, they should be factored into shared services rather than embedded only in PDS.

### Frontend experience

The current operational workspace will likely expand inside:

- `repo-b/src/app/lab/env/[envId]/pds/`

Likely UI additions:

- project war room depth
- approval inboxes
- change-order workbench
- schedule and risk drill-downs
- vendor and contract views
- RFI/submittal/action-log views
- report-pack and executive rollup surfaces

Reusable UI components should likely be introduced under:

- `repo-b/src/components/`

Frontend API bindings should likely extend:

- `repo-b/src/lib/bos-api.ts`

### Product docs and implementation specs

Research-driven design decisions should be documented in:

- `docs/pds-command.md`
- `docs/pds-replacement-gap-analysis.md`
- new targeted specs in `docs/` for approved module designs

## Deliverables I Want Back From Research

When you run this in ChatGPT, the returned research should be strong enough that we can turn it directly into implementation tickets. The response should ideally include:

1. A recommended target operating model for PDS in software terms.
2. A list of the most important missing modules, ranked by impact.
3. A proposed canonical data model expansion, including table families and relationships.
4. A recommended approval and controls framework.
5. A recommended KPI and executive reporting framework.
6. A module-by-module product map tied to actual user roles.
7. A phased build plan that respects the current repo architecture.
8. Clear statements of what should be shared infrastructure versus PDS-specific logic.

## Anti-Goals

The research should avoid:

- generic proptech trend summaries
- construction-tech vendor lists without operating-model implications
- AI-heavy concepts that bypass core controls
- greenfield advice that ignores the current prototype
- assuming the platform instantly replaces ERP, accounting, or full PMIS systems
- recommending features without specifying the operating need they support

## Working Assumptions

Use these assumptions unless the research strongly justifies changing them:

- This platform should function as a governed operating layer, not just a dashboard.
- The system should preserve deterministic, auditable calculations where possible.
- AI should assist with summarization, triage, and explanation, but not silently replace financial or approval controls.
- Early value should come from stronger process discipline, clearer rollups, and reliable exception handling before heavy integrations.
- The current prototype should be extended incrementally, not discarded.

## After Research Returns

Once the deep research is complete, the next step in this repo should be to convert the returned material into:

1. a prioritized implementation roadmap
2. specific schema/API/UI tickets
3. a proposed first expansion of the current PDS module
4. a decision on which PDS controls become shared Business OS primitives

