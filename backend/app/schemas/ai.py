from __future__ import annotations

from pydantic import BaseModel, Field


class AiHealthResponse(BaseModel):
    status: str
    mode: str


class AskScope(BaseModel):
    repo_paths: list[str] | None = None
    max_files: int = Field(default=12, ge=1, le=50)
    max_bytes: int = Field(default=200_000, ge=10_000, le=2_000_000)


class AskRetrieval(BaseModel):
    query: str | None = None
    top_k: int = Field(default=8, ge=1, le=25)


class AiAskRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=20_000)
    scope: AskScope | None = None
    retrieval: AskRetrieval | None = None


class Citation(BaseModel):
    path: str
    start_line: int
    end_line: int


class Diagnostics(BaseModel):
    used_files: int
    elapsed_ms: int


class AiAskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    diagnostics: Diagnostics


class AiCodeTaskRequest(BaseModel):
    task: str = Field(min_length=1, max_length=20_000)
    context_paths: list[str] | None = None
    dry_run: bool = True


class AiCodeTaskResponse(BaseModel):
    plan: str
    diff: str | None = None
    citations: list[Citation]
    diagnostics: Diagnostics
