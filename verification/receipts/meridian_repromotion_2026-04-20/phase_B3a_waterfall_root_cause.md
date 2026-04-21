# Phase B3a — IGF VII Waterfall Root Cause

**Date:** 2026-04-20
**Scope:** Phase 1 + Phase 2 only (isolation + audit). No fund data changes.
**Artifact goal:** exact mechanism for _why GPs received 13-38× commitment and 5 LPs received $0_.

---

## Answer

**Two independent bugs.** Both live upstream of the reported partner splits. Neither is in the runtime's Python dispatch code; one is in the finance engine's tier-1 math, the other is in the seeded ledger data.

### Bug 1 — Engine: tier-1 has no cap

[backend/app/finance/waterfall_engine.py:81-84](backend/app/finance/waterfall_engine.py#L81-L84)

```python
# Tier 1: Return of capital.
t1_weights = {p.participant_id: qmoney(p.unreturned_capital) for p in participants}
t1_alloc, t1_lines = _tier_alloc("tier_1_return_of_capital", "return_of_capital", remaining, t1_weights)
lines.extend(t1_lines)
```

`_tier_alloc(..., remaining, weights)` distributes **all of `remaining`** (the full distributable amount) pro-rata by weight. For IGF VII 2026Q2 that's the full `portfolio_nav = $1,446,373,530.90`, distributed proportionally to each partner's `unreturned_capital`.

The **sum of unreturned capital across all partners** was $1,186,635,762.04 — but the engine poured $1,446,373,530.90 into tier 1. Every partner with nonzero unreturned capital received exactly **`unreturned × 1.2189`** (where `1.2189 = 1,446,373,530.90 / 1,186,635,762.04`), which means they all got $259.7M more than their unreturned balance would support.

Compare to tier 2 ([waterfall_engine.py:87-90](backend/app/finance/waterfall_engine.py#L87-L90)) which **does** cap correctly:

```python
t2_weights = {p.participant_id: qmoney(p.pref_due) for p in lp_participants}
t2_target = qmoney(sum(t2_weights.values(), Decimal("0")))   # ← bounded by aggregate weight
t2_amount = min(remaining, t2_target)                        # ← cap
t2_alloc, t2_lines = _tier_alloc("tier_2_preferred_return", "preferred_return", t2_amount, t2_weights)
```

**Why this is a bug:** in a standard waterfall, tier 1 returns *up to* each partner's unreturned capital, and any excess cascades to tier 2 (preferred return). The current tier-1 code treats unreturned as a _weight for dividing_ the full distributable, which over-allocates when distributable > aggregate unreturned, and also swallows what should be preferred-return income, catch-up, and carry in later tiers.

**Fix (single-line pattern, mirrors tier 2):**

```python
t1_weights = {p.participant_id: qmoney(p.unreturned_capital) for p in participants}
t1_target = qmoney(sum(t1_weights.values(), Decimal("0")))
t1_amount = min(remaining, t1_target)
t1_alloc, t1_lines = _tier_alloc("tier_1_return_of_capital", "return_of_capital", t1_amount, t1_weights)
```

Under the fix, IGF VII 2026Q2 would produce:
- Tier 1 total: $1,186,635,762.04 (= aggregate unreturned)
- Remaining after tier 1: $259,737,768.86 cascades to tier 2 → tier 3 → tier 4
- Tier 4 carry: some share of residual at the 80/20 split → **a real carry figure becomes possible**

### Bug 2 — Data: ledger entries are shaped like fund calls, not partner calls

The fix above only eliminates the over-allocation. The **partner shares within tier 1 are still wrong** because the `unreturned_capital` basis itself is seeded incorrectly.

Audit of `re_capital_ledger_entry` for IGF VII (`a1b2c3d4-0003-0030-0001-000000000001`):

| Partner | Type | Committed | Total contributed | Total distributed | Unreturned | Commit/Unreturned ratio |
|---|---|---:|---:|---:|---:|---:|
| Meridian Capital Management GP | gp | $25M | **$900M** | $113M | $787M | 0.032 (should be ≥1) |
| Winston Capital Management | gp | $10M | **$212.5M** | $106M | $107M | 0.094 |
| State Pension Fund | lp | $200M | $212.5M | $113M | $99M | 2.02 |
| University Endowment | lp | $150M | $212.5M | $114M | $99M | 1.52 |
| Sovereign Wealth Fund | lp | $140M | $125M | $117M | $8M | 17.5 |
| CalPERS Real Estate | lp | $125M | $212.5M | $126M | $87M | 1.44 |
| BlackRock Real Estate FoF | lp | $100M | **$0** | $0 | $0 | — |
| Hartford Insurance Group | lp | $75M | **$0** | $0 | $0 | — |
| Texas Teachers Retirement | lp | $50M | **$0** | $0 | $0 | — |
| Whitfield Family Office | lp | $50M | **$0** | $0 | $0 | — |
| Duke University Endowment | lp | $50M | **$0** | $0 | $0 | — |
| Evergreen Realty Co-Invest | co_invest | $25M | **$0** | $0 | $0 | — |

**Pattern:** every partner that has any contribution was written with values that are multiples of the fund's call amounts, not their individual commitment share. Specifically:

- Five different partners (State Pension, University Endowment, CalPERS, Winston GP, and a scaled variant for SWF) each have contributions shaped like $212.5M in 2025Q1 — which equals `$850M × 25%` (the 2025Q1 fund-level call).
- Meridian Capital Management GP has 8 quarterly contributions ($150M, $150M, $120M, $120M, $100M, $100M, $80M, $80M = $900M total) which match fund-level call amounts for each of those quarters.
- Six partners (BlackRock, Hartford, Texas Teachers, Whitfield, Duke, Evergreen) have **zero ledger entries** — they were never seeded.

**Correct seeding** would have required each CALL event to be allocated per partner by `committed_amount / total_committed_amount`. Example: on a $212.5M fund call in 2025Q1 with $1B total commitments, State Pension ($200M / $1B = 20%) should contribute $42.5M, not $212.5M. CalPERS ($125M / $1B = 12.5%) should contribute $26.5M. Meridian GP ($25M / $1B = 2.5%) should contribute $5.3M. BlackRock ($100M / $1B = 10%) should contribute $21.25M — not $0.

### Why GPs appear to have "contributed" the most

This is the **non-obvious part**. Meridian Capital Management GP shows $900M contributed not because it made fund capital calls, but because it was tagged as the contributor on ledger entries that were actually meant to represent either:
- Fund-level cash inflows not yet allocated to specific LPs, or
- A placeholder partner that captured the full call while the per-LP distribution was never seeded

Either way, the GP is acting as a sink for the full fund-level contribution stream, and the 6 zero-contribution LPs are the partners whose fractional shares were never split out. The total ledger contributions ($900M + $212.5M + $212.5M×3 + $125M = $1,875M) **exceed even the fund's `total_called = $833M`** per `re_fund_quarter_state` — so the ledger has systematic double-booking of calls on top of the partner-allocation failure.

---

## Why 5 LPs got $0 and GPs got multiples of commitment

Composing the two bugs:

1. The 5 LPs (BlackRock, Hartford, Texas Teachers, Whitfield, Duke) + Evergreen Co-Invest have `unreturned_capital = 0` because they have no ledger entries. Pro-rata allocation by a weight of 0 → zero share. They get $0 in tier 1 regardless of whether Bug 1 is fixed.
2. Meridian Capital Management GP has `unreturned_capital = $787M` because its ledger contributions were seeded with fund-level call amounts ($900M) instead of its share of them (~$22.5M). Its tier-1 share is `$787M / $1,187M = 66.3%` → receives `66.3% × $1,446M = $959M` — 38× its $25M commitment.
3. Same mechanism for Winston GP ($107M unreturned / $1.187B total = 9.0% → $130M, 13× its $10M commitment).
4. The four other LPs with partial contributions got proportional shares of $99M / $99M / $87M / $8M (all scaled by 1.2189× due to Bug 1 overshoot).

**Bug 1 alone:** would still over-allocate tier 1 but keep per-partner proportions unchanged. GPs would still get multiples of their commitment; 5 LPs would still get $0.

**Bug 2 alone:** if tier 1 were correctly capped at $1,187M but ledger seeding were unchanged, the 5 LPs still get $0 (unreturned = 0) and GPs still get most of tier 1.

**Both bugs must be fixed** to produce economically valid waterfall outputs for IGF VII.

---

## Scope alignment (Phase 2 confirmation)

- Ledger scope: 61 entries for IGF VII, 1 distinct `fund_id`, quarters from 2024Q3 to 2026Q4. Runtime filters `quarter <= '2026Q2'` so 2026Q3/Q4 entries are correctly excluded. **No scope bleed.**
- Waterfall definition scope: after migration 468 there is exactly one active definition (`IGF VII Standard Waterfall`, version 1), which is what the runtime picked. **No definition ambiguity.**
- Fund quarter state scope: `re_fund_quarter_state` for IGF VII 2026Q2 reports `portfolio_nav=$1.446B, total_committed=$1B, total_called=$833M, total_distributed=$688M`. The first three match `repe_fund`/commitments; `total_distributed` at the fund level ($688M) exceeds the sum of per-partner ledger distributions ($714M including GP distributions — consistent with intra-fund transfers). **No material scope mismatch for the tier-1 question.**

---

## Recommendations (no action taken this session)

### Fix Bug 1 first (engine)

The engine fix is a 2-line change in [backend/app/finance/waterfall_engine.py](backend/app/finance/waterfall_engine.py):

```diff
  # Tier 1: Return of capital.
  t1_weights = {p.participant_id: qmoney(p.unreturned_capital) for p in participants}
- t1_alloc, t1_lines = _tier_alloc("tier_1_return_of_capital", "return_of_capital", remaining, t1_weights)
+ t1_target = qmoney(sum(t1_weights.values(), Decimal("0")))
+ t1_amount = min(remaining, t1_target)
+ t1_alloc, t1_lines = _tier_alloc("tier_1_return_of_capital", "return_of_capital", t1_amount, t1_weights)
```

Pair with a regression test in [backend/tests/test_repe_fail_closed_waterfall.py](backend/tests/test_repe_fail_closed_waterfall.py) or a new `test_waterfall_tier_allocations.py` that asserts:
- With `distributable > sum(unreturned)`, tier 1 total equals `sum(unreturned)` exactly.
- With `distributable ≤ sum(unreturned)`, tier 1 total equals `distributable` (no over-allocation, no under-allocation).
- Per-partner tier-1 amount is bounded by that partner's `unreturned_capital`.
- Residual (`distributable - tier_1`) correctly cascades to tier 2.

### Fix Bug 2 second (ledger seeding)

The ledger fix is NOT a code change — it's a data-seeding migration to reshape existing entries and populate the 6 missing partners. The correct formula: for each existing CALL event (where `sum_ledger_contributions_for_that_quarter = S`), rewrite the 6 populated-partner rows and insert 6 new rows for the zero-contribution partners such that each partner's quarterly contribution = `committed_amount / total_committed × S`. This must be an idempotent migration with full audit trail (who changed what and why) — **requires user sign-off before execution** because it mutates historical cash-flow records.

### What MUST stay unchanged

- **No re-promotion of IGF VII.** The current `inv5-rebuild-20260411-full-scope` snapshot remains the authoritative record. `trust_status=untrusted` at the fund level with `net_irr=null` / `carry=null` (fail-closed per Patch B) is the correct state until both bugs are fixed and a valid waterfall run produces usable net metrics.
- **No change to migration 468.** Deactivating the ambiguous "Default" waterfall was correct; the tie-breaker was undefined regardless of downstream bugs.
- **No change to MREF III or MCOF I.** Per the session gate, these are out of scope until IGF VII waterfall is repaired.

---

## Status after this investigation

| Item | Status |
|---|---|
| Engine tier-1 has no cap ([waterfall_engine.py:82](backend/app/finance/waterfall_engine.py#L82)) | **BUG — confirmed, mechanism proven** |
| Ledger entries tagged fund-level calls to individual partners | **BUG — confirmed, 12 partners affected** |
| 6 partners have zero ledger entries | **BUG — confirmed, seeding incomplete** |
| Scope alignment (runtime vs ledger vs fund state vs waterfall def) | **CLEAN** |
| Waterfall definition ambiguity (two active) | **RESOLVED** (migration 468 already shipped) |
| IGF VII authoritative snapshot | **UNCHANGED** (no re-promotion this session) |
| Next-session entry point | **Fix Bug 1 (engine) → regression test → then decide on Bug 2 ledger reseed with user sign-off** |
