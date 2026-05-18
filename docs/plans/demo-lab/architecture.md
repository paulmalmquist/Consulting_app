# Demo Lab — Architecture

**Last updated:** 2026-05-16  
**Status:** Draft — needs repo verification

## Frontend map

### Routes (Lab system surfaces)
| Route | File | Purpose |
|---|---|---|
| `/lab/ai` | `repo-b/src/app/lab/ai/` | AI testing surface |
| `/lab/ai-audit` | `repo-b/src/app/lab/ai-audit/` | AI audit log |
| `/lab/audit` | `repo-b/src/app/lab/audit/` | General audit |
| `/lab/chat` | `repo-b/src/app/lab/chat/` | Chat interface |
| `/lab/environments` | `repo-b/src/app/lab/environments/` | Environment list |
| `/lab/market-intelligence` | `repo-b/src/app/lab/market-intelligence/` | Market intelligence |
| `/lab/metrics` | `repo-b/src/app/lab/metrics/` | Lab metrics |
| `/lab/pipeline` | `repo-b/src/app/lab/pipeline/` | Ingestion pipeline |
| `/lab/sql-agent` | `repo-b/src/app/lab/sql-agent/` | SQL agent |
| `/lab/upload` | `repo-b/src/app/lab/upload/` | Document upload |

### Routes (Per-environment demo)
| Route | File | Purpose |
|---|---|---|
| `/lab/env/[envId]/demo` | `repo-b/src/app/lab/env/[envId]/demo/` | Environment demo surface |
| `/lab/env/[envId]/documents` | `repo-b/src/app/lab/env/[envId]/documents/` | Documents |
| `/lab/env/[envId]/analytics` | `repo-b/src/app/lab/env/[envId]/analytics/` | Analytics |

### Frontend API routes
| Route | File | Purpose |
|---|---|---|
| `/api/v1/chat` | `repo-b/src/app/api/v1/chat/` | Chat API |
| `/api/v1/pipeline` | `repo-b/src/app/api/v1/pipeline/` | Pipeline API |
| `/api/v1/sql-agent` | `repo-b/src/app/api/v1/sql-agent/` | SQL agent API |
| `/api/v1/queue` | `repo-b/src/app/api/v1/queue/` | Queue API |

## Backend map

### Routes
| File | Purpose |
|---|---|
| `backend/app/routes/lab.py` | Core lab routes |
| `backend/app/routes/lab_v2.py` | Lab v2 routes |
| `backend/app/routes/documents.py` | Document management |
| `backend/app/routes/extraction.py` | Document extraction |
| `backend/app/routes/audit.py` | Audit logging |
| `backend/app/routes/sql_agent.py` | SQL agent |
| `backend/app/routes/psychrag.py` | RAG routes |

### Services
| File | Purpose |
|---|---|
| `backend/app/services/lab.py` | Lab service |
| `backend/app/services/lab_compat.py` | Lab compatibility layer |
| `backend/app/services/lab_excel.py` | Lab Excel integration |
| `backend/app/services/assistant_environment.py` | Environment context |

### AI / RAG
| File | Purpose |
|---|---|
| `backend/app/ai/retrieval.py` | RAG retrieval |
| `backend/app/routes/psychrag.py` | RAG query routes |
| `backend/app/routes/ai_gateway.py` | AI gateway |

## repo-c (Demo Lab Backend)

- `repo-c/` — Separate backend service for Demo Lab
- Env-scoped schemas, RAG, HITL, audit, metrics
- Needs repo verification for specific service files

## Data map

- Needs repo verification — identify Supabase tables for documents, embeddings, pipeline jobs
- Likely tables: `lab_documents`, `lab_embeddings`, `pipeline_jobs`, `audit_log`
- RLS expected via `env_id`

## Test map

- `docs/ai-testing/` — latest AI feature test reports
- `docs/ai-test-cases/` — structured test fixtures
- Check `backend/tests/` for lab/RAG test files

## Needs verification

- [ ] repo-c structure and which routes it serves
- [ ] Whether RAG uses Supabase pgvector or another vector store
- [ ] Document upload pipeline steps (upload → chunk → embed → index)
- [ ] HITL workflow: where human review decisions are stored
- [ ] SQL agent data sources and permissions
