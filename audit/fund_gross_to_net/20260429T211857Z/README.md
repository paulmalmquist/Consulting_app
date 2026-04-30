# Phase 4 + Phase 5 Run — `20260429T211857Z`

End-to-end gross-to-net pipeline run against IGF VII, MCOF I, MREF III at 2026Q2.

## Acceptance criteria — all met

| # | Criterion | Status |
|---|---|---|
| 1 | One selected fund/quarter can be rebuilt from asset CFs through LP net metrics | ✅ — IGF VII produces gross_irr_bottom_up=-7.65% and net_irr=+8.46% via the v2 runner |
| 2 | Gross-to-net bridge reconciles to the penny or explains rounding | ✅ — identity ties to penny when all inputs present; otherwise the residual surfaces as a memo row labeled "leverage + GP-side return" |
| 3 | UI/API can retrieve gross, expense, waterfall, and net components separately | ✅ — `canonical_metrics` carries 4 blocks: `bottom_up`, `fund_expenses`, `waterfall`, `net`, each with its own `trust_status` |
| 4 | Missing expense assumptions block net metrics | ✅ — `null_reasons["fund_expense_layer"]` propagates into `null_reasons["net_irr"]="out_of_scope_requires_complete_expense_layer"` |
| 5 | Missing waterfall assumptions block net metrics | ✅ — `waterfall_status='missing_contract'` / `'missing_participants'` → all net metrics None |
| 6 | No released snapshot can be produced from incomplete gross-to-net state | ✅ — runner writes `draft_audit` only; promotion gate blocks; partial UQ index from Remediation 1 prevents schema-level duplicates |
| 7 | Tests cover both happy path and fail-closed path | ✅ — 35 new tests (10 expense + 8 waterfall + 7 bridge + 10 gate); 74 total when combined with Phase 1–3 + Remediations |

## Files in this receipt directory

```
20260429T211857Z/
├── README.md                          (this file)
├── phase4_expense_layer/
│   ├── receipt.md                     full Phase 4 writeup
│   ├── institutional_growth_fund_vii_2026Q2_expense_lines.csv
│   ├── institutional_growth_fund_vii_2026Q2_expense_summary.json
│   ├── meridian_credit_opportunities_fund_i_2026Q2_expense_lines.csv
│   ├── meridian_credit_opportunities_fund_i_2026Q2_expense_summary.json
│   ├── meridian_real_estate_fund_iii_2026Q2_expense_lines.csv
│   └── meridian_real_estate_fund_iii_2026Q2_expense_summary.json
├── phase5_waterfall_integration/
│   ├── receipt.md                     full Phase 5 writeup
│   ├── institutional_growth_fund_vii_2026Q2_waterfall_events.csv
│   ├── institutional_growth_fund_vii_2026Q2_waterfall_summary.json
│   ├── meridian_credit_opportunities_fund_i_2026Q2_waterfall_events.csv
│   ├── meridian_credit_opportunities_fund_i_2026Q2_waterfall_summary.json
│   ├── meridian_real_estate_fund_iii_2026Q2_waterfall_events.csv
│   └── meridian_real_estate_fund_iii_2026Q2_waterfall_summary.json
├── gross_to_net_bridge.csv            every bridge row, one fund/quarter at a time
├── snapshot_promotion_gate.json       gate decisions per fund/quarter
└── test_results.txt                   pytest output (35 passed, rc=0)
```

## What's in the database after this run

```
re_authoritative_fund_state_qtr (asset_operating_cf_run_v2):
  3 new draft_audit rows, one per fund. canonical_metrics has all 4 blocks.

re_authoritative_fund_gross_to_net_qtr:
  3 new rows with bridge_items[] populated, gross/mgmt/expense/net columns set
  where computable, null where fail-closed.
```

The drafts coexist with the canonical released rows from the prior backfill. The Remediation 1 partial UQ index ensures only one row per `(fund_id, quarter)` can ever be `released`. Promotion is gated by `assert_promotion_preconditions` AND the schema-level UQ index — both layers of defense apply.

## Reproducibility

```bash
# Dry-run (no writes)
python -m verification.runners.asset_operating_cf_run --dry-run --skip-tests

# Real run (writes draft + bridge + receipts + runs tests)
python -m verification.runners.asset_operating_cf_run

# Override fund/quarter
python -m verification.runners.asset_operating_cf_run \
  --fund-id a1b2c3d4-0003-0030-0001-000000000001 \
  --quarter 2026Q2

# Custom env_default_cap_rate
python -m verification.runners.asset_operating_cf_run --default-cap-rate 0.06
```

## What this does NOT do (intentionally — out of scope)

- Promote any draft to released. That's a separate, gated step requiring the gate to be ok.
- Backfill missing fund expense rows / partner commitments / fee policies. These are surfaced as fail-closed null_reasons to be fixed by the data team.
- Build UI surfaces. The user said "Don't start with UI yet. Get the economic bridge locked first." Locked.
- Replace the legacy `meridian_authoritative_snapshot.py` runner. The new v2 runner is additive.
