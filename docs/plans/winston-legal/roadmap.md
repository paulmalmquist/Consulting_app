# Winston Legal — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] Apply legal ops seed pack and verify environment has usable demo data
- [ ] Verify contracts page renders a list with at least one contract
- [ ] Verify matters page shows matter list with status
- [ ] Confirm RLS on legal tables

## Phase 1: Make the UI/operator flow coherent
- [ ] Contract detail page shows AI-extracted key terms
- [ ] Matter list shows status, responsible attorney, open date
- [ ] Outside counsel spend is visible per firm
- [ ] AI briefing generates a legal summary on demand

## Phase 2: Wire deeper data/API behavior
- [ ] Document upload triggers AI extraction of key clauses
- [ ] Knowledge base search returns relevant precedents
- [ ] Compliance dashboard shows real policy adherence metrics
- [ ] Litigation view shows open matters by stage

## Phase 3: Testing, instrumentation, release gates
- [ ] Unit tests for contract parsing / AI extraction
- [ ] Integration tests for matter CRUD
- [ ] Playwright tests for contract → briefing flow
- [ ] Verify RAG retrieval quality for knowledge base queries

## Phase 4: Polish / demo readiness
- [ ] Legal demo environment with realistic contracts and matters
- [ ] Winston Legal answers "what are my riskiest open matters?"
- [ ] Outside counsel spend dashboard with benchmark comparisons
