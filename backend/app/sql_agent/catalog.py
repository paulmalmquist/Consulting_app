"""Data catalog — structured representation of REPE database schema.

Used by the router and SQL generator as grounding context so the LLM
never has to guess table or column names.
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
]

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
    t.name for t in ENTITY_TABLES + STATEMENT_TABLES
)

# ── Catalog text for LLM prompts ──────────────────────────────────


def catalog_text() -> str:
    """Render the catalog as text for embedding in LLM system prompts."""
    lines: list[str] = []

    lines.append("## Entity Hierarchy")
    lines.append("business → fund → deal → asset → property_asset / loan")
    lines.append("All queries scope through repe_fund.business_id for tenant isolation.")
    lines.append("")

    for t in ENTITY_TABLES + STATEMENT_TABLES:
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
    return "\n".join(lines)
