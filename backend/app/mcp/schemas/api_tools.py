"""Schemas for API proxy tools."""

from pydantic import BaseModel, Field
from typing import Literal, Any


class ApiCallInput(BaseModel):
    """Input schema for api.call tool."""
    model_config = {"extra": "forbid"}

    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = Field(
        ...,
        description="HTTP method"
    )
    path: str = Field(
        ...,
        description="API path (e.g., /api/businesses, /api/health). Must start with /api/"
    )
    json_body: dict[str, Any] = Field(
        default_factory=dict,
        description="JSON request body (for POST/PUT/PATCH)"
    )
    query_params: dict[str, str] = Field(
        default_factory=dict,
        description="Query parameters"
    )
    timeout_sec: int = Field(
        10,
        description="Request timeout in seconds",
        ge=1,
        le=60
    )
