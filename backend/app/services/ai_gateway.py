"""AI Gateway service — OpenAI Chat Completions with streaming tool calls + RAG."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, AsyncGenerator

from app.config import AI_MAX_TOOL_ROUNDS, OPENAI_API_KEY, OPENAI_CHAT_MODEL, RAG_TOP_K
from app.mcp.audit import execute_tool
from app.mcp.auth import McpContext
from app.mcp.registry import registry
from app.observability.logger import emit_log
from app.observability.request_context import get_request_context, set_request_context
from app.schemas.ai_gateway import AssistantContextEnvelope
from app.services import audit as audit_svc
from app.services.assistant_scope import (
    build_context_block,
    ensure_context_envelope,
    resolve_assistant_scope,
    resolve_visible_context_policy,
)
from app.services.rag_indexer import RetrievedChunk, semantic_search

_SYSTEM_PROMPT = """You are Winston, an in-app copilot embedded in an institutional real estate private equity platform.

## Primary Operating Rule
Treat the application UI as the first source of truth. Resolve the current page, environment, and selected entity
before answering. Do not behave like a stateless chatbot.

## Scope And Clarification
- Never ask for IDs or identifiers that are already available in the application context.
- Default unspecified portfolio questions to the active environment.
- If the user refers to "we", assume the active environment.
- If the user refers to "this fund", "this asset", "current model", or similar, use the resolved page scope.
- Ask for clarification only when scope resolution and tool lookups both fail.

## Tooling Rules
- Use repe.get_environment_snapshot first for environment-wide questions when the UI does not already show the answer.
- Call tools with EMPTY parameters (no arguments) — business_id, env_id, and fund_id are auto-resolved from context. Do NOT copy IDs from the context into tool parameters.
- Prefer structured tool data over general knowledge.
- If visible UI data already answers the question, do not contradict it with a stale assumption.

