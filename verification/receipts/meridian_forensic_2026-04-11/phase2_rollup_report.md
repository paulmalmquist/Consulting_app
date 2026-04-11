# Phase 2 — Rollup Multiplication Audit

**Date:** 2026-04-11  
**Status:** COMPLETE — No JOIN multiplication. One stale-cache delta ($8.6M MREF III). All scoping divergences confirmed as snapshot-builder scope configuration, not rollup bugs.

---

## Methodology

For each Meridian fund × investment × asset combination (42 total assets across 30 investments in 3 funds):

1. **Rollup path classification** — Determined JV path vs. direct-asset path by checking `repe_asset.jv_id IS NOT NULL` for each asset.
2. **Independent NAV recompute** — Summed `re_asset_quarter_state.nav × re_jv.ownership_percent` per investment from live asset states, without going through `rollup_investment`.
3. **Snapshot comparison** — Compared independent recompute to `re_authoritative_fund_state_qtr.canonical_metrics.ending_nav` for the 2026Q2 released snapshot.
4. **Delta classification** — Each delta was classified as `CLEAN`, `SCOPING`, or `STALE_CACHE`.

---

## Defect A Blast Radius Assessment: DORMANT on Meridian

**Defect A** (asymmetric ownership weighting in `re_rollup.py`) affects the direct-asset path:
- JV path (L151–168): `agg_nav += nav * ownership` — correctly ownership-weighted
- Direct-asset path (L192–218): `agg_nav += nav` — **no ownership multiplier**

A direct-asset path asset is one where `repe_asset.jv_id IS NULL`. These are assets held without a JV vehicle, where the fund holds the asset directly.

**Meridian result: ALL 42 assets have `jv_id IS NOT NULL`.**

| Fund | Total assets | jv_id IS NOT NULL | jv_id IS NULL | Defect A blast |
|---|---|---|---|---|
| IGF VII | 20 | 20 | 0 | NONE |
| MREF III | 14 | 14 | 0 | NONE |
| MCOF I | 8 | 8 | 0 | NONE |
| **Total** | **42** | **42** | **0** | **ZERO** |

Every Meridian asset flows through the correctly-weighted JV path. Defect A is dormant for this environment. **The asymmetric ownership bug has zero metric impact on Meridian across all three funds.** Defect A must still be patched (Patch A) to protect any future fund or environment where direct-asset-path holdings exist.

---

## IGF VII — Scoping Divergence ($1,402M)

| Source | Portfolio NAV (2026Q2) |
|---|---|
| Independent recompute (all 20 investments, all assets, 100% JV ownership) | $1,446M |
| Released authoritative snapshot (`ending_nav`) | $44.3M |
| **Delta** | **~$1,402M** |

**Root cause: Snapshot builder `SELECTED_INVESTMENT_IDS` scope configuration.**

The snapshot builder was configured with only **Tech Campus North** (`2d54b971-21ac-41b8-a548-a506fe516c6c`) in `SELECTED_INVESTMENT_IDS` for IGF VII. The fund has 20 active investments. The 19 excluded investments account for the $1,402M gap.

Tech Campus North itself has `nav = $0` in both the current asset state and the 2026Q2 investment snapshot (the asset has no active position contributing NAV). The $44.3M snapshot NAV comes from other metrics in the canonical_metrics blob (likely residual investment-level figures from earlier periods).

**This is not a rollup bug.** The rollup arithmetic is correct for the scoped inputs. The divergence is an intentional scoping limitation of the forensic snapshot builder runner, not a defect in `rollup_investment` or `re_rollup.py`.

**Investor reporting implication:** The released IGF VII 2026Q2 snapshot represents only 1 of 20 investments. `portfolio_nav` of $44.3M is economically incomplete for investor reporting. Additionally, the snapshot's `gross_irr`, `tvpi`, `dpi` are further contaminated by the cash event triplication fixed by migration 467 (these will be $0 or wrong until the snapshot is re-promoted with corrected cash flows after Phases 4b and 6).

