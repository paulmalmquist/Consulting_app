# Phase 3 — IGF VII Fund-Level Receipts Trace

**Fund:** Institutional Growth Fund VII (`a1b2c3d4-0003-0030-0001-000000000001`)  
**Quarter:** 2026Q2  
**Snapshot version:** `meridian-20260410T182315Z-3881843b`  
**Snapshot released_at:** 2026-04-10 18:24:51 UTC  
**Snapshot verified_at:** 2026-04-10 18:23:25 UTC  
**Date of trace:** 2026-04-11  

---

## Fund Metadata

| Field | Value |
|---|---|
| Vintage year | 2021 |
| Inception date | 2021-03-01 |
| Strategy | equity |
| Fund type | closed_end |
| Target size | $850,000,000 |
| Status | investing |
| Terminal period used for IRR | 2026Q2 (June 30, 2026) |

---

## Contamination Index

Before the metric trace, all contamination vectors that affect this snapshot are listed. Each metric is tagged with the applicable vectors below.

| ID | Contamination vector | Effect | Status |
|---|---|---|---|
| C-1 | Cash event triplication — CALL events 2026-01-15 ($25M) and 2026-04-15 ($10M) each appeared 3× in `re_cash_event` | `total_called` inflated by +$70M; affects IRR, DPI, TVPI, RVPI denominators | **FIXED in DB** (migration 467) — snapshot NOT yet re-promoted |
| C-2 | Cash event triplication — DIST events 2026-03-31 ($1.5M) and 2026-06-30 ($2M) each appeared 3× | `total_distributed` inflated by +$7M; `distributions` (Q2) inflated by +$4M | **FIXED in DB** — snapshot NOT yet re-promoted |
| C-3 | Cash event triplication — FEE events 2026-01-15 ($93,750) and 2026-04-15 ($93,750) each appeared 3× | net metrics degraded by +$375K cumulative fees | **FIXED in DB** — snapshot NOT yet re-promoted |
| C-4 | Cash event triplication — EXPENSE events 2026-03-31 ($45K) and 2026-06-30 ($52K) each appeared 3× | net metrics degraded by +$194K | **FIXED in DB** — snapshot NOT yet re-promoted |
| C-5 | Snapshot builder scope: `SELECTED_INVESTMENT_IDS` covers only Tech Campus North (1 of 20 IGF VII investments) | `ending_nav`, `rvpi`, `tvpi`, `gross_irr` all reflect partial portfolio; IRR inputs are economically incomplete | **Not fixed** — requires scope expansion and re-promotion |
| C-6 | Defect B (waterfall fail-open): `_compute_waterfall_carry` falls back to `0.20 × (gross_return − 0.08 × total_called)` instead of returning `None` | `net_irr`, `net_tvpi`, `gross_net_spread` are policy-approximated, not real | **Not patched** (Patch B pending) |
| NF-3 | `beginning_nav = 0` in snapshot | Fixed by migration 466: now $66,789,619.672 | **FIXED in DB and snapshot** |

---

## Metric Trace Table

### 1. `portfolio_nav` (ending_nav)

| Field | Value |
|---|---|
| **Formula** | `sum(ending_nav_attributable)` over `re_authoritative_investment_state_qtr` for SELECTED_INVESTMENT_IDS at quarter='2026Q2' |
| **Investment in scope** | Tech Campus North (`2d54b971-21ac-41b8-a548-a506fe516c6c`) |
| **JV full NAV** | `re_jv_quarter_state.nav` = $55,343,200.72 |
| **Fund ownership %** | `effective_fund_ownership_percent` = 80.00% |
| **Intermediate** | $55,343,200.72 × 0.80 = $44,274,560.576 |
| **Final (snapshot)** | **$44,274,560.576** |
| **Source** | `re_authoritative_investment_state_qtr.canonical_metrics.ending_nav_attributable` |
| **Trust status** | **PARTIAL** — correct for Tech Campus North; excludes 19 of 20 IGF VII investments. Contamination: **C-5**. |

**Note:** `asset_count = 30` in the same snapshot reflects a fund-wide count query (all IGF VII assets), not just the 4 assets associated with the selected investment. This inconsistency means `asset_count` and `portfolio_nav` reflect different scopes.

---

### 2. `beginning_nav`

| Field | Value |
|---|---|
| **Formula** | `sum(beginning_nav_attributable)` over selected investments at 2026Q1, then fallback to prior released `ending_nav` if result = 0 (NF-3 fix) |
| **Investment-level beginning_nav_attributable (Tech Campus North 2026Q1)** | $0 (Tech Campus North had zero NAV in 2026Q1) |
| **Fallback triggered** | YES — investment aggregation = $0, fallback to IGF VII 2025Q4 released snapshot `ending_nav` |
| **Fallback source** | `re_authoritative_fund_state_qtr` WHERE fund_id = IGF VII AND quarter = '2025Q4' AND promotion_state = 'released' → `ending_nav = 66,789,619.672` |
| **Final (snapshot, post-migration-466)** | **$66,789,619.672** |
| **Source** | Migration 466 data repair; code fix in snapshot builder |
| **Trust status** | **CORRECT** — period-continuity anchor is accurate. Fixed. |

---

### 3. `total_committed`

| Field | Value |
|---|---|
| **Formula** | `repe_fund.target_size` or LP commitment records (seed-defined) |
| **Final (snapshot)** | **$1,000,000,000** |
| **Trust status** | **UNVERIFIED** — $1B committed against $850M target; LP commitment records not reconciled in this audit. Not contaminated by C-1 through C-6. |

---

### 4. `total_called` (paid_in_capital)

| Field | Value |
|---|---|
| **Formula** | `SUM(amount) WHERE event_type = 'CALL' AND event_date ≤ '2026-06-30'` in `re_cash_event` |
| **Events summed (pre-dedup, as built)** | 9 unique CALL events + 2 triplicated CALL events (2026-01-15 and 2026-04-15) |
| **Contaminated sum** | $695,000,000 (correct) + $70,000,000 (triplication excess) = $765,000,000 |
| **Final (snapshot)** | **$765,000,000** |
| **Correct value (post-dedup)** | $695,000,000 |
| **Excess** | +$70,000,000 |
| **Source** | `re_cash_event` (at snapshot build time, pre-migration-467) |
| **Trust status** | **CONTAMINATED** — overstated by $70M. Contamination: **C-1**. All ratio metrics using `total_called` as denominator (DPI, RVPI, TVPI, IRR) are wrong. |

**Post-dedup CALL timeline (correct):**

| Date | Amount |
|---|---|
| 2024-03-01 | $148,750,000 |
| 2024-06-01 | $127,500,000 |
| 2024-09-01 | $85,000,000 |
| 2025-01-15 | $63,750,000 |
| 2025-04-15 | $100,000,000 |
| 2025-07-15 | $75,000,000 |
| 2025-10-15 | $60,000,000 |
| 2026-01-15 | $25,000,000 |
| 2026-04-15 | $10,000,000 |
| **Total through 2026Q2** | **$695,000,000** |

---

### 5. `contributions` (current quarter Q2 2026)

| Field | Value |
|---|---|
| **Formula** | `SUM(amount) WHERE event_type = 'CALL' AND event_date BETWEEN '2026-04-01' AND '2026-06-30'` |
| **Events in period (pre-dedup)** | 2026-04-15 CALL $10M × 3 copies = $30M |
| **Final (snapshot)** | **$30,000,000** |
| **Correct value** | $10,000,000 |
| **Trust status** | **CONTAMINATED** — overstated 3×. Contamination: **C-1**. |

---

### 6. `total_distributed`

