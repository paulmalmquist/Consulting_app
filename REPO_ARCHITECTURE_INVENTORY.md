# BusinessMachine Repository Architecture Inventory

Generated: 2026-02-23  
Scope: Full repository inventory of backend, frontend, services, tooling, and platform functionality.

## 1) Repository Overview

This repository is a multi-application platform with three primary runtime services plus supporting tooling:

- `backend/`: Business OS API and MCP server (FastAPI, PostgreSQL/Supabase integration).
- `repo-b/`: Main web frontend (Next.js 14) for both Business OS and Demo Lab surfaces.
- `repo-c/`: Demo Lab backend API (FastAPI) with environment-scoped schemas and AI-assisted workflows.
- `excel-addin/`: Office Excel add-in that connects spreadsheet workflows to Demo Lab and backend APIs.
- `orchestration/`: Execution governance framework for controlled Codex/task execution.
- `scripts/`: Dev bootstrap, smoke tests, sidecar, and operational scripts.
- `docs/`: Architecture, security, MCP, and domain-specific documentation.
- `supabase/`: SQL/migrations and database support assets.

## 2) Top-Level Architecture

## Runtime Services and Default Local Ports

- Business OS backend: `http://localhost:8000`
- Demo Lab backend: `http://localhost:8001`
- Frontend (Next.js): `http://localhost:3001`
- Optional AI sidecar: `http://localhost:7337`

## High-Level Request Topology

1. User interacts with Next.js frontend (`repo-b`).
2. Frontend routes either:
   - call Business OS backend (`backend`) for `/api/*` capabilities, or
   - call Demo Lab backend (`repo-c`) through `/v1/*` proxy paths, with local fallback in some handlers.
3. Backend services execute deterministic business logic, DB operations, document workflows, extraction, reporting, and domain analytics.
4. Optional AI sidecar is used for local AI-assisted ask/code flows.
5. MCP tooling exposes controlled operational primitives (business provisioning, docs, executions, work items, repo/git/env/report ops).

## 3) Backend Inventory (`backend/`)

## Core Stack

- Framework: FastAPI
- DB access: psycopg + SQL in service modules
- Config: environment-driven with startup validation
- Key entrypoint: `backend/app/main.py`

## Cross-Cutting Backend Capabilities

- Structured request logging with request/run IDs.
- Request context propagation for observability.
- JSON error handling and explicit exception mapping.
- AI ask/code endpoints with local sidecar integration.
- Retrieval over repository snippets with allow/deny guardrails.
- Document extraction pipeline with schema validation and OCR fallback.

## Backend API Domains (Primary `/api/*` Surface)

### Platform and Provisioning
- Health checks.
- Business template catalog.
- Business create/get/list.
- Department/capability enablement (template-based or custom).

### Documents
- Initialize upload metadata.
- Complete upload/version finalization.
- List documents and versions.
- Generate download metadata/URLs.
- Tagging controls.

### Executions
- Trigger capability executions (dry-run/real run modes in tooling paths).
- Execution listing and detail retrieval.

### Finance v1 Domain (`/api/fin/v1`)
- Generic run submission/result retrieval framework.
- Real estate private equity style entities:
  - funds, participants, commitments, capital calls, assets
  - contributions/distributions
  - waterfall and capital rollforward
- Legal matter economics:
  - matter financials, trust transactions, contingency support
- Healthcare operations finance:
  - MSO/clinic/provider structures, compensation runs, claims/denials
- Construction finance:
  - budgets, versions, change orders, forecast runs
- Scenarios:
  - snapshots, partition handling, simulation diffs

### Reporting and Metrics
- Business/readiness/compliance/execution/reporting views.
- Report definitions (create/list/get), run, and lineage explanation.
- Semantic metrics definitions and query APIs.
- Task metrics endpoints.

### CRM
- Accounts, opportunity stages, opportunities, activities.

### Work Management
- Work item create/list/filter/detail.
- Comments, status transitions, resolution workflows.

### Tasks Module
- Projects/boards/issues/sprints/analytics APIs.
- Development seed helper endpoints.

