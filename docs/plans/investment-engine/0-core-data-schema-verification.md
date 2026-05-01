# Phase 1 Schema — Verification Report

- **Date:** 2026-04-30
- **Migrations:** `repo-b/db/schema/474_inv_core_entities.sql` through `480_inv_audit.sql`
- **Plan:** `docs/plans/investment-engine/0-core-data-schema.md`

## Static Verification — Pass

Counts cross-checked via grep over the seven migration files.

| Check | Expected | Actual | Result |
|---|---|---|---|
| `CREATE TABLE` statements (base tables, excluding partitions) | 22 | 22 | pass |
| `ENABLE ROW LEVEL SECURITY` statements | 22 (one per base table) | 22 | pass |
| `CREATE POLICY inv_*_env_isolation` statements | 22 | 22 | pass |
| `COMMENT ON TABLE inv_*` statements | 22 | 22 | pass |
| `env_id text NOT NULL` columns | 22 | 22 | pass |
| `business_id uuid NOT NULL` columns | 22 | 22 | pass |

Per-file breakdown:

| File | Tables created | Notes |
|---|---|---|
| 474_inv_core_entities.sql | 5 (`inv_fund`, `inv_benchmark`, `inv_portfolio`, `inv_account`, `inv_security`) | Also installs three shared trigger functions used by 474–480. |
| 475_inv_positions.sql | 2 tables (`inv_position_lot`, `inv_position_lot_relief`) + 1 view (`inv_position_current`) | Lot immutability trigger + relief overdraw guard. |
| 476_inv_transactions.sql | 3 (`inv_trade`, `inv_cash_movement`, `inv_accrual`) | Closes 475 FKs (open_event_id, relief_event_id → inv_trade). |
| 477_inv_pricing.sql | 3 (`inv_security_price`, `inv_fx_rate`, `inv_curve`) | Closes 475 FKs (fx_rate_id_at_open / fx_rate_id_at_relief → inv_fx_rate). Edit guards on price + fx. |
| 478_inv_accounting_snapshots.sql | 3 (`inv_nav_snapshot`, `inv_pnl_snapshot`, `inv_position_valuation`) | Snapshot shape per skill; partial unique on released; immutability trigger. |
| 479_inv_reconciliation.sql | 3 (`inv_reconciliation_run`, `inv_source_position`, `inv_reconciliation_break`) | Break load-bearing fields immutable; only resolution metadata mutable. |
| 480_inv_audit.sql | 3 (`inv_audit_log` partitioned, `inv_data_version`, `inv_mutation_event` partitioned) | Append-only on audit + mutation; current-month partitions created. |

Total: 22 base tables + 4 partitions (default + current month for both partitioned tables) + 1 view.

## ADR Coverage

| ADR | How honored in schema |
|---|---|
| 001 — Lot accounting | `inv_fund.lot_relief_method` required CHECK IN ('fifo','spec_id'); immutable `inv_position_lot` (open_qty_initial uneditable via trigger); separate `inv_position_lot_relief` rows; `voided_by_id` for corrections; overdraw guard. |
| 002 — Currency model | All transactional amounts stored as `<col>_native` + `<col>_currency`; `inv_fx_rate` with `superseded_by_id` chain and partial unique; snapshots carry `fx_rate_id` columns for every translated value; `inv_security_price` follows the same pattern. |
| 003 — Bi-temporal | Every transactional row has `effective_date` + `booking_date`; every snapshot has `effective_date` + `as_of_date` + `input_versions` jsonb; `block_released_mutation` trigger blocks release-row edits and DELETEs; partial unique on `WHERE status = 'released'`. |

## Project DB Rule Coverage

| Rule | Coverage |
|---|---|
| RLS + env_id policy on every CREATE TABLE | 22/22 |
| env_id TEXT NOT NULL + business_id UUID NOT NULL on every user-facing table | 22/22 |
| File naming `NNN_module_description.sql` sequential | 474–480 (next available was 474; verified via Glob) |
| Approved table prefix | `inv_` — new prefix for the investment engine module; documented in plan |
| Named indexes with workload justification | All 30+ indexes named `idx_inv_*` with comment-style intent in the index name (e.g. `idx_inv_lot_account_security_date` for FIFO ordering + position rollups). Specific workload notes added in 475 and 478. |
| COMMENT ON TABLE on every table | 22/22, plus comments on the shared trigger functions and the `inv_position_current` view |

## Snapshot Skill Compliance (478)

Each of the three snapshot tables (`inv_nav_snapshot`, `inv_pnl_snapshot`, `inv_position_valuation`) includes the full required column set per `skills/winston-investment-snapshot/SKILL.md`:

- Identity: `id`, `entity_type` (with CHECK), `entity_id`, `effective_date`, `as_of_date`
- Lifecycle: `status` CHECK IN ('draft','locked','released','superseded'), `version`, `superseded_by_id`, `superseded_reason`
- Reproducibility: `input_versions` jsonb NOT NULL
- Provenance: `produced_by`, `produced_at`
- Tenancy: `env_id`, `business_id`, `created_at`, `updated_at`

Required indexes present on all three:
- partial unique `WHERE status = 'released'` (with table-specific key — fund_id for NAV/PnL, account_id+security_id for valuations)
- `(entity_id, effective_date, as_of_date DESC)` for "as of" reads
- `(status, effective_date)` for close-cycle queries

Required trigger present on all three:
- `BEFORE UPDATE OR DELETE` calling `inv_block_released_mutation()`

## Foreign Key Closure

| Forward reference | Closure migration | Verified |
|---|---|---|
| `inv_position_lot.open_event_id` → `inv_trade.id` | 476 | DO block in 476 |
| `inv_position_lot_relief.relief_event_id` → `inv_trade.id` | 476 | DO block in 476 |
| `inv_position_lot.fx_rate_id_at_open` → `inv_fx_rate.id` | 477 | DO block in 477 |
| `inv_position_lot_relief.fx_rate_id_at_relief` → `inv_fx_rate.id` | 477 | DO block in 477 |

All four use `IF NOT EXISTS` patterns so re-running migrations is safe.

## Idempotency

Every CREATE TABLE uses `IF NOT EXISTS`. Every CREATE INDEX uses `IF NOT EXISTS`. CREATE POLICY uses `DROP POLICY IF EXISTS` first. CREATE TRIGGER uses `DROP TRIGGER IF EXISTS` first. Functions use `CREATE OR REPLACE`. Late FK closure uses a `pg_constraint` lookup wrapped in a DO block.

Re-applying any migration should be a no-op. Re-applying after a partial failure should converge to the same state.

## What This Verification Does NOT Cover

These are deferred to a live-DB apply step (not in scope for static review):

1. **Actual application to a database.** No migration was applied. To apply: `supabase db push` against a non-production env.
2. **RLS behavioral test.** Static check confirms RLS is enabled with a policy; behavioral test (insert two rows under different env_ids, set `app.env_id`, verify isolation) requires a live DB.
3. **Trigger behavioral test.** Static check confirms triggers are defined; behavioral test (insert a draft snapshot, release, attempt UPDATE, expect raise) requires a live DB.
4. **Smoke insert chain.** Inserting one fund → portfolio → account → security → trade → lot → relief is the next concrete step before Phase 2 begins.
5. **Schema lint.** The repo's existing schema lint (if any) hasn't been run. No `verification/lint/no_legacy_repe_reads.py` violations are expected since no engine code exists yet.

## Recommended Next Steps

1. Apply migrations 474–480 to a non-production Supabase env (`supabase db push --linked` after confirming target).
2. Run a smoke insert chain (one row per table where it makes sense) to validate FK ordering.
3. Run two RLS behavioral tests and two trigger behavioral tests as listed above.
4. Begin Phase 2 (services). First service: `backend/app/services/accounting_engine.py` per `winston-investment-engine-module` discipline.
