from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, AsyncGenerator

from app.assistant_runtime.context_resolver import resolve_runtime_context
from app.assistant_runtime.degraded_responses import degraded_blocks, degraded_message
from app.assistant_runtime.execution_engine import execute_tool_calls, prepare_tools
from app.assistant_runtime.prompt_registry import compose_runtime_messages
from app.assistant_runtime.retrieval_orchestrator import execute_retrieval
from app.assistant_runtime.skill_router import route_skill
from app.assistant_runtime.turn_receipts import (
    ContextResolutionStatus,
    DegradedReason,
    Lane,
    RetrievalStatus,
    ToolStatus,
    TurnReceipt,
    TurnStatus,
    legacy_code_to_lane,
)
from app.config import AI_MAX_TOOL_ROUNDS, OPENAI_API_KEY
from app.mcp.auth import McpContext
from app.observability.logger import emit_log
from app.schemas.ai_gateway import AssistantContextEnvelope
from app.services import audit as audit_svc
from app.services import ai_conversations as convo_svc
from app.services.ai_client import get_instrumented_client
from app.services.assistant_blocks import citations_block, confirmation_block, markdown_block
from app.services.assistant_scope import build_context_block, resolve_visible_context_policy
from app.services.model_registry import get_caps, map_openai_error, sanitize_params
from app.services.request_router import classify_request
from app.services.rag_indexer import RetrievedChunk

