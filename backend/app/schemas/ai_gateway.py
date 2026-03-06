"""Pydantic schemas for the AI Gateway endpoint."""
from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID


class GatewayAskRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20_000, description="User message")
    session_id: str | None = None
    conversation_id: UUID | None = None
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


# ── Conversation schemas ─────────────────────────────────────────────────────


class ConversationCreateRequest(BaseModel):
    business_id: UUID
    env_id: UUID | None = None
    title: str | None = None


class ConversationDetailResponse(BaseModel):
    conversation_id: str
    business_id: str
    env_id: str | None = None
    title: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    archived: bool = False
    message_count: int = 0
    messages: list[dict] = []


class ConversationListResponse(BaseModel):
    conversations: list[dict]


class MessageAppendRequest(BaseModel):
    role: str = Field(pattern=r"^(user|assistant|system|tool)$")
    content: str = Field(min_length=1, max_length=100_000)
    tool_calls: list | None = None
    citations: list | None = None
    token_count: int | None = None


class MessageResponse(BaseModel):
    message_id: str
    conversation_id: str
    role: str
    content: str
    tool_calls: list | None = None
    citations: list | None = None
    token_count: int | None = None
    created_at: str | None = None
