"""Schemas for operator MCP tools."""

from pydantic import BaseModel, Field


class OperatorScopeInput(BaseModel):
    model_config = {"extra": "forbid"}

    environment_id: str | None = None
    business_id: str | None = None


class GetCommandCenterInput(OperatorScopeInput):
    """Get the operator executive command center."""


class ListProjectsInput(OperatorScopeInput):
    """List all projects across entities."""


class GetProjectDetailInput(OperatorScopeInput):
    """Get project detail by ID."""

    project_id: str = Field(description="Project ID to retrieve detail for")


class ListSitesInput(OperatorScopeInput):
    """List development pipeline sites."""


class GetSiteDetailInput(OperatorScopeInput):
    """Get development site detail by ID."""

    site_id: str = Field(description="Development site ID to retrieve detail for")


class ListVendorsInput(OperatorScopeInput):
    """List vendors with cross-entity spend."""


class ListCloseTasksInput(OperatorScopeInput):
    """List month-end close tasks."""
