# Phase B9 — Gate 7 Execution, Stop at Scope Boundary

**Date:** 2026-04-21
**Status:** All pre-flight gates (G7.1–G7.5) **GREEN**. G7.6 (promotion) stopped before execution due to scope boundary.

## Pre-flight gates — all green

### G7.1 — Three gate families re-verified
| Family | Status | Evidence |
|---|---|---|
| Engine (INV-W1/W2/W3) | PASS | `test_waterfall_tier_allocations.py` 10/10, `test_waterfall_carry_classification.py` 8/8 |
| Ledger (INV-L1/L2) | PASS | Σ contrib = $695M exact; Σ dist = $135.5M (−$0.02 rounding, within $1); max partner drift = $0.0000 |
| Metrics classification | PASS | IGF VII carry = $177,376,257.39 via `_TIER_TYPE_MAP` (shadow `174c0345`) |

### G7.2 — Runner completed
Ran `verification/runners/meridian_authoritative_snapshot.py`. Wrote 6 new draft rows:
- `snapshot_version = meridian-20260421T151330Z-325c3fa0`
- `audit_run_id = 1663d1d7-69df-49fe-8f12-a9b77b039c6d`
- All 6 rows at `promotion_state = 'verified'` (runner auto-promotes draft → verified via `apply_trust_flags`)

### G7.3 — Draft inspected
**IGF VII 2026Q2 draft:**

| Metric | Old release | New draft | Delta |
|---|---:|---:|---:|
| ending_nav | $1,446,373,530.90 | $1,239,546,916.92 | **−$206.8M** |
| gross_irr | 66.42% | 53.40% | −13.0 pp |
| net_irr | null | **50.99%** | now computed |
| tvpi (gross) | 2.276× | 1.978× | −0.298× |
| net_tvpi | null | **1.945×** | now computed |
| dpi | 0.195 | 0.195 | unchanged |
| gross_net_spread | null | **2.41%** | now computed |
| irr_trust_state | trusted | trusted | unchanged |
| trust_status | untrusted | **trusted** | upgraded |

**Explanation of the $206.8M NAV drop:** Old snapshot summed `re_investment_quarter_state.nav` raw (without applying fund JV ownership share). New snapshot uses `ending_nav_attributable` per investment = `raw_nav × fund_ownership_share` (85–90% across the 20 investments). The new value is economically correct — it excludes the non-fund JV partners' share of each investment's NAV. Verified: Σ of 20 `ending_nav_attributable` values = $1,239,546,916.92 exactly.

This is a silent NAV correction exposing a subtle defect in the old snapshot. Legitimately better, but material.

**Carry field in canonical_metrics is null** — the runner does not populate `carry` from the waterfall engine. `net_irr` and `net_tvpi` are computed by the runner independently as:
- `net_irr = XIRR(gross_cashflows − fees − expenses)`
- `net_tvpi = (distributions − fees − expenses + ending_nav) / total_called`

This is fund-level net (after fees/expenses), not waterfall-carry-net. Economically valid, just a different computation path from `_compute_waterfall_carry`.

### G7.4 — Named pre-promotion sanity gate: 5/5 PASS

| Assertion | Value | Result |
|---|---|---|
| `net_tvpi < gross_tvpi` | 1.9453 < 1.9785 | PASS |
| `net_irr < gross_irr` | 0.5099 < 0.5340 | PASS |
| `carry > 0` | $177,376,257.39 | PASS |
| `carry < total_profit` | $177.4M < $680.1M | PASS |
| `gross_net_spread > 0` | 2.41% | PASS (bonus) |

Carry value taken from live shadow `174c0345` (`tier_4_carry_split_gp`) per the Bug 3-fixed engine path. Total profit = `ending_nav + distributions − called = $1,239.5M + $135.5M − $695M = $680.1M`.

### G7.5 — 4-partner hand-receipt check: 4/4 PASS

Values unchanged from Phase B6 (ledger and engine both deterministic since reseed):

