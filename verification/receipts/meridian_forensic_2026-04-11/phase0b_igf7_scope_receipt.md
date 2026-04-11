# Phase 0b — IGF VII Snapshot-Scope Receipt

**Run date:** 2026-04-11  
**Fund:** Institutional Growth Fund VII  
**Fund ID:** `a1b2c3d4-0003-0030-0001-000000000001`  
**Quarter:** 2026Q2  
**Env:** `a1b2c3d4-0001-0001-0003-000000000001`

---

## Root Cause

`SELECTED_INVESTMENT_IDS` in `verification/runners/meridian_authoritative_snapshot.py` (line 39) was a
hardcoded list of only **4 entries total**, with only **1 entry** for IGF VII
(`2d54b971-21ac-41b8-a548-a506fe516c6c` — Tech Campus North).

The snapshot builder iterates `investment_state_map` (populated only for `SELECTED_INVESTMENT_IDS`) when
computing fund-level NAV aggregation at line 1057. This means:

- Investment-level authoritative snapshots were built for **1 of 20** IGF VII investments.
- Fund-level NAV aggregation used **only Tech Campus North** ($55.3M raw / ~$44.2M fund-attributable).
- The released 2026Q2 IGF VII fund snapshot reported **≈$44M portfolio NAV** — understated by **≈$1,194M**.
- **Every IGF VII metric derived from fund NAV was wrong:** gross_tvpi, dpi, rvpi, gross_irr, net_tvpi.

---

## Pre-Fix: Investments in Snapshot Scope

| Investment ID | Name | Status |
|---|---|---|
| `2d54b971-21ac-41b8-a548-a506fe516c6c` | Tech Campus North | **In scope** |
| (19 others) | — | **MISSING** |

---

## Post-Fix: All 20 IGF VII Investments

All 20 investments confirmed in database with valid `re_asset_quarter_state` for 2026Q2 and
`re_jv.lp_percent` set.

| # | Investment ID | Name | Raw NAV (2026Q2) | LP% | Fund-Attributable NAV |
|---|---|---|---|---|---|
| 1 | `d4560000-0456-0101-0006-000000000001` | Lone Star Distribution | $150,100,000 | 88% | $132,088,000 |
| 2 | `d4560000-0456-0101-0007-000000000001` | Peachtree Logistics Park | $137,200,000 | 88% | $120,736,000 |
| 3 | `d4560000-0456-0101-0001-000000000001` | Meadowview Apartments | $129,000,000 | 90% | $116,100,000 |
| 4 | `d4560000-0456-0101-0008-000000000001` | Northwest Commerce Center | $117,000,000 | 85% | $99,450,000 |
| 5 | `d4560000-0456-0101-0002-000000000001` | Sunbelt Crossing | $116,300,000 | 90% | $104,670,000 |
| 6 | `d4560000-0456-0101-0004-000000000001` | Bayshore Flats | $108,200,000 | 90% | $97,380,000 |
| 7 | `d4560000-0456-0101-0003-000000000001` | Pinehurst Residences | $97,800,000 | 90% | $88,020,000 |
| 8 | `594a1367-8109-49db-a353-44685fe6578e` | Suburban Office Park | $89,600,000 | 80% | $71,680,000 |
| 9 | `d4560000-0456-0101-0005-000000000001` | Oakridge Residences | $84,900,000 | 90% | $76,410,000 |
| 10 | `5b642a1e-feb7-4407-b38e-cdd2649c1b77` | Lakeside Senior Living | $69,300,000 | 80% | $55,440,000 |
| 11 | `93b29b91-fa91-47d5-ac93-cf3b7468c63a` | Cascade Multifamily | $57,700,000 | 80% | $46,160,000 |
| 12 | `8d2128bf-d8d2-4c9f-bc7c-05f77d437767` | Harborview Logistics Park | $57,500,000 | 80% | $46,000,000 |
| 13 | `2d54b971-21ac-41b8-a548-a506fe516c6c` | Tech Campus North | $55,300,000 | 80% | $44,240,000 |
| 14 | `eb6e5e5b-a1be-426c-84f8-38e66febb43a` | Harbor Industrial Portfolio | $46,800,000 | 80% | $37,440,000 |
| 15 | `8d87e8f7-9730-4f48-ab72-1ff741aa753a` | Riverfront Apartments | $44,700,000 | 80% | $35,760,000 |
| 16 | `b72d7d6d-396d-4787-9075-f739d23a10f3` | Pacific Gateway Hotel | $44,000,000 | 80% | $35,200,000 |
| 17 | `9689adf7-6e9f-43d4-a4db-e0c3b6a979a3` | Meridian Office Tower | $30,000,000 | 80% | $24,000,000 |
| 18 | `6e5be7a6-b228-4031-8799-ed5ab01c92ff` | Summit Retail Center | $7,000,000 | 80% | $5,600,000 |
| 19 | `6c6f1416-e1a4-43ff-bbe6-cad3967f97ff` | Downtown Mixed-Use | $5,800,000 | 80% | $4,640,000 |
| 20 | `6a793adf-cdfb-49f3-8a2e-440d38c48dea` | Ironworks Mixed-Use | -$1,800,000 | 80% | -$1,440,000 |
| | **TOTAL** | | **$1,446,400,000** | | **≈$1,238,574,000** |

*NAV figures are approximate from 2026Q2 asset_quarter_state. Fund-attributable = Raw NAV × LP%.*

---

## Fix Applied

`SELECTED_INVESTMENT_IDS` in `verification/runners/meridian_authoritative_snapshot.py` expanded from
4 entries to 23 entries — all 20 IGF VII investments retained, plus original 3 entries for MREF III and MCOF I.

**Expected post-fix IGF VII 2026Q2 fund snapshot:**

| Metric | Pre-fix (1 investment) | Post-fix (20 investments) | Delta |
|---|---|---|---|
| portfolio_nav | ≈$44,240,000 | ≈$1,238,574,000 | +$1,194,334,000 |
| All derived metrics | **WRONG** | Pending re-run | — |

---

## Next Step

Re-run `python verification/runners/meridian_authoritative_snapshot.py` for IGF VII 2026Q2 to rebuild
the authoritative snapshot with the full 20-investment scope. Then re-run Phase 0 baseline to confirm
post-fix metrics.
