# Phase 3 — Healthcare Subscription Analytics (event grain → derived rollups)

Codex prompt. Self-contained. Paste into Codex working at the repo root:

```txt
C:\Projects\Consulting_app
```

You are extending a shipped Winston lab environment. **Phase 3 (HHA-3) is its own PR.** It turns
the existing hand-seeded gold rollups into rollups **derived from synthetic events** — "retention
emerges from the data." Synthetic / demo only. **No PHI.**

---

## ⛔ HARD GATE — do not start until ALL are true

1. HHA-2 (PR #136) is **merged** to `main`.
2. The backend has been **deployed from a clean checkout** (Railway ships the local tree, not a
   GitHub merge) and `GET /version` matches the HHA-2 merge SHA — so `/api/hha/v1/{funnel,cohorts,operations}`
   are live in production.
3. HHA-2 has a **production visual receipt** (logged-in screenshots of Funnel/Cohorts/Operations).

If any is false, STOP and report. Do not base this destructive work on an unshipped branch.

This is a **separate PR from Phase 4**. Do not touch AI runtime / MCP / copilot here.

---

## Mission

Add synthetic, no-PHI **event-level tables**, generate them deterministically, and **derive** the
five existing `hha_*` gold rollups from those events. Flip provenance `seeded → derived`. Keep the
shipped Overview/Funnel/Cohorts/Operations surfaces working unchanged.

## Required reading before code

- `docs/plans/healthcare-subscription/architecture.md` — serving model, tenancy, "Seeded vs derived (be honest)".
- `docs/plans/03-implementation-plans/active/0005-healthcare-subscription-analytics-lab.md`.
- `Hone_work/README.md` + `Hone_work/platform_standards.md` — the bronze→silver→gold event-simulation
  approach where per-program/-channel churn at the event level makes the retention story emerge.
- `docs/tips.md` — search "Healthcare Subscription Analytics env" (schema numbering, `set_config` not
  `SET LOCAL`, demo-env `business_id` synthesis).

## Files to inspect (mirror these exactly)

- `repo-b/db/schema/10013_hha_healthcare_subscription_core.sql` — the 5 gold tables + RLS pattern.
- `backend/app/services/environment_seed_packs_v2/hha_starter.py` — the CURRENT hand-seeding pack
  (fixed `_AS_OF = date(2026,5,31)`, `uuid5` keys, synthesized `business_id`, the womens_pilot size-8
  suppressed cohort).
- `backend/app/services/environment_seed_packs_v2/__init__.py` — SeedPack protocol + registry.
- `backend/tests/test_hha.py` — existing tests (keep all green).

## Hard constraints (carried from Phase 1/2)

- Synthetic / **no PHI**: synthetic UUID ids + categorical/aggregate fields only. No names, emails,
  DOB, addresses, phone, diagnoses, exact lab values, prescriptions, MRN.
- Every new table: `env_id TEXT NOT NULL` + `business_id UUID NOT NULL` + RLS + tenant-isolation
  policy on `current_setting('app.env_id', true)` + `COMMENT ON TABLE` + `(env_id, <date>)` index.
- Determinism: `uuid5` keys off `env_id`, fixed `_AS_OF`, **no wall-clock**. Idempotent inserts
  (`ON CONFLICT DO NOTHING`). `business_id` synthesized (the v2 pipeline passes `""`).
- Money = integer minor units in DB; cast to dollars only at the service edge. Rates = `[0,1]` fractions.
- HHA-only diff. No telemetry/auth/unrelated changes. No frontend changes (the surfaces already read
  the gold rollups via `/bos`).

---

## What to build

### 1. Schema — `repo-b/db/schema/<next-free-NNN>_hha_healthcare_subscription_events.sql`

**Re-check the next free number first** (it was `10014` at planning; derive from the real max on
`origin/main`, do not assume). Seven event tables, mirroring the `10013` RLS/index/comment pattern:

| Table | Key fields | Derives |
|---|---|---|
| `hha_members` | member_id UUID, plan_key, signup_date, status | active_members, cohort denominators |
| `hha_subscriptions` | subscription_id, member_id, plan_key, event_type (signup/renewal/churn), event_date, revenue_minor_units | MRR/ARR/ARPU, churn, NRR/GRR, trial→paid, cohort retention/LTV |
| `hha_funnel_events` | event_id, member_id, event_type (visitor/lead/trial/activated/subscribed), event_date, acquisition_channel, spent_minor_units | funnel stages, conversion %, channel CAC |
| `hha_lab_orders` | order_id, member_id, created_date, completed_date, turnaround_hours | lab ops volume, p50/p90, SLA |
| `hha_consults` | consult_id, member_id, scheduled_date, completed_date, turnaround_hours | consult ops |
| `hha_fulfillment_events` | fulfillment_id, member_id, requested_date, shipped_date, turnaround_hours | fulfillment ops |
| `hha_support_tickets` | ticket_id, member_id, created_date, first_response_date, turnaround_hours | support ops |

### 2. Derivation — versioned seed logic (**preserve v1!**)

**Before adding v2, preserve v1 so rollback is real.** Copy the current hand-seeding logic into
`backend/app/services/environment_seed_packs_v2/hha_starter_v1.py` (keep it importable/registered as
e.g. `hha_starter_v1`), OR expose a `restore_v1()` entry. Do **not** edit `hha_starter.py` in place
in a way that destroys the only copy of the v1 logic.

Add the v2 derivation path (`hha_starter` v2 / `hha_starter_v2.py`); the env template's default seed
pack points at v2. v2 `apply()`:
- **(A) generate** deterministic events (uuid5 off `env_id`, fixed `_AS_OF`, no wall-clock). Place
  churn/expansion/funnel/SLA events so the aggregates emerge at the target rates (use lookup tables
  per program/channel/month — mirror the `_OVERVIEW`/`_CHANNELS`/`_cohort_rows` ground truth).
  Pre-seed a tiny womens_pilot member list (size 8) so its cohort trips `is_suppressed`.
- **(B) aggregate** events → the 5 gold rollups (overview/plans/funnel/cohort/operations).
- **(C) write** events + computed gold (`ON CONFLICT DO NOTHING`).
- Flip `_PROVENANCE` → `"synthetic gold rollup (derived) · hha_starter v2"`, `VERSION = 2`. The label
  propagates through `services/hha.py` → footer (no read-side change).

**Acceptance = behavior, not brittle exact numbers.** Headline KPIs within tolerance AND
trends/rankings/suppression/narrative stable; document any intentional delta in `SeedResult.notes`:
- `active_members`: exact or ±1
- MRR / ARR: ±1%
- NRR / GRR / churn: ±0.5 percentage points
- SLA p50 / p90: ±5%
- cohort retention: ±2 percentage points
- program ranking (TRT-equivalent best, metabolic worst) and womens_pilot suppression: **must hold**

### 3. Tests — extend `backend/tests/test_hha.py`

- Event generation is deterministic (same `env_id` → byte-identical event rows across two runs).
- Derived gold meets the tolerances above (parse the INSERTs; assert headline KPIs in range).
- womens_pilot cohort still `is_suppressed = true` after derivation.
- No-PHI scan of the new schema file **and** the v2 generator code (reuse the existing `_PHI_TOKENS`
  scan that strips comments/string-literals).
- Provenance label contains "derived", not "seeded"; `VERSION >= 2`.
- All 7 event tables have RLS + index in the migration.
- Keep the existing 9 tests green.

---

## Verification (run all; no claims without output)

```
cd backend && python -m pytest --noconftest tests/test_hha.py -q     # existing 9 + new, all green
cd repo-b && npm run typecheck                                        # exit 0
cd repo-b && npm run db:verify                                       # schema integrity (needs DATABASE_URL)
```

Scratch-env check (DO THIS BEFORE TOUCHING ceeb9ea0):
```
# apply the new migration to Supabase (additive/idempotent) via supabase CLI
# deploy backend from a clean checkout (Railway): scripts/deploy_backend.sh --service authentic-sparkle
# provision a SCRATCH env via POST /v2/environments with the hha_starter v2 pack
# verify derived gold meets the tolerances vs the seeded baseline; capture the numbers
```

---

## ⚠️ Destructive re-provisioning of `ceeb9ea0` — gated, needs EXPLICIT approval at execution

Do NOT wipe the demo env until the scratch-env check passes AND the user explicitly approves. Then,
each step fail-closed:

1. **Real rollback artifact** (not row counts): create per-table backups scoped to the env —
   ```sql
   CREATE TABLE hha_backup_<ts>_<table> AS
     SELECT * FROM <table>
      WHERE env_id = 'ceeb9ea0-9f8b-4369-b853-adcd60c01def';
   ```
   for all 5 gold tables (and any event tables already present). Keep these backups until derived v2
   is verified + documented; only then drop them.
2. `DELETE FROM hha_* WHERE env_id = 'ceeb9ea0-9f8b-4369-b853-adcd60c01def';`
3. Re-run `hha_starter v2` against `ceeb9ea0` (events + derived gold).
4. Re-verify `/api/hha/v1/*` + a logged-in visual receipt for all four surfaces; footer must read
   "derived"; demo URL is unchanged.
5. **Restore path is real:** on any failure, restore from the backup tables (step 1) or re-run the
   preserved **v1** seed. Confirm restore succeeded before retrying.

---

## Out of scope (do NOT do these)

- No copilot / AI / MCP (that is Phase 4 — a separate PR).
- No frontend changes (the surfaces already render the gold rollups).
- No telemetry / auth / unrelated changes. No new paid infra.
- No wipe of `ceeb9ea0` without explicit approval + the backup artifact.

## Workflow / PR hygiene

- Branch from `main`. Keep the diff HHA-only (the repo has heavy unrelated WIP — stage only your
  files; per-hunk if you touch a shared file).
- Do not merge or deploy without explicit approval. Open the PR for review.
- Update `docs/plans/healthcare-subscription/{roadmap,backlog,architecture,release-readiness,next-session}.md`
  and add a Phase 3 section to dispatch `0005`. Reusable lessons → `docs/tips.md`.

## Stop condition

Stop after the migration + v2 seed pack (v1 preserved) + tests are done, the scratch-env tolerance
check passes, and the PR is open with verification output. The `ceeb9ea0` wipe is a separate,
explicitly-approved step. Report: branch, files changed, tests + results, scratch-env numbers vs
tolerances, PR URL, remaining risks. Do not start Phase 4.
