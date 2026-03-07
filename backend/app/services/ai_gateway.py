"""AI Gateway service — OpenAI Chat Completions with streaming tool calls + RAG."""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any, AsyncGenerator

import hashlib

from app.config import AI_MAX_TOOL_ROUNDS, ENABLE_QUERY_EXPANSION, OPENAI_API_KEY, OPENAI_CHAT_MODEL, OPENAI_CHAT_MODEL_FALLBACK, RAG_CACHE_TTL_SECONDS, RAG_MIN_SCORE, RAG_OVERFETCH, RAG_RERANK_METHOD, RAG_TOP_K
from app.mcp.audit import execute_tool
from app.mcp.auth import McpContext
from app.mcp.registry import registry
from app.observability.logger import emit_log
from app.services import langfuse_client
from app.observability.request_context import get_request_context, set_request_context
from app.schemas.ai_gateway import AssistantContextEnvelope
from app.services import audit as audit_svc
from app.services.assistant_scope import (
    build_context_block,
    ensure_context_envelope,
    resolve_assistant_scope,
    resolve_visible_context_policy,
)
from app.services.cost_tracker import estimate_cost
from app.services.rag_indexer import RetrievedChunk, semantic_search
from app.services.rag_reranker import rerank_chunks
from app.services.model_registry import get_caps, map_openai_error, sanitize_params
from app.services.request_router import classify_request


# ── RAG result cache (60s TTL) ────────────────────────────────────────
_rag_cache: dict[str, tuple[float, list[RetrievedChunk]]] = {}


def _rag_cache_key(query: str, business_id: str, env_id: str | None, entity_id: str | None) -> str:
    raw = f"{query}:{business_id}:{env_id}:{entity_id}"
    return hashlib.md5(raw.encode()).hexdigest()


def _rag_cache_get(key: str) -> list[RetrievedChunk] | None:
    entry = _rag_cache.get(key)
    if entry is None:
        return None
    ts, chunks = entry
    if time.time() - ts > RAG_CACHE_TTL_SECONDS:
        del _rag_cache[key]
        return None
    return chunks


def _rag_cache_set(key: str, chunks: list[RetrievedChunk]) -> None:
    _rag_cache[key] = (time.time(), chunks)
    # Evict old entries if cache grows too large
    if len(_rag_cache) > 200:
        oldest_key = min(_rag_cache, key=lambda k: _rag_cache[k][0])
        del _rag_cache[oldest_key]


_SYSTEM_PROMPT_BASE = """You are Winston, an in-app copilot embedded in an institutional real estate private equity platform.

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

## Tool Failure Recovery
- If a tool call returns an error, surface the error plainly: "I tried to [action] but got: [error]."
- NEVER invent or fabricate a result when a tool call fails or returns nothing. Silence from a tool is NOT success.
- If you attempted a tool call that returned an "Unknown tool" error, tell the user: "That operation is not available in the current configuration."

## Data Model
- In this platform, "deals" and "investments" are the SAME entity (stored in repe_deal table).
- The hierarchy is: Business → Environment → Fund → Deal/Investment → Asset.
- When the user says "investments", use repe.list_deals. When they say "deals", use the same tool.
- Do NOT confuse deals/investments with funds or assets.

## Response Style
- Be concise, data-driven, and explicit about freshness.
- Use tables for multi-entity comparisons and bullets for simple summaries.
- Never fabricate fund names, cap rates, IRRs, or entity-level figures.
- Cite retrieved chunk_id values when using document context.
"""