## Response Style
- Be concise, data-driven, and explicit about freshness.
- Use tables for multi-entity comparisons and bullets for simple summaries.
- Never fabricate fund names, cap rates, IRRs, or entity-level figures.
- Cite retrieved chunk_id values when using document context.
"""


def _sanitize_tool_name(name: str) -> str:
    return name.replace(".", "__")


def _build_openai_tools() -> tuple[list[dict], dict[str, str]]:
    tools = []
    name_map: dict[str, str] = {}
    for tool_def in registry.list_all():
        if tool_def.name.startswith("codex."):
            continue
        if tool_def.handler is None:
            continue
        clean_schema = {
            key: value
            for key, value in tool_def.input_schema.items()
            if key not in ("$schema", "title")
        }
        safe_name = _sanitize_tool_name(tool_def.name)
        name_map[safe_name] = tool_def.name
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": safe_name,
                    "description": tool_def.description,
                    "parameters": clean_schema,
                },
            }
        )
    return tools, name_map


def _json_safe(value: Any) -> Any:
    from decimal import Decimal

    if isinstance(value, dict):
        return {str(key): _json_safe(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    if hasattr(value, "hex"):
        return str(value)
    return value


def _preview(value: Any, max_chars: int = 1600) -> str:
    text = json.dumps(_json_safe(value), ensure_ascii=True, default=str)
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "...[truncated]"


def _maybe_attach_scope(tool_def, args: dict[str, Any], resolved_scope: dict[str, Any]) -> dict[str, Any]:
    fields = getattr(tool_def.input_model, "model_fields", {})
    if "resolved_scope" in fields and "resolved_scope" not in args:
        args["resolved_scope"] = resolved_scope
    return args


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(_json_safe(data), ensure_ascii=True)}\n\n"


async def run_gateway_stream(
    *,
    message: str,
    session_id: str | None = None,
    conversation_id: uuid.UUID | None = None,
    env_id: uuid.UUID | None = None,
    business_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    context_envelope: AssistantContextEnvelope | dict[str, Any] | None = None,
    actor: str = "anonymous",
) -> AsyncGenerator[str, None]:
    if not OPENAI_API_KEY:
        yield _sse("error", {"message": "OPENAI_API_KEY not configured"})
        return

    import openai

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    start = time.time()
    session_id = session_id or str(uuid.uuid4())

    normalized_envelope = ensure_context_envelope(
        context_envelope=context_envelope,
        env_id=str(env_id) if env_id else None,
        business_id=str(business_id) if business_id else None,
        conversation_id=str(conversation_id) if conversation_id else None,
        actor=actor,
    )
    resolved_scope = resolve_assistant_scope(
        user=actor,
        context_envelope=normalized_envelope,
        user_message=message,
        fallback_env_id=str(env_id) if env_id else None,
        fallback_business_id=str(business_id) if business_id else None,
    )

    current_request_ctx = get_request_context()
    set_request_context(
        request_id=current_request_ctx.request_id,
        run_id=current_request_ctx.run_id,
        env_id=resolved_scope.environment_id,
        business_id=resolved_scope.business_id,
        user=current_request_ctx.user,
    )

    envelope_dump = normalized_envelope.model_dump()
    scope_dump = resolved_scope.model_dump()

    emit_log(
        level="info",
        service="backend",
        action="ai.gateway.context_resolved",
        message="Resolved Winston application context",
        context={
            "context_envelope": envelope_dump,
            "resolved_scope": scope_dump,
        },
    )
    yield _sse(
        "context",
        {
            "context_envelope": envelope_dump,
            "resolved_scope": scope_dump,
        },
    )

    rag_chunks: list[RetrievedChunk] = []
    rag_business_id = resolved_scope.business_id or (str(business_id) if business_id else None)
    rag_env_id = resolved_scope.environment_id or (str(env_id) if env_id else None)
    rag_entity_type = resolved_scope.entity_type or entity_type
    rag_entity_id = resolved_scope.entity_id or (str(entity_id) if entity_id else None)
    if rag_business_id:
        try:
            rag_chunks = semantic_search(
                query=message,
                business_id=uuid.UUID(str(rag_business_id)),
                env_id=uuid.UUID(str(rag_env_id)) if rag_env_id else None,
                entity_type=rag_entity_type,
                entity_id=uuid.UUID(str(rag_entity_id)) if rag_entity_id else None,
                top_k=RAG_TOP_K,
            )
            for chunk in rag_chunks:
                yield _sse(
                    "citation",
                    {
                        "chunk_id": chunk.chunk_id,
                        "doc_id": chunk.document_id,
                        "score": round(chunk.score, 4),
                        "snippet": chunk.chunk_text[:300],
                        "section_heading": chunk.section_heading,
                        "section_path": chunk.section_path,
                    },
                )
        except Exception as rag_err:
            yield _sse(
                "citation",
                {"message": f"RAG unavailable: {str(rag_err)[:100]}"},
            )

    rag_context = ""
    if rag_chunks:
        rag_context = "\n\nRELEVANT DOCUMENT CONTEXT:\n"
        for idx, chunk in enumerate(rag_chunks, 1):
            heading = f", section={chunk.section_heading}" if chunk.section_heading else ""
            rag_context += (
                f"\n[Doc {idx}, chunk_id={chunk.chunk_id}, score={chunk.score:.3f}{heading}]\n"
                f"{chunk.chunk_text[:800]}\n"
            )

    visible_context_policy = resolve_visible_context_policy(
        context_envelope=normalized_envelope,
        user_message=message,
    )
    context_block = build_context_block(
        context_envelope=normalized_envelope,
        resolved_scope=resolved_scope,
        additional_instructions=visible_context_policy["instructions"],
    )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM_PROMPT + "\n\n" + context_block + rag_context},
    ]

    if conversation_id:
        try:
            from app.services import ai_conversations as convo_svc

            history = convo_svc.get_messages(conversation_id=conversation_id)
            for msg in history:
                if msg["role"] in ("user", "assistant"):
                    messages.append({"role": msg["role"], "content": msg["content"]})
        except Exception:
            pass

    messages.append({"role": "user", "content": message})

    openai_tools, tool_name_map = _build_openai_tools()
    if visible_context_policy["disable_tools"]:
        emit_log(
            level="info",
            service="backend",
            action="ai.gateway.visible_context_shortcut",
            message="Visible UI data is sufficient for this turn; disabling tool access",
            context={"instructions": visible_context_policy["instructions"]},
        )
        openai_tools = []
    ctx = McpContext(
        actor=actor,
        token_valid=True,
        resolved_scope=scope_dump,
        context_envelope=envelope_dump,
    )

    total_prompt_tokens = 0
    total_completion_tokens = 0
    tool_call_count = 0
    tool_calls_log: list[dict[str, Any]] = []
    citations_log: list[dict[str, Any]] = [
        {
            "chunk_id": chunk.chunk_id,
            "doc_id": chunk.document_id,
            "score": round(chunk.score, 4),
        }
        for chunk in rag_chunks
    ]
    collected_content = ""

    for round_num in range(AI_MAX_TOOL_ROUNDS + 1):
        stream_kwargs: dict[str, Any] = {
            "model": OPENAI_CHAT_MODEL,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
            "temperature": 0.2,
            "max_tokens": 2048,
        }
        if openai_tools:
            stream_kwargs["tools"] = openai_tools
            stream_kwargs["tool_choice"] = "auto"

        collected_content = ""
        collected_tool_calls: dict[int, dict[str, Any]] = {}

        async for chunk in await client.chat.completions.create(**stream_kwargs):
            if not chunk.choices and chunk.usage:
                total_prompt_tokens += chunk.usage.prompt_tokens or 0
                total_completion_tokens += chunk.usage.completion_tokens or 0
                continue

            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta
            if delta.content:
                collected_content += delta.content
                yield _sse("token", {"text": delta.content})

            if delta.tool_calls:
                for tool_call in delta.tool_calls:
                    idx = tool_call.index
                    if idx not in collected_tool_calls:
                        collected_tool_calls[idx] = {
                            "id": tool_call.id or "",
                            "name": "",
                            "args": "",
                        }
                    if tool_call.id:
                        collected_tool_calls[idx]["id"] = tool_call.id
                    if tool_call.function:
                        if tool_call.function.name:
                            collected_tool_calls[idx]["name"] = tool_call.function.name
                        if tool_call.function.arguments:
                            collected_tool_calls[idx]["args"] += tool_call.function.arguments

        if not collected_tool_calls:
            break

        if round_num >= AI_MAX_TOOL_ROUNDS:
            yield _sse("error", {"message": f"Max tool rounds ({AI_MAX_TOOL_ROUNDS}) reached"})
            break

        messages.append(
            {
                "role": "assistant",
                "content": collected_content or None,
                "tool_calls": [
                    {
                        "id": tool_call["id"],
                        "type": "function",
                        "function": {
                            "name": tool_call["name"],
                            "arguments": tool_call["args"],
                        },
                    }
                    for tool_call in collected_tool_calls.values()
                ],
            }
        )

        for tool_call in collected_tool_calls.values():
            sanitized_name = tool_call["name"]
            tool_name = tool_name_map.get(sanitized_name, sanitized_name)
            tool_def = registry.get(tool_name)

            raw_args = json.loads(tool_call["args"]) if tool_call["args"] else {}
            if tool_def is not None:
                raw_args = _maybe_attach_scope(tool_def, raw_args, scope_dump)

            emit_log(
                level="info",
                service="backend",
                action="ai.gateway.tool_call",
                message="Executing Winston tool",
                context={
                    "tool_name": tool_name,
                    "tool_args": raw_args,
                },
            )

            if not tool_def:
                tool_result = {"error": f"Unknown tool: {tool_name}"}
                tool_calls_log.append({"name": tool_name, "success": False, "error": tool_result["error"]})
            else:
                try:
                    tool_result = execute_tool(tool_def, ctx, raw_args)
                    tool_call_count += 1
                    tool_calls_log.append({"name": tool_name, "success": True, "args": raw_args})
                except Exception as tool_err:
                    tool_result = {"error": str(tool_err)[:500]}
                    tool_calls_log.append(
                        {
                            "name": tool_name,
                            "success": False,
                            "args": raw_args,
                            "error": str(tool_err)[:200],
                        }
                    )

            emit_log(
                level="info",
                service="backend",
                action="ai.gateway.tool_result",
                message="Winston tool finished",
                context={
                    "tool_name": tool_name,
                    "result_preview": _preview(tool_result, max_chars=1000),
                },
            )

            yield _sse(
                "tool_call",
                {
                    "tool_name": tool_name,
                    "args": raw_args,
                    "result_preview": _preview(tool_result, max_chars=400),
                },
            )
            yield _sse(
                "tool_result",
                {
                    "tool_name": tool_name,
                    "args": raw_args,
                    "result": _json_safe(tool_result),
                },
            )

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "content": json.dumps(_json_safe(tool_result), ensure_ascii=True),
                }
            )

    if conversation_id and collected_content:
        try:
            from app.services import ai_conversations as convo_svc

            convo_svc.append_message(
                conversation_id=conversation_id,
                role="user",
                content=message,
            )
            convo_svc.append_message(
                conversation_id=conversation_id,
                role="assistant",
                content=collected_content,
                tool_calls=tool_calls_log or None,
                citations=citations_log or None,
                token_count=total_completion_tokens or None,
            )
        except Exception:
            pass

    elapsed_ms = int((time.time() - start) * 1000)
    try:
        audit_svc.record_event(
            actor=actor,
            action="ai.gateway.ask",
            tool_name="ai_gateway",
            success=True,
            latency_ms=elapsed_ms,
            business_id=uuid.UUID(resolved_scope.business_id) if resolved_scope.business_id else None,
            input_data={
                "message": message[:500],
                "session_id": session_id,
                "route": normalized_envelope.ui.route,
                "surface": normalized_envelope.ui.surface,
                "resolved_scope": scope_dump,
            },
            output_data={
                "tool_calls": tool_call_count,
                "tool_log": tool_calls_log,
                "rag_chunks": len(rag_chunks),
                "prompt_tokens": total_prompt_tokens,
                "completion_tokens": total_completion_tokens,
            },
        )
    except Exception:
        pass

    yield _sse(
        "done",
        {
            "session_id": session_id,
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "tool_calls": tool_call_count,
            "elapsed_ms": elapsed_ms,
            "resolved_scope": scope_dump,
        },
    )
