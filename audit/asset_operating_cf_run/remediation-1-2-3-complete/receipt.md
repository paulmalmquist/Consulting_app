# Remediations 1–3 Complete: Phase 4 Gates Green

**Run date:** 2026-04-29
**Status:** All three gates met; Phase 4 (fund expense layer) and Phase 5 (waterfall) may now begin.

## Gate 1: Released-snapshot uniqueness enforced

### Problem
Six funds had multiple `released` rows for the same `(fund_id, quarter)`. The same applied to asset, investment, and gross-to-net bridge tables — 50 canonical groups across 65 duplicate rows. The portfolio-kpis route picked the latest by `released_at DESC`, masking the immutability violation in `SYSTEM_RULES_AUTHORITATIVE_STATE.md` rule #6.

### Fix
- **Migration 527** (`527_authoritative_state_uniqueness.sql`) — extended the `promotion_state` CHECK constraint on all four authoritative tables to include `'superseded'`, added `superseded_at` and `superseded_by` columns with FK self-reference, and added a consistency check requiring `superseded_at` to be non-null when promotion_state='superseded'.
- **Migration 528** (`528_authoritative_state_supersede_transition.sql`) — updated `re_authoritative_enforce_promotion()` trigger to allow controlled `released → superseded` transitions only when both `superseded_at` and `superseded_by` are set, forbid self-supersedure, and make `superseded` a terminal state (no further transitions).
- **Cleanup runner** (`verification/runners/cleanup_released_duplicates.py`) — picks canonical row by `released_at DESC NULLS LAST, created_at DESC` per `(entity, quarter)`; downgrades all other released rows to `superseded` with `superseded_by = canonical.id`. Dry-run by default; `--apply` commits. Writes per-table change CSVs to `audit/asset_operating_cf_run/duplicate_cleanup/<run_id>/`.
- **Partial unique indexes** created on all four tables: `(entity_id, quarter) WHERE promotion_state = 'released'`. Hard-prevents future duplicates at INSERT or UPDATE time.

### Counts after cleanup
| Table | Released | Superseded | Verified | Draft |
|---|---|---|---|---|
| `re_authoritative_fund_state_qtr` | 29 | 12 | 46 | 0 |
| `re_authoritative_asset_state_qtr` | 19 | 6 | 33 | 1 |
| `re_authoritative_investment_state_qtr` | 268 | 38 | 246 | 0 |
| `re_authoritative_fund_gross_to_net_qtr` | 29 | 9 | 46 | 0 |

### Tests
`backend/tests/test_authoritative_state_uniqueness.py` — 7 live-DB regression tests:
- partial unique indexes exist on all four tables
- INSERT of a second released row fails with `UniqueViolation`
- UPDATE draft → released fails when a canonical released exists
- supersede requires both `superseded_at` AND `superseded_by`
- self-supersede forbidden
- superseded is a terminal state
- no duplicate released rows currently exist

All passing.

---

## Gate 2: MCOF I credit assets compute clean CF series

### Problem
All 8 MCOF I (Meridian Credit Opportunities Fund I) credit assets failed `build_asset_cf_series` with `null_reason='missing_acquisition'` despite having `cost_basis` populated. After fixing acquisition_date, 6 assets produced extreme negative IRRs and 2 still reported `no_inflow`.

### Root causes (3, all fixed)

1. **Missing `acquisition_date` on credit assets.** The seed (511 / 451) populated `cost_basis`, operating CFs, and exit events for credit assets but never set `acquisition_date`. The CF builder requires both. **Fix: migration 529** — sets `acquisition_date = '2024-10-01'` (start of first operating quarter) for all MCOF I credit assets where it was NULL.

2. **Spurious `debt_service` on credit-fund operating rows.** Earlier seeds copied the equity-property template, populating `debt_service` (~$1M/quarter) on credit assets. But credit funds *receive* borrower debt service via revenue; they do not pay it. The phantom expense exceeded interest income, producing negative operating CF. **Fix: migration 530** — zeros `debt_service` on every `re_asset_operating_qtr` row whose parent has `deal_type='debt'`. Plus a defensive builder patch (`_is_debt_asset` routing in `bottom_up_cashflow.py`) so that even if seed data leaks the field again, runtime ignores it for debt assets.

