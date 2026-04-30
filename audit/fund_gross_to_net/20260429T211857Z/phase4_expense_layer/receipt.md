# Phase 4 — Fund Expense Layer

**Run:** `20260429T211857Z`  **Date:** 2026-04-29  **Quarter:** 2026Q2

## What shipped

Deterministic, audit-grade fund-level expense schedule with per-line provenance and fail-closed null_reasons. **No silent zero substitutions anywhere.**

### Service

[`backend/app/services/fund_expense_layer.py`](../../../backend/app/services/fund_expense_layer.py) exposes:

- `compute_fund_expense_schedule(fund_id, as_of_quarter, *, env_id=None, business_id=None)` — composes the full lifetime schedule from inception (or `repe_fund_term.effective_from`, whichever is later) through `as_of_quarter`.
- `compose_pre_waterfall_cf(*, fund_gross_cf, expense_schedule)` — merges the asset rollup CF with the expense CF and asserts the identity `sum(merged) == sum(gross) + sum(expense)`.

### Inputs (all read-only)

| Source | Used for |
|---|---|
| `repe_fund_term` | canonical management fee rate, basis, effective range |
| `re_fee_policy` | optional step-down rate / step-down date |
| `re_partner_commitment` | COMMITTED basis amount |
| `re_cash_event` (event_type='CALL') | CALLED basis amount (alias `invested`) |
| `re_fund_quarter_state` | NAV basis amount |
| `re_fund_expense_qtr` | other expense lines (admin, audit, legal, tax, financing, organizational, other) |

### Management fee logic

- Bases supported: `COMMITTED`, `CALLED`, `NAV` plus aliases (`invested` → CALLED, `fair_value` → NAV).
- Step-down: `re_fee_policy.stepdown_rate` replaces `repe_fund_term.management_fee_rate` once `as_of >= stepdown_date`.
- Effective ranges: quarters before `effective_from` get `null_reason='quarter_predates_fund_term_effective_from'` (informational, not blocking). Quarters after `effective_to` get `quarter_after_fund_term_effective_to`.
- Fee holiday: any quarter outside effective range, or with no active term, fails closed without zero-substitution.

### Fail-closed contract proven

| Missing input | Behavior |
|---|---|
| No `repe_fund_term` for any quarter in window | top-level `null_reasons={"fund_term": "no_in_term_quarters_in_window", "fund_expense_layer": "no_in_term_quarters_in_window"}` |
| No `re_partner_commitment` for COMMITTED basis | per-quarter line `null_reason="missing_committed_basis_no_partner_commitments"`; `total_management_fees=None`; top-level `null_reasons["management_fee"]="partial_management_fee_nulls_in_term"` |
| No `re_cash_event` for CALLED basis | `null_reason="missing_called_basis_no_capital_calls"` |
| No `re_fund_quarter_state` for NAV basis | `null_reason="missing_nav_basis_no_quarter_state"` |
| Zero `re_fund_expense_qtr` rows | top-level `null_reasons["fund_expense_layer"]="no_other_expense_rows_in_re_fund_expense_qtr"`; `total_other_expenses=None` |

`has_blocking_nulls` is the single boolean callers consult to decide whether the schedule can proceed to the waterfall layer. **It is True whenever any of the above fail-closed reasons is set.** It is False whenever pre/post-term informational nulls are the only ones present.

### Per-line provenance

Each `FundExpenseLine` carries:
- `kind` — `management_fee` | `fund_admin` | `audit` | `legal` | `tax` | `financing` | `organizational` | `other_fund_expense`
- `amount` (Decimal | None) and `null_reason` (str | None) — never both populated, never both null
- `currency`
- `source_table` and `source_id`
- `formula_key` (e.g., `"mgmt_fee = basis_amount * annual_rate / 4 [rate_source=repe_fund_term]"`)
- `basis`, `basis_amount`, `rate` (when applicable)
- `warnings` (e.g., `expense_type_null_classified_as_other`)

### Aggregate tie-out

- `total_management_fees` is the sum of resolved (`amount is not None`) management_fee lines, **None** when any in-term quarter is null.
- `total_other_expenses` is the sum of resolved non-management lines, **None** when no other-expense rows exist.
- `total_expenses = total_management_fees + total_other_expenses` (None if either is None).
- `expense_cf_hash` is a deterministic SHA-256 over the line set; identical inputs always produce the same hash.

### compose_pre_waterfall_cf identity

The merged CF series satisfies `sum(merged) == sum(fund_gross_cf) + sum(expense_schedule.cf_points)` to the penny on every test fixture and on real funds:
- IGF VII: `identity_ok=True`
- MCOF I:  `identity_ok=True`
- MREF III: `identity_ok=True`

### Tests

[`backend/tests/test_fund_expense_layer.py`](../../../backend/tests/test_fund_expense_layer.py) — **10/10 passing**:
1. `test_normalize_basis_supports_aliases`
2. `test_committed_basis_simple_fee_accrual`
3. `test_called_basis_alias_invested_resolves_correctly`
4. `test_stepdown_applies_after_stepdown_date`
5. `test_missing_fund_term_for_all_quarters_fails_closed`
6. `test_missing_committed_basis_partner_commitments_fails_closed`
7. `test_missing_other_expense_rows_blocks_net_metrics`
8. `test_no_silent_zero_in_any_line_amount`
9. `test_compose_pre_waterfall_cf_identity_holds`
10. `test_compose_pre_waterfall_cf_propagates_null_reasons`

### End-to-end behavior on the three released funds

| Fund | mgmt_fees | other_expenses | total | top-level null_reasons |
|---|---|---|---|---|
| IGF VII | None (12 quarters of in-term `missing_committed_basis` because partner commitments only exist 2024+) | $352,000 | None | `{"management_fee": "partial_management_fee_nulls_in_term"}` |
| MCOF I  | $2,387,500 (CALLED basis, 1.0%) | None (no other-expense rows) | None | `{"fund_expense_layer": "no_other_expense_rows_in_re_fund_expense_qtr"}` |
| MREF III | $3,750,000 (COMMITTED basis, 1.5%) | None (no other-expense rows) | None | `{"fund_expense_layer": "no_other_expense_rows_in_re_fund_expense_qtr"}` |

These are real data state issues surfaced by the fail-closed contract, not bugs in the schedule. The user's principle: "missing required input must produce a null_reason, not a guessed value." Fixing the underlying seed data is a separate workstream.

### Receipts in this run

- `phase4_expense_layer/<fund>_<quarter>_expense_lines.csv` — every line with provenance.
- `phase4_expense_layer/<fund>_<quarter>_expense_summary.json` — schedule metadata + identity check.
