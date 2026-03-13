"""SQL ground-truth reference library for dashboard validation.

Each SQLReference represents the correct analytical query behind a
natural-language dashboard prompt.  The composer does NOT generate SQL —
these queries document what data the generated widget spec *implies*.
"""
from __future__ import annotations

from dataclasses import dataclass, field

ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
BUS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001"


@dataclass
class SQLReference:
    id: str
    description: str
    sql: str
    params: list  # positional params for psycopg3 %s placeholders
    expected_columns: list[str]
    expected_min_rows: int
    source_table: str
    entity_level: str  # "asset" | "fund" | "investment"
    metric_keys: list[str]  # canonical metric catalog keys
    widget_type_hint: str  # expected widget type


# ── Metric key → DB column mapping ────────────────────────────────────────
METRIC_TO_COLUMN: dict[str, str] = {
    "NOI": "noi",
    "OCCUPANCY": "occupancy",
    "RENT": "revenue",
    "OTHER_INCOME": "revenue",
    "EGI": "revenue",
    "TOTAL_OPEX": "opex",
    "CAPEX": "capex",
    "ASSET_VALUE": "asset_value",
    "DSCR_KPI": "dscr",
    "LTV": "ltv",
    "NET_CASH_FLOW": "net_cash_flow",
    "TOTAL_DEBT_SERVICE": "debt_service",
    "PORTFOLIO_NAV": "portfolio_nav",
    "GROSS_IRR": "gross_irr",
    "NET_IRR": "net_irr",
    "GROSS_TVPI": "tvpi",
    "NET_TVPI": "tvpi",
    "DPI": "dpi",
    "RVPI": "rvpi",
}


# ═══════════════════════════════════════════════════════════════════════════
# ASSET-LEVEL TIME SERIES (Q01–Q06)
# ═══════════════════════════════════════════════════════════════════════════

Q01 = SQLReference(
    id="Q01_asset_noi_trend",
    description="NOI by quarter across all assets",
    sql="""
        SELECT quarter, SUM(noi) AS total_noi
        FROM re_asset_quarter_state
        WHERE env_id = %s
        GROUP BY quarter
        ORDER BY quarter
    """,
    params=[ENV_ID],
    expected_columns=["quarter", "total_noi"],
    expected_min_rows=4,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["NOI"],
    widget_type_hint="trend_line",
)

Q02 = SQLReference(
    id="Q02_asset_revenue_opex",
    description="Revenue and opex by asset by quarter",
    sql="""
        SELECT aqs.quarter, a.name AS asset_name,
               aqs.revenue, aqs.opex
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
        ORDER BY aqs.quarter, a.name
    """,
    params=[ENV_ID],
    expected_columns=["quarter", "asset_name", "revenue", "opex"],
    expected_min_rows=4,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["RENT", "TOTAL_OPEX", "EGI"],
    widget_type_hint="bar_chart",
)

Q03 = SQLReference(
    id="Q03_asset_occupancy_trend",
    description="Occupancy by asset by quarter",
    sql="""
        SELECT aqs.quarter, a.name AS asset_name, aqs.occupancy
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
        ORDER BY aqs.quarter, a.name
    """,
    params=[ENV_ID],
    expected_columns=["quarter", "asset_name", "occupancy"],
    expected_min_rows=4,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["OCCUPANCY"],
    widget_type_hint="trend_line",
)

Q04 = SQLReference(
    id="Q04_asset_dscr_trend",
    description="DSCR by asset by quarter",
    sql="""
        SELECT aqs.quarter, a.name AS asset_name, aqs.dscr
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
        ORDER BY aqs.quarter, a.name
    """,
    params=[ENV_ID],
    expected_columns=["quarter", "asset_name", "dscr"],
    expected_min_rows=4,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["DSCR_KPI"],
    widget_type_hint="trend_line",
)

