# Fund Decomposition — Canonical Calibration Gap

**Status:** Open. Blocks `full_set_matches_baseline` identity check from passing.

**Release state:** Fund Decomposition is live in production for exploratory what-if analysis. Canonical reconciliation remains open because the overlay currently computes TVPI/DPI using unweighted gross deal cost ($1,880M paid-in) while the authoritative snapshot uses fund-level called capital ($695M). `effective_ownership_percent` is unpopulated across the 20 investments, so full-set identity checks correctly fail until ownership weighting is populated and enforced.

## Observed delta (IGF VII, 2026Q2, 2026-04-23)

| Metric | Authoritative snapshot | Bottom-up rollup | Delta |
|---|---|---|---|
| Gross IRR | 0.534 | -0.134 | **66.82 bps** — materially out of tolerance |
| TVPI | 1.978 | 0.810 | **1.168x** — materially out of tolerance |

Tolerance target: ≤ 5 bps IRR, ≤ 0.01x TVPI.

## What this means operationally

The decomposition overlay is live and operational for exploratory what-if analysis — every toggle, exclusion, TVPI/DPI identity check, and marginal contribution computation is working correctly. The red identity-check chip is surfacing the gap correctly.

What is not working: the full-set overlay does not reproduce the authoritative baseline within stated tolerance. Until that closes, the decomposition overlay cannot be used as a cross-check on the authoritative snapshot, and the `full_set_matches_baseline` check has no validity as a calibration signal.

## Candidate root causes (must be diagnosed, not assumed)

Exactly one of these is almost certainly the driver. The next pass must identify the actual cause with evidence, not a guess:

1. **Timing convention mismatch** — authoritative IRR uses a different date convention (e.g., transaction-dated vs. quarter-end-collapsed). The bottom-up rollup keys all CFs to `quarter_end_date`; the authoritative snapshot may use intra-quarter acquisition/exit dates.

2. **Ownership weighting mismatch** — `resolve_ownership_pct` applies per-quarter ownership from `repe_asset_entity_link` or `re_jv.ownership_percent`. The authoritative snapshot may use a different ownership basis (e.g., committed vs. funded, or a different effective-date cutoff).

3. **Terminal NAV boundary mismatch** — the rollup terminal value is the NAV at `as_of_quarter`. The authoritative snapshot may include or exclude a different NAV component (e.g., residual value estimates vs. mark-to-market NAV).

4. **CF path mismatch** — the authoritative snapshot's IRR is derived from fund-level ledger cash events (capital calls, distributions) rather than asset-level CF series. These are fundamentally different IRR kinds. If so, the gap is not a calibration error — it is a permanent structural difference and the tolerance target needs to be renegotiated.

5. **Stale materialization / period cut** — `re_investment_cf_series_mat` is empty; the rollup computes from scratch via `build_asset_cf_series`. If the asset CF construction has a period-cutoff bug (e.g., including post-`as_of_quarter` CFs), TVPI and IRR will diverge.

6. **Duplicate or missing CF rows** — the cashflow series in the receipt shows both `"2024-Q1"` and `"2024Q1"` quarter labels on the same `quarter_end_date=2024-03-31`. This is almost certainly a deduplication failure — two different quarter-label formats are producing separate rows for the same period, doubling some CF amounts. **This is the most likely immediate culprit for the TVPI/IRR gap.**

## Acceptance criteria for closing this item

The next agent pass must produce a receipt where:
- `full_set_matches_baseline.passed = true`
- `delta_gross_irr_bps ≤ 5`
- `delta_tvpi ≤ 0.01`
- The receipt includes a `calibration_provenance` section that names the exact driver of any residual delta (must be one of the above categories, with evidence).

If the gap is structural (cause 4), the receipt must document that explicitly and the identity check tolerance must be changed to reflect that the two IRR kinds are not directly comparable.

## Diagnosis (updated 2026-04-23)

Two defects found, one fixed, one open.

### Fixed (commit 9e056542)
`_merge_series()` keyed by the quarter string label instead of `quarter_end_date`. Two sources used different formats (`"2024-Q1"` from ledger capital-call events, `"2024Q1"` from the asset CF rollup) for the same quarter-end date. This doubled CF amounts for 2024Q1–2025Q2, producing a negative IRR. Fix: key by `quarter_end_date.isoformat()`. After fix: no duplicate rows, IRR moved from -0.134 to -0.113. **Gap did not close** — a second, structural issue remains.

### Open: wrong capital base in invested_capital
After the merge-key fix, the overlay paid_in is $1,880M vs the authoritative $695M — a 2.7× difference. The authoritative snapshot represents the fund's actual equity contribution (called capital at fund level). The overlay sums `re_investment_quarter_state.invested_capital` per investment, which stores total deal cost at 100% — not the fund's ownership-weighted share.

Confirmed: `effective_ownership_percent` is NULL for all investments in this fund. The column exists but is not populated.

**This is a data seeding defect, not a code logic error.** The code correctly uses whatever `invested_capital` contains. The issue is that `invested_capital` in the production seed data stores gross deal cost, not the fund's share.

### Required fix — fail-closed ownership normalization

Populating `effective_ownership_percent` alone is not sufficient. The durable fix requires the decomposition substrate boundary to refuse silently falling back to gross deal cost when ownership is missing. Without a fail-closed gate, anyone who later omits or wipes the column will get quietly wrong numbers again.

**`_load_investment_states` must be changed to:**

1. Attempt to resolve ownership % in this priority order:
   - `re_investment_quarter_state.effective_ownership_percent` (already on the row)
   - `re_jv.ownership_percent` (static per investment)
   - `repe_asset_entity_link.percent` (effective-dated, per asset — requires aggregation to investment level)

2. If none of the above resolves a non-null, non-zero ownership %, raise `OwnershipWeightingMissing(investment_id)` — a new typed exception.

3. The POST endpoint maps `OwnershipWeightingMissing` → 422 `OWNERSHIP_WEIGHTING_MISSING` with the list of affected investment IDs.

4. The resolved ownership source must be written into `provenance.ownership_source` per investment so receipts are auditable.

**Critically:** ownership % = 1.0 (100%) is only valid if fund ownership is actually 100%. An implicit 1.0 fallback is forbidden.

### Acceptance criteria for closing this item

1. `delta_gross_irr_bps ≤ 5` at full selection vs authoritative snapshot
2. `delta_tvpi ≤ 0.01` at full selection vs authoritative snapshot
3. No investment in the response may show gross deal cost unless ownership is verified 100%
4. `paid_in` must reconcile to authoritative called capital within tolerance for any full-set released quarter
5. Missing ownership must produce `OWNERSHIP_WEIGHTING_MISSING` 422 — not a silently computed metric
6. Receipt must show before/after paid_in: $1,880M → approximately $695M
7. `full_set_matches_baseline.passed = true` in the closing receipt
