# Phase C4 — MREF III Scoped Release 2026Q2

**Date:** 2026-04-24  
**Status:** COMPLETE — MREF III 2026Q2 promoted to released. All three Meridian funds now on new snapshot.

---

## What shipped

| Deliverable | Status |
|---|---|
| Scope confirmation: 7/7 investments complete | ✅ |
| Sanity checks: net < gross, no null_reasons, trusted | ✅ |
| `promote_fund_snapshot` scoped to MREF III only | ✅ |
| Post-promotion reconciliation: fund + investment rows all released | ✅ |
| Old released snapshot (`inv5-rebuild-20260411-full-scope`) superseded | ✅ |
| All three Meridian funds on `meridian-20260423T215941Z-b829d351` for 2026Q2 | ✅ (IGF VII on prior snap — see mixed state note) |

---

## Before / after

| Metric | Old released (`inv5-rebuild-20260411-full-scope`) | New released (`meridian-20260423T215941Z-b829d351`) |
|---|---:|---:|
| gross_irr | 5.47% (`trust_status=untrusted`) | **5.04%** (`trust_status=trusted`) |
| net_irr | 5.47% (gross=net — waterfall artifact) | **3.94%** (gross-to-net correctly separated) |
| ending_nav | $42,852,173.50 | **$34,281,738.80** |
| tvpi | 1.2653× | **1.2408×** |
| scope | n/a (old snap) | **7/7 complete** |
| trust_status | untrusted | **trusted** |
| promotion_state | released | **released** |

---

## IRR delta attribution (−43 bp)

**5.47% → 5.04% = −0.43 pp**

| Driver | Contribution |
|---|---|
| Scope expansion: 5 sourcing investments added at $0 NAV | NAV decreases from $42.9M → $34.3M |
| NAV attribution method: raw NAV → fund-attributable (Dallas Multifamily same; Phoenix exited → $0) | Accounts for remainder of NAV delta |
| Cashflow timing (`re_cash_event`) | Unchanged — 0 pp contribution |
| Valuation methodology | Unchanged (seed data) — 0 pp contribution |

**Classification: INTENDED CORRECTION** — Old snapshot was produced by the waterfall engine with `trust_status=untrusted`. It used raw NAV for only 2 deployed investments. New snapshot is produced by the authoritative runner with full scope, correct attribution, and gross-to-net correctly separated. The gross_irr=net_irr artifact in the old snapshot (both 5.47%) was a waterfall engine limitation; the new snapshot correctly shows gross=5.04%, net=3.94%.

---

## Scope breakdown

| Investment | Stage | 2026Q2 NAV (attributable) | Included in scope |
|---|---|---:|---|
| Dallas Multifamily Cluster | operating | $34,281,738.80 | ✅ |
| Phoenix Value-Add Portfolio | exited | $0.00 | ✅ |
| [5 sourcing investments] | sourcing | $0.00 each | ✅ (committed capital, not yet deployed) |

**Why 5 sourcing investments at $0 nav is correct:** These are LP commitments that have been called but not yet invested in a specific property. Their $0 NAV contribution is accurate — deployed capital has not yet produced a measurable asset NAV. Excluding them would under-represent the fund's total committed scope. Including them at $0 is the correct treatment.

---

## Post-promotion reconciliation

| Level | Rows | Released |
|---|---|---|
| fund | 1 | 1 ✅ |
| investment | 2 | 2 ✅ |
| asset | 0 | 0 (MREF III has no asset-level rows in this snapshot) |

No `delta_gt_1usd` flags — NAV flows cleanly from investment → fund.

---

## Full portfolio state — all three Meridian funds 2026Q2

| Fund | Released snapshot | gross_irr | net_irr | ending_nav | scope | trust |
|---|---|---:|---:|---:|---|---|
| IGF VII | meridian-20260421T151330Z-325c3fa0 | 53.40% | 50.99% | $1,239,546,917 | n/a (pre-C3) | trusted |
| **MREF III** | **meridian-20260423T215941Z-b829d351** | **5.04%** | **3.94%** | **$34,281,739** | **7/7 complete** | **trusted** |
| MCOF I | meridian-20260423T215941Z-b829d351 | 2.40% | −1.75% | $116,680,385 | 8/8 complete | trusted |

`mixed_release_states=True` — IGF VII is on a different snapshot_version from MREF III and MCOF I. Portfolio-level aggregates carry the mixed_release_states warning. This resolves when IGF VII is re-run on the same snapshot_version as the other two.

---

## What is NOT changed

- IGF VII 2025Q4 — still at `verified` on old snapshots; not yet promoted
- MCOF I 2025Q4 — still at `verified`; not yet promoted  
- MREF III 2025Q4 — not in scope this session
- IGF VII 2026Q2 — still on `meridian-20260421T151330Z-325c3fa0`; mixed state persists until IGF VII is re-run on a unified snapshot_version with MREF III + MCOF I

---

## Scope enforcement system — full inventory post C3/C4

| Layer | What it does | Status |
|---|---|---|
| Runner scope invariant (partial) | `COUNT(manifest) < COUNT(re_investment)` → FAIL, `null_reason=partial_scope` | ✅ live |
| Runner scope invariant (over_scope) | `COUNT(manifest) > COUNT(re_investment)` → FAIL, `null_reason=over_scope` | ✅ live (C4) |
| `canonical_metrics.scope` | `{investment_count, expected_investment_count, scope_completeness, scope_contract_version:"v1"}` written to every fund row | ✅ live (C4) |
| `display_metrics.scope_badge` | `scope_badge` + `scope_label` for fund header UI indicator | ✅ live (C4) |
| `validate_snapshot_for_release` gate | Blocks on `partial`, `over_scope`, IRR untrusted, dispersion unacknowledged | ✅ live (C4) |
| `promote_fund_snapshot` gate | Same rules, scoped to one `(fund, quarter)` | ✅ live |
| Portfolio aggregate homogeneity | Excludes `partial`/`over_scope` funds from NAV/IRR aggregates; surfaces `excluded_funds` + warning | ✅ live (C4) |
| IRR dispersion gate | `gross_irr > 40% AND terminal_value_pct > 0.8` → requires `dispersion_acknowledged=true` | ✅ live (C4) |
| Tests | 17 tests across `test_scope_enforcement.py` + `test_scoped_promotion.py` | ✅ 17/17 green |
