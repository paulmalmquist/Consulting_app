"""Pydantic schemas for financial intelligence endpoints."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ── Accounting Import ────────────────────────────────────────────────────────

class AccountingImportItem(BaseModel):
    asset_id: UUID | None = None
    period_month: date
    gl_account: str
    amount: Decimal


class AccountingImportRequest(BaseModel):
    env_id: str
    business_id: UUID
    source_name: str
    payload: list[AccountingImportItem]


class AccountingImportResult(BaseModel):
    source_hash: str
    rows_loaded: int
    rows_normalized: int


# ── Budget / UW Version ──────────────────────────────────────────────────────

class UwVersionCreateRequest(BaseModel):
    env_id: str
    business_id: UUID
    name: str
    scenario_id: UUID | None = None
    effective_from: str | None = None


class UwVersionOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    name: str
    scenario_id: UUID | None = None
    effective_from: date
    created_at: datetime


class NoiBudgetMonthlyItem(BaseModel):
    asset_id: UUID
    uw_version_id: UUID
    period_month: date
    line_code: str
    amount: Decimal
    currency: str = "USD"


class NoiBudgetMonthlyRequest(BaseModel):
    env_id: str
    business_id: UUID
    items: list[NoiBudgetMonthlyItem]


# ── Variance ─────────────────────────────────────────────────────────────────

class VarianceItem(BaseModel):
    id: UUID
    run_id: UUID
    env_id: str
    business_id: UUID
    fund_id: UUID
    investment_id: UUID | None = None
    asset_id: UUID
    quarter: str
    line_code: str
    actual_amount: Decimal
    plan_amount: Decimal
    variance_amount: Decimal
    variance_pct: Decimal | None = None


class VarianceRollup(BaseModel):
    total_actual: str
    total_plan: str
    total_variance: str
    total_variance_pct: str | None = None


class VarianceResult(BaseModel):
    items: list[VarianceItem]
    rollup: VarianceRollup


# ── Fund Metrics ─────────────────────────────────────────────────────────────

class FundMetricsQtr(BaseModel):
    id: UUID
    run_id: UUID
    env_id: str
    business_id: UUID
    fund_id: UUID
    quarter: str
    gross_irr: Decimal | None = None
    net_irr: Decimal | None = None
    gross_tvpi: Decimal | None = None
    net_tvpi: Decimal | None = None
    dpi: Decimal | None = None
    rvpi: Decimal | None = None
    cash_on_cash: Decimal | None = None
    gross_net_spread: Decimal | None = None
    inputs_missing: Any | None = None


class GrossNetBridge(BaseModel):
    id: UUID
    run_id: UUID
    env_id: str
    business_id: UUID
    fund_id: UUID
    quarter: str
    gross_return: Decimal
    mgmt_fees: Decimal
    fund_expenses: Decimal
    carry_shadow: Decimal
    net_return: Decimal


class FundMetricsResult(BaseModel):
    metrics: FundMetricsQtr | None = None
    bridge: GrossNetBridge | None = None


# ── Runs ─────────────────────────────────────────────────────────────────────

class RunQuarterCloseRequest(BaseModel):
    env_id: str
    business_id: UUID
    fund_id: UUID
    quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")
    scenario_id: str | None = None
    uw_version_id: UUID | None = None
    accounting_source_hash: str | None = None


class RunCovenantTestRequest(BaseModel):
    env_id: str
    business_id: UUID
    fund_id: UUID
    quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")


class RunWaterfallShadowRequest(BaseModel):
    env_id: str
    business_id: UUID
    fund_id: UUID
    quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")


class RunOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    fund_id: UUID
    quarter: str
    scenario_id: str | None = None
    run_type: str
    status: str
    input_hash: str | None = None
    output_hash: str | None = None
    created_at: datetime
    created_by: str | None = None


class RunQuarterCloseResult(BaseModel):
    run_id: str
    fund_id: str
    quarter: str
    run_type: str
    status: str
    variance: dict | None = None
    fee_accrual: str | None = None
    metrics: dict | None = None
    bridge: dict | None = None
    inputs_missing: list[str] = Field(default_factory=list)


class RunCovenantTestResult(BaseModel):
    run_id: str
    fund_id: str
    quarter: str
    run_type: str
    status: str
    results: list[dict] = Field(default_factory=list)
    violations: int = 0
    total_tested: int = 0


# ── Debt Surveillance ────────────────────────────────────────────────────────

class LoanOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    fund_id: UUID
    investment_id: UUID | None = None
    asset_id: UUID | None = None
    loan_name: str
    upb: Decimal
    rate_type: str
    rate: Decimal
    spread: Decimal | None = None
    maturity: date | None = None
    amort_type: str
    created_at: datetime


class CovenantDefinitionOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    loan_id: UUID
    covenant_type: str
    comparator: str
    threshold: Decimal
    frequency: str
    cure_days: int
    active: bool
    created_at: datetime


class CovenantResultOut(BaseModel):
    id: UUID
    run_id: UUID
    env_id: str
    business_id: UUID
    fund_id: UUID
    loan_id: UUID
    quarter: str
    dscr: Decimal | None = None
    ltv: Decimal | None = None
    debt_yield: Decimal | None = None
    pass_field: bool = Field(alias="pass", default=True)
    headroom: Decimal | None = None
    breached: bool = False
    created_at: datetime

    class Config:
        populate_by_name = True


class WatchlistEventOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID
    fund_id: UUID
    loan_id: UUID
    quarter: str
    severity: str
    reason: str
    created_at: datetime


# ── Sale Scenarios ──────────────────────────────────────────────────────────

class SaleAssumptionCreate(BaseModel):
    scenario_id: UUID
    deal_id: UUID
    asset_id: UUID | None = None
    sale_price: Decimal
    sale_date: date
    buyer_costs: Decimal = Decimal("0")
    disposition_fee_pct: Decimal = Decimal("0")
    memo: str | None = None


class SaleAssumptionOut(BaseModel):
    id: int
    fund_id: UUID
    scenario_id: UUID
    deal_id: UUID
    asset_id: UUID | None = None
    sale_price: Decimal
    sale_date: date
    buyer_costs: Decimal
    disposition_fee_pct: Decimal
    memo: str | None = None
    created_by: str | None = None
    created_at: datetime


class ScenarioComputeRequest(BaseModel):
    scenario_id: UUID
    quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")
    env_id: str
    business_id: UUID


class ScenarioComputeResult(BaseModel):
    scenario_id: str
    fund_id: str
    quarter: str
    base_gross_irr: str | None = None
    scenario_gross_irr: str | None = None
    irr_delta: str | None = None
    base_gross_tvpi: str | None = None
    scenario_gross_tvpi: str | None = None
    tvpi_delta: str | None = None
    scenario_net_irr: str | None = None
    scenario_net_tvpi: str | None = None
    scenario_dpi: str | None = None
    scenario_rvpi: str | None = None
    carry_estimate: str
    total_sale_proceeds: str
    sale_count: int
    snapshot_id: str | None = None


# ── LP Summary ──────────────────────────────────────────────────────────────

class WaterfallAllocation(BaseModel):
    return_of_capital: str | None = None
    preferred_return: str | None = None
    carry: str | None = None
    total: str | None = None


class LpPartnerSummary(BaseModel):
    partner_id: str
    name: str
    partner_type: str
    committed: str
    contributed: str
    distributed: str
    nav_share: str | None = None
    dpi: str | None = None
    tvpi: str | None = None
    waterfall_allocation: WaterfallAllocation | None = None


class LpSummaryResult(BaseModel):
    fund_id: str
    quarter: str
    fund_metrics: dict = Field(default_factory=dict)
    gross_net_bridge: dict = Field(default_factory=dict)
    partners: list[LpPartnerSummary] = Field(default_factory=list)
    total_committed: str
    total_contributed: str
    total_distributed: str
    fund_nav: str
