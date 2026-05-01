---
name: winston-investment-snapshot
description: Locked / versioned snapshot lifecycle for the Winston Investment Engine. Defines the table shape, status state machine, partial unique index, immutability triggers, and reconstruct() contract used by NAV, P&L, position valuation, risk, performance, and report-output snapshots. Use any time a new authoritative output needs draft → locked → released semantics, or when extending an existing snapshot table.
source_of_truth: true
entrypoint: true
triggers:
  - snapshot lifecycle
  - authoritative snapshot
  - NAV snapshot
  - P&L snapshot
  - PnL snapshot
  - position valuation snapshot
  - risk snapshot
  - performance snapshot
  - released snapshot
  - lock snapshot
  - release snapshot
  - reconstruct snapshot
  - new snapshot table
  - snapshot reproducibility
status: active
phase: A
related:
  - skills/winston-investment-engine-module/SKILL.md
  - docs/plans/INVESTMENT_ENGINE_PLAN.md
  - docs/adr/investment-engine/003-bi-temporal-time-model.md
  - docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md
---

# Winston Investment Snapshot

A snapshot in the Winston Investment Engine is an authoritative output for a `(entity, effective_date)` pair. NAV, P&L, position valuation, risk, performance, and report output are all snapshots. They share one shape, one state machine, and one reconstruction contract.

This skill exists because every snapshot table that drifts from the shared shape becomes a bug source — typically silent mutation of released state or non-reproducible outputs. Uniformity is the audit story.

## When to Use

- Adding a new authoritative-output table (any module that produces a "this is the released value for date X")
- Extending an existing snapshot table with new payload columns
- Reviewing whether an existing table needs to be re-shaped to match
- Implementing or modifying the `release` / `supersede` / `reconstruct` flow

## When NOT to Use

- Transactional rows (trades, accruals, FX rate rows). Those are immutable inputs, not snapshots — they don't have draft / locked / released semantics.
- Operational logs (audit_log, mutation_events). Those are append-only event streams, not bi-temporal outputs.
- Configuration tables (funds, securities). Those are slowly changing dimensions; use SCD2 patterns elsewhere.

---

## The Snapshot Shape

Every snapshot table includes ALL of the following columns. No exceptions.

```sql
CREATE TABLE <module>_snapshots (
    -- Identity
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type         TEXT NOT NULL,            -- e.g., 'fund', 'portfolio'
    entity_id           UUID NOT NULL,
    effective_date      DATE NOT NULL,            -- business date the snapshot pertains to
    as_of_date          TIMESTAMPTZ NOT NULL,     -- moment the snapshot was computed

    -- Lifecycle
    status              TEXT NOT NULL CHECK (status IN ('draft','locked','released','superseded')),
    version             INTEGER NOT NULL,
    superseded_by_id    UUID REFERENCES <module>_snapshots(id),
    superseded_reason   TEXT,

    -- Reproducibility
    input_versions      JSONB NOT NULL,           -- input ID set used to compute payload

    -- Provenance
    produced_by         TEXT NOT NULL,            -- service identifier or user
    produced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Tenancy + audit (project DB rules)
    env_id              TEXT NOT NULL,
    business_id         UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Payload columns (module-specific) follow.
    -- Every translated monetary value carries its fx_rate_id (per ADR 002).
    nav                 NUMERIC(28,8),            -- example payload column
    nav_currency        CHAR(3),
    nav_fx_rate_id      UUID REFERENCES fx_rates(fx_rate_id)
);
```

### Required indexes

```sql
-- Partial unique: only one released row per (entity, effective_date) at a time
CREATE UNIQUE INDEX <module>_snapshots_released_unique
    ON <module>_snapshots (entity_id, effective_date)
    WHERE status = 'released';

-- "As of" reads: get the row for a given effective_date as known on a given as_of_date
CREATE INDEX <module>_snapshots_as_of
    ON <module>_snapshots (entity_id, effective_date, as_of_date DESC);

-- Close-cycle queries: pick all draft / locked rows for a period
CREATE INDEX <module>_snapshots_status_period
    ON <module>_snapshots (status, effective_date);
```

### Required RLS

```sql
ALTER TABLE <module>_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY <module>_snapshots_env_isolation
    ON <module>_snapshots
    USING (env_id = current_setting('app.env_id', true));
```

