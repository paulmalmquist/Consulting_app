# AI Architecture And Workflows

## Purpose

This document is a repo-grounded map of the AI-related architecture in this monorepo.

It is meant to be used as input to deep research, architecture review, and product hardening work. It does not assume there is one app, one backend, or one assistant path. That assumption is wrong in this repository.

## Executive Summary

The repo contains multiple distinct AI systems:

1. `repo-b` Winston command bar and UI shell.
2. `backend` production AI Gateway for conversational copilot, tool-calling, and RAG.
3. `backend` MCP tool registry and audited tool execution layer.
4. `repo-b` deterministic plan/confirm/execute command orchestrator.
5. `repo-c` separate Demo Lab upload + RAG chat backend.
6. `backend` niche AI workflows like PDS executive narrative generation.
7. `repo-b` public assistant route that is advisory and effectively template-driven.
8. `scripts/ai_sidecar.py` plus `orchestration/` for local Codex-side workflows.

The most important architectural fact is that these systems overlap in UI and branding but are not one coherent runtime. Winston is a family of adjacent systems, not a single pipeline.

## Repo Surface Map

| Surface | Directory | Runtime | Main AI Role |
| --- | --- | --- | --- |
| Main UI | `repo-b/` | Next.js 14 App Router | Winston shell, command bar, AI proxy routes, deterministic command planner UI |
| BOS backend | `backend/` | FastAPI + psycopg | AI Gateway, RAG indexing/retrieval, MCP tools, conversation persistence, logs |
| Demo Lab backend | `repo-c/` | FastAPI + psycopg | Demo upload + doc chunking + simple RAG chat |
| Local sidecar | `scripts/ai_sidecar.py` | FastAPI script | Local-only Codex bridge for developer/operator workflows |
| Orchestration | `orchestration/` | Python library + CLI | Controlled Codex session orchestration, scope/risk/logging |
| SQL source of truth | `repo-b/db/schema/` | ordered SQL | Canonical schema, including current `rag_chunks` table |

## Canonical Production Copilot Path

### High-level flow

```text
User in repo-b Winston shell
  -> repo-b builds context envelope from route, env, page entity, visible data, session
  -> POST /api/ai/gateway/ask on repo-b
  -> repo-b Next route proxies to backend /api/ai/gateway/ask
  -> backend resolves scope and route lane
  -> backend optionally retrieves RAG chunks
  -> backend calls OpenAI with MCP tools exposed as function tools
  -> backend executes tools through audited MCP registry
  -> backend streams SSE events back to repo-b
  -> repo-b assembles tokens, tool events, citations, and trace in the UI
```

### Key files

- `repo-b/src/components/commandbar/GlobalCommandBar.tsx`
- `repo-b/src/lib/commandbar/contextEnvelope.ts`
- `repo-b/src/lib/commandbar/assistantApi.ts`
- `repo-b/src/app/api/ai/gateway/ask/route.ts`
- `backend/app/routes/ai_gateway.py`
- `backend/app/services/ai_gateway.py`
- `backend/app/services/assistant_scope.py`
- `backend/app/services/request_router.py`

### Context model

The conversational assistant is context-first, not stateless:

- Session layer: actor, roles, org/business, default env.
- UI layer: route, module, active environment, active business, page entity, visible records.
- Thread layer: conversation ID, assistant mode, scope type, scope ID, launch source.

This context is normalized in `backend/app/services/assistant_scope.py`, which resolves the effective scope in this order:

1. Explicit entity named by the user if it matches visible/page entities.
2. Selected or page entity for deictic prompts like "this fund".
3. Active environment from UI.
4. Thread scope.
5. Session default environment.

### Request routing and lane model

`backend/app/services/request_router.py` classifies requests into lanes:

- Lane A: visible-context or identity style questions.
- Lane B: simple lookup.
- Lane C: analytical or write flows.
- Lane D: deep reasoning / agentic style requests.

Each lane sets:

- model choice
- max tool rounds
- rag usage
- rerank/hybrid flags
- history budget
- reasoning effort

Important nuance: the code comments describe Lane A as near-zero-latency and possibly no-LLM, but the current implementation still sends Lane A requests through the LLM. Lane A currently means "no tools/no RAG", not "no model call".

### Model dispatch

`backend/app/services/model_registry.py` centralizes per-model capability handling:

- GPT-5 and o-series: reasoning effort supported, no temperature.
- GPT-4o family: temperature and `max_tokens`.
- Unknown model names fall back to conservative settings.

The gateway also supports fallback model retry behavior via `OPENAI_CHAT_MODEL_FALLBACK`.

