"""Common MCP tool I/O schemas."""

from pydantic import BaseModel, Field
from uuid import UUID


class BusinessScopedInput(BaseModel):
    """Base for any tool that requires business_id scoping."""
    model_config = {"extra": "forbid"}
    business_id: UUID


class WriteInput(BusinessScopedInput):
    """Base for write tools — requires confirm=true."""
    confirm: bool = Field(False, description="Must be true to execute write")


class HealthCheckInput(BaseModel):
    model_config = {"extra": "forbid"}


class HealthCheckOutput(BaseModel):
    backend_ok: bool
    db_ok: bool
    timestamp: str


class DescribeSystemInput(BaseModel):
    model_config = {"extra": "forbid"}


class DescribeSystemOutput(BaseModel):
    backend_version: str
    writes_enabled: bool
    rate_limit_rpm: int
    tool_count: int


class ListToolsInput(BaseModel):
    model_config = {"extra": "forbid"}


class ListToolsOutput(BaseModel):
    tools: list[dict]
