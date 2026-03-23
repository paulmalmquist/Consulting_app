from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


DataQualityStatus = Literal["complete", "review", "blocked"]
UtilityType = Literal["electric", "gas", "water", "steam", "district"]
ImportMode = Literal["manual", "mock", "live"]
ProjectionMode = Literal["base", "carbon_tax", "utility_shock", "retrofit", "solar", "custom"]
ReportKey = Literal[
    "gresb",
    "lp_esg_summary",
    "sfdr_annex_ii",
    "tcfd_summary",
    "carbon_disclosure",
    "quarterly_lp_section",
]


class SusAssetProfileInput(BaseModel):
    env_id: str
    business_id: UUID
    property_type: str | None = None
    square_feet: Decimal | None = Field(default=None, ge=0)
    year_built: int | None = None
    last_renovation_year: int | None = None
    hvac_type: str | None = None
    primary_heating_fuel: str | None = None
    primary_cooling_type: str | None = None
    lighting_type: str | None = None
    roof_type: str | None = None
    onsite_generation: bool = False
    solar_kw_installed: Decimal | None = Field(default=None, ge=0)
    battery_storage_kwh: Decimal | None = Field(default=None, ge=0)
    ev_chargers_count: int | None = Field(default=None, ge=0)
    building_certification: str | None = None
    energy_star_score: Decimal | None = Field(default=None, ge=0)
    leed_level: str | None = None
    wired_score: Decimal | None = Field(default=None, ge=0)
    fitwel_score: Decimal | None = Field(default=None, ge=0)
    last_audit_date: date | None = None


class SusAssetProfile(SusAssetProfileInput):
    asset_id: UUID
    data_quality_status: DataQualityStatus
    last_calculated_at: datetime | None = None
    created_at: datetime


class SusUtilityAccountInput(BaseModel):
    env_id: str
    business_id: UUID
    utility_type: UtilityType
    provider_name: str
    account_number: str
    meter_id: str | None = None
    billing_frequency: str | None = None
    rate_structure: str | None = None
    demand_charge_applicable: bool = False
    is_active: bool = True


class SusUtilityAccount(SusUtilityAccountInput):
    utility_account_id: UUID
    asset_id: UUID
    created_at: datetime


class SusUtilityMonthlyInput(BaseModel):
    env_id: str
    business_id: UUID
    utility_type: UtilityType
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    utility_account_id: UUID | None = None
    usage_kwh: Decimal | None = Field(default=None, ge=0)
    usage_therms: Decimal | None = Field(default=None, ge=0)
    usage_gallons: Decimal | None = Field(default=None, ge=0)
    peak_kw: Decimal | None = Field(default=None, ge=0)
    cost_total: Decimal | None = Field(default=None, ge=0)
    demand_charges: Decimal | None = Field(default=None, ge=0)
    supply_charges: Decimal | None = Field(default=None, ge=0)
    taxes_fees: Decimal | None = Field(default=None, ge=0)
    scope_1_emissions_tons: Decimal | None = Field(default=None, ge=0)
    scope_2_emissions_tons: Decimal | None = Field(default=None, ge=0)
    market_based_emissions: Decimal | None = Field(default=None, ge=0)
    location_based_emissions: Decimal | None = Field(default=None, ge=0)
    emission_factor_used: Decimal | None = None
    emission_factor_id: UUID | None = None
    data_source: Literal["manual", "energy_star_api", "utility_api", "csv"] = "manual"
    renewable_pct: Decimal | None = None


class SusUtilityMonthly(SusUtilityMonthlyInput):
    utility_monthly_id: UUID
    asset_id: UUID
    ingestion_run_id: UUID | None = None
    usage_kwh_equiv: Decimal | None = None
    quality_status: DataQualityStatus
    created_at: datetime


class SusUtilityImportRequest(BaseModel):
    env_id: str
    business_id: UUID
    filename: str
    csv_text: str
    import_mode: ImportMode = "manual"
    created_by: str | None = None


class SusUtilityImportResult(BaseModel):
    ingestion_run_id: UUID
    filename: str
    rows_read: int
    rows_written: int
    rows_blocked: int
    issue_count: int
    sha256: str
    status: str


class SusCertificationInput(BaseModel):
    env_id: str
    business_id: UUID
    certification_type: str
    level: str | None = None
    score: Decimal | None = None
    issued_on: date | None = None
    expires_on: date | None = None
    status: Literal["active", "expired", "pending", "revoked"] = "active"
    evidence_document_id: UUID | None = None


class SusCertification(SusCertificationInput):
    asset_certification_id: UUID
    asset_id: UUID
    created_at: datetime


class SusRegulatoryExposureInput(BaseModel):
    env_id: str
    business_id: UUID
    regulation_id: UUID | None = None
    regulation_name: str
    compliance_status: Literal["compliant", "monitor", "at_risk", "non_compliant", "not_applicable"]
    target_year: int | None = None
    estimated_penalty: Decimal | None = Field(default=None, ge=0)
    estimated_upgrade_cost: Decimal | None = Field(default=None, ge=0)
    assessed_at: datetime | None = None
    methodology_note: str | None = None


class SusRegulatoryExposure(SusRegulatoryExposureInput):
    regulatory_exposure_id: UUID
    asset_id: UUID
    created_at: datetime


class SusEmissionFactorSetInput(BaseModel):
    source_name: str
    version_label: str
    methodology: str | None = None
    published_at: datetime | None = None
    effective_from: date | None = None
    effective_to: date | None = None


class SusEmissionFactorSet(SusEmissionFactorSetInput):
    factor_set_id: UUID
    created_at: datetime


class SusOverviewResponse(BaseModel):
    quarter: str
    year: int
    top_cards: dict[str, Any]
    audit_timestamp: datetime | None = None
    open_issues: int
    context: dict[str, Any]


class SusPortfolioFootprintResponse(BaseModel):
    scope: Literal["fund", "investment"]
    summary: dict[str, Any]
    investment_rows: list[dict[str, Any]] = []
    asset_rows: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []


class SusAssetDashboardResponse(BaseModel):
    asset_id: UUID
    not_applicable: bool = False
    reason: str | None = None
    cards: dict[str, Any]
    trends: dict[str, Any]
    utility_rows: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    profile: dict[str, Any] = {}
    audit_timestamp: datetime | None = None


class SusScenarioRunRequest(BaseModel):
    fund_id: UUID
    scenario_id: UUID
    base_quarter: str = Field(pattern=r"^\d{4}Q[1-4]$")
    horizon_years: int = Field(default=5, ge=1, le=20)
    projection_mode: ProjectionMode = "base"


class SusScenarioRunResponse(BaseModel):
    projection_run_id: UUID
    fund_id: UUID
    scenario_id: UUID
    status: str
    summary: dict[str, Any]
    created_at: datetime


class SusProjectionResponse(BaseModel):
    run: dict[str, Any]
    asset_rows: list[dict[str, Any]] = []
    investment_rows: list[dict[str, Any]] = []
    fund_rows: list[dict[str, Any]] = []


class SusReportPayload(BaseModel):
    report_key: ReportKey
    report_title: str
    generated_at: datetime
    context: dict[str, Any]
    sections: list[dict[str, Any]]
    appendix_rows: list[dict[str, Any]] = []
