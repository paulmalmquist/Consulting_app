# Phase B3 (revised) — IGF VII 2026Q2 Waterfall Run

**Date:** 2026-04-20
**Fund:** Institutional Growth Fund VII (`a1b2c3d4-0003-0030-0001-000000000001`)
**Quarter:** 2026Q2
**Waterfall run_id:** `de64bb0a-7547-4b9f-9222-8a8d8a4430ff`
**Definition used:** `a1b2c3d4-0003-0030-0001-000000000099` ("IGF VII Standard Waterfall", european)
**Status field:** `success`
**Economic verdict:** **NOT SAFE** — the run produces partner-level allocations that are economically impossible.

---

## What ran

After migration 468 deactivated the ambiguous "Default" waterfall, `run_waterfall` deterministically selected "IGF VII Standard Waterfall" and completed without error. Tier-level totals:

| Tier | Payout type | Partners | Total amount |
|---|---|---:|---:|
| tier_1_return_of_capital | return_of_capital | 6 of 12 | **$1,446,373,530.90** |
| tier_2_preferred_return | — | 0 | $0 |
| tier_3_catch_up | — | 0 | $0 |
| tier_4_split | — | 0 | $0 |

**Total distributable:** $1,446,373,530.90 (matches `re_fund_quarter_state.portfolio_nav`).
**Total distributed in this run:** $1,446,373,530.90 (matches).
**Carry generated:** $0.

---

## Finding — partner allocations violate economic invariants

The $1.446B is distributed across partners as follows:

| Partner | Type | Committed | Returned (tier 1) | Unreturned | **Invariant violation** |
|---|---|---:|---:|---:|---|
| Meridian Capital Management GP | gp | $25,000,000 | $959,260,706.90 | **-$934M** | **Returned 38× committed** — impossible (can't return more than paid in) |
| Winston Capital Management | gp | $10,000,000 | $129,961,972.84 | **-$120M** | **Returned 13× committed** — impossible |
| State Pension Fund | lp | $200,000,000 | $121,276,689.98 | $78.7M | Under-returned (tier 1 should return full commitment before advancing) |
| University Endowment | lp | $150,000,000 | $120,210,874.57 | $29.8M | Under-returned |
| Sovereign Wealth Fund | lp | $140,000,000 | $9,985,410.12 | $130M | Severely under-returned |
| CalPERS Real Estate | lp | $125,000,000 | $105,677,876.48 | $19.3M | Under-returned |
| BlackRock Real Estate FoF | lp | $100,000,000 | **$0** | $100M | **Got nothing** |
| Hartford Insurance Group | lp | $75,000,000 | **$0** | $75M | **Got nothing** |
| Duke University Endowment | lp | $50,000,000 | **$0** | $50M | **Got nothing** |
| Whitfield Family Office | lp | $50,000,000 | **$0** | $50M | **Got nothing** |
| Texas Teachers Retirement | lp | $50,000,000 | **$0** | $50M | **Got nothing** |
| Evergreen Realty Co-Invest | co_invest | $25,000,000 | **$0** | $25M | **Got nothing** |

**Total committed:** $1,000,000,000
**Total returned tier 1:** $1,446,373,530.90 (exceeds committed by $446M)

### Why this matters

Tier 1 (return_of_capital) is supposed to return each partner's paid-in capital — capped at `committed_amount` per partner. The engine is ignoring that cap:

1. **GPs receiving 13-38× their commitment** indicates the tier-1 allocation is not bounded by `paid_in_capital` per partner.
2. **5 LPs receiving $0** despite $325M combined commitment indicates the tier-1 iteration terminates early or the partner-selection query is scope-limited.
3. The fund has a NAV of $1.446B but only $833M called — the engine appears to be treating NAV as the distributable and allocating it without regard to what each partner actually paid in.

### Root-cause hypothesis (not verified this session)

The engine likely reads partner allocations from `re_capital_account_snapshot` or a similar table, but for IGF VII that snapshot may be:
- Missing for 5 of the 12 partners (explains $0 rows)
- Inflated for GPs (explains 38× return on Meridian Capital Management GP)

Alternatively, the engine's tier-1 logic computes per-partner `return_of_capital = total_distributable × (paid_in / total_paid_in)` without capping at `paid_in`, which would over-distribute to large contributors and under-distribute to small ones — consistent with the observed pattern.

**This requires a separate forensic investigation of `re_waterfall_runtime.run_waterfall` tier-1 allocation logic and the underlying capital-account data before any re-promotion.**

---

## What was committed

✅ **Migration 468 applied** (deactivates "Default" waterfall): clean, verified. 1 active definition remains. This is the right fix for the two-active-definitions ambiguity; the migration itself is independent of the partner-allocation bug surfaced by the waterfall run.

❌ **Waterfall run_id `de64bb0a-...` was written to `re_waterfall_run` / `re_waterfall_run_result`** but the results are economically invalid. The run_type is `shadow` (not `final`), so it does not promote to any snapshot — safe to leave as a forensic record. **No authoritative snapshot was modified.**

❌ **No snapshot re-promotion.** Because the waterfall produces invalid net-metric inputs, no re-promotion was attempted. IGF VII's authoritative snapshot remains at `inv5-rebuild-20260411-full-scope` (unchanged from session start).

---

## Next-session prerequisites (cannot run further without these)

1. **Investigate `re_waterfall_runtime.run_waterfall` tier-1 logic.** Read the Python source and confirm whether it caps tier-1 returns at each partner's `paid_in_capital`, or whether it over-distributes proportionally to a shared `total_distributable` pool.

2. **Audit `re_capital_account_snapshot` or equivalent for IGF VII 2026Q2.** Determine why 5 LPs show $0 return and 2 GPs show 13-38× returns.

3. **Validate partner commitments.** The 12 partners and $1B total commitment reconcile with `repe_fund.total_committed`, so the commitment side is sound. The issue is in the allocation engine or the capital-account state.

4. **Do not promote IGF VII until the allocation bug is resolved.** The current authoritative snapshot correctly shows `net_irr = null` / `carry = null` (fail-closed per Patch B). Promoting a carry of $0 would be wrong; it would imply the GPs have no carry when the fund is ~43% IRR and well above hurdle — the truth is the engine can't compute it, which is what null-by-design is for.

---

## Summary

| Action | Status |
|---|---|
| B1 reconciliation baseline | ✅ CLEAN (this was the Phase B gate; no NAV issues) |
| B2 migration 468 (deactivate "Default" waterfall) | ✅ APPLIED + VERIFIED |
| B3 `run_waterfall` for IGF VII 2026Q2 | ⚠️  RAN, economically invalid results — STOP |
| B3 snapshot re-promotion | ❌ NOT ATTEMPTED (correct — engine produces bad inputs) |
| Carry-forward: investigate tier-1 allocation logic + capital-account state | **Next session** |
