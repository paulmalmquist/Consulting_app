"""Dataclasses for the v2 scenario execution engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class AssetAssumptions:
    """Resolved assumptions for a single asset (base + overrides merged)."""

    asset_id: str
    asset_name: str
    fund_id: str | None
    fund_name: str | None

    # Base financials from schedules
    base_revenue: dict[date, Decimal] = field(default_factory=dict)
    base_expense: dict[date, Decimal] = field(default_factory=dict)
    base_amort: dict[date, Decimal] = field(default_factory=dict)

    # Operating overrides
    rent_growth_pct: float = 0.0
    occupancy_pct: float | None = None
    vacancy_pct: float | None = None
    bad_debt_pct: float = 0.0
    other_income_growth_pct: float = 0.0
    concessions_pct: float = 0.0
    revenue_delta_pct: float = 0.0

    # Expense overrides
    payroll_growth_pct: float = 0.0
    rm_growth_pct: float = 0.0
    utilities_growth_pct: float = 0.0
    insurance_growth_pct: float = 0.0
    tax_growth_pct: float = 0.0
    mgmt_fee_pct: float = 0.0
    expense_delta_pct: float = 0.0

    # Capital overrides
    recurring_capex: float = 0.0
    onetime_capex: float = 0.0
    capex_override: float | None = None
    replacement_reserves: float = 0.0

    # Debt
    loan_balance: float | None = None
    interest_rate_pct: float | None = None
    spread_bps: float | None = None
    sofr_pct: float | None = None
    io_period_months: int | None = None
    amort_years: int | None = None
    maturity_date: date | None = None
    refi_date: date | None = None
    refi_proceeds: float | None = None
    amort_delta_pct: float = 0.0

    # Exit
    sale_date: date | None = None
    exit_cap_rate_pct: float | None = None
    exit_noi_basis: float | None = None
    disposition_cost_pct: float = 2.0
    broker_fee_pct: float = 1.0
    net_proceeds_haircut_pct: float = 0.0

    # Hard overrides
    noi_override: float | None = None
    revenue_override_q: float | None = None
    capex_override_q: float | None = None

    # Ownership
    ownership_pct: float = 100.0


@dataclass
class PeriodCashflow:
    """Single period's projected cashflows for an asset."""

    period_date: date
    revenue: float = 0.0
    expenses: float = 0.0
    noi: float = 0.0
    capex: float = 0.0
    debt_service: float = 0.0
    net_cash_flow: float = 0.0
    sale_proceeds: float = 0.0
    equity_cash_flow: float = 0.0


@dataclass
class ExitResult:
    """Exit/disposition calculation results."""

    sale_date: date | None = None
    terminal_noi: float = 0.0
    gross_sale_price: float = 0.0
    disposition_costs: float = 0.0
    broker_fees: float = 0.0
    net_sale_proceeds: float = 0.0
    loan_payoff: float = 0.0
    equity_proceeds: float = 0.0


@dataclass
class ReturnMetrics:
    """Computed return metrics for a scope (asset or fund)."""

    scope_type: str  # 'asset' or 'fund'
    scope_id: str
    gross_irr: float | None = None
    net_irr: float | None = None
    gross_moic: float | None = None
    net_moic: float | None = None
    dpi: float | None = None
    rvpi: float | None = None
    tvpi: float | None = None
    ending_nav: float | None = None


@dataclass
class AssetResult:
    """Complete result for a single asset in a scenario run."""

    asset_id: str
    asset_name: str
    fund_id: str | None
    fund_name: str | None
    cashflows: list[PeriodCashflow] = field(default_factory=list)
    exit: ExitResult | None = None
    metrics: ReturnMetrics | None = None


@dataclass
class ScenarioRunResult:
    """Complete result of a scenario execution."""

    run_id: str
    scenario_id: str
    model_id: str
    status: str = "success"
    asset_results: list[AssetResult] = field(default_factory=list)
    fund_metrics: list[ReturnMetrics] = field(default_factory=list)
    summary: dict = field(default_factory=dict)
