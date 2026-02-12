from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FinancePartnerIn(BaseModel):
    name: str
    role: Literal["GP", "LP", "JV_PARTNER"]
    tax_type: str | None = None
    commitment_amount: Decimal = Decimal("0")
    ownership_pct: Decimal = Decimal("0")
    has_promote: bool = False


class WaterfallTierIn(BaseModel):
    tier_order: int
    tier_type: Literal["return_of_capital", "preferred_return", "catch_up", "split"]
    hurdle_irr: Decimal | None = None
    hurdle_multiple: Decimal | None = None
    pref_rate: Decimal | None = None
    catch_up_pct: Decimal | None = None
    split_lp: Decimal | None = None
    split_gp: Decimal | None = None
    notes: str | None = None


class WaterfallIn(BaseModel):
    name: str = "Standard JV Waterfall"
    distribution_frequency: Literal["monthly", "quarterly"] = "monthly"
    promote_structure_type: Literal["american", "european"] = "american"
    tiers: list[WaterfallTierIn] = Field(default_factory=list)


class InvestmentPropertyIn(BaseModel):
    name: str
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = "US"
    property_type: str | None = None


class CreateDealRequest(BaseModel):
    fund_name: str
    deal_name: str
    strategy: str | None = None
    start_date: date
    currency: str = "USD"
    partners: list[FinancePartnerIn] = Field(default_factory=list)
    waterfall: WaterfallIn | None = None
    property: InvestmentPropertyIn | None = None
    seed_default_scenario: bool = True


class CreateDealResponse(BaseModel):
    deal_id: UUID
    fund_id: UUID
    waterfall_id: UUID | None = None
    default_scenario_id: UUID | None = None


class ScenarioAssumptionIn(BaseModel):
    key: str
    value_num: Decimal | None = None
    value_text: str | None = None
    value_json: dict[str, Any] | list[Any] | str | int | float | bool | None = None


class CreateScenarioRequest(BaseModel):
    name: str
    description: str | None = None
    as_of_date: date
    assumptions: list[ScenarioAssumptionIn] = Field(default_factory=list)


class UpdateScenarioRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    as_of_date: date | None = None
    assumptions: list[ScenarioAssumptionIn] = Field(default_factory=list)


class CashflowEventIn(BaseModel):
    date: date
    event_type: Literal[
        "capital_call",
        "operating_cf",
        "capex",
        "debt_service",
        "refinance_proceeds",
        "sale_proceeds",
        "fee",
    ]
    amount: Decimal
    property_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ImportCashflowsRequest(BaseModel):
    scenario_id: UUID
    events: list[CashflowEventIn]


class RunDealRequest(BaseModel):
    scenario_id: UUID
    waterfall_id: UUID


class RunDealResponse(BaseModel):
    model_run_id: UUID
    status: Literal["completed", "failed", "started"]
    reused_existing: bool = False
    run_hash: str
    engine_version: str


class RunSummaryResponse(BaseModel):
    model_run_id: UUID
    deal_id: UUID
    scenario_id: UUID
    waterfall_id: UUID
    run_hash: str
    engine_version: str
    status: str
    started_at: datetime
    completed_at: datetime | None = None
    metrics: dict[str, Decimal]
    meta: dict[str, Any] = Field(default_factory=dict)


class RunDistributionGroupRow(BaseModel):
    group_key: str
    amount: Decimal


class RunDistributionDetailRow(BaseModel):
    date: date
    tier_id: UUID | None
    partner_id: UUID
    partner_name: str | None = None
    tier_order: int | None = None
    tier_type: str | None = None
    distribution_amount: Decimal
    distribution_type: str
    lineage_json: dict[str, Any] = Field(default_factory=dict)


class RunDistributionsResponse(BaseModel):
    model_run_id: UUID
    group_by: Literal["partner", "tier", "date"]
    grouped: list[RunDistributionGroupRow]
    details: list[RunDistributionDetailRow]


class ExplainRow(BaseModel):
    date: date
    tier_id: UUID | None
    tier_order: int | None
    tier_type: str | None
    distribution_amount: Decimal
    distribution_type: str
    lineage_json: dict[str, Any] = Field(default_factory=dict)


class ExplainResponse(BaseModel):
    model_run_id: UUID
    partner_id: UUID
    date: date
    rows: list[ExplainRow]
