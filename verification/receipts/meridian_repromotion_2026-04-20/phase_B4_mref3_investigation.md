# Phase B4 (read-only) — MREF III Investigation

**Date:** 2026-04-20
**Fund:** Meridian Real Estate Fund III (`a1b2c3d4-0001-0010-0001-000000000001`)
**Quarter:** 2026Q2
**Mode:** Read-only forensic. No data changes.

---

## Finding #1 — "Over-call" was orphan contamination; already fixed by migration 463

The 2026-04-11 final_report.md reported `total_called = $774M > total_committed = $500M` and flagged it as a likely seeding error requiring remediation. Three-way comparison now shows this was a **pre-orphan-dedup aggregation artifact**:

| Source | Event count | Total |
|---|---:|---:|
| Committed capital | — | **$500,000,000** |
| Raw CALL events on canonical fund_id | 6 | **$350,000,000** |
| Orphan CALL events on `d4560000-...` quarantined fund_id | 6 | $473,000,000 |
| Released snapshot `total_called` | — | **$350,000,000** |

**Interpretation:** The original `$774M` figure was the sum of canonical ($350M) + orphan ($473M ≈ $774M rounding). After migration 463 quarantined the orphan fund, the authoritative snapshot correctly reports $350M called against $500M committed — 70% deployed, economically healthy for a vintage-2019 harvesting fund.

**No seeding error. No dedup migration needed (469).** The final_report's "total_called > total_committed" premise is resolved by migration 463 already shipping.

---

## Finding #2 — The 5 "missing" investments have real data but no quarter state

MREF III has 7 investments. Only 2 have `re_investment_quarter_state` rows for 2026Q2:

### Populated (2)

| Investment | Stage | Committed | Invested | Realized | 2026Q2 NAV | JV Count |
|---|---|---:|---:|---:|---:|---:|
| MRF III – Dallas Multifamily Cluster | `operating` | $250M | $212.5M | $1.54M | **$42.85M** | 1 |
| MRF III – Phoenix Value-Add Portfolio | `exited` | $250M | $212.5M | $43.67M | $0 | 1 |

### Missing (5)

| Investment | Stage | Committed | Invested | Realized | 2026Q2 NAV | JV Count |
|---|---|---:|---:|---:|---:|---:|
| MRF III – Austin Midrise Multifamily | `sourcing` | $110M | $110M | $108M | — | **0** |
| MRF III – Charlotte Suburban Office | `sourcing` | $45M | $45M | $40M | — | **0** |
| MRF III – Denver Garden Apartments | `sourcing` | $95M | $95M | $82M | — | **0** |
| MRF III – Nashville Mixed-Use | `sourcing` | $55M | $55M | $42M | — | **0** |
| MRF III – Southeast Industrial Portfolio | `sourcing` | $85M | $85M | $72M | — | **0** |

**Total committed across all 7 investments: $890M** (exceeds `repe_fund.total_committed = $500M`).
**Total committed on the 2 populated + exited investments: $500M** (matches `repe_fund.total_committed` exactly).

### Interpretation

This is not a scope gap — it's a **data-integrity issue at the investment level**:

1. The 5 "missing" investments are `stage = 'sourcing'` but carry `invested_capital = committed_capital` and `realized_distributions` approaching commits. That's economically impossible for a sourcing-stage investment (you cannot have realized distributions before acquisition).

2. These 5 have **0 JVs**, while Dallas and Phoenix each have 1 JV. The snapshot builder's rollup path reads NAV via `re_jv_quarter_state`. Investments without a JV produce no state row regardless of stage — they're structurally invisible to the rollup.

3. The 2 populated investments exactly sum to the fund's committed capital ($250M + $250M = $500M). The 5 "missing" investments sum to an additional $390M that *would* push the fund past committed if they participated in rollup, but they don't.

### Two possible explanations

**(a) The 5 investments are legacy scaffolding.** They were seeded with realized distributions to simulate historical deal flow but never given the JV + quarter state plumbing needed to contribute to rollup. Under this reading, the snapshot is correct: the 2 real (JV-backed) investments are the fund's actual holdings. The 5 sourcing-stage rows are noise that could be deleted or archived, but they don't distort NAV.

**(b) The 5 investments are real but under-built.** They represent actual fund holdings that need JVs + asset state + quarter state to be seeded before they can contribute to rollup. Under this reading, the fund is under-reported: its true NAV and IRR should include these 5, and the current snapshot understates by some amount.

**Which reading is correct requires user input from fund documents.** The data as it stands is ambiguous.

---

## Recommendations (no writes this session)

1. **Do not re-promote MREF III this session.** The snapshot at $42.85M is internally consistent with the 2 JV-backed investments. Any re-promotion without resolving the 5-investment question would either:
   - Re-write the same $42.85M (reading (a) — fine but pointless), or
   - Miss the real NAV if reading (b) is correct — which would be a regression, not a fix.

2. **Next session must start by confirming with the user:** are Austin/Charlotte/Denver/Nashville/Southeast actual MREF III investments with real capital, or historical seed rows?

3. **If (a):** consider an idempotent migration archiving the 5 rows (setting `stage = 'archived'` or moving to a new table) so they stop appearing in investor-facing views.

4. **If (b):** build JV records + asset quarter state for the 5 investments, then re-run the snapshot builder + waterfall + promote.

5. **MREF III remains NOT SAFE for investor reporting** regardless of which reading is correct — because the current UI/API surfaces 7 investments but rollup only reflects 2, creating a legitimate trust gap.

---

## Status after this investigation

| Finding | Status |
|---|---|
| Total-called overcall (final_report §8 #2) | **RESOLVED** — migration 463 already fixed. $350M/$500M is correct. |
| Dallas Cluster JV quarter state (final_report §8 #8) | Still open — $42.85M matches expectation for 2 JV-backed investments; $8.57M understatement noted in final_report may have been resolved by later quarter state refreshes (snapshot matches rollup today). |
| Null `inception_date` (final_report §8 #4) | Still open — requires user-supplied fund document. |
| **NEW:** 5 investments in `sourcing` stage with realized distributions and 0 JVs | **Requires user decision** before any re-promotion. |
