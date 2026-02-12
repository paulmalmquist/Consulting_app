# Finance Waterfall Model (JV / Promote)

## Scope
This document describes the v1 deterministic Private Equity Real Estate JV waterfall implementation shipped in this repository.

- Backend engine: `backend/app/finance/waterfall_engine.py`
- API orchestration: `backend/app/services/finance.py`, `backend/app/routes/finance.py`
- UI routes: `repo-b/src/app/app/finance/*`
- Schema migration: `repo-b/db/migrations/005_finance_waterfall_v1.sql`

## Determinism and Auditability
Determinism guarantees in v1:
- All currency math uses `Decimal` and fixed quantization (`0.000001`).
- Timeline ordering is stable (`date`, `event_type`, amount).
- Pro-rata allocation is deterministic (sorted partner IDs + final drift reconciliation).
- `run_hash` is SHA-256 over:
  - scenario assumptions,
  - raw scenario cashflow events,
  - waterfall tier definitions,
  - `engine_version`.

Auditability guarantees in v1:
- Inputs persisted in `app.scenario_assumption` and `app.cashflow_event`.
- Run metadata persisted in `app.model_run`.
- Output metrics persisted in `app.model_run_output_summary`.
- Distribution lines persisted in `app.model_run_distribution` with `lineage_json` for explainability.
- Tier progression persisted in `app.model_run_tier_ledger`.

## Data Model (app schema)
Core entities:
- `investment_fund`
- `investment_deal`
- `investment_property`

Ownership:
- `partner`
- `deal_partner`

Waterfall configuration:
- `waterfall`
- `waterfall_tier`

Scenarios and assumptions:
- `scenario`
- `scenario_assumption`

Cashflow inputs:
- `cashflow_event`

Run outputs:
- `model_run`
- `model_run_output_summary`
- `model_run_distribution`
- `model_run_tier_ledger`

Indexing:
- `cashflow_event (scenario_id, date)`
- `model_run_id` indexes on all output tables

## Event Sign Convention
`cashflow_event.amount` is from the deal perspective:
- Positive: cash inflow to deal (`operating_cf`, `sale_proceeds`, etc.)
- Negative: cash outflow from deal (`fee`, `capex`, `debt_service`, etc.)

`capital_call` is treated as partner contribution funding and is not distributable cash by itself.

## Waterfall Mechanics (v1)
Implemented tier types:
1. `return_of_capital`
2. `preferred_return` (simple accrual on LP unreturned capital, day-count/365)
3. `catch_up`
4. `split` (supports `hurdle_irr` and `hurdle_multiple` gates)

Supported structure:
- `american` fully supported.
- `european` accepted, but currently processed as American in v1 (limitation logged in run metadata).

## XIRR
`xirr` uses a robust hybrid solver:
- Root bracketing by interval expansion.
- Newton steps when stable.
- Bisection fallback when Newton is unstable/out-of-bracket.
- Graceful no-solution output (`None` + reason) when root cannot be bracketed.

## Assumption-Driven Event Generation
If missing from imported cashflows, engine can generate:
- `sale_proceeds` from `sale_price` + `exit_date`.
- `sale_proceeds` from `exit_cap_rate` + NOI proxy.
- `refinance_proceeds` from `refinance_proceeds` + `refinance_date`.
- optional management fee stream from `asset_mgmt_fee`/`mgmt_fee` if no fee events exist.

## Explain Lineage
`GET /api/finance/runs/{run_id}/explain` returns partner/date tier rows with lineage fields from `lineage_json`, including:
- `available_before` and `available_after`
- tier order/type
- hurdle/split context
- pref/outstanding context where applicable

## Seeded Deal
Migration seeds a working dataset:
- Deal: `Sunset Commons JV`
- LP: `Blue Oak Capital` (90%)
- GP: `Winston Sponsor` (10% + promote)
- Initial capital call: `$10,000,000`
- Monthly operating cashflows with growth
- Quarterly fee stream
- Base/Downside/Upside scenarios
- 5-tier waterfall including pref, catch-up, and split hurdle

## Known v1 Limitations
- European waterfall logic not separately implemented yet.
- Scenario NAV/remaining value is not modeled separately for TVPI (TVPI currently mirrors DPI when no residual value input exists).
- Debt amortization schedule from rate/IO assumptions is not yet fully synthesized into `debt_service` lines.
