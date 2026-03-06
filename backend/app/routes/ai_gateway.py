"""AI Gateway routes — production AI endpoint replacing the Codex CLI sidecar.

Provides:
  - GET  /api/ai/gateway/health  — gateway status + pgvector availability
  - POST /api/ai/gateway/ask     — streaming SSE chat with tool calling + RAG
  - POST /api/ai/gateway/index   — trigger RAG indexing for a document

Requires OPENAI_API_KEY env var. AI_GATEWAY_ENABLED is set automatically when the key is present.
"""
from __future__ import annotations

import time
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import AI_GATEWAY_ENABLED, OPENAI_CHAT_MODEL, OPENAI_EMBEDDING_MODEL
from app.schemas.ai_gateway import (
    GatewayAskRequest,
    GatewayHealthResponse,
    GatewayIndexRequest,
    GatewayIndexResponse,
    ConversationCreateRequest,
    ConversationDetailResponse,
    MessageAppendRequest,
    MessageResponse,
)
from app.services.ai_gateway import run_gateway_stream
from app.services import ai_conversations as convo_svc

router = APIRouter(prefix="/api/ai/gateway", tags=["ai-gateway"])


@router.get("/health", response_model=GatewayHealthResponse)
def gateway_health() -> GatewayHealthResponse:
    rag_available = False
    try:
        from app.db import get_cursor

        with get_cursor() as cur:
            cur.execute("SELECT typname FROM pg_type WHERE typname = 'vector' LIMIT 1")
            rag_available = cur.fetchone() is not None
    except Exception:
        pass

    return GatewayHealthResponse(
        enabled=AI_GATEWAY_ENABLED,
        model=OPENAI_CHAT_MODEL,
        embedding_model=OPENAI_EMBEDDING_MODEL,
        rag_available=rag_available,
        message=None if AI_GATEWAY_ENABLED else "Set OPENAI_API_KEY to enable",
    )


@router.post("/ask")
async def gateway_ask(payload: GatewayAskRequest, request: Request) -> StreamingResponse:
    """Main AI chat endpoint with SSE streaming.

    SSE events: token | citation | tool_call | done | error
    """
    if not AI_GATEWAY_ENABLED:
        raise HTTPException(status_code=501, detail="AI Gateway disabled: set OPENAI_API_KEY")

    actor = request.headers.get("x-bm-actor", "anonymous")

    async def event_stream() -> AsyncGenerator[bytes, None]:
        async for sse_line in run_gateway_stream(
            message=payload.message,
            session_id=payload.session_id,
            conversation_id=payload.conversation_id,
            env_id=payload.env_id,
            business_id=payload.business_id,
            entity_type=payload.entity_type,
            entity_id=payload.entity_id,
            context_envelope=payload.context_envelope,
            actor=actor,
        ):
            yield sse_line.encode("utf-8")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/index", response_model=GatewayIndexResponse)
def index_document_endpoint(payload: GatewayIndexRequest) -> GatewayIndexResponse:
    """Trigger RAG indexing for a document version.

    Downloads from Supabase Storage, extracts text, chunks, embeds, stores in pgvector.
    """
    if not AI_GATEWAY_ENABLED:
        raise HTTPException(status_code=501, detail="AI Gateway disabled")

    start = time.time()

    from app.services.text_extractor import extract_text
    from app.services.rag_indexer import index_document
    from app.db import get_cursor

    # Fetch document version metadata
    with get_cursor() as cur:
        cur.execute(
            """SELECT dv.bucket, dv.object_key, dv.mime_type, dv.original_filename,
                      d.business_id
               FROM app.document_versions dv
               JOIN app.documents d ON d.document_id = dv.document_id
               WHERE dv.version_id = %s AND dv.document_id = %s""",
            (str(payload.version_id), str(payload.document_id)),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Document version not found")

    # Download from Supabase Storage
    try:
        from app.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STORAGE_BUCKET
        import httpx

        bucket = row.get("bucket") or STORAGE_BUCKET
        object_key = row.get("object_key", "")
        url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{object_key}"
        resp = httpx.get(
            url,
            headers={"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"},
            timeout=30,
        )
        resp.raise_for_status()
        content_bytes = resp.content
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to download document: {str(e)[:200]}")

    # Extract text
    text = extract_text(
        content_bytes,
        mime_type=row.get("mime_type", "text/plain") or "text/plain",
        filename=row.get("original_filename", "") or "",
    )

    # Index
    chunk_count = index_document(
        document_id=payload.document_id,
        version_id=payload.version_id,
        business_id=payload.business_id,
        text=text,
        env_id=payload.env_id,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
    )

    elapsed_ms = int((time.time() - start) * 1000)

    return GatewayIndexResponse(
        chunk_count=chunk_count,
        document_id=str(payload.document_id),
        version_id=str(payload.version_id),
        elapsed_ms=elapsed_ms,
    )


# ── Conversation CRUD ────────────────────────────────────────────────────────


@router.post("/conversations", response_model=ConversationDetailResponse)
def create_conversation(payload: ConversationCreateRequest, request: Request):
    actor = request.headers.get("x-bm-actor", "anonymous")
    row = convo_svc.create_conversation(
        business_id=payload.business_id,
        env_id=payload.env_id,
        title=payload.title,
        actor=actor,
    )
    return _serialize_conversation(row, messages=[], message_count=0)


@router.get("/conversations")
def list_conversations(business_id: str, include_archived: bool = False):
    from uuid import UUID

    rows = convo_svc.list_conversations(
        business_id=UUID(business_id),
        include_archived=include_archived,
    )
    return {
        "conversations": [
            {
                "conversation_id": str(r["conversation_id"]),
                "title": r.get("title"),
                "message_count": r.get("message_count", 0),
                "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
                "archived": r.get("archived", False),
            }
            for r in rows
        ]
    }


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(conversation_id: str):
    from uuid import UUID

    convo = convo_svc.get_conversation(conversation_id=UUID(conversation_id))
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = convo_svc.get_messages(conversation_id=UUID(conversation_id))
    return _serialize_conversation(convo, messages=messages, message_count=len(messages))


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
def append_message(conversation_id: str, payload: MessageAppendRequest):
    from uuid import UUID

    convo = convo_svc.get_conversation(conversation_id=UUID(conversation_id))
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg = convo_svc.append_message(
        conversation_id=UUID(conversation_id),
        role=payload.role,
        content=payload.content,
        tool_calls=payload.tool_calls,
        citations=payload.citations,
        token_count=payload.token_count,
    )
    return _serialize_message(msg)


@router.delete("/conversations/{conversation_id}")
def archive_conversation(conversation_id: str):
    from uuid import UUID

    ok = convo_svc.archive_conversation(conversation_id=UUID(conversation_id))
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"archived": True}


def _serialize_conversation(row: dict, *, messages: list, message_count: int) -> dict:
    return {
        "conversation_id": str(row["conversation_id"]),
        "business_id": str(row["business_id"]),
        "env_id": str(row["env_id"]) if row.get("env_id") else None,
        "title": row.get("title"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
        "archived": row.get("archived", False),
        "message_count": message_count,
        "messages": [_serialize_message(m) for m in messages],
    }


def _serialize_message(row: dict) -> dict:
    return {
        "message_id": str(row["message_id"]),
        "conversation_id": str(row["conversation_id"]),
        "role": row["role"],
        "content": row["content"],
        "tool_calls": row.get("tool_calls"),
        "citations": row.get("citations"),
        "token_count": row.get("token_count"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }
