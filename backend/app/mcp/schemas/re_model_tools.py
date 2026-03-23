"""Schemas for RE model MCP tools."""

from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class ModelsGetInput(BaseModel):
    model_config = {"extra": "forbid"}
    model_id: UUID


class ModelsCreateInput(BaseModel):
    model_config = {"extra": "forbid"}
    name: str
    description: Optional[str] = None
    strategy_type: Optional[str] = None
    env_id: Optional[UUID] = None
    primary_fund_id: Optional[UUID] = None
    confirm: bool = Field(False, description="Must be true to execute write")


class ModelsListInput(BaseModel):
    model_config = {"extra": "forbid"}
    env_id: Optional[UUID] = None


class ScenariosListInput(BaseModel):
    model_config = {"extra": "forbid"}
    model_id: UUID


class ScenariosCreateInput(BaseModel):
    model_config = {"extra": "forbid"}
    model_id: UUID
    name: str
    description: Optional[str] = None
    confirm: bool = Field(False, description="Must be true to execute write")


class ScenariosCloneInput(BaseModel):
    model_config = {"extra": "forbid"}
    scenario_id: UUID
    new_name: str
    confirm: bool = Field(False, description="Must be true to execute write")


class ScenariosGetInput(BaseModel):
    model_config = {"extra": "forbid"}
    scenario_id: UUID


class ScenariosSetOverridesInput(BaseModel):
    model_config = {"extra": "forbid"}
    scenario_id: UUID
    scope_type: str = Field(description="One of: asset, investment, fund")
    scope_id: UUID
    key: str
    value_json: float | int | str | dict
    confirm: bool = Field(False, description="Must be true to execute write")


class ScenariosRunInput(BaseModel):
    model_config = {"extra": "forbid"}
    scenario_id: UUID
    confirm: bool = Field(False, description="Must be true to execute write")


class RunsGetInput(BaseModel):
    model_config = {"extra": "forbid"}
    run_id: UUID


class ScenariosCompareInput(BaseModel):
    model_config = {"extra": "forbid"}
    model_id: UUID
    scenario_ids: list[UUID] = Field(min_length=2)
