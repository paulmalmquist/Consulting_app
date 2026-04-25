# Phase C5 — Unified 2026Q2 Snapshot + UI Layer

**Date:** 2026-04-25  
**Status:** COMPLETE — Single snapshot_version across all three funds. mixed_release_states=false. UI scope/trust/contribution layer live.

---

## Unified snapshot

| Field | Value |
|---|---|
| `snapshot_version` | `meridian-20260425T015634Z-bd0a25c2` |
| `audit_run_id` | `baaa43eb-892f-467d-abfe-343588ad0b7e` |
| Funds | IGF VII, MREF III, MCOF I |
| Quarters | 2026Q2, 2025Q4 |
| Release gate | 0 violations / 6 fund rows scanned |
| `mixed_release_states` | **false** |
| `snapshot_version` (portfolio) | single — `meridian-20260425T015634Z-bd0a25c2` |
| warnings | `[]` (none) |
| excluded_fund_count | 0 |

---

## Fund verification — 2026Q2

| Fund | gross_irr | net_irr | ending_nav | scope | trust | scope_contract_version |
|---|---:|---:|---:|---|---|---|
| IGF VII | 53.40% | 50.99% | $1,239,546,917 | 20/20 complete | trusted | v1 |
| MREF III | 5.04% | 3.94% | $34,281,739 | 7/7 complete | trusted | v1 |
| MCOF I | 2.40% | −1.75% | $116,680,385 | 8/8 complete | trusted | v1 |

All metrics unchanged from prior per-fund releases. No delta.

---

## Portfolio KPIs (2026Q2, nav-weighted)

| Metric | Value |
|---|---|
| portfolio_nav | $1,390,509,041 |
| gross_irr (nav-weighted) | 47.93% |
| net_irr (nav-weighted) | 45.41% |
| fund_count | 3 |
| excluded_fund_count | 0 |
| mixed_release_states | **false** |

---

## UI layer shipped

| Component | What changed | File |
|---|---|---|
| `ScopeBadge` | New component — green `20/20 complete`, amber `5/7 partial`, gray `—` | `repo-b/src/components/re/ScopeBadge.tsx` |
| Fund page header | `ScopeBadge` added to lineage row next to `TrustChip` | `re/funds/[fundId]/page.tsx` |
| `AssetContributionTable` | Contribution (bps) = IRR × NAV% × 10000, live from rollup | `AssetContributionTable.tsx` |
| `AssetContributionTable` | Realized/Unrealized split from investment stage field | `AssetContributionTable.tsx` |
| `buildDecisionStrip` | `scopeFlags()` added — partial/over_scope surfaces as high-severity issue | `buildDecisionStrip.ts` |
| `buildDecisionStrip` | `scopeMeta` prop added to inputs | `buildDecisionStrip.ts` |
| Fund page | `scopeMeta` passed to `buildDecisionStrip` from `authoritativeMetrics.scope` | `re/funds/[fundId]/page.tsx` |

TypeScript: 0 errors post-change.

---

## Scope enforcement system — complete inventory

| Layer | Status |
|---|---|
| Runner: partial_scope invariant | ✅ |
| Runner: over_scope invariant | ✅ (C4) |
| Runner: `scope_contract_version: "v1"` | ✅ (C4) |
| Runner: `display_metrics.scope_badge` + `scope_label` | ✅ (C4) |
| Promotion gate: partial + over_scope block | ✅ |
| Promotion gate: IRR dispersion gate | ✅ (C4) |
| Portfolio aggregates: homogeneity enforcement | ✅ (C4) |
| UI: `ScopeBadge` in fund header | ✅ (C5) |
| UI: `TrustChip` in fund header | ✅ (existing) |
| UI: contribution bps in `AssetContributionTable` | ✅ (C5) |
| UI: realized/unrealized in `AssetContributionTable` | ✅ (C5) |
| UI: `DecisionStrip` scope issue flag | ✅ (C5) |
| Tests | 17/17 green (`test_scope_enforcement.py` + `test_scoped_promotion.py`) |