### Compliance and Controls
- Controls status.
- Evidence exports.
- Access review/signoff.
- Backup verification checks.
- Incident and timeline records.
- Config/deployment change logs.
- Event audit log access.

### Underwriting and Real Estate
- Underwriting contracts/runs/scenarios/report artifacts.
- Research ingest and citation-aware processing.
- Real estate special servicing:
  - trusts, loans, surveillance snapshots
  - underwrite runs, workout cases/actions, events
- REPE object model and context management:
  - funds/deals/assets/entities/ownership
  - context bootstrap/init + health/seed
- RE analytics endpoints:
  - valuation, waterfall, stress/refi, surveillance, Monte Carlo, risk score/report generation

### Demo-Lab-Compatible `/v1/*` Routes in Backend
- Compatibility/lab routes also exist in backend for shared or staged transitions.

## Backend Services Layer

Service modules in `backend/app/services/` are segmented by domain. Notable groups:

- Finance runtime and domain-specific engines.
- Underwriting service pipeline and report assembly.
- REPE context resolution and business auto-binding behavior.
- Extraction orchestration + evidence mapping.
- Reporting materialization and explainability hooks.

## MCP Server (Inside `backend/`)

The backend contains an MCP server implementation with:

- stdio JSON-RPC server runtime
- registry-based tool registration
- auth checks
- rate limiting
- audit logging wrappers

Exposed MCP tool families include:

- System: health, describe system, list tools
- Business provisioning/configuration
- Documents lifecycle
- Execution run/list/get
- Work item management and audit retrieval
- Repo search/read
- Environment variable get/set
- Git diff/commit
- Frontend run/edit helpers
- Direct API calls and DB upsert (allowlisted)
- Codex task delegation
- Metrics and report operations

## Backend Testing

`backend/tests/` includes broad coverage across:

- API domain behavior
- finance/repe/underwriting logic
- tasks/reporting/compliance paths
- extraction flows
- MCP contracts/rate limiting/auditing
- orchestration policy and integration checks

## 4) Frontend Inventory (`repo-b/`)

## Core Stack

- Next.js 14 (App Router), TypeScript, Tailwind
- Middleware-gated auth and route protection
- Shared component system for both Lab and Business OS experiences

## Frontend App Surfaces

### Public/Access
- `/`
- `/public`
- `/public/onboarding`
- `/login`

### Demo Lab UX
- `/lab/environments`
- `/lab/env/[envId]`
- capability/department pages
- pipeline board
- upload/chat/audit/metrics views

### Business OS UX
- `/app` shell + capability navigation
- `/onboarding` template/custom provisioning
- `/documents`
- `/tasks` + project/analytics pages
- CRM/compliance/dashboard pages
- reports pages
- finance workspaces (REPE, healthcare, legal, construction, underwriting, scenarios)
- real estate and servicing pages

## Middleware/Auth and Access Boundaries

`src/middleware.ts` enforces:

- invite-code/session cookie auth for protected app surfaces
- private API protection for command/mcp/codex endpoints
- public-only access for designated routes under `/api/public`

## Frontend API Route Handlers

### Auth and Session
- login/logout handlers

### Command Orchestration
- plan/confirm/execute endpoints
- run status and cancellation endpoints

### MCP-Adjacent Context
- context snapshot and planning endpoints

### AI Sidecar Bridge
- codex health/run/stream/cancel routes

### Public Assistant Boundary
- public assistant health/ask with mutation-intent blocking
- onboarding lead capture route

### Demo Lab Proxy/Fallback Layer
- `/api/v1/*` handlers for environments/pipeline/queue/chat/audit/metrics/upload
- generic proxy route for `/v1/*`
- fallback behavior when upstream unavailable

### Backend Proxy Helpers
- tasks proxy (`/api/tasks/*`)
- metrics proxy (`/api/metrics`)

## Frontend Data/Client Libraries

