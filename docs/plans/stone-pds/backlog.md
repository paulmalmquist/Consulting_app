# Stone PDS — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **Verify utilization data is real** — `/lab/env/[envId]/pds/utilization` — Confirm this renders actual utilization percentages, not hardcoded stubs.
- [ ] **Revenue forecast accuracy** — `backend/app/services/pds_revenue.py` — Verify the forecast logic uses actual pipeline data, not placeholder calculations.

## UX improvements
- [ ] **Executive dashboard** — `/lab/env/[envId]/pds/executive` — Verify all KPI cards populate. Report any empty state.
- [ ] **Capacity view** — `/lab/env/[envId]/pds/capacity` — Confirm forward-looking availability is calculated and visible.

## Backend / API
- [ ] **PDS v2 vs v1** — Determine whether `pds_v2.py` has fully replaced `pds.py` or if both are active. Remove dead routes.
- [ ] **PDS connectors** — `backend/app/connectors/pds/` — Identify what external data sources the PDS connectors pull from and whether they are active.

## Data / migrations
- [ ] **PDS table schema** — Needs repo verification. Identify Supabase tables for projects, timecards, utilization, and revenue.

## Tests
- [ ] **No known unit tests for utilization calculations** — `backend/app/services/pds_utilization.py` needs tests.
- [ ] **No known tests for revenue service** — `backend/app/services/pds_revenue.py` needs tests.

## Documentation
- [ ] **Link `docs/plans/PDS_DEEP_RESEARCH_PLAN.md`** — Reference from architecture.md when verified.

## Nice-to-have
- [ ] Timecard import from external system (ERP/PSA)
- [ ] Slack/email digest for weekly utilization summary

## Completed
_(none yet)_
