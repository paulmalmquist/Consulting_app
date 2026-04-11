# Phase 6 — Waterfall / Capital Accounts / Distribution Validation

**Date:** 2026-04-11  
**Status:** COMPLETE — Defect B confirmed active for 2026Q2; Defect C confirmed with additional critical finding (no event_date filter); waterfall definitions structurally correct; DPI/TVPI formulas correct.

---

## Waterfall Definition Status

All three Meridian funds have active, structurally valid waterfall definitions:

| Fund | Waterfall type | Tiers | Active | Effective date |
|---|---|---|---|---|
| IGF VII | american | 4 | YES | 2026-02-27 |
| MREF III | european | 4 | YES | 2026-03-23 |
| MCOF I | european | 4 | YES | 2026-03-27 |

### Tier Structure (all three funds: standard 2-and-20 PE waterfall)

| Tier | Type | Hurdle | GP split | LP split | Catch-up |
|---|---|---|---|---|---|
| 1 | return_of_capital | — | 0% (IGF VII: NULL) | 100% | — |
| 2 | preferred_return | 8.0% | 0% (IGF VII: NULL) | 100% | — |
| 3 | catch_up | — | 100% (IGF VII: NULL split, 100% catch_up_percent) | 0% | 100% |
| 4 | split | — | 20% | 80% | — |

**IGF VII anomaly:** Tiers 1-3 have `split_gp = NULL` and `split_lp = NULL`. Only tier 4 has explicit splits. MREF III and MCOF I have explicit splits on all tiers. The NULL splits on IGF VII tiers 1-3 may cause a `TypeError` or `ValueError` in `run_waterfall` when it tries to multiply NULL × distributable amount. This may be the root cause of `run_waterfall` failing for IGF VII 2026Q2 while failing independently of this for MREF III/MCOF I (which have no runs at all).

---

## Waterfall Run History

| Fund | Quarter | Status | Total distributable | Run date |
|---|---|---|---|---|
| IGF VII | 2025Q4 | success | $1,632,851,290.20 | 2026-04-10/11 (×6 runs) |
| IGF VII | 2026Q1 | success | $425,000,000.00 | 2026-03-02 to 2026-03-04 (×6 runs) |
| MREF III | — | — | No runs | — |
| MCOF I | — | — | No runs | — |

**Critical finding:** No 2026Q2 waterfall run exists for ANY of the three funds. The 2026Q2 authoritative snapshots were built and released without completing the waterfall computation for that period. When `compute_return_metrics` calls `_compute_waterfall_carry(fund_id, quarter='2026Q2', ...)`, `run_waterfall` raises and Defect B's fallback fires.

**IGF VII 2025Q4 total_distributable anomaly:** The $1.63B distributable figure for IGF VII 2025Q4 is 24× the authoritative snapshot's `beginning_nav` of $66.8M (which represents the 2025Q4 ending_nav). This is consistent with the shadow waterfall using the full-portfolio NAV pipeline (all 20 investments, ~$1.4B+) rather than the scoped snapshot pipeline (Tech Campus North only, ~$44M). The waterfall engine and the authoritative snapshot builder use different NAV inputs — waterfall is correctly using the full portfolio; the snapshot is incorrectly scoped.

---

## Defect B Confirmation — `_compute_waterfall_carry` Fail-Open

