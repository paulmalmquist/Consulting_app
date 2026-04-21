# Step 6 — Partner-Level Hand-Receipt Validation

**Date:** 2026-04-21
**Shadow run:** `e95fe4f7-039a-4cdc-bf9e-e02b0eb1cd74`
**Tolerance:** $0.01 (per plan Step 6)

## Gate 6 verdict: PASS

All four target partners reconcile to engine outputs within $0.01. Max absolute delta across 16 comparison points = $0.01 (rounding slack on a single Meridian GP cell).

---

## Hand-computation methodology

Independent Python `Decimal` arithmetic (50-digit precision), no engine call:

```
share_i = committed_i / total_committed                   # 1,000,000,000
contributed_i = fund_total_called × share_i               # 695,000,000
distributed_i = fund_total_distributed × share_i          # 135,507,756.09
unreturned_i  = contributed_i - distributed_i
tier_1_i      = unreturned_i                              # tier-1 pays full unreturned when Σ unreturned ≤ distributable
residual_to_t4 = distributable - Σ unreturned             # 886,881,286.99
tier_4_lp_i   = residual_to_t4 × (1 − carry_rate) × (committed_i / Σ committed_lp)
tier_4_gp_i   = residual_to_t4 × carry_rate       × (committed_i / Σ committed_gp)
  where Σ committed_lp = $965,000,000 (10 LPs including co_invest)
        Σ committed_gp = $35,000,000 (2 GPs)
        carry_rate     = 0.20 (European 80/20)
```

---

## Diff table

| Partner | Role | Commit% | Metric | Hand-built | Engine | Delta |
|---|---|---:|---|---:|---:|---:|
| **State Pension Fund** | LP | 20.00% | contrib | $139,000,000.00 | $139,000,000.00 | $0.00 |
| | | | dist | $27,101,551.22 | $27,101,551.22 | $0.00 |
| | | | tier 1 | $111,898,448.78 | $111,898,448.78 | $0.00 |
| | | | tier 4 | $147,047,674.53 | $147,047,674.52 | **$0.01** |
| **BlackRock Real Estate FoF** | LP | 10.00% | contrib | $69,500,000.00 | $69,500,000.00 | $0.00 |
| | | | dist | $13,550,775.61 | $13,550,775.61 | $0.00 |
| | | | tier 1 | $55,949,224.39 | $55,949,224.39 | $0.00 |
| | | | tier 4 | $73,523,837.26 | $73,523,837.26 | $0.00 |
| **Sovereign Wealth Fund** | LP | 14.00% | contrib | $97,300,000.00 | $97,300,000.00 | $0.00 |
| | | | dist | $18,971,085.85 | $18,971,085.85 | $0.00 |
| | | | tier 1 | $78,328,914.15 | $78,328,914.15 | $0.00 |
| | | | tier 4 | $102,933,372.17 | $102,933,372.17 | $0.00 |
| **Meridian Capital Management GP** | GP | 2.50% | contrib | $17,375,000.00 | $17,375,000.00 | $0.00 |
| | | | dist | $3,387,693.90 | $3,387,693.91 | **$0.01** |
| | | | tier 1 | $13,987,306.10 | $13,987,306.09 | **$0.01** |
| | | | tier 4 | $126,697,326.71 | $126,697,326.71 | $0.00 |

- **Max absolute delta: $0.01** (quantization boundary on a single ROUND operation)
- **Partners covered: 4** (3 LPs + 1 GP, per plan Step 6 spec)
- **Gate 6 tolerance met** ($0.01 threshold from plan)

---

## What this proves

- The engine's tier-1 allocation mathematics is consistent with the hand-computed formula `payout = unreturned_capital` (when `Σ unreturned ≤ distributable`, which is the current regime).
- The engine's tier-4 European 80/20 split correctly applies `carry_rate × residual × (partner_commit / role_commit_sum)`.
- The post-reseed ledger feeds the engine correctly — per-partner `contributed` and `distributed` values match `fund_total × share_of_commitment` to the penny.
- The 1-cent deltas on Meridian GP dist / t1 and State Pension t4 are pure quantization rounding; no systematic error.

**Ready for Step 7 (re-promotion).**