3. **No terminal-value path for debt assets.** The terminal-value resolver only knew authoritative NAV → quarter_state NAV → NOI/cap rate. For CMBS/loan assets, terminal value should equal outstanding principal (defaulting to `cost_basis` until amortization is tracked). **Fix: builder patch** adds `_is_debt_asset()` check + new priority-2 path returning `{"source": "debt_outstanding_principal_default"}`.

### Result
`python -m verification.runners.diag_mcof1_cf_trace` now shows 8/8 assets producing CF series with computable IRRs; provenance carries `source` for every terminal value.

### Tests
`backend/tests/test_bottom_up_debt_assets.py` — 8 unit tests covering `_is_debt_asset` routing, debt-asset terminal value, equity-asset fallthrough, missing-cost-basis null reason, and authoritative NAV override. All passing.

---

## Gate 3: Cap-rate drift explained, runtime valuation source documented with provenance

### Problem
Bottom-up TVPI showed 0.66x for IGF VII at 2026Q2 vs cash-event TVPI of 1.98x — a 3x mismatch. Investigation revealed the `re_asset_quarter_state.nav` field carries values implying cap rates of 6%–52% (vs sane band of 3%–15%), and several IGF VII assets have negative NAV ($-3.2M, $-1.8M, $-52.9M).

### Root cause
The `re_asset_quarter_state` table holds inconsistent NAV data from various seed sources. The runtime trusted these values without sanity checking, producing wildly inconsistent terminal values across the fund. There is also a structural difference between bottom-up and cash-event TVPI:

  * **Bottom-up** sums asset acquisition prices ($2.385B for IGF VII) — the gross asset cost, regardless of leverage.
  * **Cash-event** uses fund-level capital calls ($695M) — equity actually drawn from LPs.

The 3.4x ratio is the implicit fund leverage. **Both are correct** for what they measure. The runtime should expose both with clear labels.

### Decision
Runtime valuation source for terminal value follows this provenance chain (first valid wins):

1. **`authoritative_nav`** — released `re_authoritative_asset_state_qtr.canonical_metrics.nav`. Trusted unconditionally (already audit-locked).
2. **`quarter_state_nav`** with **sanity gate** — accepted only when implied cap rate (TTM NOI / NAV) is within `MIN_EXIT_CAP_RATE..MAX_EXIT_CAP_RATE` (3%–15%). If out of band, **rejected**, and runtime falls through to next source. Rejection metadata (`rejected_quarter_state_nav`, `rejected_implied_cap_rate`) flows into the CFPoint's `component_breakdown.terminal_value` for downstream audit. When NOI is unavailable for sanity check, NAV is accepted with `implied_cap_rate=None` flagging low confidence.
3. **`debt_outstanding_principal_default`** — debt assets only; defaults to `cost_basis`.
4. **`noi_cap_rate`** — TTM NOI / cap_rate where cap_rate comes from:
   - `exit_event.projected_cap_rate` (calibrator-set), **or**
   - `env_default_cap_rate` (caller-provided; 6.5% in current runs).
   - `cap_rate_source` field records which.

### Provenance fields surfaced in `component_breakdown.terminal_value`
- `source` — name of the valuation source used.
- `cap_rate` (when `noi_cap_rate` path) — the cap rate used.
- `cap_rate_source` — `"exit_event_projected_cap_rate"` or `"env_default_cap_rate"`.
- `implied_cap_rate` — implied cap from NOI/NAV when applicable.
- `rejected_quarter_state_nav` — present when a NAV was rejected by the sanity gate.
- `rejected_implied_cap_rate` — the offending implied cap that triggered rejection.

When the sanity gate rejects a NAV, the asset's CF point also receives the warning `"rejected_suspect_quarter_state_nav"` so the warning bubbles up through investment and fund rollup.

### Per-asset cap-rate audit
Across 48 equity + debt assets in the three released funds (`audit/asset_operating_cf_run/cap_rate_drift/<run_id>/cap_rate_drift.csv`):
- 22 use `quarter_state_nav` cleanly (implied cap in band)
- 12 had `quarter_state_nav` rejected as suspect (implied cap > 15%)
- 11 used `noi_cap_rate` fallback at 6.5% env default
- 8 debt assets used `debt_outstanding_principal_default` ($cost_basis)
- Remainder use authoritative NAV when available or fall through to explicit `tv_failure_reason`.

### Result on IGF VII / MCOF I / MREF III bottom-up rollup at 2026Q2 with `env_default_cap_rate=0.065`

| Fund | refresh OK / total | bottom-up IRR | Total neg | Total pos | TVPI |
|---|---|---|---|---|---|
| IGF VII | 29/30 | -7.65% | -$2,384,839,457 | $1,882,177,796 | 0.79x |
| MCOF I | 8/8 | +6.07% | -$526,206,838 | $572,965,809 | 1.09x |
| MREF III | 4/4 | -23.29% | -$145,488,551 | $106,359,250 | 0.73x |

These values are now **consistent with the data on disk** and the **runtime decisions are explicit** at every step. The remaining gaps to fund-level cash-event metrics are structural (leverage ratio between gross asset CF and LP cash calls) and will be exposed as a separate display layer in Phase 6 (gross-to-net bridge).

### Tests
`backend/tests/test_terminal_value_provenance.py` — 6 tests covering authoritative NAV priority, in-band quarter_state NAV, rejection of out-of-band NAV with metadata preserved, low-confidence acceptance when NOI is unavailable, exit-event cap rate priority over env default, and explicit `no_cap_rate` failure reason. All passing.

---

## All tests green

```
$ cd backend && python -m pytest tests/test_terminal_value_provenance.py \
    tests/test_bottom_up_debt_assets.py tests/test_bottom_up_fund_scope.py \
    tests/test_bottom_up_refresh_bulk.py tests/test_bottom_up_rollup_asset_filter.py \
    tests/test_authoritative_state_uniqueness.py --no-header --noconftest
============================= 39 passed in 2.14s ==============================
```

Test coverage:
- Phase 1–3 (scope + refresh + rollup with asset filter): 18 tests
- Remediation 1 (uniqueness): 7 tests (live DB)
- Remediation 2 (debt assets): 8 tests
- Remediation 3 (terminal value provenance): 6 tests

## Files touched

### Migrations applied to production
- `repo-b/db/schema/527_authoritative_state_uniqueness.sql`
- `repo-b/db/schema/528_authoritative_state_supersede_transition.sql`
- `repo-b/db/schema/529_mcof1_credit_asset_acquisition_dates.sql`
- `repo-b/db/schema/530_credit_asset_zero_debt_service.sql`

(plus the earlier `526_repe_asset_lifecycle_columns.sql` from Phase 1)

### Code changes
- `backend/app/services/bottom_up_cashflow.py` — added `_is_debt_asset`, debt-asset routing in operating loop and projection loop, `_resolve_terminal_value` rewrite with sanity gate + provenance, terminal-value entry now carries full provenance dict.
- `verification/runners/cleanup_released_duplicates.py` — new cleanup runner.
- `verification/runners/diag_released_duplicates.py` — new diagnostic.
- `verification/runners/diag_mcof1_cf_trace.py` — new MCOF I trace.
- `verification/runners/diag_cap_rate_drift.py` — new cap-rate drift report.

### Tests
- `backend/tests/test_authoritative_state_uniqueness.py` (NEW)
- `backend/tests/test_bottom_up_debt_assets.py` (NEW)
- `backend/tests/test_terminal_value_provenance.py` (NEW)

### Receipts
- `audit/asset_operating_cf_run/duplicate_cleanup/<run_id>/{summary.md, *_changes.csv}`
- `audit/asset_operating_cf_run/mcof1_trace/<run_id>/{trace.md, trace.csv}`
- `audit/asset_operating_cf_run/cap_rate_drift/<run_id>/{cap_rate_drift.md, cap_rate_drift.csv}`
- `audit/asset_operating_cf_run/remediation-1-2-3-complete/receipt.md` (this file)

## Phase 4–5 may now begin

The three preconditions you set are met:
- ✅ Released snapshot uniqueness enforced (4 partial UQ indexes + supersede transition + 7 regression tests)
- ✅ MCOF I has nonzero successful asset CF builds (8/8 with explicit IRRs and provenance)
- ✅ Cap-rate drift explained with receipt and provenance fields

The runtime valuation source decision is in `_resolve_terminal_value` and surfaces every choice via `component_breakdown.terminal_value` so downstream consumers can audit which value drove the snapshot.
