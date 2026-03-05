# META PROMPT — Replace Codex CLI Sidecar with OpenAI Responses API + RAG + Remote MCP

_Generated 2026-03-05 from full repo analysis. Every file path, table name, and component reference below is real and verified against the codebase._

---

## SITUATION ASSESSMENT

This is **NOT a greenfield build**. The Winston platform already has significant AI and governance infrastructure. The refactor is a targeted replacement of a localhost Codex CLI sidecar with server-side OpenAI Responses API calls, while preserving and upgrading all existing governance.

### What already exists and MUST BE PRESERVED:

| Layer | What's There | Where |
|---|---|---|
| **MCP Server** | 14 registered tool groups, typed `ToolDef` registry, `McpContext` auth, audit wrapper, rate limiting, write-gating (`confirm=true`), PII redaction | `backend/app/mcp/server.py`, `registry.py`, `audit.py`, `auth.py`, `tools/*.py` |
| **Orchestration Engine** | Intent classification (8 categories), risk assessment (low/medium/high), plan→confirm→execute pipeline, git worktree isolation, scope enforcement, soft-delete ledger, JSON Schema contracts | `orchestration/engine/pipeline.py`, `contracts.py`, `intent.py`, `risk.py`, `scope.py`, `routing.py` |
| **Command Bar UI** | Full plan→confirm→execute flow with stages, conversation pane, approval panels, diagnostics, context snapshots, trace logging | `repo-b/src/components/commandbar/GlobalCommandBar.tsx`, `AssistantShell.tsx`, `ConfirmPanel.tsx`, `ExecutePanel.tsx`, `PlanPanel.tsx` |
| **Chat UI** | Session management, citations (`doc_id` + `chunk_id` + `snippet`), suggested actions, env-scoped message history | `repo-b/src/app/lab/chat/page.tsx` |
| **Document System** | Supabase Storage, versioning, entity linking (fund/deal/asset/pds_project/credit_case/legal_matter), virtual paths per domain, audit events on attach | `backend/app/services/documents.py`, `routes/documents.py`, `schemas/documents.py` |
| **Audit System** | `system_audit_log` table (migration 291), `app.audit_log` table (migration 283), `audit_svc.record_event()` with actor/action/tool_name/success/latency/tenant/business scoping, PII redaction | `backend/app/services/audit.py`, `repo-b/db/schema/283_ecc_command_center.sql`, `291_winston_demo_kb.sql` |
| **Retrieval (basic)** | ripgrep-based codebase search returning `Snippet(path, start_line, end_line, text)`, deny-lists for `.env`/`node_modules`, augmented prompt builder with citations | `backend/app/ai/retrieval.py` |
| **Demo Lab RAG** | OpenAI embeddings + chat completions, Anthropic fallback, per-tenant DB schemas, action execution with audit | `repo-c/app/llm.py`, `config.py`, `db.py`, `actions.py` |

### What must be REMOVED (the Codex CLI sidecar pattern):

| Component | File | What It Does | Why It Must Go |
|---|---|---|---|
| `codexBridge.ts` | `repo-b/src/lib/server/codexBridge.ts` | HTTP client to localhost sidecar at `AI_SIDECAR_URL` (`:7337`). Sends `/ask` requests, fake-chunks responses into 140-char segments, manages in-memory run state | Only works locally (`AI_MODE=local`), disabled in production, no real streaming, no tool calling |
| `sidecar_client.py` | `backend/app/ai/sidecar_client.py` | Python `httpx` client to same localhost sidecar (`/v1/ask`, `/v1/code_task`) | Same localhost dependency, no production path |
| Codex API routes | `repo-b/src/app/api/ai/codex/run/route.ts`, `stream/route.ts`, `health/route.ts`, `cancel/route.ts` | Next.js API routes that proxy to sidecar, fake SSE by polling in-memory run store | Replaced by new AI Gateway routes |
| `codexRunStore.ts` | `repo-b/src/lib/server/codexRunStore.ts` | In-memory run state (breaks on Vercel because no shared memory between `/run` and `/stream`) | Replaced by server-side stateless streaming |
| `codex_tools.py` | `backend/app/mcp/tools/codex_tools.py` | MCP tool that shells out to `codex` CLI binary via `subprocess.run` | CLI binary not available in production |
| `assistantApi.ts` client | `repo-b/src/lib/commandbar/assistantApi.ts` | Client-side API wrapper with `USE_CODEX_SERVER` flag and mock state | Rewire to new gateway endpoints |
| Config flags | `AI_MODE`, `AI_SIDECAR_URL`, `AI_SIDECAR_TOKEN`, `USE_CODEX_SERVER` | Feature flags for the sidecar pattern | Replace with `AI_GATEWAY_URL` or remove |

