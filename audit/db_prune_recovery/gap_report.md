# REPE DB Prune Recovery Gap Report

Generated: `2026-05-06T14:50:25.012337+00:00`

## Scope

- env_id: `a1b2c3d4-0001-0001-0003-000000000001`
- business_id: `a1b2c3d4-0001-0001-0001-000000000001`
- quarter: `2026Q2`
- classifications: `RUNTIME_ENV_MISMATCH`

## Phase 0A Runtime Comparison

| surface | status | env_id | business_id | quarter | fund_rows_length | diagnostics_length | url | error_body |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| direct_backend | 200 | a1b2c3d4-0001-0001-0003-000000000001 | a1b2c3d4-0001-0001-0001-000000000001 | 2026Q2 | 2 | 0 | http://127.0.0.1:8000/api/re/v2/environments/a1b2c3d4-0001-0001-0003-000000000001/fund-portfolio?quarter=2026Q2 | None |
| browser_or_next | 200 | a1b2c3d4-0001-0001-0003-000000000001 | b1b2c3d4-0001-0001-0001-000000000001 | 2026Q2 | 3 | 2 | http://localhost:3000/api/re/v2/environments/a1b2c3d4-0001-0001-0003-000000000001/fund-portfolio?quarter=2026Q2 | None |
| next_api | 200 | a1b2c3d4-0001-0001-0003-000000000001 | a1b2c3d4-0001-0001-0001-000000000001 | 2026Q2 | 2 | 0 | http://localhost:3000/bos/api/re/v2/environments/a1b2c3d4-0001-0001-0003-000000000001/fund-portfolio?quarter=2026Q2 | None |

## Inventory Counts

| label | count | error |
| --- | --- | --- |
| binding | 1 | None |
| funds | 2 | None |
| deals | 27 | None |
| assets | 40 | None |
| fund_auth_q_all | 22 | None |
| fund_auth_q_released | 2 | None |
| investment_auth_q_released | 22 | None |
| asset_auth_q_released | 1 | None |
| included_v_q | 2 | None |
| excluded_v | 0 | None |
| opportunities | 18 | None |
| signals | 33 | None |

## Table Existence

| table | exists |
| --- | --- |
| app.env_business_bindings | True |
| repe_fund | True |
| repe_deal | True |
| repe_asset | True |
| re_authoritative_snapshot_run | True |
| re_authoritative_fund_state_qtr | True |
| re_authoritative_investment_state_qtr | True |
| re_authoritative_asset_state_qtr | True |
| re_fund_portfolio_included_v | True |
| re_fund_portfolio_excluded_v | True |
| repe_opportunities | True |
| repe_signals | True |
| repe_opportunity_signal_links | True |
| repe_opportunity_model_runs | True |

## Fund Snapshot States

| quarter | promotion_state | count |
| --- | --- | --- |
| 2024Q1 | released | 1 |
| 2024Q1 | verified | 1 |
| 2024Q2 | released | 1 |
| 2024Q2 | verified | 1 |
| 2024Q3 | released | 1 |
| 2024Q3 | verified | 1 |
| 2024Q4 | released | 2 |
| 2025Q1 | released | 2 |
| 2025Q2 | released | 2 |
| 2025Q3 | released | 2 |
| 2025Q4 | released | 2 |
| 2025Q4 | superseded | 2 |
| 2025Q4 | verified | 14 |
| 2026Q1 | released | 2 |
| 2026Q2 | draft_audit | 2 |
| 2026Q2 | released | 2 |
| 2026Q2 | superseded | 6 |
| 2026Q2 | verified | 12 |
| 2026Q3 | released | 2 |
| 2026Q4 | released | 2 |

## Funds

| fund_id | name | status |
| --- | --- | --- |
| a1b2c3d4-0003-0030-0001-000000000001 | Institutional Growth Fund VII | investing |
| a1b2c3d4-0001-0010-0001-000000000001 | Meridian Real Estate Fund III | harvesting |

## Recovery Decision

Do not run seed recovery unless this report classifies the issue as `DATA_DELETED`
for the target runtime. If direct backend returns released fund rows while the
browser/Next surface is empty, treat it as `RUNTIME_ENV_MISMATCH`, `PROXY_GAP`,
`PERIOD_MISMATCH`, or `ROUTE_FAILURE` and fix the runtime path first.
