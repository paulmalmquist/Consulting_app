# Dashboard Validation Report

**Run date:** 2026-03-13T02:10:11.520336+00:00

## Summary

- **Total prompts:** 30
- **Spec pass:** 30/30 (100.0%)
- **Layout pass:** 30/30

## All Results

| ID | Prompt | Spec | Layout | Widget Types |
|---|---|---|---|---|
| P01_noi_over_time | NOI over time | PASS | PASS | trend_line |
| P02_noi_over_time_by_investment | NOI over time by investment | PASS | PASS | trend_line |
| P03_compare_revenue_expenses_by_asset | Compare revenue and expenses by asset | PASS | PASS | bar_chart |
| P04_side_by_side_trends | Show occupancy trend and NOI trend side  | PASS | PASS | trend_line, trend_line |
| P05_table_ranked_by_noi | Table of assets ranked by NOI | PASS | PASS | comparison_table |
| P06_scatter_occupancy_vs_noi | Scatter plot of occupancy vs NOI by asse | PASS | PASS | trend_line |
| P07_stacked_bar_revenue_expenses | Stacked bar chart of revenue vs expenses | PASS | PASS | bar_chart |
| P08_heatmap_occupancy | Heatmap of occupancy by asset and month | PASS | PASS | sensitivity_heat |
| P09_top_5_investments_by_noi | Show top 5 investments by NOI | PASS | PASS | bar_chart |
| P10_budget_vs_actual_noi | Compare budget vs actual NOI | PASS | PASS | bar_chart |
| P11_noi_distribution | Show NOI distribution across investments | PASS | PASS | bar_chart |
| P12_line_chart_dscr_by_asset | Line chart of DSCR by asset | PASS | PASS | trend_line |
| P13_table_debt_maturity | Table of debt maturity by asset | PASS | PASS | comparison_table |
| P14_compare_noi_margin_across_markets | Compare NOI margin across markets | PASS | PASS | bar_chart |
| P15_multi_widget_dashboard | Dashboard with NOI trend, occupancy tren | PASS | PASS | trend_line, trend_line, comparison_table |
| P16_quarterly_cashflow_by_investment | Show me quarterly cash flow trend by inv | PASS | PASS | trend_line |
| P17_asset_value_trend_monthly | Asset value trend monthly | PASS | PASS | trend_line |
| P18_compare_capex_across_assets | Compare capex across all assets | PASS | PASS | bar_chart |
| P19_revenue_breakdown_quarterly | Revenue breakdown bar chart quarterly | PASS | PASS | bar_chart |
| P20_top_3_properties_by_occupancy | Top 3 properties by occupancy | PASS | PASS | bar_chart |
| P21_ltv_trend_by_asset | LTV trend by asset over time | PASS | PASS | trend_line |
| P22_actual_vs_budget_by_investment | Compare actual vs budget NOI by investme | PASS | PASS | bar_chart |
| P23_monthly_operating_report | Monthly operating report | PASS | PASS | metrics_strip, trend_line, bar_chart, metrics_strip, comparison_table, bar_chart, statement_table |
| P24_executive_summary | Executive summary | PASS | PASS | metrics_strip, trend_line, waterfall, statement_table |
| P25_watchlist_dashboard | Watchlist dashboard | PASS | PASS | metrics_strip, comparison_table, trend_line, trend_line |
| P26_fund_quarterly_review | Fund quarterly review for Q1 2026 | PASS | PASS | metrics_strip, trend_line, bar_chart, metrics_strip, statement_table, statement_table |
| P27_underwriting_dashboard | Underwriting dashboard | PASS | PASS | metrics_strip, statement_table, statement_table, waterfall, bar_chart |
| P28_operating_review | Operating review | PASS | PASS | metrics_strip, statement_table, statement_table, trend_line, trend_line, trend_line |
| P29_pipeline_dashboard | Show me a pipeline dashboard | PASS | PASS | pipeline_bar, comparison_table |
| P30_geographic_analysis | Geographic analysis of our portfolio | PASS | PASS | geographic_map, comparison_table |

## Composer Improvements Made

1. **Entity type plural detection**: Added `s?` to entity regex patterns (investments, deals, returns)
2. **Time grain priority**: Moved explicit grains (monthly, quarterly, annual) before generic patterns (trend, over time)
3. **"X vs Y" freeform detection**: Added `_VS_METRICS_RE` check in freeform chart intent parsing
4. **"across all X" dimension detection**: Added `(?:all\s+)?` to dimension patterns
5. **Archetype section collision**: Use full archetype defaults when detected sections are a subset
