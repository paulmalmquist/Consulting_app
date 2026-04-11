# Phase 1 — Duplicate Entity Forensics Summary

**Date:** 2026-04-11  
**Status:** COMPLETE — 1 CRITICAL finding fixed; 2 false positives resolved; all other vectors clean  

---

## Check Results

| Check | Table | Fund | Finding | Verdict | Migration |
|---|---|---|---|---|---|
| 1.1 Fund logical dupes | `repe_fund` | all | 0 dupes (non-quarantined) | ✓ CLEAN | Phase 0b already fixed |
| 1.2 Deal logical dupes | `repe_deal` | all | 0 dupes | ✓ CLEAN | — |
| 1.3 Asset logical dupes | `repe_asset` | all | 0 dupes | ✓ CLEAN | — |
| 1.4 Entity link dupes | `repe_asset_entity_link` | all | 0 dupes on (asset_id, entity_id, role, effective_from) | ✓ CLEAN | — |
| 1.5 Ownership edge sum > 1 | `repe_ownership_edge` | MREF III | GP entity has 2 × 100% outgoing edges | ✓ BENIGN (see below) | — |
| **1.6 Cash event duplicates** | **`re_cash_event`** | **IGF VII** | **8 events triplicated — 16 extra rows** | **CRITICAL — FIXED** | **467** |
| 1.7 Released snapshot dupes | `re_authoritative_*_state_qtr` | all | 0 dupes per (entity_id, quarter, released) | ✓ CLEAN — trigger holds | — |
| 1.8 JV ownership sum > 1 | `re_jv` | all | All 30 investments: 1 distinct JV at 100% | ✓ CLEAN (query artifact resolved) | — |
| 1.9 `re_fund_quarter_state` per-quarter dupes | `re_fund_quarter_state` | all | 0 multi-row (fund_id, quarter) tuples | ✓ CLEAN | — |

---

## Critical Finding: IGF VII Cash Event Triplication (Check 1.6)

**Classification:** `SEEDING | DATA`

The `456_meridian_three_fund_seed.sql` seed was run three times on 2026-02-27, inserting
the 2026 Q1/Q2 cash events without idempotency guards on each run:

| Run | Timestamp | Result |
|---|---|---|
| 1st | 2026-02-27 16:57:03 | Pre-2026 events (deduplicated by migration 433) |
| 2nd | 2026-02-27 16:58:13 | 2026 Q1/Q2 events inserted ← **KEEP** |
| 3rd | 2026-02-27 20:08:19 | Same 2026 events re-inserted ← **DUPLICATE** |
| 4th | 2026-02-27 20:10:39 | Same 2026 events inserted a third time ← **DUPLICATE** |

**Duplicated events (8 total, each appearing 3 times → 16 rows deleted):**

| Date | Type | Amount | Impact |
|---|---|---|---|
| 2026-01-15 | CALL | $25,000,000 | paid_in_capital inflated +$50M |
| 2026-04-15 | CALL | $10,000,000 | paid_in_capital inflated +$20M |
| 2026-03-31 | DIST | $1,500,000 | distributions inflated +$3M |
| 2026-06-30 | DIST | $2,000,000 | distributions inflated +$4M |
| 2026-03-31 | EXPENSE | $45,000 | net metrics degraded +$90K |
| 2026-06-30 | EXPENSE | $52,000 | net metrics degraded +$104K |
| 2026-01-15 | FEE | $93,750 | cumulative fees inflated +$187.5K |
| 2026-04-15 | FEE | $93,750 | cumulative fees inflated +$187.5K |

**Metric contamination before fix:**

| Metric | Inflated value | Excess | Direction |
|---|---|---|---|
| `paid_in_capital` (total CALL) | $810M | +$70M | overstated |
| `total_distributions` (cumulative DIST for IRR) | inflated | +$7M | overstated |
| `cumulative_fees` | inflated | +$375K | overstated (degrades net) |
| `cumulative_expenses` | inflated | +$194K | overstated (degrades net) |
| `dpi` | wrong | denominator and numerator both inflated | unreliable |
| `gross_irr` | wrong | extra CALL events shift IRR timeline | unreliable |
| `tvpi` | wrong | paid_in_capital denominator inflated | understated |

**Fix:** Migration `467_igf7_cash_event_dedup.sql` — deleted 16 duplicate rows. Keeps the
earliest `created_at` copy per (fund_id, event_date, event_type, amount, investment_id).

**Post-dedup row counts (verified):**
- CALL: 11 rows (all unique)
- DIST: 13 rows (all unique)
- EXPENSE: 5 rows (all unique)
- FEE: 16 rows (all unique)

**Residual impact on authoritative snapshots:** The 2026Q2 IGF VII released snapshot in
`re_authoritative_fund_state_qtr` was computed BEFORE this dedup. Its `canonical_metrics`
(`gross_irr`, `tvpi`, `dpi`, `paid_in_capital`, etc.) reflect the inflated cash flows.
The snapshot must be re-promoted after the code and cash event fixes. This is flagged for
Phase 4b (IRR revalidation) — the post-dedup XIRR recomputation will produce the correct values.

---

## Ownership Edge Finding: GP → SPV Structure (Check 1.5)

**Classification:** BENIGN — Legal entity structure, not metric contamination

Entity `a1b2c3d4-0001-0010-0004-000000000001` = **Meridian RE Partners GP, LLC** (type: `gp`)

The GP entity has two outgoing 100% ownership edges:
- → `a1b2c3d4-0001-0010-0004-000000000004` (**Meridian Dallas JV SPV LLC**, type: `spv`)
- → `a1b2c3d4-0001-0010-0004-000000000005` (**Meridian Phoenix JV SPV LLC**, type: `spv`)

This correctly represents the legal structure: the Meridian GP is the managing member (100%
control) of each of the two JV SPV vehicles for MREF III's Dallas and Phoenix investments.
Owning 100% of two different vehicles is the correct structure — the GP is not double-counted.

**Metric impact: None.** `repe_ownership_edge` is only used in `backend/app/services/repe.py`
for legal entity relationship queries (`GET /api/re/v2/entities/...`). The financial rollup
(`re_rollup.py`) uses `re_jv.ownership_percent` directly, which is confirmed to be 1.0 for
each investment's single distinct JV entity.

---

## JV Ownership False Positive (Check 1.8)

The initial Phase 1.8 query (joining `re_jv` to `repe_asset` via `a.jv_id = jv.jv_id`) returned
inflated `SUM(ownership_percent)` because one JV entity can own multiple assets. For example,
the "Tech Campus North JV" entity owns both "Tech Campus North" and "Tech Campus South Building",
producing 2 rows in the join × 100% = 200%.

The corrected query (summing `DISTINCT jv_id` ownership) shows: all 30 active investments have
exactly **1 distinct JV** with **100% ownership**. No ownership over-attribution anywhere.

---

## Summary

| Category | Clean | Issues found | Fixed | Remaining |
|---|---|---|---|---|
| Entity dedup (fund/deal/asset/link) | 4 vectors | 0 | — | — |
| Cash events | — | 1 CRITICAL (IGF VII triplication) | migration 467 | Snapshots need re-promotion |
| Ownership | — | 1 false positive (GP legal structure) | N/A | — |
| JV ownership | — | 1 false positive (query artifact) | N/A | — |
| Released snapshot uniqueness | 2 tables | 0 | — | — |
| Fund state per-quarter | 1 table | 0 | — | — |

**MREF III and MCOF I: fully clean across all 9 vectors.**  
**IGF VII: cash event triplication fixed; authoritative snapshots need re-promotion.**