Q05 = SQLReference(
    id="Q05_asset_value_trend",
    description="Asset value by quarter",
    sql="""
        SELECT quarter, SUM(asset_value) AS total_asset_value
        FROM re_asset_quarter_state
        WHERE env_id = %s
        GROUP BY quarter
        ORDER BY quarter
    """,
    params=[ENV_ID],
    expected_columns=["quarter", "total_asset_value"],
    expected_min_rows=4,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["ASSET_VALUE"],
    widget_type_hint="trend_line",
)

Q06 = SQLReference(
    id="Q06_asset_debt_balance",
    description="Debt balance by asset by quarter",
    sql="""
        SELECT aqs.quarter, a.name AS asset_name, aqs.debt_balance
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
        ORDER BY aqs.quarter, a.name
    """,
    params=[ENV_ID],
    expected_columns=["quarter", "asset_name", "debt_balance"],
    expected_min_rows=4,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["TOTAL_DEBT_SERVICE"],
    widget_type_hint="bar_chart",
)


# ═══════════════════════════════════════════════════════════════════════════
# ASSET-LEVEL CROSS-SECTIONAL (Q07–Q10)
# ═══════════════════════════════════════════════════════════════════════════

Q07 = SQLReference(
    id="Q07_top_n_assets_by_noi",
    description="Top N assets ranked by NOI (latest quarter)",
    sql="""
        SELECT a.name AS asset_name, aqs.noi
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
          AND aqs.quarter = (
              SELECT MAX(quarter) FROM re_asset_quarter_state WHERE env_id = %s
          )
        ORDER BY aqs.noi DESC
        LIMIT 10
    """,
    params=[ENV_ID, ENV_ID],
    expected_columns=["asset_name", "noi"],
    expected_min_rows=1,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["NOI"],
    widget_type_hint="bar_chart",
)

Q08 = SQLReference(
    id="Q08_noi_distribution",
    description="NOI distribution across assets (latest quarter)",
    sql="""
        SELECT a.name AS asset_name, aqs.noi
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
          AND aqs.quarter = (
              SELECT MAX(quarter) FROM re_asset_quarter_state WHERE env_id = %s
          )
        ORDER BY aqs.noi
    """,
    params=[ENV_ID, ENV_ID],
    expected_columns=["asset_name", "noi"],
    expected_min_rows=1,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["NOI"],
    widget_type_hint="bar_chart",
)

Q09 = SQLReference(
    id="Q09_noi_by_market",
    description="NOI grouped by market",
    sql="""
        SELECT pa.market, SUM(aqs.noi) AS total_noi
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
        WHERE aqs.env_id = %s
          AND aqs.quarter = (
              SELECT MAX(quarter) FROM re_asset_quarter_state WHERE env_id = %s
          )
        GROUP BY pa.market
        ORDER BY total_noi DESC
    """,
    params=[ENV_ID, ENV_ID],
    expected_columns=["market", "total_noi"],
    expected_min_rows=1,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["NOI"],
    widget_type_hint="bar_chart",
)

Q10 = SQLReference(
    id="Q10_occupancy_vs_noi_scatter",
    description="Occupancy vs NOI per asset (latest quarter)",
    sql="""
        SELECT a.name AS asset_name, aqs.occupancy, aqs.noi
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
          AND aqs.quarter = (
              SELECT MAX(quarter) FROM re_asset_quarter_state WHERE env_id = %s
          )
        ORDER BY a.name
    """,
    params=[ENV_ID, ENV_ID],
    expected_columns=["asset_name", "occupancy", "noi"],
    expected_min_rows=1,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["OCCUPANCY", "NOI"],
    widget_type_hint="trend_line",
)


# ═══════════════════════════════════════════════════════════════════════════
# BUDGET VARIANCE (Q11–Q13)
# ═══════════════════════════════════════════════════════════════════════════