| Field | Value |
|---|---|
| **Formula** | `SUM(amount) WHERE event_type = 'DIST' AND event_date ≤ '2026-06-30'` |
| **Pre-dedup sum** | $135,507,756.09 (correct) + $7,000,000 (triplication excess) = $142,507,756.09 |
| **Final (snapshot)** | **$142,507,756.09** |
| **Correct value (post-dedup)** | $135,507,756.09 |
| **Excess** | +$7,000,000 |
| **Trust status** | **CONTAMINATED** — overstated by $7M. Contamination: **C-2**. |

---

### 7. `distributions` (current quarter Q2 2026)

| Field | Value |
|---|---|
| **Formula** | `SUM(amount) WHERE event_type = 'DIST' AND event_date BETWEEN '2026-04-01' AND '2026-06-30'` |
| **Events (pre-dedup)** | 2026-06-28 $19,850,756.09 + 2026-06-30 $2M × 3 copies = $25,850,756.09 |
| **Final (snapshot)** | **$25,850,756.09** |
| **Correct value** | $19,850,756.09 + $2,000,000 = $21,850,756.09 |
| **Trust status** | **CONTAMINATED** — overstated by $4M. Contamination: **C-2**. |

---

### 8. `management_fees` (current quarter Q2 2026)

| Field | Value |
|---|---|
| **Formula** | `SUM(amount) WHERE event_type = 'FEE' AND event_date BETWEEN '2026-04-01' AND '2026-06-30'` (regular quarterly fee) |
| **Events in period** | 2026-04-30: $1,875,000 (created 2026-03-15, not triplicated) + 2026-04-15: $93,750 × 3 (triplicated) |
| **Note** | The 2026-04-15 FEE was triplicated but the snapshot shows $1,875,000. Either the builder uses a distinct/dedup mechanism for this field, or the 2026-04-15 FEE is not in the Q2 calculation. Q2 window April 1–June 30 includes both events. |
| **Final (snapshot)** | **$1,875,000** |
| **Trust status** | **LIKELY CORRECT** — the $1,875,000 regular quarterly fee is the dominant fee event. The triplicated $93,750 ad-hoc fee on 2026-04-15 appears NOT to be included (possibly the builder uses a different fee category for management fees vs. ad-hoc fees, or the 2026-04-15 events are captured under a different field). No material contamination in the stated value. |

---

### 9. `fund_expenses` (current quarter Q2 2026)

| Field | Value |
|---|---|
| **Formula** | `SUM(amount) WHERE event_type = 'EXPENSE' AND event_date BETWEEN '2026-04-01' AND '2026-06-30'` |
| **Events in period (pre-dedup)** | 2026-06-30: $52,000 × 3 copies = $156,000 (triplicated) |
| **Final (snapshot)** | **$52,000** |
| **Expected if summed** | $156,000 |
| **Trust status** | **ANOMALY** — snapshot shows $52,000, not the triplication-inflated $156,000. The snapshot was built before migration 467. Either the snapshot builder's expense aggregation has an accidental dedup (e.g. `DISTINCT` on `amount` rather than SUM), or the investment-level pipeline captured expenses from the JV quarter state rather than from `re_cash_event` directly. The stated $52,000 is the CORRECT value — but the mechanism by which the builder arrived at the correct value despite the triplication is unexplained and requires code review. |

---

### 10. `gross_operating_cash_flow`

| Field | Value |
|---|---|
| **Formula** | `fund_attributable_operating_cash_flow` from Tech Campus North investment snapshot |
| **Investment intermediate** | `gross_operating_cash_flow_full` = -$159,806.68 (JV-level OCF) |
| **Fund share** | -$159,806.68 × 80% = -$127,845.344 |
| **Final (snapshot)** | **-$127,845.344** |
| **Source** | `re_authoritative_investment_state_qtr.canonical_metrics.fund_attributable_operating_cash_flow` |
| **Trust status** | **PARTIAL** — correct for Tech Campus North only. Excludes 19 other investments. Contamination: **C-5**. |

---

### 11. `net_operating_cash_flow`

