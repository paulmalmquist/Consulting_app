# Control Tower — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] Verify environment creation works end-to-end
- [ ] Verify environment switching works without auth issues
- [ ] Verify seed packs apply correctly for at least one environment type
- [ ] Confirm RLS enforcement on environment data

## Phase 1: Make the UI/operator flow coherent
- [ ] Control Tower lists all active environments with status
- [ ] One-click environment creation with template selection
- [ ] Environment edit (rename, change template, update capabilities)
- [ ] Environment deletion with confirmation

## Phase 2: Wire deeper data/API behavior
- [ ] Seed pack selection during environment creation
- [ ] Capability matrix — enable/disable capabilities per environment
- [ ] Environment health check endpoint
- [ ] Audit log for environment changes

## Phase 3: Testing, instrumentation, release gates
- [ ] Unit tests for environment pipeline and seed pack logic
- [ ] Integration tests for environment creation and switching
- [ ] Playwright tests for Control Tower UI flows
- [ ] Observability: log environment creation events

## Phase 4: Polish / demo readiness
- [ ] Environment creation wizard with guided setup
- [ ] Template preview before creation
- [ ] Environment comparison view
