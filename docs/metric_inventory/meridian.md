# Meridian Metric Inventory

- Business ID: `a1b2c3d4-0001-0001-0001-000000000001`
- Environment ID: `a1b2c3d4-0001-0001-0003-000000000001`
- Generated At: `2026-04-08 12:48:33.299941+00:00`
- Inventory Hash: `132a93dd441f5acf`

## Summary

- Declared metric count: 39
- Executable metric count: 43
- Meridian askable count: 7
- Drift issue count: 28

## Platform Metrics

### capital

| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |
|---|---|---|---|---|---|---|---|---|
| active_asset_count | repe.count_assets | portfolio | fund, market, property_type | status | summary, filter | n/a | fund | drifted |
| asset_count | repe.count_assets | portfolio | status | status | summary, filter, detail | summary, filter, detail | fund | meridian_askable |
| fund_count | re_env_portfolio.get_portfolio_kpis | portfolio | quarter | quarter | summary | n/a | portfolio_quarter | executable |
| portfolio_nav | re_env_portfolio.get_portfolio_kpis | portfolio_quarter | quarter | quarter | summary | n/a | fund_quarter | executable |
| total_commitments | re_env_portfolio.get_portfolio_kpis | portfolio | fund, quarter | fund, quarter | summary, breakout | summary, breakout | fund | meridian_askable |

### cash_flow

| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |
|---|---|---|---|---|---|---|---|---|
| capex | acct_normalized_noi_monthly.CAPEX | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| debt_service_int | acct_normalized_noi_monthly.DEBT_SERVICE_INT | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| debt_service_prin | acct_normalized_noi_monthly.DEBT_SERVICE_PRIN | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| leasing_commissions | acct_normalized_noi_monthly.LEASING_COMMISSIONS | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| net_cash_flow | acct_normalized_noi_monthly.NET_CASH_FLOW | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| replacement_reserves | acct_normalized_noi_monthly.REPLACEMENT_RESERVES | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| tenant_improvements | acct_normalized_noi_monthly.TENANT_IMPROVEMENTS | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| total_debt_service | acct_normalized_noi_monthly.TOTAL_DEBT_SERVICE | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |

### income

| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |
|---|---|---|---|---|---|---|---|---|
| egi | acct_normalized_noi_monthly.EGI | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| insurance | acct_normalized_noi_monthly.INSURANCE | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| mgmt_fees | acct_normalized_noi_monthly.MGMT_FEES | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| noi | re_asset_quarter_state.noi | asset_quarter | fund, market, property_type, quarter | fund, market, property_type, quarter | list, rank, summary | n/a | asset_quarter | executable |
| noi_margin | acct_normalized_noi_monthly.NOI_MARGIN | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| other_income | acct_normalized_noi_monthly.OTHER_INCOME | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| payroll | acct_normalized_noi_monthly.PAYROLL | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| rent | acct_normalized_noi_monthly.RENT | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| repairs_maint | acct_normalized_noi_monthly.REPAIRS_MAINT | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| taxes | acct_normalized_noi_monthly.TAXES | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| total_opex | acct_normalized_noi_monthly.TOTAL_OPEX | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |
| utilities | acct_normalized_noi_monthly.UTILITIES | asset_period | fund, market, property_type, quarter | n/a | summary | n/a | asset_quarter | drifted |

### inventory

| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |
|---|---|---|---|---|---|---|---|---|
| fund_list | repe.list_funds | fund | n/a | n/a | list, summary | list, summary | n/a | meridian_askable |

### leverage

| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |
|---|---|---|---|---|---|---|---|---|
| debt_yield | re_asset_quarter_state.debt_balance | asset_quarter | fund, market, property_type, quarter | n/a | summary | n/a | asset_latest | drifted |
| dscr | re_loan_detail.dscr | asset_latest | fund, market, property_type, quarter | fund, market, property_type | list, rank | n/a | n/a | drifted |
| ltv | re_loan_detail.ltv | asset_latest | fund, market, property_type, quarter | fund, market, property_type | list, rank | n/a | n/a | drifted |
| weighted_dscr | re_fund_quarter_state.weighted_dscr | fund_quarter | quarter | n/a | summary | n/a | portfolio_quarter | drifted |
| weighted_ltv | re_fund_quarter_state.weighted_ltv | fund_quarter | quarter | n/a | summary | n/a | portfolio_quarter | drifted |

