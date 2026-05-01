# ADR 001 — Lot Accounting Method

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** Paul (owner), Investment Engine architecture
- **Supersedes:** —
- **Superseded by:** —
- **Related:** ADR 002 (currency), ADR 003 (bi-temporal), `docs/plans/INVESTMENT_ENGINE_PLAN.md`

## Context

The Winston Investment Engine must compute realized and unrealized P&L, cost basis, holding period, and tax-aware metrics across heterogeneous investor types. Two facts force the decision:

1. Tax-aware investors (taxable separate accounts, certain LPs) require **specific-identification (Spec-ID)** to choose which lots to relieve on a sale. FIFO is not adequate — it forces a tax outcome the manager doesn't want.
2. Operationally simpler funds (commingled, certain offshore vehicles) don't need or want lot selection. They just want a consistent, auditable rule. FIFO is the standard.

Average-cost is non-starter for institutional accounting in most jurisdictions; not considered as a primary method.

A second question: how are lots represented?

- **Mutable lot rows** — one row per lot, `open_qty` decremented on every sell. Familiar, compact, and a known source of bugs: any failed transaction that partially mutated a lot row corrupts state irrecoverably without an audit trail. Reconstructing point-in-time lot state requires replaying audit log against current row.
- **Immutable lot rows** — one row per open event (buy, transfer-in, corporate-action issue), one row per close event (sell, transfer-out, corporate-action retire) referencing the open via `closes_lot_id`. `open_qty` derived. Heavier on storage but every state can be reconstructed by filtering rows by `as_of_date`.

The bi-temporal model (ADR 003) and snapshot reproducibility goal (`winston-investment-snapshot`) make immutable representation effectively required. Mutable lots cannot be replayed against a historical input set without a separate event log — at which point the event log is the source of truth and the lot rows are derived state, which is exactly the immutable model.

## Decision

The investment engine supports **both FIFO and Specific-ID**, configured per fund, with the following representation:

1. **Lot relief method is a fund-level configuration.** `funds.lot_relief_method` is one of `fifo` or `spec_id`. No global default — every fund must declare. Default in seeds is `fifo`.

2. **Lots are immutable rows.** The table `position_lots` has rows representing open events only. Each row carries `open_qty_initial` (constant for the row's lifetime) and is never updated.

3. **Lot relief is recorded as a separate row** in `position_lot_reliefs`, with `lot_id`, `qty_relieved`, `relief_event_id` (links to the trade or transfer that caused the relief), `relief_date`, and `relief_method` (`fifo` | `spec_id`).

4. **`positions_current.open_qty`** is derived: `open_qty_initial - sum(reliefs.qty_relieved)` for each lot, rolled up to position. Stored as a materialized view refreshed within the close cycle, OR as a regular view — perf decision deferred to schema PR.

5. **Spec-ID requires explicit lot selection on the sell side.** A sell trade with `lot_relief_method='spec_id'` MUST include `selected_lot_ids` in its payload. Service rejects the trade if missing or if any selected lot has insufficient open qty as of the trade's `effective_date`. No silent fallback to FIFO.

6. **FIFO selection is deterministic.** When `lot_relief_method='fifo'`, the service selects lots ordered by `(open_event_date ASC, lot_id ASC)`. Tie-break on `lot_id` is required for determinism — same input must produce same output. Without it, two valid orderings exist when two lots opened on the same date and the choice affects realized P&L.

7. **Average cost is explicitly out of scope.** Not implemented in V1. If a future fund requires it, a new ADR adds a third value to `funds.lot_relief_method` and the relief logic gets a third branch. No retrofit of existing data.

## Consequences

### Positive

- Reproducibility: any historical lot state is `position_lots` ⨝ `position_lot_reliefs` filtered by `effective_date <= as_of_date`. No replay machinery needed.
- Audit story is trivial: every relief is a row with a foreign key to the event that caused it. "Why was this lot closed" answers itself.
- Bi-temporal corrections (a backdated trade) don't mutate anything — they insert a new relief with the corrected `effective_date` and the original incorrect relief gets a `voided_by` column. Originals are never overwritten.
- Spec-ID is correct by construction: explicit selection or refuse to execute.
- FIFO is fully deterministic — required for the testability discipline.

### Negative

- Storage cost is meaningfully higher. A position that turns over 100x has 100 lot rows + 100 relief rows where a mutable model has 1 row. Mitigated by partitioning `position_lots` and `position_lot_reliefs` by year on `effective_date` from the first migration.
- `open_qty` lookups require a join + aggregate. Mitigated by `positions_current` as a refreshed view used for hot-path reads. Cold-path reconstruction reads the underlying tables directly.
- Spec-ID UX: the OMS must present the user with lot selection on every sell. Some users will find this heavy. Acceptable cost; tax-aware investors expect it.

### Neutral

- Adds a column (`lot_relief_method`) and a table (`position_lot_reliefs`) to the schema. No impact on non-position modules.

## Alternatives Considered

**Mutable lot rows with audit-driven reconstruction.** Rejected. Bug class is real and known from prior experience in similar systems. Reconstruction logic lives outside the table and must be kept in sync with the mutation logic — drift is inevitable.

**Single relief method (FIFO only) for V1, Spec-ID later.** Rejected. The fund-level method is one column; supporting both up front costs almost nothing and avoids a painful migration later when the first tax-aware investor onboards. The hard work is the immutable representation, which both methods need.

**Average cost as a third method now.** Rejected. Not required by any near-term fund. Adds a branch in the relief logic that we'd own forever for no near-term value.

**Compute lot relief at read time only (no stored reliefs).** Rejected. Realized P&L on a closed lot must be a stored, audited fact — it has tax implications. Computing it on demand means it can change silently when upstream prices or FX rates change, which violates ADR 002 and ADR 003 invariants.

## Implementation Notes

Schema lives in `repo-b/db/schema/`, files numbered per the project DB rules. Required tables:

- `position_lots` — open events. Columns include `lot_id`, `position_id`, `security_id`, `open_event_id`, `open_event_date` (effective_date of the opening trade), `open_qty_initial`, `cost_basis_native`, `cost_basis_native_ccy`, `fx_rate_id_at_open`, env_id/business_id, audit columns.
- `position_lot_reliefs` — close events. Columns include `relief_id`, `lot_id`, `qty_relieved`, `relief_event_id`, `relief_event_date`, `relief_method`, `realized_pnl_native`, `voided_by` (nullable, points at a superseding relief), env_id/business_id, audit columns.
- `funds.lot_relief_method` — column added to existing `funds` table.

Service `accounting_engine` exposes `relieve_lots(position_id, qty, method, selected_lot_ids?)` returning the list of `(lot_id, qty)` pairs and the realized P&L per lot. Pure function — no DB writes — caller persists the relief rows inside the transaction with the trade.

## Verification

- Unit test: FIFO with two lots opened same day produces deterministic ordering across 100 reruns.
- Unit test: Spec-ID rejects when `selected_lot_ids` missing.
- Unit test: Spec-ID rejects when selected lot has insufficient open qty as of `effective_date`.
- Property test: for any sequence of buys and sells, sum of relief `qty_relieved` ≤ corresponding lot `open_qty_initial` always.
- Replay test: historical lot state at any past `effective_date` reconstructed from rows alone produces the same balances the system showed at that time.
