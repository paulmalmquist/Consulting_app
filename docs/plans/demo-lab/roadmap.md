# Demo Lab — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] Verify document upload → pipeline → RAG query works end-to-end
- [ ] Verify SQL agent returns results for basic queries
- [ ] Verify audit log captures AI interactions
- [ ] Confirm RLS on lab tables

## Phase 1: Make the UI/operator flow coherent
- [ ] Upload page accepts PDF and shows ingestion status
- [ ] Pipeline page shows job queue with status (pending/processing/done)
- [ ] Chat surface queries RAG and returns cited answers
- [ ] Audit log is searchable by date and query

## Phase 2: Wire deeper data/API behavior
- [ ] HITL workflow: reviewer sees flagged responses and can approve/reject
- [ ] SQL agent: can query live environment tables
- [ ] Market intelligence: surfaces relevant signals in chat context
- [ ] AI usage metrics visible in lab metrics page

## Phase 3: Testing, instrumentation, release gates
- [ ] Run existing AI test suite: `docs/ai-test-cases/`
- [ ] Playwright tests for upload → query flow
- [ ] Verify retrieval quality with known test fixtures
- [ ] HITL review flow tested end-to-end

## Phase 4: Polish / demo readiness
- [ ] Demo Lab showcases full RAG pipeline in under 2 minutes
- [ ] SQL agent demo: natural language to query to chart
- [ ] HITL demo: human review corrects AI response in real time
