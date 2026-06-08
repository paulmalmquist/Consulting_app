# Dispatch Record 0005 — Healthcare Subscription Analytics Lab

**Created:** 2026-06-08
**Status:** Phase 0 COMPLETE · Phase 1 (HHA-1 Exec Overview) COMPLETE · Phases 2–4 planned
**Environment:** Healthcare Subscription Analytics (internal codename: Hone Health demo)
**Deliverable type:** New lab environment (schema + read API + standalone UI)

Full plan: `C:\Users\paulm\.claude\plans\did-we-already-do-ancient-forest.md`

---

## Context

A synthetic, no-PHI environment proving Winston can host the analytics operating layer of a
subscription-led longevity / digital-health business: members → funnel → subscription
lifecycle → labs/consults/fulfillment → retention/churn → cohort LTV/CAC/payback → ops SLAs →
exec dashboard → governed copilot. The only pre-existing Hone artifact in the repo was
`Hone_work/` — a standalone reference data platform (dbt/PySpark/semantic-layer/PHI-safe query
agent), not wired into Winston. This record covers building the integrated, live environment
and reuses the reference's ideas: governed metric definitions, the PHI boundary (schema-only,
aggregate-only, small-cell suppression), cohort/retention modeling, and user-facing
freshness/provenance.

## Architecture decisions (locked with the user)

1. First ticket = Phase 0 docs + the HHA-1 vertical slice (Exec Overview), not docs-only.
2. Lead surface = Exec Overview at `/lab/env/[envId]/healthcare-subscription`.
3. Provision a real env via the v2 pipeline (writes to Supabase; user approved).
4. **Standalone design — NO app shell.** No `DomainWorkspaceShell`/`RepeWorkspaceShell`.
5. Prefix `hha_`; registered in `ARCHITECTURE.md` before any table.
6. Neutral visible naming ("Healthcare Subscription Analytics"); "Hone" stays in docs/codename.
7. Money as integer minor units, cast to decimal at the service edge; rates as `[0,1]` fractions.
8. Phase 1 rollups are seeded, not derived — labeled honestly; event-derivation is Phase 3.

## Dispatch routing
- Owning surfaces: `repo-b/db/schema/`, `backend/app/{routes,services,schemas}/`,
  `backend/app/services/environment_seed_packs_v2/`, `repo-b/src/app/lab/env/[envId]/healthcare-subscription/`,
  `repo-b/src/components/healthcare-subscription/`, `repo-b/src/lib/healthcare-subscription/`.
- DB/schema: `10013_hha_healthcare_subscription_core.sql` (+ `app.environment_templates` row).
- Deployment: v2 provisioning to Supabase; no Vercel/Railway deploy in HHA-1.
- CI guardrails: `backend/tests/test_hha.py`; `npm run typecheck`; `npm run db:verify` (live).
- Risk level: Medium (prod schema + env writes; offset by synthetic data, RLS, idempotent seed, reversibility).

## Ticket index
| # | Phase | Ticket | DB migration | Risk | Status |
|---|---|---|---|---|---|
| HHA-1 | 1 | Exec Overview slice (schema, seed, API, standalone UI, tests) | 10013 | Med | DONE 2026-06-08 |
| HHA-2 | 2 | Funnel + Cohorts + Operations surfaces | none | Low | planned |
| HHA-3 | 3 | Event-level grain + derived rollups | new | Med | planned |
| HHA-4 | 4 | Governed PHI-safe copilot | none | Med | planned |

## Phase 1 — HHA-1 detail (DONE)

Built: `ARCHITECTURE.md` `hha_` prefix; `10013_…sql` (5 gold tables + RLS + template row);
`hha_starter.py` seed pack (deterministic, PHI-free, synthesizes business_id, one suppressed
small cell) + registered in the seed-pack registry; `routes/hha.py` + `services/hha.py`
(`set_config('app.env_id')` + `WHERE env_id`, money at the edge) + `schemas/hha.py`, registered in
`main.py`; standalone `page.tsx` + `OverviewClient.tsx` (NO-PHI banner, metric drawer,
provenance footer) + `lib/healthcare-subscription/client.ts`; `backend/tests/test_hha.py`.

Acceptance receipt:
- `pytest --noconftest backend/tests/test_hha.py` → 6 passed (2026-06-08).
- `npm run typecheck` → exit 0 (2026-06-08).
- Live provisioning + route smoke → see `release-readiness.md` / `PROOF.md` (fail-closed gate).

## Phases 2–4 — milestones (planned)
See `docs/plans/healthcare-subscription/roadmap.md`. No phase starts without explicit approval.

## tips.md lesson
Recorded in `docs/tips.md`: v2 demo envs get no `business_id` (seed packs receive `""`) — synthesize
it deterministically and scope reads by the globally-unique `env_id`; schema numbering is irregular,
so always derive the next number from the real max, never assume.