| Field | Value |
|---|---|
| **Formula** | `gross_operating_cash_flow − management_fees − fund_expenses` |
| **Intermediate** | -$127,845.344 − $1,875,000 − $52,000 = -$2,054,845.344 |
| **Final (snapshot)** | **-$2,054,845.344** |
| **Trust status** | **PARTIAL** — correct formula, but `gross_operating_cash_flow` is partial-portfolio only. Contamination: **C-5**. |

---

### 12. `dpi`

| Field | Value |
|---|---|
| **Formula** | `total_distributed / total_called` |
| **Intermediate** | $142,507,756.09 / $765,000,000 = 0.186284648484 |
| **Final (snapshot)** | **0.186284648484** |
| **Correct formula** | $135,507,756.09 / $695,000,000 = 0.194974 |
| **Stated vs. correct** | 0.1863 vs. 0.1950 — delta = 0.0087 (understated by ~87 bps) |
| **Trust status** | **CONTAMINATED** — both numerator (+$7M) and denominator (+$70M) are inflated. Net effect understates DPI because the denominator inflation ($70M excess / $695M base = +10.1%) exceeds the numerator inflation ($7M excess / $135.5M base = +5.2%). Contamination: **C-1, C-2**. |

---

### 13. `rvpi`

| Field | Value |
|---|---|
| **Formula** | `ending_nav / total_called` |
| **Intermediate** | $44,274,560.576 / $765,000,000 = 0.057875242583 |
| **Final (snapshot)** | **0.057875242583** |
| **Correct (partial-portfolio)** | $44,274,560.576 / $695,000,000 = 0.063704 |
| **Trust status** | **CONTAMINATED** — denominator inflated by $70M. Additionally, `ending_nav` represents 1/20 investments (C-5). RVPI is materially understated on both counts. Contamination: **C-1, C-5**. |

---

### 14. `tvpi` (gross TVPI)

| Field | Value |
|---|---|
| **Formula** | `dpi + rvpi` |
| **Intermediate** | 0.186284648484 + 0.057875242583 = 0.244159891067 |
| **Final (snapshot)** | **0.244159891067** |
| **Trust status** | **CONTAMINATED** — inherits both DPI and RVPI contaminations. Contamination: **C-1, C-2, C-5**. |

---

### 15. `gross_irr`

| Field | Value |
|---|---|
| **Formula** | `_compute_fund_xirr(cash_flows, terminal_nav, terminal_date)` where cash_flows = `re_cash_event` CALL (negative) + DIST (positive) through terminal_date, terminal_nav = `ending_nav` |
| **Inception date** | 2021-03-01 |
| **Terminal date** | 2026-06-30 |
| **Total CALL outflows (pre-dedup, as used)** | -$765,000,000 |
| **Total DIST inflows** | +$142,507,756.09 (pre-dedup) |
| **Terminal NAV (inflow)** | +$44,274,560.576 |
| **Net present value at stated rate** | Negative (total inflows = $186.8M vs. outflows = $765M) |
| **Final (snapshot)** | **-84.09%** |
| **Contamination sources** | (a) `total_called` inflated by $70M → IRR timeline shows $765M deployed instead of $695M; (b) `total_distributed` inflated by $7M → extra distributions shifted IRR higher but not enough to overcome call inflation; (c) `ending_nav` = $44.3M represents 1/20 investments — full portfolio NAV should be ~$1,446M |
| **Trust status** | **SEVERELY CONTAMINATED — UNUSABLE**. Contamination: **C-1, C-2, C-5**. The -84% gross IRR is economically meaningless. A fund that has called $695M (correct amount) against a full-portfolio NAV of ~$1,446M + cumulative distributions would have a materially positive IRR, not -84%. |

---

### 16. `net_irr`

