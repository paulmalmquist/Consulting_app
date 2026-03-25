from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PropertyType(str, Enum):
    multifamily = "multifamily"
    industrial = "industrial"
    office = "office"
    retail = "retail"
    medical_office = "medical_office"
    senior_housing = "senior_housing"
    student_housing = "student_housing"


class FactClass(str, Enum):
    fact = "fact"
    assumption = "assumption"
    inference = "inference"


class ScenarioType(str, Enum):
    base = "base"
    upside = "upside"
    downside = "downside"
    custom = "custom"


class ArtifactType(str, Enum):
    ic_memo_md = "ic_memo_md"
    appraisal_md = "appraisal_md"
    outputs_json = "outputs_json"
    outputs_md = "outputs_md"
    sources_ledger_md = "sources_ledger_md"


class Unit(str, Enum):
    pct_decimal = "pct_decimal"
    usd_cents = "usd_cents"
    sf = "sf"
    units = "units"
    bps = "bps"
    ratio = "ratio"
    count = "count"


class UnderwritingRunCreateRequest(BaseModel):
    business_id: UUID
    env_id: UUID | None = None
    property_name: str = Field(min_length=1, max_length=400)
    property_type: PropertyType
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state_province: str | None = None
    postal_code: str | None = None
    country: str = "US"
    submarket: str | None = None
    gross_area_sf: float | None = Field(default=None, ge=0)
    unit_count: int | None = Field(default=None, ge=0)
    occupancy_pct: float | None = Field(default=None, ge=0, le=1)
    in_place_noi_cents: int | None = None
    purchase_price_cents: int | None = None
    property_inputs_json: dict[str, Any] = Field(default_factory=dict)
    contract_version: str = "uw_research_contract_v1"


class UnderwritingRunOut(BaseModel):
    run_id: UUID
    tenant_id: UUID
    business_id: UUID
    env_id: UUID | None = None
    execution_id: UUID | None = None
    property_name: str
    property_type: PropertyType
    status: str
    research_version: int
    normalized_version: int
    model_input_version: int
    output_version: int
    model_version: str
    normalization_version: str
    contract_version: str
    input_hash: str
    dataset_version_id: UUID | None = None
    rule_version_id: UUID | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class ResearchSourceIn(BaseModel):
    citation_key: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1, max_length=2000)
    title: str | None = None
    publisher: str | None = None
    date_accessed: date
    raw_text_excerpt: str | None = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class ResearchDatumIn(BaseModel):
    datum_key: str = Field(min_length=1, max_length=200)
    fact_class: FactClass
    value: Any
    unit: Unit | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    citation_key: str | None = None


class SaleCompIn(BaseModel):
    address: str = Field(min_length=1, max_length=500)
    submarket: str | None = None
    close_date: date | None = None
    sale_price: Any
    cap_rate: Any | None = None
    noi: Any | None = None
    size_sf: Any | None = None
    citation_key: str
    confidence: float | None = Field(default=None, ge=0, le=1)


class LeaseCompIn(BaseModel):
    address: str = Field(min_length=1, max_length=500)
    submarket: str | None = None
    lease_date: date | None = None
    rent_psf: Any
    term_months: int | None = Field(default=None, ge=0)
    size_sf: Any | None = None
    concessions: Any | None = None
    citation_key: str
    confidence: float | None = Field(default=None, ge=0, le=1)


class MarketSnapshotIn(BaseModel):
    metric_key: str = Field(min_length=1, max_length=200)
    metric_date: date | None = None
    metric_grain: str = "point"
    metric_value: Any
    unit: Unit
    citation_key: str
    confidence: float | None = Field(default=None, ge=0, le=1)


class AssumptionSuggestionIn(BaseModel):
    assumption_key: str = Field(min_length=1, max_length=200)
    value: Any
    rationale: str | None = None


class UnderwritingResearchIngestRequest(BaseModel):
    contract_version: str = "uw_research_contract_v1"
    sources: list[ResearchSourceIn] = Field(default_factory=list)
    extracted_datapoints: list[ResearchDatumIn] = Field(default_factory=list)
    sale_comps: list[SaleCompIn] = Field(default_factory=list)
    lease_comps: list[LeaseCompIn] = Field(default_factory=list)
    market_snapshot: list[MarketSnapshotIn] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    assumption_suggestions: list[AssumptionSuggestionIn] = Field(default_factory=list)


class UnderwritingResearchIngestResponse(BaseModel):
    run_id: UUID
    research_version: int
    normalized_version: int
    source_count: int
    datum_count: int
    sale_comp_count: int
    lease_comp_count: int
    market_metric_count: int
    assumption_count: int
    warnings: list[str] = Field(default_factory=list)


class ScenarioLevers(BaseModel):
    rent_growth_bps: float = 0
    vacancy_bps: float = 0
    exit_cap_bps: float = 0
    expense_growth_bps: float = 0
    opex_ratio_delta: float = 0
    ti_lc_per_sf: float = 0
    capex_reserve_per_sf: float = 0
    debt_rate_bps: float = 0
    ltv_delta: float = 0
    amort_years: int = 0
    io_months: int = 0


class CustomScenarioIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    levers: ScenarioLevers = Field(default_factory=ScenarioLevers)


class UnderwritingRunScenariosRequest(BaseModel):
    include_defaults: bool = True
    custom_scenarios: list[CustomScenarioIn] = Field(default_factory=list)


class UnderwritingScenarioResultOut(BaseModel):
    scenario_id: UUID
    name: str
    scenario_type: ScenarioType
    recommendation: str
    valuation: dict[str, Any]
    returns: dict[str, Any]
    debt: dict[str, Any]
    sensitivities: dict[str, Any]


class UnderwritingRunScenariosResponse(BaseModel):
    run_id: UUID
    status: str
    model_input_version: int
    output_version: int
    scenarios: list[UnderwritingScenarioResultOut] = Field(default_factory=list)


class UnderwritingReportArtifactOut(BaseModel):
    artifact_type: ArtifactType
    content_md: str | None = None
    content_json: dict[str, Any] | None = None


class UnderwritingScenarioReportOut(BaseModel):
    scenario_id: UUID | None = None
    name: str
    scenario_type: ScenarioType | None = None
    recommendation: str | None = None
    artifacts: dict[str, UnderwritingReportArtifactOut] = Field(default_factory=dict)


class UnderwritingReportsOut(BaseModel):
    run_id: UUID
    scenarios: list[UnderwritingScenarioReportOut] = Field(default_factory=list)


class UnderwritingResearchContractOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    contract_version: str
    schema_: dict[str, Any] = Field(alias="schema")
