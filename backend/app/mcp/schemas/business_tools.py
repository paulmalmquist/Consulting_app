"""Schemas for business module MCP tools."""

from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class ListTemplatesInput(BaseModel):
    model_config = {"extra": "forbid"}


class CreateBusinessInput(BaseModel):
    model_config = {"extra": "forbid"}
    name: str
    slug: str
    region: str = "us"
    confirm: bool = Field(False, description="Must be true to execute write")


class ApplyTemplateInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    template_key: str
    enabled_departments: Optional[list[str]] = None
    enabled_capabilities: Optional[list[str]] = None
    confirm: bool = Field(False, description="Must be true to execute write")


class ApplyCustomInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    enabled_departments: list[str]
    enabled_capabilities: list[str]
    confirm: bool = Field(False, description="Must be true to execute write")


class GetBusinessInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID


class ListDepartmentsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID


class ListCapabilitiesInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    dept_key: str
