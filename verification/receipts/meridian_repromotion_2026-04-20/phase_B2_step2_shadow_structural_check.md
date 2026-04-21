# Step 2 — IGF VII 2026Q2 Shadow Run (Structural Check)

**Date:** 2026-04-20 20:50 UTC
**Backend build:** commit `b6d62ef6` (engine fix shipped)
**Shadow run_id:** `0fa3d162-1951-4d4a-b51c-c16d73603bc5`
**Definition used:** `a1b2c3d4-0003-0030-0001-000000000099` ("IGF VII Standard Waterfall")
**Status:** structural invariants PASS; economic outputs still wrong (Bug 2 ledger still unfixed, as expected)

---

## Gate 2 verdict

**PASS.** All three waterfall invariants hold on live production data with unchanged (still-bad) ledger. Engine fix is structurally correct. Clear to proceed to Step 3 (ledger reseed spec) without risk that the engine itself is still leaking or double-counting.

---

## Tier-level totals (live)

| Tier | Partners | Total | Check |
|---|---:|---:|---|
| tier_1_return_of_capital | 6 | $1,186,635,762.04 | **= Σ unreturned ($1.187B) ✓** |
| tier_4_carry_split_gp | 2 | $51,947,553.77 | = 20% × $259.7M residual ✓ |
| tier_4_carry_split_lp | 10 | $207,790,215.09 | = 80% × $259.7M residual ✓ |
| **TOTAL** | — | **$1,446,373,530.90** | **= distributable (no leak) ✓** |

Tier 2 (preferred return) and tier 3 (GP catch-up) fired with $0 — expected because partner `pref_due` fixtures are not being seeded by the runtime; the engine correctly skips empty tiers and cascades remaining to tier 4. Not a bug, but logged here for Step 6's hand-receipt comparison.

### Invariants confirmed

- **INV-W1 (conservation)** — `tier_1_total == min(remaining, Σ unreturned) = $1,186,635,762.04` exactly (to the penny).
- **INV-W2 (per-partner cap)** — all 12 partners PASS. See table below.
- **INV-W3 (residual correctness)** — total payouts across all tiers = distributable = $1,446,373,530.90 exactly. Tier 4 consumed from tier 1's residual ($259.7M), not from the full distributable.

---

## Per-partner INV-W2 verification (Supabase direct query)

| Partner | Type | Committed | Unreturned | Tier 1 | Tier 4 | INV-W2 |
|---|---|---:|---:|---:|---:|---|
| Meridian Capital Management GP | gp | $25M | $787.00M | **$787.00M** | $37.10M | PASS (= unreturned) |
| Winston Capital Management | gp | $10M | $106.62M | **$106.62M** | $14.84M | PASS (= unreturned) |
| State Pension Fund | lp | $200M | $99.50M | $99.50M | $43.07M | PASS |
| University Endowment | lp | $150M | $98.62M | $98.62M | $32.30M | PASS |
| Sovereign Wealth Fund | lp | $140M | $8.19M | $8.19M | $30.15M | PASS |
| CalPERS Real Estate | lp | $125M | $86.70M | $86.70M | $26.92M | PASS |
| BlackRock Real Estate FoF | lp | $100M | **$0** | **$0** | $21.53M | PASS (= 0) |
| Hartford Insurance Group | lp | $75M | **$0** | **$0** | $16.15M | PASS (= 0) |
| Duke University Endowment | lp | $50M | **$0** | **$0** | $10.77M | PASS (= 0) |
| Whitfield Family Office | lp | $50M | **$0** | **$0** | $10.77M | PASS (= 0) |
| Texas Teachers Retirement System | lp | $50M | **$0** | **$0** | $10.77M | PASS (= 0) |
| Evergreen Realty Co-Invest | co_invest | $25M | **$0** | **$0** | $5.38M | PASS (= 0) |

All 12 partners satisfy `tier_1_received ≤ unreturned_capital`. Zero-unreturned partners receive $0 in tier 1 (the engine behavior that was always correct; their $0 result is the symptom of Bug 2, not Bug 1).

---

## Comparison — before engine fix vs after

| Dimension | Before (shadow de64bb0a) | After (shadow 0fa3d162) |
|---|---:|---:|
| Tier 1 total | $1,446,373,530.90 | **$1,186,635,762.04** |
| Partners in tier 1 with `payout > unreturned` | 6 of 6 | **0** (all capped) |
| Over-allocation factor | 1.2189× | **1.0×** |
| Tiers 2/3/4 fired | NO | **YES (tier 4 on $259.7M residual)** |
| Total payouts | $1.446B | $1.446B (conservation held both times) |

---

## What's still wrong (Bug 2 — ledger)

The economic outputs are still nonsensical because the ledger-seeding contract violation hasn't been fixed:

- GPs still receive tier-1 amounts wildly exceeding their commitment (Meridian GP: $787M on $25M committed; Winston: $107M on $10M committed). That's because `unreturned` on the ledger is still inflated by fund-level CALL amounts tagged to individual partners.
- 6 zero-unreturned LPs still get $0 in tier 1 (BlackRock, Hartford, Duke, Whitfield, Texas Teachers, Evergreen). The engine correctly pays them their weight (zero); the bug is that they should have weight > 0 per Bug 2.

These are expected given Bug 1 is fixed and Bug 2 is not. The purpose of Step 2 was to prove the engine fix doesn't introduce secondary bugs — not to produce investor-grade numbers.

**Do not re-promote IGF VII yet.** The `inv5-rebuild-20260411-full-scope` snapshot remains the authoritative record until ledger reseed (Step 4) + final waterfall run (Step 5) + per-partner hand-receipt check (Step 6) all pass.

---

## Next step — Step 3

Draft the ledger reseed migration spec. Present two options to user, await sign-off before executing any data change. Per plan [fizzy-sprouting-sundae.md §Step 3].

---

## Artifacts

- Shadow payload: `/tmp/igf7_step2_shadow.json` (local; run_id `0fa3d162-1951-4d4a-b51c-c16d73603bc5` persisted to `re_waterfall_run_result`)
- Engine commit: `b6d62ef6` on `main`
- Test suite: [backend/tests/test_waterfall_tier_allocations.py](backend/tests/test_waterfall_tier_allocations.py) — 10 invariant tests, all green local + CI
