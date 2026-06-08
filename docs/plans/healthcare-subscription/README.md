# Healthcare Subscription Analytics

A synthetic, no-PHI Winston lab environment that models the operating layer of a
subscription-led longevity / digital-health business. Internal codename: Hone Health demo.

It exists to prove one thing: Winston can host the analytics operating layer for a
modern subscription healthcare company — members, funnel, subscription economics,
cohort retention, care-operations SLAs, an exec dashboard, and a governed analytics
copilot — with business analytics kept strictly separate from anything clinical.

## What this is not

- Not a real Hone Health integration and not real patient data.
- Not a medical system. No diagnosis, treatment, prescription, or PHI. Every number is
  a synthetic gold rollup.

The public UI is labeled **Healthcare Subscription Analytics** (neutral). "Hone" lives
only in docs and the `hha_` table-prefix codename.

## Status

- **Phase 0 (planning/skeleton):** done.
- **Phase 1 (HHA-1 vertical slice — Exec Overview):** done. Schema + seed pack + read API
  (`/api/hha/v1/health`, `/overview`) + standalone Overview page + tests.
- **Phase 2+:** funnel / cohorts / operations pages, event-level grain, governed copilot. Not started.

## Map

| Concern | Location |
|---|---|
| Schema (5 gold-rollup tables + RLS + template row) | `repo-b/db/schema/10013_hha_healthcare_subscription_core.sql` |
| Seed pack (synthetic, deterministic) | `backend/app/services/environment_seed_packs_v2/hha_starter.py` |
| Read API | `backend/app/routes/hha.py`, `backend/app/services/hha.py`, `backend/app/schemas/hha.py` |
| Standalone UI (no app shell) | `repo-b/src/app/lab/env/[envId]/healthcare-subscription/`, `repo-b/src/components/healthcare-subscription/`, `repo-b/src/lib/healthcare-subscription/` |
| Proof / demo | `repo-b/src/app/lab/env/[envId]/healthcare-subscription/PROOF.md`, `DEMO.md` |
| Dispatch record | `docs/plans/03-implementation-plans/active/0005-healthcare-subscription-analytics-lab.md` |
| Domain reference | `Hone_work/` (standalone reference data platform — dbt/PySpark/semantic-layer/PHI-safe query agent) |

Sub-docs: [architecture](architecture.md) · [roadmap](roadmap.md) · [backlog](backlog.md) ·
[next-session](next-session.md) · [qa-checklist](qa-checklist.md) ·
[release-readiness](release-readiness.md) · [ai-behavior](ai-behavior.md) ·
[design-adaptation](design-adaptation.md)