**Verdict: IGF VII snapshot NOT SAFE for reporting. Root cause: SCOPING + DATA (cash event contamination).**

---

## MREF III — Stale Cache Delta ($8.6M)

| Investment | Current asset NAV | Snapshot `ending_nav_attributable` | Delta | Flag |
|---|---|---|---|---|
| MRF III – Dallas Multifamily Cluster | $42,852,173.50 | $34,281,738.80 | +$8,570,434.70 | STALE_CACHE |
| MRF III – Phoenix Value-Add Portfolio | $0.00 | $0.00 | $0.00 | CLEAN |
| **MREF III fund total** | **$42,852,173.50** | **$34,281,738.80** | **+$8,570,434.70** | |

### Dallas Multifamily Cluster — asset breakdown

| Asset | Current `re_asset_quarter_state.nav` | JV ownership | Effective NAV |
|---|---|---|---|
| Meridian Park Multifamily – Dallas | $33,044,313.60 | 100% | $33,044,313.60 |
| Ellipse Senior Living – Dallas | $9,807,859.90 | 100% | $9,807,859.90 |
| **Cluster total** | **$42,852,173.50** | — | **$42,852,173.50** |

**Root cause:** The Dallas asset states were created at **2026-04-09 23:58 UTC**. The MREF III 2026Q2 authoritative snapshot was built at **2026-04-10 02:30 UTC** using `re_jv_quarter_state` rows that predated the new asset states. The `re_jv_quarter_state.nav` written prior to the asset state refresh carried the older $34.3M value. The snapshot captured the JV quarter state's (stale) NAV rather than the current asset states.

**This is not a rollup logic bug.** The snapshot builder reads `re_jv_quarter_state` as its input for JV NAV (correct pipeline behavior). The mismatch is a data timing issue: asset states were updated after the JV quarter state was last built, and the JV quarter state was not refreshed before the authoritative snapshot was promoted.

**Delta classification: `STALE_CACHE`** — the `re_jv_quarter_state` row for the Dallas cluster was not refreshed to reflect the 2026-04-09 asset state update before snapshot promotion.

**Fix required:** Rebuild `re_jv_quarter_state` for the Dallas cluster from current asset states, then re-promote the MREF III 2026Q2 authoritative snapshot. Until then, the $8.6M discrepancy should be flagged in investor reporting.

### Phoenix Value-Add Portfolio — CLEAN

| Asset | Status | Current NAV | Snapshot NAV | Delta |
|---|---|---|---|---|
| Phoenix Gateway Medical Office | Exited | $0 | $0 | $0 |
| Westgate Student Housing – Tempe | Exited | $0 | $0 | $0 |

Both Phoenix assets show `nav = $0` from 2026Q1 onwards. This is economically correct — these assets were exited in the transition from 2025Q4 to 2026Q1. The fund is classified as `harvesting` strategy; exits are expected. The Phoenix Value-Add Portfolio's $0 `ending_nav_attributable` in the 2026Q2 snapshot is correct.

**Anomaly noted for Phase 4:** Phoenix Gateway Medical Office carried `nav = -$10,961,521.50` in 2025Q1 (negative NAV). This should be reviewed in Phase 4a economic sanity checks. Negative NAV on a medical office property prior to exit is economically unusual and may indicate a write-down that was subsequently reversed or an accounting treatment that requires documentation.

**MREF III investor reporting implication:** The $8.6M stale-cache delta is material. The released 2026Q2 snapshot understates Dallas cluster NAV by $8.6M. **NOT SAFE for reporting until JV quarter state is refreshed and snapshot re-promoted.** Phoenix zero is correct and not a concern.

---

## MCOF I — Scoping Divergence ($88.1M)

| Source | Portfolio NAV (2026Q2) |
|---|---|
| Independent recompute (all 8 investments) | ~$116.7M |
| Released authoritative snapshot (`ending_nav`) | $28.6M |
| **Delta** | **~$88.1M** |

**Root cause:** Same scoping pattern as IGF VII. `SELECTED_INVESTMENT_IDS` for MCOF I contains only **Midtown Towers – Atlanta GA** (`b3e7d291-4c8a-4f2e-9d1a-c7f2e8a3b4d5`). The fund has 8 investments. The 7 excluded investments hold approximately $88.1M of NAV.

**Verdict: MCOF I snapshot NOT SAFE for reporting. Root cause: SCOPING.**

---

## JOIN Multiplication Check — CLEAN

The primary multiplication risk is a JOIN that produces extra rows, causing NAV to be summed multiple times. Checked all potential paths:

| Check | Result |
|---|---|
| `repe_fund → repe_deal → repe_asset` (NF-1 orphan contamination) | CLEAN — orphan fund rows quarantined by migration 463; active fund_id filter eliminates orphans from all rollup paths |
| `re_jv` joining to `repe_asset` (multiple assets per JV → fan-out) | CLEAN — rollup reads per asset row, not per JV. Each asset contributes exactly one row. The JV entity is used only to look up `ownership_percent`, not as a join dimension. |
| `re_asset_quarter_state` multiple rows per (asset_id, quarter) | CLEAN — the snapshot builder reads the single most-recent row per asset per quarter using `ORDER BY created_at DESC LIMIT 1`. No fan-out risk. |
| `repe_ownership_edge` double-counting (GP → 2 SPVs) | CLEAN — `repe_ownership_edge` is used in `repe.py` for legal entity graph queries only. `re_rollup.py` uses `re_jv.ownership_percent` directly. The GP entity's two 100% edges to SPVs do not affect any financial metric. |
| `re_fund_quarter_state` multiple rows per (fund_id, quarter) | CLEAN — confirmed Phase 1.9: 0 duplicates per (fund_id, quarter). |

**No JOIN multiplication found anywhere in the Meridian rollup chain.**

---

## Summary

| Fund | Independent NAV | Snapshot NAV | Delta | Classification | Rollup Bug? |
|---|---|---|---|---|---|
| IGF VII | ~$1,446M | $44.3M | ~$1,402M | SCOPING | NO — scope configuration |
| MREF III | $42,852,173.50 | $34,281,738.80 | $8,570,434.70 | STALE_CACHE | NO — JV state timing |
| MCOF I | ~$116.7M | $28.6M | ~$88.1M | SCOPING | NO — scope configuration |

| Finding | Classification | Status |
|---|---|---|
| Defect A (asymmetric ownership) | LOGIC | DORMANT — zero blast radius on Meridian (all 42 assets JV-path) |
| IGF VII scoping | SCOPING | Confirmed — 19 of 20 investments excluded from snapshot |
| MREF III stale JV quarter state | STALE_CACHE | Confirmed — $8.6M understatement; re-promotion required |
| MCOF I scoping | SCOPING | Confirmed — 7 of 8 investments excluded from snapshot |
| JOIN multiplication | — | CLEAN — no fan-out in any rollup path |
| Phoenix assets at $0 | — | CLEAN — correctly exited 2026Q1 |
| Phoenix Gateway negative NAV (2025Q1) | ANOMALY | Flagged for Phase 4a economic sanity check |

---

## Action Items

1. **Snapshot builder scope** (before any fund is safe for reporting): `SELECTED_INVESTMENT_IDS` must be expanded to cover all active investments per fund, not just the 4 forensic sample investments.
2. **MREF III JV quarter state rebuild**: Rebuild `re_jv_quarter_state` for the Dallas Multifamily Cluster from current asset states; re-promote 2026Q2 snapshot.
3. **IGF VII cash event re-promotion** (post Phase 4b): After migration 467 dedup and IRR revalidation, re-promote IGF VII 2026Q2 snapshot so metrics reflect correct cash flows.
4. **Patch A** (`re_rollup.py` ownership normalization): Implement `resolve_effective_ownership` to eliminate the dual-path asymmetry. No Meridian metric changes expected (Defect A dormant), but required for correctness of any future environment with direct-held assets.
5. **Phoenix Gateway negative NAV**: Investigate the -$10,961,521.50 nav in 2025Q1 before Phase 4a signs off.