**Location:** [backend/app/services/re_fund_metrics.py:111-128](backend/app/services/re_fund_metrics.py#L111-L128)

**Exact code (confirmed by read):**
```python
def _compute_waterfall_carry(fund_id, quarter, gross_return, total_called):
    try:
        from app.services.re_waterfall_runtime import run_waterfall
        wf_result = run_waterfall(fund_id=fund_id, quarter=quarter)
        carry = Decimal("0")
        for result in (wf_result.get("results") or []):
            tier_code = result.get("tier_code", "")
            if "carry" in tier_code or "catch_up" in tier_code:
                carry += Decimal(str(result.get("amount", 0)))
        return carry.quantize(Decimal("0.01"))
    except (LookupError, ValueError, ImportError):
        # Fallback: simplified carry (20% of gains above 8% pref hurdle)
        pref_hurdle = total_called * Decimal("0.08")
        if gross_return > pref_hurdle:
            return ((gross_return - pref_hurdle) * Decimal("0.20")).quantize(Decimal("0.01"))
        return Decimal("0")
```

**Defect B fires for all 3 Meridian funds at 2026Q2** — `run_waterfall(quarter='2026Q2')` raises → fallback executes.

**Fallback impact for Meridian 2026Q2:**

| Fund | gross_return (as built) | pref_hurdle (8% × total_called) | Fallback branch | carry_shadow |
|---|---|---|---|---|
| IGF VII | -$578.2M | $61.2M | `gross_return < pref_hurdle` → `return Decimal("0")` | $0.00 |
| MREF III | -$719.2M | $61.9M | `gross_return < pref_hurdle` → `return Decimal("0")` | $0.00 |
| MCOF I | -$460.4M | $41.3M | `gross_return < pref_hurdle` → `return Decimal("0")` | $0.00 |

**Numeric contamination for 2026Q2:** All three funds have gross_return far below the 8% hurdle. The fallback returns $0, which happens to be the same value the real waterfall would return (no carry is owed when the fund is underwater). The **direct numeric impact of Defect B on 2026Q2 net metrics is $0** for all three Meridian funds.

**However, the violation still must be patched (Patch B) because:**
1. The return type is `Decimal("0")` not `None` — violates INV-5 (null must be returned, not zero)
2. The `null_reason: "waterfall_run_required"` is never surfaced on the UI
3. For future periods when `gross_return > pref_hurdle` (expected after scope fix and re-promotion), the fallback would inject wrong carry
4. The code violates SYSTEM_RULES_AUTHORITATIVE_STATE.md Rule 3 (fail-closed on waterfall-dependent metrics)

---

## Defect C Confirmation — Source-of-Truth Drift + Missing event_date Filter

**Location:** [backend/app/services/re_fund_metrics.py:288-309](backend/app/services/re_fund_metrics.py#L288-L309)

**Two sub-defects confirmed:**

### C-1: NAV reads from legacy table
Line 291: `SELECT * FROM re_fund_quarter_state WHERE fund_id = %s AND quarter = %s ORDER BY created_at DESC LIMIT 1`

**Violates INV-1.** The NAV for DPI/TVPI/IRR computation comes from `re_fund_quarter_state` (legacy cache), not `get_authoritative_state`. Result: DPI, RVPI, and gross_tvpi in `re_fund_metrics_qtr` may differ from the released authoritative snapshot values.

### C-2: Cash event aggregation has NO event_date filter (NEW CRITICAL FINDING)
Lines 299-308:
```sql
SELECT SUM(CASE WHEN event_type = 'CALL' ...) AS total_called,
       SUM(CASE WHEN event_type = 'DIST' ...) AS total_distributed
FROM re_cash_event
WHERE env_id = %s AND business_id = %s AND fund_id = %s
-- NO event_date <= quarter_end filter!
```

All cash events — past AND future — are summed. For a 2026Q2 metric run, the Q3/Q4 2026 planned events are included:

| Fund | Q3/Q4 calls | Q3/Q4 dists | Impact on re_fund_metrics_qtr |
|---|---|---|---|
| IGF VII | +$45M | +$40.2M | total_called overstated by $45M; DPI/TVPI/IRR distorted |
| MREF III | +$81M | +$7.1M | total_called overstated by $81M |
| MCOF I | +$54M | +$9.5M | total_called overstated by $54M |

This is a **period coherence violation (INV-2)**. The `re_fund_metrics_qtr` values computed by `compute_return_metrics` are wrong for every fund that has future-dated cash events. Patch C must add `AND event_date <= :quarter_end_date` to the cash event query.

---

## Capital Account / DPI / TVPI Validation

### DPI formula check

| Fund | total_distributed (as built) | total_called (as built) | stored_dpi | computed_dpi | formula_correct |
|---|---|---|---|---|---|
| IGF VII | $142,507,756.09 | $765,000,000 | 0.1863 | 0.1863 | YES ✓ |
| MREF III | $20,514,379.21 | $774,000,000 | 0.0265 | 0.0265 | YES ✓ |
| MCOF I | $26,952,987.48 | $516,000,000 | 0.0522 | 0.0523 | YES ✓ |

**DPI formula is correct.** Contamination is in the inputs (C-1/C-2 for IGF VII; overcall for MREF III; missing committed for MCOF I).

### TVPI formula check

| Fund | total_distributed + ending_nav | total_called | stored_tvpi | computed_tvpi | formula_correct |
|---|---|---|---|---|---|
| IGF VII | $186,782,317 | $765,000,000 | 0.2442 | 0.2442 | YES ✓ |
| MREF III | $54,796,118 | $774,000,000 | 0.0708 | 0.0708 | YES ✓ |
| MCOF I | $55,552,987 | $516,000,000 | 0.1077 | 0.1076 | YES ✓ (rounding) |

**TVPI formula is correct.** Contamination is in the inputs.

---

## Distribution Waterfall Position

Since all three funds have gross_return < 0, no fund has reached any waterfall hurdle. The capital account position as of 2026Q2:

| Fund | Total called | Total distributed | Undistributed called | LP in hole | GP carry owed |
|---|---|---|---|---|---|
| IGF VII | $695M (correct) | $135.5M | $559.5M | -$514.8M (ending_nav full = $1.446B → equity positive) | $0 |
| MREF III | $774M (suspect) | $20.5M | $753.5M | -$710.6M (ending_nav $42.9M) | $0 |
| MCOF I | $516M | $27.0M | $489.0M | -$372.3M (ending_nav $116.7M) | $0 |

**IGF VII note:** If the full-portfolio NAV of $1,446M is used, total value = $135.5M + $1,446M = $1,581.5M on $695M called → fund is in the MONEY (equity positive, ~2.3× return). No carry owed in the period, but GP would be in-the-carry for a terminal waterfall.

---

## Summary

| Finding | Classification | Severity |
|---|---|---|
| Defect B active for 2026Q2 (no waterfall run completed before release) | WATERFALL_DEFECT | HIGH — code violation (fail-open); $0 numeric impact on Meridian 2026Q2 |
| IGF VII tiers 1-3 NULL splits (may cause run_waterfall TypeError) | DATA + LOGIC | MEDIUM — blocks real waterfall run for IGF VII |
| No waterfall run for MREF III or MCOF I (any quarter) | MISSING_EXIT_VALUE | HIGH — blocks net metrics for both funds |
| Defect C-1: NAV from legacy re_fund_quarter_state | UI_SOURCE_MISMATCH | HIGH — re_fund_metrics_qtr differs from authoritative snapshot |
| Defect C-2: No event_date filter in cash event aggregation | PERIOD_COHERENCE | CRITICAL — inflates total_called for all funds with future events |
| DPI/TVPI formulas: correct | — | Clean |
| Capital account position: all funds underwater, $0 carry owed | — | Consistent |
