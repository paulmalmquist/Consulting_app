# Step 7 — GATE 7 HARD STOP: Do Not Promote

**Date:** 2026-04-21
**Status:** Re-promotion NOT attempted. Existing `inv5-rebuild-20260411-full-scope` snapshot remains the authoritative record for IGF VII 2026Q2.

## Reason

During Step 7 pre-flight analysis, a **third engine bug** surfaced in `backend/app/services/re_fund_metrics.py:123-141` (`_compute_waterfall_carry`). Fixing Bug 1 (tier-1 cap) + Bug 2 (ledger seeding) made waterfall tier 4 fire cleanly for the first time, exposing a latent defect in the metrics-layer carry computation that would have quietly promoted a wrong `carry` value into the released snapshot.

Per plan Step 7 stop gate: *"if any Step 5 arithmetic oracle fails, do not promote."*

## Bug 3 — `_compute_waterfall_carry` double-counts LP tier-4 allocation

**File:** [backend/app/services/re_fund_metrics.py:133-137](backend/app/services/re_fund_metrics.py#L133-L137)

```python
carry = Decimal("0")
for result in (wf_result.get("results") or []):
    tier_code = result.get("tier_code", "")
    if "carry" in tier_code or "catch_up" in tier_code:
        carry += Decimal(str(result.get("amount", 0)))
return carry.quantize(Decimal("0.01"))
```

The loop sums every allocation whose `tier_code` contains the substring `"carry"` or `"catch_up"`. Looking at the actual tier codes produced by `run_us_waterfall`:

| tier_code | payout_type | Semantic | Live run (e95fe4f7) |
|---|---|---|---:|
| `tier_1_return_of_capital` | `return_of_capital` | return of partner capital | $559,492,243.93 |
| `tier_4_carry_split_gp` | `carry` | **GP carry (this IS carry)** | $177,376,257.39 |
| `tier_4_carry_split_lp` | `carry` | **LP's 80% share of residual (this is NOT carry)** | $709,505,029.58 |

Both tier-4 rows have `"carry"` in the `tier_code`, so `_compute_waterfall_carry` treats both as carry. Resulting `carry = $177M + $709M = $886,881,286.97`.

**What the value should be:** GP carry only = $177,376,257.39 (the `tier_4_carry_split_gp` amount).

**What the computation returns today:** $886,881,286.97 — 5× the true GP carry.

### Impact if we had promoted

`compute_return_metrics` uses this `carry` value in the gross-to-net bridge (lines 378-402 of `re_fund_metrics.py`). A wrong $886.9M carry would produce:
- `net_return = gross_return - carry` → wildly understated
- `net_irr` → deeply negative or null
- `net_tvpi` → far below 1.0x
- `gross_net_spread` → implausibly large

Promoting a snapshot with `carry = $886.9M` would bake this incorrect number into the released authoritative record. Investors would see net metrics that are arithmetic nonsense.

### Why this was not caught in earlier regression tests

- `test_repe_fail_closed_waterfall.py` only tests that `_compute_waterfall_carry` returns None when the engine raises. Doesn't test the value when the engine succeeds.
- `test_repe_golden_fund.py` uses a 2-partner fixture where only the GP tier-4 fires (LP fixtures don't trigger tier_4_carry_split_lp in the setup).
- Pre-Step 1, the IGF VII waterfall never advanced past tier 1, so `_compute_waterfall_carry` never had tier 4 output to sum incorrectly.

Now that tier 4 fires (post-ledger-reseed), the latent defect surfaces.

## Fix needed (Bug 3 — next session)

The carry-sum filter must exclude the LP side of tier-4 splits. Two viable approaches:

### Option A — Filter by tier_code suffix

```python
for result in (wf_result.get("results") or []):
    tier_code = result.get("tier_code", "")
    # GP carry only: tier 3 catch-up + tier 4 GP split
    if tier_code == "tier_3_gp_catch_up" or tier_code == "tier_4_carry_split_gp":
        carry += Decimal(str(result.get("amount", 0)))
```

More precise. Binds carry to specific tier codes produced by `run_us_waterfall`.

### Option B — Filter by participant role

Cross-reference `participant_id` against `re_partner.partner_type` and only sum where `partner_type = 'gp'`.

Works but requires an extra DB query per carry computation. Option A is simpler.

### Regression test to add

```python
def test_compute_waterfall_carry_excludes_lp_tier4_split():
    """Bug 3 regression — LP's 80% of tier 4 residual is NOT carry.
    Only GP carry (tier_3_gp_catch_up + tier_4_carry_split_gp) counts."""
    mock_result = {
        "results": [
            {"tier_code": "tier_4_carry_split_gp", "amount": "100000"},  # carry
            {"tier_code": "tier_4_carry_split_lp", "amount": "400000"},  # NOT carry
            {"tier_code": "tier_3_gp_catch_up", "amount": "50000"},       # catch-up (carry)
        ]
    }
    with patch("app.services.re_waterfall_runtime.run_waterfall", return_value=mock_result):
        carry = _compute_waterfall_carry(...)
    assert carry == Decimal("150000"), f"got {carry} — must exclude LP tier-4 split"
```

## Current IGF VII status (unchanged)

- Released snapshot: `inv5-rebuild-20260411-full-scope` (untouched)
- `canonical_metrics.ending_nav`: $1,446,373,530.90 (correct — reconciled in B1)
- `canonical_metrics.gross_irr`: 66.42% (correct — computed from fund-level cash events, unaffected by partner-ledger reseed)
- `canonical_metrics.net_irr`: null
- `null_reasons.net_irr`: `'out_of_scope_requires_waterfall'`
- `trust_status`: `'untrusted'` at fund-level (correct — net metrics are null-by-design)
- `irr_trust_state`: `'trusted'` at gross-metric level

**These remain the right values to display.** The ledger reseed (Step 4) + engine fix (Step 1) did not corrupt any metric that is currently released. They fixed the waterfall pipeline so a FUTURE promotion can include valid net metrics — pending the Bug 3 fix.

## What shipped this session

- Commit `b6d62ef6` — engine tier-1 cap fix + 10 invariant tests (INV-W1/W2/W3)
- Commit `85b5303f` — migration 469 (ledger reseed), Steps 4/5/6 receipts
- Live DB: ledger now carries pro-rata per-partner entries; INV-L1 + INV-L2 hold
- Shadow runs produce economically sensible outputs across all 12 partners
- Hand-receipt check reconciles 4 partners to $0.01

## What did NOT ship (deliberate)

- **No new IGF VII authoritative snapshot.** Existing release stays in place.
- **No `carry` value written to `re_fund_metrics_qtr`** for this session's waterfall runs (all were `run_type='shadow'`, which doesn't write metric tables).
- **No mutation of MREF III or MCOF I** (out of scope per user gate).

## Next session entry point

Fix Bug 3 in `_compute_waterfall_carry` per Option A (change the tier-code filter). Add the regression test above. Re-run shadow. Verify carry = $177,376,257.39 (GP tier-4 only). Then proceed to Step 7 re-promotion.

Hard rule preserved: **do not promote until every arithmetic oracle is green.**
