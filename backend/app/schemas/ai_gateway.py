"""Pydantic schemas for the AI Gateway endpoint."""
from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field
from uuid import UUID


class AssistantSelectedEntity(BaseModel):
    model_config = {"extra": "forbid"}

    entity_type: str
    entity_id: str
    name: str | None = None
    source: str | None = None
    parent_entity_type: str | None = None
    parent_entity_id: str | None = None
    metadata: dict[str, Any] | None = None


class AssistantVisibleRecord(BaseModel):
    model_config = {"extra": "forbid"}

    entity_type: str
    entity_id: str
    name: str
    parent_entity_type: str | None = None
    parent_entity_id: str | None = None
    status: str | None = None
    metadata: dict[str, Any] | None = None


class AssistantVisibleData(BaseModel):
    model_config = {"extra": "forbid"}

    funds: list[AssistantVisibleRecord] = Field(default_factory=list)
    investments: list[AssistantVisibleRecord] = Field(default_factory=list)
    assets: list[AssistantVisibleRecord] = Field(default_factory=list)
    models: list[AssistantVisibleRecord] = Field(default_factory=list)
    pipeline_items: list[AssistantVisibleRecord] = Field(default_factory=list)
    documents: list[AssistantVisibleRecord] = Field(default_factory=list)
    metrics: dict[str, Any] | None = None
    notes: list[str] = Field(default_factory=list)


class AssistantSessionContext(BaseModel):
    model_config = {"extra": "forbid"}

    user_id: str | None = None
    org_id: str | None = None
    actor: str | None = None
    roles: list[str] = Field(default_factory=list)
    session_env_id: str | None = None


class AssistantUiContext(BaseModel):
    model_config = {"extra": "forbid"}

    route: str | None = None
    surface: str | None = None
    active_module: str | None = None
    active_environment_id: str | None = None
    active_environment_name: str | None = None
    active_business_id: str | None = None
    active_business_name: str | None = None
    schema_name: str | None = None
    industry: str | None = None
    page_entity_type: str | None = None
    page_entity_id: str | None = None
    page_entity_name: str | None = None
    selected_entities: list[AssistantSelectedEntity] = Field(default_factory=list)
    active_filters: dict[str, Any] = Field(default_factory=dict)
    visible_data: AssistantVisibleData | None = None


class AssistantArtifactRef(BaseModel):
    model_config = {"extra": "forbid"}

    block_id: str
    type: str
    title: str | None = None
    summary: str | None = None
    created_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssistantThreadContext(BaseModel):
    model_config = {"extra": "forbid"}

    thread_id: str | None = None
    assistant_mode: str = "environment_copilot"
    scope_type: str = "environment"
    scope_id: str | None = None
    launch_source: str = "winston_commandbar"
    active_artifact_id: str | None = None
    artifact_refs: list[AssistantArtifactRef] = Field(default_factory=list)
    mode: str = "ask"


class AssistantContextEnvelope(BaseModel):
    model_config = {"extra": "forbid"}

    session: AssistantSessionContext = Field(default_factory=AssistantSessionContext)
    ui: AssistantUiContext = Field(default_factory=AssistantUiContext)
    thread: AssistantThreadContext = Field(default_factory=AssistantThreadContext)


class ResolvedAssistantScope(BaseModel):
    model_config = {"extra": "forbid"}

    resolved_scope_type: str
    environment_id: str | None = None
    business_id: str | None = None
    schema_name: str | None = None
    industry: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    confidence: float = Field(ge=0, le=1)
    source: str


class GatewayAskRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20_000, description="User message")
    session_id: str | None = None
    conversation_id: UUID | None = None
    env_id: UUID | None = None
    business_id: UUID | None = None
    entity_type: str | None = None
    entity_id: UUID | None = None
    context_envelope: AssistantContextEnvelope | None = None


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
    thread_kind: str | None = Field(default=None, pattern=r"^(contextual|general)$")
    scope_type: str | None = None
    scope_id: str | None = None
    scope_label: str | None = None
    launch_source: str | None = None
    context_summary: str | None = None
    last_route: str | None = None


class ConversationDetailResponse(BaseModel):
    conversation_id: str
    business_id: str
    env_id: str | None = None
    title: str | None = None
    thread_kind: str = "general"
    scope_type: str | None = None
    scope_id: str | None = None
    scope_label: str | None = None
    launch_source: str | None = None
    context_summary: str | None = None
    last_route: str | None = None
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
    response_blocks: list[dict[str, Any]] | None = None
    message_meta: dict[str, Any] | None = None
    token_count: int | None = None


class MessageResponse(BaseModel):
    message_id: str
    conversation_id: str
    role: str
    content: str
    tool_calls: list | None = None
    citations: list | None = None
    response_blocks: list[dict[str, Any]] | None = None
    message_meta: dict[str, Any] | None = None
    token_count: int | None = None
    created_at: str | None = None
