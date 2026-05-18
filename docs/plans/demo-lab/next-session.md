# Next Session — Demo Lab

**Last updated:** 2026-05-16

## Copy-paste prompt for next Claude Code session

```
You are working on Demo Lab / RAG / Pipeline in the Novendor / BusinessMachine platform.

Read first:
- docs/plans/demo-lab/architecture.md
- docs/plans/demo-lab/backlog.md
- docs/AI_ARCHITECTURE_AND_WORKFLOWS.md
- backend/app/routes/psychrag.py
- backend/app/ai/retrieval.py

Objective:
1. Trace the document upload → chunking → embedding → RAG query pipeline end-to-end.
2. Identify the Supabase tables for documents, embeddings, and pipeline jobs.
3. Determine the vector store (pgvector vs. other).
4. Document repo-c structure.
5. Verify SQL agent cannot run destructive queries.

Files to inspect:
- backend/app/routes/lab.py
- backend/app/routes/psychrag.py
- backend/app/ai/retrieval.py
- backend/app/routes/sql_agent.py
- repo-c/ (list all files)

Acceptance criteria:
- [ ] RAG pipeline stages documented in architecture.md
- [ ] Vector store identified and documented
- [ ] SQL agent permissions verified (no DROP/DELETE)
- [ ] repo-c structure documented
- [ ] Any broken pipeline steps added to backlog.md

Tests to run:
cd backend && python -m pytest tests/ -k "lab or rag or psychrag" -v

Update docs/plans/demo-lab/next-session.md and backlog.md before finishing.
```

## Context notes
- `docs/ai-testing/` has the latest AI test results — check this before touching AI gateway code
- `docs/ai-test-cases/` has structured test fixtures — use them for RAG quality verification
- repo-c is a separate backend service — do not confuse its routes with the main backend
