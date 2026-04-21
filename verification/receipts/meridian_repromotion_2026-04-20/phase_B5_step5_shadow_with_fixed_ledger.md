# Step 5 — IGF VII Shadow Run After Ledger Reseed

**Date:** 2026-04-21
**Shadow run_id:** `e95fe4f7-039a-4cdc-bf9e-e02b0eb1cd74`
**Backend build:** `b6d62ef6` (engine fix live)
**Waterfall definition:** `a1b2c3d4-0003-0030-0001-000000000099` ("IGF VII Standard Waterfall")

## Gate 5 verdict: PASS

After the ledger reseed (migration 469), the same engine now produces economically valid outputs: all 12 partners participate in tier 1, GPs no longer dominate, LPs now receive their proper share.

---

## Tier totals

| Tier | Partners | Total | Check |
|---|---:|---:|---|
| tier_1_return_of_capital | **12** (was 6 pre-reseed) | $559,492,243.93 | = Σ unreturned = $695M − $135.5M = $559.5M ✓ |
| tier_4_carry_split_gp | 2 | $177,376,257.39 | = 20% × $886.9M residual ✓ |
| tier_4_carry_split_lp | 10 | $709,505,029.58 | = 80% × $886.9M residual ✓ |
| **TOTAL** | — | **$1,446,373,530.90** | = distributable (INV-W3 ✓) |

Tier 1 total dropped from $1.187B (pre-ledger fix, post-engine fix) to $559.5M — correct, because `unreturned` now properly reflects contributions minus distributions.

Tier 4 residual is $886.9M (= $1.446B − $559.5M). Engine correctly splits 20/80 GP/LP per the waterfall contract. Tiers 2 and 3 skip (pref_due still seeded as 0 upstream; not part of this session's scope).

---

## Per-partner INV-W2 verification (live DB)

All 12 partners pass `tier_1_received ≤ unreturned_capital`:

| Partner | Commit% | Unreturned | T1 | T4 | INV-W2 |
|---|---:|---:|---:|---:|---|
| State Pension Fund | 20.0% | $111.90M | $111.90M | $147.05M | PASS |
| University Endowment | 15.0% | $83.92M | $83.92M | $110.29M | PASS |
| Sovereign Wealth Fund | 14.0% | $78.33M | $78.33M | $102.93M | PASS |
| CalPERS Real Estate | 12.5% | $69.94M | $69.94M | $91.90M | PASS |
| BlackRock Real Estate FoF | 10.0% | $55.95M | **$55.95M** | $73.52M | PASS |
| Hartford Insurance Group | 7.5% | $41.96M | **$41.96M** | $55.14M | PASS |
| Duke University Endowment | 5.0% | $27.97M | **$27.97M** | $36.76M | PASS |
| Whitfield Family Office | 5.0% | $27.97M | **$27.97M** | $36.76M | PASS |
| Texas Teachers Retirement | 5.0% | $27.97M | **$27.97M** | $36.76M | PASS |
| Meridian Capital Management GP | 2.5% | $13.99M | $13.99M | $126.70M | PASS |
| Evergreen Realty Co-Invest | 2.5% | $13.99M | **$13.99M** | $18.38M | PASS |
| Winston Capital Management | 1.0% | $5.59M | $5.59M | $50.68M | PASS |

The 6 partners bolded above had $0 tier-1 payouts before the reseed. Now they receive their fair proportional share.

---

## Shadow comparison — before vs after each fix

| Dimension | Pre-Step 1 (de64bb0a) | Post-Step 1 (0fa3d162) | Post-Step 4 (e95fe4f7) |
|---|---:|---:|---:|
| Tier 1 total | $1,446,373,530.90 | $1,186,635,762.04 | **$559,492,243.93** |
| Partners in tier 1 | 6 | 6 | **12** |
| Meridian GP tier-1 | $959M (38× commit) | $787M | **$14M (0.56× commit)** |
| BlackRock LP tier-1 | $0 | $0 | **$55.9M** |
| Total cash leaked/conjured | 0 | 0 | 0 |
| GP tier-4 carry | $0 | $37M | **$127M + $51M = $178M** |

---

## Interpretation — IGF VII economics now defensible

- LPs collectively receive tier-1 + tier-4 totaling ~$1,186M on $965M commitment (LP-only) = 1.23× net to LPs before fees (there are no tier-2/tier-3 flows).
- GPs (Meridian + Winston) receive tier-1 + tier-4 totaling ~$196M on $35M commitment = 5.6× overall (of which $177.4M is carry on ~$886.9M of gains). 20% of $886.9M = $177.4M ✓.
- Tier 4 behavior reflects proper 80/20 European carry split applied to the residual-above-capital.

Still unfixed (out of scope per plan):
- Tier 2 (preferred return) never activates because `pref_due` comes from `participant_adjustments` (always empty) — engine-level omission rather than data. Not a Meridian-specific bug.
- Tier 3 (catch-up) also dormant without tier 2.
- These are acceptable gaps for the post-Step 7 snapshot: net_irr / net_tvpi will carry null_reason `'out_of_scope_requires_waterfall'` for the carry-on-pref portion, which is correct fail-closed behavior.