- `src/lib/bos-api.ts`: typed client for Business OS APIs across business/docs/executions/finance/reports/re/crm/etc.
- `src/lib/api.ts`: Demo Lab `/v1` wrapper with request-id propagation.
- `src/lib/tasks-api.ts`: task/project/issue/sprint client.
- `src/lib/pipeline-api.ts`: pipeline board/stage/card operations.
- `src/lib/repe-context.ts`: REPE environment-to-business context resolver/init.
- `src/lib/business-context.tsx`: current business/department/capability context provider.

## Frontend Command Execution Engine

Natural-language command workflow is implemented in:

- `src/lib/server/commandOrchestrator.ts`
- `src/lib/server/commandOrchestratorStore.ts`

Capabilities include:

- intent parsing (environment, task, business/template, health operations)
- risk classification and clarifications
- confirmation token lifecycle with TTL
- stepwise execution + verification capture
- run/audit storage in memory

## Frontend Component/UX Architecture

- App shell frameworks for Lab and Business OS.
- Global command bar and execution timeline components.
- Domain-rich UI for tasks, REPE workflows, reporting, and finance operations.

## Frontend DB Tooling

`repo-b/db/schema/` provides:

- canonical SQL bundle
- apply tooling with dry-run/transaction controls
- verify tooling (tables, RLS, traceability columns, views/functions, seed assertions)

## Frontend Testing

- Unit: Vitest (`src/**/*.test.ts(x)`)
- E2E: Playwright (desktop + mobile profiles)
- Additional smoke/regression scripts integrated in root scripts

## 5) Demo Lab Backend Inventory (`repo-c/`)

## Core Stack

- FastAPI service
- Supabase/Postgres-backed storage
- Env-scoped schema model (`env_<id>`)
- OpenAI/Anthropic support with deterministic fallback in LLM/embedding layer

## Functional Domains (`/v1/*`)

- Health.
- Environment lifecycle:
  - list/create/update/delete/reset
- Pipeline:
  - environment board reads, global pipeline views
  - stage transitions, pipeline item/card management
- Documents:
  - upload/list docs
  - text chunking and embedding persistence
- Chat:
  - retrieval-augmented responses over document chunks
  - optional structured action execution
- HITL queue:
  - queue listing and human decision endpoints
- Audit logs.
- Metrics.

## Data and Behavior Support Modules

- `app/db.py`: extension/table ensure, schema creation, seed/bootstrap routines.
- `app/actions.py`: safe action execution and audit records.
- `app/llm.py`: provider routing + fallback behavior.
- `app/text.py`: chunking/tokenization helpers.
- `app/storage.py`: Supabase client access.

## Excel API Support (`repo-c/app/excel_api.py`)

Bearer-key protected endpoints for Excel add-in workflows:

- session init/complete + identity
- schema/entity introspection
- query/upsert/delete
- metric endpoints
- audit read/write

Includes:

- identifier safety checks
- schema/entity resolution across shared and env schemas
- typed coercion
- write audit trails

## Repo-c Tests and Migrations

- pytest coverage for config, actions, llm/text, excel APIs, and smoke.
- migrations include pipeline/industry-type support and Excel API metadata additions.

## 6) Excel Add-in Inventory (`excel-addin/`)

## Purpose

Bridges spreadsheet workflows with platform data and actions.

## Key Capabilities

- Task pane UI for auth/session, API URL config, env binding, schema browser.
- Pull/push data operations and sync queue controls.
- Write-mode and safety gating.
- Pipeline and audit visibility from Excel.

## Custom Functions Namespace

`BM.*` functions include:

- environment helpers
- pull/query/lookup operations
- metric access
- pipeline stage reads
- push/upsert helpers

## Technical Notes

- Office add-in runtime + webpack build.
- Jest test support.
- shared libs for cache/storage/write replay and workbook integration.

## 7) Orchestration and Governance (`orchestration/` + scripts)

## Purpose

Provides controlled, auditable execution workflows for agentic/codex operations.

## Main Components

- intent classification and risk scoring
- scope enforcement
- branch/worktree isolation
- model routing
- execution pipeline and rollback/guard checks
- parallel validation
- hash-chained logging for integrity

## CLI Entry

