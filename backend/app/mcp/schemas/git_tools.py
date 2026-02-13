"""Schemas for git operation tools."""

from pydantic import BaseModel, Field


class GitDiffInput(BaseModel):
    """Input schema for git.diff tool."""
    model_config = {"extra": "forbid"}

    target: str = Field(
        "HEAD",
        description="Git target to diff against (e.g., 'HEAD', 'main', 'HEAD~1')"
    )
    paths: list[str] = Field(
        default_factory=list,
        description="Optional list of file paths to limit diff scope"
    )
    staged: bool = Field(
        False,
        description="If true, show only staged changes (--cached)"
    )


class GitCommitInput(BaseModel):
    """Input schema for git.commit tool."""
    model_config = {"extra": "forbid"}

    message: str = Field(..., description="Commit message")
    add_paths: list[str] = Field(
        default_factory=list,
        description="Paths to stage before committing. Empty list = stage all tracked changes."
    )
    confirm: bool = Field(False, description="Must be true to execute commit")
