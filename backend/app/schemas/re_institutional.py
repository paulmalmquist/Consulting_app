from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

# ── Type aliases ──────────────────────────────────────────────────────────────

StrategyType = Literal["equity", "credit", "cmbs"]
AssetStatus = Literal["pipeline", "active", "held", "exited", "written_off"]
JvStatus = Literal["active", "dissolved", "pending"]
PartnerType = Literal["gp", "lp", "co_invest", "sponsor"]
ShareClass = Literal["common", "pref", "promote"]
CommitmentStatus = Literal["active", "fully_called", "cancelled"]
LedgerEntryType = Literal[
    "commitment", "contribution", "distribution", "fee",
    "recallable_dist", "trueup", "reversal",
]
LedgerSource = Literal["manual", "imported", "generated"]
CashflowType = Literal[
    "operating_cf", "capex", "debt_draw", "debt_paydown",
    "sale_proceeds", "refinancing_proceeds", "fees",
]
ValuationMethod = Literal["cap_rate", "dcf", "blended", "market", "loan_mark"]
AccountingBasis = Literal["cash", "accrual"]
WaterfallType = Literal["european", "american"]
WaterfallTierType = Literal[
    "return_of_capital", "preferred_return", "catch_up", "split", "promote",
]
WaterfallRunType = Literal["shadow", "actual", "proposed"]
ScenarioType = Literal["base", "stress", "upside", "downside", "custom"]
ScenarioStatus = Literal["active", "archived"]
RunType = Literal["quarter_close", "valuation", "waterfall", "metrics", "rollup"]
RunStatus = Literal["running", "success", "failed"]
ScopeType = Literal[
    "fund", "investment", "jv", "asset", "asset_type_property", "asset_type_loan",
]
ValueType = Literal["decimal", "int", "string", "bool", "curve_json"]
ScopeNodeType = Literal["fund", "investment", "jv", "asset"]
AccountRole = Literal[
    "rental_income", "opex", "debt_service", "capex", "cash",
    "noi", "nav", "revenue", "interest_income",
]


# ── Investment (wraps repe_deal) ──────────────────────────────────────────────

class ReInvestmentCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    deal_type: Literal["equity", "debt"] = "equity"
    stage: Literal["sourcing", "underwriting", "ic", "closing", "operating", "exited"] = "sourcing"
    sponsor: str | None = Field(default=None, max_length=160)
    target_close_date: date | None = None
    committed_capital: Decimal | None = Field(default=None, ge=0)
    invested_capital: Decimal | None = Field(default=None, ge=0)
    realized_distributions: Decimal | None = Field(default=None, ge=0)


class ReInvestmentOut(BaseModel):
    investment_id: UUID
    fund_id: UUID
    name: str
    investment_type: str
    stage: str
    sponsor: str | None = None
    target_close_date: date | None = None
    committed_capital: Decimal | None = None
    invested_capital: Decimal | None = None
    realized_distributions: Decimal | None = None
    created_at: datetime


# ── JV Entity ────────────────────────────────────────────────────────────────

class ReJvCreateRequest(BaseModel):
    legal_name: str = Field(min_length=2, max_length=300)
    ownership_percent: Decimal = Field(default=Decimal("1.0"), gt=0, le=1)
    gp_percent: Decimal | None = Field(default=None, ge=0, le=1)
    lp_percent: Decimal | None = Field(default=None, ge=0, le=1)
    promote_structure_id: UUID | None = None


class ReJvOut(BaseModel):
    jv_id: UUID
    investment_id: UUID
    legal_name: str
    ownership_percent: Decimal
    gp_percent: Decimal | None = None
    lp_percent: Decimal | None = None
    promote_structure_id: UUID | None = None
    status: str
    created_at: datetime


# ── Partner Model ─────────────────────────────────────────────────────────────

class RePartnerCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    partner_type: PartnerType
    entity_id: UUID | None = None


class RePartnerOut(BaseModel):
    partner_id: UUID
    business_id: UUID
    entity_id: UUID | None = None
    name: str
    partner_type: str
    created_at: datetime


class RePartnerCommitmentCreateRequest(BaseModel):
    committed_amount: Decimal = Field(gt=0)
    commitment_date: date


class RePartnerCommitmentOut(BaseModel):
    commitment_id: UUID
    partner_id: UUID
    fund_id: UUID
    committed_amount: Decimal
    commitment_date: date
    status: str
    created_at: datetime


class ReJvPartnerShareCreateRequest(BaseModel):
    partner_id: UUID
    ownership_percent: Decimal = Field(gt=0, le=1)
    share_class: ShareClass = "common"
    effective_from: date
    effective_to: date | None = None


class ReJvPartnerShareOut(BaseModel):
    id: UUID
    jv_id: UUID
    partner_id: UUID
    ownership_percent: Decimal
    share_class: str
    effective_from: date
    effective_to: date | None = None
    created_at: datetime


# ── Capital Ledger ────────────────────────────────────────────────────────────

class ReCapitalLedgerEntryCreateRequest(BaseModel):
    partner_id: UUID
    entry_type: LedgerEntryType
    amount: Decimal
    effective_date: date
    quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")
    investment_id: UUID | None = None
    jv_id: UUID | None = None
    currency: str = "USD"
    fx_rate_to_base: Decimal = Decimal("1.0")
    memo: str | None = None
    source: LedgerSource = "manual"
    source_ref: UUID | None = None


class ReCapitalLedgerEntryOut(BaseModel):
    entry_id: UUID
    fund_id: UUID
    investment_id: UUID | None = None
    jv_id: UUID | None = None
    partner_id: UUID
    entry_type: str
    amount: Decimal
    currency: str
    fx_rate_to_base: Decimal
    amount_base: Decimal
    effective_date: date
    quarter: str
    memo: str | None = None
    source: str
    source_ref: UUID | None = None
    run_id: UUID | None = None
    created_at: datetime


# ── Cashflow Ledger ───────────────────────────────────────────────────────────

class ReCashflowEntryCreateRequest(BaseModel):
    jv_id: UUID | None = None
    asset_id: UUID | None = None
    cashflow_type: CashflowType
    amount_base: Decimal
    effective_date: date
    quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")
    memo: str | None = None


class ReCashflowEntryOut(BaseModel):
    entry_id: UUID
    fund_id: UUID
    jv_id: UUID | None = None
    asset_id: UUID | None = None
    cashflow_type: str
    amount_base: Decimal
    effective_date: date
    quarter: str
    memo: str | None = None
    run_id: UUID | None = None
    created_at: datetime


# ── Loan Detail ───────────────────────────────────────────────────────────────

class ReLoanDetailCreateRequest(BaseModel):
    original_balance: Decimal = Field(gt=0)
    current_balance: Decimal = Field(gt=0)
    coupon: Decimal | None = Field(default=None, ge=0)
    maturity_date: date | None = None
    rating: str | None = None
    ltv: Decimal | None = Field(default=None, ge=0, le=2)
    dscr: Decimal | None = Field(default=None, ge=0)


class ReLoanDetailOut(BaseModel):
    asset_id: UUID
    original_balance: Decimal
    current_balance: Decimal
    coupon: Decimal | None = None
    maturity_date: date | None = None
    rating: str | None = None
    ltv: Decimal | None = None
    dscr: Decimal | None = None
    created_at: datetime


# ── Asset Account Map ─────────────────────────────────────────────────────────

class ReAssetAccountMapCreateRequest(BaseModel):
    account_id: UUID
    role: AccountRole


class ReAssetAccountMapOut(BaseModel):
    id: UUID
    asset_id: UUID
    account_id: UUID
    role: str
    created_at: datetime


# ── Quarter State (read-only outputs) ─────────────────────────────────────────

class ReAssetQuarterStateOut(BaseModel):
    id: UUID
    asset_id: UUID
    quarter: str
    scenario_id: UUID | None = None
    run_id: UUID
    accounting_basis: str
    noi: Decimal | None = None
    revenue: Decimal | None = None
    other_income: Decimal | None = None
    opex: Decimal | None = None
    capex: Decimal | None = None
    debt_service: Decimal | None = None
    leasing_costs: Decimal | None = None
    tenant_improvements: Decimal | None = None
    free_rent: Decimal | None = None
    net_cash_flow: Decimal | None = None
    occupancy: Decimal | None = None
    debt_balance: Decimal | None = None
    cash_balance: Decimal | None = None
    asset_value: Decimal | None = None
    implied_equity_value: Decimal | None = None
    nav: Decimal | None = None
    ltv: Decimal | None = None
    dscr: Decimal | None = None
    debt_yield: Decimal | None = None
    valuation_method: str | None = None
    value_source: str | None = None
    inputs_hash: str
    created_at: datetime


