"""Pydantic schemas for the AI Gateway endpoint."""
from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID


class GatewayAskRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20_000, description="User message")
    session_id: str | None = None
    env_id: UUID | None = None
    business_id: UUID | None = None
    entity_type: str | None = None
    entity_id: UUID | None = None


class GatewayIndexRequest(BaseModel):
    document_id: UUID
    version_id: UUID
    business_id: UUID
    env_id: UUID | None = None
    entity_type: str | None = None
    entity_id: UUID | None = None


class GatewayIndexResponse(BaseModel):
    chunk_count: int
    document_id: str
    version_id: str
    elapsed_ms: int


class GatewayHealthResponse(BaseModel):
    enabled: bool
    model: str
    embedding_model: str
    rag_available: bool
    message: str | None = None
