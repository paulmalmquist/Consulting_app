# Phase 0 — Meridian Baseline (Live Production State)

**Run date:** 2026-04-11
**Target env:** `a1b2c3d4-0001-0001-0003-000000000001` (Meridian Capital Management)
**Target business:** `a1b2c3d4-0001-0001-0001-000000000001`
**DB:** Supabase project `ozboonlsplroialdwuxj` (Novendor)
**Latest released quarter:** 2026Q2 (snapshot `meridian-20260410T182315Z-3881843b`, released 2026-04-10 18:24:51 UTC)

---

## Headline findings — before Patches A/B/C land

1. **Duplicate logical funds confirmed in production.** Two Meridian funds exist under two different `fund_id`s each. One set of dupes is a strict logical duplicate (same name/vintage/strategy). The other set has drifted vintage metadata (2019 vs 2026) for the same logical fund. See Phase 1 table below.
2. **Catastrophic source-of-truth drift.** Legacy `re_fund_quarter_state.portfolio_nav` is **32× to 15× larger** than the authoritative snapshot `ending_nav` for the same fund at the same quarter. The fund detail page reads authoritative; other backend paths still read legacy. This is Defect C confirmed in live data.
3. **Economically impossible IRRs in the authoritative snapshot.** All three Meridian funds show authoritative `gross_irr` between **-84% and -99%**. These violate the INV sanity rule for funds with positive NOI / stable leverage and must be explained or quarantined.
4. **Fake carry baked into `net_tvpi`.** Back-calculated from canonical_metrics: IGF VII 2026Q2 has a ~$21.9M carry deduction that is not from a released waterfall definition — it is the policy-based fallback from `_compute_waterfall_carry` (Defect B) leaking into the snapshot builder.
5. **`re_fund_metrics_qtr` is stale and nearly empty.** Only IGF VII has a row and it is from `2026Q1` showing `gross_irr = 12.45%` while authoritative says `gross_irr = -84%`. Four of five fund rows have no entry at all.
6. **Snapshot `canonical_metrics` uses `tvpi` not `gross_tvpi`.** The key layout: `dpi`, `rvpi`, `tvpi` (= gross TVPI), `net_tvpi`. No key named `gross_tvpi`. Any code reading `canonical_metrics->>'gross_tvpi'` will silently return null — a hidden source-mismatch.
7. **Promotion-state churn.** IGF VII 2026Q2 has **5 distinct `snapshot_version` rows** (4 verified, 1 released). Only the released one should drive UI — but the presence of multiple verified rows suggests the promotion pipeline has run several times with only one release.

---

## Phase 1 preview — duplicate fund rows

Query: `SELECT lower(name), count(*), array_agg(DISTINCT vintage_year), array_agg(fund_id) FROM repe_fund WHERE business_id=:m GROUP BY 1 HAVING count(*)>1`

| Logical fund | # rows | vintages | strategies | fund_ids |
|---|---|---|---|---|
| meridian credit opportunities fund i | 2 | [2024] | [debt] | `d4560000-0003-0030-0005-000000000001`, `a1b2c3d4-0002-0020-0001-000000000001` |
| meridian real estate fund iii | 2 | [2019, 2026] | [equity] | `d4560000-0003-0030-0004-000000000001`, `a1b2c3d4-0001-0010-0001-000000000001` |

Entity topology for the five fund rows:

| Fund row | Vintage | Deals | Assets | Calls | Dists | Called $ | Dist $ |
|---|---|---|---|---|---|---|---|
| IGF VII `a1b2c3d4-0003-0030-0001` | 2021 | 20 | 30 | 15 | 17 | $810,000,000 | $182,675,986 |
| MCOF I `a1b2c3d4-0002-0020-0001` | 2024 | 8 | 8 | 8 | 8 | $570,000,000 | $36,458,155 |
| MCOF I `d4560000-0003-0030-0005` | 2024 | 8 | 8 | **0** | **0** | — | — |
| MREF III `d4560000-0003-0030-0004` | 2019 | 11 | 11 | **0** | **0** | — | — |
| MREF III `a1b2c3d4-0001-0010-0001` | 2026 | 2 | 4 | 8 | 8 | $855,000,000 | $27,592,733 |

