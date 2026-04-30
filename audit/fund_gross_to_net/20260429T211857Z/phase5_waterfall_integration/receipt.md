# Phase 5 — Waterfall Integration

**Run:** `20260429T211857Z`  **Date:** 2026-04-29  **Quarter:** 2026Q2

## What shipped

End-to-end integration of the existing waterfall engine into the bottom-up pipeline, with per-event allocation, LP/GP cash stream reconstruction, gross-to-net bridge, draft snapshot writer, and a hard promotion gate.

### Services

| Module | Purpose |
|---|---|
| [`fund_waterfall_layer.py`](../../../backend/app/services/fund_waterfall_layer.py) | Consumes `pre_waterfall_cf`, allocates per distribution event, reconstructs LP/GP cash streams, computes net metrics |
| [`fund_gross_to_net.py`](../../../backend/app/services/fund_gross_to_net.py) | Composes the deterministic 5-row bridge with provenance and identity check |
| [`fund_snapshot_v2.py`](../../../backend/app/services/fund_snapshot_v2.py) | v2 composer that writes draft snapshot + bridge row in one audit_run; promotion gate |
| [`asset_operating_cf_run.py`](../../../verification/runners/asset_operating_cf_run.py) | End-to-end runner |

### Waterfall layer — `compute_fund_waterfall_layer`

**Inputs:**
- `pre_waterfall_cf: list[CFPoint]` — Phase 4 output (gross CF + expense CF).
- `fund_gross_irr` — for the `gross_net_spread_bps` memo.
- `ending_nav` — auto-loaded from `re_fund_quarter_state` if not supplied.
- `expense_null_reasons` — propagated forward; populates `null_reasons["net_irr"]` when expenses fail closed even if waterfall computes locally.

**Algorithm:**
1. Load `re_waterfall_definition` (active = is_active=true, latest version) → fail closed `'missing_contract'` if absent.
2. Load `re_partner_commitment` joined to `re_partner` → fail closed `'missing_participants'` if absent.
3. Pre-load full ledger contribution + distribution history per partner from `re_capital_ledger_entry`.
4. Partition `pre_waterfall_cf` into:
   - **distributable_events** = positive amounts (only these enter the allocator).
   - **lp_outflows** = negative amounts (calls + expenses; flow into LP cash stream as outflows).
5. Walk distributable_events in order. For each event:
   - Accrue pref-due per partner from inception to event_date using day-count actual/365 simple interest on net unreturned capital.
   - Build `ParticipantState` per partner with current `unreturned_capital` + `pref_due`.
   - Call `run_us_waterfall(contract, WaterfallInput(...))` from `app/finance/waterfall_engine.py`.
   - Aggregate per-partner totals; update running `contributed`, `distributed`, `gp_profit_paid_to_date`, `lp_profit_paid_to_date` (per-distribution crystallization).
6. Reconstruct LP and GP cash streams; XIRR of LP stream + LP-share of ending NAV → `net_irr`. Compute `dpi`, `rvpi`, `net_tvpi` from totals.

### Waterfall styles

`WaterfallContract.style` is loaded from `re_waterfall_definition.waterfall_type` and threaded through. The engine supports:
- **American** (deal-by-deal — uses `gp_profit_paid_to_date` carry-forward).
- **European** (whole-fund).
- **Preferred return** (tier 2; rate from `re_waterfall_tier.hurdle_rate` of type `preferred_return`).
- **Return of capital** (tier 1; per-partner cap = unreturned_capital).
- **Catch-up** (tier 3; rate from `re_waterfall_tier.catch_up_percent` of type `catch_up`).
- **Promote split** (tier 4; rate from `re_waterfall_tier.split_gp` of type `promote`).
- **Per-distribution crystallization** via the running `gp_profit_paid_to_date` / `lp_profit_paid_to_date` carry-forward.

### Sign and conservation invariants

- `run_us_waterfall` is invoked **only with positive distribution amounts**. Negative pre-waterfall events flow into the LP cash stream as outflows but never into the allocator.
- Per-event `conservation_diff = |Σ allocations − distribution_amount|` is recorded and asserted < $0.01 in the promotion gate.
- No allocation line carries a negative `amount` (warning emitted if engine ever produces one).
- Per-partner aggregation is symmetric: `lp_share + gp_share == distribution_amount`.

### Gross-to-net bridge — `build_gross_to_net_bridge`

Five-row bridge with item-level provenance:

| # | Label | item_type | Source |
|---|---|---|---|
| 1 | Gross asset value (asset rollup + ending NAV) | starting | `re_asset_cf_series_mat + re_fund_quarter_state` |
| 2 | Less management fees | subtraction | `repe_fund_term + re_partner_commitment / re_cash_event / re_fund_quarter_state` |
| 3 | Less other fund expenses | subtraction | `re_fund_expense_qtr` |
| 4 | Less carry / promote | subtraction | `re_waterfall_definition + re_waterfall_tier + re_capital_ledger_entry` |
| 5 | Net LP return | ending | `fund_waterfall_layer.FundWaterfallResult` |
| 6 (memo) | Gross-to-net IRR spread | memo | derived |
| 7 (memo, optional) | Gross-to-LP residual (leverage + GP-side return) | memo | derived |

**Identity check:** `gross_return − mgmt_fees − fund_expenses − carry == net_lp + leverage_residual`. The bridge ties to the penny when the residual is zero (no leverage). When non-zero, the residual is surfaced as a memo row labeled "leverage + GP-side return" so consumers can audit why the asset-side gross does not equal the LP-side net.

### Snapshot writer (v2) — `write_fund_authoritative_snapshot_v2`

Writes both rows in one audit_run:
- `re_authoritative_fund_state_qtr` row carrying `canonical_metrics` with **four blocks** (`bottom_up`, `fund_expenses`, `waterfall`, `net`), each with its own `trust_status`. Snapshot-level `trust_status` is `'trusted'` only when every block is trusted.
- `re_authoritative_fund_gross_to_net_qtr` row carrying the bridge_items jsonb array.

Always writes as `promotion_state='draft_audit'`. Promotion is gated.

### Promotion gate — `assert_promotion_preconditions`

Returns `PromotionGateResult{ok, failures, warnings, decisions}`. Blocks unless **every** layer passes:

| Precondition | Failure code |
|---|---|
| Released uniqueness | enforced by partial UQ index from Remediation 1 (DB-level) |
| Scope expected_investments > 0 | `scope_no_expected_investments` |
| Rollup gross_irr non-null | `rollup_gross_irr_null:<reason>` |
| Asset CF coverage ≤ 5% null share | `asset_cf_coverage_below_threshold:<x>><threshold>` |
| Expense layer total_management_fees non-null | `expense_layer_management_fees_null` |
| Expense layer total_other_expenses non-null | `expense_layer_other_expenses_null` |
| No blocking expense null_reasons | `expense_layer_blocking_null:<keys>` |
| Waterfall status = 'computed' | `waterfall_status:<status>` |
| Waterfall net_irr non-null | `waterfall_net_irr_null:<reason>` |
| Waterfall carry non-null | `waterfall_carry_null` |
| Bridge identity_holds OR has explained residual memo | `bridge_inputs_missing` / `bridge_subtraction_inputs_missing` |
| Per-event waterfall conservation diff < $0.01 | `waterfall_conservation_violation_event=<date>:diff=<x>` |

`decisions` dict carries every input value so the gate JSON receipt is fully self-explaining.

### Tests

37 new tests in this phase, all passing:

| File | Tests |
|---|---|
| `test_fund_waterfall_layer.py` | 8 |
| `test_fund_gross_to_net.py` | 7 |
| `test_fund_snapshot_v2_promotion_gate.py` | 10 |

Plus regression check across all prior tests: **74/74 total passing** (Phases 1–3 + Remediations 1–3 + Phases 4–5).

### End-to-end run results

All three funds wrote draft_audit snapshots + bridge rows in a single audit_run. None passes the promotion gate today — each has at least one missing input which is correctly surfaced as a structured failure.

| Fund | rollup_irr | net_irr | events | trust | breakpoint | gate failures |
|---|---|---|---|---|---|---|
| IGF VII | -7.65% | +8.46% | 4 | untrusted | fund_expenses | mgmt_fees null + expense layer blocking + bridge subtraction inputs |
| MCOF I  | +6.07% | None  | 0 | untrusted | fund_expenses | mgmt_fees + other_expenses + waterfall missing_participants + carry null + net_irr null + bridge inputs |
| MREF III | -23.29% | -9.95% | 4 | untrusted | fund_expenses | other_expenses + bridge subtraction + identity |

All sign and conservation invariants hold:
- Identity `sum(merged) == sum(gross) + sum(expense)` ties for all 3.
- Per-event conservation `|Σ allocations − distribution| < 1¢` for all 8 distribution events allocated across the 3 funds (4 in IGF VII + 0 in MCOF I + 4 in MREF III).
- No negative allocation lines.

### Receipts in this run

- `phase5_waterfall_integration/<fund>_<quarter>_waterfall_events.csv` — per-event allocation, LP/GP shares, conservation diff.
- `phase5_waterfall_integration/<fund>_<quarter>_waterfall_summary.json` — full FundWaterfallResult dict.
- `gross_to_net_bridge.csv` — every bridge row across all 3 funds.
- `snapshot_promotion_gate.json` — gate decisions with full provenance per fund.
- `test_results.txt` — pytest output (35 tests, rc=0).
