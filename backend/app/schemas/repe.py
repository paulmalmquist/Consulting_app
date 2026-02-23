from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class RepeFundCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    vintage_year: int = Field(ge=1900, le=2100)
    fund_type: Literal["closed_end", "open_end", "sma", "co_invest"]
    strategy: Literal["equity", "debt"]
    sub_strategy: str | None = Field(default=None, max_length=120)
    target_size: Decimal | None = Field(default=None, ge=0)
    term_years: int | None = Field(default=None, ge=1, le=100)
    status: Literal["fundraising", "investing", "harvesting", "closed"] = "fundraising"

    management_fee_rate: Decimal | None = Field(default=None, ge=0)
    management_fee_basis: Literal["committed", "invested", "nav"] | None = None
    preferred_return_rate: Decimal | None = Field(default=None, ge=0)
    carry_rate: Decimal | None = Field(default=None, ge=0)
    waterfall_style: Literal["european", "american"] | None = None
    catch_up_style: Literal["none", "partial", "full"] | None = None
    terms_effective_from: date | None = None


class RepeFundOut(BaseModel):
    fund_id: UUID
    business_id: UUID
    name: str
    vintage_year: int
    fund_type: str
    strategy: str
    sub_strategy: str | None = None
    target_size: Decimal | None = None
    term_years: int | None = None
    status: str
    created_at: datetime


class RepeFundTermOut(BaseModel):
    fund_term_id: UUID
    fund_id: UUID
    effective_from: date
    effective_to: date | None = None
    management_fee_rate: Decimal | None = None
    management_fee_basis: str | None = None
    preferred_return_rate: Decimal | None = None
    carry_rate: Decimal | None = None
    waterfall_style: str | None = None
    catch_up_style: str | None = None
    created_at: datetime


class RepeFundDetailOut(BaseModel):
    fund: RepeFundOut
    terms: list[RepeFundTermOut] = []


class RepeDealCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    deal_type: Literal["equity", "debt"]
    stage: Literal["sourcing", "underwriting", "ic", "closing", "operating", "exited"] = "sourcing"
    sponsor: str | None = Field(default=None, max_length=160)
    target_close_date: date | None = None


class RepeDealOut(BaseModel):
    deal_id: UUID
    fund_id: UUID
    name: str
    deal_type: str
    stage: str
    sponsor: str | None = None
    target_close_date: date | None = None
    created_at: datetime


class RepeAssetCreateRequest(BaseModel):
    asset_type: Literal["property", "cmbs"]
    name: str = Field(min_length=2, max_length=200)

    property_type: str | None = None
    units: int | None = Field(default=None, ge=0)
    market: str | None = None
    current_noi: Decimal | None = Field(default=None, ge=0)
    occupancy: Decimal | None = Field(default=None, ge=0, le=1)

    tranche: str | None = None
    rating: str | None = None
    coupon: Decimal | None = Field(default=None, ge=0)
    maturity_date: date | None = None
    collateral_summary_json: dict[str, Any] | None = None


class RepeAssetOut(BaseModel):
    asset_id: UUID
    deal_id: UUID
    asset_type: str
    name: str
    created_at: datetime


class RepeAssetDetailOut(BaseModel):
    asset: RepeAssetOut
    details: dict[str, Any] = {}


class RepeEntityCreateRequest(BaseModel):
    business_id: UUID
    name: str = Field(min_length=2, max_length=200)
    entity_type: Literal["fund_lp", "gp", "holdco", "spv", "jv_partner", "borrower"]
    jurisdiction: str | None = Field(default=None, max_length=80)


class RepeEntityOut(BaseModel):
    entity_id: UUID
    business_id: UUID
    name: str
    entity_type: str
    jurisdiction: str | None = None
    created_at: datetime


class RepeOwnershipEdgeCreateRequest(BaseModel):
    from_entity_id: UUID
    to_entity_id: UUID
    percent: Decimal = Field(ge=0, le=1)
    effective_from: date
    effective_to: date | None = None


class RepeOwnershipEdgeOut(BaseModel):
    ownership_edge_id: UUID
    from_entity_id: UUID
    to_entity_id: UUID
    percent: Decimal
    effective_from: date
    effective_to: date | None = None
    created_at: datetime


class RepeAssetOwnershipOut(BaseModel):
    asset_id: UUID
    as_of_date: date
    links: list[dict[str, Any]] = []
    entity_edges: list[dict[str, Any]] = []


class RepeSeedOut(BaseModel):
    business_id: UUID
    funds: list[UUID]
    deals: list[UUID]
    assets: list[UUID]
    entities: list[UUID]


class RepeContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = {}


class RepeContextInitRequest(BaseModel):
    env_id: str | None = None
    business_id: UUID | None = None


class RepeFundCreateWithContextRequest(RepeFundCreateRequest):
    business_id: UUID | None = None
    env_id: str | None = None