_SOURCE_AUDIT_RE = re.compile(
    r"\b(what data is this based on|what is this based on|what data did you use|what source(?:s)? did you use|"
    r"exact data source|data source|what tool did you use|which tool did you use|why did you answer that|justify|justification)\b",
    re.IGNORECASE,
)
_IDENTITY_PROMPT_RE = re.compile(
    r"\b(what am i looking at|what page|which page|what environment|where am i|which environment|what is this)\b",
    re.IGNORECASE,
)
_CREATE_ENTITY_RE = re.compile(
    r"\b(?:create|add|make|set up|register|new)\s+(?:a\s+|an\s+)?(?P<entity>fund|deal|asset|property|investment)\b(?:\s+called\s+(?P<name>.+))?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class FastResponse:
    text: str
    response_blocks: list[dict[str, Any]]


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): _json_safe(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    if hasattr(value, "hex"):
        return str(value)
    return value


def _sse(event: str, data: dict[str, Any]) -> str:
    from app.services.response_sanitizer import sanitize_response_token

    payload = dict(data)
    if event == "token" and "text" in payload:
        payload["text"] = sanitize_response_token(str(payload["text"]))
    return f"event: {event}\ndata: {json.dumps(_json_safe(payload), ensure_ascii=True)}\n\n"


def _citation_items(chunks: list[RetrievedChunk]) -> list[dict[str, Any]]:
    return [
        {
            "label": chunk.source_filename or chunk.document_id or chunk.chunk_id,
            "href": None,
            "snippet": chunk.chunk_text[:240],
            "score": round(chunk.score, 4),
            "doc_id": chunk.document_id,
            "chunk_id": chunk.chunk_id,
            "section_heading": chunk.section_heading,
        }
        for chunk in chunks
    ]


def _build_trace(
    *,
    turn_receipt: TurnReceipt,
    model: str,
    elapsed_ms: int,
    resolved_scope: dict[str, Any],
    response_blocks: list[dict[str, Any]],
    timings: dict[str, int | None] | None = None,
) -> dict[str, Any]:
    tool_timeline = [
        {
            "step": idx + 1,
            "tool_name": receipt.tool_name,
            "purpose": receipt.tool_name,
            "success": receipt.status == ToolStatus.SUCCESS,
            "duration_ms": 0,
            "result_summary": json.dumps(_json_safe(receipt.output if receipt.output is not None else {"error": receipt.error}))[:160],
            "error": receipt.error,
        }
        for idx, receipt in enumerate(turn_receipt.tools)
    ]
    execution_path = "tool" if turn_receipt.tools else "rag" if turn_receipt.retrieval.used else "chat"
    if turn_receipt.status != TurnStatus.SUCCESS:
        execution_path = "unavailable"
    warnings = [turn_receipt.degraded_reason] if turn_receipt.degraded_reason else []
    return {
        "execution_path": execution_path,
        "lane": turn_receipt.lane.value.split("_", 1)[0],
        "model": model,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "tool_call_count": len(turn_receipt.tools),
        "tool_timeline": tool_timeline,
        "data_sources": [],
        "citations": [],
        "rag_chunks_used": turn_receipt.retrieval.result_count,
        "warnings": warnings,
        "elapsed_ms": elapsed_ms,
        "resolved_scope": resolved_scope,
        "repe": None,
        "visible_context_shortcut": turn_receipt.lane == Lane.A_FAST,
        "runtime": {
            "backend_gateway_reached": True,
            "canonical_runtime": True,
            "degraded": turn_receipt.status != TurnStatus.SUCCESS,
            "tools_enabled": len(turn_receipt.tools) > 0,
            "rag_enabled": turn_receipt.retrieval.used,
            "timings": timings or {},
        },
        "response_block_count": len(response_blocks),
    }


def _status_from_tools(tool_statuses: list[ToolStatus]) -> tuple[TurnStatus, DegradedReason | None]:
    if not tool_statuses:
        return TurnStatus.SUCCESS, None
    if any(status == ToolStatus.DENIED for status in tool_statuses):
        return TurnStatus.DEGRADED, DegradedReason.TOOL_DENIED
    if any(status == ToolStatus.FAILED for status in tool_statuses):
        return TurnStatus.DEGRADED, DegradedReason.TOOL_FAILED
    return TurnStatus.SUCCESS, None


def _format_scope_label(*, resolved_scope: Any, envelope: AssistantContextEnvelope) -> str:
    if resolved_scope.entity_type == "environment":
        return resolved_scope.entity_name or envelope.ui.active_environment_name or "the current environment"
    if resolved_scope.entity_name:
        env_name = envelope.ui.active_environment_name or resolved_scope.environment_id
        if env_name:
            return f"{resolved_scope.entity_name} in {env_name}"
        return resolved_scope.entity_name
    return envelope.ui.active_environment_name or "the current context"


def _build_identity_fast_response(*, resolved_scope: Any, envelope: AssistantContextEnvelope) -> FastResponse | None:
    label = _format_scope_label(resolved_scope=resolved_scope, envelope=envelope)
    if resolved_scope.entity_type == "environment":
        text = f"You are in {label}."
    elif resolved_scope.entity_type:
        article = "an" if resolved_scope.entity_type[:1].lower() in {"a", "e", "i", "o", "u"} else "a"
        text = f"You are looking at {article} {resolved_scope.entity_type} view for {label}."
    else:
        text = f"You are in {label}."
    return FastResponse(text=text, response_blocks=[markdown_block(text)])


def _build_source_audit_fast_response(
    *,
    resolved_scope: Any,
    envelope: AssistantContextEnvelope,
    retrieval_used: bool,
    retrieval_count: int,
    tool_count: int,
) -> FastResponse:
    scope_label = _format_scope_label(resolved_scope=resolved_scope, envelope=envelope)
    if retrieval_used:
        text = (
            f"This answer is grounded in the current context for {scope_label}. "
            f"Retrieval was used and returned {retrieval_count} scoped result(s). "
            f"Tool calls used: {tool_count}."
        )
    else:
        text = (
            f"This answer is based on the current UI context for {scope_label}. "
            f"No retrieval sources or tools were used for this turn."
        )
    return FastResponse(text=text, response_blocks=[markdown_block(text)])


def _build_write_confirmation_fast_response(message: str) -> FastResponse | None:
    match = _CREATE_ENTITY_RE.search(message or "")
    if not match:
        return None
    entity_type = (match.group("entity") or "record").lower()
    raw_name = (match.group("name") or "").strip().strip("'\"")
    name = raw_name.rstrip("?.!,") if raw_name else None
    label = f"{entity_type} '{name}'" if name else entity_type
    text = f"Ready to create {label}. Confirm to proceed."
    block = confirmation_block(
        action=f"create_{entity_type}",
        summary=text,
        provided_params={"entity_type": entity_type, "name": name} if name else {"entity_type": entity_type},
        missing_fields=[] if name else ["name"],
    )
    return FastResponse(text=text, response_blocks=[markdown_block(text), block])


def _deterministic_fast_response(
    *,
    message: str,
    lane: Lane,
    routed_skill: Any,
    resolved_scope: Any,
    context_receipt: Any,
    envelope: AssistantContextEnvelope,
    retrieval_execution: Any,
) -> FastResponse | None:
    if context_receipt.resolution_status != ContextResolutionStatus.RESOLVED:
        return None
    normalized_message = message or ""
    skill_id = routed_skill.selection.skill_id

    if _SOURCE_AUDIT_RE.search(normalized_message):
        return _build_source_audit_fast_response(
            resolved_scope=resolved_scope,
            envelope=envelope,
            retrieval_used=retrieval_execution.receipt.used,
            retrieval_count=retrieval_execution.receipt.result_count,
            tool_count=0,
        )

    if skill_id == "create_entity" and lane == Lane.C_ANALYSIS and not retrieval_execution.receipt.used:
        return _build_write_confirmation_fast_response(normalized_message)

    if skill_id == "lookup_entity" and lane == Lane.A_FAST and _IDENTITY_PROMPT_RE.search(normalized_message):
        return _build_identity_fast_response(resolved_scope=resolved_scope, envelope=envelope)

    return None


async def run_request_lifecycle(
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
    request_id = f"req_{uuid.uuid4()}"
    started_at = time.time()
    session_id = session_id or str(uuid.uuid4())
    timings: dict[str, int | None] = {
        "context_resolution_ms": None,
        "route_selection_ms": None,
        "retrieval_ms": None,
        "first_token_ms": None,
        "tool_execution_ms": None,
        "render_completion_ms": None,
    }

    if not OPENAI_API_KEY:
        yield _sse("error", {"message": "OPENAI_API_KEY not configured"})
        return

    context_started = time.perf_counter()
    runtime_context = resolve_runtime_context(
        context_envelope=context_envelope,
        env_id=str(env_id) if env_id else None,
        business_id=str(business_id) if business_id else None,
        conversation_id=str(conversation_id) if conversation_id else None,
        actor=actor,
        message=message,
    )
    timings["context_resolution_ms"] = int((time.perf_counter() - context_started) * 1000)
    normalized_envelope = runtime_context.envelope
    resolved_scope = runtime_context.resolved_scope
    context_receipt = runtime_context.receipt
    scope_dump = resolved_scope.model_dump()

    emit_log(
        level="info",
        service="backend",
        action="assistant_runtime.context_resolved",
        message="Resolved assistant runtime context",
        context={"request_id": request_id, "resolved_scope": scope_dump, "context_receipt": context_receipt.model_dump()},
    )
    yield _sse("context", {"context_envelope": normalized_envelope.model_dump(), "resolved_scope": scope_dump})

    route_started = time.perf_counter()
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
    lane = legacy_code_to_lane(route.lane)
    routed_skill = route_skill(message=message, lane=lane, route=route, context=context_receipt)
    timings["route_selection_ms"] = int((time.perf_counter() - route_started) * 1000)

    yield _sse(
        "status",
        {
            "message": f"Processing {lane.value} with {routed_skill.selection.skill_id or 'no_skill'}",
            "lane": lane.value,
            "skill_id": routed_skill.selection.skill_id,
        },
    )

    degraded_reason: DegradedReason | None = None
    if context_receipt.resolution_status == ContextResolutionStatus.MISSING_CONTEXT and lane != Lane.A_FAST:
        degraded_reason = DegradedReason.MISSING_CONTEXT
    elif context_receipt.resolution_status == ContextResolutionStatus.AMBIGUOUS_CONTEXT:
        degraded_reason = DegradedReason.AMBIGUOUS_CONTEXT
    elif routed_skill.definition is None:
        degraded_reason = DegradedReason.NO_SKILL_MATCH

    retrieval_started = time.perf_counter()
    retrieval_execution = await execute_retrieval(
        route=route,
        retrieval_policy=routed_skill.definition.retrieval_policy if routed_skill.definition else "none",
        message=message,
        business_id=resolved_scope.business_id or (str(business_id) if business_id else None),
        env_id=resolved_scope.environment_id or (str(env_id) if env_id else None),
        entity_type=resolved_scope.entity_type or entity_type,
        entity_id=resolved_scope.entity_id or (str(entity_id) if entity_id else None),
    )
    timings["retrieval_ms"] = int((time.perf_counter() - retrieval_started) * 1000)
    if retrieval_execution.receipt.status == RetrievalStatus.EMPTY and routed_skill.definition is not None:
        degraded_reason = degraded_reason or DegradedReason.RETRIEVAL_EMPTY

    response_blocks: list[dict[str, Any]] = []
    if retrieval_execution.chunks:
        citation_block = citations_block(_citation_items(retrieval_execution.chunks))
        response_blocks.append(citation_block)
        yield _sse("response_block", {"block": citation_block})

    if degraded_reason is not None:
        blocks = degraded_blocks(degraded_reason)
        response_blocks = blocks + response_blocks
        turn_receipt = TurnReceipt(
            request_id=request_id,
            lane=lane,
            context=context_receipt,
            skill=routed_skill.selection,
            tools=[],
            retrieval=retrieval_execution.receipt,
            status=TurnStatus.DEGRADED,
            degraded_reason=degraded_reason,
        )
        message_text = degraded_message(degraded_reason)
        yield _sse("token", {"text": message_text})
        yield _sse(
            "done",
            {
                "session_id": session_id,
                "turn_receipt": turn_receipt.model_dump(mode="json"),
                "trace": _build_trace(
                    turn_receipt=turn_receipt,
                    model=route.model,
                    elapsed_ms=int((time.time() - started_at) * 1000),
                    resolved_scope=scope_dump,
                    response_blocks=response_blocks,
                    timings=timings,
                ),
                "response_blocks": response_blocks,
                "resolved_scope": scope_dump,
            },
        )
        return

    fast_response = _deterministic_fast_response(
        message=message,
        lane=lane,
        routed_skill=routed_skill,
        resolved_scope=resolved_scope,
        context_receipt=context_receipt,
        envelope=normalized_envelope,
        retrieval_execution=retrieval_execution,
    )
    if fast_response is not None:
        timings["first_token_ms"] = int((time.time() - started_at) * 1000)
        for block in fast_response.response_blocks:
            yield _sse("response_block", {"block": block})
        yield _sse("token", {"text": fast_response.text})
        turn_receipt = TurnReceipt(
            request_id=request_id,
            lane=lane,
            context=context_receipt,
            skill=routed_skill.selection,
            tools=[],
            retrieval=retrieval_execution.receipt,
            status=TurnStatus.SUCCESS,
            degraded_reason=None,
        )
        elapsed_ms = int((time.time() - started_at) * 1000)
        timings["render_completion_ms"] = elapsed_ms
        yield _sse(
            "done",
            {
                "session_id": session_id,
                "turn_receipt": turn_receipt.model_dump(mode="json"),
                "trace": _build_trace(
                    turn_receipt=turn_receipt,
                    model=route.model,
                    elapsed_ms=elapsed_ms,
                    resolved_scope=scope_dump,
                    response_blocks=fast_response.response_blocks,
                    timings=timings,
                ),
                "response_blocks": fast_response.response_blocks,
                "resolved_scope": scope_dump,
            },
        )
        return

    prepared_tools = prepare_tools(lane=lane, skill=routed_skill.selection)
    context_block = build_context_block(
        context_envelope=normalized_envelope,
        resolved_scope=resolved_scope,
        additional_instructions=visible_context_policy["instructions"],
    )
    history_msgs: list[dict[str, str]] = []
    if conversation_id:
        try:
            history = await asyncio.get_event_loop().run_in_executor(None, convo_svc.get_messages, conversation_id)
            for msg in [m for m in history if m["role"] in ("user", "assistant")][-6:]:
                history_msgs.append({"role": msg["role"], "content": msg["content"] or ""})
        except Exception:
            history_msgs = []

    effective_model = route.model
    caps = get_caps(effective_model)
    system_role = "developer" if (caps.supports_reasoning_effort and not caps.supports_temperature) else "system"
    messages, _prompt_audit = compose_runtime_messages(
        lane=route.lane,
        context_block=context_block,
        rag_context=retrieval_execution.context_text,
        history=history_msgs,
        user_message=message,
        skill=routed_skill.selection,
        system_role=system_role,
    )

    ctx = McpContext(
        actor=actor,
        token_valid=True,
        resolved_scope=scope_dump,
        context_envelope=normalized_envelope.model_dump(),
    )
    client = get_instrumented_client()
    collected_content = ""
    tool_receipts = []
    tool_execution_ms = 0

    for _round in range(AI_MAX_TOOL_ROUNDS + 1):
        stream_kwargs = sanitize_params(
            effective_model,
            messages=messages,
            max_tokens=route.max_tokens,
            temperature=route.temperature,
            reasoning_effort=route.reasoning_effort,
            tools=prepared_tools.openai_tools or None,
            stream=True,
        )
        try:
            stream = await client.chat.completions.create(**stream_kwargs)
        except Exception as exc:
            mapped = map_openai_error(exc, effective_model)
            yield _sse("error", {"message": mapped.user_message, "debug": mapped.debug_message})
            turn_receipt = TurnReceipt(
                request_id=request_id,
                lane=lane,
                context=context_receipt,
                skill=routed_skill.selection,
                tools=tool_receipts,
                retrieval=retrieval_execution.receipt,
                status=TurnStatus.FAILED,
                degraded_reason=DegradedReason.TOOL_FAILED,
            )
            yield _sse(
                "done",
                {
                    "session_id": session_id,
                    "turn_receipt": turn_receipt.model_dump(mode="json"),
                    "trace": _build_trace(
                        turn_receipt=turn_receipt,
                        model=effective_model,
                        elapsed_ms=int((time.time() - started_at) * 1000),
                        resolved_scope=scope_dump,
                        response_blocks=response_blocks,
                        timings=timings,
                    ),
                    "response_blocks": response_blocks,
                    "resolved_scope": scope_dump,
                },
            )
            return

        collected_tool_calls: dict[int, dict[str, Any]] = {}
        round_content = ""
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                if timings["first_token_ms"] is None:
                    timings["first_token_ms"] = int((time.time() - started_at) * 1000)
                round_content += delta.content
                collected_content += delta.content
                yield _sse("token", {"text": delta.content})
            if delta.tool_calls:
                for tool_call in delta.tool_calls:
                    idx = tool_call.index
                    if idx not in collected_tool_calls:
                        collected_tool_calls[idx] = {"id": tool_call.id or "", "name": "", "args": ""}
                    if tool_call.id:
                        collected_tool_calls[idx]["id"] = tool_call.id
                    if tool_call.function:
                        if tool_call.function.name:
                            collected_tool_calls[idx]["name"] = tool_call.function.name
                        if tool_call.function.arguments:
                            collected_tool_calls[idx]["args"] += tool_call.function.arguments

        if not collected_tool_calls:
            break

        messages.append(
            {
                "role": "assistant",
                "content": round_content or None,
                "tool_calls": [
                    {
                        "id": tool_call["id"],
                        "type": "function",
                        "function": {"name": tool_call["name"], "arguments": tool_call["args"]},
                    }
                    for tool_call in collected_tool_calls.values()
                ],
            }
        )
        tool_started = time.perf_counter()
        executed = await execute_tool_calls(
            collected_tool_calls=collected_tool_calls,
            prepared_tools=prepared_tools,
            ctx=ctx,
            resolved_scope=scope_dump,
        )
        tool_execution_ms += int((time.perf_counter() - tool_started) * 1000)
        for item in executed:
            tool_receipts.append(item.receipt)
            payload = dict(item.event_payload)
            payload["permission_mode"] = item.receipt.permission_mode
            yield _sse("tool_call", payload)
            yield _sse("tool_result", {"tool_name": item.receipt.tool_name, "result": item.receipt.output or {"error": item.receipt.error}})
            if isinstance(item.receipt.output, dict) and item.receipt.output.get("pending_confirmation"):
                confirm_block = confirmation_block(
                    action=item.receipt.output.get("action", item.receipt.tool_name),
                    summary=item.receipt.output.get("message", "Confirm to proceed."),
                    provided_params=item.receipt.output.get("provided") or item.receipt.input,
                    missing_fields=item.receipt.output.get("missing_fields") or item.receipt.output.get("required_fields") or [],
                )
                response_blocks.append(confirm_block)
                yield _sse("response_block", {"block": confirm_block})
            messages.append(item.tool_message)

    if collected_content.strip():
        response_blocks.insert(0, markdown_block(collected_content.strip()))

    final_status, final_reason = _status_from_tools([receipt.status for receipt in tool_receipts])
    turn_receipt = TurnReceipt(
        request_id=request_id,
        lane=lane,
        context=context_receipt,
        skill=routed_skill.selection,
        tools=tool_receipts,
        retrieval=retrieval_execution.receipt,
        status=final_status,
        degraded_reason=final_reason,
    )
    if final_status == TurnStatus.DEGRADED and not collected_content.strip():
        response_blocks = degraded_blocks(final_reason or DegradedReason.TOOL_FAILED) + response_blocks
        yield _sse("token", {"text": degraded_message(final_reason or DegradedReason.TOOL_FAILED)})

    elapsed_ms = int((time.time() - started_at) * 1000)
    timings["tool_execution_ms"] = tool_execution_ms
    timings["render_completion_ms"] = elapsed_ms
    trace = _build_trace(
        turn_receipt=turn_receipt,
        model=effective_model,
        elapsed_ms=elapsed_ms,
        resolved_scope=scope_dump,
        response_blocks=response_blocks,
        timings=timings,
    )
    yield _sse(
        "done",
        {
            "session_id": session_id,
            "turn_receipt": turn_receipt.model_dump(mode="json"),
            "trace": trace,
            "response_blocks": response_blocks,
            "resolved_scope": scope_dump,
        },
    )

    if conversation_id:
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: convo_svc.append_message(conversation_id=conversation_id, role="user", content=message),
            )
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: convo_svc.append_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=collected_content or degraded_message(final_reason) if final_reason else collected_content,
                    response_blocks=response_blocks,
                    message_meta={"turn_receipt": turn_receipt.model_dump(mode="json")},
                ),
            )
        except Exception:
            pass

    try:
        audit_svc.record_event(
            actor=actor,
            action="assistant_runtime.ask",
            tool_name="assistant_runtime",
            success=turn_receipt.status != TurnStatus.FAILED,
            latency_ms=elapsed_ms,
            business_id=uuid.UUID(resolved_scope.business_id) if resolved_scope.business_id else None,
            input_data={"message": message[:500], "request_id": request_id},
            output_data={"turn_receipt": turn_receipt.model_dump(mode="json")},
        )
    except Exception:
        pass
