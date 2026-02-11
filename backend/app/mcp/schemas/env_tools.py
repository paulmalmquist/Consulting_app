"""Schemas for environment variable management tools."""

from pydantic import BaseModel, Field
from typing import Literal


class EnvGetInput(BaseModel):
    """Input schema for env.get tool."""
    model_config = {"extra": "forbid"}

    key: str = Field(..., description="Environment variable key to query")
    scope: Literal["backend/.env", "repo-b/.env.local", "process"] = Field(
        ...,
        description="Scope: backend/.env, repo-b/.env.local, or process (runtime env)"
    )
    reveal: bool = Field(
        False,
        description="If true, return actual value; if false (default), return only 'set'/'not set' status"
    )


class EnvSetInput(BaseModel):
    """Input schema for env.set tool."""
    model_config = {"extra": "forbid"}

    key: str = Field(..., description="Environment variable key to set")
    value: str = Field(..., description="Value to set")
    scope: Literal["backend/.env", "repo-b/.env.local", "process"] = Field(
        ...,
        description="Scope: backend/.env, repo-b/.env.local, or process-only (never persisted)"
    )
    confirm: bool = Field(False, description="Must be true to execute write operation")