class ReJvQuarterStateOut(BaseModel):
    id: UUID
    jv_id: UUID
    quarter: str
    scenario_id: UUID | None = None
    run_id: UUID
    nav: Decimal | None = None
    noi: Decimal | None = None
    debt_balance: Decimal | None = None
    cash_balance: Decimal | None = None
    inputs_hash: str
    created_at: datetime


class ReInvestmentQuarterStateOut(BaseModel):
    id: UUID
    investment_id: UUID
    quarter: str
    scenario_id: UUID | None = None
    run_id: UUID
    nav: Decimal | None = None
    committed_capital: Decimal | None = None
    invested_capital: Decimal | None = None
    realized_distributions: Decimal | None = None
    unrealized_value: Decimal | None = None
    gross_asset_value: Decimal | None = None
    debt_balance: Decimal | None = None
    cash_balance: Decimal | None = None
    effective_ownership_percent: Decimal | None = None
    fund_nav_contribution: Decimal | None = None
    gross_irr: Decimal | None = None
    net_irr: Decimal | None = None
    equity_multiple: Decimal | None = None
    inputs_hash: str
    created_at: datetime


class ReFundQuarterStateOut(BaseModel):
    id: UUID
    fund_id: UUID
    quarter: str
    scenario_id: UUID | None = None
    run_id: UUID
    portfolio_nav: Decimal | None = None
    total_committed: Decimal | None = None
    total_called: Decimal | None = None
    total_distributed: Decimal | None = None
    dpi: Decimal | None = None
    rvpi: Decimal | None = None
    tvpi: Decimal | None = None
    gross_irr: Decimal | None = None
    net_irr: Decimal | None = None
    weighted_ltv: Decimal | None = None
    weighted_dscr: Decimal | None = None
    inputs_hash: str
    created_at: datetime


# ── Partner Metrics ───────────────────────────────────────────────────────────

class RePartnerQuarterMetricsOut(BaseModel):
    id: UUID
    partner_id: UUID
    fund_id: UUID
    quarter: str
    scenario_id: UUID | None = None
    run_id: UUID
    contributed_to_date: Decimal | None = None
    distributed_to_date: Decimal | None = None
    nav: Decimal | None = None
    dpi: Decimal | None = None
    tvpi: Decimal | None = None
    irr: Decimal | None = None
    created_at: datetime


class ReFundQuarterMetricsOut(BaseModel):
    id: UUID
    fund_id: UUID
    quarter: str
    scenario_id: UUID | None = None
    run_id: UUID
    contributed_to_date: Decimal | None = None
    distributed_to_date: Decimal | None = None
    nav: Decimal | None = None
    dpi: Decimal | None = None
    tvpi: Decimal | None = None
    irr: Decimal | None = None
    created_at: datetime


class ReEnvironmentPortfolioKpisOut(BaseModel):
    env_id: str
    business_id: str
    quarter: str
    scenario_id: str | None = None
    fund_count: int
    total_commitments: str
    portfolio_nav: str | None = None
    active_assets: int
    gross_irr: str | None = None
    net_irr: str | None = None
    warnings: list[str] = Field(default_factory=list)


# ── Waterfall ─────────────────────────────────────────────────────────────────

class ReWaterfallDefinitionCreateRequest(BaseModel):
    name: str = Field(default="Default", max_length=200)
    waterfall_type: WaterfallType
    effective_date: date | None = None
    tiers: list[ReWaterfallTierInput] = Field(default_factory=list)


class ReWaterfallTierInput(BaseModel):
    tier_order: int = Field(ge=1)
    tier_type: WaterfallTierType
    hurdle_rate: Decimal | None = None
    split_gp: Decimal | None = Field(default=None, ge=0, le=1)
    split_lp: Decimal | None = Field(default=None, ge=0, le=1)
    catch_up_percent: Decimal | None = Field(default=None, ge=0, le=1)
    notes: str | None = None


# Forward ref fix
ReWaterfallDefinitionCreateRequest.model_rebuild()


class ReWaterfallDefinitionOut(BaseModel):
    definition_id: UUID
    fund_id: UUID
    name: str
    waterfall_type: str
    version: int
    effective_date: date
    is_active: bool
    created_at: datetime
    tiers: list[ReWaterfallTierOut] = Field(default_factory=list)


class ReWaterfallTierOut(BaseModel):
    tier_id: UUID
    definition_id: UUID
    tier_order: int
    tier_type: str
    hurdle_rate: Decimal | None = None
    split_gp: Decimal | None = None
    split_lp: Decimal | None = None
    catch_up_percent: Decimal | None = None
    notes: str | None = None