**Critical:** Both `d4560000-...` fund rows are **orphaned entity graphs** — they have `repe_deal` + `repe_asset` children but zero cash events. They are phantom duplicates that will still contaminate any query joining `repe_fund → repe_deal → repe_asset` for the env's fund list. This is where portfolio-level duplicate counting comes from.

---

## Source-of-truth drift matrix — Institutional Growth Fund VII (2026Q2)

| Source | Reads from | portfolio_nav | gross_irr | net_irr | dpi | tvpi | net_tvpi |
|---|---|---|---|---|---|---|---|
| **Authoritative** (INV-1 canonical) | `re_authoritative_fund_state_qtr.canonical_metrics` (released, snapshot `meridian-20260410T182315Z`) | **$44,274,560.58** | -0.8409 | -0.8547 | 0.1863 | **0.2442** | 0.2133 |
| **Legacy fund_quarter_state** (what `compute_return_metrics` reads — Defect C) | `re_fund_quarter_state.portfolio_nav` | **$1,446,373,530.90** | — | — | — | — | — |
| **re_fund_metrics_qtr** (stale) | row from 2026-03-03 at quarter=2026Q1 | — | **0.1245** | 0.0987 | 0.0800 | 1.0800 | 1.0200 |
| Drift factor (auth → legacy) | | **32.67×** | | | | | |

Interpretation:
- The fund page (uses `useAuthoritativeState`) will show $44.3M NAV.
- Any backend path still calling `compute_return_metrics` or reading `re_fund_quarter_state` will show $1.45B — a 32× overstatement. This is the "two tiles disagree on the same page" pattern predicted in Defect C.
- The `re_fund_metrics_qtr` stale row has positive IRR **12.45%** while the authoritative says **-84%** — the stale row is flagrantly wrong and is actively misleading any consumer that falls back to it. INV-1's "no stale cache fallback" rule is the fix.

### Full canonical_metrics for IGF VII 2026Q2 (released)

```json
{
  "dpi": 0.186284648484,
  "rvpi": 0.057875242583,
  "tvpi": 0.244159891067,
  "net_irr": -0.8546514455866725,
  "net_tvpi": 0.213299106753,
  "gross_irr": -0.8409216695839921,
  "ending_nav": 44274560.576,
  "asset_count": 30,
  "total_called": 765000000.0,
  "beginning_nav": 0.0,
  "contributions": 30000000.0,
  "distributions": 25850756.09,
  "fund_expenses": 52000.0,
  "management_fees": 1875000.0,
  "total_committed": 1000000000.0,
  "gross_net_spread": 0.0137297760026804,
  "total_distributed": 142507756.09,
  "net_operating_cash_flow": -2054845.344,
  "gross_operating_cash_flow": -127845.344
}
```

### Back-calculation: fake carry smoking gun

Fail-closed rule says `net_tvpi = None` whenever there's no released waterfall. But here:

```
tvpi                 = (total_distributed + ending_nav) / total_called
                     = (142,507,756 + 44,274,561) / 765,000,000
                     = 0.244  ✓ matches canonical_metrics.tvpi

net_tvpi (reported)  = 0.213299
carry_implied        = (tvpi - net_tvpi) * total_called - management_fees - fund_expenses
                     = (0.244160 - 0.213299) * 765,000,000 - 1,875,000 - 52,000
                     = 23,607,090 - 1,927,000
                     = 21,680,090 ≈ $21.7M
```

There is **no released waterfall** for IGF VII. This ~$21.7M carry is the `_compute_waterfall_carry` fallback (20% × (gross_return - 8% × total_called)) leaking through into the authoritative snapshot **and** contaminating `net_irr` via `_compute_net_xirr`'s terminal reduction.

**Root cause:** the snapshot-builder calls `compute_return_metrics` which calls `_compute_waterfall_carry`. Defect B is in the build pipeline, not just the display pipeline.

### cash-event sum vs canonical `total_called`

```
canonical_metrics.total_called         = 765,000,000
SUM(re_cash_event WHERE event_type='CALL') all-time = 810,000,000
delta                                   = 45,000,000
```