Q11 = SQLReference(
    id="Q11_actual_vs_plan_noi",
    description="Actual vs plan NOI from variance table",
    sql="""
        SELECT quarter, line_code,
               SUM(actual_amount) AS actual,
               SUM(plan_amount) AS plan,
               SUM(variance_amount) AS variance
        FROM re_asset_variance_qtr
        WHERE env_id = %s AND line_code = 'NOI'
        GROUP BY quarter, line_code
        ORDER BY quarter
    """,
    params=[ENV_ID],
    expected_columns=["quarter", "line_code", "actual", "plan", "variance"],
    expected_min_rows=1,
    source_table="re_asset_variance_qtr",
    entity_level="asset",
    metric_keys=["NOI"],
    widget_type_hint="bar_chart",
)

Q12 = SQLReference(
    id="Q12_underperforming_assets",
    description="Assets with negative NOI variance (latest quarter)",
    sql="""
        SELECT a.name AS asset_name,
               v.actual_amount, v.plan_amount, v.variance_amount, v.variance_pct
        FROM re_asset_variance_qtr v
        JOIN repe_asset a ON a.asset_id = v.asset_id
        WHERE v.env_id = %s
          AND v.line_code = 'NOI'
          AND v.variance_amount < 0
          AND v.quarter = (
              SELECT MAX(quarter) FROM re_asset_variance_qtr WHERE env_id = %s
          )
        ORDER BY v.variance_amount ASC
    """,
    params=[ENV_ID, ENV_ID],
    expected_columns=["asset_name", "actual_amount", "plan_amount", "variance_amount", "variance_pct"],
    expected_min_rows=0,
    source_table="re_asset_variance_qtr",
    entity_level="asset",
    metric_keys=["NOI"],
    widget_type_hint="comparison_table",
)

Q13 = SQLReference(
    id="Q13_monthly_actual_vs_budget",
    description="Monthly actual vs budget NOI",
    sql="""
        SELECT n.period_month,
               SUM(n.amount) AS actual_noi,
               SUM(b.amount) AS budget_noi
        FROM acct_normalized_noi_monthly n
        LEFT JOIN uw_noi_budget_monthly b
          ON b.asset_id = n.asset_id AND b.period_month = n.period_month
        WHERE n.env_id = %s AND n.line_code = 'NOI'
        GROUP BY n.period_month
        ORDER BY n.period_month
    """,
    params=[ENV_ID],
    expected_columns=["period_month", "actual_noi", "budget_noi"],
    expected_min_rows=1,
    source_table="acct_normalized_noi_monthly",
    entity_level="asset",
    metric_keys=["NOI"],
    widget_type_hint="bar_chart",
)


# ═══════════════════════════════════════════════════════════════════════════
# FUND-LEVEL (Q14–Q18)
# ═══════════════════════════════════════════════════════════════════════════

Q14 = SQLReference(
    id="Q14_fund_performance_summary",
    description="Fund KPIs: NAV, TVPI, DPI, IRR",
    sql="""
        SELECT quarter, portfolio_nav, tvpi, dpi, gross_irr, net_irr
        FROM re_fund_quarter_state
        WHERE fund_id = %s
        ORDER BY quarter DESC
        LIMIT 1
    """,
    params=[FUND_ID],
    expected_columns=["quarter", "portfolio_nav", "tvpi", "dpi", "gross_irr", "net_irr"],
    expected_min_rows=1,
    source_table="re_fund_quarter_state",
    entity_level="fund",
    metric_keys=["PORTFOLIO_NAV", "GROSS_TVPI", "DPI", "GROSS_IRR", "NET_IRR"],
    widget_type_hint="metrics_strip",
)

Q15 = SQLReference(
    id="Q15_portfolio_nav_trend",
    description="Portfolio NAV over time",
    sql="""
        SELECT quarter, portfolio_nav
        FROM re_fund_quarter_state
        WHERE fund_id = %s
        ORDER BY quarter
    """,
    params=[FUND_ID],
    expected_columns=["quarter", "portfolio_nav"],
    expected_min_rows=4,
    source_table="re_fund_quarter_state",
    entity_level="fund",
    metric_keys=["PORTFOLIO_NAV"],
    widget_type_hint="trend_line",
)

