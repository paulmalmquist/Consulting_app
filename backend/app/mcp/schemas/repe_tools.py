"""Schemas for REPE portfolio data MCP tools."""

from pydantic import BaseModel, Field
from uuid import UUID


class ListFundsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID = Field(description="Business scope for multi-tenant isolation")


class GetFundInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID = Field(description="Fund ID to retrieve")


class ListDealsInput(BaseModel):
    model_config = {"extra": "forbid"}
    fund_id: UUID = Field(description="Fund ID to list deals for")


class ListAssetsInput(BaseModel):
    model_config = {"extra": "forbid"}
    deal_id: UUID = Field(description="Deal ID to list assets for")


class GetAssetInput(BaseModel):
    model_config = {"extra": "forbid"}
    asset_id: UUID = Field(description="Asset ID to retrieve")
