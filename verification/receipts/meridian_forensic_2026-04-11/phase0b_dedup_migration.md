# Phase 0b — Orphaned Fund Dedup Migration Receipt

**Date:** 2026-04-11  
**Migration:** `463_meridian_orphan_fund_dedup.sql`  
**Status:** APPLIED AND VERIFIED  

---

## Problem Summary (NF-1)

Phase 0 baseline queries revealed five `repe_fund` rows for the Meridian environment
where only three canonical funds should exist. Two orphan rows (`d4560000-...` series)
had entity graphs (deals/assets) but zero cash events and zero authoritative snapshots.
These orphan rows had accumulated stale `re_fund_quarter_state` entries that
contaminated any legacy NAV lookup joining across `fund_id`.

Additionally, the active canonical rows for MREF III and MCOF I carried incorrect
metadata introduced by a prior seed pass.

---

## Pre-Migration State

| fund_id | name | vintage_year | status | fund_type | qtr_state_rows | auth_rows |
|---|---|---|---|---|---|---|
| `a1b2c3d4-...-0001` | Meridian Real Estate Fund III | **2026** ❌ | **investing** ❌ | closed_end | 12 | 10 |
| `a1b2c3d4-...-0002` | Meridian Credit Opportunities Fund I | 2024 | investing | **open_end** ❌ | 12 | 10 |
| `a1b2c3d4-...-0003` | Institutional Growth Fund VII | 2021 | investing | closed_end | 12 | 10 |
| `d4560000-...-0004` | Meridian Real Estate Fund III | 2019 | harvesting | closed_end | **12** ❌ | 0 |
| `d4560000-...-0005` | Meridian Credit Opportunities Fund I | 2024 | investing | closed_end | **10** ❌ | 0 |

**Orphan entity graph confirmed:**
- MREF III orphan (`d4560000-...-0004`): 11 deals, 11 assets, 0 cash events — all `d4560000-0456-0102-*` UUIDs
- MCOF I orphan (`d4560000-...-0005`): 8 deals, 8 assets, 0 cash events — all `d4560000-0456-0103-*` UUIDs
- Active MREF III (`a1b2c3d4-...-0001`): 2 deals, 4 assets — completely different deal names (no overlap)
- Active MCOF I (`a1b2c3d4-...-0002`): 8 deals, 8 assets — completely different deal names (no overlap)

**Total contaminating stale rows:** 22 (`re_fund_quarter_state` only; no auth snapshots on orphans)

---

## Fixes Applied

### 1. MREF III active (`a1b2c3d4-0001-0010-0001-000000000001`) — metadata repair
| Field | Before | After |
|---|---|---|
| `vintage_year` | 2026 | **2019** |
| `status` | investing | **harvesting** |

Source of truth: seed `456_meridian_three_fund_seed.sql` line 284 specifies `vintage_year=2019`, `inception_date='2019-03-01'`. A 10-year fund that started in 2019 is past its investing period and should be harvesting.

### 2. MCOF I active (`a1b2c3d4-0002-0020-0001-000000000001`) — metadata repair
| Field | Before | After |
|---|---|---|
| `fund_type` | open_end | **closed_end** |

Source of truth: seed `456_meridian_three_fund_seed.sql` line 296 specifies `closed_end`.

### 3. MREF III orphan (`d4560000-0003-0030-0004-000000000001`) — quarantined
- `name` → `[QUARANTINED] Meridian Real Estate Fund III`
- `status` → `closed`
- 12 stale `re_fund_quarter_state` rows deleted

### 4. MCOF I orphan (`d4560000-0003-0030-0005-000000000001`) — quarantined
- `name` → `[QUARANTINED] Meridian Credit Opportunities Fund I`
- `status` → `closed`
- 10 stale `re_fund_quarter_state` rows deleted

---

## Post-Migration State (verified live)

| fund_id | name | vintage_year | status | fund_type | qtr_state_rows | auth_rows |
|---|---|---|---|---|---|---|
| `a1b2c3d4-...-0001` | Meridian Real Estate Fund III | **2019** ✓ | **harvesting** ✓ | closed_end ✓ | 12 | 10 |
| `a1b2c3d4-...-0002` | Meridian Credit Opportunities Fund I | 2024 | investing | **closed_end** ✓ | 12 | 10 |
| `a1b2c3d4-...-0003` | Institutional Growth Fund VII | 2021 | investing | closed_end | 12 | 10 |
| `d4560000-...-0004` | **[QUARANTINED]** MREF III | 2019 | **closed** ✓ | closed_end | **0** ✓ | 0 |
| `d4560000-...-0005` | **[QUARANTINED]** MCOF I | 2024 | **closed** ✓ | closed_end | **0** ✓ | 0 |

---

## Row Count Changes

| Table | Operation | Rows Affected |
|---|---|---|
| `repe_fund` | UPDATE (metadata fix) | 2 active rows |
| `repe_fund` | UPDATE (quarantine name/status) | 2 orphan rows |
| `re_fund_quarter_state` | DELETE (stale orphan rows) | **22 rows** |
| `re_authoritative_fund_state_qtr` | none (orphans had 0 rows) | 0 |
| `repe_deal` | none (orphan deals left under quarantined parent) | 0 |
| `repe_asset` | none | 0 |

---

## Why Orphan Deals Were Not Re-assigned

The 19 orphan deals (11 MREF III + 8 MCOF I) have no cash events, no
`re_asset_quarter_state` rows, and no investment-level metrics. They are structural
ghost records with no economic content. Re-assigning them to the canonical fund_ids
would pollute the active entity graph with deals that have never been economically
characterized. The correct approach is:
1. Leave them parented under the quarantined fund row (excluded by `status != 'closed'` filters)
2. Phase 1 comprehensive forensics will enumerate them in `phase1_duplicates.csv`
3. Migration 467 (conditional residual dedup) can delete them if Phase 1 confirms no value

---

## Blast Radius — What This Fixes

- **Legacy NAV inflation**: 22 stale `re_fund_quarter_state` rows for orphan funds
  no longer participate in any JOIN-based aggregation
- **Fund count**: Any query `SELECT COUNT(*) FROM repe_fund WHERE status != 'closed'`
  now correctly returns 3 (was 5)
- **Rollup contamination**: `rollup_fund` and `compute_return_metrics` JOIN paths
  that iterate over `repe_fund` for a given `business_id` will no longer encounter orphan rows
- **Seed idempotency**: MREF III seed `ON CONFLICT (fund_id) DO NOTHING` will now
  leave the active row alone; its vintage_year and status are correct

---

## Idempotency Verification

Re-running migration 463 against the post-migration state produces:
- All four `IF NOT FOUND` branches fire (no updates needed)
- All DELETE statements delete 0 rows
- All post-migration assertions pass
- Net effect: zero rows changed

---

## Post-migration assertions — all passed

- [x] MREF III active: `vintage_year = 2019`, `status = 'harvesting'`
- [x] MCOF I active: `fund_type = 'closed_end'`
- [x] Both orphan funds: `status = 'closed'`
- [x] Zero `re_fund_quarter_state` rows for orphan fund_ids
- [x] Zero `re_authoritative_fund_state_qtr` rows for orphan fund_ids (unchanged — were already 0)
