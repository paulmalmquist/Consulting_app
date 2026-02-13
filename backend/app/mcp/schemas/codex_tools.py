"""Schemas for Codex CLI delegation tools."""

from pydantic import BaseModel, Field
from typing import Literal


class CodexTaskInput(BaseModel):
    """Input schema for codex.task tool."""
    model_config = {"extra": "forbid"}

    prompt: str = Field(
        ...,
        description="Natural language prompt describing the task for Codex CLI"
    )
    mode: Literal["plan_only", "apply_changes"] = Field(
        "plan_only",
        description="Execution mode: plan_only (safe) or apply_changes (writes files)"
    )
    cwd: str = Field(
        ".",
        description="Working directory relative to repo root (must be within repo)"
    )
    files: list[str] = Field(
        default_factory=lambda: ["repo-b/src/**", "repo-b/app/**", "backend/app/**"],
        description="File globs that Codex is allowed to read/write"
    )
    timeout_sec: int = Field(
        120,
        description="Codex execution timeout in seconds",
        ge=1,
        le=600
    )
    confirm: bool = Field(
        False,
        description="Must be true when mode=apply_changes"
    )
