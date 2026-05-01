# Plan: Phase 1 — `core_data` Schema

- **Wave:** 0 (V1 vertical slice)
- **Module:** `core_data`
- **Status:** Approved for implementation
- **Authored:** 2026-04-30
- **Drives:** Migrations 474–480 in `repo-b/db/schema/`
- **Blocks:** All Phase 2+ work (services, routes, UI)

## Scope

The schema for the entire investment engine, all tables required by V1 plus the snapshot shape for downstream waves. Seven sub-areas, one migration file each:

| File | Sub-area | Tables |
|---|---|---|
| `474_inv_core_entities.sql` | core entities | `inv_fund`, `inv_portfolio`, `inv_account`, `inv_security`, `inv_benchmark` |
| `475_inv_positions.sql` | positions | `inv_position_lot`, `inv_position_lot_relief`, `inv_position_current` (view) |
| `476_inv_transactions.sql` | transactions | `inv_trade`, `inv_cash_movement`, `inv_accrual` |
| `477_inv_pricing.sql` | pricing | `inv_security_price`, `inv_fx_rate`, `inv_curve` |
| `478_inv_accounting_snapshots.sql` | accounting snapshots | `inv_nav_snapshot`, `inv_pnl_snapshot`, `inv_position_valuation` |
| `479_inv_reconciliation.sql` | reconciliation | `inv_source_position`, `inv_reconciliation_run`, `inv_reconciliation_break` |
| `480_inv_audit.sql` | audit + lineage | `inv_audit_log`, `inv_data_version`, `inv_mutation_event` |

Table prefix `inv_` is used uniformly to avoid collision with existing `app.*`, `re_*`, `repe_*`, `fin_*` tables. The investment engine is a distinct module per the plan.

## Universal Column Set

Every user-facing table includes:

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
env_id          text NOT NULL,
business_id     uuid NOT NULL,
created_at      timestamptz NOT NULL DEFAULT now(),
updated_at      timestamptz NOT NULL DEFAULT now()
```

Every table gets RLS enabled with the standard tenant policy:

```sql
ALTER TABLE inv_<table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_<table>_env_isolation ON inv_<table>
    USING (env_id = current_setting('app.env_id', true));
