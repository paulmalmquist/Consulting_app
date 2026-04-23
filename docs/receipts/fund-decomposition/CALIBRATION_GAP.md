# Fund Decomposition — Canonical Calibration Gap

**Status:** Open. Blocks `full_set_matches_baseline` identity check from passing.

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

## Immediate next diagnostic step

Inspect the `cashflow_series` in `prod-real-20260423T162358Z.json`. The series contains both `"2024-Q1"` (hyphenated, from capital call events) and `"2024Q1"` (non-hyphenated, from bottom-up asset rollup) at the same `quarter_end_date`. If those are being merged as separate rows rather than deduplicated, the total CF is doubled for those quarters — which would produce the observed TVPI undershoot and IRR sign flip.

Fix target: normalize all quarter labels to a single format before merging the CF series in `_merge_series()` / `compute_fund_rollup()`.
