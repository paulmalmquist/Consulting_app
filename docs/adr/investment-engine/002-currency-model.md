# ADR 002 — Currency Model

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** Paul (owner), Investment Engine architecture
- **Supersedes:** —
- **Superseded by:** —
- **Related:** ADR 001 (lots), ADR 003 (bi-temporal), `docs/plans/INVESTMENT_ENGINE_PLAN.md`

## Context

Funds hold securities denominated in multiple currencies. Reporting must produce values in a fund's base currency (e.g., USD). The standard pitfalls:

1. **Storing translated values without provenance.** A USD value in the database with no record of which FX rate produced it is unauditable. Asked "how did you get $1.04M?" the only answer is "the system did it" — which fails any close cycle review.
2. **Translating on write at the wrong time.** Translating at trade booking locks in a rate that may not be the one the close cycle wants. End-of-period revaluations need the period-end rate, not the trade-date rate.
3. **Re-translation drift.** Translating an already-translated value (USD → EUR → USD) accumulates rounding error. Every translation must start from the native amount.
4. **Late-arriving FX corrections.** A central bank correction to a published rate must be replayable. Reports run before the correction must reproduce; reports after must reflect.

The fund's reporting needs at minimum: native currency totals, base currency totals at period-end FX, base currency totals at average FX (for some performance metrics), and the ability to recompute any historical translation.

## Decision

**Native + reference model.** Every monetary value is stored once, in its native currency, alongside the reference to the FX rate ID used at any translation event.

1. **`amount_native NUMERIC(28,8)` + `currency_code CHAR(3)` are the only stored monetary fields** for transactional data (trades, accruals, cash movements, lot cost basis). Translated base-currency values are NEVER stored on transactional rows.

2. **FX rates live in `fx_rates`** with columns `fx_rate_id`, `from_ccy`, `to_ccy`, `rate_date`, `rate`, `source` (e.g., `wm_reuters_4pm`, `ecb_reference`, `manual`), `published_at`, env_id/business_id. Composite uniqueness on `(from_ccy, to_ccy, rate_date, source)`. Rates are immutable — corrections insert a new row with a later `published_at` and the prior row gets a `superseded_by_id`.

3. **Translation is a service-layer operation.** `accounting_engine.translate(amount_native, from_ccy, to_ccy, effective_date, source) → (amount_translated, fx_rate_id)`. Returns the rate ID used. The caller stores the rate ID alongside any derived value it persists.

4. **Snapshot tables store the FX rate ID.** Outputs that include translated values (NAV snapshot, P&L snapshot, position valuation) carry `fx_rate_id` columns for every translated figure. Reconstruction of a snapshot loads the same rate row, regardless of subsequent corrections.

5. **Translation is rejected if the FX rate is missing for the requested date.** No fallback to the prior business day, no interpolation, no inference. The accounting engine returns `valid: false, errors: ['fx_missing: USD->EUR on 2026-04-29']` and the caller surfaces "Unavailable" per the system rules. Operations gets paged and inserts the rate; the calculation reruns.

6. **Cross-rate via base.** When translating a non-base pair (e.g., GBP → JPY) and only USD-pair rates exist, the engine routes via base: GBP → USD → JPY. The result carries TWO `fx_rate_id` references (`fx_rate_id_leg_1`, `fx_rate_id_leg_2`). Native + reference is preserved end-to-end.

7. **Period-end and average-period FX are first-class.** `fx_rates.source` distinguishes spot rates (one per business day) from period rates (e.g., `period_end_2026Q1`). Period rates are computed by a deterministic close-cycle job from the underlying spot rates and stored back into `fx_rates` with their own source value. NAV snapshots reference period-end rates; performance attribution can reference average-period rates. Both are reconstructible from spot rates if a recompute is needed.

## Consequences

### Positive

- Provenance is total. Every translated number traces to an `fx_rate_id` row, which traces to a `source`, a `published_at`, and a `superseded_by_id` chain.
- Re-translation drift is impossible — every translation starts from the native value.
- Late corrections are clean: the new rate row supersedes the old; old snapshots that reference the old rate ID still reproduce. New snapshots use the new rate.
- Multi-currency is a non-event for the calculation services — they always start from native and translate at a known rate.
- Audit answers "which FX rate did we use" with a single foreign key lookup.

### Negative

- All snapshot tables grow by ~one column per translated figure (`fx_rate_id`). Storage cost is small relative to the snapshot payloads themselves.
- Reads that want "USD value of this position right now" must call `translate()` — not just SELECT. Mitigated by `positions_current` as a view that joins `fx_rates` on a fund-configured "current rate source" (typically last published spot).
- Period-rate computation runs in the close cycle. If close fails, period rates are missing and downstream NAV calculation is blocked. This is the desired behavior under fail-closed but means the close cycle has a hard ordering: spot rates → period rates → revaluation → NAV.
- Cross-rate routing logic lives in the engine. Tested but adds branches.

### Neutral

- The `fx_rates` table is small (rows ≈ pairs × business days × sources) — single-digit GB at five years.
- Currency code field standardized to ISO 4217 alpha-3. Rejected on insert if not in a configured allow-list — prevents typos from corrupting the data.

## Alternatives Considered

**Store native + base, no FX rate ID.** Rejected. Loses provenance. Cannot answer "which rate did we use" without a side table — and at that point the side table IS the model in this ADR.

**Store base only, native discarded after translation.** Rejected. Catastrophic. Cannot reproduce, cannot re-translate at corrected rates, cannot show native to investors who need it.

**Translate at write time, store base.** Rejected. Locks in a rate at the wrong moment for many use cases. Period revaluations need the period rate, not the trade rate.

**On-demand cross-rate via market quotes only (no stored cross rates).** Rejected. Some pairs are illiquid; routing via base is more reliable and the rate ID chain is fully auditable.

**Allow fallback to T-1 rate when T is missing.** Rejected. Violates the fail-closed rule from project instructions. A missing rate is a real operational issue and silently substituting yesterday's rate hides it.

## Implementation Notes

Schema:
- `fx_rates(fx_rate_id, from_ccy, to_ccy, rate_date, rate NUMERIC(20,10), source, published_at, superseded_by_id, env_id, business_id, audit_cols)`. Unique partial index on `(from_ccy, to_ccy, rate_date, source) WHERE superseded_by_id IS NULL`.
- All transactional tables: `amount_native NUMERIC(28,8)`, `currency_code CHAR(3)`. No `amount_base` columns.
- All snapshot tables: payload columns + corresponding `fx_rate_id` columns (or jsonb `fx_rate_ids` map for multi-leg snapshots like NAV).

Service `accounting_engine` adds `translate(amount, from_ccy, to_ccy, effective_date, source)`. Reads cache loaded rates per request to avoid N round-trips during a NAV computation.

Configuration:
- `funds.base_currency CHAR(3)` — required.
- `funds.spot_fx_source` — defaults to a global default (e.g., `wm_reuters_4pm`).
- `funds.period_end_fx_source` — defaults to derived-from-spot.

## Verification

- Unit test: translate(100, USD, EUR, 2026-04-30) returns the stored rate row and the product matches to 8 decimals.
- Unit test: translate against a missing date returns `valid: false` with `fx_missing` error.
- Unit test: cross-rate GBP→JPY via USD returns two leg IDs, product matches GBP→JPY direct rate within tolerance when both exist.
- Replay test: snapshot from period N reproduces dollar value byte-identically after FX correction inserted with `published_at > snapshot.as_of_date`.
- Drift test: translate, reverse-translate, and the result equals the input within rounding tolerance only — but no value is ever stored as a result of round-tripping.
