# Step 4 — IGF VII Ledger Reseed Result

**Date:** 2026-04-21
**Migration:** `469_igf7_capital_ledger_pro_rata_reseed.sql` (applied to live DB via Supabase MCP)
**Scope:** fund `a1b2c3d4-0003-0030-0001-000000000001` (IGF VII) only; all other funds untouched
**Authorization:** user-approved 2026-04-21, Option A (pro-rata reseed), both contributions + distributions, no overrides

---

## Gate 4 verdict: PASS

Migration completed cleanly. INV-L1 and INV-L2 verified. All 12 partners now have proportional ledger entries.

---

## Before / After summary

### Ledger row counts

| Entry type | Before rows | After rows | Before Σ | After Σ |
|---|---:|---:|---:|---:|
| contribution | 13 | **108** | $1,875,000,000.00 | $695,000,000.00 |
| distribution | 48 | **132** | $927,044,790.66 | $135,507,756.09 |
| **TOTAL** | 61 | **240** | $2,802,044,790.66 | $830,507,756.09 |

108 = 12 partners × 9 CALL events. 132 = 12 partners × 11 DIST events. No row lost, no row conjured.

### INV-L1 (fund-level conservation)

| Check | Value | Invariant | Status |
|---|---:|---|---|
| Σ contributions | $695,000,000.00 | = fund total_called ($695M) | **PASS** (exact) |
| Σ distributions | $135,507,756.09 | = fund total_distributed ($135.5M) | **PASS** (exact) |

### INV-L2 (per-partner pro-rata adherence)

| Partner | Commit% | Expected Contrib | Actual Contrib | Drift |
|---|---:|---:|---:|---:|
| State Pension Fund | 20.00% | $139,000,000 | $139,000,000 | $0.00 |
| University Endowment | 15.00% | $104,250,000 | $104,250,000 | $0.00 |
| Sovereign Wealth Fund | 14.00% | $97,300,000 | $97,300,000 | $0.00 |
| CalPERS Real Estate | 12.50% | $86,875,000 | $86,875,000 | $0.00 |
| BlackRock Real Estate FoF | 10.00% | $69,500,000 | $69,500,000 | $0.00 |
| Hartford Insurance Group | 7.50% | $52,125,000 | $52,125,000 | $0.00 |
| Duke University Endowment | 5.00% | $34,750,000 | $34,750,000 | $0.00 |
| Whitfield Family Office | 5.00% | $34,750,000 | $34,750,000 | $0.00 |
| Texas Teachers Retirement | 5.00% | $34,750,000 | $34,750,000 | $0.00 |
| Meridian Capital Management GP | 2.50% | $17,375,000 | $17,375,000 | $0.00 |
| Evergreen Realty Co-Invest | 2.50% | $17,375,000 | $17,375,000 | $0.00 |
| Winston Capital Management | 1.00% | $6,950,000 | $6,950,000 | $0.00 |

Max per-partner drift: $0.00 (migration's $0.50 tolerance never approached). Same pattern holds for distributions.

### What broke before now works

**Before reseed:** 6 partners had ZERO ledger entries. Meridian GP had $900M contributed on $25M commit. Winston GP had $212.5M on $10M commit. Ledger was double-counting fund-level calls by ~$1B.

**After reseed:** all 12 partners carry pro-rata rows, every row tagged `memo = 'demo reseed — proportional normalization'`, `source = 'generated'`. Σ contributions = fund total_called exactly. Σ distributions = fund total_distributed exactly.

---

## Migration execution log (abbreviated)

```
BEFORE contributions: 13 rows, Σ=$1875000000
BEFORE distributions: 48 rows, Σ=$927044790.66
Total commitments: $1000000000; fund CALL: $695000000; fund DIST: $135507756.09
AFTER  contributions: 108 rows, Σ=$695000000.00
AFTER  distributions: 132 rows, Σ=$135507756.09
INV-L1 OK; INV-L2 OK (contrib drift=$0, dist drift=$0)
```

---

## Files

- [repo-b/db/schema/469_igf7_capital_ledger_pro_rata_reseed.sql](repo-b/db/schema/469_igf7_capital_ledger_pro_rata_reseed.sql) — committed to repo
- Applied via Supabase MCP `apply_migration` (second attempt; first was rolled back cleanly by a source-column CHECK constraint; fix used `source='generated'` + audit tag in `memo`)