| Partner | Commit% | Unreturned | T1 allocation | T4 allocation | INV-W2 |
|---|---:|---:|---:|---:|---|
| State Pension Fund | 20.0% | $111.90M | $111.90M | $147.05M | PASS |
| Sovereign Wealth Fund | 14.0% | $78.33M | $78.33M | $102.93M | PASS |
| BlackRock Real Estate FoF | 10.0% | $55.95M | $55.95M | $73.52M | PASS |
| Meridian Capital Management GP | 2.5% | $13.99M | $13.99M | $126.70M | PASS |

## G7.6 — Stop at scope boundary

### Finding

`promote_snapshot_version(snapshot_version=..., target_state='released')` operates on the **entire `snapshot_version`**, not on a fund subset. The runner emitted 6 rows under `meridian-20260421T151330Z-325c3fa0`:

| Fund | Quarter | New gross_irr | Old released gross_irr | Δ |
|---|---|---:|---:|---:|
| Institutional Growth Fund VII | 2025Q4 | 92.48% | — | (new 2025Q4 would supersede) |
| Institutional Growth Fund VII | 2026Q2 | **53.40%** | **66.42%** | **-13.0 pp** |
| Meridian Real Estate Fund III | 2025Q4 | 5.80% | — | (new) |
| Meridian Real Estate Fund III | 2026Q2 | 5.04% | 5.47% | -0.43 pp |
| Meridian Credit Opportunities Fund I | 2025Q4 | -19.50% | — | (new) |
| Meridian Credit Opportunities Fund I | 2026Q2 | **-51.77%** | **+2.40%** | **-54.17 pp** |

Calling `promote_snapshot_version --target-state=released` would elevate **all six rows** to released at once. That materially changes MREF III and MCOF I (which the session gate explicitly put out of scope — "do not expand scope").

### Session gate reminder

Prior instruction: *"Do not broaden next session into 'fix waterfall + MREF III + MCOF I.' That's how ambiguity comes back."*

MCOF I's new -51.77% IRR is consistent with the 2026-04-11 final report's expected post-scope-expansion range (~-57%), so the number itself is defensible. But promoting it is a fund-level decision that belongs in a separate session focused on MREF III / MCOF I scope verification, per the user's prior guidance.

### Options (surfacing for user decision — no action taken)

**Option X — Surgical promotion:** directly `UPDATE re_authoritative_fund_state_qtr SET promotion_state = 'released' WHERE snapshot_version = ... AND fund_id = IGF_VII AND quarter = '2026Q2'`. Bypasses `promote_snapshot_version`'s snapshot-wide semantics.
- Pro: precisely scoped to IGF VII
- Con: bypasses the `released_state_lock` contract; migration 459's trigger may (or may not) block direct UPDATE. Not tested.

**Option Y — Delete non-IGF-VII draft rows, then promote:** delete the 4 rows for MREF III + MCOF I under this snapshot_version, then call `promote_snapshot_version` on the remaining 2 IGF VII rows.
- Pro: clean, uses the standard promotion path
- Con: loses the MREF III + MCOF I draft we just built; they'd need to be regenerated in a future session (small cost)

**Option Z — Accept all-funds promotion:** promote the full snapshot_version. IGF VII gets its new $1,239M NAV + 53.4% IRR + 51.0% net IRR. MREF III moves from 5.47% to 5.04% (small). MCOF I moves from +2.4% to -51.8% (large, but consistent with final report's post-scope-expansion expectation).
- Pro: single-pass, uses the standard release gate
- Con: violates session scope boundary; MCOF I change would need its own explanation

**Option Stop (DEFAULT):** promote nothing. Leave the 6 draft rows at `promotion_state='verified'`. Old `inv5-rebuild-20260411-full-scope` release stays authoritative.
- Pro: honors session gate exactly; no scope creep
- Con: IGF VII net metrics remain null on the displayed page for now

## What ships from this turn

- All pre-flight gates confirmed green with receipts
- New draft `meridian-20260421T151330Z-325c3fa0` sits at `verified` for all 3 Meridian funds × 2 quarters (does NOT supersede anything released until explicit promotion)
- Old release `inv5-rebuild-20260411-full-scope` remains the authoritative record on the fund detail page and reconciliation endpoint

## Next action needed from user

Pick one of X / Y / Z / Stop. Each has different scope and risk profile. Defaulting to Stop per session gate until instructed otherwise.
