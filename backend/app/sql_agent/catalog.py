"""Data catalog — structured representation of REPE + PDS database schema.

Used by the router and SQL generator as grounding context so the LLM
never has to guess table or column names.

The static catalog below is the baseline.  When a business has populated
``semantic_entity_def`` / ``semantic_metric_def`` in the live catalog
(see 340_semantic_catalog.sql), ``catalog_text_dynamic()`` merges both.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# ── Table definitions ──────────────────────────────────────────────


@dataclass(frozen=True)
class Column:
    name: str
    type: str
    description: str


@dataclass(frozen=True)
class Table:
    name: str
    description: str
    pk: str
    columns: list[Column] = field(default_factory=list)
    parent_fk: str | None = None  # e.g. "fund_id → repe_fund"


# ── Entity hierarchy ───────────────────────────────────────────────
# business → fund → deal → asset → property_asset / loan

ENTITY_TABLES: list[Table] = [
    Table(
        name="repe_fund",
        description="A PE fund vehicle",
        pk="fund_id",
        columns=[
            Column("fund_id", "uuid", "Primary key"),
            Column("business_id", "uuid", "FK to business — tenant isolation key"),
            Column("name", "text", "Fund name"),
            Column("vintage_year", "int", "Fund vintage year"),
            Column("fund_type", "text", "closed_end | open_end | sma | co_invest"),
            Column("strategy", "text", "equity | debt"),
            Column("sub_strategy", "text", "Optional sub-strategy"),
            Column("target_size", "numeric", "Target fund size"),
            Column("term_years", "int", "Fund term in years"),
            Column("status", "text", "fundraising | investing | harvesting | closed"),
            Column("created_at", "timestamptz", "Creation timestamp"),
        ],
    ),
    Table(
        name="repe_deal",
        description="An investment / deal within a fund",
        pk="deal_id",
        parent_fk="fund_id → repe_fund",
        columns=[
            Column("deal_id", "uuid", "Primary key"),
            Column("fund_id", "uuid", "FK to repe_fund"),
            Column("name", "text", "Deal name"),
            Column("deal_type", "text", "equity | debt"),
            Column("stage", "text", "sourcing | underwriting | ic | closing | operating | exited"),
            Column("sponsor", "text", "Deal sponsor"),
            Column("target_close_date", "date", "Target closing date"),
            Column("created_at", "timestamptz", "Creation timestamp"),
        ],
    ),
    Table(
        name="repe_asset",
        description="A physical asset backing a deal",
        pk="asset_id",
        parent_fk="deal_id → repe_deal",
        columns=[
            Column("asset_id", "uuid", "Primary key"),
            Column("deal_id", "uuid", "FK to repe_deal"),
            Column("name", "text", "Asset name"),
            Column("asset_type", "text", "Type: 'property' for portfolio assets, 'cmbs' for structured. Always filter on 'property' for portfolio counts."),
            Column("asset_status", "text", "Status: active | held | lease_up | operating | disposed | realized | written_off | pipeline. NULL = active."),
            Column("created_at", "timestamptz", "Creation timestamp"),
        ],
    ),
    Table(
        name="repe_property_asset",
        description="CRE-specific asset detail (multifamily, office, etc.)",
        pk="asset_id",
        parent_fk="asset_id → repe_asset",
        columns=[
            Column("asset_id", "uuid", "PK and FK to repe_asset"),
            Column("property_type", "text", "multifamily | office | industrial | retail | hotel"),
            Column("units", "int", "Unit count"),
            Column("market", "text", "Market name (e.g. Phoenix)"),
            Column("current_noi", "numeric", "Current NOI"),
            Column("occupancy", "numeric", "Occupancy rate as decimal"),
        ],
    ),
    Table(
        name="re_partner",
        description="An LP or GP in a fund",
        pk="partner_id",
        parent_fk="fund_id → repe_fund",
        columns=[
            Column("partner_id", "uuid", "Primary key"),
            Column("fund_id", "uuid", "FK to repe_fund"),
            Column("name", "text", "Partner name"),
            Column("commitment", "numeric", "Capital commitment amount"),
        ],
    ),
    Table(
        name="re_partner_commitment",
        description="Capital commitments by partner and fund",
        pk="commitment_id",
        parent_fk="fund_id → repe_fund",
        columns=[
            Column("commitment_id", "uuid", "Primary key"),
            Column("fund_id", "uuid", "FK to repe_fund"),
            Column("partner_id", "uuid", "FK to re_partner"),
            Column("committed_amount", "numeric", "Committed capital amount"),
            Column("status", "text", "active | fully_called | cancelled"),
            Column("created_at", "timestamptz", "Creation timestamp"),
        ],
    ),
]

# ── Financial statement tables (SQL-queryable) ─────────────────────

STATEMENT_TABLES: list[Table] = [
    Table(
        name="acct_normalized_noi_monthly",
        description="Monthly P&L actuals by line code. The workhorse table for operating metrics.",
        pk="id",
        columns=[
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("asset_id", "uuid", "FK to repe_asset"),
            Column("period_month", "date", "Month start date (e.g. 2025-10-01)"),
            Column("line_code", "text", "Metric code (NOI, RENT, etc.)"),
            Column("amount", "numeric", "Dollar amount"),
        ],
    ),
    Table(
        name="acct_statement_line_def",
        description="Statement line definitions — what each line_code means",
        pk="line_code",
        columns=[
            Column("line_code", "text", "Metric code"),
            Column("display_label", "text", "Human-readable label"),
            Column("statement", "text", "IS | CF | BS | KPI"),
            Column("sort_order", "int", "Display order"),
        ],
    ),
    Table(
        name="re_asset_acct_quarter_rollup",
        description="Quarterly GL rollup per asset — revenue, opex, NOI, capex, debt service, net cash flow",
        pk="id",
        columns=[
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("asset_id", "uuid", "FK to repe_asset"),
            Column("quarter", "text", "e.g. 2025Q4"),
            Column("revenue", "numeric", "Total revenue"),
            Column("opex", "numeric", "Total operating expenses"),
            Column("noi", "numeric", "Net operating income"),
            Column("capex", "numeric", "Capital expenditures"),
            Column("debt_service", "numeric", "Debt service"),
            Column("ti_lc", "numeric", "Tenant improvements + leasing commissions"),
            Column("reserves", "numeric", "Replacement reserves"),
            Column("net_cash_flow", "numeric", "Net cash flow"),
        ],
    ),
    Table(
        name="re_asset_occupancy_quarter",
        description="Asset occupancy and leasing metrics per quarter",
        pk="id",
        columns=[
            Column("asset_id", "uuid", "FK to repe_asset"),
            Column("quarter", "text", "e.g. 2025Q4"),
            Column("occupancy", "numeric", "Occupancy rate as decimal"),
            Column("avg_rent", "numeric", "Average rent per unit"),
            Column("units_occupied", "int", "Units occupied"),
            Column("units_total", "int", "Total units"),
        ],
    ),
    Table(
        name="re_asset_quarter_state",
        description="Authoritative quarterly snapshot per asset — includes valuation, NOI, debt",
        pk="id",
        columns=[
            Column("asset_id", "uuid", "FK to repe_asset"),
            Column("quarter", "text", "e.g. 2025Q4"),
            Column("noi", "numeric", "NOI"),
            Column("revenue", "numeric", "Revenue"),
            Column("opex", "numeric", "Operating expenses"),
            Column("capex", "numeric", "Capital expenditures"),
            Column("debt_service", "numeric", "Debt service"),
            Column("occupancy", "numeric", "Occupancy rate"),
            Column("debt_balance", "numeric", "Outstanding debt balance"),
            Column("asset_value", "numeric", "Appraised / modeled value"),
            Column("nav", "numeric", "Net asset value"),
            Column("scenario_id", "uuid", "Scenario reference"),
        ],
    ),
    Table(
        name="re_fund_quarter_state",
        description="Fund-level quarterly snapshot — NAV, returns, leverage metrics",
        pk="id",
        columns=[
            Column("fund_id", "uuid", "FK to repe_fund"),
            Column("quarter", "text", "e.g. 2025Q4"),
            Column("portfolio_nav", "numeric", "Portfolio net asset value"),
            Column("total_committed", "numeric", "Total committed capital"),
            Column("total_called", "numeric", "Total called capital"),
            Column("total_distributed", "numeric", "Total distributions"),
            Column("dpi", "numeric", "Distributions to paid-in"),
            Column("rvpi", "numeric", "Residual value to paid-in"),
            Column("tvpi", "numeric", "Total value to paid-in"),
            Column("gross_irr", "numeric", "Gross IRR"),
            Column("net_irr", "numeric", "Net IRR"),
            Column("weighted_ltv", "numeric", "Weighted average LTV"),
            Column("weighted_dscr", "numeric", "Weighted average DSCR"),
        ],
    ),
    Table(
        name="re_fund_quarter_metrics",
        description="Simpler fund performance metrics by quarter",
        pk="id",
        columns=[
            Column("fund_id", "uuid", "FK to repe_fund"),
            Column("quarter", "text", "e.g. 2025Q4"),
            Column("contributed_to_date", "numeric", "Cumulative contributions"),
            Column("distributed_to_date", "numeric", "Cumulative distributions"),
            Column("nav", "numeric", "Net asset value"),
            Column("dpi", "numeric", "DPI"),
            Column("tvpi", "numeric", "TVPI"),
            Column("irr", "numeric", "IRR"),
        ],
    ),
    Table(
        name="re_partner_quarter_metrics",
        description="Per-LP quarterly performance metrics",
        pk="id",
        columns=[
            Column("partner_id", "uuid", "FK to re_partner"),
            Column("fund_id", "uuid", "FK to repe_fund"),
            Column("quarter", "text", "e.g. 2025Q4"),
            Column("nav", "numeric", "Net asset value"),
            Column("dpi", "numeric", "DPI"),
            Column("tvpi", "numeric", "TVPI"),
            Column("irr", "numeric", "IRR"),
        ],
    ),
    Table(
        name="re_loan",
        description="Loan tracking — amount, rate, maturity, covenants",
        pk="loan_id",
        parent_fk="asset_id → repe_asset",
        columns=[
            Column("loan_id", "uuid", "Primary key"),
            Column("asset_id", "uuid", "FK to repe_asset"),
            Column("loan_amount", "numeric", "Original loan amount"),
            Column("interest_rate", "numeric", "Interest rate as decimal"),
            Column("maturity_date", "date", "Loan maturity date"),
            Column("loan_type", "text", "Loan type"),
        ],
    ),
    Table(
        name="re_loan_covenant_result_qtr",
        description="Covenant test results per quarter — DSCR, LTV, DEBT_YIELD compliance",
        pk="id",
        columns=[
            Column("loan_id", "uuid", "FK to re_loan"),
            Column("quarter", "text", "e.g. 2025Q4"),
            Column("covenant_type", "text", "DSCR | LTV | DEBT_YIELD"),
            Column("actual_value", "numeric", "Actual metric value"),
            Column("threshold_value", "numeric", "Covenant threshold"),
            Column("in_compliance", "boolean", "Whether covenant is met"),
        ],
    ),
    Table(
        name="re_loan_detail",
        description="Loan detail extension — DSCR, LTV, current balance per asset (1:1 with repe_asset)",
        pk="asset_id",
        parent_fk="asset_id → repe_asset",
        columns=[
            Column("asset_id", "uuid", "PK and FK to repe_asset"),
            Column("original_balance", "numeric", "Original loan balance"),
            Column("current_balance", "numeric", "Current outstanding balance"),
            Column("coupon", "numeric", "Coupon rate as decimal"),
            Column("maturity_date", "date", "Loan maturity date"),
            Column("rating", "text", "Credit rating"),
            Column("ltv", "numeric", "Loan-to-value ratio as decimal"),
            Column("dscr", "numeric", "Debt service coverage ratio"),
        ],
    ),
    Table(
        name="re_asset_variance_qtr",
        description="Quarterly NOI variance: actual vs plan by asset and line code",
        pk="id",
        parent_fk="asset_id → repe_asset",
        columns=[
            Column("asset_id", "uuid", "FK to repe_asset"),
            Column("quarter", "text", "e.g. 2025Q4"),
            Column("line_code", "text", "NOI, GROSS_REVENUE, VACANCY_LOSS, EGI, OPEX"),
            Column("actual_amount", "numeric", "Actual dollar amount"),
            Column("plan_amount", "numeric", "Budgeted/underwriting dollar amount"),
            Column("variance_amount", "numeric", "actual - plan"),
            Column("variance_pct", "numeric", "Variance as decimal (e.g. -0.05 = -5%%)"),
        ],
    ),
]

# ── PDS (Construction / Capital Projects) tables ──────────────────

PDS_TABLES: list[Table] = [
    Table(
        name="pds_programs",
        description="Program — a group of related capital projects",
        pk="program_id",
        columns=[
            Column("program_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("name", "text", "Program name"),
            Column("status", "text", "active | completed | on_hold"),
            Column("created_at", "timestamptz", "Creation timestamp"),
        ],
    ),
    Table(
        name="pds_projects",
        description="Capital project — budget, schedule, risk tracking",
        pk="project_id",
        parent_fk="program_id → pds_programs",
        columns=[
            Column("project_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("program_id", "uuid", "FK to pds_programs (optional)"),
            Column("name", "text", "Project name"),
            Column("stage", "text", "planning | design | procurement | construction | closeout"),
            Column("project_manager", "text", "PM name"),
            Column("approved_budget", "numeric", "Total approved budget"),
            Column("committed_amount", "numeric", "Amount committed via contracts"),
            Column("spent_amount", "numeric", "Amount spent / invoiced"),
            Column("forecast_at_completion", "numeric", "Forecast total at completion"),
            Column("contingency_budget", "numeric", "Original contingency budget"),
            Column("contingency_remaining", "numeric", "Remaining contingency"),
            Column("risk_score", "numeric", "Computed risk score 0-100"),
            Column("status", "text", "active | completed | on_hold | cancelled"),
            Column("created_at", "timestamptz", "Creation timestamp"),
        ],
    ),
    Table(
        name="pds_budget_lines",
        description="Budget line items per project per cost code",
        pk="budget_line_id",
        parent_fk="project_id → pds_projects",
        columns=[
            Column("budget_line_id", "uuid", "Primary key"),
            Column("project_id", "uuid", "FK to pds_projects"),
            Column("budget_version_id", "uuid", "FK to pds_budget_versions"),
            Column("cost_code", "text", "Cost code (e.g. 03-CONCRETE)"),
            Column("line_label", "text", "Line item description"),
            Column("approved_amount", "numeric", "Approved amount"),
            Column("committed_amount", "numeric", "Committed amount"),
            Column("invoiced_amount", "numeric", "Invoiced amount"),
            Column("paid_amount", "numeric", "Paid amount"),
        ],
    ),
    Table(
        name="pds_contracts",
        description="Vendor/subcontractor contracts within a project",
        pk="contract_id",
        parent_fk="project_id → pds_projects",
        columns=[
            Column("contract_id", "uuid", "Primary key"),
            Column("project_id", "uuid", "FK to pds_projects"),
            Column("vendor_name", "text", "Vendor or subcontractor name"),
            Column("contract_type", "text", "lump_sum | gmp | cost_plus | t_and_m"),
            Column("original_value", "numeric", "Original contract value"),
            Column("current_value", "numeric", "Current value after change orders"),
            Column("status", "text", "draft | active | completed | terminated"),
        ],
    ),
    Table(
        name="pds_change_orders",
        description="Change orders modifying project scope or budget",
        pk="change_order_id",
        parent_fk="project_id → pds_projects",
        columns=[
            Column("change_order_id", "uuid", "Primary key"),
            Column("project_id", "uuid", "FK to pds_projects"),
            Column("contract_id", "uuid", "FK to pds_contracts (optional)"),
            Column("title", "text", "Change order title"),
            Column("amount", "numeric", "Dollar amount (positive or negative)"),
            Column("schedule_impact_days", "int", "Schedule impact in days"),
            Column("status", "text", "draft | pending | approved | rejected"),
            Column("created_at", "timestamptz", "Creation timestamp"),
        ],
    ),
]

# ── PDS Analytics tables (370-series) ─────────────────────────────

PDS_ANALYTICS_TABLES: list[Table] = [
    Table(
        name="pds_accounts",
        description="Client account — enterprise, mid-market, or SMB with governance track",
        pk="account_id",
        columns=[
            Column("account_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("account_name", "text", "Account name"),
            Column("tier", "text", "Enterprise | Mid-Market | SMB"),
            Column("industry", "text", "Corporate, Healthcare, Life Sciences, Financial Services, Industrial, Retail, Hospitality, Data Centers, Education, Sports & Entertainment"),
            Column("governance_track", "text", "variable | dedicated"),
            Column("annual_contract_value", "numeric", "Annual contract value in USD"),
            Column("contract_start_date", "date", "Contract start date"),
            Column("contract_end_date", "date", "Contract end date"),
            Column("status", "text", "active | inactive"),
            Column("parent_account_id", "uuid", "FK to self for subsidiary relationships"),
        ],
    ),
    Table(
        name="pds_analytics_employees",
        description="Employee master for utilization and billing analytics",
        pk="employee_id",
        columns=[
            Column("employee_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("full_name", "text", "Employee full name"),
            Column("role_level", "text", "junior | mid | senior_manager | director | executive"),
            Column("department", "text", "Department"),
            Column("region", "text", "Americas region"),
            Column("standard_hours_per_week", "numeric", "Standard hours per week (default 40)"),
            Column("is_active", "boolean", "Whether employee is active"),
            Column("hire_date", "date", "Hire date"),
        ],
    ),
    Table(
        name="pds_analytics_projects",
        description="Analytics-focused project with fee structure and governance tracking",
        pk="project_id",
        parent_fk="account_id → pds_accounts",
        columns=[
            Column("project_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("account_id", "uuid", "FK to pds_accounts"),
            Column("project_name", "text", "Project name"),
            Column("project_type", "text", "Project Management, Development Management, Construction Management, Cost Management, Design, Multi-site Program, Location Strategy, Large Development Advisory, Tétris"),
            Column("service_line_key", "text", "Service line identifier"),
            Column("market", "text", "Market/region"),
            Column("status", "text", "active | completed | on_hold | cancelled"),
            Column("governance_track", "text", "variable | dedicated"),
            Column("total_budget", "numeric", "Total project budget"),
            Column("fee_type", "text", "percentage_of_construction | fixed_fee | time_and_materials | retainer"),
            Column("fee_amount", "numeric", "Fee amount in USD"),
            Column("start_date", "date", "Project start date"),
            Column("planned_end_date", "date", "Planned end date"),
            Column("percent_complete", "numeric", "Percent complete 0-100"),
        ],
    ),
    Table(
        name="pds_revenue_entries",
        description="Monthly revenue by version (actual, budget, forecasts) with ASC 606 breakdown",
        pk="entry_id",
        parent_fk="project_id → pds_analytics_projects",
        columns=[
            Column("entry_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("project_id", "uuid", "FK to pds_analytics_projects"),
            Column("account_id", "uuid", "FK to pds_accounts"),
            Column("period", "date", "First of month date grain"),
            Column("version", "text", "actual | budget | forecast_3_9 | forecast_6_6 | forecast_9_3 | plan"),
            Column("recognized_revenue", "numeric", "ASC 606 recognized revenue"),
            Column("billed_revenue", "numeric", "Billed revenue"),
            Column("unbilled_revenue", "numeric", "Unbilled revenue"),
            Column("backlog", "numeric", "Revenue backlog"),
            Column("cost", "numeric", "Cost of delivery"),
            Column("margin_pct", "numeric", "Margin percentage (decimal)"),
        ],
    ),
    Table(
        name="pds_analytics_assignments",
        description="Employee-to-project assignment with billing rate",
        pk="assignment_id",
        parent_fk="employee_id → pds_analytics_employees",
        columns=[
            Column("assignment_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("employee_id", "uuid", "FK to pds_analytics_employees"),
            Column("project_id", "uuid", "FK to pds_analytics_projects"),
            Column("role_level", "text", "junior | mid | senior_manager | director | executive"),
            Column("allocation_pct", "numeric", "Allocation percentage 0-100"),
            Column("billing_rate", "numeric", "Billing rate per hour"),
            Column("start_date", "date", "Assignment start"),
            Column("end_date", "date", "Assignment end"),
        ],
    ),
    Table(
        name="pds_analytics_timecards",
        description="Daily timecard entries for utilization analytics",
        pk="timecard_id",
        parent_fk="employee_id → pds_analytics_employees",
        columns=[
            Column("timecard_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("employee_id", "uuid", "FK to pds_analytics_employees"),
            Column("project_id", "uuid", "FK to pds_analytics_projects"),
            Column("work_date", "date", "Date of work"),
            Column("hours", "numeric", "Hours worked"),
            Column("is_billable", "boolean", "Whether hours are billable"),
            Column("billing_rate", "numeric", "Billing rate per hour"),
        ],
    ),
    Table(
        name="pds_nps_responses",
        description="Client NPS and multi-dimension satisfaction survey responses",
        pk="response_id",
        parent_fk="account_id → pds_accounts",
        columns=[
            Column("response_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("account_id", "uuid", "FK to pds_accounts"),
            Column("project_id", "uuid", "FK to pds_analytics_projects"),
            Column("survey_date", "date", "Date of survey"),
            Column("nps_score", "smallint", "NPS score 0-10 (9-10 Promoter, 7-8 Passive, 0-6 Detractor)"),
            Column("overall_satisfaction", "smallint", "Overall satisfaction 1-5"),
            Column("schedule_adherence", "smallint", "Schedule adherence rating 1-5"),
            Column("budget_management", "smallint", "Budget management rating 1-5"),
            Column("communication_quality", "smallint", "Communication quality rating 1-5"),
            Column("team_responsiveness", "smallint", "Team responsiveness rating 1-5"),
            Column("problem_resolution", "smallint", "Problem resolution rating 1-5"),
            Column("vendor_management", "smallint", "Vendor management rating 1-5"),
            Column("safety_performance", "smallint", "Safety performance rating 1-5"),
            Column("innovation_value_engineering", "smallint", "Innovation / VE rating 1-5"),
            Column("open_comment_positive", "text", "Positive open comment"),
            Column("open_comment_improvement", "text", "Improvement suggestion"),
        ],
    ),
    Table(
        name="pds_technology_adoption",
        description="Monthly technology platform adoption metrics per account per tool",
        pk="adoption_id",
        parent_fk="account_id → pds_accounts",
        columns=[
            Column("adoption_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("account_id", "uuid", "FK to pds_accounts"),
            Column("tool_name", "text", "INGENIOUS.BUILD, JLL Falcon, JLL Azara, Corrigo, BIM 360, Procore"),
            Column("period", "date", "First of month"),
            Column("licensed_users", "int", "Licensed user count"),
            Column("active_users", "int", "Active user count"),
            Column("dau", "int", "Daily active users"),
            Column("mau", "int", "Monthly active users"),
            Column("features_available", "int", "Total features available"),
            Column("features_adopted", "int", "Features adopted"),
            Column("onboarding_completion_pct", "numeric", "Onboarding completion percentage"),
        ],
    ),
    Table(
        name="pds_business_lines",
        description="Business line (service line) dimension — Project Management, Construction Management, etc.",
        pk="business_line_id",
        columns=[
            Column("business_line_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("line_code", "text", "Short code: PM, DM, CM, COST, DESIGN, MSP, LOC, LDA, TETRIS"),
            Column("line_name", "text", "Full name: Project Management, Development Management, etc."),
            Column("line_category", "text", "delivery | advisory | specialty"),
            Column("sort_order", "int", "Display order"),
            Column("is_active", "boolean", "Whether business line is active"),
        ],
    ),
    Table(
        name="pds_leader_coverage",
        description="Bridge table: employee × market × business_line coverage with effective dates. Models the JLL operating grain where leader = coverage combination.",
        pk="leader_coverage_id",
        parent_fk="resource_id → pds_resources, market_id → pds_markets, business_line_id → pds_business_lines",
        columns=[
            Column("leader_coverage_id", "uuid", "Primary key"),
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID — tenant isolation"),
            Column("resource_id", "uuid", "FK to pds_resources — the leader/employee"),
            Column("market_id", "uuid", "FK to pds_markets — covered market"),
            Column("business_line_id", "uuid", "FK to pds_business_lines — covered service line"),
            Column("coverage_role", "text", "leader | deputy | interim"),
            Column("effective_from", "date", "Coverage start date"),
            Column("effective_to", "date", "Coverage end date (NULL = current)"),
            Column("is_primary", "boolean", "Primary leader for this market+BL combination"),
        ],
    ),
]

# ── PDS Analytics Views ──────────────────────────────────────────

PDS_ANALYTICS_VIEWS: list[Table] = [
    Table(
        name="v_pds_utilization_monthly",
        description="Monthly utilization per employee: billable hours / available hours",
        pk="employee_id, period",
        columns=[
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID"),
            Column("employee_id", "uuid", "Employee ID"),
            Column("full_name", "text", "Employee name"),
            Column("role_level", "text", "Role level"),
            Column("region", "text", "Region"),
            Column("period", "date", "First of month"),
            Column("total_hours", "numeric", "Total hours worked"),
            Column("billable_hours", "numeric", "Billable hours"),
            Column("available_hours", "numeric", "Available hours (adjusted for PTO)"),
            Column("utilization_pct", "numeric", "Utilization percentage"),
        ],
    ),
    Table(
        name="v_pds_revenue_variance",
        description="Side-by-side actual vs budget vs forecast revenue per project per period",
        pk="project_id, period",
        columns=[
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID"),
            Column("project_id", "uuid", "Project ID"),
            Column("project_name", "text", "Project name"),
            Column("governance_track", "text", "variable | dedicated"),
            Column("period", "date", "Period"),
            Column("actual_revenue", "numeric", "Actual revenue"),
            Column("budget_revenue", "numeric", "Budget revenue"),
            Column("forecast_6_6_revenue", "numeric", "6+6 forecast revenue"),
            Column("budget_vs_actual_delta", "numeric", "Budget vs actual delta"),
            Column("budget_vs_actual_pct", "numeric", "Budget vs actual percentage"),
        ],
    ),
    Table(
        name="v_pds_account_health",
        description="Account health dashboard: latest NPS, YTD revenue, margin, project counts",
        pk="account_id",
        columns=[
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID"),
            Column("account_id", "uuid", "Account ID"),
            Column("account_name", "text", "Account name"),
            Column("tier", "text", "Account tier"),
            Column("governance_track", "text", "Governance track"),
            Column("latest_nps", "smallint", "Latest NPS score"),
            Column("ytd_revenue", "numeric", "Year-to-date revenue"),
            Column("avg_margin", "numeric", "Average margin"),
            Column("active_projects", "int", "Active project count"),
            Column("nps_health", "text", "green | amber | red | unknown"),
            Column("margin_health", "text", "green | amber | red | unknown"),
        ],
    ),
    Table(
        name="v_pds_nps_summary",
        description="Quarterly NPS: promoter% - detractor% per account",
        pk="account_id, quarter",
        columns=[
            Column("env_id", "uuid", "Environment ID"),
            Column("business_id", "uuid", "Business ID"),
            Column("account_id", "uuid", "Account ID"),
            Column("quarter", "date", "Quarter start date"),
            Column("total_responses", "int", "Total survey responses"),
            Column("promoters", "int", "Promoter count (9-10)"),
            Column("passives", "int", "Passive count (7-8)"),
            Column("detractors", "int", "Detractor count (0-6)"),
            Column("nps_score", "numeric", "Computed NPS score (-100 to +100)"),
        ],
    ),
]

# ── Join graph ────────────────────────────────────────────────────
# Maps (from_table, to_table) → validated join SQL.
# Used by the validator to ensure only safe joins are executed.
# ``cardinality`` helps the validator flag fan-out risk.

@dataclass(frozen=True)
class JoinPath:
    from_table: str
    to_table: str
    join_sql: str
    cardinality: str  # one_to_one | one_to_many | many_to_one | many_to_many
    is_safe: bool = True
    fan_out_warning: str | None = None


JOIN_GRAPH: list[JoinPath] = [
    # REPE hierarchy
    JoinPath("repe_deal", "repe_fund", "repe_deal.fund_id = repe_fund.fund_id", "many_to_one"),
    JoinPath("repe_asset", "repe_deal", "repe_asset.deal_id = repe_deal.deal_id", "many_to_one"),
    JoinPath("repe_property_asset", "repe_asset", "repe_property_asset.asset_id = repe_asset.asset_id", "one_to_one"),
    JoinPath("re_partner", "repe_fund", "re_partner.fund_id = repe_fund.fund_id", "many_to_one"),
    JoinPath("re_partner_commitment", "repe_fund", "re_partner_commitment.fund_id = repe_fund.fund_id", "many_to_one"),
    JoinPath("re_partner_commitment", "re_partner", "re_partner_commitment.partner_id = re_partner.partner_id", "many_to_one"),
    JoinPath("re_loan", "repe_asset", "re_loan.asset_id = repe_asset.asset_id", "many_to_one"),
    JoinPath("re_loan_detail", "repe_asset", "re_loan_detail.asset_id = repe_asset.asset_id", "one_to_one"),
    # Financial statements → entities
    JoinPath("acct_normalized_noi_monthly", "repe_asset", "acct_normalized_noi_monthly.asset_id = repe_asset.asset_id", "many_to_one"),
    JoinPath("re_asset_acct_quarter_rollup", "repe_asset", "re_asset_acct_quarter_rollup.asset_id = repe_asset.asset_id", "many_to_one"),
    JoinPath("re_asset_occupancy_quarter", "repe_asset", "re_asset_occupancy_quarter.asset_id = repe_asset.asset_id", "many_to_one"),
    JoinPath("re_asset_quarter_state", "repe_asset", "re_asset_quarter_state.asset_id = repe_asset.asset_id", "many_to_one"),
    JoinPath("re_fund_quarter_state", "repe_fund", "re_fund_quarter_state.fund_id = repe_fund.fund_id", "many_to_one"),
    JoinPath("re_fund_quarter_metrics", "repe_fund", "re_fund_quarter_metrics.fund_id = repe_fund.fund_id", "many_to_one"),
    JoinPath("re_partner_quarter_metrics", "repe_fund", "re_partner_quarter_metrics.fund_id = repe_fund.fund_id", "many_to_one"),
    JoinPath("re_partner_quarter_metrics", "re_partner", "re_partner_quarter_metrics.partner_id = re_partner.partner_id", "many_to_one"),
    JoinPath("re_loan_covenant_result_qtr", "re_loan", "re_loan_covenant_result_qtr.loan_id = re_loan.loan_id", "many_to_one"),
    JoinPath("re_asset_variance_qtr", "repe_asset", "re_asset_variance_qtr.asset_id = repe_asset.asset_id", "many_to_one"),
    # PDS hierarchy
    JoinPath("pds_projects", "pds_programs", "pds_projects.program_id = pds_programs.program_id", "many_to_one"),
    JoinPath("pds_budget_lines", "pds_projects", "pds_budget_lines.project_id = pds_projects.project_id", "many_to_one"),
    JoinPath("pds_contracts", "pds_projects", "pds_contracts.project_id = pds_projects.project_id", "many_to_one"),
    JoinPath("pds_change_orders", "pds_projects", "pds_change_orders.project_id = pds_projects.project_id", "many_to_one"),
    JoinPath("pds_change_orders", "pds_contracts", "pds_change_orders.contract_id = pds_contracts.contract_id", "many_to_one"),
    # PDS Analytics hierarchy
    JoinPath("pds_analytics_projects", "pds_accounts", "pds_analytics_projects.account_id = pds_accounts.account_id", "many_to_one"),
    JoinPath("pds_revenue_entries", "pds_analytics_projects", "pds_revenue_entries.project_id = pds_analytics_projects.project_id", "many_to_one"),
    JoinPath("pds_revenue_entries", "pds_accounts", "pds_revenue_entries.account_id = pds_accounts.account_id", "many_to_one"),
    JoinPath("pds_analytics_assignments", "pds_analytics_employees", "pds_analytics_assignments.employee_id = pds_analytics_employees.employee_id", "many_to_one"),
    JoinPath("pds_analytics_assignments", "pds_analytics_projects", "pds_analytics_assignments.project_id = pds_analytics_projects.project_id", "many_to_one"),
    JoinPath("pds_analytics_timecards", "pds_analytics_employees", "pds_analytics_timecards.employee_id = pds_analytics_employees.employee_id", "many_to_one"),
    JoinPath("pds_analytics_timecards", "pds_analytics_projects", "pds_analytics_timecards.project_id = pds_analytics_projects.project_id", "many_to_one"),
    JoinPath("pds_nps_responses", "pds_accounts", "pds_nps_responses.account_id = pds_accounts.account_id", "many_to_one"),
    JoinPath("pds_nps_responses", "pds_analytics_projects", "pds_nps_responses.project_id = pds_analytics_projects.project_id", "many_to_one"),
    JoinPath("pds_technology_adoption", "pds_accounts", "pds_technology_adoption.account_id = pds_accounts.account_id", "many_to_one"),
]

# Build lookup for fast validation
_JOIN_LOOKUP: dict[tuple[str, str], JoinPath] = {
    (j.from_table, j.to_table): j for j in JOIN_GRAPH
}


def get_join_path(from_table: str, to_table: str) -> JoinPath | None:
    """Look up a validated join path between two tables."""
    return _JOIN_LOOKUP.get((from_table, to_table)) or _JOIN_LOOKUP.get((to_table, from_table))


# ── Line codes ─────────────────────────────────────────────────────

LINE_CODES = [
    "RENT", "OTHER_INCOME", "EGI", "PAYROLL", "REPAIRS_MAINT", "UTILITIES",
    "TAXES", "INSURANCE", "MGMT_FEES", "TOTAL_OPEX", "NOI", "NOI_MARGIN",
    "CAPEX", "TENANT_IMPROVEMENTS", "LEASING_COMMISSIONS", "REPLACEMENT_RESERVES",
    "DEBT_SERVICE_INT", "DEBT_SERVICE_PRIN", "TOTAL_DEBT_SERVICE",
    "NET_CASH_FLOW", "DSCR", "DEBT_YIELD",
]

# ── Allowlist for SQL validation ───────────────────────────────────

ALLOWED_TABLES = frozenset(
    t.name for t in ENTITY_TABLES + STATEMENT_TABLES + PDS_TABLES + PDS_ANALYTICS_TABLES + PDS_ANALYTICS_VIEWS
)

# ── Catalog text for LLM prompts ──────────────────────────────────


def catalog_text() -> str:
    """Render the catalog as text for embedding in LLM system prompts."""
    lines: list[str] = []

    lines.append("## Entity Hierarchy")
    lines.append("REPE: business → fund → deal → asset → property_asset / loan")
    lines.append("PDS:  business → program → project → budget_lines / contracts / change_orders")
    lines.append("PDS Analytics: business → accounts → projects → revenue_entries / assignments / timecards / nps_responses / technology_adoption")
    lines.append("PDS Analytics: business → employees → assignments → timecards")
    lines.append("All queries scope through business_id (and env_id for PDS) for tenant isolation.")
    lines.append("")

    for t in ENTITY_TABLES + STATEMENT_TABLES + PDS_TABLES + PDS_ANALYTICS_TABLES + PDS_ANALYTICS_VIEWS:
        lines.append(f"### {t.name}")
        lines.append(f"  {t.description}")
        lines.append(f"  PK: {t.pk}")
        if t.parent_fk:
            lines.append(f"  FK: {t.parent_fk}")
        for c in t.columns:
            lines.append(f"  - {c.name} ({c.type}): {c.description}")
        lines.append("")

    lines.append("## Statement line codes")
    lines.append(", ".join(LINE_CODES))

    lines.append("")
    lines.append("## Valid join paths")
    for j in JOIN_GRAPH:
        warning = f" ⚠ {j.fan_out_warning}" if not j.is_safe else ""
        lines.append(f"- {j.from_table} → {j.to_table}: {j.join_sql} ({j.cardinality}){warning}")

    return "\n".join(lines)


def pds_catalog_text() -> str:
    """Render only PDS analytics tables/views for the PDS-specific agent."""
    lines: list[str] = []
    lines.append("## PDS Analytics Schema")
    lines.append("Hierarchy: business → accounts → projects → revenue / assignments / timecards / surveys / adoption")
    lines.append("           business → employees → assignments → timecards")
    lines.append("All queries MUST filter by env_id AND business_id for tenant isolation.")
    lines.append("")

    for t in PDS_ANALYTICS_TABLES + PDS_ANALYTICS_VIEWS:
        lines.append(f"### {t.name}")
        lines.append(f"  {t.description}")
        lines.append(f"  PK: {t.pk}")
        if t.parent_fk:
            lines.append(f"  FK: {t.parent_fk}")
        for c in t.columns:
            lines.append(f"  - {c.name} ({c.type}): {c.description}")
        lines.append("")

    pds_table_names = frozenset(t.name for t in PDS_ANALYTICS_TABLES + PDS_ANALYTICS_VIEWS)
    lines.append("## Valid join paths (PDS Analytics)")
    for j in JOIN_GRAPH:
        if j.from_table in pds_table_names or j.to_table in pds_table_names:
            lines.append(f"- {j.from_table} → {j.to_table}: {j.join_sql} ({j.cardinality})")

    return "\n".join(lines)


def catalog_text_dynamic(*, business_id: str | None = None) -> str:
    """Build catalog text, merging static definitions with live DB catalog.

    Falls back to static-only if business_id is None or the live catalog
    is empty.
    """
    static = catalog_text()
    if not business_id:
        return static

    try:
        from app.services.semantic_catalog import catalog_text_from_db
        dynamic = catalog_text_from_db(business_id=business_id)
        if dynamic:
            return static + "\n\n" + dynamic
    except Exception:
        pass  # DB not available or tables don't exist yet — use static
    return static
