# Excel Add-in — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] Add-in loads in Excel without errors
- [ ] Auth works against production API
- [ ] At least one custom function returns real data
- [ ] Task pane renders correctly

## Phase 1: Make the UI/operator flow coherent
- [ ] Task pane shows environment selector
- [ ] Custom functions documented and usable
- [ ] Write queue successfully batches and commits writes

## Phase 2: Wire deeper data/API behavior
- [ ] Custom functions pull live REPE/PDS data from platform
- [ ] Write queue writes structured data to correct Supabase tables
- [ ] Error states surface clearly in Excel cells

## Phase 3: Testing, instrumentation, release gates
- [ ] Custom function unit tests
- [ ] Write queue integration tests
- [ ] Auth flow tested against production

## Phase 4: Polish / demo readiness
- [ ] Demo: pull live fund KPIs into Excel in one formula
- [ ] Demo: write timecard data from Excel to PDS
- [ ] Excel add-in store listing considerations
