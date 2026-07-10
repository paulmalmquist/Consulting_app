# 0022 - Sustainability T3: Authoritative Schema Migration

- Status: Done (2026-07-10) - relay authored the DDL (blocked on migration-approval policy + an under-specified criterion; DDL verified correct on human review, criterion corrected). Applied to prod after CI schema-gate proof.
- Environment: Business OS / Sustainability
- Risk: Medium (DB schema migration; additive)
- Scope: Add the governed authoritative-state schema for sustainability metrics as one additive migration. One ticket (T3 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- ADR: `docs/adr/sustainability/0001-brownfield-extension.md` (T1, decision 5: mirror the REPE authoritative-state contract).

## Background

T3 from plan 0018: create the next feature migration with `sus_authoritative_snapshots`, `sus_authoritative_metric_value`, `sus_authoritative_evidence`, mirroring `re_authoritative_snapshots`. The next feature migration number is **618** (the dense feature sequence ends at `617_ade_ops_incidents.sql`; `900+`/`9997+`/`10xxx` are reserved run-last bands). `sus_` is an approved prefix in `ARCHITECTURE.md`. These three tables do not exist yet (plan 0018 gap 1).

The pattern to mirror is `repo-b/db/schema/459_re_authoritative_snapshot_audit.sql`: a run/version table plus per-scope state tables carrying `snapshot_version`, `promotion_state` (draft_audit/verified/released), `trust_status` (trusted/untrusted/missing_source), `env_id`, `business_id`, and jsonb `canonical_metrics`/`display_metrics`/`null_reasons`/`formulas`, with an `updated_at` trigger and a released-row immutability trigger.

### Tenant-scoping convention (important, verified against the tree)

`287_re_sustainability.sql` (17 tables) and `459_re_authoritative_snapshot_audit.sql` apply **no inline Postgres RLS**; `900_rls.sql` covers only the core platform tables (tenant/business/actor/...), not the `sus_` or `re_authoritative_` families. Those families enforce tenant isolation at the **application layer**: every column set carries `env_id TEXT NOT NULL` + `business_id UUID NOT NULL` and every service query filters on them. `618` follows that established convention for consistency with the sibling authoritative and sustainability tables it interoperates with. Adding inline RLS to only these three tables would diverge from all 20 sibling tables and risk breaking app-layer reads. The `env_id` + `business_id` columns plus app-layer scoping are the tenant boundary; this is the ARCHITECTURE.md-consistent exemption for these table families.

## Scope

In scope: create `repo-b/db/schema/618_sus_authoritative.sql` containing:
- `sus_authoritative_snapshots` - the run/version table (one row per released snapshot version), with `snapshot_version` unique, `env_id`, `business_id`, `entity_scope` (portfolio/fund/investment/asset), `period_key`, `metric_family`, `promotion_state` (draft_audit/verified/released CHECK), `state_origin`, `trust_status` (trusted/untrusted/missing_source CHECK), `formula_id`, `input_hash`, `period_exact` (boolean), `null_reason`, timestamps, and the created/verified/released audit columns.
- `sus_authoritative_metric_value` - the released numeric value per metric key per snapshot, with `snapshot_version` (FK-by-value to the snapshots table), `env_id`, `business_id`, `metric_key`, `value_numeric` (nullable), `unit`, `null_reason` (nullable), `promotion_state`, `trust_status`.
- `sus_authoritative_evidence` - per-metric provenance rows pointing back to source ids (`source_table`, `source_row_ref`, `emission_factor_set_id`, `ingestion_run_id`, `formula_id`), with `snapshot_version`, `env_id`, `business_id`, `metric_key`.
- For every table: `env_id TEXT NOT NULL`, `business_id UUID NOT NULL`, a primary key, `created_at timestamptz NOT NULL DEFAULT now()`, at least one justified index on a real query path (e.g. `(business_id, env_id, period_key, promotion_state)` on snapshots; `(snapshot_version, metric_key)` on values and evidence), and a `COMMENT ON TABLE` naming its purpose and owning module (sustainability authoritative layer).
- A released-row immutability trigger (adapt the `459` `enforce_promotion` pattern) so a `released` snapshot row cannot be mutated or deleted, and an `updated_at` touch trigger, both guarded with `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` so re-running the migration is idempotent.

Out of scope (explicit):
- Any backend service, route, or frontend change (T4/T5/T6/T7 own those).
- Editing any other schema file, including `900_rls.sql`, `287_re_sustainability.sql`, or `459`.
- Adding inline RLS (see the convention note above).
- Seeding data or writing authoritative rows.

## Acceptance Criteria

### Screen
Not applicable.

### API
Not applicable.

### DB/Data
- A new file `repo-b/db/schema/618_sus_authoritative.sql` exists (feature band 618, not the reserved 900+/9997+/10xxx bands).
- It creates exactly three tables: `sus_authoritative_snapshots`, `sus_authoritative_metric_value`, `sus_authoritative_evidence`, each with `CREATE TABLE IF NOT EXISTS`.
- Every one of the three tables declares `env_id TEXT NOT NULL` and `business_id UUID NOT NULL`.
- `sus_authoritative_snapshots` carries all of: `snapshot_version`, `promotion_state`, `state_origin`, `trust_status`, `period_exact`, `null_reason`, `formula_id`, `input_hash` (column names present in the DDL).
- `promotion_state` has a CHECK constraint restricting it to `draft_audit`, `verified`, `released`; `trust_status` has a CHECK restricting it to `trusted`, `untrusted`, `missing_source`.
- Each table has at least one `CREATE INDEX` on a named column path and a `COMMENT ON TABLE` explaining purpose + owning module.
- A trigger enforces the authoritative-state immutability contract on `sus_authoritative_snapshots`, mirroring `459_re_authoritative_snapshot_audit.sql`: the snapshot payload is immutable after insert (only `promotion_state` and the verified/released audit columns may change), a `released` row cannot be mutated or deleted, and invalid promotion transitions are rejected. Trigger creation is idempotent (guarded against duplicate_object). Note: this is intentionally stricter than "released-row-only immutability" - full payload immutability after insert is the authoritative-state contract (you mint a new `snapshot_version` rather than mutating), and it matches the sibling REPE tables the reader interoperates with.
- The migration applies cleanly and verifies on the DB Schema Gate CI job (apply + verify against a throwaway database).

### AI behavior
Not applicable (no reader wired yet; that is T4).

### Evals/tests
- The DB Schema Gate CI job (`apply + verify`) passes for this migration. No pytest suite is otherwise required, since no `backend/**` or `repo-b/src/**` code changes. The diff is a single new `.sql` file plus this plan.

### Regression guard
- No file other than the new `618_sus_authoritative.sql` and this plan is modified. Specifically, `900_rls.sql`, `287_re_sustainability.sql`, `459_re_authoritative_snapshot_audit.sql`, and every existing schema file are untouched.
- No `backend/` or `repo-b/src/` file is changed.
- The migration is additive only: it contains no `DROP TABLE`, no `ALTER TABLE ... DROP`, and no destructive data statement.
