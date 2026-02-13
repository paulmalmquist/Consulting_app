"""Schemas for frontend management tools."""

from pydantic import BaseModel, Field
from typing import Literal


class FeEditInput(BaseModel):
    """Input schema for fe.edit tool."""
    model_config = {"extra": "forbid"}

    files: list[str] = Field(
        ...,
        description="List of file paths to edit (relative to repo-b/src/)"
    )
    instructions: str = Field(
        ...,
        description="Natural language instructions for what edits to make"
    )
    confirm: bool = Field(False, description="Must be true to execute write operation")


class FeRunInput(BaseModel):
    """Input schema for fe.run tool."""
    model_config = {"extra": "forbid"}

    command_preset: Literal["lint", "test", "typecheck", "dev", "build"] = Field(
        ...,
        description="Preset command to run: lint, test, typecheck, dev, or build"
    )
    timeout_sec: int = Field(
        60,
        description="Command timeout in seconds",
        ge=1,
        le=300
    )
