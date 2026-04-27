"""Operator (Anthropic Managed Agent) routes — parallel surface to /api/ai/gateway/*.

Mirrors the gateway's request/response conventions so the frontend transport
layer is a thin runtime selector. Mounted only when WINSTON_OPERATOR_ENABLED.

Endpoints:
  GET   /api/ai/operator/health
  POST  /api/ai/operator/ask
  POST  /api/ai/operator/conversations
  GET   /api/ai/operator/conversations
  GET   /api/ai/operator/conversations/{conversation_id}
  DELETE /api/ai/operator/conversations/{conversation_id}
  POST  /api/ai/operator/sessions/{anthropic_session_id}/confirm
  GET   /api/ai/operator/receipts
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.auth.platform import require_authenticated_request, require_environment_access
from app.config import (
    ANTHROPIC_API_KEY,
    WINSTON_AUTO_ROUTER_ENABLED,
    WINSTON_OPERATOR_ENABLED,
)
from app.schemas.ai_gateway import (
    ConversationCreateRequest,
    ConversationDetailResponse,
    OperatorAskRequest,
    OperatorConfirmRequest,
    OperatorHealthResponse,
)
from app.services import ai_conversations as convo_svc
from app.services import operator_agent_gateway as op_svc
from app.services import operator_confirm_registry as confirm_registry
from app.services.runtime_router import resolve_runtime


router = APIRouter(prefix="/api/ai/operator", tags=["ai-operator"])
logger = logging.getLogger(__name__)


# ── Health ──────────────────────────────────────────────────────────


@router.get("/health", response_model=OperatorHealthResponse)
def operator_health(request: Request) -> OperatorHealthResponse:
    require_authenticated_request(request)
    snapshot = op_svc.operator_health_snapshot()
    return OperatorHealthResponse(
        enabled=WINSTON_OPERATOR_ENABLED,
        anthropic_key_present=snapshot.get("anthropic_key_present", False),
        profile_loaded=snapshot.get("profile_loaded", False),
        agent_name=snapshot.get("agent_name"),
        agent_model=snapshot.get("agent_model"),
        mcp_server_name=snapshot.get("mcp_server_name"),
        mcp_url=snapshot.get("mcp_url"),
        mcp_preflight=snapshot.get("mcp_preflight"),
        auto_router_enabled=WINSTON_AUTO_ROUTER_ENABLED,
        message=None if ANTHROPIC_API_KEY else "Set ANTHROPIC_API_KEY to enable",
    )


# ── Ask (SSE stream) ────────────────────────────────────────────────


@router.post("/ask")
async def operator_ask(payload: OperatorAskRequest, request: Request) -> StreamingResponse:
    if not WINSTON_OPERATOR_ENABLED:
        raise HTTPException(status_code=501, detail="Operator runtime disabled")
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=501, detail="Operator disabled: set ANTHROPIC_API_KEY")

    if payload.env_id:
        require_environment_access(request, env_id=payload.env_id)
    else:
        require_authenticated_request(request)

    actor = request.headers.get("x-bm-actor", "anonymous")
    request_id = (
        request.headers.get("x-bm-request-id")
        or request.headers.get("x-request-id")
        or payload.session_id
        or ""
    )

    requested_runtime = "managed_agent"
    routing_reason_seed = "manual_operator"
    if payload.routing_hint:
        requested_runtime = (
            str(payload.routing_hint.get("runtime") or requested_runtime)
            if isinstance(payload.routing_hint, dict)
            else requested_runtime
        )
        routing_reason_seed = (
            str(payload.routing_hint.get("reason") or routing_reason_seed)
            if isinstance(payload.routing_hint, dict)
            else routing_reason_seed
        )

    # Resolve final runtime + decision label. We always end up at managed_agent
    # for the operator route, but the call records auto-router intent.
    resolved_runtime, routing_decision = resolve_runtime(
        requested=requested_runtime,
        message=payload.message,
        env_id=str(payload.env_id) if payload.env_id else None,
    )
    if resolved_runtime != "managed_agent":
        # Caller hit /operator/ask but auto-router said gateway.
        # Honor the route since the user explicitly chose operator on the URL.
        routing_decision = f"forced_operator(would_be={resolved_runtime})"
    routing_reason = routing_reason_seed

    # The operator path requires a persisted conversation row up front so the
    # Anthropic session id can be stamped onto it.
    conversation_id = payload.conversation_id
    if conversation_id is None:
        if payload.business_id is None:
            raise HTTPException(status_code=400, detail="business_id required to create operator conversation")
        created = convo_svc.create_conversation(
            business_id=payload.business_id,
            env_id=payload.env_id,
            title=None,
            actor=actor,
            runtime="managed_agent",
        )
        conversation_id = UUID(str(created["conversation_id"]))

    if payload.business_id is None:
        # business_id is required by the operator service for receipts.
        raise HTTPException(status_code=400, detail="business_id required")

    async def event_stream() -> AsyncGenerator[bytes, None]:
        async for sse_line in op_svc.run_operator_stream(
            message=payload.message,
            request_id=request_id,
            conversation_id=conversation_id,
            env_id=payload.env_id,
            business_id=payload.business_id,
            actor=actor,
            routing_decision=routing_decision,
            routing_reason=routing_reason,
            context_envelope=(
                payload.context_envelope.model_dump() if payload.context_envelope else None
            ),
        ):
            yield sse_line.encode("utf-8")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "x-winston-runtime": "managed_agent",
            "x-winston-conversation-id": str(conversation_id),
        },
    )


# ── Conversations CRUD (operator-scoped) ────────────────────────────


@router.post("/conversations", response_model=ConversationDetailResponse)
def create_operator_conversation(payload: ConversationCreateRequest, request: Request):
    if payload.env_id:
        require_environment_access(request, env_id=payload.env_id)
    else:
        require_authenticated_request(request)
    actor = request.headers.get("x-bm-actor", "anonymous")
    row = convo_svc.create_conversation(
        business_id=payload.business_id,
        env_id=payload.env_id,
        title=payload.title,
        thread_kind=payload.thread_kind or "general",
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
        scope_label=payload.scope_label,
        launch_source=payload.launch_source,
        context_summary=payload.context_summary,
        last_route=payload.last_route,
        actor=actor,
        runtime="managed_agent",
    )
    return _serialize_conversation(row, messages=[], message_count=0)


@router.get("/conversations")
def list_operator_conversations(request: Request, business_id: str, include_archived: bool = False):
    require_authenticated_request(request)
    rows = convo_svc.list_conversations(
        business_id=UUID(business_id),
        include_archived=include_archived,
        runtime="managed_agent",
    )
    return {
        "conversations": [
            {
                "conversation_id": str(r["conversation_id"]),
                "title": r.get("title"),
                "env_id": str(r["env_id"]) if r.get("env_id") else None,
                "thread_kind": r.get("thread_kind", "general"),
                "scope_type": r.get("scope_type"),
                "scope_id": r.get("scope_id"),
                "scope_label": r.get("scope_label"),
                "launch_source": r.get("launch_source"),
                "context_summary": r.get("context_summary"),
                "last_route": r.get("last_route"),
                "message_count": r.get("message_count", 0),
                "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
                "archived": r.get("archived", False),
                "runtime": r.get("runtime", "managed_agent"),
                "anthropic_session_id": r.get("anthropic_session_id"),
                "session_health_status": r.get("session_health_status"),
            }
            for r in rows
        ]
    }


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_operator_conversation(conversation_id: str, request: Request):
    require_authenticated_request(request)
    convo = convo_svc.get_conversation(conversation_id=UUID(conversation_id))
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if convo.get("runtime") not in (None, "managed_agent"):
        raise HTTPException(status_code=404, detail="Not an operator conversation")
    messages = convo_svc.get_messages(conversation_id=UUID(conversation_id))
    return _serialize_conversation(convo, messages=messages, message_count=len(messages))


@router.delete("/conversations/{conversation_id}")
def archive_operator_conversation(conversation_id: str, request: Request):
    require_authenticated_request(request)
    convo = convo_svc.get_conversation(conversation_id=UUID(conversation_id))
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if convo.get("runtime") not in (None, "managed_agent"):
        raise HTTPException(status_code=404, detail="Not an operator conversation")
    ok = convo_svc.archive_conversation(conversation_id=UUID(conversation_id))
    return {"archived": bool(ok)}


# ── Tool confirmation handoff ───────────────────────────────────────


@router.post("/sessions/{anthropic_session_id}/confirm")
def confirm_operator_action(
    anthropic_session_id: str,
    payload: OperatorConfirmRequest,
    request: Request,
):
    """Resolve a pending tool-confirmation row.

    Cross-tenant safety: we look up the underlying conversation and require
    the actor to have access to its env (or be authenticated for null-env
    conversations).
    """
    pending = confirm_registry.get(
        anthropic_session_id=anthropic_session_id,
        tool_call_id=payload.tool_call_id,
    )
    if pending is None:
        raise HTTPException(status_code=404, detail="No pending confirmation found")
    if pending.status != "awaiting":
        raise HTTPException(
            status_code=410,
            detail={"error_code": "ALREADY_RESOLVED", "status": pending.status},
        )

    # Tenant isolation.
    convo = convo_svc.get_conversation(conversation_id=UUID(pending.conversation_id))
    if not convo:
        raise HTTPException(status_code=404, detail="Owning conversation missing")
    convo_env_id = convo.get("env_id")
    if convo_env_id:
        require_environment_access(request, env_id=convo_env_id)
    else:
        require_authenticated_request(request)

    actor = request.headers.get("x-bm-actor", "anonymous")
    resolved = confirm_registry.resolve(
        anthropic_session_id=anthropic_session_id,
        tool_call_id=payload.tool_call_id,
        result=payload.result,
        deny_message=payload.deny_message,
        decided_by=actor,
    )
    if resolved is None:
        raise HTTPException(
            status_code=410,
            detail={"error_code": "RACE_LOST", "message": "Pending row state changed"},
        )
    return {
        "tool_call_id": resolved.tool_call_id,
        "status": resolved.status,
        "decided_by": resolved.decided_by,
    }


# ── Receipts ────────────────────────────────────────────────────────


@router.get("/receipts")
def list_receipts(conversation_id: str, request: Request, limit: int = 25):
    require_authenticated_request(request)
    rows = op_svc.list_receipts_for_conversation(
        conversation_id=UUID(conversation_id),
        limit=min(limit, 100),
    )
    return {
        "receipts": [
            {
                "receipt_id": str(r["receipt_id"]),
                "conversation_id": str(r["conversation_id"]),
                "runtime": r.get("runtime"),
                "model": r.get("model"),
                "tokens_in": r.get("tokens_in"),
                "tokens_out": r.get("tokens_out"),
                "tool_calls": r.get("tool_calls"),
                "session_runtime_ms": r.get("session_runtime_ms"),
                "routing_decision": r.get("routing_decision"),
                "routing_reason": r.get("routing_reason"),
                "anthropic_session_id": r.get("anthropic_session_id"),
                "stop_reason_type": r.get("stop_reason_type"),
                "errors": r.get("errors"),
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
            }
            for r in rows
        ]
    }


# ── Helpers ─────────────────────────────────────────────────────────


def _serialize_conversation(row: dict, *, messages: list, message_count: int) -> dict:
    return {
        "conversation_id": str(row["conversation_id"]),
        "business_id": str(row["business_id"]),
        "env_id": str(row["env_id"]) if row.get("env_id") else None,
        "title": row.get("title"),
        "thread_kind": row.get("thread_kind", "general"),
        "scope_type": row.get("scope_type"),
        "scope_id": row.get("scope_id"),
        "scope_label": row.get("scope_label"),
        "launch_source": row.get("launch_source"),
        "context_summary": row.get("context_summary"),
        "last_route": row.get("last_route"),
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
        "response_blocks": row.get("response_blocks") or [],
        "message_meta": row.get("message_meta") or {},
        "token_count": row.get("token_count"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }
