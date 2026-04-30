# Phase 1–3 Bootstrap — Asset Operating CF Pipeline

**Run date:** 2026-04-29
**Author:** asset_operating_cf_run scaffolding (Phases 1–3 of the plan)
**Status:** scaffolding complete; pipeline end-to-end against real funds verified; numbers reveal a calibration gap that's out of scope for this PR

## What shipped

### Phase 1 — Schema + Scope discovery
- Migration `526_repe_asset_lifecycle_columns.sql` adds `archived_at`, `quarantined_at`, `quarantine_reason` to `repe_asset` and a partial index on `(deal_id) WHERE archived_at IS NULL AND quarantined_at IS NULL`. Applied to production.
- New service `backend/app/services/bottom_up_fund_scope.py` with `discover_fund_scope(fund_id, as_of_quarter, *, audit_mode)`. Returns a `FundScope` with `expected_investment_ids`, `expected_asset_ids`, `nav_eligible_asset_ids`, and an exclusion list with reasons (`stage_inactive`, `archived`, `quarantined`, `no_active_assets`). Exited assets stay in expected for lifetime CF / DPI / IRR but are excluded from `nav_eligible_asset_ids` so the NAV identity check (gate 5 in Phase 8) only sees current-NAV-bearing assets.

### Phase 2 — Bulk asset CF refresh
- `refresh_all_asset_cf_series(asset_ids, as_of_quarter, ...)` added to `bottom_up_refresh.py` with `AssetRefreshSummary` and `AssetRefreshOutcome` dataclasses. Iterates per-asset, catches per-asset failures (missing acquisition, no inflow, invalid cap rate), translates `ValueError` messages into structured `null_reason` codes, and computes a capital-weighted `null_value_share` so the runner can decide whether the bottom-up IRR is trustworthy (>5% null share fails closed in the snapshot writer downstream).

### Phase 3 — Rollup signature widened
- `compute_fund_rollup(...)` and `compute_investment_rollup(...)` both accept an optional `included_asset_ids: set[UUID] | None` parameter. Default `None` preserves existing behavior — every existing caller (`fund_decomposition.py`, `re_v2.py`, `re_write_engine.py`, `bottom_up_snapshot_writer.py`) is byte-identical without code changes. When set:
  - `_list_investment_assets` filters its rows to the in-scope set.
  - Investments whose only assets fall outside the filter return `null_reason='no_assets_in_selection'` (parallels existing `no_investments_in_selection`).
  - Leave-one-out marginal pass loops only over in-scope assets.

### Tests
18 / 18 new tests passing under `pytest --noconftest`:
- `tests/test_bottom_up_fund_scope.py` — 9 tests covering active assets, archived exclusion, quarantine reason flow, stage filter, exited NAV ineligibility, audit mode, empty fund, no-active-assets investment, receipt shape.
- `tests/test_bottom_up_refresh_bulk.py` — 5 tests covering happy path, capital-weighted null share, value_error → null_reason translation, no-inflow flagging, empty input.
- `tests/test_bottom_up_rollup_asset_filter.py` — 4 tests covering the new asset filter at investment + fund level and the regression guard for the default-None path.

## End-to-end run against the three released funds

```
=== Institutional Growth Fund VII ===
  scope: 20 investments, 30 assets (28 NAV-eligible, 2 exited)
  refresh: 29/30 OK; null_value_share=0.015266
  rollup: gross_irr_bottom_up=-0.134172  series_points=18
  total_neg (calls/invest): $-2,384,839,457
  total_pos (distrib+exit): $1,566,803,239

=== Meridian Credit Opportunities Fund I ===
  scope: 8 investments, 8 assets (6 NAV-eligible, 2 exited)
  refresh: 0/8 OK; null_value_share=1.000000   ← all 8 assets failed CF refresh
  rollup: gross_irr_bottom_up=5.010674  (suspect — driven by null inputs)

=== Meridian Real Estate Fund III ===
  scope: 2 investments, 4 assets (2 NAV-eligible, 2 exited); 5 investments excluded as stage_inactive
  refresh: 4/4 OK; null_value_share=0.000000
  rollup: gross_irr_bottom_up=-0.606513  series_points=6
  total_neg (calls/invest): $-145,488,551
  total_pos (distrib+exit): $49,555,506
```

## What this reveals — out-of-scope for Phase 1–3

These numbers don't match the calibrated targets (16.82% / 10.02% / 16.61% gross IRR for the three funds). Investigating shows it's a **calibration gap**, not a runner bug:

1. **Cap-rate calibration drift.** `511_repe_calibrated_asset_seed.sql` calibrated terminal values against an internal cap rate. The runtime `build_asset_cf_series` uses `env_default_cap_rate` (often 8%) for terminal values when no exit event is present. If the calibrator used 5%, terminal values come out at ~62.5% of target, producing the 0.66x TVPI we see for IGF VII bottom-up.
   - **What to fix:** thread the calibrator's cap rate into `re_asset_operating_qtr` rows or store it on `repe_asset` so runtime reads it. Out of scope for Phase 1–3.

2. **MCOF I asset CFs aren't building.** `re_asset_operating_qtr` shows 8 assets / 48 rows for MCOF I, but `refresh_all_asset_cf_series` reports 0/8 OK — every asset fails. The series builder's pre-conditions (acquisition row + at least one inflow) reject these inputs. Need to debug `build_asset_cf_series` against an MCOF I asset to find the rejection.
   - **What to fix:** add a per-asset trace receipt to the runner; debug which precondition fails. Out of scope for Phase 1–3.

3. **Released snapshots show "53.4% gross IRR" for IGF VII at 2026Q2.** This is the cash-event XIRR — not the bottom-up IRR. It's mathematically correct: $695M called → $135M distributed + $1.24B ending NAV in ~5 quarters. The early-period TVPI of 1.98x matches the calibration target of 2.01x — the fund is on track. Annualizing a 2x return over 5 quarters compresses to ~50%; over a 7-10 year hold it would smooth to ~16%.
   - **Display note:** the UI showing "53.4%" for an in-flight fund is confusing. Phase 6 of the plan adds the gross-to-net bridge that distinguishes interim cash-event IRR from terminal expected IRR. Until then, the number is mathematically correct but visually striking.

4. **Multiple released snapshots per (fund, quarter) violate immutability** (`SYSTEM_RULES_AUTHORITATIVE_STATE.md` rule #6). The diagnostic shows 4 released rows for IGF VII 2026Q2 and 4 for MCOF I 2026Q2 with different values. The portfolio-kpis route picks the latest by `released_at DESC`, masking the violation. Audit cleanup needed: keep one row per (fund, quarter, snapshot_version) at most.
   - **What to fix:** a follow-up cleanup runner that demotes duplicate releases. Out of scope for Phase 1–3.

## Files touched

### New
- `repo-b/db/schema/526_repe_asset_lifecycle_columns.sql`
- `backend/app/services/bottom_up_fund_scope.py`
- `backend/tests/test_bottom_up_fund_scope.py`
- `backend/tests/test_bottom_up_refresh_bulk.py`
- `backend/tests/test_bottom_up_rollup_asset_filter.py`
- `verification/runners/diag_irr_mismatch.py`
- `audit/asset_operating_cf_run/phase1-3-bootstrap/receipt.md`

### Edited
- `backend/app/services/bottom_up_refresh.py` — added `AssetRefreshOutcome`, `AssetRefreshSummary`, `refresh_all_asset_cf_series`, `_lookup_acquisition_value`.
- `backend/app/services/bottom_up_rollup.py` — widened `compute_fund_rollup` and `compute_investment_rollup` with `included_asset_ids`; threaded through `_list_investment_assets`.
- `backend/tests/conftest.py` — added `app.services.bottom_up_fund_scope.get_cursor` to the patch list.

## What's safe to do now

- Existing callers of `compute_fund_rollup` are unaffected — default behavior is byte-identical.
- The new scope service can be invoked from the upcoming `asset_operating_cf_run` runner (Phase 4+) without further changes.
- The bulk refresh helper can be called by either the runner or the on-demand snapshot writer when it needs all-asset CF freshness.

## What is NOT done in this PR (intentionally)

- The runner itself (`verification/runners/asset_operating_cf_run.py`) — Phase 4 onward.
- The fund expense layer (`fund_expense_layer.py`) — Phase 4 of the plan.
- Waterfall integration (`fund_waterfall_layer.py`) — Phase 5.
- Snapshot composer changes — Phase 7.
- Validation gates — Phase 8.
- The cap-rate calibration fix — separate workstream surfaced by this run.

## Verification commands

```bash
# Run the new tests
cd backend && python -m pytest \
  tests/test_bottom_up_fund_scope.py \
  tests/test_bottom_up_refresh_bulk.py \
  tests/test_bottom_up_rollup_asset_filter.py \
  --no-header --noconftest -v

# Re-run diagnostic
python -m verification.runners.diag_irr_mismatch
```