### occupancy

| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |
|---|---|---|---|---|---|---|---|---|
| avg_rent | re_asset_occupancy_quarter.avg_rent | asset_quarter | fund, market, property_type, quarter | n/a | summary | n/a | asset_latest | drifted |
| occupancy | repe_property_asset.occupancy | asset_latest | fund, market, property_type, quarter | fund, market, property_type | list, rank | filter | n/a | meridian_askable |

### operations

| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |
|---|---|---|---|---|---|---|---|---|
| noi_variance | finance.noi_variance | asset_quarter | n/a | n/a | rank, filter | rank, filter | asset_latest | meridian_askable |

### returns

| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |
|---|---|---|---|---|---|---|---|---|
| dpi | re_fund_quarter_state | fund_quarter | quarter, strategy, vintage_year | quarter, strategy, vintage_year | list, summary, trend | n/a | n/a | executable |
| gross_irr | re_fund_quarter_state | fund_quarter | quarter, strategy, vintage_year | quarter, strategy, vintage_year | list, summary, trend | rank | n/a | meridian_askable |
| gross_irr_weighted | re_env_portfolio.get_portfolio_kpis | portfolio_quarter | quarter | quarter | summary | n/a | fund_quarter | executable |
| net_irr | re_fund_quarter_state | fund_quarter | quarter, strategy, vintage_year | quarter, strategy, vintage_year | list, summary, trend | n/a | n/a | executable |
| net_irr_weighted | re_env_portfolio.get_portfolio_kpis | portfolio_quarter | quarter | quarter | summary | n/a | fund_quarter | executable |
| performance_family | re_fund_quarter_state | fund_quarter | fund | fund | summary | summary | n/a | meridian_askable |
| rvpi | re_fund_quarter_state | fund_quarter | quarter, strategy, vintage_year | quarter, strategy, vintage_year | list, summary, trend | n/a | n/a | executable |
| tvpi | re_fund_quarter_state | fund_quarter | quarter, strategy, vintage_year | quarter, strategy, vintage_year | list, summary, trend | n/a | n/a | executable |

### valuation

| Metric | Canonical Source | Grain | Declared Breakouts | Validated Group Bys | Platform Transformations | Meridian Transformations | Fallback Grain | Status |
|---|---|---|---|---|---|---|---|---|
| asset_value | re_asset_quarter_state.asset_value | asset_quarter | fund, market, property_type, quarter | n/a | summary | n/a | asset_latest | drifted |

## Askable Examples

- `asset_count`: how many total assets are there in the portfolio, which ones are not active
- `fund_list`: give me a rundown of the funds, list all funds
- `gross_irr`: list investments by gross IRR descending as of 2026Q1
- `noi_variance`: sort the assets by NOI variance, which have an NOI variance of -5% or worse
- `occupancy`: which assets have occupancy above 90%
- `performance_family`: summarize each funds performance
- `total_commitments`: how much do we have in total commitments, can you break that out by fund

## Drift Issues

| Metric | Issue Type | Message |
|---|---|---|
| active_asset_count | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type. |
| asset_value | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| avg_rent | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| capex | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| debt_service_int | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| debt_service_prin | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| debt_yield | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| dscr | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: quarter. |
| egi | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| insurance | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| leasing_commissions | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| ltv | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: quarter. |
| mgmt_fees | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| net_cash_flow | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| noi_margin | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| occupancy | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: quarter. |
| other_income | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| payroll | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| rent | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| repairs_maint | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| replacement_reserves | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| taxes | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| tenant_improvements | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| total_debt_service | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| total_opex | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| utilities | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: fund, market, property_type, quarter. |
| weighted_dscr | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: quarter. |
| weighted_ltv | declared_breakouts_not_validated | Declared breakouts exceed validated group-bys: quarter. |
