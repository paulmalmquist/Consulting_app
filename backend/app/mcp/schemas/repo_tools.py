"""Schemas for repo context helper MCP tools."""

from pydantic import BaseModel, Field
from typing import Optional


class SearchFilesInput(BaseModel):
    model_config = {"extra": "forbid"}
    query: str
    roots: Optional[list[str]] = None
    max_files: int = Field(20, le=50)
    max_matches: int = Field(100, le=500)
    max_bytes: int = Field(100_000, le=500_000)


class ReadFileInput(BaseModel):
    model_config = {"extra": "forbid"}
    path: str
    start_line: Optional[int] = None
    end_line: Optional[int] = None