```

Every table gets a `COMMENT ON TABLE` describing its purpose and owning module.

`updated_at` is maintained by an `inv_set_updated_at()` trigger function (created once in 474, reused by all subsequent migrations).

## Snapshot Column Set (per `winston-investment-snapshot` skill)

Tables `inv_nav_snapshot`, `inv_pnl_snapshot`, `inv_position_valuation` add the snapshot shape on top of the universal set:

```sql
entity_type         text NOT NULL,
entity_id           uuid NOT NULL,
effective_date      date NOT NULL,
as_of_date          timestamptz NOT NULL,
status              text NOT NULL CHECK (status IN ('draft','locked','released','superseded')),
version             integer NOT NULL,
superseded_by_id    uuid REFERENCES <self>(id),
superseded_reason   text,
input_versions      jsonb NOT NULL,
produced_by         text NOT NULL,
produced_at         timestamptz NOT NULL DEFAULT now()
```

Plus the partial unique index, the "as of" index, the close-cycle index, and the `block_released_mutation` trigger from the snapshot skill.

## Table-by-Table Specs

### 474 — Core Entities

**`inv_fund`** — top of the entity hierarchy. ADR-driven columns marked.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | universal |
| `env_id`, `business_id` | text/uuid | universal |
| `name` | text NOT NULL | |
| `legal_name` | text | |
| `inception_date` | date NOT NULL | |
| `base_currency` | char(3) NOT NULL | ADR 002 — required |
| `lot_relief_method` | text NOT NULL CHECK IN ('fifo','spec_id') | ADR 001 — fund-level config |
| `spot_fx_source` | text NOT NULL DEFAULT 'wm_reuters_4pm' | ADR 002 |
| `period_end_fx_source` | text NOT NULL DEFAULT 'derived_from_spot' | ADR 002 |
| `status` | text NOT NULL CHECK IN ('active','wound_down','draft') | |
| `created_at`, `updated_at` | timestamptz | universal |

Indexes: `(env_id, business_id, status)`, `(env_id, name)` unique within env_id.

**`inv_portfolio`** — a fund may have one or many portfolios. A portfolio has a benchmark.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `fund_id` | uuid NOT NULL REFERENCES inv_fund(id) | |
| `name` | text NOT NULL | |
| `benchmark_id` | uuid REFERENCES inv_benchmark(id) | nullable |
| `currency` | char(3) NOT NULL | reporting currency, may differ from fund base |
| (universal cols) | | |

**`inv_account`** — a portfolio may have one or many accounts (custodian / broker accounts). Used for allocation and reconciliation.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `portfolio_id` | uuid NOT NULL REFERENCES inv_portfolio(id) | |
| `name` | text NOT NULL | |
| `external_account_number` | text | nullable, for reconciliation |
| `custodian` | text | |
| (universal cols) | | |

**`inv_security`** — security master.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `ticker` | text | nullable (private assets have none) |
| `cusip` | text | |
| `isin` | text | |
| `figi` | text | |
| `asset_class` | text NOT NULL CHECK IN ('equity','fixed_income','derivative','private','cash','other') | |
| `currency` | char(3) NOT NULL | denomination |
| `issuer` | text | |
| `sector` | text | |
| `country` | char(2) | |
| `metadata` | jsonb NOT NULL DEFAULT '{}' | non-relational extras only |
| (universal cols) | | |

Unique partial indexes on `(env_id, ticker)` where ticker not null, similar for cusip / isin / figi.

**`inv_benchmark`** — index reference for portfolios.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `code` | text NOT NULL | e.g., 'SPX', 'AGG' |
| `name` | text NOT NULL | |
| `currency` | char(3) NOT NULL | |
| (universal cols) | | |

### 475 — Positions

**`inv_position_lot`** — immutable lot opens, per ADR 001.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `account_id` | uuid NOT NULL REFERENCES inv_account(id) | |
| `security_id` | uuid NOT NULL REFERENCES inv_security(id) | |
| `open_event_id` | uuid NOT NULL | trade or transfer-in id |
| `open_event_date` | date NOT NULL | effective_date of open |
| `open_qty_initial` | numeric(28,8) NOT NULL CHECK (> 0) | NEVER updated |
| `cost_basis_native` | numeric(28,8) NOT NULL | per unit × qty in native ccy |
| `cost_basis_currency` | char(3) NOT NULL | |
| `fx_rate_id_at_open` | uuid REFERENCES inv_fx_rate(id) | per ADR 002 |
| (universal cols) | | |

Indexes: `(env_id, account_id, security_id, open_event_date)`, `(env_id, security_id)`.
Partition by `open_event_date` year (declarative range partitioning) — defined in this migration but only one partition created.

**`inv_position_lot_relief`** — close events. One row per partial or full relief.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `lot_id` | uuid NOT NULL REFERENCES inv_position_lot(id) | |
| `qty_relieved` | numeric(28,8) NOT NULL CHECK (> 0) | |
| `relief_event_id` | uuid NOT NULL | trade or transfer-out id |
| `relief_event_date` | date NOT NULL | effective_date of close |
| `relief_method` | text NOT NULL CHECK IN ('fifo','spec_id') | |
| `realized_pnl_native` | numeric(28,8) NOT NULL | |
| `realized_pnl_currency` | char(3) NOT NULL | |
| `fx_rate_id_at_relief` | uuid REFERENCES inv_fx_rate(id) | |
| `voided_by_id` | uuid REFERENCES inv_position_lot_relief(id) | nullable, supersession |
| (universal cols) | | |

Indexes: `(env_id, lot_id)`, `(env_id, relief_event_date)`.

Trigger: `block_lot_relief_overdraw` — BEFORE INSERT, raises if `qty_relieved > (open_qty_initial - SUM(prior reliefs not voided))`.

**`inv_position_current`** — DERIVED view, not a table.

```sql
CREATE OR REPLACE VIEW inv_position_current AS
SELECT
  l.env_id,
  l.business_id,
  l.account_id,
  l.security_id,
  SUM(l.open_qty_initial) - COALESCE(SUM(r.qty_relieved) FILTER (WHERE r.voided_by_id IS NULL), 0) AS open_qty,
  ...
