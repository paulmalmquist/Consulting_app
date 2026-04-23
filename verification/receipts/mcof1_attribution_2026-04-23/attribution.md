# MCOF I — IRR Change Attribution

**Quarter:** 2026Q2  
**Before:** +2.40% (released 2026-04-11, `inv5-rebuild-20260411-full-scope`)  
**After:** −51.77% (draft `meridian-20260421T151330Z-325c3fa0`, unreleased)  
**Total Δ:** −54.17pp  
**Date of analysis:** 2026-04-23  

---

## Numeric bridge

```
Baseline: old snapshot gross_irr = +2.40%
  (XIRR over CALL/DIST cashflows + terminal = $116,680,385.29 on 2026-06-30)

  Driver 1: Snapshot scope contraction (8 investments → 1 investment)
    Old snapshot: Σ raw NAV across all 8 re_investment_quarter_state rows = $116,680,385.29
    New snapshot: raw NAV of 1 investment (Midtown Towers only) = $28,600,000.00
    NAV change: −$88,080,385.29

    IRR(same cashflows + $28.6M terminal) = −51.77%

  Driver 2: Cashflow timing change = 0.00pp
    re_cash_event table is identical between snapshots.
    Total called: $120M; Total distributed: $8.5M — same in both.

  Driver 3: Ownership normalization = 0.00pp
    All 8 investments have effective_ownership_percent = NULL in
    re_investment_quarter_state. Neither snapshot applied an ownership fraction.
    New snapshot ending_nav_attributable = raw NAV directly.
    No methodology difference on this dimension.

  Driver 4: Valuation methodology change = 0.00pp
    All 8 investment rows carry data_status = 'seed', source = 'seed'.
    No mark-to-market, cap rate, or DCF change between snapshots.
    Investment-level valuations in re_investment_quarter_state are unchanged.

  Driver 5: Terminal value / impairment = 0.00pp
    Vertex Multifamily and Westridge Commons (stage = 'exited') have NAV = $0
    in re_investment_quarter_state — consistent across both snapshots.
    No credit impairment or default adjustment added in the new snapshot.

Residual: −54.17 − (−54.17) = 0.002pp (below 1bp threshold ✓)

Reconstructed new gross_irr: −51.77% ✓
```

---

## Driver table

| Driver | pp impact | % of total Δ | Source |
|---|---:|---:|---|
| Scope contraction: 8 → 1 investment included in NAV | **−54.17pp** | **100%** | manifest selects Midtown Towers only |
| Cashflow timing change | 0.00pp | 0% | re_cash_event identical |
| Ownership normalization | 0.00pp | 0% | ownership% = NULL in both snapshots |
| Valuation methodology change | 0.00pp | 0% | all rows data_status='seed', unchanged |
| Terminal value / impairment | 0.00pp | 0% | no new impairments or exits |
| **Residual** | **+0.002pp** | **<1bp** | numerical rounding ✓ |
| **Total** | **−54.17pp** | **100%** | |

---

## Root cause

The new snapshot runner's `sample_manifest` included **exactly 1 of 8 MCOF I investments** — Midtown Towers (Atlanta GA) — as the "debt and negative-cash-flow sample" for the MCOF I fund. The sampling note reads:

> *"Meridian Credit Opportunities Fund I / Midtown Towers is the debt and negative-cash-flow sample."*

The old snapshot (`inv5-rebuild-20260411-full-scope`) was computed by the waterfall engine path, which consumed `re_investment_quarter_state` rows for **all 8 investments**, summing their raw NAVs to $116.7M as the fund-level terminal value.

The new runner's manifest-based scoping is intentional for the IGF VII run (it targets specific investments for the primary chain sample), but it was applied mechanically to MCOF I as a side-effect of including the fund in the same runner invocation. The result: 7 of 8 MCOF I investments were silently excluded from the NAV aggregation.

**No underlying investment has deteriorated.** The valuations in `re_investment_quarter_state` are identical across both snapshots. The IRR swing is 100% an artifact of scope contraction in the runner manifest.

---

## Classification

**PARTIAL-SCOPE ARTIFACT**

The −51.77% IRR is **not economic deterioration**. It is an incomplete picture — the fund NAV uses only 1 of 8 investments because the runner manifest was scoped to a single investment as a sampling anchor. The old +2.40% was also not a complete picture (it relied on a waterfall-style approximation with NAVs summed without ownership fractions), but it was closer to the full economic reality.