### Required immutability trigger

```sql
CREATE OR REPLACE FUNCTION block_released_mutation() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'cannot delete released snapshot %', OLD.id;
    END IF;
    -- Allow exactly one transition out of 'released': to 'superseded'
    IF OLD.status = 'released' AND NEW.status NOT IN ('released', 'superseded') THEN
        RAISE EXCEPTION 'cannot mutate released snapshot %', OLD.id;
    END IF;
    -- Block payload edits on released rows even if status stays 'released'
    IF OLD.status = 'released' AND NEW.status = 'released' THEN
        IF NEW.input_versions IS DISTINCT FROM OLD.input_versions THEN
            RAISE EXCEPTION 'cannot edit input_versions on released snapshot %', OLD.id;
        END IF;
        -- (each module adds its payload columns to this guard)
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER <module>_snapshots_block_released
    BEFORE UPDATE OR DELETE ON <module>_snapshots
    FOR EACH ROW EXECUTE FUNCTION block_released_mutation();
```

### Required COMMENT ON TABLE

```sql
COMMENT ON TABLE <module>_snapshots IS
    'Authoritative <module> outputs. Bi-temporal (effective_date + as_of_date). Lifecycle: draft → locked → released → superseded. Released rows immutable. See skills/winston-investment-snapshot.';
```

---

## State Machine

```
                 ┌──────┐  produce()    ┌────────┐  lock()    ┌────────┐  release()  ┌──────────┐
   (no row) ───▶ │draft │ ────────────▶ │locked  │ ─────────▶ │released│ ──────────▶ │superseded│
                 └──────┘  re-produce() └────────┘            └────────┘             └──────────┘
                    │                                              │
                    │  abandon() (delete allowed only here)        │  release(new) on same key
                    ▼                                              ▼
                 (gone)                                         supersedes prior
```

Rules:

- `draft → locked` allowed once review is complete.
- `locked → released` is the act of declaring this the authoritative value for `(entity, effective_date)`. Partial unique index enforces one released row.
- Releasing a new version when a released row already exists for `(entity, effective_date)` automatically transitions the prior release to `superseded` in the same transaction. New row's `version = prior.version + 1`. Prior row's `superseded_by_id = new.id`.
- `released → superseded` is the only allowed transition out of `released`.
- `superseded → anything` is blocked. Past releases are forever.
- `draft → (deleted)` is the only DELETE allowed. Locked / released / superseded never delete.

---

## Service Contract

Every snapshot service exposes these four functions. Names are normative.

```python
def produce(entity_id, effective_date, ...) -> SnapshotResult:
    """
    Compute the snapshot from authoritative inputs. Writes a 'draft' row
    with input_versions recorded. Returns the snapshot id.
    Fail-closed per the engine module rules: any missing input → valid=False.
    """

def lock(snapshot_id) -> SnapshotResult:
    """
    Transition draft → locked. Verifies snapshot is still consistent with
    its recorded input_versions (reconstruct() returns equal). Writes audit row.
    """

def release(snapshot_id) -> SnapshotResult:
    """
    Transition locked → released. Supersedes any prior released row for
    (entity, effective_date) in the same transaction. Writes audit rows for
    both the release and the supersession.
    """

def reconstruct(snapshot_id) -> ReconstructResult:
    """
    Load input_versions, fetch each referenced input by id, recompute
    the payload, and assert byte-equality with the stored payload.
    Returns ReconstructResult{equal: bool, divergences: [...]}.
    Used by:
      - lock() to verify drift hasn't crept in
      - nightly sample job to catch silent mutation
      - audit / explain flows to show how a number was produced
    """
```

`SnapshotResult` is the same `EngineResult` shape from `winston-investment-engine-module`.

---

## Reconstruct Contract — The Heart of This Skill

Reconstruct is what makes the snapshot pattern audit-grade. The promise:

> Given a `snapshot_id`, the system can reproduce the exact payload byte-for-byte from the inputs that existed when the snapshot was first produced.

This requires:

1. **`input_versions` is sufficient.** Every input the calculation depended on is referenced by ID in the jsonb. Examples:
   - `{"fx_rates": ["uuid-1", "uuid-2"], "prices": ["uuid-a", "uuid-b"], "lot_relief_max_id": 12345, "position_lots_max_id": 67890}`
   - For "max_id" style references, every row up to and including that id with `effective_date <= snapshot.effective_date` is part of the input set.
