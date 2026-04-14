"""Schemas for REPE asset write MCP tools.

Balanced-books rule: NOI and net cash flow are NEVER set directly.
They are always computed from ingredients:
  EGI  = revenue + other_income
  NOI  = EGI - opex
  NCF  = NOI - capex - debt_service - leasing_costs - tenant_improvements - free_rent
"""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class ReadPnlInput(BaseModel):
    model_config = {"extra": "ignore"}
    asset_id: str = Field(description="Asset UUID")
    quarter: str = Field(description="Quarter (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class PreviewChangeInput(BaseModel):
    """Preview the P&L impact of partial operating changes — no writes."""
    model_config = {"extra": "ignore"}
    asset_id: str = Field(description="Asset UUID")
    quarter: str = Field(description="Quarter (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    # Partial overrides — omit fields you don't want to change
    revenue: Decimal | None = Field(default=None, description="Gross revenue / EGR")
    other_income: Decimal | None = Field(default=None, description="Other income (parking, fees, etc.) — negative means loss/concession")
    opex: Decimal | None = Field(default=None, description="Operating expenses (positive value)")
    capex: Decimal | None = Field(default=None, description="Capital expenditures (positive value)")
    debt_service: Decimal | None = Field(default=None, description="Total debt service (P+I, positive value)")
    leasing_costs: Decimal | None = Field(default=None, description="Leasing commissions (positive value)")
    tenant_improvements: Decimal | None = Field(default=None, description="Tenant improvement costs (positive value)")
    free_rent: Decimal | None = Field(default=None, description="Free rent concessions (positive value)")
    occupancy: Decimal | None = Field(default=None, description="Physical occupancy rate 0.0–1.0 (informational, does not drive revenue directly)")
    reason: str | None = Field(default=None, description="Reason for change (for preview context)")


class SetOperatingInput(BaseModel):
    """Write operating line items for an asset/quarter.

    confirm must be True to execute. Returns before/after P&L diff.
    NOI and cash flow are never set directly — they are computed from ingredients.
    """
    model_config = {"extra": "ignore"}
    asset_id: str = Field(description="Asset UUID")
    quarter: str = Field(description="Quarter (e.g. 2026Q1)")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    # Partial overrides — omit fields you don't want to change
    revenue: Decimal | None = Field(default=None, description="Gross revenue / EGR")
    other_income: Decimal | None = Field(default=None, description="Other income (negative = concession/loss)")
    opex: Decimal | None = Field(default=None, description="Operating expenses (positive value)")
    capex: Decimal | None = Field(default=None, description="Capital expenditures (positive value)")
    debt_service: Decimal | None = Field(default=None, description="Total debt service P+I (positive value)")
    leasing_costs: Decimal | None = Field(default=None, description="Leasing commissions (positive value)")
    tenant_improvements: Decimal | None = Field(default=None, description="Tenant improvement costs (positive value)")
    free_rent: Decimal | None = Field(default=None, description="Free rent concessions (positive value)")
    occupancy: Decimal | None = Field(default=None, description="Physical occupancy rate 0.0–1.0")
    reason: str = Field(default="", description="Reason for the override — logged for audit trail")
    confirm: bool = Field(default=False, description="Must be True to execute the write")


class RebuildMetricsInput(BaseModel):
    """Trigger bottom-up rollup for a fund after operating edits.

    Recomputes asset IRRs, investment IRRs, and fund-level metrics
    from the current re_asset_operating_qtr rows and writes a new
    draft snapshot. Does not promote to released.
    confirm must be True to execute.
    """
    model_config = {"extra": "ignore"}
    fund_id: str = Field(description="Fund UUID")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    as_of_quarter: str = Field(description="Quarter to compute metrics as-of (e.g. 2026Q1)")
    confirm: bool = Field(default=False, description="Must be True to execute the rebuild")


class AddAssetInput(BaseModel):
    """Add a new asset and link it to a fund.

    Creates repe_asset, repe_fund_entity_link, and a seed
    re_asset_operating_qtr row for the acquisition quarter.
    confirm must be True to execute.
    """
    model_config = {"extra": "ignore"}
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    fund_id: str = Field(description="Fund UUID to link the asset to")
    name: str = Field(description="Asset name")
    asset_type: str = Field(description="Asset type: multifamily | industrial | office | retail | hotel | senior_living | medical")
    acquisition_quarter: str = Field(description="Quarter acquired (e.g. 2026Q2)")
    acquisition_cost: Decimal = Field(description="Total acquisition cost in dollars")
    ownership_pct: Decimal = Field(description="Ownership percentage 0.0–1.0 (e.g. 0.80 for 80%)")
    city: str | None = Field(default=None)
    state: str | None = Field(default=None)
    confirm: bool = Field(default=False, description="Must be True to execute")


class DeactivateAssetInput(BaseModel):
    """Remove an asset from a fund's active roll.

    Marks the fund-entity link as inactive. Historical operating data
    is preserved. Does NOT delete any rows.
    confirm must be True to execute.
    """
    model_config = {"extra": "ignore"}
    asset_id: str = Field(description="Asset UUID")
    fund_id: str = Field(description="Fund UUID")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")
    reason: str = Field(description="Reason for deactivation (required for audit trail)")
    confirm: bool = Field(default=False, description="Must be True to execute")
