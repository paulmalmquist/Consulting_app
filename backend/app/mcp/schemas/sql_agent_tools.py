"""Schemas for SQL Agent MCP tools."""

from pydantic import BaseModel, Field
from uuid import UUID


class SqlQueryStructuredInput(BaseModel):
    model_config = {"extra": "forbid"}

    question: str = Field(
        ...,
        description=(
            "Natural language question about business data. "
            "Examples: 'top 10 assets by NOI', 'utilization trend by quarter', "
            "'stale opportunities over 21 days', 'fund returns this quarter'"
        ),
    )
    business_id: UUID = Field(
        ...,
        description="Business UUID for tenant isolation",
    )
    env_id: UUID | None = Field(
        default=None,
        description="Environment UUID (required for PDS queries)",
    )
    quarter: str | None = Field(
        default=None,
        description="Quarter context (e.g. '2026Q1')",
    )
    tenant_id: str | None = Field(
        default=None,
        description="Tenant ID (required for CRM queries)",
    )
    row_limit: int = Field(
        default=500,
        ge=1,
        le=5000,
        description="Maximum rows to return (default 500, max 5000)",
    )


class SqlExplainQuestionInput(BaseModel):
    model_config = {"extra": "forbid"}

    question: str = Field(
        ...,
        description="Natural language question to analyze without executing",
    )


class SqlDescribeSchemaInput(BaseModel):
    model_config = {"extra": "forbid"}

    domain: str | None = Field(
        default=None,
        description="Domain to describe: 'repe', 'pds', or null for all",
    )


class SqlListTemplatesInput(BaseModel):
    model_config = {"extra": "forbid"}

    domain: str | None = Field(
        default=None,
        description="Filter templates by domain: 'repe', 'pds', 'crm', or null for all",
    )


class SqlValidateQueryInput(BaseModel):
    model_config = {"extra": "forbid"}

    sql: str = Field(
        ...,
        description="SQL query to validate for safety",
    )
    business_id: UUID = Field(
        ...,
        description="Business UUID to check tenant isolation",
    )


class SqlRunTemplateInput(BaseModel):
    model_config = {"extra": "forbid"}

    template_key: str = Field(
        ...,
        description="Template key (e.g. 'repe.noi_movers', 'pds.utilization_trend')",
    )
    business_id: UUID = Field(
        ...,
        description="Business UUID for tenant isolation",
    )
    env_id: UUID | None = Field(
        default=None,
        description="Environment UUID (required for PDS templates)",
    )
    quarter: str | None = Field(
        default=None,
        description="Quarter context (e.g. '2026Q1')",
    )
    tenant_id: str | None = Field(
        default=None,
        description="Tenant ID (required for CRM templates)",
    )
    row_limit: int = Field(
        default=500,
        ge=1,
        le=5000,
        description="Maximum rows to return",
    )


class SqlPreviewChartInput(BaseModel):
    model_config = {"extra": "forbid"}

    columns: list[str] = Field(
        ...,
        description="Column names from a query result",
    )
    sample_rows: list[dict] = Field(
        ...,
        description="Sample rows (first 5-10) for chart type detection",
    )
    query_type: str | None = Field(
        default=None,
        description="Query type hint (e.g. 'time_series', 'ranked_comparison')",
    )