FROM inv_position_lot l
LEFT JOIN inv_position_lot_relief r ON r.lot_id = l.id
GROUP BY l.env_id, l.business_id, l.account_id, l.security_id;
```

V1 ships as a regular view. If perf becomes an issue, promote to materialized view in a later migration.

### 476 — Transactions

**`inv_trade`** — buy/sell events. Authoritative source for lot opens and reliefs.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `account_id` | uuid NOT NULL REFERENCES inv_account(id) | |
| `security_id` | uuid NOT NULL REFERENCES inv_security(id) | |
| `side` | text NOT NULL CHECK IN ('buy','sell','transfer_in','transfer_out') | |
| `qty` | numeric(28,8) NOT NULL CHECK (> 0) | |
| `price_native` | numeric(28,8) NOT NULL | |
| `price_currency` | char(3) NOT NULL | |
| `effective_date` | date NOT NULL | ADR 003 — business date |
| `booking_date` | date NOT NULL | ADR 003 — recordkeeping date |
| `selected_lot_ids` | uuid[] | nullable; required when side='sell' AND fund.lot_relief_method='spec_id' |
| `corrects_id` | uuid REFERENCES inv_trade(id) | nullable; pointer to corrected row |
| `external_ref` | text | broker / source id |
| (universal cols) | | |

Indexes: `(env_id, account_id, effective_date)`, `(env_id, security_id, effective_date)`, `(env_id, booking_date)`.

CHECK constraint: when `side='sell'` and the fund's `lot_relief_method='spec_id'`, `selected_lot_ids IS NOT NULL`. This is enforced in the service layer (CHECK can't reach across tables) but the column is shaped for it.

**`inv_cash_movement`** — non-trade cash events: contributions, distributions, fees, dividends received.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `account_id` | uuid NOT NULL REFERENCES inv_account(id) | |
| `movement_type` | text NOT NULL CHECK IN ('contribution','distribution','fee','dividend','interest','tax_withholding','other') | |
| `amount_native` | numeric(28,8) NOT NULL | sign matters: positive=in, negative=out |
| `currency` | char(3) NOT NULL | |
| `effective_date` | date NOT NULL | |
| `booking_date` | date NOT NULL | |
| `corrects_id` | uuid REFERENCES inv_cash_movement(id) | |
| `metadata` | jsonb NOT NULL DEFAULT '{}' | |
| (universal cols) | | |

**`inv_accrual`** — interest, fee, dividend accruals. Booked but not yet paid.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `account_id` | uuid NOT NULL REFERENCES inv_account(id) | |
| `security_id` | uuid REFERENCES inv_security(id) | nullable for fund-level fees |
| `accrual_type` | text NOT NULL CHECK IN ('interest','dividend','management_fee','incentive_fee','expense','other') | |
| `amount_native` | numeric(28,8) NOT NULL | |
| `currency` | char(3) NOT NULL | |
| `effective_date` | date NOT NULL | when the accrual pertains to |
| `paid_movement_id` | uuid REFERENCES inv_cash_movement(id) | nullable; when accrual is settled |
| (universal cols) | | |

### 477 — Pricing

**`inv_security_price`** — daily prices. One row per (security, price_date, source).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `security_id` | uuid NOT NULL REFERENCES inv_security(id) | |
| `price_date` | date NOT NULL | |
| `price_native` | numeric(28,8) NOT NULL | |
| `price_currency` | char(3) NOT NULL | |
| `source` | text NOT NULL | 'bloomberg', 'manual', 'broker_x' |
| `published_at` | timestamptz NOT NULL DEFAULT now() | |
| `superseded_by_id` | uuid REFERENCES inv_security_price(id) | corrections per ADR 002 pattern |
| (universal cols) | | |

Unique partial index: `(env_id, security_id, price_date, source) WHERE superseded_by_id IS NULL`.

**`inv_fx_rate`** — per ADR 002.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `from_ccy` | char(3) NOT NULL | |
| `to_ccy` | char(3) NOT NULL | |
| `rate_date` | date NOT NULL | |
| `rate` | numeric(20,10) NOT NULL CHECK (> 0) | |
| `source` | text NOT NULL | 'wm_reuters_4pm', 'ecb_reference', 'period_end_2026Q1', 'manual' |
| `published_at` | timestamptz NOT NULL DEFAULT now() | |
| `superseded_by_id` | uuid REFERENCES inv_fx_rate(id) | |
| (universal cols) | | |

Unique partial index: `(env_id, from_ccy, to_ccy, rate_date, source) WHERE superseded_by_id IS NULL`.

**`inv_curve`** — yield / credit curves. Day-1 in jsonb per project instructions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `curve_type` | text NOT NULL CHECK IN ('treasury','credit','swap','custom') | |
| `curve_date` | date NOT NULL | |
| `currency` | char(3) NOT NULL | |
| `points` | jsonb NOT NULL | `[{tenor: '1Y', rate: 0.0512}, ...]` |
| `source` | text NOT NULL | |
| `published_at` | timestamptz NOT NULL DEFAULT now() | |
| `superseded_by_id` | uuid REFERENCES inv_curve(id) | |
| (universal cols) | | |

### 478 — Accounting Snapshots

All three tables follow the snapshot shape (universal cols + snapshot cols + payload + `block_released_mutation` trigger + the three required indexes).

**`inv_nav_snapshot`** — fund-level NAV.

Payload columns:
- `total_assets_native numeric(28,8)`
- `total_assets_currency char(3) NOT NULL`
- `total_assets_fx_rate_id uuid REFERENCES inv_fx_rate(id)`
- `total_liabilities_native numeric(28,8)`
- `total_liabilities_currency char(3) NOT NULL`
- `total_liabilities_fx_rate_id uuid REFERENCES inv_fx_rate(id)`
- `nav_native numeric(28,8)` — derived: assets − liabilities
- `nav_base numeric(28,8)` — derived: nav translated to fund.base_currency
- `nav_base_fx_rate_id uuid REFERENCES inv_fx_rate(id)`
- `share_count numeric(28,8)` — for NAV per share
- `nav_per_share numeric(28,8)`

`entity_type` is fixed to `'fund'`. Required CHECK.

Per project instructions: `UNIQUE (entity_id, period_end_date) WHERE status='released'` — implemented as the partial unique on `effective_date` in the snapshot skill shape.

**`inv_pnl_snapshot`** — fund-level P&L for a period.

Payload columns:
- `period_start_date date NOT NULL`
- `realized_pnl_native numeric(28,8)`
- `unrealized_pnl_native numeric(28,8)`
- `fx_pnl_native numeric(28,8)`
- `total_pnl_native numeric(28,8)`
- `total_pnl_base numeric(28,8)`
- `currency char(3) NOT NULL`
- (fx_rate_ids as needed)

**`inv_position_valuation`** — per-position snapshot.

Payload columns:
- `position_account_id uuid NOT NULL REFERENCES inv_account(id)`
- `security_id uuid NOT NULL REFERENCES inv_security(id)`
- `qty numeric(28,8) NOT NULL`
- `price_native numeric(28,8) NOT NULL`
- `price_currency char(3) NOT NULL`
- `price_id uuid REFERENCES inv_security_price(id)`
- `market_value_native numeric(28,8)`
- `market_value_base numeric(28,8)`
- `cost_basis_native numeric(28,8)`
- `unrealized_pnl_native numeric(28,8)`
- (fx_rate_ids as needed)

`entity_type` is `'account_position'`.

### 479 — Reconciliation

**`inv_reconciliation_run`** — header for one reconciliation pass.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `fund_id` | uuid NOT NULL REFERENCES inv_fund(id) | |
| `effective_date` | date NOT NULL | what date is being reconciled |
| `source_a` | text NOT NULL | 'winston', 'custodian_x', 'admin_y' |
| `source_b` | text NOT NULL | |
| `started_at` | timestamptz NOT NULL DEFAULT now() | |
| `completed_at` | timestamptz | |
| `status` | text NOT NULL CHECK IN ('running','completed','failed') | |
| `breaks_count` | integer NOT NULL DEFAULT 0 | denormalized for fast UI |
| (universal cols) | | |

**`inv_source_position`** — positions as reported by an external source for a given run.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `run_id` | uuid NOT NULL REFERENCES inv_reconciliation_run(id) | |
| `source` | text NOT NULL | |
| `external_account_number` | text | |
| `security_identifier` | text NOT NULL | ticker / cusip / isin as supplied |
| `qty` | numeric(28,8) | |
| `market_value_native` | numeric(28,8) | |
| `currency` | char(3) | |
| `as_reported_at` | timestamptz | |
| `raw_payload` | jsonb NOT NULL | original source row preserved |
| (universal cols) | | |

**`inv_reconciliation_break`** — break records. Append-only after insert (no inline resolution per project instructions).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `run_id` | uuid NOT NULL REFERENCES inv_reconciliation_run(id) | |
| `break_type` | text NOT NULL CHECK IN ('quantity_mismatch','price_mismatch','missing_in_a','missing_in_b','stale_data','identifier_unmapped') | |
| `severity` | text NOT NULL CHECK IN ('low','medium','high','critical') DEFAULT 'medium' | |
| `account_id` | uuid REFERENCES inv_account(id) | nullable when account itself is the break |
| `security_id` | uuid REFERENCES inv_security(id) | nullable when security is unmapped |
| `source_a_value` | jsonb | the disputed value from source A |
| `source_b_value` | jsonb | the disputed value from source B |
| `evidence` | jsonb NOT NULL DEFAULT '{}' | run-time context (which rows compared, tolerances applied) |
| `resolved_at` | timestamptz | nullable; for tracking, not for inline fix |
| `resolved_by` | text | |
| `resolution_note` | text | |
| (universal cols) | | |

Trigger: `block_break_field_edit` — BEFORE UPDATE — only `resolved_at`, `resolved_by`, `resolution_note` are mutable. Everything else is locked.

### 480 — Audit + Lineage

**`inv_audit_log`** — append-only.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `entity_type` | text NOT NULL | |
| `entity_id` | uuid NOT NULL | |
| `change_type` | text NOT NULL CHECK IN ('insert','update','delete','release','supersede','void','lock') | |
| `previous_state` | jsonb | null on insert |
| `new_state` | jsonb | null on delete |
| `actor` | text NOT NULL | user id or service identifier |
| `reason` | text | |
| `correlation_id` | text | request id |
| (universal cols) | | |

Trigger: `block_audit_mutation` — BEFORE UPDATE OR DELETE — RAISE always. Append-only enforced at DB.

Index: `(env_id, entity_type, entity_id, created_at DESC)` — primary read pattern is "show me this entity's history."
Index: `(env_id, correlation_id)` — for tracing.
Index: `(env_id, created_at DESC)` — for global audit feed (used sparingly, partition required at scale).

Per `INVESTMENT_ENGINE_PLAN.md` risks section: partition by `created_at` month from day one. Migration creates the partitioned parent + one current partition. A separate cron creates next-month partitions.

**`inv_data_version`** — input addressing.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `entity_type` | text NOT NULL | 'price', 'fx_rate', 'lot_relief', etc. |
| `entity_id` | uuid NOT NULL | |
| `version_token` | text NOT NULL | usually entity_id but kept abstract |
| `superseded_by_id` | uuid REFERENCES inv_data_version(id) | |
| `effective_from` | timestamptz NOT NULL DEFAULT now() | |
| (universal cols) | | |

Used by snapshot reconstruct flows when an input table doesn't naturally have a `superseded_by_id` chain.

**`inv_mutation_event`** — high-frequency event stream. Lighter than audit_log, used for state-machine transitions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `entity_type` | text NOT NULL | |
| `entity_id` | uuid NOT NULL | |
| `event_type` | text NOT NULL | 'order_approved', 'snapshot_locked', etc. |
| `payload` | jsonb NOT NULL DEFAULT '{}' | |
| `correlation_id` | text | |
| (universal cols) | | |

Append-only via the same trigger pattern as audit_log.

## Cross-Migration Concerns

**Triggers shared across migrations.** Defined once in 474:
- `inv_set_updated_at()` — bumps `updated_at` on UPDATE
- `inv_block_released_mutation()` — used by 478 snapshot tables
- `inv_block_append_only()` — used by 480 audit + mutation_event tables

**Foreign key direction.** Snapshots reference inputs (prices, fx_rates, accounts) — never the reverse. Inputs are immutable. Snapshots are the consumers.

**No JSONB-only joins.** Per project instructions. Where a relation is a real domain link (a position to its lots, a snapshot to its source FX rate), it's a column with a foreign key. JSONB is reserved for `metadata`, `points` (curves), `evidence` (breaks), `payload` (mutation events), `input_versions` (snapshots), `raw_payload` (source positions) — none of which are relational.

**Partitioning.** `inv_position_lot`, `inv_position_lot_relief`, `inv_audit_log`, `inv_mutation_event` declared as partitioned in their migrations, with a single partition created. A future migration adds the partition-management cron.

## Verification Plan

After all 7 migrations applied:

1. `verification/lint/no_legacy_repe_reads.py` — must pass; no investment engine code yet, but the lint shouldn't regress.
2. Schema lint (custom): every `inv_*` table has `env_id`, `business_id`, RLS enabled, a tenant policy, a COMMENT ON TABLE, and an `updated_at` trigger.
3. Smoke insert: insert one fund, one portfolio, one account, one security, one trade. Verify FK chain holds.
4. RLS test: insert two rows under different `env_id`s, set `app.env_id` to one, verify SELECT only returns that env's row.
5. Snapshot trigger test: insert a draft `inv_nav_snapshot`, transition to released, attempt UPDATE on the released row — must raise.
6. Append-only test: insert into `inv_audit_log`, attempt UPDATE — must raise.
7. State-lock invariant tests (`backend/tests/test_state_lock_invariants.py`) — must pass.

## Out of Scope for Phase 1

- Service layer (Phase 2)
- Routes (Phase 5)
- Seed data (a separate migration when V1 acceptance demands it)
- Performance / VaR / risk tables (Wave 1)
- OMS / EMS / workflow tables (Wave 2)
- Reporting tables (Wave 3)