---

## PRIMARY GOAL

Replace the localhost Codex CLI sidecar with a production-grade AI layer using the **OpenAI Responses API**, while preserving all existing MCP tools, orchestration governance, audit infrastructure, and UI patterns.

The assistant must work from anywhere (production Vercel + Railway), not just a developer laptop with Codex CLI installed.

---

## TARGET ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                                │
│  repo-b/src/                                                            │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────────────┐  │
│  │ Chat Page     │  │ Command Bar     │  │ Audit Log Viewer          │  │
│  │ (lab/chat)    │  │ (commandbar/)   │  │ (NEW: lab/ai-audit)       │  │
│  │ streaming +   │  │ plan→confirm→   │  │ filterable event log      │  │
│  │ citations +   │  │ execute flow    │  │ with tool call traces     │  │
│  │ tool status   │  │ (KEEP + rewire) │  │                           │  │
│  └──────┬───────┘  └──────┬──────────┘  └───────────────────────────┘  │
│         │                  │                                            │
│         ▼                  ▼                                            │
│  ┌──────────────────────────────────┐                                   │
│  │  /api/ai/gateway/*               │  ← NEW AI Gateway API routes     │
│  │  • POST /ask  (streaming SSE)    │    (replaces /api/ai/codex/*)     │
│  │  • POST /plan (orchestrated)     │                                   │
│  │  • POST /execute (approval-gated)│                                   │
│  │  • GET  /health                  │                                   │
│  └──────────────┬───────────────────┘                                   │
└─────────────────┼───────────────────────────────────────────────────────┘
                  │ server-side only (API keys never in browser)
                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI GATEWAY SERVICE                                    │
│  Can live in: Next.js API routes (repo-b) OR FastAPI (backend)          │
│  Recommended: FastAPI for compute-heavy + tool execution                │
│                                                                         │
│  Responsibilities:                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ Auth Validation  │  │ Prompt Assembly  │  │ Rate Limiting         │  │
│  │ (Supabase JWT +  │  │ (system prompt + │  │ (existing MCP_RATE_   │  │
│  │  env_id scoping) │  │  RAG context +   │  │  LIMIT_RPM infra)    │  │
│  │                  │  │  tool registry)  │  │                       │  │
│  └─────────────────┘  └──────────────────┘  └───────────────────────┘  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ OpenAI Responses │  │ Tool Dispatch    │  │ Audit + Logging       │  │
│  │ API Client       │  │ (MCP registry →  │  │ (audit_svc.record_   │  │
│  │ (streaming,      │  │  tool execution  │  │  event() for every   │  │
│  │  tool_use,       │  │  with existing   │  │  call + response)    │  │
│  │  file_search)    │  │  audit wrapper)  │  │                       │  │
│  └─────────────────┘  └──────────────────┘  └───────────────────────┘  │
│                                                                         │
│  Calls out to:                                                          │
│  ├─→ OpenAI Responses API (model inference + tool orchestration)        │
│  ├─→ OpenAI Vector Stores / file_search (managed RAG retrieval)         │
│  ├─→ MCP Tool Registry (existing: backend/app/mcp/registry.py)         │
│  └─→ PostgreSQL (existing: Supabase via psycopg v3)                    │
└─────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  RAG INDEXING PIPELINE (NEW)                             │
│                                                                         │
│  Trigger: document upload complete (after complete_upload in             │
│           backend/app/services/documents.py)                            │
│                                                                         │
│  Steps:                                                                 │
│  1. Download from Supabase Storage (using existing _storage repo)       │
│  2. Extract text (PDF → PyMuPDF/pdfplumber, DOCX → python-docx,        │
│     XLSX → openpyxl, TXT/MD/CSV → raw)                                 │
│  3. Chunk (fixed-size overlapping, ~800 tokens, 200 overlap)            │
│  4. Embed + store:                                                      │
│     Option A: OpenAI Vector Stores (managed, less ops)                  │
│     Option B: pgvector in Supabase (tenant-isolated, cost-controlled)   │
│  5. Store chunk metadata: document_id, version_id, business_id,         │
│     env_id, entity_type, entity_id, chunk_index, char_offset            │
│                                                                         │
│  NEW FILES:                                                             │
│  • backend/app/services/rag_indexer.py                                  │
│  • backend/app/services/text_extractor.py                               │
│  • repo-b/db/schema/316_rag_chunks.sql  (if pgvector)                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## VECTOR STORE DECISION

| Factor | OpenAI Vector Stores | pgvector in Supabase |
|---|---|---|
| Tenant isolation | Per-store or metadata filtering | Row-level security + `business_id` column (existing pattern) |
| Ops burden | Zero (managed) | Must manage indexes, vacuuming, dimension sizing |
| Cost model | Per-GB storage + per-query | Included in Supabase plan (already paying) |
| Latency | Extra network hop to OpenAI | Co-located with existing DB |
| Existing infra | None built yet | Supabase already has pgvector extension available |
| Access control | API-level only | Supabase RLS (existing pattern in `900_rls.sql`, `905_security_hardening.sql`) |
| Multi-provider future | Locked to OpenAI | Works with any embedding provider |

**Recommendation**: Start with **pgvector in Supabase** because tenant isolation via RLS is already the established pattern, and it avoids a new billing dimension. Use OpenAI for embeddings only (via `repo-c/app/llm.py` pattern which already calls `POST /v1/embeddings`). Add an abstraction layer so OpenAI Vector Stores can be swapped in later if scale demands it.

---

## CONCRETE DELIVERABLES WITH FILE PATHS

### 1. AI Gateway Routes (replaces Codex sidecar)

**Approach**: Add routes to FastAPI backend (not Next.js API routes) because Railway can handle long-running streaming responses and has direct DB access. Next.js routes proxy to backend.

**New files**:
```
backend/app/routes/ai_gateway.py          ← FastAPI router
backend/app/services/ai_gateway.py        ← OpenAI Responses API client
backend/app/schemas/ai_gateway.py         ← Request/response models
repo-b/src/app/api/ai/gateway/ask/route.ts   ← Proxy to backend (streaming SSE passthrough)
repo-b/src/app/api/ai/gateway/health/route.ts
```

**Key design for `ai_gateway.py`**:
```python
# backend/app/services/ai_gateway.py
# Uses OpenAI Responses API (not Chat Completions) for native tool calling + streaming

import httpx
from app.mcp.registry import registry as tool_registry
from app.mcp.audit import execute_tool
from app.mcp.auth import McpContext
from app.services import audit as audit_svc

# Convert existing MCP ToolDef objects into OpenAI tool schemas:
def _mcp_tools_to_openai_tools() -> list[dict]:
    """Convert the existing MCP registry into OpenAI function tool definitions."""
    tools = []
    for tool_def in tool_registry.list_all():
        # Skip codex_tools (being removed) and write tools for non-admin users
        if tool_def.name.startswith("codex."):
            continue
        tools.append({
            "type": "function",
            "function": {
                "name": tool_def.name,
                "description": tool_def.description,
                "parameters": tool_def.input_schema,
            }
        })
    return tools

# When OpenAI calls a tool → dispatch to the EXISTING MCP audit wrapper:
def _handle_tool_call(tool_name: str, arguments: dict, ctx: McpContext) -> dict:
    tool_def = tool_registry.get(tool_name)
    if not tool_def:
        raise ValueError(f"Unknown tool: {tool_name}")
    # This goes through the EXISTING audit + permission + rate limit pipeline:
    return execute_tool(tool_def, ctx, arguments)
```

**This is the critical insight**: The existing MCP `execute_tool()` wrapper in `backend/app/mcp/audit.py` already handles permission checks, `confirm=true` gating, latency tracking, audit persistence, and PII redaction. The AI Gateway just needs to be a thin adapter that converts OpenAI tool_call events into MCP `execute_tool()` calls.

### 2. RAG Ingestion Pipeline

**Trigger point** — hook into existing document upload flow:
```python
# backend/app/services/documents.py — after complete_upload() succeeds,
# fire async indexing task:
from app.services.rag_indexer import index_document_async
# ... inside complete_upload():
index_document_async(document_id=document_id, version_id=version_id)
```

**New files**:
```
backend/app/services/rag_indexer.py        ← Orchestrates extraction → chunking → embedding → storage
backend/app/services/text_extractor.py     ← PDF/DOCX/XLSX/TXT extraction
repo-b/db/schema/316_rag_chunks.sql        ← pgvector table + indexes
```

**Schema for `316_rag_chunks.sql`**:
```sql
-- Requires: CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS rag_document_chunks (
    chunk_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     uuid NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    version_id      uuid NOT NULL,
    business_id     uuid NOT NULL,
    env_id          uuid,
    entity_type     text,          -- fund, asset, pds_project, etc.
    entity_id       uuid,
    chunk_index     integer NOT NULL,
    chunk_text      text NOT NULL,
    char_offset     integer NOT NULL DEFAULT 0,
    token_count     integer,
    embedding       vector(1536),  -- text-embedding-3-small dimension
    metadata_json   jsonb DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Tenant-scoped retrieval:
CREATE INDEX idx_rag_chunks_business ON rag_document_chunks(business_id);
CREATE INDEX idx_rag_chunks_entity ON rag_document_chunks(entity_type, entity_id);
-- Vector similarity search (IVFFlat for scale, HNSW for speed):
CREATE INDEX idx_rag_chunks_embedding ON rag_document_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- RLS:
ALTER TABLE rag_document_chunks ENABLE ROW LEVEL SECURITY;
```

**Metadata schema for each chunk** (stored in `metadata_json`):
```json
{
  "source_filename": "Q4_2025_Fund_Report.pdf",
  "page_number": 3,
  "section_heading": "Portfolio Performance",
  "virtual_path": "re/env/{env_id}/fund/{fund_id}/Q4_2025_Fund_Report.pdf"
}
```

**Retrieval query** (in `ai_gateway.py`):
```sql
SELECT chunk_id, document_id, chunk_text, metadata_json,
       1 - (embedding <=> %s::vector) AS similarity
FROM rag_document_chunks
WHERE business_id = %s
  AND (entity_type = %s OR %s IS NULL)
ORDER BY embedding <=> %s::vector
LIMIT 8;
```

### 3. MCP → OpenAI Tool Wiring

**No new MCP tools needed for RAG** — add one new MCP tool for document search and upgrade the existing ones:

**Existing tools to expose to OpenAI** (already registered, already audited):

| Tool Name | Module | Permission | What It Does |
|---|---|---|---|
| `documents.list` | documents | read | List documents by business + department + tags |
| `documents.get_versions` | documents | read | Get version history for a document |
| `documents.get_download_url` | documents | read | Get signed download URL |
| `business.get` | business | read | Get business details |
| `env.list` | env | read | List environments |
| `executions.list` | executions | read | List execution runs |
| `metrics.query` | metrics | read | Query business metrics |
| `re_model.get` | re_model | read | Get RE model details |
| `re_model.list_scope` | re_model | read | List model scope assets |
| `work.create_task` | work | write | Create a task (confirm required) |
| `db.query` | db | read | Run read-only SQL (parameterized) |
| `repo.search` | repo | read | Search codebase (ripgrep) |
| `repo.read_file` | repo | read | Read a repo file |

**New tool to add**:
```python
# backend/app/mcp/tools/rag_tools.py
def _rag_search(ctx: McpContext, inp: RagSearchInput) -> dict:
    """Semantic search across indexed documents."""
    # 1. Embed query via OpenAI
    # 2. pgvector similarity search scoped to business_id
    # 3. Return chunks with citations (document_id, chunk_id, snippet, similarity)
    ...

# Registration:
registry.register(ToolDef(
    name="rag.search",
    description="Semantic search across all indexed documents for this business. Returns relevant chunks with citations.",
    module="rag",
    permission="read",
    input_model=RagSearchInput,   # { query: str, business_id: UUID, entity_type?: str, top_k?: int }
    handler=_rag_search,
))
```

**Tool dispatch flow when OpenAI calls a tool**:
```
OpenAI Responses API sends tool_call event
  → AI Gateway parses tool name + arguments
  → Looks up ToolDef in existing registry (backend/app/mcp/registry.py)
  → Calls execute_tool() (backend/app/mcp/audit.py)
    → Permission check (read vs write + confirm gating)
    → Input validation (Pydantic model_validate)
    → Handler execution
    → Audit event persisted (audit_svc.record_event)
    → Output returned
  → AI Gateway sends tool result back to OpenAI for next turn
```

### 4. Frontend Changes

**Files to modify**:

| File | Change |
|---|---|
| `repo-b/src/app/lab/chat/page.tsx` | Replace `apiFetch("/api/v1/chat")` with streaming fetch to `/api/ai/gateway/ask`. Add tool status indicators and approval prompts inline. |
| `repo-b/src/components/commandbar/GlobalCommandBar.tsx` | Rewire `assistantApi.ts` imports from codex endpoints to gateway endpoints. Keep plan→confirm→execute flow. |
| `repo-b/src/lib/commandbar/assistantApi.ts` | Replace all `USE_CODEX_SERVER` logic and sidecar URLs with gateway URLs. Remove mock state. |
| `repo-b/src/lib/server/codexBridge.ts` | **DELETE** (or empty stub with deprecation warning) |
| `repo-b/src/lib/server/codexRunStore.ts` | **DELETE** |
| `repo-b/src/app/api/ai/codex/*` | **DELETE** all 4 route files |
| `repo-b/src/app/api/ai/gateway/ask/route.ts` | **NEW** — SSE proxy to FastAPI backend |

**Streaming UI pattern** (replace fake 140-char chunking):
```typescript
// repo-b/src/app/api/ai/gateway/ask/route.ts
// Real SSE passthrough from FastAPI backend:
export async function POST(request: Request) {
  const { prompt, env_id, business_id, session_id } = await request.json();

  const backendResponse = await fetch(`${BACKEND_URL}/api/ai/gateway/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, env_id, business_id, session_id }),
  });

  // Stream-passthrough (no buffering):
  return new Response(backendResponse.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
```

**Chat page SSE events to handle**:
```typescript
type GatewayEvent =
  | { type: "token"; text: string }           // Streaming text
  | { type: "citation"; doc_id: string; chunk_id: string; snippet: string }
  | { type: "tool_call"; tool_name: string; arguments: object; requires_approval: boolean }
  | { type: "tool_result"; tool_name: string; result: object; success: boolean }
  | { type: "approval_required"; tool_name: string; dry_run_result: object; confirmation_token: string }
  | { type: "done"; usage: { prompt_tokens: number; completion_tokens: number } }
  | { type: "error"; message: string }
```

### 5. New Audit Log Viewer

**New file**: `repo-b/src/app/lab/ai-audit/page.tsx`

Reads from existing `system_audit_log` table (migration 291) filtered by `action_type LIKE 'mcp.%' OR action_type LIKE 'ai.%'`. Shows:
- Timestamp, actor, tool name, success/fail, latency
- Expandable rows showing input (redacted) and output
- Filter by date range, tool name, success/fail

### 6. Security Hardening

**Already in place** (preserve these):
- `MCP_API_TOKEN` for MCP auth (`backend/app/config.py` line 43)
- `ENABLE_MCP_WRITES` gate (`backend/app/config.py` line 44, enforced in `audit.py` line 39)
- `confirm=true` requirement for all write tools (`audit.py` line 43)
- PII redaction in audit logs (`audit.py` `_REDACT_KEYS_PATTERN`)
- Rate limiting (`MCP_RATE_LIMIT_RPM`, enforced in `mcp/rate_limit.py`)
- Max input/output bytes (`MCP_MAX_INPUT_BYTES`, `MCP_MAX_OUTPUT_BYTES`)
- Deny globs for `.env` files (`MCP_DENY_GLOBS`)
- Protected branch blocking (`orchestration/engine/routing.py` line 29)

**Add**:
- OpenAI API key server-side only (`OPENAI_API_KEY` in Railway env, never in Next.js `NEXT_PUBLIC_*`)
- Per-user rate limiting (currently per-MCP-session, need per-Supabase-user)
- Tenant isolation on RAG queries (enforce `business_id` in every vector search)
- Input sanitization on prompts (max length already exists: `AI_MAX_PROMPT_BYTES=50000` in `ai.py`)

### 7. Observability

**Already in place**:
- `audit_svc.record_event()` with `actor`, `action`, `tool_name`, `success`, `latency_ms`, `business_id`, `input_data`, `output_data`
- Orchestration logging (`orchestration/engine/logging.py`)

**Add to every AI Gateway call**:
```python
# In ai_gateway.py — log every interaction:
audit_svc.record_event(
    actor=user_id,
    action="ai.gateway.ask",
    tool_name="ai_gateway",
    success=True,
    latency_ms=elapsed,
    business_id=business_id,
    input_data={"prompt": prompt[:200], "env_id": str(env_id)},
    output_data={
        "tokens_prompt": usage.prompt_tokens,
        "tokens_completion": usage.completion_tokens,
        "tools_called": [t.name for t in tool_calls],
        "citations_returned": len(citations),
    },
)
```

---

## MIGRATION PLAN (ordered commits)

### Phase 1 — Foundation (no breaking changes)

```
commit 1: "feat: add pgvector RAG schema + indexer service"
  NEW: repo-b/db/schema/316_rag_chunks.sql
  NEW: backend/app/services/rag_indexer.py
  NEW: backend/app/services/text_extractor.py
  NEW: backend/app/mcp/tools/rag_tools.py
  EDIT: backend/requirements.txt (add: pymupdf, python-docx, tiktoken)
  EDIT: backend/app/mcp/server.py (register rag_tools)

commit 2: "feat: hook RAG indexing into document upload pipeline"
  EDIT: backend/app/services/documents.py (add index_document_async after complete_upload)
  EDIT: backend/app/routes/documents.py (surface indexing status)

commit 3: "feat: add AI Gateway routes (FastAPI) with OpenAI Responses API"
  NEW: backend/app/routes/ai_gateway.py
  NEW: backend/app/services/ai_gateway.py
  NEW: backend/app/schemas/ai_gateway.py
  EDIT: backend/app/main.py (register ai_gateway router)
  EDIT: backend/requirements.txt (add: openai>=1.x)

commit 4: "feat: add Next.js AI Gateway proxy routes"
  NEW: repo-b/src/app/api/ai/gateway/ask/route.ts
  NEW: repo-b/src/app/api/ai/gateway/health/route.ts
```

### Phase 2 — UI Rewiring

```
commit 5: "refactor: rewire Chat page to AI Gateway with real streaming"
  EDIT: repo-b/src/app/lab/chat/page.tsx (replace apiFetch with SSE to gateway)

commit 6: "refactor: rewire Command Bar to AI Gateway"
  EDIT: repo-b/src/lib/commandbar/assistantApi.ts (replace codex endpoints with gateway)
  EDIT: repo-b/src/components/commandbar/GlobalCommandBar.tsx (update feature flags)

commit 7: "feat: add AI Audit Log viewer page"
  NEW: repo-b/src/app/lab/ai-audit/page.tsx
```

### Phase 3 — Remove Codex Sidecar

```
commit 8: "chore: remove Codex CLI sidecar infrastructure"
  DELETE: repo-b/src/lib/server/codexBridge.ts
  DELETE: repo-b/src/lib/server/codexRunStore.ts
  DELETE: repo-b/src/app/api/ai/codex/run/route.ts
  DELETE: repo-b/src/app/api/ai/codex/stream/route.ts
  DELETE: repo-b/src/app/api/ai/codex/health/route.ts
  DELETE: repo-b/src/app/api/ai/codex/cancel/route.ts
  DELETE: backend/app/ai/sidecar_client.py
  DELETE: backend/app/mcp/tools/codex_tools.py
  DELETE: backend/app/mcp/schemas/codex_tools.py
  EDIT: backend/app/mcp/server.py (remove register_codex_tools)
  EDIT: backend/app/routes/ai.py (remove sidecar health check + ask endpoint, or redirect to gateway)
  EDIT: backend/app/config.py (remove AI_SIDECAR_URL, AI_SIDECAR_TOKEN; add OPENAI_API_KEY, AI_GATEWAY_ENABLED)
```

### Phase 4 — Hardening

```
commit 9: "feat: add per-user rate limiting + tenant-scoped RAG enforcement"
commit 10: "feat: add cost tracking (token usage per business_id per day)"
commit 11: "test: add integration tests for RAG recall + tool execution + approval flow"
```

---

## WHAT YOU'RE FORGETTING (common traps)

1. **The MCP server is stdio, not HTTP** — `backend/app/mcp/server.py` reads JSON-RPC from stdin. The AI Gateway needs to call tool handlers directly (via `execute_tool()` from `audit.py`), NOT by spawning a subprocess. The tool dispatch is already cleanly separated from transport.

2. **`codexRunStore.ts` breaks on Vercel** — the existing code already has a comment about this (line 36–43 of `run/route.ts`: "Vercel/serverless does not guarantee shared in-memory run state"). The new gateway MUST be stateless streaming, not in-memory run state.

3. **Demo Lab (repo-c) has its own LLM client** — `repo-c/app/llm.py` already calls OpenAI directly. Don't duplicate this; either share the gateway or have repo-c call the gateway too.

4. **The orchestration engine (`orchestration/engine/`) uses git worktrees** — this is for code-change tasks only. For document Q&A and data queries, bypass the orchestration engine entirely. Only invoke it for write operations that modify the repo.

5. **Existing `assistantApi.ts` has mock mode** — `USE_MOCKS=true` enables a complete mock path. Preserve this for dev/test but ensure the gateway has its own test fixtures.

6. **The Command Bar has a full plan→confirm→execute lifecycle** — `commandOrchestrator.ts` has a `TOOL_CATALOG` with 9 operations, risk levels, and mutation flags. This is NOT the same as the MCP tool registry. You need to reconcile these two catalogs or keep them separate (Command Bar for orchestrated multi-step plans, MCP tools for individual operations called by the AI).

7. **Entity-scoped document access** — `documents.py` uses `virtual_path` patterns like `re/env/{env_id}/fund/{fund_id}/filename.pdf`. RAG chunks must inherit this context so retrieval respects entity-level access, not just business-level.

8. **Multi-provider routing** — `repo-c/app/llm.py` already has OpenAI + Anthropic. The gateway should have a `MODEL_PROVIDER` config, and the orchestration engine has `model_routing_rules.json` for intent→model mapping. Wire these together.

9. **The audit table has two versions** — `system_audit_log` (public schema, migration 291) and `app.audit_log` (app schema, migration 283). Decide which one the AI Gateway uses and be consistent.

10. **`ENABLE_MCP_WRITES=false` by default** — This flag in `backend/app/config.py` line 44 blocks ALL write tools. The AI Gateway needs to either respect this flag or have its own write-enable flag. Don't accidentally bypass it.

11. **Prompt injection via tool results** — When the AI calls `rag.search` or `documents.get`, the returned content could contain adversarial instructions. Sanitize tool outputs before sending them back to the model as tool results.

12. **Token budget management** — The existing `AI_MAX_PROMPT_BYTES=50000` limit needs to account for: system prompt + RAG context + conversation history + tool schemas. With 14+ tools, the tool schema alone can be 10K+ tokens.

13. **No embeddings infrastructure exists yet** — Despite the `repo-c/app/llm.py` embedding function, no embeddings are stored anywhere in the current Supabase schema. This is truly new infrastructure.

14. **Railway cold starts** — The FastAPI backend on Railway may have cold start latency. Streaming SSE helps mask this for the user, but the first token time will be noticeably slower than a local sidecar.

---

## OPENAI RESPONSES API SPECIFICS

Use the Responses API (not Chat Completions) because it natively supports:
- **Tool calling** with multi-turn resolution (model calls tool → you return result → model continues)
- **Streaming** with granular event types (`response.output_item.added`, `response.content_part.delta`, etc.)
- **Built-in `file_search`** if you later move to OpenAI Vector Stores
- **Remote MCP** registration (future: register your FastAPI MCP server as a remote MCP endpoint)

```python
# Minimal Responses API call with tools:
import openai

client = openai.OpenAI(api_key=OPENAI_API_KEY)

response = client.responses.create(
    model="gpt-4o",
    input=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ],
    tools=mcp_tools_as_openai_format,
    stream=True,
)

# Handle streaming events + tool calls in a loop
for event in response:
    if event.type == "response.output_text.delta":
        yield sse_event("token", {"text": event.delta})
    elif event.type == "response.function_call_arguments.done":
        # Dispatch to MCP registry:
        result = _handle_tool_call(event.name, json.loads(event.arguments), ctx)
        # Send result back for next turn...
```

---

## NON-NEGOTIABLE REQUIREMENTS (unchanged from your original, now grounded)

1. **No API keys in browser** — `OPENAI_API_KEY` stays in Railway env only. Next.js routes proxy to FastAPI.
2. **Every write tool has approval gating** — Already enforced by `execute_tool()` in `backend/app/mcp/audit.py` line 43: `if not raw_input.get("confirm"): raise ConfirmRequired(...)`.
3. **RAG citations include document_id + chunk_id + snippet** — Chat UI already has `ChatCitation` type with these fields (`repo-b/src/app/lab/chat/page.tsx` line 13).
4. **Multi-environment isolation** — Every RAG query scoped by `business_id` from `env_business_bindings` (existing pattern in `backend/app/services/env_context.py`).
5. **Usable from anywhere** — Works on production Vercel + Railway, not just localhost with Codex CLI.
6. **Abstraction layer** — Gateway service accepts `model_provider` config; `repo-c/app/llm.py` already demonstrates multi-provider pattern.

---

_This prompt replaces the generic version with real Winston infrastructure references. Every file path has been verified. The key insight is that 70% of the infrastructure already exists — the work is wiring OpenAI Responses API into the existing MCP + audit + orchestration stack, adding a document embedding pipeline, and removing the localhost sidecar dependency._
