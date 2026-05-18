# Novendor CRM / Accounting — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] Verify CRM contact CRUD works (create, read, update, delete)
- [ ] Verify receipt ingestion pipeline works end-to-end
- [ ] Verify accounting queue shows correct pending items
- [ ] Confirm RLS on CRM and accounting tables

## Phase 1: Make the UI/operator flow coherent
- [ ] ECC brief page renders real accounting summary
- [ ] Approval queue shows actionable items with approve/reject
- [ ] Receipt intake: drag-and-drop or email-based ingestion
- [ ] VIP contact list is accurate and up-to-date

## Phase 2: Wire deeper data/API behavior
- [ ] Apollo sync: contacts imported from Apollo appear in CRM
- [ ] Gmail integration: inbound emails from prospects surface as CRM signals
- [ ] Accounting trends: charts show real spend data by category and time
- [ ] Impact estimator: connected to real deal and engagement data

## Phase 3: Testing, instrumentation, release gates
- [ ] Unit tests for accounting queue and KPI calculations
- [ ] Integration test for receipt ingestion pipeline
- [ ] Playwright tests for ECC approval flow
- [ ] AI usage attribution for NV copilot calls

## Phase 4: Polish / demo readiness
- [ ] ECC demo mode with seeded accounting data
- [ ] CRM dashboard with deal pipeline view
- [ ] One-click "generate accounting brief" for current month
