"""Pydantic schemas for Real Estate Fund Valuation API."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Assumption Sets
# ---------------------------------------------------------------------------

class CreateAssumptionSetRequest(BaseModel):
    tenant_id: str | None = None
    business_id: str | None = None
    cap_rate: float = Field(..., gt=0, le=1, description="e.g. 0.055")
    exit_cap_rate: float = Field(..., gt=0, le=1)
    discount_rate: float = Field(..., gt=0, le=1)
    rent_growth: float = 0.02
    expense_growth: float = 0.03
    vacancy_assumption: float = 0.05
    sale_costs_pct: float = 0.02
    capex_reserve_pct: float = 0.0
    weight_direct_cap: float = 1.0
    weight_dcf: float = 0.0
    created_by: str | None = None
    rationale: str | None = None
    custom_assumptions: dict | None = None


class AssumptionSetResponse(BaseModel):
    assumption_set_id: str
    cap_rate: float
    exit_cap_rate: float
    discount_rate: float
    rent_growth: float
    expense_growth: float
    vacancy_assumption: float
    sale_costs_pct: float
    weight_direct_cap: float
    weight_dcf: float
    created_at: str | None = None


# ---------------------------------------------------------------------------
# Quarterly Financials
# ---------------------------------------------------------------------------

class UpsertQuarterlyFinancialsRequest(BaseModel):
    fin_asset_investment_id: str
    quarter: str = Field(..., pattern=r"^\d{4}Q[1-4]$")
    gross_potential_rent: float
    vacancy_loss: float
    effective_gross_income: float
    operating_expenses: float
    net_operating_income: float
    occupancy_pct: float | None = None
    capex: float = 0
    other_income: float = 0


# ---------------------------------------------------------------------------
# Loans
# ---------------------------------------------------------------------------

class CreateLoanRequest(BaseModel):
    fin_asset_investment_id: str
    original_balance: float
    current_balance: float
    interest_rate: float
    amortization_years: int | None = None
    term_years: int | None = None
    maturity_date: str | None = None
    io_period_months: int = 0
    loan_type: str = "fixed"
    annual_debt_service: float | None = None
    lender: str | None = None


# ---------------------------------------------------------------------------
# Valuation Run
# ---------------------------------------------------------------------------

class RunQuarterRequest(BaseModel):
    fin_asset_investment_id: str
    quarter: str = Field(..., pattern=r"^\d{4}Q[1-4]$")
    assumption_set_id: str
    fin_fund_id: str | None = None
    forward_noi_override: float | None = None
    accrued_pref: float = 0
    deduct_pref_from_nav: bool = False
    cumulative_contributions: float = 0
    cumulative_distributions: float = 0
    cashflows_for_irr: list[list[float]] | None = None


class ValuationSnapshotResponse(BaseModel):
    valuation_snapshot_id: str
    fin_asset_investment_id: str
    quarter: str
    assumption_set_id: str
    method_used: str
    implied_value_cap: float | None = None
    implied_value_dcf: float | None = None
    implied_value_blended: float
    implied_equity_value: float
    nav_equity: float
    unrealized_gain: float | None = None
    irr_to_date: float | None = None
    input_hash: str
    code_version: str | None = None
    created_at: str | None = None


class AssetFinancialStateResponse(BaseModel):
    id: str
    fin_asset_investment_id: str
    fin_fund_id: str | None = None
    quarter: str
    valuation_snapshot_id: str
    trailing_noi: float | None = None
    forward_12_noi: float | None = None
    gross_potential_rent: float | None = None
    vacancy_loss: float | None = None
    effective_gross_income: float | None = None
    operating_expenses: float | None = None
    net_operating_income: float | None = None
    loan_balance: float | None = None
    interest_rate: float | None = None
    debt_service: float | None = None
    dscr: float | None = None
    debt_yield: float | None = None
    ltv: float | None = None
    implied_gross_value: float | None = None
    implied_equity_value: float | None = None
    nav_equity: float | None = None
    unfunded_capex: float | None = None
    accrued_pref: float | None = None
    cumulative_contributions: float | None = None
    cumulative_distributions: float | None = None
    created_at: str | None = None
    # Joined from snapshot
    sensitivities_json: dict | None = None
    input_hash: str | None = None
    code_version: str | None = None


class RunQuarterResponse(BaseModel):
    valuation_snapshot: dict
    asset_financial_state: dict
    input_hash: str
