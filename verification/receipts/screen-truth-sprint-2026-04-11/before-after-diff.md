# INV-5 Sprint — Before/After Diff (Step 11)

**Date:** 2026-04-11  
**Branch:** Supabase branching unavailable (Pro required). Data captured via read-only queries against live.  
**Scope:** re_authoritative_fund_state_qtr + re_fund_quarter_state for IGF VII, MREF III, MCOF I at 2026Q2.

---

## 1. Current Released Authoritative Snapshots (BEFORE)

All three funds have released snapshots from `meridian-20260410T182315Z-3881843b`.

| Fund | ending_nav | gross_irr | net_irr | tvpi | dpi | total_called | total_committed |
|---|---|---|---|---|---|---|---|
| IGF VII | $44.3M | **-84.1%** | **-85.5%** | 0.244 | 0.186 | $765M | $1B |
| MREF III | $34.3M | **-98.8%** | **-99.0%** | 0.071 | 0.027 | $774M | $500M |
| MCOF I | $28.6M | **-97.4%** | **-97.7%** | 0.108 | 0.052 | $516M | $0 |

**All three show catastrophically negative IRRs in their RELEASED snapshots.**

Root causes (documented in phase3_igf7_receipts.md):
- **C-1 through C-4:** Triplicated cash events (CALL, DIST, FEE, EXPENSE) inflated total_called by up to 3×. Migration 467 deduped IGF VII cash events; MREF III and MCOF I were NOT deduped.
- **C-5:** Snapshot builder used only 1 of 20 IGF VII investments → ending_nav was $44.3M instead of ~$1.2B.
- **C-6:** Waterfall fallback (Defect B) injected fake net metrics.

**These released snapshots carry contaminated data. The snapshot builder must be re-run after the dedup and scope expansion.**

## 2. Current Legacy Fund State (re_fund_quarter_state, 2026Q2)

| Fund | portfolio_nav | gross_irr | net_irr | total_called | total_committed |
|---|---|---|---|---|---|
| IGF VII | $1,446M | 16.2% | 12.8% | $833M | $1B |
| MREF III | $42.9M | null | null | $417M | $500M |
| MCOF I | $116.7M | null | null | $540M | $600M |

The legacy table has different (seed-era) values. IGF VII shows 16.2% gross IRR from the original seed.

## 3. Quarantine Status

| Fund | is_quarantined | has_fqs_rows | has_auth_rows |
|---|---|---|---|
| [QUARANTINED] MCOF I (d4560000-...-0005) | YES | NO | NO |
| [QUARANTINED] MREF III (d4560000-...-0004) | YES | NO | NO |
| IGF VII (a1b2c3d4-...-0001) | NO | YES | YES |
| MREF III (a1b2c3d4-...-0001) | NO | YES | YES |
| MCOF I (a1b2c3d4-...-0001) | NO | YES | YES |

**Quarantined rows are correctly excluded** — no quarter state or authoritative state rows exist for the orphan fund_ids. Migration 463 worked.

## 4. What the Rewired Page Will Show (Code-Only, No Snapshot Rebuild)

With the code from steps 1-10 deployed but NO snapshot rebuild:

### KPI Strip (top-of-page)
- **Gross IRR / Net IRR:** The page computes `navWeightedAvg("gross_irr")` from released authoritative states only. All three funds have released states with -84% to -99% IRR. The NAV-weighted average will be approximately **-93% gross / -94% net**. This is WORSE than before (the old page showed -92.4% from the portfolio KPI endpoint).
- **Portfolio NAV:** ~$107M (sum of released ending_nav values: $44.3M + $34.3M + $28.6M). The old page showed $107.2M from the same source — this is consistent.

### Per-Row Table
| Fund | IRR Cell | NAV Cell | TVPI Cell |
|---|---|---|---|
| IGF VII | **-84.1%** (from released auth state) | $44.3M | 0.24x |
| MREF III | **-98.8%** | $34.3M | 0.07x |
| MCOF I | **-97.4%** | $28.6M | 0.11x |

**The guard will NOT block these because the snapshots ARE released and authoritative.** The data contract is: "if it's released, render it." The snapshots are released but wrong.

### Quarantined Rows
The quarantined funds have no authoritative state → `getReV2AuthoritativeState` will return `null_reason: "authoritative_state_not_found"` → rendered as `<UnavailableCell nullReason="authoritative_state_not_found" />` → shows "unavailable" with tooltip "No snapshot for this period". **Correct behavior.**

## 5. What the Rewired Page Will Show AFTER Snapshot Rebuild

The snapshot builder needs to be re-run with:
- Expanded SELECTED_INVESTMENT_IDS (20 investments for IGF VII)
- Post-migration-467 deduped cash events
- Patch B fail-closed on net metrics (no waterfall → net_irr = null)

Expected post-rebuild values (from phase3_igf7_receipts.md / golden fund test):
| Fund | Expected gross_irr | Expected net_irr | Expected ending_nav |
|---|---|---|---|
| IGF VII | ~13-16% (pending recalc with full scope) | null (no waterfall) → "unavailable" | ~$1.2B (full 20-investment scope) |
| MREF III | needs recalc (cash events still triplicated) | null → "unavailable" | needs recalc |
| MCOF I | needs recalc (cash events still triplicated) | null → "unavailable" | needs recalc |

**MREF III and MCOF I cash events have NOT been deduped yet (migration 467 only covered IGF VII).** A new dedup migration is needed before their snapshots can be rebuilt correctly.

## 6. Answers to the Three Key Questions

### Q1: Did the top-level portfolio IRR disappear or render unavailable?
**No — it will show approximately -93%.** The released authoritative snapshots carry contaminated IRR values. The page correctly reads them (they're released), so the guard allows rendering. The fix requires rebuilding the snapshots with clean data, not just rewiring the page.

However, after snapshot rebuild: if Patch B makes net_irr = null for all three funds (no waterfall defined), then `navWeightedAvg("net_irr")` will return "—" (all null → no valid values). Gross IRR will depend on the recalculated values with full scope.

### Q2: Did IGF VII still show a sane row-level IRR/TVPI?
**No — it will show -84.1% / 0.24x from the contaminated released snapshot.** It should show ~13-16% / ~1.45x after a full-scope rebuild. The code change alone cannot fix this because the released snapshot IS the data source and it carries wrong values.

### Q3: Did the quarantined funds stop contaminating the KPI strip?
**Yes.** Quarantined fund_ids (`d4560000-...`) have no authoritative state rows. `getReV2AuthoritativeState` returns null_reason → filtered out of NAV-weighted averages and chart data. They will render as "unavailable" rows in the table. **This part works correctly.**

## 7. Recommendation

**Do not deploy code-only.** The code rewire is correct and necessary, but deploying it WITHOUT rebuilding snapshots will change the numbers from "legacy garbage via banned fetcher" to "authoritative garbage via correct fetcher." The visual result is the same class of wrong.

**Required sequence:**
1. Deploy the code (steps 1-10) — this is safe, the numbers will be wrong either way
2. Run cash event dedup for MREF III and MCOF I (new migration 468)
3. Re-run the snapshot builder with expanded scope + clean cash events
4. Verify the rebuilt snapshots show economically sane values
5. Promote the new snapshots to released
6. THEN the page will show correct numbers through the correct path

**The code is the foundation; the rebuild is the payload.**
