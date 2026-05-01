# ADR 003 — Bi-temporal Time Model

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** Paul (owner), Investment Engine architecture
- **Supersedes:** —
- **Superseded by:** —
- **Related:** ADR 001 (lots), ADR 002 (currency), `docs/plans/INVESTMENT_ENGINE_PLAN.md`, project authoritative-state lockdown

## Context

Institutional accounting needs to answer two different time questions:

1. **What was true for date X** — the business reality for that date. (e.g., "what was the NAV for March 31, 2026?")
2. **What did we know on date Y about date X** — the recordkeeping reality. (e.g., "what NAV did we report for March 31 when we closed the period on April 7? What did we report after the late fee accrual was booked on April 22?")

These are not the same. A trade booked on April 5 with `effective_date = March 30` retroactively changes "what was true for March 30" but does not change "what we knew on April 1." Auditors, regulators, and investors all ask both questions and expect both to be answerable.

A single timestamp model collapses these. Mutation-only history (audit log of changes to a "current" view) can answer Q2 but only by replaying the log — fragile, slow, and the replay logic drifts from the mutation logic over time.

The standard solution is **bi-temporal**: every authoritative output carries two dates, one for each axis.

## Decision

**Every authoritative output carries `effective_date` and `as_of_date`.** Snapshots additionally carry `input_versions` so they can be reconstructed.

1. **`effective_date`** — the business date the output pertains to. For a NAV snapshot, this is the period-end date. For a trade, this is the booking date. For an FX rate, this is the rate date.

2. **`as_of_date`** — the date the output was computed. For a snapshot first computed on April 7 for March 31, `effective_date = 2026-03-31`, `as_of_date = 2026-04-07`. If the snapshot is recomputed on April 22 after a correction, a NEW snapshot row is written with `effective_date = 2026-03-31`, `as_of_date = 2026-04-22`. The old row remains.

3. **Snapshot uniqueness is on `(entity_id, effective_date, status='released')`.** Multiple drafts and locked versions can exist. Only one released version per (entity, effective_date) at a time. Releasing a new version requires explicit re-release of the prior one (which transitions to `superseded` — see point 6).

4. **`input_versions` (jsonb) records the version of every input used.** For NAV: `{ "fx_rates": [rate_id_1, rate_id_2, ...], "prices": [price_id_1, ...], "lot_reliefs_max_id": 12345 }`. The set is sufficient that `reconstruct(snapshot_id)` can replay against exactly the inputs that existed at `as_of_date` and produce the same output, regardless of inputs added since.

5. **`reconstruct(snapshot_id)` is a service contract on every snapshot service.** Loads the snapshot's `input_versions`, fetches each referenced input by ID (which is immutable per ADR 001 and ADR 002), runs the same calculation, and asserts the output matches byte-for-byte. A nightly job picks random released snapshots and runs reconstruct — divergence is a hard failure.

6. **Released snapshots are immutable.** Database trigger blocks UPDATE/DELETE on rows where `status = 'released'`. Re-releasing for the same effective_date inserts a new row at version+1, the prior row's status moves to `superseded`, and an audit row records the supersession with reason. A `superseded_by_id` column links the chain.

7. **Reads default to "released as of latest as_of_date."** A query `getNAV(fund_id, effective_date)` returns the released row with `effective_date = ?` and the highest `as_of_date`. Read paths can override with `as_of_date <=` to ask "what did we report when we closed the period on April 7" — returns the released row whose `as_of_date <= 2026-04-07` and is the highest such.

8. **Effective-date corrections do not back-edit existing rows.** A correction creates a new transaction row with `effective_date = original effective date`, `booking_date = today`, and a `corrects_id` pointer to the row being corrected. Snapshots for affected effective_dates are flagged for re-release. The original incorrect rows remain in place forever.

## Consequences

### Positive

- Both audit questions are answerable in O(1) with the right index — no replay, no drift between read logic and write logic.
- Reproducibility is structural, not heroic. `reconstruct` is a few lines because inputs are addressable by ID.
- Late-arriving corrections are a documented workflow, not a special case.
- Auditor can ask "what NAV did the LP statement on April 10 contain" and the answer is `as_of_date <= 2026-04-10` query — no archaeology.
- Pairs cleanly with ADR 002 (FX corrections produce new rate rows) and ADR 001 (lot corrections produce new relief rows).
- The state-lock invariants from `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` map naturally — released snapshots are the authoritative state, prior versions are history.

