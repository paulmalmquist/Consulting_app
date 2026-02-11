"""Schemas for database management tools."""

from pydantic import BaseModel, Field
from typing import Any


class DbUpsertInput(BaseModel):
    """Input schema for db.upsert tool."""
    model_config = {"extra": "forbid"}

    table: str = Field(..., description="Table name (must be in allowlist)")
    records: list[dict[str, Any]] = Field(
        ...,
        description="List of record dictionaries to upsert"
    )
    conflict_keys: list[str] = Field(
        ...,
        description="Column names for ON CONFLICT clause (e.g., ['id'])"
    )
    dry_run: bool = Field(
        True,
        description="If true (default), validate but don't execute"
    )
    confirm: bool = Field(
        False,
        description="Must be true when dry_run=false to execute write"
    )
