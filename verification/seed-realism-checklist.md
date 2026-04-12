# Seed Realism Checklist

Every seeded asset must pass all applicable checks before the seed migration is considered complete. This checklist exists because the INV-5 sprint proved that "plausible at the fund level, nonsense at the asset level" is the exact failure mode that causes months of debugging.

## Per-Asset Checks

| # | Check | Required | Notes |
|---|---|---|---|
| 1 | Market present and geocoded correctly | YES | `repe_property_asset.city`, `state`, `latitude`, `longitude` must be populated. Lat/lon must be in the correct US metro (not Europe, not ocean). |
| 2 | Property type realistic for strategy | YES | Equity fund → multifamily, industrial, office, retail, mixed-use. Credit fund → same but with loan-level data. No property_type = NULL on active assets. |
| 3 | Entry date before exit date | YES | `repe_asset.acquisition_date < re_asset_realization.sale_date`. No time travel. |
| 4 | NOI sign consistent with occupancy and revenue | YES | If `occupancy > 0.5` and `revenue > 0`, then `noi > 0` (unless capex/debt service exceeds income, which must be flagged). |
| 5 | Negative NAV only allowed with explicit distress flag | YES | If `re_asset_quarter_state.nav < 0`, the asset must have `asset_status = 'distressed'` or `data_status = 'write_down'` or a documented reason in `value_reason`. No unexplained negative NAV. |
| 6 | Debt terms present for leveraged assets | YES | If the fund strategy involves leverage, every active asset must have a `re_loan` record with `interest_rate`, `maturity_date`, `current_balance`. |
| 7 | Realization record required for exited assets | YES | If `repe_asset.asset_status = 'exited'` or `'disposed'`, a matching `re_asset_realization` row must exist with `sale_price`, `sale_date`, `net_proceeds`. |
| 8 | Fund-level cash events tie to deal/asset events | YES | `SUM(re_cash_event WHERE event_type='DIST')` for a fund must be explainable by the sum of `re_asset_realization.net_proceeds` for exited assets plus cumulative income distributions from operating assets. Tolerance: 5%. |

## Per-Fund Checks

| # | Check | Required |
|---|---|---|
| 9 | `total_called <= total_committed` | YES — overcall is a seed defect unless explicitly modeled as a credit facility |
| 10 | `TVPI = (total_distributed + ending_nav) / total_called` within 1bp | YES |
| 11 | `DPI + RVPI = TVPI` within 1bp | YES |
| 12 | Gross IRR sign consistent with TVPI | YES — TVPI > 1.0 implies positive IRR; TVPI < 1.0 implies negative IRR |
| 13 | Net IRR null when no waterfall is defined | YES (Patch B) |
| 14 | Deal count realistic for fund size | SOFT — $500M fund should have 5-12 deals, not 2 |
| 15 | Asset count realistic for deal count | SOFT — each deal should have 1-5 assets |

## Per-Snapshot Checks

| # | Check | Required |
|---|---|---|
| 16 | `promotion_state = 'released'` for the latest snapshot | YES |
| 17 | `snapshot_version` unique and timestamped | YES |
| 18 | `ending_nav` matches sum of asset-level NAV (within 1%) | YES — scope must be complete |
| 19 | `beginning_nav = prior_period.ending_nav` | YES (NF-3 fix) |
| 20 | All investment IDs in SELECTED_INVESTMENT_IDS | YES — no partial-scope snapshots |

## Enforcement

- This checklist is checked manually for each seed migration PR.
- A future automated version will run as a SQL function (`re_check_seed_realism()`) callable from CI.
- Violations are blocking — no seed lands with unexplained failures.