The delta is the portion of capital called between 2026-07-01 and 2026-12-28 (out-of-period for 2026Q2). The snapshot builder is correctly filtering `event_date <= period_end`. This is INV-2 period integrity passing — good.

### Inconsistencies inside canonical_metrics

- `contributions: 30,000,000` vs `total_called: 765,000,000` — these are not the same thing. If `contributions` is meant to be "contributions this period", that would be plausible. If it is meant to be "cumulative contributions", it is off by 25×. The field name is ambiguous and needs documentation or renaming.
- `distributions: 25,850,756` vs `total_distributed: 142,507,756` — same ambiguity. `distributions` reads as period-level, `total_distributed` as cumulative.
- `beginning_nav: 0.0` — this should be the 2026Q1 ending NAV. Either the fund genuinely had zero NAV at start of 2026Q2 (implausible given 15 prior calls and 17 prior distributions), or the snapshot builder is not carrying NAV forward correctly.
- `total_committed: 1,000,000,000` vs actual calls `810,000,000` — consistent with a partially called fund at 81% called.

---

## Source-of-truth drift matrix — Meridian Credit Opportunities Fund I (2026Q2)

Split across the two duplicate fund_ids. Only the `a1b2c3d4-0002-0020-0001` row has authoritative coverage and cash events.

| Source | fund_id | Reads from | NAV | gross_irr | dpi |
|---|---|---|---|---|---|
| Authoritative | `a1b2c3d4-0002-0020-0001` | canonical_metrics | **$28,600,000** | -0.9744 | 0.0522 |
| Legacy | `a1b2c3d4-0002-0020-0001` | `re_fund_quarter_state` (2026Q2) | $116,680,385 | — | — |
| Legacy | `d4560000-0003-0030-0005` | `re_fund_quarter_state` (2026Q2) | **$425,298,000** | — | — |
| Combined legacy (if a portfolio query sums both dupes) | | | **$541,978,385** | | |

The combined-legacy row is the **"duplicate fund double-counted" smoking gun**: any portfolio-level aggregate that groups by `business_id` without de-duping will report $541M for a logical fund the authoritative layer says is $28.6M — an **18.9× overstatement.**

Authoritative gross IRR = -97.4% is economically impossible for a debt fund with 0.052 DPI, positive expected coupon, and 2024 vintage. Either the cash events are incomplete (despite the completeness gate in INV-3 passing on this fund — 8 calls and 8 dists), or the IRR solver is failing on degenerate inputs.

---

## Source-of-truth drift matrix — Meridian Real Estate Fund III (2026Q2)

Two dupe fund rows with **different vintages** (2019 and 2026) — metadata corruption on top of duplication. The 2026-vintage row is the only one with authoritative coverage.

| Source | fund_id | Vintage | NAV | gross_irr |
|---|---|---|---|---|
| Authoritative | `a1b2c3d4-0001-0010-0001` | 2026 | **$34,281,738.80** | -0.9878 |
| Legacy | `a1b2c3d4-0001-0010-0001` | 2026 | $42,852,173.50 | — |
| Legacy | `d4560000-0003-0030-0004` | 2019 | **$635,733,200.44** | — |
| Combined legacy (if dupe-summed) | | | **$678,585,374** | |

18.5× drift between combined legacy and authoritative. Note the 2019-vintage dupe has **11 deals, 11 assets, 0 cash events** — a full entity graph orphan.

Auth gross IRR = -98.8% is impossible. The fund shows $855M called, $27M distributed, $34M NAV. That's a 93% capital loss over 2 years — inconsistent with any described real-estate portfolio operating profile. Either:
- `total_called` in the snapshot is double-counted from multiple LLCO commitment sources, OR
- The asset NAV rollup into the fund is applying the asymmetric ownership bug (Defect A) and producing a deflated NAV, OR
- Both.

---

## Snapshot promotion churn

For **IGF VII 2026Q2** alone, the authoritative table has 5 rows with 5 distinct `snapshot_version`s:

| snapshot_version | promotion_state | trust_status | released_at |
|---|---|---|---|
| `meridian-20260410T182315Z-3881843b` | **released** | trusted | 2026-04-10 18:24:51 |
| `meridian-20260410T023005Z-a27811ff` | verified | trusted | — |
| `meridian-20260410T023425Z-ab1e6999` | verified | untrusted | — |
| `meridian-20260410T023249Z-e9469aea` | verified | untrusted | — |
| `meridian-20260410T182035Z-4924b792` | verified | trusted | — |

All 5 rows contain **identical** metric values. Migration 459's immutability trigger is working — no released row is being overwritten. But:
- INV-1 single-source requires readers to pick the released row, not arbitrary verified rows.
- Two of the five are `trust_status=untrusted` — they should not be selectable by any reader.
- The presence of four unreleased snapshots for the same `(fund_id, quarter)` suggests the promotion pipeline reruns frequently without garbage collection.

Recommendation for Patch C: the authoritative fetch must filter `promotion_state = 'released' AND trust_status = 'trusted'` and pick the row with the highest `released_at`. Any other selection is a drift vector.

---

## Residual-issue classification preview (for Phase 8)

| Symptom | Preliminary classification | Defect ref |
|---|---|---|
| Two fund_ids for MCOF I | DUPLICATE_ENTITY + SEEDING | Phase 1 new |
| Two fund_ids for MREF III with vintage drift | DUPLICATE_ENTITY + DATA + SEEDING | Phase 1 new |
| 32× legacy-vs-authoritative NAV drift | UI_SOURCE_MISMATCH + LOGIC | Defect C |
| Fake $21.7M carry in net_tvpi | WATERFALL_DEFECT + LOGIC | Defect B |
| Stale `re_fund_metrics_qtr` row | STALE_CACHE + LOGIC | Defect C |
| IRR = -98% on 2-year-old debt fund | LOGIC + possibly DATA (cash event sign error) | Phase 4 |
| `beginning_nav = 0` in 2026Q2 snapshot | LOGIC — NAV carry-forward broken | Phase 5 new |
| 5 verified snapshots per fund_qtr | STALE_CACHE (promotion churn) | Phase 7 new |
| `canonical_metrics.gross_tvpi` missing (key is `tvpi`) | UI_SOURCE_MISMATCH (key-name drift) | new |

---

## Residual-gap assessment (from prior fixes)

| Prior fix | Claim | Verdict after Phase 0 |
|---|---|---|
| commit `e2b16f33` (Authoritative State Lockdown) | Fund page reads authoritative via `useAuthoritativeState` | **Partially effective.** UI is protected. Backend `compute_return_metrics` is still drifting; snapshot builder itself is poisoned by Defect B. |
| migration `433_meridian_ledger_dedup.sql` | Dedup 28 IGF VII contribution entries | **Partially effective for IGF VII cash events** — still 15 calls / 17 dists with no obvious dupes. But did not touch `repe_fund` row-level dupes. |
| migration `457_fix_capital_ledger_dedup.sql` | Forward-fill assets + recompute fund state | **Effective for forward-fill**, but recomputed fund_quarter_state is still the 32× inflated value. Recompute pipeline uses the broken rollup. |
| migration `458_re_fund_expense_qtr_unique.sql` | Unique constraint on fund expense quarter | **Effective** — no dupes found in expense table. |
| migration `459_re_authoritative_snapshot_audit.sql` | Immutable released snapshots | **Effective** — trigger works. But 5 verified rows per fund_qtr shows the promotion pipeline is noisy. |

Summary: prior fixes locked down the **surface** (UI reads, trigger, uniqueness constraints) but the **source pipeline** (snapshot builder, rollup, waterfall carry) is still contaminated.

---

## Ready for Phase 1+

The three confirmed defects (A/B/C) all need patches. In addition, Phase 0 surfaced three **new** forensic targets that were not in the original plan:

- **NF-1** — dedup + vintage repair for the two duplicate fund rows (need a Phase 1.10 task)
- **NF-2** — `canonical_metrics` key-name standardization: `tvpi` vs `gross_tvpi` — must pick one and enforce (add to Phase 7 lint)
- **NF-3** — snapshot-builder's `beginning_nav` carry-forward — broken for IGF VII 2026Q2 (`beginning_nav=0` despite prior quarters existing)