| Field | Value |
|---|---|
| **Formula (Defect B active)** | `_compute_net_xirr(cash_flows_net, terminal_nav_net)` where cash_flows_net adjusts for management fees and expenses; HOWEVER if `run_waterfall` raises → fallback: `carry_shadow = max(0, 0.20 × (gross_return − 0.08 × total_called))` |
| **Waterfall status** | No released waterfall definition for IGF VII → `run_waterfall` raises → Defect B fallback fires |
| **gross_return (pre-dedup)** | total_distributed + ending_nav − total_called = $142.5M + $44.3M − $765M = **-$578.2M** |
| **carry_shadow (Defect B)** | `max(0, 0.20 × (−$578.2M − 0.08 × $765M))` = `max(0, 0.20 × −$639.4M)` = `max(0, −$127.9M)` = **$0** |
| **Note** | Fund is deeply underwater (gross_return < 0), so policy carry = $0. Defect B fallback returns $0 carry, which means net metrics are degraded only by fees/expenses, not by a phantom carry charge. The fallback does not add artificial carry here — it just returns $0. |
| **Net cash flow adjustment** | Gross IRR cash flows minus cumulative fees ($23,062,500 pre-dedup) and expenses ($546,000 pre-dedup) |
| **Final (snapshot)** | **-85.47%** |
| **Gross-net spread** | gross_irr − net_irr = -84.09% − (-85.47%) = **+1.38%** (fees and expenses widen the loss) |
| **Trust status** | **SEVERELY CONTAMINATED — UNUSABLE**. Inherits all gross_irr contaminations. Defect B is active but happens to produce $0 carry in this case (fund too far underwater for policy carry to apply). The net_irr is wrong for the same reasons as gross_irr. Contamination: **C-1, C-2, C-5, C-6**. |

---

### 17. `net_tvpi`

| Field | Value |
|---|---|
| **Formula** | `(net_distributed + ending_nav) / total_called` where `net_distributed = total_distributed − cumulative_fees − cumulative_expenses` |
| **Cumulative fees (pre-dedup, through 2026Q2)** | ~$23,062,500 |
| **Cumulative expenses (pre-dedup, through 2026Q2)** | ~$546,000 |
| **Net distributed** | $142,507,756.09 − $23,062,500 − $546,000 = $118,899,256.09 |
| **Intermediate** | ($118,899,256.09 + $44,274,560.576) / $765,000,000 = $163,173,816.67 / $765,000,000 = 0.213299 |
| **Final (snapshot)** | **0.213299106753** |
| **Trust status** | **CONTAMINATED**. Correct formula chain (Defect B produces $0 carry, so net_tvpi = (net_dist + nav) / paid_in). All three inputs contaminated: `total_called` inflated (C-1), fees/expenses inflated (C-3, C-4), `ending_nav` partial (C-5). |

---

### 18. `gross_net_spread`

| Field | Value |
|---|---|
| **Formula** | `gross_irr − net_irr` |
| **Intermediate** | -84.09% − (-85.47%) = 0.01373 |
| **Final (snapshot)** | **0.01373 (1.37%)** |
| **Trust status** | **DERIVED / CONTAMINATED** — arithmetically consistent with stated gross and net IRR values, but both are wrong. The 1.37% spread approximately reflects the fee and expense drag on the IRR. |

---

## Unexplained Metric Anomalies

| Anomaly | Description |
|---|---|
| `fund_expenses` = $52,000 despite triplication | Snapshot built before migration 467 dedup. With 3 copies of the 2026-06-30 $52K EXPENSE event, the sum should be $156K. The snapshot shows $52K. The builder's expense aggregation mechanism must use a non-additive path (DISTINCT, MAX, or reads from investment pipeline that bypasses `re_cash_event` for expenses). **Requires code review of the snapshot builder's expense calculation path.** |
| `asset_count` = 30 despite 1 selected investment | Tech Campus North JV owns approximately 2 assets; counting 30 implies the fund-level `asset_count` uses a different query (all IGF VII assets, not SELECTED_INVESTMENT_IDS). Scope inconsistency: `ending_nav` = $44.3M (1 investment) but `asset_count` = 30 (full fund). |
| `management_fees` = $1,875,000 not $2,156,250 | With 2026-04-15 FEE $93,750 triplicated (3 copies = $281,250), total Q2 fees should be $1,875,000 + $281,250 = $2,156,250. Snapshot shows only $1,875,000. Similar to fund_expenses anomaly — builder may categorize the ad-hoc $93,750 events differently from the regular quarterly management fee. |

