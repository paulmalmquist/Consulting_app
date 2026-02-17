"""Typed request/response contracts for /api/fin/v1."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Union
from uuid import UUID

from pydantic import BaseModel, Field


class FinRunResultRef(BaseModel):
    result_table: str
    result_id: UUID
    created_at: datetime | None = None


class FinRunOut(BaseModel):
    fin_run_id: UUID
    tenant_id: UUID
    business_id: UUID
    partition_id: UUID
    engine_kind: str
    status: str
    idempotency_key: str
    deterministic_hash: str
    as_of_date: date
    dataset_version_id: UUID | None = None
    fin_rule_version_id: UUID | None = None
    input_ref_table: str | None = None
    input_ref_id: UUID | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime


class FinRunResponse(BaseModel):
    run: FinRunOut
    result_refs: list[FinRunResultRef] = []


class FinRunBase(BaseModel):
    business_id: UUID
    partition_id: UUID
    as_of_date: date
    idempotency_key: str = Field(min_length=8, max_length=200)
    dataset_version_id: UUID | None = None
    fin_rule_version_id: UUID | None = None


class WaterfallRunRequest(FinRunBase):
    engine_kind: Literal["waterfall"]
    fund_id: UUID
    distribution_event_id: UUID


class CapitalRollforwardRunRequest(FinRunBase):
    engine_kind: Literal["capital_rollforward"]
    fund_id: UUID


class ContingencyRunRequest(FinRunBase):
    engine_kind: Literal["contingency"]
    matter_id: UUID
    settlement_amount: Decimal = Field(ge=0)
    expense_amount: Decimal = Field(ge=0)


class ProviderCompRunRequest(FinRunBase):
    engine_kind: Literal["provider_comp"]
    provider_id: UUID
    provider_comp_plan_id: UUID | None = None
    gross_collections: Decimal = Field(ge=0)
    net_collections: Decimal = Field(ge=0)


class ConstructionForecastRunRequest(FinRunBase):
    engine_kind: Literal["construction_forecast"]
    project_id: UUID


FinanceRunRequest = Annotated[
    Union[
        WaterfallRunRequest,
        CapitalRollforwardRunRequest,
        ContingencyRunRequest,
        ProviderCompRunRequest,
        ConstructionForecastRunRequest,
    ],
    Field(discriminator="engine_kind"),
]


class FundCreateRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    fund_code: str
    name: str
    strategy: str
    vintage_date: date | None = None
    term_years: int | None = None
    pref_rate: Decimal = Field(default=Decimal("0"), ge=0)
    pref_is_compound: bool = False
    catchup_rate: Decimal = Field(default=Decimal("1"), ge=0)
    carry_rate: Decimal = Field(default=Decimal("0.2"), ge=0)
    waterfall_style: Literal["american", "european"] = "european"


class CommitmentCreateRequest(BaseModel):
    fin_participant_id: UUID
    commitment_role: Literal["lp", "gp", "co_invest"]
    commitment_date: date
    committed_amount: Decimal = Field(ge=0)
    fin_entity_id: UUID | None = None


class CapitalCallCreateRequest(BaseModel):
    call_date: date
    due_date: date | None = None
    amount_requested: Decimal = Field(ge=0)
    purpose: str | None = None


class ContributionCreateRequest(BaseModel):
    fin_capital_call_id: UUID | None = None
    fin_participant_id: UUID
    contribution_date: date
    amount_contributed: Decimal = Field(ge=0)
    status: Literal["pending", "collected", "failed", "waived"] = "collected"


class DistributionEventCreateRequest(BaseModel):
    event_date: date
    gross_proceeds: Decimal = Field(ge=0)
    net_distributable: Decimal | None = Field(default=None, ge=0)
    event_type: Literal["sale", "partial_sale", "refinance", "operating_distribution", "other"]
    reference: str | None = None
    fin_asset_investment_id: UUID | None = None


class WaterfallRunTriggerRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    as_of_date: date
    idempotency_key: str = Field(min_length=8, max_length=200)
    distribution_event_id: UUID


class CapitalRollforwardTriggerRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    as_of_date: date
    idempotency_key: str = Field(min_length=8, max_length=200)


class MatterCreateRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    matter_number: str
    name: str
    opened_at: date
    contingency_fee_rate: Decimal | None = Field(default=None, ge=0)
    trust_required: bool = False
    fin_entity_id_client: UUID | None = None
    responsible_actor_id: UUID | None = None


class TrustTransactionCreateRequest(BaseModel):
    txn_date: date
    txn_type: Literal["deposit", "disbursement", "transfer_in", "transfer_out", "adjustment"]
    direction: Literal["debit", "credit"]
    amount: Decimal = Field(ge=0)
    memo: str | None = None


class ContingencyRunTriggerRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    as_of_date: date
    idempotency_key: str = Field(min_length=8, max_length=200)
    settlement_amount: Decimal = Field(ge=0)
    expense_amount: Decimal = Field(ge=0)


class MsoCreateRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    code: str
    name: str
    fin_entity_id: UUID | None = None


class ClinicCreateRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    fin_mso_id: UUID
    code: str
    name: str
    npi: str | None = None
    fin_entity_id: UUID | None = None


class ProviderCreateRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    fin_clinic_id: UUID | None = None
    fin_mso_id: UUID | None = None
    fin_participant_id: UUID | None = None
    provider_type: str | None = None
    license_number: str | None = None
    npi: str | None = None


class ProviderCompPlanCreateRequest(BaseModel):
    plan_name: str
    plan_formula: str
    base_rate: Decimal = Field(ge=0)
    incentive_rate: Decimal = Field(default=Decimal("0"), ge=0)
    effective_from: date
    effective_to: date | None = None


class ProviderCompRunTriggerRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    as_of_date: date
    idempotency_key: str = Field(min_length=8, max_length=200)
    provider_comp_plan_id: UUID | None = None
    gross_collections: Decimal = Field(ge=0)
    net_collections: Decimal = Field(ge=0)


class ClaimCreateRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    claim_number: str
    fin_clinic_id: UUID | None = None
    fin_provider_id: UUID | None = None
    service_date: date | None = None
    billed_amount: Decimal = Field(default=Decimal("0"), ge=0)
    allowed_amount: Decimal = Field(default=Decimal("0"), ge=0)
    paid_amount: Decimal = Field(default=Decimal("0"), ge=0)
    status: Literal["submitted", "paid", "denied", "partial", "appealed"] = "submitted"


class EnsureConstructionProjectRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    project_id: UUID
    code: str
    name: str


class BudgetCreateRequest(BaseModel):
    name: str
    base_budget: Decimal = Field(ge=0)


class BudgetVersionLineRequest(BaseModel):
    csi_division: str
    cost_code: str
    description: str | None = None
    original_budget: Decimal = Field(ge=0)
    approved_changes: Decimal = Field(default=Decimal("0"))
    revised_budget: Decimal = Field(ge=0)
    committed_cost: Decimal = Field(default=Decimal("0"), ge=0)
    actual_cost: Decimal = Field(default=Decimal("0"), ge=0)


class BudgetVersionCreateRequest(BaseModel):
    fin_budget_id: UUID
    effective_date: date | None = None
    notes: str | None = None
    revised_budget: Decimal = Field(ge=0)
    csi_lines: list[BudgetVersionLineRequest] | None = None


class ChangeOrderCreateRequest(BaseModel):
    change_order_ref: str
    cost_impact: Decimal
    schedule_impact_days: int = 0
    status: Literal["proposed", "approved", "rejected", "implemented"] = "proposed"


class ForecastRunTriggerRequest(BaseModel):
    business_id: UUID
    partition_id: UUID
    as_of_date: date
    idempotency_key: str = Field(min_length=8, max_length=200)


class SnapshotCreateRequest(BaseModel):
    business_id: UUID
    snapshot_as_of: date
    dataset_version_id: UUID | None = None
    rule_version_id: UUID | None = None


class SimulationCreateRequest(BaseModel):
    business_id: UUID
    base_partition_id: UUID
    scenario_key: str
