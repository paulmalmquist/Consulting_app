# Phase 0 Forensic Proof — REPE Financial Integrity Recovery

**Date:** 2026-04-12
**Scope:** IGF VII, MREF III, MCOF I at 2026Q2
**Method:** Read-only SQL + independent Python XIRR recomputation

## Summary

**All three funds reconcile within 1bp of raw cash events.** No data corruption found.

## Audit checks

### 0.1 Duplicate cash events
Query: same `(fund_id, event_date, event_type, amount)` appearing > 1 time.
Result: **0 duplicates** across all 3 funds.

### 0.2 Future-date leakage
IGF VII has 4 events dated after 2026-06-30 (2 calls, 2 dists). These are correctly
**excluded** from the snapshot — snapshot `total_called` ($695M) matches within-Q2
sum exactly.
MREF III and MCOF I have zero future events.

### 0.3 Independent IRR recomputation

| Fund | Stored IRR | Recomputed IRR | Delta (bp) | NAV appended once |
|---|---|---|---|---|
| IGF VII | 66.42% | 66.42% | -0.2 | yes |
| MREF III | 5.47% | 5.47% | +0.4 | yes |
| MCOF I | 2.40% | 2.40% | -0.1 | yes |

Tolerance: 10bp. All deltas under 1bp.

## Root cause assessment

Ruled out:
- Cash event duplication
- Terminal NAV double-append
- Future-date leakage into IRR inputs
- IRR arithmetic divergence

**Conclusion:** The net IRR values written to `re_authoritative_fund_state_qtr` during
the prior waterfall sprint are mathematically correct relative to the raw `re_cash_event`
table and the snapshot `ending_nav` field. There is no source-data corruption to repair.

## Implications for remaining phases

- **Phase 1 (data truth):** Nothing to repair. Skip.
- **Phase 2 (API path):** Investigate fund-trend 404 if reproduced.
- **Phase 3 (trust model):** Proceed — add `irr_trust_state`, batch the payload,
  eliminate per-fund N+1 in `re/page.tsx`.
- **Phase 4 (promotion gate):** Proceed — snapshots are eligible for `released` state.
- **Phase 5 (UI fail-closed):** Already partially enforced via `assertAuthoritativeMetric`;
  extend for chart null gaps.