class ReWaterfallRunRequest(BaseModel):
    quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")
    scenario_id: UUID | None = None
    run_type: WaterfallRunType = "shadow"
    definition_id: UUID | None = None


class ReWaterfallRunOut(BaseModel):
    run_id: UUID
    fund_id: UUID
    definition_id: UUID
    quarter: str
    scenario_id: UUID | None = None
    run_type: str
    total_distributable: Decimal | None = None
    inputs_hash: str | None = None
    status: str
    created_at: datetime
    results: list[ReWaterfallRunResultOut] = Field(default_factory=list)


class ReWaterfallRunResultOut(BaseModel):
    result_id: UUID
    run_id: UUID
    partner_id: UUID
    tier_code: str
    payout_type: str
    amount: Decimal
    tier_breakdown_json: dict[str, Any] | None = None
    ending_capital_balance: Decimal | None = None
    created_at: datetime


# ── Scenario System ───────────────────────────────────────────────────────────

class ReScenarioCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    scenario_type: ScenarioType = "custom"
    parent_scenario_id: UUID | None = None


class ReScenarioOut(BaseModel):
    scenario_id: UUID
    fund_id: UUID
    name: str
    description: str | None = None
    scenario_type: str
    is_base: bool
    parent_scenario_id: UUID | None = None
    base_assumption_set_id: UUID | None = None
    status: str
    created_at: datetime


ModelType = Literal["underwriting_io", "forecast", "scenario", "downside", "upside"]


class ReModelCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    strategy_type: Literal["equity", "credit", "cmbs", "mixed"] | None = None
    model_type: ModelType = "scenario"
    env_id: UUID | None = None
    primary_fund_id: UUID | None = None


class ReModelPatchRequest(BaseModel):
    status: str | None = None
    name: str | None = None
    description: str | None = None
    strategy_type: str | None = None
    model_type: ModelType | None = None


class ReModelOut(BaseModel):
    model_id: UUID
    primary_fund_id: UUID | None = None
    env_id: UUID | None = None
    name: str
    description: str | None = None
    status: str
    model_type: str | None = None
    locked_at: datetime | None = None
    strategy_type: str | None = None
    base_snapshot_id: UUID | None = None
    created_by: str | None = None
    approved_at: datetime | None = None
    approved_by: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


# ── Model Scope ──────────────────────────────────────────────────────────────

class ReModelScopeInput(BaseModel):
    scope_type: ScopeNodeType
    scope_node_id: UUID


class ReModelScopeOut(BaseModel):
    id: UUID
    model_id: UUID
    scope_type: str
    scope_node_id: UUID
    include: bool
    created_at: datetime


# ── Model Override ───────────────────────────────────────────────────────────

class ReModelOverrideInput(BaseModel):
    scope_node_type: ScopeNodeType
    scope_node_id: UUID
    key: str = Field(min_length=1, max_length=100)
    value_type: ValueType = "decimal"
    value_decimal: Decimal | None = None
    value_int: int | None = None
    value_text: str | None = None
    value_json: Any | None = None
    reason: str | None = None


class ReModelOverrideOut(BaseModel):
    id: UUID
    model_id: UUID
    scope_node_type: str
    scope_node_id: UUID
    key: str
    value_type: str
    value_decimal: Decimal | None = None
    value_int: int | None = None
    value_text: str | None = None
    value_json: Any | None = None
    reason: str | None = None
    is_active: bool
    created_at: datetime


# ── Model Monte Carlo ────────────────────────────────────────────────────────

class ReModelMcRunRequest(BaseModel):
    quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")
    n_sims: int = Field(default=1000, ge=100, le=100000)
    seed: int = 42
    distribution_params: dict | None = None


class ReModelMcRunOut(BaseModel):
    id: UUID
    model_id: UUID
    fund_id: UUID
    quarter: str
    n_sims: int
    seed: int
    status: str
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime


class ReModelMcResultOut(BaseModel):
    id: UUID
    mc_run_id: UUID
    result_level: str
    entity_id: UUID | None = None
    mean_irr: Decimal | None = None
    median_irr: Decimal | None = None
    std_irr: Decimal | None = None
    impairment_probability: Decimal | None = None
    var_95: Decimal | None = None
    expected_moic: Decimal | None = None
    promote_trigger_probability: Decimal | None = None
    percentile_buckets_json: dict | None = None
    created_at: datetime


class ReScenarioVersionCreateRequest(BaseModel):
    model_id: UUID
    label: str | None = None
    assumption_set_id: UUID | None = None