---

## Per-Metric Trust Summary

| Metric | Snapshot Value | Trust | Contaminations |
|---|---|---|---|
| `beginning_nav` | $66,789,619.672 | ✓ CORRECT (fixed) | NF-3 fixed by mig-466 |
| `ending_nav` (portfolio_nav) | $44,274,560.576 | ⚠ PARTIAL | C-5 (1 of 20 investments) |
| `total_committed` | $1,000,000,000 | ? UNVERIFIED | — |
| `total_called` | $765,000,000 | ✗ CONTAMINATED (+$70M) | C-1 |
| `contributions` (Q2) | $30,000,000 | ✗ CONTAMINATED (should be $10M) | C-1 |
| `total_distributed` | $142,507,756.09 | ✗ CONTAMINATED (+$7M) | C-2 |
| `distributions` (Q2) | $25,850,756.09 | ✗ CONTAMINATED (+$4M) | C-2 |
| `management_fees` (Q2) | $1,875,000 | ✓ LIKELY CORRECT | Anomaly, see above |
| `fund_expenses` (Q2) | $52,000 | ✓ CORRECT VALUE (anomalous path) | Anomaly, see above |
| `gross_operating_cash_flow` | -$127,845.344 | ⚠ PARTIAL (1 of 20 investments) | C-5 |
| `net_operating_cash_flow` | -$2,054,845.344 | ⚠ PARTIAL | C-5 |
| `dpi` | 0.1863 | ✗ CONTAMINATED | C-1, C-2 |
| `rvpi` | 0.0579 | ✗ CONTAMINATED | C-1, C-5 |
| `tvpi` (gross) | 0.2442 | ✗ CONTAMINATED | C-1, C-2, C-5 |
| `gross_irr` | -84.09% | ✗ SEVERELY CONTAMINATED — UNUSABLE | C-1, C-2, C-5 |
| `net_irr` | -85.47% | ✗ SEVERELY CONTAMINATED — UNUSABLE | C-1, C-2, C-3, C-4, C-5, C-6 |
| `net_tvpi` | 0.2133 | ✗ CONTAMINATED | C-1, C-2, C-3, C-4, C-5 |
| `gross_net_spread` | 1.37% | ✗ DERIVED FROM CONTAMINATED IRRs | C-1, C-2, C-5, C-6 |
| `asset_count` | 30 | ⚠ SCOPE MISMATCH (full fund, not selected investments) | C-5 |

---

## Required Repairs Before IGF VII is Reportable

1. **Re-promote snapshot after migration 467 dedup** — `total_called`, `total_distributed`, `dpi`, `rvpi`, `tvpi`, and IRR metrics will all shift to correct values.
2. **Expand snapshot builder scope** — add all 20 IGF VII investments to `SELECTED_INVESTMENT_IDS`. Until then, `ending_nav`, `rvpi`, `tvpi`, `gross_irr` are economically meaningless.
3. **Apply Patch B (fail-closed waterfall)** — `net_irr`, `net_tvpi`, and `gross_net_spread` should return `null + null_reason: "out_of_scope_requires_waterfall"` rather than a policy-approximated value. Defect B is active but happens to return $0 carry for IGF VII (fund is too far underwater). Post-scope-expansion, the fund's gross_return may be positive, and the policy-carry fallback could begin injecting a real non-zero contamination.
4. **Investigate `fund_expenses` and `management_fees` anomalies** — confirm whether the snapshot builder's fee/expense aggregation has an accidental dedup or reads from a different source. Document the confirmed path before Phase 7 lint coverage is written.

---

**Phase 3 verdict:** IGF VII 2026Q2 snapshot has 2 CORRECT metrics, 2 PARTIAL metrics, 12 CONTAMINATED metrics, and 2 UNEXPLAINED ANOMALIES. **NOT SAFE FOR INVESTOR REPORTING.**