2. **Inputs are immutable.** FX rates per ADR 002 (corrections create new rows, not edits). Lot reliefs per ADR 001 (corrections create new rows with `voided_by`). This is why those ADRs matter for reproducibility.
3. **The calculation is deterministic.** Per `winston-investment-engine-module` — no `datetime.now()`, no random tie-breaks, no system clock reads.

If reconstruct ever returns `equal=False`, one of the three above broke. That's a hard incident, not a warning.

### Nightly sample job

A scheduled task picks N random released snapshots per night and runs reconstruct on each. Configuration: env-level `snapshot_reconstruct_sample_size` (default 50 per env). Divergence pages oncall and writes a `reconstruct_divergence` row with the input set diffs.

---

## Workflow

When invoked, this skill executes:

1. **Confirm the table needs to be a snapshot.** If the underlying need is "authoritative output for `(entity, effective_date)`," yes. If it's a transactional row or a slowly-changing dimension, no.
2. **Write the migration.** Follow the shape above. Include all required columns, indexes, RLS, immutability trigger, and `COMMENT ON TABLE`.
3. **Wire the service.** Implement `produce / lock / release / reconstruct`. Reconstruct is non-optional even for V1.
4. **Wire the audit hooks.** Each of the four service functions writes an audit row with `change_type` of `insert`, `lock`, `release`, or `supersede`. Reconstruct does NOT write audit (it's read-only).
5. **Add the unit tests.** See checklist below.
6. **Add to the nightly reconstruct sample job.** New snapshot tables register themselves in the sample job's table list.

---

## Test Checklist (per snapshot module)

- [ ] `produce` writes a draft row with `input_versions` populated
- [ ] `produce` is fail-closed for every required input (missing FX, missing price, missing position)
- [ ] `lock` rejects if `reconstruct(...).equal == False`
- [ ] `release` enforces uniqueness — second release for same `(entity, effective_date)` supersedes prior in one transaction
- [ ] DB trigger blocks UPDATE on released row except for the supersession transition
- [ ] DB trigger blocks DELETE on released or superseded rows
- [ ] DB trigger blocks edits to `input_versions` on released rows
- [ ] `reconstruct` returns `equal=True` for a freshly produced snapshot
- [ ] `reconstruct` returns `equal=True` after an unrelated input correction is inserted (the snapshot's pinned input IDs are unchanged)
- [ ] `getX(entity, effective_date, as_of_date=...)` returns the correct historical version for at least three different `as_of_date` values
- [ ] Round-trip: produce → lock → release → reconstruct returns `equal=True` end to end

---

## Anti-Patterns (Reject on Sight)

- A snapshot table without `input_versions`. The reconstruct contract is non-optional.
- A snapshot table without the immutability trigger. RLS is not the same protection.
- A `released → released` mutation that edits payload. Releasing a new version is the only allowed path.
- An `input_versions` jsonb that records "as of timestamp" instead of input IDs. Timestamps are not addressable; a corrected input might land with the same timestamp.
- A `release()` implementation that doesn't supersede the prior release in the same transaction. Two released rows for one key is data corruption.
- A reconstruct that loads "current" inputs instead of `input_versions`-pinned inputs. The whole point is replaying against the historical input set.
- A snapshot table with translated monetary values but no `fx_rate_id` columns. Per ADR 002, every translated value carries its rate ID.
- A "delete superseded snapshots after N days" cron. They're forever. Archive to cold storage, never delete in V1.

---

## Snapshot Tables in the V1 / Wave 1 Plan

| Table | Module | Wave | Notes |
|---|---|---|---|
| `nav_snapshots` | `accounting_engine` | 0 (V1) | Per project instructions |
| `pnl_snapshots` | `accounting_engine` | 0 (V1) | Realized + unrealized + FX |
| `position_valuations` | `accounting_engine` | 0 (V1) | Per-position |
| `risk_snapshots` | `risk_engine` | 1 | VaR + scenarios + factor exposures |
| `performance_snapshots` | `accounting_engine` | 1 | TWR / IRR; separate from `pnl_snapshots` |
| `report_outputs` | `reporting` | 3 | Rendered report artifacts |

Each follows the shape. No table-specific carve-outs.
