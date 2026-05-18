# Demo Lab — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **RAG pipeline end-to-end** — Trace document upload through chunking, embedding, indexing, and retrieval. Identify any broken steps.
- [ ] **SQL agent permissions** — `backend/app/routes/sql_agent.py` — Verify SQL agent cannot access cross-tenant data or run destructive queries.

## UX improvements
- [ ] **Pipeline status visibility** — `/lab/pipeline` — Confirm job status updates in real time (pending → processing → done), not on page refresh only.
- [ ] **Chat citation display** — Verify RAG responses include source document references.

## Backend / API
- [ ] **repo-c structure** — List and document the services and routes in `repo-c/`. Determine which routes repo-c serves vs. the main backend.
- [ ] **Vector store** — Determine whether embeddings are stored in Supabase pgvector or another store.
- [ ] **HITL storage** — Identify where HITL review decisions are stored.

## Data / migrations
- [ ] **Lab table schema** — Identify Supabase tables for documents, embeddings, pipeline jobs, audit log.
- [ ] **Embedding dimensions** — Confirm embedding model and dimensions used for pgvector index.

## Tests
- [ ] **Run AI test suite** — Execute tests in `docs/ai-test-cases/` and report pass/fail.
- [ ] **No known Playwright tests for upload → query flow** — Add these.

## Documentation
- [ ] **RAG architecture** — Document the full chunking → embedding → retrieval pipeline with file paths.

## Nice-to-have
- [ ] PDF preview in document library
- [ ] Retrieval quality score displayed in chat responses

## Completed
_(none yet)_