class ReScenarioVersionOut(BaseModel):
    version_id: UUID
    scenario_id: UUID
    model_id: UUID
    version_number: int
    label: str | None = None
    assumption_set_id: UUID | None = None
    is_locked: bool
    locked_at: datetime | None = None
    locked_by: str | None = None
    notes: str | None = None
    created_at: datetime


class ReAssumptionSetCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    notes: str | None = None
    created_by: str | None = None


class ReAssumptionSetOut(BaseModel):
    assumption_set_id: UUID
    fund_id: UUID | None = None
    name: str
    version: int
    inputs_hash: str | None = None
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime


class ReAssumptionValueInput(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    scope_type: ScopeType = "fund"
    value_type: ValueType = "decimal"
    value_decimal: Decimal | None = None
    value_int: int | None = None
    value_text: str | None = None
    value_json: Any | None = None
    unit: str | None = None


class ReAssumptionOverrideInput(BaseModel):
    scope_node_type: ScopeNodeType
    scope_node_id: UUID
    key: str = Field(min_length=1, max_length=100)
    value_type: ValueType = "decimal"
    value_decimal: Decimal | None = None
    value_int: int | None = None
    value_text: str | None = None
    value_json: Any | None = None
    reason: str | None = None


class ReAssumptionOverrideOut(BaseModel):
    override_id: UUID
    scenario_id: UUID
    scope_node_type: str
    scope_node_id: UUID
    key: str
    value_type: str
    value_decimal: Decimal | None = None
    value_int: int | None = None
    value_text: str | None = None
    value_json: Any | None = None
    reason: str | None = None
    is_active: bool
    created_at: datetime


# ── Run Provenance ────────────────────────────────────────────────────────────

class ReRunProvenanceOut(BaseModel):
    provenance_id: UUID
    run_id: UUID
    run_type: str
    fund_id: UUID
    quarter: str
    scenario_id: UUID | None = None
    effective_assumptions_hash: str | None = None
    ledger_inputs_hash: str | None = None
    status: str
    error_message: str | None = None
    triggered_by: str | None = None
    started_at: datetime
    completed_at: datetime | None = None


# ── Quarter Close ─────────────────────────────────────────────────────────────

class ReQuarterCloseRequest(BaseModel):
    quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")
    run_id: UUID | None = None
    scenario_id: UUID | None = None
    accounting_basis: AccountingBasis = "accrual"
    valuation_method: ValuationMethod = "cap_rate"
    run_waterfall: bool = False


class ReQuarterCloseOut(BaseModel):
    run_id: UUID
    fund_id: UUID
    quarter: str
    scenario_id: UUID | None = None
    fund_state: ReFundQuarterStateOut | None = None
    fund_metrics: ReFundQuarterMetricsOut | None = None
    waterfall_run: ReWaterfallRunOut | None = None
    assets_processed: int = 0
    jvs_processed: int = 0
    investments_processed: int = 0
    status: str = "success"


# ── Underwriting Links ───────────────────────────────────────────────────────

class ReUwLinkRequest(BaseModel):
    model_id: UUID


class ReUwLinkOut(BaseModel):
    id: UUID
    investment_id: UUID
    model_id: UUID
    linked_at: datetime
    linked_by: str | None = None


# ── UW vs Actual Report ──────────────────────────────────────────────────────

class ReUwVsActualRow(BaseModel):
    investment_id: UUID
    investment_name: str
    baseline_type: str
    uw_irr: Decimal | None = None
    actual_irr: Decimal | None = None
    delta_irr: Decimal | None = None
    uw_moic: Decimal | None = None
    actual_moic: Decimal | None = None
    delta_moic: Decimal | None = None
    uw_nav: Decimal | None = None
    actual_nav: Decimal | None = None
    delta_nav: Decimal | None = None
    uw_tvpi: Decimal | None = None
    actual_tvpi: Decimal | None = None
    delta_tvpi: Decimal | None = None


class ReUwVsActualPortfolioOut(BaseModel):
    fund_id: UUID
    quarter: str
    baseline: str
    level: str
    rows: list[ReUwVsActualRow]
    summary: dict = {}


class ReAttributionDriver(BaseModel):
    driver: str
    uw_value: Decimal | None = None
    actual_value: Decimal | None = None
    delta: Decimal | None = None
    irr_impact_bps: Decimal | None = None
    notes: str | None = None


class ReAttributionBridgeOut(BaseModel):
    level: str
    entity_id: UUID
    quarter: str
    baseline: str
    drivers: list[ReAttributionDriver]
    total_explained_bps: Decimal | None = None
    residual_bps: Decimal | None = None
    lineage: dict = {}


# ── Cross-Fund Model Scenarios ───────────────────────────────────────────────

class ReModelScenarioCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    is_base: bool = False


class ReModelScenarioOut(BaseModel):
    id: UUID
    model_id: UUID
    name: str
    description: str | None = None
    is_base: bool
    created_at: datetime
    updated_at: datetime | None = None


class ReScenarioCloneRequest(BaseModel):
    new_name: str = Field(min_length=1, max_length=200)


# ── Scenario Asset Scope ─────────────────────────────────────────────────────

class ReScenarioAssetInput(BaseModel):
    asset_id: UUID
    source_fund_id: UUID | None = None
    source_investment_id: UUID | None = None


class ReScenarioAssetOut(BaseModel):
    id: UUID
    scenario_id: UUID
    asset_id: UUID
    source_fund_id: UUID | None = None
    source_investment_id: UUID | None = None
    added_at: datetime
    asset_name: str | None = None
    asset_type: str | None = None
    fund_name: str | None = None


class ReAvailableAssetOut(BaseModel):
    asset_id: UUID
    asset_name: str | None = None
    asset_type: str | None = None
    source_fund_id: UUID | None = None
    source_investment_id: UUID | None = None
    fund_name: str | None = None


# ── Scenario Overrides ───────────────────────────────────────────────────────

class ReScenarioOverrideInput(BaseModel):
    scope_type: Literal["asset", "investment", "fund"]
    scope_id: UUID
    key: str = Field(min_length=1, max_length=100)
    value_json: Any


class ReScenarioOverrideOut(BaseModel):
    id: UUID
    scenario_id: UUID
    scope_type: str
    scope_id: UUID
    key: str
    value_json: Any
    created_at: datetime
    updated_at: datetime | None = None


# ── Scenario Runs ────────────────────────────────────────────────────────────

class ReScenarioRunOut(BaseModel):
    run_id: str
    scenario_id: str
    model_id: str
    status: str
    assets_processed: int = 0
    summary: dict | None = None


class ReModelRunDetailOut(BaseModel):
    id: UUID
    model_version_id: UUID | None = None
    scenario_id: UUID
    status: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    inputs_hash: str | None = None
    engine_version: str | None = None
    outputs_json: Any | None = None
    summary_json: Any | None = None
    created_at: datetime


class ReScenarioCompareRequest(BaseModel):
    scenario_ids: list[UUID] = Field(min_length=2)


class ReScenarioCompareOut(BaseModel):
    scenarios: list[dict]
    comparison: list[dict] | None = None


# ─── V2 Scenario Engine Schemas ────────────────────────────────────────────


class ReScenarioRunV2Out(BaseModel):
    run_id: str
    scenario_id: str
    model_id: str
    status: str
    assets_processed: int = 0
    summary: dict | None = None


class ReAssetCashflowOut(BaseModel):
    id: UUID
    run_id: UUID
    asset_id: UUID
    period_date: date
    revenue: float = 0
    expenses: float = 0
    noi: float = 0
    capex: float = 0
    debt_service: float = 0
    net_cash_flow: float = 0
    sale_proceeds: float = 0
    equity_cash_flow: float = 0


class ReFundCashflowOut(BaseModel):
    id: UUID
    run_id: UUID
    fund_id: UUID
    period_date: date
    capital_calls: float = 0
    distributions: float = 0
    net_cash_flow: float = 0
    ending_nav: float = 0


class ReReturnMetricsOut(BaseModel):
    id: UUID
    run_id: UUID
    scope_type: str
    scope_id: UUID
    gross_irr: float | None = None
    net_irr: float | None = None
    gross_moic: float | None = None
    net_moic: float | None = None
    dpi: float | None = None
    rvpi: float | None = None
    tvpi: float | None = None
    ending_nav: float | None = None


class ReWaterfallResultOut(BaseModel):
    id: UUID
    run_id: UUID
    fund_id: UUID
    period_date: date
    lp_distribution: float = 0
    gp_distribution: float = 0
    carry: float = 0
    return_of_capital: float = 0
    pref_paid: float = 0


class ReAssetPreviewOut(BaseModel):
    asset_id: str
    asset_name: str
    cashflows: list[dict]
    exit: dict | None = None
    metrics: dict | None = None
    summary: dict | None = None


class ReScenarioCompareV2Out(BaseModel):
    scenarios: list[dict]
    comparison: list[dict] | None = None