Q16 = SQLReference(
    id="Q16_weighted_ltv_dscr_trend",
    description="Weighted LTV and DSCR by quarter",
    sql="""
        SELECT quarter, weighted_ltv, weighted_dscr
        FROM re_fund_quarter_state
        WHERE fund_id = %s
        ORDER BY quarter
    """,
    params=[FUND_ID],
    expected_columns=["quarter", "weighted_ltv", "weighted_dscr"],
    expected_min_rows=4,
    source_table="re_fund_quarter_state",
    entity_level="fund",
    metric_keys=["LTV", "DSCR_KPI"],
    widget_type_hint="trend_line",
)

Q17 = SQLReference(
    id="Q17_fund_comparison",
    description="Multi-fund comparison table",
    sql="""
        SELECT f.name AS fund_name, fqs.quarter,
               fqs.portfolio_nav, fqs.tvpi, fqs.dpi, fqs.gross_irr
        FROM re_fund_quarter_state fqs
        JOIN repe_fund f ON f.fund_id = fqs.fund_id
        WHERE fqs.quarter = (
            SELECT MAX(quarter) FROM re_fund_quarter_state
        )
        ORDER BY fqs.portfolio_nav DESC
    """,
    params=[],
    expected_columns=["fund_name", "quarter", "portfolio_nav", "tvpi", "dpi", "gross_irr"],
    expected_min_rows=1,
    source_table="re_fund_quarter_state",
    entity_level="fund",
    metric_keys=["PORTFOLIO_NAV", "GROSS_TVPI", "DPI", "GROSS_IRR"],
    widget_type_hint="comparison_table",
)

Q18 = SQLReference(
    id="Q18_tvpi_components_stacked",
    description="DPI + RVPI = TVPI stacked by quarter",
    sql="""
        SELECT quarter, dpi, rvpi, tvpi
        FROM re_fund_quarter_state
        WHERE fund_id = %s
        ORDER BY quarter
    """,
    params=[FUND_ID],
    expected_columns=["quarter", "dpi", "rvpi", "tvpi"],
    expected_min_rows=4,
    source_table="re_fund_quarter_state",
    entity_level="fund",
    metric_keys=["DPI", "RVPI", "GROSS_TVPI"],
    widget_type_hint="bar_chart",
)


# ═══════════════════════════════════════════════════════════════════════════
# INVESTMENT-LEVEL (Q19–Q21)
# ═══════════════════════════════════════════════════════════════════════════

Q19 = SQLReference(
    id="Q19_investment_irr_by_deal",
    description="IRR by investment (latest quarter)",
    sql="""
        SELECT d.name AS deal_name, iqs.gross_irr, iqs.net_irr
        FROM re_investment_quarter_state iqs
        JOIN repe_deal d ON d.deal_id = iqs.deal_id
        WHERE iqs.quarter = (
            SELECT MAX(quarter) FROM re_investment_quarter_state
        )
        ORDER BY iqs.gross_irr DESC
    """,
    params=[],
    expected_columns=["deal_name", "gross_irr", "net_irr"],
    expected_min_rows=1,
    source_table="re_investment_quarter_state",
    entity_level="investment",
    metric_keys=["GROSS_IRR", "NET_IRR"],
    widget_type_hint="bar_chart",
)

Q20 = SQLReference(
    id="Q20_nav_contribution_by_investment",
    description="NAV contribution by investment (latest quarter)",
    sql="""
        SELECT d.name AS deal_name, iqs.nav
        FROM re_investment_quarter_state iqs
        JOIN repe_deal d ON d.deal_id = iqs.deal_id
        WHERE iqs.quarter = (
            SELECT MAX(quarter) FROM re_investment_quarter_state
        )
        ORDER BY iqs.nav DESC
    """,
    params=[],
    expected_columns=["deal_name", "nav"],
    expected_min_rows=1,
    source_table="re_investment_quarter_state",
    entity_level="investment",
    metric_keys=["PORTFOLIO_NAV"],
    widget_type_hint="bar_chart",
)