### Negative

- Cognitive overhead for engineers. Two dates everywhere is a discipline. Mitigated by every snapshot table inheriting the same column shape (enforced by `winston-investment-snapshot` skill) so the pattern is uniform.
- Storage cost: superseded rows accumulate. Mitigated by partitioning snapshot tables by `effective_date` year and archiving superseded rows older than configurable threshold (default: 7 years) to cold storage.
- Read paths default well but ad-hoc SQL is a footgun — a SELECT without `as_of_date` filter and without `status = 'released'` returns a mess. Mitigated by `getReV2AuthoritativeState` / authoritative-state contract being the only sanctioned read path. Direct SQL is a CLAUDE.md violation already.
- Reconstruct cost: nightly job is meaningful at scale. Mitigated by sampling — the job picks N random snapshots per night, not all.

### Neutral

- Adds two columns and one jsonb column to every snapshot table. Already required by the project instructions for `nav_snapshots` (`status`, `period_end_date`); this ADR generalizes the shape and adds `as_of_date` + `input_versions`.

## Alternatives Considered

**Single timestamp (effective_date only).** Rejected. Cannot answer "what did we report on April 10 vs April 22" — both queries return the latest version, which is wrong.

**Audit-log-only history.** Rejected. Replay logic drifts from mutation logic; reading "what did we report on April 10" requires replaying the full log against historical state — slow and fragile.

**Bi-temporal but with mutable rows + history table.** Rejected. Same audit-log problem in disguise. Forces a separate read path for "current" vs "historical" and the two paths drift.

**Three-temporal (effective_date, as_of_date, knowledge_date).** Rejected as over-engineering. Three axes are required only when there's a meaningful difference between "when we computed it" and "when we knew it" — for the investment engine those are the same date. Revisit if regulators demand it.

## Implementation Notes

Required columns on every authoritative output table (`nav_snapshots`, `pnl_snapshots`, `position_valuations`, `risk_snapshots`, `performance_snapshots`, `report_outputs`):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `entity_type` | text | e.g., `fund`, `portfolio` |
| `entity_id` | uuid | FK to entity |
| `effective_date` | date | business date |
| `as_of_date` | timestamptz | computation moment |
| `status` | text | `draft \| locked \| released \| superseded` |
| `version` | int | monotonic per (entity_id, effective_date) |
| `superseded_by_id` | uuid | self-FK, nullable |
| `input_versions` | jsonb | input ID set |
| `produced_by` | text | service identifier or user |
| `produced_at` | timestamptz | server time |
| (payload) | various | the actual snapshot content |

Indexes:
- `UNIQUE (entity_id, effective_date) WHERE status = 'released'` — partial unique
- `(entity_id, effective_date, as_of_date DESC)` — for "as of" reads
- `(status, effective_date)` — for close-cycle queries

DB triggers:
- BEFORE UPDATE OR DELETE on snapshot tables: RAISE if `OLD.status = 'released'` and `NEW.status NOT IN ('superseded')` (or always for DELETE).

Service contract on every snapshot service:
- `produce(...)` → writes a draft
- `lock(snapshot_id)` → status `draft → locked`
- `release(snapshot_id)` → status `locked → released`, sets prior released row to `superseded`
- `reconstruct(snapshot_id)` → loads `input_versions`, recomputes, asserts equality. Returns a `ReconstructResult` with `equal: bool, divergences: []`.

## Verification

- Unit test: `release` enforces uniqueness — second release for same `(entity, effective_date)` supersedes prior.
- Unit test: DB trigger blocks UPDATE on released row, allows the supersession write.
- Unit test: reconstruct produces byte-identical output for a fresh snapshot.
- Unit test: a corrected input (new FX rate, new lot relief) does NOT change a previously released snapshot's reconstruct output (because input_versions pins the input ID).
- Unit test: `getNAV(fund, date, as_of=...)` returns the correct historical version for three different `as_of` values across the same `effective_date`.
- Integration test: nightly reconstruct sample job runs against seeded data and reports zero divergences.