### Tool-calling

The AI Gateway exposes MCP tools to OpenAI as function tools. Tool definitions are registered at backend startup in `backend/app/main.py` by calling `backend/app/mcp/server.py:_register_all_tools()`.

Tool categories include:

- business
- documents
- executions
- work
- repo
- env
- git
- frontend
- API proxy
- database
- metrics
- reports
- RE model
- RAG
- REPE portfolio tools

Every tool execution flows through `backend/app/mcp/audit.py`, which:

- validates inputs
- checks write permissions
- executes the tool
- persists an audit record
- fails closed if audit persistence fails on a successful write

### Conversation persistence

Conversation state is persisted in backend tables:

- `ai_conversations`
- `ai_messages`
- `ai_gateway_logs`

The gateway stores both user messages and assistant messages, and it enriches assistant history with pending-confirmation notes so the next turn can resume write flows.

## Document Upload And RAG Indexing

### Canonical production path

```text
repo-b upload flow
  -> backend document routes create metadata + storage references
  -> file binary lives in Supabase Storage
  -> caller hits /api/ai/gateway/index
  -> backend downloads file from Supabase Storage
  -> backend extracts text
  -> backend chunks + embeds + writes rag_chunks
```

### Key files

- `backend/app/routes/documents.py`
- `repo-b/src/app/api/ai/gateway/index/route.ts`
- `backend/app/routes/ai_gateway.py`
- `backend/app/services/text_extractor.py`
- `backend/app/services/rag_indexer.py`
- `repo-b/db/schema/316_rag_vector_chunks.sql`

### Current extraction support

`backend/app/services/text_extractor.py` supports:

- PDF
- DOC/DOCX
- XLS/XLSX
- CSV
- plain text / markdown fallback

### Current chunking strategy

`backend/app/services/rag_indexer.py` uses parent/child chunk groups:

- parent chunks for broader context
- child chunks for embedding search
- each child points to a parent chunk

Retrieval returns the parent text when useful, which is a good design for context recovery.

### Canonical vector store

The canonical current table is `rag_chunks`.

This is different from older/demo systems that use:

- `app.document_chunks`
- `kb_*`
- Demo KB flows in `backend/app/services/winston_demo.py`

If research or enhancement work is about the current AI Gateway, `rag_chunks` is the correct target.

## Retrieval, Reranking, And Answer Assembly

### Retrieval flow

`backend/app/services/ai_gateway.py` optionally calls `semantic_search()` with:

- business scope
- optional environment scope
- optional entity scope
- optional hybrid mode
- optional overfetch for reranking

`backend/app/services/rag_indexer.py` then:

1. checks whether pgvector is available
2. runs cosine search if vector exists
3. runs FTS if hybrid or vector unavailable
4. merges with reciprocal rank fusion when hybrid is active
5. boosts scores for current entity/env matches
6. deduplicates by section

### Query expansion

`backend/app/services/query_rewriter.py` can generate alternate phrasings for retrieval. This is the only pipeline feature flag that is clearly wired end-to-end today.

### Reranking

`backend/app/services/rag_reranker.py` supports:

- Cohere rerank
- LLM rerank fallback
- timeout-based degradation back to input order

### Answer assembly

The gateway builds the model prompt from:

- system/developer prompt
- resolved application context block
- optional visible-context instructions
- optional RAG snippets
- recent conversation history
- current user message

It then streams SSE events:

- `context`
- `status`
- `token`
- `citation`
- `tool_call`
- `tool_result`
- `confirmation_required`
- `done`

## Deterministic Command Planner And Execution Engine

This is separate from the conversational AI Gateway and should be treated as its own subsystem.

### What it is

The Winston shell supports command-like workflows with plan -> confirm -> execute stages. This path is not LLM-driven. It is a rule-based parser plus step planner inside `repo-b`.

### Key files

- `repo-b/src/lib/server/commandOrchestrator.ts`
- `repo-b/src/lib/server/commandOrchestratorStore.ts`
- `repo-b/src/lib/server/mcpContext.ts`
- `repo-b/src/app/api/mcp/context-snapshot/route.ts`
- `repo-b/src/app/api/mcp/plan/route.ts`
- `repo-b/src/app/api/commands/plan/route.ts`
- `repo-b/src/app/api/commands/confirm/route.ts`
- `repo-b/src/app/api/commands/execute/route.ts`

### What it currently does

It parses a small catalog of commands such as:

- list/create/update/delete environments
- create tasks
- list templates
- list departments
- create businesses
- health checks

The parser is regex/rule-based and maps requests to a fixed tool catalog and verification steps.

### Important architecture note

This engine is not backed by the backend AI Gateway. It is its own control plane with:

- local plan generation in `repo-b`
- confirmation tokens
- run polling
- audit events
- verification records

### Important storage note

`repo-b/src/lib/server/commandOrchestratorStore.ts` is an in-memory store. Plans, runs, and confirmation tokens are process-local and ephemeral.

That is acceptable for local development and weak for distributed/serverless production semantics.

## MCP Tooling Layer

The MCP server is both:

1. a stdio server for external agents
2. the internal tool registry used by the production AI Gateway

### Key files

- `backend/app/mcp/server.py`
- `backend/app/mcp/registry.py`
- `backend/app/mcp/audit.py`
- `backend/app/mcp/tools/*.py`
- `docs/MCP_SETUP.md`

### Important behaviors

- write tools require `ENABLE_MCP_WRITES=true`
- audit persistence is mandatory
- rate limits exist
- path allowlists and deny globs exist
- REPE tools can auto-resolve IDs from assistant scope

### REPE-specific assistant tooling

`backend/app/mcp/tools/repe_tools.py` gives Winston structured access to:

- funds
- deals/investments
- assets
- environment snapshot
- create fund/deal/asset flows with two-phase confirmation

This is the main structured data plane behind Winston portfolio questions.

## Demo Lab AI Path (`repo-c`)

This is a separate AI system, not the production AI Gateway.

### Flow

```text
repo-b Demo Lab pages
  -> Next /v1 proxy
  -> repo-c backend
  -> upload extracts text and writes schema-local doc_chunks
  -> /v1/chat embeds user query and retrieves top chunks
  -> repo-c calls OpenAI or Anthropic directly
```

### Key files

- `repo-c/app/main.py`
- `repo-c/app/llm.py`
- `repo-c/README.md`

### Important differences from production gateway

- uses per-environment schema-local `doc_chunks`, not `rag_chunks`
- simple top-k vector lookup, not the richer backend AI Gateway tool loop
- can fall back to hash embeddings when no API keys exist
- can fall back to a canned demo answer when no LLM is configured

This is useful for demos and dangerous if mistaken for production readiness.

## PDS Executive Narrative Generation

This is a narrower LLM workflow inside the backend.

### Key files

- `backend/app/services/pds_executive/narrative.py`

### Behavior

- gathers PDS metrics from SQL
- builds a non-technical executive communications prompt
- calls OpenAI directly
- applies blacklist terms as light guardrails
- falls back to deterministic templates if the LLM path fails

This does not route through the AI Gateway, so it does not inherit all gateway-level tracing, lane routing, or tool conventions.

## Public Assistant

There is also a public assistant route in `repo-b`:

- `repo-b/src/app/api/public/assistant/ask/route.ts`
- `repo-b/src/app/api/public/assistant/health/route.ts`

This is advisory-only and mostly structured/template-driven. It explicitly blocks mutation intent and returns architecture-oriented guidance.

This should not be described as the same thing as Winston copilot.

## Local Codex Sidecar And Controlled Orchestration

There is still a local-only Codex sidecar path:

- `scripts/ai_sidecar.py`
- `scripts/codex_orchestrator.py`
- `orchestration/`
- `docs/LOCAL_AI_SIDECAR.md`
- `orchestration/README.md`

This path is intended for developer/operator use, not end-user production AI.

It supports:

- Codex CLI execution
- session creation with scoped directories/tools
- intent/risk classification
- worktree isolation
- merge gating
- audit log chain verification

### Important drift note

`backend/app/routes/ai.py` now declares the old sidecar path deprecated and points users to `/api/ai/gateway/*`, but the sidecar scripts and docs still exist. That creates architecture drift and can confuse reviewers.

## Data Stores And Persistence Layers

### Production backend

- `app.documents`
- `app.document_versions`
- `app.document_entity_links`
- `rag_chunks`
- `ai_conversations`
- `ai_messages`
- `ai_gateway_logs`
- audit/event tables used by `app.services.audit`

### Demo backend

- `platform.environments`
- environment-specific schemas
- `{schema}.documents`
- `{schema}.doc_chunks`

### Frontend process-local state

- command plans/runs/confirm tokens in `commandOrchestratorStore`

## Authentication, Session, And Scope

### Main app

`repo-b` uses cookie-based session context, centered around:

- `bos_session`
- `repo-b/src/middleware.ts`
- `repo-b/src/lib/server/sessionAuth.ts`