_MUTATION_RULES_BLOCK = """
## Mutation Rules — Two-Phase Write Flow

CRITICAL: Call the write tool FIRST. Do NOT gather parameters through conversation.

### The four steps
1. User requests creation/modification → call the write tool with `confirmed=false` IMMEDIATELY.
   - Do NOT ask "what name?", "what vintage?", or any other parameter question first.
   - Call the tool with whatever you know. If `name` is missing, the tool returns `needs_input`.
2. Tool returns either:
   - A `needs_input` response (missing required field) → ask the user ONLY for that field, then call again with confirmed=false and all previously provided params.
   - A `pending_confirmation` summary → present it and ask "Shall I proceed?"
3. User confirms ("yes", "go ahead", "proceed") → call the SAME tool again with confirmed=true and the EXACT SAME parameters.
4. Tool executes → report what was created and its ID.

### FORBIDDEN — never do these
- Never ask "Please provide the necessary details" before calling the tool.
- Never generate your own confirmation summary. Let the tool produce it.
- Never respond to "yes" without calling the tool with confirmed=true.
- Never ask for parameters you can infer from the user's message.

### Recovery: if the user says "yes" and you have no recent tool call
Check the conversation history for a pending action. Identify the parameters discussed and call the write tool with confirmed=true.
"""

_READ_ONLY_BLOCK = """
## Operating Mode: Read-Only
- You operate in read-only mode. You can look up, analyze, and report on data, but you cannot create, modify, or delete records.
- If the user asks you to create, add, or modify something, explain that write operations are not available and suggest they use the platform UI directly.
"""


def _has_write_tools() -> bool:
    """Check if any write-permission tools are registered."""
    for tool_def in registry.list_all():
        if tool_def.permission == "write" and tool_def.handler is not None:
            return True
    return False


def _build_system_prompt() -> str:
    """Build system prompt dynamically based on registered tool capabilities."""
    if _has_write_tools():
        return _SYSTEM_PROMPT_BASE + _MUTATION_RULES_BLOCK
    return _SYSTEM_PROMPT_BASE + _READ_ONLY_BLOCK


def _sanitize_tool_name(name: str) -> str:
    return name.replace(".", "__")


_cached_tools: tuple[list[dict], dict[str, str]] | None = None


def _reset_tool_cache() -> None:
    global _cached_tools
    _cached_tools = None


def _build_openai_tools() -> tuple[list[dict], dict[str, str]]:
    global _cached_tools
    if _cached_tools is not None:
        return _cached_tools

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
    _cached_tools = (tools, name_map)
    return _cached_tools


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
    timings: dict[str, int] = {}
    session_id = session_id or str(uuid.uuid4())

    # ── Langfuse trace (no-op if not configured) ─────────────────────
    trace = langfuse_client.create_trace(
        name="gateway_stream",
        session_id=session_id,
        user_id=actor,
        input=message,
    )

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

    timings["context_resolution_ms"] = int((time.time() - start) * 1000)
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

    # ── Visible context policy + request routing ──────────────────────
    visible_context_policy = resolve_visible_context_policy(
        context_envelope=normalized_envelope,
        user_message=message,
    )
    route = classify_request(
        message=message,
        context_envelope=normalized_envelope,
        resolved_scope=resolved_scope,
        visible_context_shortcut=visible_context_policy["disable_tools"],
    )

    # Emit status immediately so frontend shows processing started
    yield _sse(
        "status",
        {
            "message": f"Processing ({route.lane}): {resolved_scope.entity_name or resolved_scope.environment_id or 'global'}",
            "lane": route.lane,
            "scope": resolved_scope.entity_name or resolved_scope.entity_id or resolved_scope.environment_id,
        },
    )

    emit_log(
        level="info",
        service="backend",
        action="ai.gateway.route_classified",
        message=f"Request routed to Lane {route.lane}",
        context={"lane": route.lane, "skip_rag": route.skip_rag, "skip_tools": route.skip_tools, "max_tool_rounds": route.max_tool_rounds},
    )
    trace.update(metadata={
        "lane": route.lane,
        "model": route.model or OPENAI_CHAT_MODEL,
        "env_id": resolved_scope.environment_id,
        "scope": scope_dump,
    }, tags=[f"lane:{route.lane}"])

    # ── Graceful degradation: write request but no write tools ────────
    if route.is_write and not _has_write_tools():
        yield _sse("token", {"text": "Write operations (creating funds, deals, or assets) are not available in the current configuration. I can read and analyze your portfolio data — for creating records, please use the platform UI directly."})
        timings["total_ms"] = int((time.time() - start) * 1000)
        yield _sse("done", {
            "session_id": session_id,
            "trace": {
                "execution_path": "chat", "lane": route.lane, "model": "none",
                "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
                "tool_call_count": 0, "tool_timeline": [], "data_sources": [],
                "citations": [], "rag_chunks_used": 0, "warnings": ["Write tools not registered"],
                "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
                "repe": None, "visible_context_shortcut": False, "timings": timings,
            },
            "prompt_tokens": 0, "completion_tokens": 0, "tool_calls": 0,
            "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
        })
        return

    # ── RAG (conditional — skipped for Lane A/B when not needed) ────
    rag_chunks: list[RetrievedChunk] = []
    rag_business_id = resolved_scope.business_id or (str(business_id) if business_id else None)
    rag_env_id = resolved_scope.environment_id or (str(env_id) if env_id else None)
    rag_entity_type = resolved_scope.entity_type or entity_type
    rag_entity_id = resolved_scope.entity_id or (str(entity_id) if entity_id else None)
    rag_chunks_raw: list[RetrievedChunk] = []
    if not route.skip_rag and rag_business_id:
        effective_top_k = route.rag_top_k if route.rag_top_k > 0 else RAG_TOP_K
        cache_key = _rag_cache_key(message, str(rag_business_id), rag_env_id, rag_entity_id)
        cached = _rag_cache_get(cache_key)
        try:
            if cached is not None:
                rag_chunks_raw = cached
            else:
                _search_kwargs = dict(
                    business_id=uuid.UUID(str(rag_business_id)),
                    env_id=uuid.UUID(str(rag_env_id)) if rag_env_id else None,
                    entity_type=rag_entity_type,
                    entity_id=uuid.UUID(str(rag_entity_id)) if rag_entity_id else None,
                    top_k=effective_top_k,
                    use_hybrid=route.use_hybrid,
                    scope_entity_type=resolved_scope.entity_type,
                    scope_entity_id=resolved_scope.entity_id,
                    scope_env_id=resolved_scope.environment_id,
                    overfetch=RAG_OVERFETCH if route.use_rerank else None,
                    return_all=route.use_rerank,
                    trace=trace,
                )
                # T-2.3: Query expansion (multi-query retrieval)
                if getattr(route, "needs_query_expansion", False) and ENABLE_QUERY_EXPANSION:
                    from app.services.query_rewriter import expand_query
                    queries = await expand_query(message, trace=trace)
                    all_chunks: list[RetrievedChunk] = []
                    for q in queries:
                        all_chunks.extend(semantic_search(query=q, **_search_kwargs))
                    # Deduplicate by chunk_id, keep highest score
                    seen: dict[str, RetrievedChunk] = {}
                    for c in all_chunks:
                        if c.chunk_id not in seen or c.score > seen[c.chunk_id].score:
                            seen[c.chunk_id] = c
                    rag_chunks_raw = list(seen.values())
                else:
                    rag_chunks_raw = semantic_search(query=message, **_search_kwargs)
                _rag_cache_set(cache_key, rag_chunks_raw)
            # Cross-encoder re-ranking FIRST (before threshold) — T-2.1
            if route.use_rerank and len(rag_chunks_raw) > 1:
                rag_chunks = await rerank_chunks(
                    query=message,
                    chunks=rag_chunks_raw,
                    top_k=effective_top_k,
                    trace=trace,
                )
            else:
                rag_chunks = list(rag_chunks_raw)
            # Score threshold filter AFTER rerank
            rag_chunks = [c for c in rag_chunks if c.score >= RAG_MIN_SCORE]
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
                        "source_filename": chunk.source_filename,
                        "retrieval_method": chunk.retrieval_method,
                    },
                )
        except Exception as rag_err:
            rag_chunks = []
            yield _sse(
                "citation",
                {"message": f"RAG unavailable: {str(rag_err)[:100]}"},
            )

        # Langfuse RAG span
        rag_elapsed_ms = int((time.time() - start) * 1000) - timings.get("context_resolution_ms", 0)
        trace.span(
            name="rag_retrieval",
            input={"query": message, "use_hybrid": route.use_hybrid, "use_rerank": route.use_rerank},
            output={
                "chunks_raw": len(rag_chunks_raw),
                "chunks_final": len(rag_chunks),
                "scores": [round(c.score, 4) for c in rag_chunks[:10]],
            },
        ).end(metadata={"elapsed_ms": rag_elapsed_ms})

    rag_context = ""
    if rag_chunks:
        rag_context = "\n\nRELEVANT DOCUMENT CONTEXT:\n"
        rag_token_budget = route.rag_max_tokens if route.rag_max_tokens > 0 else 9999
        rag_tokens_used = 0
        for idx, chunk in enumerate(rag_chunks, 1):
            # Approximate token count: ~4 chars per token
            chunk_text = chunk.chunk_text[:800]
            chunk_tokens = len(chunk_text) // 4
            if rag_tokens_used + chunk_tokens > rag_token_budget:
                break
            rag_tokens_used += chunk_tokens
            heading = f" | section={chunk.section_heading}" if chunk.section_heading else ""
            rag_context += (
                f"\n[Doc {idx} | score={chunk.score:.3f}{heading}]\n"
                f"{chunk_text}\n"
            )

    timings["rag_search_ms"] = int((time.time() - start) * 1000) - timings["context_resolution_ms"]
    context_block = build_context_block(
        context_envelope=normalized_envelope,
        resolved_scope=resolved_scope,
        additional_instructions=visible_context_policy["instructions"],
    )
    system_prompt = _build_system_prompt()
    effective_model = route.model or OPENAI_CHAT_MODEL
    # Reasoning models use "developer" role instead of "system"
    system_role = "developer" if _is_reasoning_model(effective_model) else "system"
    messages: list[dict[str, Any]] = [
        {"role": system_role, "content": system_prompt + "\n\n" + context_block + rag_context},
    ]

    # ── Conversation history (token-budgeted per lane) ────────────
    if conversation_id:
        try:
            from app.services import ai_conversations as convo_svc

            history = convo_svc.get_messages(conversation_id=conversation_id)
            max_history = 6 if route.lane in ("A", "B") else 10
            recent = [m for m in history if m["role"] in ("user", "assistant")][-max_history:]
            history_token_budget = route.history_max_tokens
            history_tokens_used = 0
            # Walk backwards (most recent first) to prioritize recent context
            history_msgs: list[dict[str, str]] = []
            for msg in reversed(recent):
                content = msg["content"] or ""
                if msg["role"] == "assistant" and msg.get("tool_calls"):
                    stored_tcs = msg["tool_calls"]
                    if isinstance(stored_tcs, str):
                        try:
                            stored_tcs = json.loads(stored_tcs)
                        except Exception:
                            stored_tcs = None
                    if stored_tcs and "[SYSTEM NOTE:" not in content:
                        tc_parts = []
                        for tc in stored_tcs:
                            args = tc.get("args", {})
                            tc_parts.append(f"{tc['name']}({json.dumps(args, default=str)})")
                        content += f"\n\n[Prior tool calls: {'; '.join(tc_parts)}]"
                msg_tokens = len(content) // 4  # ~4 chars per token approximation
                if history_tokens_used + msg_tokens > history_token_budget:
                    break
                history_tokens_used += msg_tokens
                history_msgs.append({"role": msg["role"], "content": content})
            # Reverse back to chronological order
            for msg in reversed(history_msgs):
                messages.append(msg)
        except Exception:
            pass

    messages.append({"role": "user", "content": message})

    openai_tools, tool_name_map = _build_openai_tools()
    if route.skip_tools:
        emit_log(
            level="info",
            service="backend",
            action="ai.gateway.visible_context_shortcut",
            message=f"Lane {route.lane}: tools disabled",
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
    total_cached_tokens = 0
    tool_call_count = 0
    tool_calls_log: list[dict[str, Any]] = []
    tool_timeline: list[dict[str, Any]] = []
    data_sources: list[dict[str, Any]] = []
    warnings: list[str] = []
    execution_path: str = "chat"
    citations_log: list[dict[str, Any]] = [
        {
            "chunk_id": chunk.chunk_id,
            "doc_id": chunk.document_id,
            "score": round(chunk.score, 4),
        }
        for chunk in rag_chunks
    ]
    collected_content = ""
    timings["prompt_construction_ms"] = int((time.time() - start) * 1000) - timings.get("rag_search_ms", 0) - timings["context_resolution_ms"]
    model_start = time.time()
    first_token_time: float | None = None

    effective_max_rounds = min(route.max_tool_rounds, AI_MAX_TOOL_ROUNDS)
    for round_num in range(effective_max_rounds + 1):
        effective_model = route.model or OPENAI_CHAT_MODEL
        stream_kwargs = sanitize_params(
            effective_model,
            messages=messages,
            max_tokens=route.max_tokens,
            temperature=route.temperature,
            reasoning_effort=route.reasoning_effort,
            tools=openai_tools or None,
            stream=True,
        )

        collected_content = ""
        collected_tool_calls: dict[int, dict[str, Any]] = {}
        llm_span = trace.generation(
            name=f"llm_round_{round_num}",
            model=effective_model,
            input={"message_count": len(messages)},
        )

        # Retry + fallback on model errors
        stream = None
        _models_to_try = [effective_model]
        if OPENAI_CHAT_MODEL_FALLBACK and OPENAI_CHAT_MODEL_FALLBACK != effective_model:
            _models_to_try.append(OPENAI_CHAT_MODEL_FALLBACK)
        for _try_model in _models_to_try:
            try:
                _kwargs = stream_kwargs if _try_model == effective_model else sanitize_params(
                    _try_model, messages=messages, max_tokens=route.max_tokens,
                    tools=openai_tools or None, stream=True,
                )
                stream = await client.chat.completions.create(**_kwargs)
                if _try_model != effective_model:
                    effective_model = _try_model
                    emit_log(level="warning", service="backend", action="ai.gateway.fallback",
                             message=f"Using fallback model {_try_model}", context={"original": _models_to_try[0]})
                break
            except Exception as model_err:
                mapped = map_openai_error(model_err, _try_model)
                emit_log(level="error", service="backend", action="ai.gateway.model_error",
                         message=mapped.debug_message, context={"model": _try_model})
                if mapped.is_retryable and _try_model != _models_to_try[-1]:
                    continue  # try fallback
                yield _sse("error", {"message": mapped.user_message, "debug": mapped.debug_message})
                warnings.append(f"Model error: {mapped.debug_message}")
                break
        if stream is None:
            break

        async for chunk in stream:
            if not chunk.choices and chunk.usage:
                total_prompt_tokens += chunk.usage.prompt_tokens or 0
                total_completion_tokens += chunk.usage.completion_tokens or 0
                # T-1.2: Track prompt cache hits
                details = getattr(chunk.usage, "prompt_tokens_details", None)
                if details:
                    total_cached_tokens += getattr(details, "cached_tokens", 0) or 0
                continue

            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta
            if delta.content:
                if first_token_time is None:
                    first_token_time = time.time()
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

        llm_span.update(
            output=collected_content[:500] if collected_content else None,
            usage={"input": total_prompt_tokens, "output": total_completion_tokens},
        )
        llm_span.end()

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

        execution_path = "tool"

        # Prepare all tool calls for parallel execution
        tool_tasks: list[dict[str, Any]] = []
        for tool_call in collected_tool_calls.values():
            sanitized_name = tool_call["name"]
            t_name = tool_name_map.get(sanitized_name, sanitized_name)
            t_def = registry.get(t_name)
            raw_args = json.loads(tool_call["args"]) if tool_call["args"] else {}
            if t_def is not None:
                raw_args = _maybe_attach_scope(t_def, raw_args, scope_dump)
            tool_tasks.append({
                "call": tool_call,
                "tool_name": t_name,
                "tool_def": t_def,
                "raw_args": raw_args,
            })

        # Emit status for tool execution
        tool_names = [t["tool_name"] for t in tool_tasks]
        yield _sse("status", {"message": f"Looking up {', '.join(t.replace('repe.', '').replace('_', ' ') for t in tool_names)}..."})

        # Execute all tool calls concurrently
        async def _run_tool(task: dict[str, Any]) -> dict[str, Any]:
            t_name = task["tool_name"]
            t_def = task["tool_def"]
            raw_args = task["raw_args"]
            emit_log(
                level="info",
                service="backend",
                action="ai.gateway.tool_call",
                message="Executing Winston tool",
                context={"tool_name": t_name, "tool_args": raw_args},
            )
            tool_start = time.time()
            t_success = False
            t_error_msg: str | None = None
            if not t_def:
                t_result = {"error": f"Unknown tool: {t_name}"}
                t_error_msg = t_result["error"]
            else:
                try:
                    loop = asyncio.get_event_loop()
                    t_result = await loop.run_in_executor(None, execute_tool, t_def, ctx, raw_args)
                    t_success = True
                except Exception as tool_err:
                    t_result = {"error": str(tool_err)[:500]}
                    t_error_msg = str(tool_err)[:200]
            t_duration_ms = int((time.time() - tool_start) * 1000)
            return {
                "tool_name": t_name,
                "tool_def": t_def,
                "raw_args": raw_args,
                "result": t_result,
                "success": t_success,
                "error_msg": t_error_msg,
                "duration_ms": t_duration_ms,
                "call": task["call"],
            }

        results = await asyncio.gather(*[_run_tool(t) for t in tool_tasks], return_exceptions=True)

        # Process results in order (preserves message sequence for OpenAI)
        for res in results:
            if isinstance(res, Exception):
                warnings.append(f"Tool execution exception: {str(res)[:200]}")
                continue

            tool_name = res["tool_name"]
            tool_def = res["tool_def"]
            raw_args = res["raw_args"]
            tool_result = res["result"]
            tool_success = res["success"]
            tool_error_msg = res["error_msg"]
            tool_duration_ms = res["duration_ms"]

            if tool_success:
                tool_call_count += 1
                tool_calls_log.append({"name": tool_name, "success": True, "args": raw_args})
            else:
                tool_calls_log.append({"name": tool_name, "success": False, "args": raw_args, "error": tool_error_msg})

            # Build timeline entry
            result_summary = _preview(tool_result, max_chars=200)
            row_count = None
            if isinstance(tool_result, dict):
                for count_key in ("total", "count", "row_count"):
                    if count_key in tool_result:
                        row_count = tool_result[count_key]
                        break
                for list_key in ("funds", "deals", "assets", "investments", "items", "rows"):
                    if isinstance(tool_result.get(list_key), list):
                        row_count = len(tool_result[list_key])
                        break

            timeline_entry: dict[str, Any] = {
                "step": len(tool_timeline) + 1,
                "tool_name": tool_name,
                "purpose": tool_def.description[:120] if tool_def and tool_def.description else tool_name,
                "success": tool_success,
                "duration_ms": tool_duration_ms,
                "result_summary": result_summary,
                "row_count": row_count,
            }
            if tool_error_msg:
                timeline_entry["error"] = tool_error_msg
            tool_timeline.append(timeline_entry)

            if tool_success and tool_def:
                source_entry: dict[str, Any] = {
                    "source_type": "database",
                    "tool_name": tool_name,
                    "module": tool_def.module if hasattr(tool_def, "module") else None,
                }
                if row_count is not None:
                    source_entry["row_count"] = row_count
                data_sources.append(source_entry)

            emit_log(
                level="info",
                service="backend",
                action="ai.gateway.tool_result",
                message="Winston tool finished",
                context={"tool_name": tool_name, "result_preview": _preview(tool_result, max_chars=1000), "duration_ms": tool_duration_ms},
            )

            # Detect pending_confirmation from write tools
            is_pending_confirmation = (
                isinstance(tool_result, dict) and tool_result.get("pending_confirmation") is True
            )
            is_write_tool = tool_def and tool_def.permission == "write" if tool_def else False

            yield _sse(
                "tool_call",
                {
                    "tool_name": tool_name,
                    "args": raw_args,
                    "result_preview": _preview(tool_result, max_chars=400),
                    "duration_ms": tool_duration_ms,
                    "success": tool_success,
                    "row_count": row_count,
                    "is_write": is_write_tool,
                    "pending_confirmation": is_pending_confirmation,
                },
            )
            if is_pending_confirmation:
                yield _sse(
                    "confirmation_required",
                    {
                        "tool_name": tool_name,
                        "action": tool_result.get("action", tool_name),
                        "summary": tool_result.get("summary", {}),
                        "message": tool_result.get("message", "Confirm to proceed."),
                    },
                )
            yield _sse(
                "tool_result",
                {"tool_name": tool_name, "args": raw_args, "result": _json_safe(tool_result)},
            )

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": res["call"]["id"],
                    "content": json.dumps(_json_safe(tool_result), ensure_ascii=True),
                }
            )

    if conversation_id:
        try:
            from app.services import ai_conversations as convo_svc

            convo_svc.append_message(
                conversation_id=conversation_id,
                role="user",
                content=message,
            )
            # Build enriched content that includes tool call context so
            # the next turn's history gives the LLM full awareness of
            # what happened (especially pending confirmations).
            enriched_content = collected_content or ""
            if tool_calls_log:
                tool_summary_parts: list[str] = []
                for tc in tool_calls_log:
                    tc_line = f"  - {tc['name']}(confirmed={tc.get('args', {}).get('confirmed', 'N/A')})"
                    if tc.get("success"):
                        tc_line += " → success"
                    else:
                        tc_line += f" → error: {tc.get('error', 'unknown')}"
                    tool_summary_parts.append(tc_line)
                # Check for any pending confirmations
                pending_tools = [
                    tc for tc in tool_calls_log
                    if tc.get("success") and tc.get("args", {}).get("confirmed") is False
                ]
                if pending_tools:
                    pending_names = [tc["name"] for tc in pending_tools]
                    enriched_content += (
                        "\n\n[SYSTEM NOTE: Tool calls this turn: "
                        + "; ".join(tool_summary_parts)
                        + ". PENDING CONFIRMATION for: " + ", ".join(pending_names) + ". "
                        + "If the user confirms, call the same tool again with confirmed=true "
                        + "using the same parameters.]"
                    )
            # Defensive: if Winston produced a text-only confirmation (no tool call),
            # still annotate the persisted message so "yes" on the next turn has context.
            _CONFIRMATION_PHRASES = [
                "shall i proceed", "would you like me to proceed", "should i proceed",
                "shall i create", "want me to proceed", "shall i go ahead",
                "would you like to proceed", "ready to create",
            ]
            if not tool_calls_log and any(
                phrase in (collected_content or "").lower()
                for phrase in _CONFIRMATION_PHRASES
            ):
                enriched_content += (
                    "\n\n[SYSTEM NOTE: The above was a confirmation request with no tool call executed. "
                    "If the user confirms ('yes', 'go ahead', 'proceed'), identify the proposed action "
                    "from the conversation above and call the appropriate write tool with confirmed=true "
                    "using those parameters.]"
                )
            if enriched_content:
                convo_svc.append_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=enriched_content,
                    tool_calls=tool_calls_log or None,
                    citations=citations_log or None,
                    token_count=total_completion_tokens or None,
                )
        except Exception:
            pass

    elapsed_ms = int((time.time() - start) * 1000)
    timings["model_ms"] = int((time.time() - model_start) * 1000)
    if first_token_time is not None:
        timings["ttft_ms"] = int((first_token_time - model_start) * 1000)
    timings["total_ms"] = elapsed_ms
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

    # Track RAG as data source
    if rag_chunks:
        execution_path = "hybrid" if tool_call_count > 0 else "rag"
        for chunk in rag_chunks:
            data_sources.append({
                "source_type": "document",
                "doc_id": chunk.document_id,
                "chunk_id": chunk.chunk_id,
                "score": round(chunk.score, 4),
                "section_heading": chunk.section_heading,
            })

    # Detect REPE-specific metadata from scope
    repe_metadata: dict[str, Any] = {}
    if resolved_scope.industry == "real_estate":
        repe_metadata["industry"] = "real_estate"
        if resolved_scope.entity_type == "fund":
            repe_metadata["rollup_level"] = "fund"
            repe_metadata["fund_id"] = resolved_scope.entity_id
        elif resolved_scope.entity_type == "asset":
            repe_metadata["rollup_level"] = "asset"
            repe_metadata["asset_id"] = resolved_scope.entity_id
        elif resolved_scope.entity_type in ("investment", "deal"):
            repe_metadata["rollup_level"] = "investment"
            repe_metadata["deal_id"] = resolved_scope.entity_id
        else:
            repe_metadata["rollup_level"] = "portfolio"
        repe_metadata["schema_name"] = resolved_scope.schema_name

    # Build RAG quality and cost metrics for trace
    rag_quality = {
        "chunks_retrieved": len(rag_chunks_raw),
        "chunks_after_threshold": len([c for c in rag_chunks_raw if c.score >= RAG_MIN_SCORE]) if rag_chunks_raw else 0,
        "chunks_after_rerank": len(rag_chunks),
        "rerank_method": RAG_RERANK_METHOD if route.use_rerank else "none",
        "hybrid_used": route.use_hybrid,
        "scores": [round(c.score, 4) for c in rag_chunks],
    }
    cost_info = estimate_cost(
        model=route.model or OPENAI_CHAT_MODEL,
        prompt_tokens=total_prompt_tokens,
        completion_tokens=total_completion_tokens,
        rerank_method=RAG_RERANK_METHOD if route.use_rerank else None,
    )

    # ── Langfuse finalize ────────────────────────────────────────────
    trace.update(
        output=collected_content[:1000] if collected_content else None,
        metadata={
            "lane": route.lane,
            "model": route.model or OPENAI_CHAT_MODEL,
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "cached_tokens": total_cached_tokens,
            "tool_call_count": tool_call_count,
            "rag_chunks_used": len(rag_chunks),
            "elapsed_ms": elapsed_ms,
            "cost": cost_info,
        },
    )
    langfuse_client.flush()

    yield _sse(
        "done",
        {
            "session_id": session_id,
            "trace": {
                "execution_path": execution_path,
                "lane": route.lane,
                "model": route.model or OPENAI_CHAT_MODEL,
                "reasoning_effort": route.reasoning_effort,
                "prompt_tokens": total_prompt_tokens,
                "completion_tokens": total_completion_tokens,
                "cached_tokens": total_cached_tokens,
                "total_tokens": total_prompt_tokens + total_completion_tokens,
                "tool_call_count": tool_call_count,
                "tool_timeline": tool_timeline,
                "data_sources": data_sources,
                "citations": citations_log,
                "rag_chunks_used": len(rag_chunks),
                "warnings": warnings,
                "elapsed_ms": elapsed_ms,
                "resolved_scope": scope_dump,
                "repe": repe_metadata or None,
                "visible_context_shortcut": visible_context_policy.get("disable_tools", False),
                "timings": timings,
                "rag_quality": rag_quality,
                "cost": cost_info,
            },
            # Keep flat fields for backward compat
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "tool_calls": tool_call_count,
            "elapsed_ms": elapsed_ms,
            "resolved_scope": scope_dump,
        },
    )