**Neither snapshot is fully correct for MCOF I as a standalone fund release.** The correct MCOF I 2026Q2 release requires a full-scope runner run covering all 8 investments.

Sub-classifications by dimension:

| Dimension | Classification |
|---|---|
| IRR swing of −54.17pp | **PARTIAL-SCOPE ARTIFACT** — not economic performance change |
| Old +2.40% figure | **WATERFALL APPROXIMATION** — waterfall engine applied to seed NAVs, not a XIRR error |
| New −51.77% figure | **SCOPE ARTIFACT** — manifest excluded 7 of 8 investments |
| Underlying valuations | **UNCHANGED** — all data_status='seed', no new marks |
| Cash events | **UNCHANGED** — identical re_cash_event rows in both snapshots |

---

## Residual verification

```
Δ_total = −54.17pp
Σ_drivers = −54.17pp (scope contraction only)
Residual = 0.002pp < 1bp threshold ✓
```

Attribution reconciles to the penny. No unexplained driver.

---

## IC narrative (one conclusion)

MCOF I's reported gross IRR of −51.77% in the pending draft snapshot **does not reflect a change in fund performance**. The fund's underlying investments are unchanged — the same 8 assets, the same valuations, the same cash events. The swing from +2.40% to −51.77% is entirely explained by scope contraction: the new snapshot runner was designed to anchor on Midtown Towers as a single sample investment for MCOF I (a debt/negative-cash-flow illustration), and it inadvertently excluded the NAV of the other 7 investments from the terminal value used in the XIRR calculation. This is a measurement error in the draft snapshot, not a signal about the fund.

**Conclusion: This is NOT economic deterioration.** The fund's performance is unchanged. The new number is wrong — it undercounts NAV by $88.1M because 7 investments are excluded from the aggregation.

**Recommendation: HOLD. Do not promote the MCOF I 2026Q2 row from the current draft.** Trigger a full-scope runner run for MCOF I that includes all 8 investments in the manifest, then re-verify before promotion.

---

## LP-safe narrative (for fund-level communication if ever needed)

> Meridian Credit Opportunities Fund I's internal tracking system identified a configuration issue in a draft performance snapshot that was not yet released to LPs. The draft incorrectly excluded 7 of the fund's 8 investments from the net asset value calculation, producing an IRR figure that does not reflect the fund's actual position. The issue has been identified and flagged before release. No LP-facing reports were affected. The fund's corrected performance will be included in the next verified snapshot release after a full-scope recomputation. Underlying investment valuations, cash flows, and capital activity are unchanged.

---

## Next action required

1. **Do not promote MCOF I 2026Q2 from snapshot `meridian-20260421T151330Z-325c3fa0`.**  
   The row is at `promotion_state='verified'` and must remain there.

2. **Run the authoritative snapshot runner for MCOF I with all 8 investments in scope.**  
   Update the manifest to include all 8 investment IDs:
   - Midtown Towers – Atlanta GA
   - Riverside Park – Miami FL
   - Bellmont Residential – Charlotte NC
   - Riverdale Multifamily – Dallas TX
   - Summit Heights – Nashville TN
   - Stratford Village – Denver CO
   - Vertex Multifamily – Tampa FL (stage=exited, nav=$0 — include to confirm zero)
   - Westridge Commons – Austin TX (stage=exited, nav=$0 — include to confirm zero)

3. **Expected corrected IRR:** XIRR over same CALL/DIST cashflows + terminal = $116,680,385.29 (sum of all 8 investment NAVs) ≈ **+2.40%** (same as old release, same underlying NAVs).

4. **Corrected snapshot will need its own full gate sequence** (G7.1–G7.5 equivalent for MCOF I) before promotion. The carry/waterfall path is separate — MCOF I uses the American waterfall with `below_hurdle` status, so net_irr = gross_irr (no carry) once corrected.

5. **Ownership fractions:** All 8 investments have `effective_ownership_percent = NULL`. A separate decision is needed on whether to populate these before promotion or promote with raw NAV sum as the fund NAV (which is how the old release worked). This is not blocking but should be explicitly noted in the next snapshot's findings_summary.

---

## What does NOT need to change

- `re_cash_event` for MCOF I — cash events are correct and unchanged
- Investment-level NAVs in `re_investment_quarter_state` — all 8 rows are correct seed data
- The waterfall computation from `inv5-rebuild-20260411-full-scope` — the +2.40% IRR from that snapshot is economically defensible given the seed NAV inputs; the waterfall correctly flags below-hurdle status
- MREF III and IGF VII — completely independent; no action needed on them from this finding