Protected areas include:

- `/lab/*`
- `/app/*`
- `/documents/*`
- `/tasks/*`
- `/api/commands/*`
- `/api/mcp/*`
- `/api/ai/gateway/*`

### Assistant scope assumptions

The assistant assumes:

- application UI is a primary source of truth
- business/env IDs should not be asked for if already present in context
- visible UI data can short-circuit tool usage
- entity resolution should prefer active page context

This is directionally strong and materially better than a generic chatbot model.

## Observability, Audit, And Evaluation

### Logging and traces

- `backend/app/observability/logger.py`
- `backend/app/services/langfuse_client.py`
- `backend/app/services/ai_gateway_logger.py`

The gateway records:

- resolved context
- route lane
- model
- tool calls/results
- citation set
- prompt/completion/cached token counts
- cost estimates
- elapsed times and TTFT

### Audit

MCP tool calls and gateway requests are audited via backend services.

### Tests and eval coverage

Relevant test areas:

- `backend/tests/eval/test_rag_retrieval.py`
- `backend/tests/eval/test_tool_selection.py`
- `backend/tests/eval/test_answer_faithfulness.py`
- `backend/tests/test_mcp_smoke.py`
- `backend/tests/test_mcp_registry.py`
- `backend/tests/test_ai.py`

Coverage exists, but most of it is mocked/unit-oriented rather than live end-to-end evaluation against real retrieval corpora and live platform data.

## Architectural Strengths

### 1. Context-first assistant design

The context envelope and scope resolver are among the strongest pieces of the architecture. They reduce the common failure mode where assistants ask for IDs or ignore the current UI.

### 2. Structured tool access with audit

The MCP registry plus audit wrapper creates a strong foundation for controlled tool calling, especially for write operations.

### 3. RAG design is more serious than a toy implementation

Parent/child chunking, hybrid retrieval, metadata boosting, reranking, and SSE citation events show a meaningful attempt at robust retrieval.

### 4. Clear distinction between public, private, demo, and local-dev surfaces

Even though the repo is fragmented, those surfaces are at least partially isolated in code.

### 5. Command execution requires explicit confirmation

The plan/confirm/execute flow is a good safety posture for mutations.

## Major Pitfalls And Research Targets

### 1. There is no single canonical AI runtime

The repo has at least four partially overlapping AI execution models:

- production gateway
- deterministic command planner
- demo-lab chat
- local Codex sidecar/orchestrator

Research question:

- Should these remain intentionally separate, or should the repo converge on one assistant control plane with explicit adapters for demo and local-dev?

### 2. Winston shell conflates distinct systems in one UX

The same command bar UI can:

- talk to the conversational gateway
- generate a deterministic execution plan
- poll in-memory command runs

That is powerful, but it blurs product semantics and can mislead both users and reviewers.

Research question:

- Should conversational copilot and action orchestration be two explicit modes instead of one blended shell?

### 3. `repo-b` fallback to direct OpenAI can silently degrade behavior

`repo-b/src/app/api/ai/gateway/ask/route.ts` falls back to a direct OpenAI call when backend proxying fails.

That fallback does not provide:

- MCP tools
- RAG
- backend audit path
- normal lane behavior

It improves uptime but weakens determinism and can hide backend failures.

Research question:

- Should fallback be fail-open, fail-closed, or restricted to clearly labeled read-only mode?

### 4. Lane A is not actually "no model"

The router comments imply UI-known answers may skip heavy AI work, but the gateway still builds an LLM request even in Lane A.

This means:

- higher cost than implied
- higher latency than implied
- possible hallucination even when UI data is enough

Research question:

- Should Lane A become a true non-LLM formatter or direct-response path when visible context already answers the question?

### 5. Several AI feature flags are declared but not meaningfully implemented

In `backend/app/config.py` there are flags for:

- `ENABLE_STRUCTURED_RAG`
- `ENABLE_ANSWER_VERIFICATION`
- `ENABLE_CONTEXT_COMPRESSION`
- `ENABLE_SEMANTIC_CACHE`
- `ENABLE_ADAPTIVE_RETRIEVAL`
- `ENABLE_AGENTIC_EXECUTOR`

Only query expansion appears meaningfully wired. Others look aspirational or partial.

Research question:

- Which of these are real roadmap items, which are dead flags, and which should be removed to reduce architectural ambiguity?

### 6. Command orchestration state is in-memory

`commandOrchestratorStore.ts` stores plans, tokens, runs, and audits in a process-global map.

This creates major production risks:

- loss on restart
- no cross-instance consistency
- no multi-region safety
- weak observability for long-lived runs

Research question:

- Should command plans/runs move to durable SQL tables, Redis, or a workflow engine?

### 7. Documentation/runtime drift around the local sidecar

The old AI sidecar is deprecated at the backend route layer, but sidecar code and documentation remain active in the repo.

Research question:

- Should the local sidecar be formally retained as a developer feature, or archived and separated from product docs?

### 8. Production RAG indexing is synchronous and inline

The indexing endpoint downloads the document, extracts text, embeds, and writes chunks in one request path.

This can create:

- long request latency
- retry ambiguity
- poor operator visibility on partial failures
- coupling between upload UX and embedding availability

Research question:

- Should indexing move to an async job/queue model with status tracking, retries, and dead-letter handling?

### 9. Embedding fallbacks can mask broken environments

In the backend:

- no OpenAI key means zero-vector embeddings

In `repo-c`:

- no API key means hash embeddings and demo chat text

These are good for tests and bad for production detectability if not loudly surfaced.

Research question:

- Should non-production embedding fallbacks hard-fail outside local/test modes?

### 10. PDS narrative generation bypasses the gateway

This creates policy and observability inconsistency:

- separate prompt and call site
- separate fallback behavior
- weaker reuse of tracing/tooling conventions

Research question:

- Should all LLM generation paths route through a common gateway abstraction even if they do not need tools?

### 11. The repo still has split-brain API architecture

Some requests go:

- browser -> repo-b -> backend

Others go:

- browser -> repo-b route handler -> Postgres directly

Others go:

- browser -> repo-b -> repo-c

This is the root reason many assistants and developers get confused.

Research question:

- Should AI-adjacent data access be consolidated behind one backend, or is the current hybrid model an intentional performance tradeoff?

### 12. Evaluation is present but not yet strong enough for hard guarantees

The repo has eval tests, but they are mostly mocked and narrow:

- routing classification
- retrieval ordering
- query expansion behavior

It does not yet look like a full offline+online evaluation program for:

- grounding
- tool selection accuracy
- write safety
- regression across model swaps
- cost/latency budgets

Research question:

- What should the minimum release gate be for assistant quality before production changes?

## Suggested Enhancement Directions

### Short-term

1. Make one diagram and one README that explicitly labels:
   - production gateway
   - deterministic command orchestrator
   - demo-lab chat
   - local sidecar
2. Turn Lane A into a true no-tool, no-RAG, preferably no-LLM path when possible.
3. Decide whether backend failure should trigger silent OpenAI fallback or an explicit degraded-mode response.
4. Remove or implement dormant feature flags.
5. Mark demo-only and local-only AI paths more aggressively in code and docs.

### Medium-term

1. Move command plans/runs/confirm tokens to durable storage.
2. Move indexing to async jobs.
3. Standardize all LLM call sites behind a shared gateway/client abstraction.
4. Add end-to-end evals with seeded corpora and live canary checks.
5. Add explicit assistant capability metadata so the UI can explain what mode it is using.

### Long-term

1. Unify assistant governance across chat, command execution, narrative generation, and coding/agentic workflows.
2. Introduce a clearer control-plane/data-plane architecture:
   - context and policy layer
   - model routing layer
   - tool execution layer
   - storage/retrieval layer
   - observability/eval layer
3. Decide whether `repo-c` remains a permanent product surface or becomes clearly isolated demo infrastructure.

## Deep Research Prompt Seed

Use something close to the following:

```text
Analyze this monorepo AI architecture as a multi-runtime system, not a single assistant.

Focus on:
1. Production conversational copilot path in repo-b + backend AI Gateway.
2. MCP tool-calling model, audit guarantees, and write safety.
3. RAG indexing/retrieval architecture around rag_chunks.
4. Deterministic command plan/confirm/execute flow in repo-b.
5. Demo-lab AI path in repo-c and how it diverges from production.
6. Local Codex sidecar/orchestration path and whether it should remain.

Identify:
- architectural duplication
- hidden fallback behavior
- state management risks
- observability gaps
- evaluation gaps
- latency/cost bottlenecks
- security/governance concerns
- migration paths toward a cleaner assistant platform

Prioritize practical recommendations that can be phased in without breaking the current product.
```

## Bottom Line

The repo already contains strong building blocks:

- context-aware copilot inputs
- audited tool execution
- serious retrieval scaffolding
- guarded command execution

The main problem is not lack of capability. It is architectural fragmentation, drift between "current" and "legacy" paths, and a gap between planned AI platform features and what is actually wired in production today.
