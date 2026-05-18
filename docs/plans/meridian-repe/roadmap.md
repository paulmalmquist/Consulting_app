# Meridian / REPE — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] Verify authoritative state reads work for all released periods
- [ ] Investigate and resolve early-period IRR outliers (IGF VII, MCOF I)
- [ ] Confirm waterfall calculations match expected outputs for at least one fund
- [ ] Verify audit mode (`?audit_mode=1`) renders AuditDrawer on all required pages

## Phase 1: Make the UI/operator flow coherent
- [ ] Fund list shows correct fund count, AUM, and vintage year
- [ ] Asset list shows correct property count per fund
- [ ] Period close workflow guides operator through close steps
- [ ] Waterfall page shows LP/GP split with formula provenance

## Phase 2: Wire deeper data/API behavior
- [ ] Monte Carlo scenarios run and render results
- [ ] Sustainability/ESG data surfaced from connected sources
- [ ] Capital calls and distributions accurately tracked
- [ ] Investor portal shows correct IRR and TVPI per investor

## Phase 3: Testing, instrumentation, release gates
- [ ] All authoritative state lint tests pass
- [ ] `test_state_lock_invariants.py` passes
- [ ] Playwright tests for fund → asset → waterfall flow
- [ ] Audit mode verified via automated screenshot

## Phase 4: Polish / demo readiness
- [ ] REPE demo environment with realistic seeded fund data
- [ ] Winston AI explains fund KPIs on demand
- [ ] One-click period close simulation for demo

## Existing plans to reference
- `docs/plans/INVESTMENT_ENGINE_PLAN.md`
- `docs/plans/DEBT_FUND_REPORTING_HIERARCHY.md`
- `docs/plans/investment-engine/` (per-module)
- `docs/adr/investment-engine/` (decisions)