Q21 = SQLReference(
    id="Q21_investment_comparison_table",
    description="Investment comparison: NAV, IRR, equity multiple",
    sql="""
        SELECT d.name AS deal_name,
               iqs.nav, iqs.gross_irr, iqs.equity_multiple,
               iqs.invested_capital, iqs.realized_distributions
        FROM re_investment_quarter_state iqs
        JOIN repe_deal d ON d.deal_id = iqs.deal_id
        WHERE iqs.quarter = (
            SELECT MAX(quarter) FROM re_investment_quarter_state
        )
        ORDER BY iqs.nav DESC
    """,
    params=[],
    expected_columns=["deal_name", "nav", "gross_irr", "equity_multiple"],
    expected_min_rows=1,
    source_table="re_investment_quarter_state",
    entity_level="investment",
    metric_keys=["PORTFOLIO_NAV", "GROSS_IRR"],
    widget_type_hint="comparison_table",
)


# ═══════════════════════════════════════════════════════════════════════════
# COMPOSITE / SPECIAL (Q22–Q24)
# ═══════════════════════════════════════════════════════════════════════════

Q22 = SQLReference(
    id="Q22_noi_bridge_waterfall",
    description="NOI bridge: Revenue → Opex → NOI",
    sql="""
        SELECT
            SUM(revenue) AS egi,
            SUM(opex) AS total_opex,
            SUM(noi) AS noi
        FROM re_asset_quarter_state
        WHERE env_id = %s
          AND quarter = (
              SELECT MAX(quarter) FROM re_asset_quarter_state WHERE env_id = %s
          )
    """,
    params=[ENV_ID, ENV_ID],
    expected_columns=["egi", "total_opex", "noi"],
    expected_min_rows=1,
    source_table="re_asset_quarter_state",
    entity_level="asset",
    metric_keys=["EGI", "TOTAL_OPEX", "NOI"],
    widget_type_hint="waterfall",
)

Q23 = SQLReference(
    id="Q23_income_statement",
    description="Income statement detail by line code",
    sql="""
        SELECT period_month, line_code, SUM(amount) AS amount
        FROM acct_normalized_noi_monthly
        WHERE env_id = %s
        GROUP BY period_month, line_code
        ORDER BY period_month, line_code
    """,
    params=[ENV_ID],
    expected_columns=["period_month", "line_code", "amount"],
    expected_min_rows=1,
    source_table="acct_normalized_noi_monthly",
    entity_level="asset",
    metric_keys=["NOI", "RENT", "TOTAL_OPEX"],
    widget_type_hint="statement_table",
)

Q24 = SQLReference(
    id="Q24_pipeline_deals_by_stage",
    description="Pipeline deals grouped by stage",
    sql="""
        SELECT stage, COUNT(*) AS deal_count,
               SUM(committed_capital) AS total_committed
        FROM repe_deal
        WHERE fund_id = %s
        GROUP BY stage
        ORDER BY deal_count DESC
    """,
    params=[FUND_ID],
    expected_columns=["stage", "deal_count", "total_committed"],
    expected_min_rows=1,
    source_table="repe_deal",
    entity_level="investment",
    metric_keys=["NOI"],
    widget_type_hint="pipeline_bar",
)


# ── Collected list for parametrized tests ─────────────────────────────────

SQL_REFERENCES: list[SQLReference] = [
    Q01, Q02, Q03, Q04, Q05, Q06,
    Q07, Q08, Q09, Q10,
    Q11, Q12, Q13,
    Q14, Q15, Q16, Q17, Q18,
    Q19, Q20, Q21,
    Q22, Q23, Q24,
]

SQL_REF_BY_ID: dict[str, SQLReference] = {ref.id: ref for ref in SQL_REFERENCES}