`scripts/codex_orchestrator.py` supports:

- session create/show/validate
- plan
- run
- validate-parallel
- merge-gate
- log show/verify-chain

## Risk/Approval Controls

- explicit approval phrases for risky execution paths
- high-risk pattern detection (deletions/env/orchestrator self-change/drop schema patterns)
- enforced constraints with rollback on policy violations

## 8) Scripts and Ops Tooling

## Dev and Bootstrap

- `dev.sh`: starts multi-service local stack.
- `Makefile`: orchestrates dev/test/lint/format/db/orchestration/smoke tasks.

## Operational Scripts

- `scripts/bmctl`: control-plane utility for environment/business operations.
- AI sidecar scripts (start/check/local runtime).
- smoke/regression suites:
  - command lifecycle
  - public/private API separation
  - MCP smoke
  - underwriting and REPE flows

## Deployment Assets

- Dockerfiles for backends and sidecar.
- Railway/TOML deployment descriptors for multiple services.

## 9) Data and Persistence Model (Cross-Service)

## Core Patterns

- Postgres/Supabase as primary persistence backbone.
- Business OS backend: centralized domain tables and services.
- Demo Lab backend: platform tables + per-environment schemas.
- Frontend routes act as a policy/proxy boundary for browser clients.

## Document and Extraction Data Flow

1. Upload initialized via metadata endpoint.
2. Storage upload completed/versioned.
3. Extraction runs process document content into structured outputs and evidence links.
4. Results become queryable for downstream workflows/reporting.

## AI and Retrieval Flow

1. Content chunks or repository snippets are indexed/selected.
2. Retrieval selects relevant context with guardrails.
3. Ask/code endpoints call sidecar/provider APIs.
4. Actionable outputs can route into command/execution workflows.

## 10) Security, Policy, and Audit Posture

## Implemented Controls (Inventory-Level)

- protected route middleware in frontend
- request IDs and structured logs
- MCP auth/rate limit/audit wrappers
- allowlisted DB upsert surfaces
- explicit confirmation requirements for write operations in MCP/backend tooling
- public/private API boundary split in frontend
- orchestration risk checks and approval phrases

## Compliance-Related Assets

- control matrix and SOC2 gap docs
- security architecture documentation
- execution lineage and explainability in reporting paths

## 11) Testing and Quality Posture

## Coverage Breadth

- backend unit/integration coverage across major domains
- frontend unit + E2E coverage (desktop/mobile)
- repo-c API and module tests
- orchestration and MCP smoke/regression coverage

## Practical Quality Signals

- explicit smoke scripts for critical flows
- verify scripts for schema correctness and policy constraints
- modular domain services with test-targeted boundaries

## 12) Functional Inventory Summary (What the Platform Does)

The platform currently supports:

- Multi-tenant business provisioning via templates and custom capability selections.
- Department/capability operation model with execution tracking.
- Document ingestion, versioning, extraction, and evidence-linked outputs.
- Task/project/issue/sprint management with analytics.
- CRM opportunity and activity tracking.
- Finance engines across REPE, legal, healthcare, construction, and scenario simulation.
- Real estate workflows including underwriting, surveillance, workout actions, and RE analytics.
- Reporting and semantic metrics with run lineage and explainability.
- Demo Lab environment lifecycle, pipeline management, doc chat/RAG, HITL queue, and audit metrics.
- Excel add-in integration for spreadsheet-native querying, metrics, and controlled writes.
- MCP-enabled operational tooling for safe automation and agent workflows.

## 13) Important Documents to Read Next

- `README.md` (root platform overview)
- `backend/README.md` (backend setup and API details)
- `repo-b/README.md` (frontend setup and architecture)
- `repo-c/README.md` (Demo Lab backend setup and capabilities)
- `docs/LOCAL_DEV_PORTS.md` (service map/proxy behavior)
- `docs/MCP_SETUP.md` (MCP integration and tool surface)
- `docs/security-architecture.md` (security control architecture)
- `docs/underwriting_pipeline.md` and `docs/real_estate_wedge_demo.md` (domain flows)

