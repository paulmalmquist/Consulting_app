"""Prompt-pair library: NL prompts mapped to expected widget spec assertions.

Each PromptPair ties a natural-language prompt to:
  - the SQL ground truth query it represents (sql_ref_id)
  - the expected widget spec shape (chart type, metrics, grouping, etc.)
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PromptPair:
    id: str
    sql_ref_id: str              # links to SQLReference.id
    prompt: str
    # Widget-level expectations
    expected_widget_count: int   # exact for freeform, minimum for archetypes
    expected_widget_types: list[str]  # ordered for freeform, unordered for archetypes
    expected_metrics: list[str]  # at least one widget must contain these metric keys
    expected_group_by: str | None = None
    expected_time_grain: str | None = None
    expected_comparison: str | None = None
    expected_entity_type: str = "asset"
    expected_stacked: bool = False
    expected_limit: int | None = None
    expected_sort_desc: bool = False
    expected_format: str | None = None
    expected_archetype: str = "custom"
    # If True, expected_widget_count is a minimum (>=) instead of exact (==)
    count_is_minimum: bool = False


# ═══════════════════════════════════════════════════════════════════════════
# FREEFORM SINGLE-WIDGET (P01–P15) — mirrors existing 15 tests
# ═══════════════════════════════════════════════════════════════════════════

P01 = PromptPair(
    id="P01_noi_over_time",
    sql_ref_id="Q01_asset_noi_trend",
    prompt="NOI over time",
    expected_widget_count=1,
    expected_widget_types=["trend_line"],
    expected_metrics=["NOI"],
    expected_time_grain="quarterly",
    expected_format="dollar",
)

P02 = PromptPair(
    id="P02_noi_over_time_by_investment",
    sql_ref_id="Q01_asset_noi_trend",
    prompt="NOI over time by investment",
    expected_widget_count=1,
    expected_widget_types=["trend_line"],
    expected_metrics=["NOI"],
    expected_group_by="investment",
    expected_time_grain="quarterly",
    expected_entity_type="investment",
    expected_format="dollar",
)

P03 = PromptPair(
    id="P03_compare_revenue_expenses_by_asset",
    sql_ref_id="Q02_asset_revenue_opex",
    prompt="Compare revenue and expenses by asset",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["RENT", "TOTAL_OPEX"],
    expected_group_by="asset",
)

P04 = PromptPair(
    id="P04_side_by_side_trends",
    sql_ref_id="Q03_asset_occupancy_trend",
    prompt="Show occupancy trend and NOI trend side by side",
    expected_widget_count=2,
    expected_widget_types=["trend_line", "trend_line"],
    expected_metrics=["OCCUPANCY", "NOI"],
)

P05 = PromptPair(
    id="P05_table_ranked_by_noi",
    sql_ref_id="Q07_top_n_assets_by_noi",
    prompt="Table of assets ranked by NOI",
    expected_widget_count=1,
    expected_widget_types=["comparison_table"],
    expected_metrics=["NOI"],
    expected_sort_desc=True,
)

P06 = PromptPair(
    id="P06_scatter_occupancy_vs_noi",
    sql_ref_id="Q10_occupancy_vs_noi_scatter",
    prompt="Scatter plot of occupancy vs NOI by asset",
    expected_widget_count=1,
    expected_widget_types=["trend_line"],
    expected_metrics=["OCCUPANCY", "NOI"],
    expected_group_by="asset",
)

P07 = PromptPair(
    id="P07_stacked_bar_revenue_expenses",
    sql_ref_id="Q02_asset_revenue_opex",
    prompt="Stacked bar chart of revenue vs expenses by month",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["RENT", "TOTAL_OPEX"],
    expected_stacked=True,
)

P08 = PromptPair(
    id="P08_heatmap_occupancy",
    sql_ref_id="Q03_asset_occupancy_trend",
    prompt="Heatmap of occupancy by asset and month",
    expected_widget_count=1,
    expected_widget_types=["sensitivity_heat"],  # heatmap maps to sensitivity_heat
    expected_metrics=["OCCUPANCY"],
    expected_group_by="asset",
)

P09 = PromptPair(
    id="P09_top_5_investments_by_noi",
    sql_ref_id="Q07_top_n_assets_by_noi",
    prompt="Show top 5 investments by NOI",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["NOI"],
    expected_limit=5,
    expected_sort_desc=True,
    expected_entity_type="investment",
)

P10 = PromptPair(
    id="P10_budget_vs_actual_noi",
    sql_ref_id="Q11_actual_vs_plan_noi",
    prompt="Compare budget vs actual NOI",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["NOI"],
    expected_comparison="budget",
)

P11 = PromptPair(
    id="P11_noi_distribution",
    sql_ref_id="Q08_noi_distribution",
    prompt="Show NOI distribution across investments",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["NOI"],
    expected_group_by="investment",
    expected_entity_type="investment",
)

P12 = PromptPair(
    id="P12_line_chart_dscr_by_asset",
    sql_ref_id="Q04_asset_dscr_trend",
    prompt="Line chart of DSCR by asset",
    expected_widget_count=1,
    expected_widget_types=["trend_line"],
    expected_metrics=["DSCR_KPI"],
    expected_group_by="asset",
    expected_format="ratio",
)

P13 = PromptPair(
    id="P13_table_debt_maturity",
    sql_ref_id="Q06_asset_debt_balance",
    prompt="Table of debt maturity by asset",
    expected_widget_count=1,
    expected_widget_types=["comparison_table"],
    expected_metrics=[],  # tables may not have explicit metrics
)

P14 = PromptPair(
    id="P14_compare_noi_margin_across_markets",
    sql_ref_id="Q09_noi_by_market",
    prompt="Compare NOI margin across markets",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["NOI"],
    expected_group_by="market",
)

P15 = PromptPair(
    id="P15_multi_widget_dashboard",
    sql_ref_id="Q01_asset_noi_trend",
    prompt="Dashboard with NOI trend, occupancy trend, and asset ranking table",
    expected_widget_count=3,
    expected_widget_types=["trend_line", "trend_line", "comparison_table"],
    expected_metrics=["NOI", "OCCUPANCY"],
    count_is_minimum=True,
)


# ═══════════════════════════════════════════════════════════════════════════
# NEW FREEFORM PROMPTS (P16–P22)
# ═══════════════════════════════════════════════════════════════════════════

P16 = PromptPair(
    id="P16_quarterly_cashflow_by_investment",
    sql_ref_id="Q05_asset_value_trend",
    prompt="Show me quarterly cash flow trend by investment",
    expected_widget_count=1,
    expected_widget_types=["trend_line"],
    expected_metrics=["NET_CASH_FLOW"],
    expected_group_by="investment",
    expected_time_grain="quarterly",
    expected_entity_type="investment",
    expected_format="dollar",
)

P17 = PromptPair(
    id="P17_asset_value_trend_monthly",
    sql_ref_id="Q05_asset_value_trend",
    prompt="Asset value trend monthly",
    expected_widget_count=1,
    expected_widget_types=["trend_line"],
    expected_metrics=["ASSET_VALUE"],
    expected_time_grain="monthly",
    expected_format="dollar",
)

P18 = PromptPair(
    id="P18_compare_capex_across_assets",
    sql_ref_id="Q02_asset_revenue_opex",
    prompt="Compare capex across all assets",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["CAPEX"],
    expected_group_by="asset",
    expected_format="dollar",
)

P19 = PromptPair(
    id="P19_revenue_breakdown_quarterly",
    sql_ref_id="Q02_asset_revenue_opex",
    prompt="Revenue breakdown bar chart quarterly",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["RENT"],
    expected_time_grain="quarterly",
)

P20 = PromptPair(
    id="P20_top_3_properties_by_occupancy",
    sql_ref_id="Q03_asset_occupancy_trend",
    prompt="Top 3 properties by occupancy",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["OCCUPANCY"],
    expected_limit=3,
    expected_sort_desc=True,
    expected_format="percent",
)

P21 = PromptPair(
    id="P21_ltv_trend_by_asset",
    sql_ref_id="Q16_weighted_ltv_dscr_trend",
    prompt="LTV trend by asset over time",
    expected_widget_count=1,
    expected_widget_types=["trend_line"],
    expected_metrics=["LTV"],
    expected_group_by="asset",
    expected_time_grain="quarterly",
    expected_format="percent",
)

P22 = PromptPair(
    id="P22_actual_vs_budget_by_investment",
    sql_ref_id="Q11_actual_vs_plan_noi",
    prompt="Compare actual vs budget NOI by investment",
    expected_widget_count=1,
    expected_widget_types=["bar_chart"],
    expected_metrics=["NOI"],
    expected_comparison="budget",
    expected_group_by="investment",
    expected_entity_type="investment",
)


# ═══════════════════════════════════════════════════════════════════════════
# ARCHETYPE PROMPTS (P23–P30)
# ═══════════════════════════════════════════════════════════════════════════

P23 = PromptPair(
    id="P23_monthly_operating_report",
    sql_ref_id="Q01_asset_noi_trend",
    prompt="Monthly operating report",
    expected_widget_count=6,
    expected_widget_types=["metrics_strip", "trend_line", "bar_chart"],
    expected_metrics=["NOI"],
    expected_archetype="monthly_operating_report",
    count_is_minimum=True,
)

P24 = PromptPair(
    id="P24_executive_summary",
    sql_ref_id="Q01_asset_noi_trend",
    prompt="Executive summary",
    expected_widget_count=4,
    expected_widget_types=["metrics_strip", "trend_line", "waterfall"],
    expected_metrics=["NOI"],
    expected_archetype="executive_summary",
    count_is_minimum=True,
)

P25 = PromptPair(
    id="P25_watchlist_dashboard",
    sql_ref_id="Q12_underperforming_assets",
    prompt="Watchlist dashboard",
    expected_widget_count=4,
    expected_widget_types=["metrics_strip", "comparison_table", "trend_line"],
    expected_metrics=["NOI"],
    expected_archetype="watchlist",
    count_is_minimum=True,
)

P26 = PromptPair(
    id="P26_fund_quarterly_review",
    sql_ref_id="Q14_fund_performance_summary",
    prompt="Fund quarterly review for Q1 2026",
    expected_widget_count=5,
    expected_widget_types=["metrics_strip", "trend_line", "bar_chart"],
    expected_metrics=[],  # fund metrics may vary
    expected_entity_type="fund",
    expected_archetype="fund_quarterly_review",
    count_is_minimum=True,
)

P27 = PromptPair(
    id="P27_underwriting_dashboard",
    sql_ref_id="Q22_noi_bridge_waterfall",
    prompt="Underwriting dashboard",
    expected_widget_count=5,
    expected_widget_types=["metrics_strip", "statement_table", "waterfall"],
    expected_metrics=[],
    expected_archetype="underwriting_dashboard",
    count_is_minimum=True,
)

P28 = PromptPair(
    id="P28_operating_review",
    sql_ref_id="Q01_asset_noi_trend",
    prompt="Operating review",
    expected_widget_count=6,
    expected_widget_types=["metrics_strip", "statement_table", "trend_line"],
    expected_metrics=[],
    expected_archetype="operating_review",
    count_is_minimum=True,
)

P29 = PromptPair(
    id="P29_pipeline_dashboard",
    sql_ref_id="Q24_pipeline_deals_by_stage",
    prompt="Show me a pipeline dashboard",
    expected_widget_count=2,
    expected_widget_types=["pipeline_bar", "comparison_table"],
    expected_metrics=[],
    expected_archetype="executive_summary",  # "pipeline" not an archetype; falls through
    count_is_minimum=True,
)

P30 = PromptPair(
    id="P30_geographic_analysis",
    sql_ref_id="Q09_noi_by_market",
    prompt="Geographic analysis of our portfolio",
    expected_widget_count=2,
    expected_widget_types=["geographic_map", "comparison_table"],
    expected_metrics=[],
    expected_entity_type="fund",  # "portfolio" triggers fund entity type
    expected_archetype="executive_summary",  # "geographic" not an archetype; falls through
    count_is_minimum=True,
)


# ── Collected list for parametrized tests ─────────────────────────────────

PROMPT_PAIRS: list[PromptPair] = [
    P01, P02, P03, P04, P05, P06, P07, P08, P09, P10,
    P11, P12, P13, P14, P15,
    P16, P17, P18, P19, P20, P21, P22,
    P23, P24, P25, P26, P27, P28, P29, P30,
]

PROMPT_PAIR_BY_ID: dict[str, PromptPair] = {pp.id: pp for pp in PROMPT_PAIRS}

# Subsets for convenience
FREEFORM_PAIRS = [p for p in PROMPT_PAIRS if p.expected_archetype == "custom"]
ARCHETYPE_PAIRS = [p for p in PROMPT_PAIRS if p.expected_archetype != "custom"]
