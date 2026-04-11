from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, AsyncGenerator

from app.assistant_runtime.context_resolver import resolve_runtime_context
from app.assistant_runtime.dispatch_engine import dispatch_request
from app.assistant_runtime.degraded_responses import degraded_blocks_with_context, degraded_message
from app.assistant_runtime.suggestion_templates import build_suggested_actions
from app.assistant_runtime.execution_engine import execute_tool_calls, prepare_tools
from app.assistant_runtime.harness.audit_logger import HarnessAuditLogger
from app.assistant_runtime.harness.harness_types import HarnessConfig, LifecyclePhase
from app.assistant_runtime.harness.lifecycle import LifecycleManager
from app.assistant_runtime.harness.quality_gate import run_gates
from app.assistant_runtime.meridian_structured_runtime import try_run_meridian_structured_query
from app.assistant_runtime.prompt_registry import compose_runtime_messages
from app.assistant_runtime.result_memory import (
    build_asset_count_response_text,
    build_referential_response_text,
    extract_result_memory_from_prechecks,
    resolve_referential_followup,
)
from app.assistant_runtime.retrieval_orchestrator import RetrievalExecution, execute_retrieval
from app.assistant_runtime.skill_registry import skill_requires_grounding
from app.assistant_runtime.turn_receipts import (
    ContextResolutionStatus,
    DispatchAmbiguity,
    DispatchDecision,
    DispatchSource,
    DispatchTrace,
    DegradedReason,
    Lane,
    PendingActionReceipt,
    PendingActionStatus,
    RetrievalReceipt,
    RetrievalStatus,
    SkillSelection,
    StructuredPrecheckStatus,
    StructuredQueryReceipt,
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
from app.services.pending_action_manager import (
    _CONFIRM_RE,
    check_and_resolve as check_pending_action,
    create_pending_action,
    execute_confirmed_action,
)
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
    pending_action: dict[str, Any] | None = None


def _to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _format_currency(value: Any, *, signed: bool = False) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return "n/a"
    formatted = f"{abs(amount):,.2f}"
    if signed:
        if amount > 0:
            return f"+{formatted}"
        if amount < 0:
            return f"-{formatted}"
    return formatted


def _format_percent(value: Any) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return "n/a"
    if abs(amount) <= Decimal("1"):
        amount *= Decimal("100")
    return f"{amount:.1f}%"


def _structured_precheck_lookup(receipt: RetrievalReceipt, name: str) -> tuple[Any | None, Any | None]:
    debug = getattr(receipt, "debug", None)
    if debug is None:
        return None, None
    for precheck in getattr(debug, "structured_prechecks", []):
        if precheck.name == name:
            return precheck, debug
    return None, debug


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
    dispatch = turn_receipt.dispatch.normalized
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
    if turn_receipt.structured_query is not None:
        execution_path = turn_receipt.structured_query.execution_path
    if turn_receipt.status != TurnStatus.SUCCESS and turn_receipt.structured_query is None:
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
            "dispatch_source": dispatch.source,
            "dispatch_confidence": dispatch.confidence,
            "dispatch_fallback_used": dispatch.fallback_used,
            "dispatch_fallback_reason": dispatch.fallback_reason,
            "pending_action": turn_receipt.pending_action.model_dump(mode="json") if turn_receipt.pending_action else None,
            "retrieval_debug": turn_receipt.retrieval.debug.model_dump(mode="json") if turn_receipt.retrieval.debug else None,
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
    return FastResponse(
        text=text,
        response_blocks=[markdown_block(text), block],
        pending_action={
            "action_type": f"create_{entity_type}",
            "tool_name": f"repe.create_{entity_type}",
            "params_json": {"entity_type": entity_type, "name": name} if name else {"entity_type": entity_type},
            "missing_fields": [] if name else ["name"],
        },
    )


def _build_follow_up_structured_fast_response(
    *,
    resolved_scope: Any,
    envelope: AssistantContextEnvelope,
    retrieval_execution: RetrievalExecution,
) -> FastResponse | None:
    precheck, debug = _structured_precheck_lookup(retrieval_execution.receipt, "novendor_follow_up_today")
    if (
        precheck is None
        or debug is None
        or precheck.status != StructuredPrecheckStatus.OK
        or not debug.top_hits
    ):
        return None

    evidence = precheck.evidence or {}
    today_count = int(evidence.get("today_count") or 0)
    overdue_count = int(evidence.get("overdue_count") or 0)
    environment_name = envelope.ui.active_environment_name or resolved_scope.entity_name or "Novendor"
    lines = [
        f"{environment_name} follow up priorities for today are grounded in the structured task list.",
        f"- Tasks due today: {today_count}",
        f"- Overdue open tasks: {overdue_count}",
    ]
    for idx, hit in enumerate(debug.top_hits[:5], start=1):
        label = hit.get("label") or "Unnamed task"
        priority = hit.get("priority") or "normal"
        due = hit.get("due_date") or "unspecified"
        lines.append(f"{idx}. {label} (priority={priority}, due={due})")
    text = "\n".join(lines)
    return FastResponse(text=text, response_blocks=[markdown_block(text)])


def _build_asset_count_fast_response(
    *,
    resolved_scope: Any,
    envelope: AssistantContextEnvelope,
    retrieval_execution: RetrievalExecution,
) -> FastResponse | None:
    precheck, _debug = _structured_precheck_lookup(retrieval_execution.receipt, "asset_count")
    if precheck is None or precheck.status != StructuredPrecheckStatus.OK:
        return None

    summary = (precheck.evidence or {}).get("summary") or {}
    if not summary:
        return None

    scope_label = _format_scope_label(
        resolved_scope=resolved_scope,
        envelope=envelope,
    )
    text = build_asset_count_response_text(scope_label=scope_label, summary=summary)
    return FastResponse(text=text, response_blocks=[markdown_block(text)])


def _build_noi_variance_structured_fast_response(
    *,
    message: str,
    resolved_scope: Any,
    envelope: AssistantContextEnvelope,
    retrieval_execution: RetrievalExecution,
) -> FastResponse | None:
    precheck, debug = _structured_precheck_lookup(retrieval_execution.receipt, "meridian_noi_variance")
    if (
        precheck is None
        or debug is None
        or precheck.status != StructuredPrecheckStatus.OK
        or not debug.top_hits
    ):
        return None

    summary = (precheck.evidence or {}).get("summary") or {}
    total_actual = summary.get("total_actual")
    total_plan = summary.get("total_plan")
    total_variance = _to_decimal(summary.get("total_variance"))
    avg_variance_pct = summary.get("avg_variance_pct")
    scope_label = _format_scope_label(resolved_scope=resolved_scope, envelope=envelope)

    prompt = (message or "").lower()
    if "down vs underwriting" in prompt:
        direction = "not down vs underwriting" if (total_variance or Decimal("0")) >= 0 else "down vs underwriting"
        intro = f"At {scope_label}, NOI is {direction} in the current structured variance view."
    else:
        intro = f"NOI variance for {scope_label} is grounded in the current structured underwriting comparison."

    lines = [
        intro,
        f"- Total actual NOI: {_format_currency(total_actual)}",
        f"- Total underwriting plan: {_format_currency(total_plan)}",
        f"- Total variance: {_format_currency(total_variance, signed=True)}",
        f"- Average variance pct: {_format_percent(avg_variance_pct)}",
        "- Top visible drivers:",
    ]
    for hit in debug.top_hits[:5]:
        label = hit.get("label") or "Unknown asset"
        line_code = hit.get("line_code") or "line item"
        variance_amount = _format_currency(hit.get("variance_amount"), signed=True)
        variance_pct = _format_percent(hit.get("variance_pct"))
        lines.append(f"  {label} / {line_code}: {variance_amount} ({variance_pct})")

    text = "\n".join(lines)
    return FastResponse(text=text, response_blocks=[markdown_block(text)])


def _pending_action_receipt(
    pending_row: dict[str, Any] | None,
    *,
    fallback_action_type: str | None = None,
    fallback_scope_label: str | None = None,
    status: PendingActionStatus = PendingActionStatus.AWAITING_CONFIRMATION,
) -> PendingActionReceipt | None:
    if not pending_row and not fallback_action_type:
        return None
    pending_action_id = str((pending_row or {}).get("pending_action_id") or f"pending_{uuid.uuid4()}")
    action_type = str((pending_row or {}).get("action_type") or fallback_action_type or "pending_action")
    scope_label = (pending_row or {}).get("scope_label") or fallback_scope_label
    return PendingActionReceipt(
        pending_action_id=pending_action_id,
        status=status,
        action_type=action_type,
        scope_label=scope_label,
        confirmation_required=True,
    )


async def _persist_conversation_turn(
    *,
    conversation_id: uuid.UUID | None,
    message: str,
    assistant_content: str,
    response_blocks: list[dict[str, Any]],
    turn_receipt: TurnReceipt,
    resolved_scope: Any,
    request_id: str,
    envelope: AssistantContextEnvelope | None = None,
    result_memory: dict[str, Any] | None = None,
    structured_query_state: dict[str, Any] | None = None,
) -> None:
    if not conversation_id:
        return
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
                content=assistant_content,
                response_blocks=response_blocks,
                message_meta={"turn_receipt": turn_receipt.model_dump(mode="json")},
            ),
        )
    except Exception:
        pass

    result_memory_to_store = _normalize_result_memory_scope(
        result_memory=result_memory,
        resolved_scope=resolved_scope,
        envelope=envelope,
    )
    if result_memory_to_store is not None:
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: convo_svc.update_thread_result_memory(
                    conversation_id,
                    result_memory=result_memory_to_store,
                ),
            )
        except Exception:
            pass

    if structured_query_state is not None:
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: convo_svc.update_thread_structured_query_state(
                    conversation_id,
                    structured_query_state=structured_query_state,
                ),
            )
        except Exception:
            pass

    if (
        turn_receipt.status != TurnStatus.FAILED
        and resolved_scope.entity_id
    ):
        try:
            from app.assistant_runtime.metric_normalizer import extract_metric, extract_timeframe

            _metric = extract_metric(message)
            _timeframe = extract_timeframe(message)
            _skill_id = turn_receipt.skill.skill_id if turn_receipt.skill else None
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: convo_svc.update_thread_entity_state(
                    conversation_id,
                    entity_type=resolved_scope.entity_type or "unknown",
                    entity_id=resolved_scope.entity_id,
                    name=resolved_scope.entity_name,
                    source="resolved_scope",
                    turn_request_id=request_id,
                    active_metric=_metric,
                    active_timeframe=_timeframe,
                    last_skill_id=_skill_id,
                ),
            )
        except Exception:
            pass


def _normalize_result_memory_scope(
    *,
    result_memory: dict[str, Any] | None,
    resolved_scope: Any,
    envelope: AssistantContextEnvelope | None,
) -> dict[str, Any] | None:
    if not result_memory:
        return None
    normalized = dict(result_memory)
    scope = dict(normalized.get("scope") or {})
    scope.setdefault("business_id", resolved_scope.business_id)
    scope.setdefault("environment_id", resolved_scope.environment_id)
    scope.setdefault("entity_type", resolved_scope.entity_type)
    scope.setdefault("entity_id", resolved_scope.entity_id)
    if not scope.get("entity_name"):
        if (
            scope.get("entity_type") == resolved_scope.entity_type
            and scope.get("entity_id") == resolved_scope.entity_id
        ):
            scope["entity_name"] = resolved_scope.entity_name
        elif scope.get("entity_type") == "environment":
            scope["entity_name"] = (
                (envelope.ui.active_environment_name if envelope else None)
                or resolved_scope.entity_name
            )
    normalized["scope"] = scope
    return normalized


async def _try_meridian_structured_gate(
    *,
    message: str,
    resolved_scope: Any,
    context_receipt: Any,
    envelope: AssistantContextEnvelope,
    thread_entity_state: dict[str, Any] | None,
    request_id: str,
    session_id: str | None,
    conversation_id: uuid.UUID | None,
    actor: str,
    started_at: float,
    scope_dump: dict[str, Any],
    timings: dict[str, int | None],
) -> AsyncGenerator[str, None] | None:
    """Meridian structured gate: parse → execute → emit SSE, bypassing LLM.

    Returns an async generator of SSE chunks if the gate fires, or None
    to let the normal lifecycle continue.
    """
    if context_receipt.resolution_status != ContextResolutionStatus.RESOLVED:
        return None
    if not resolved_scope.business_id:
        return None

    from app.assistant_runtime.meridian_structured_parser import (
        is_meridian_structured_query,
        parse_meridian_contract,
    )

    env_name = envelope.ui.active_environment_name or ""
    if not is_meridian_structured_query(message, env_name=env_name):
        return None

    contract = parse_meridian_contract(message, prior_state=thread_entity_state)
    if contract is None or contract.needs_clarification:
        return None

    from app.assistant_runtime.meridian_structured_executor import (
        execute_meridian_contract,
        set_executor_message_context,
    )

    business_id = str(resolved_scope.business_id)
    env_id = str(resolved_scope.environment_id or "")

    # Phase 4 follow-up: hand the raw message to the executor so
    # _execute_fund_metric_snapshot can resolve a fund name that the
    # parser did not populate into contract.entity_name.
    set_executor_message_context(message)

    result = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: execute_meridian_contract(
            contract,
            business_id=business_id,
            env_id=env_id,
            thread_state=thread_entity_state,
        ),
    )
    if result is None:
        return None

    emit_log(
        level="info",
        service="backend",
        action="assistant_runtime.meridian_structured_gate",
        message="Meridian structured gate fired — bypassing LLM dispatch",
        context={
            "request_id": request_id,
            "use_case": (result.structured_receipt or {}).get("execution_path"),
            "degraded": result.degraded,
            "row_count": len(result.rows),
        },
    )

    async def _emit() -> AsyncGenerator[str, None]:
        response_text = result.answer_text
        response_blocks = [markdown_block(response_text)]

        if result.structured_receipt:
            yield _sse("response_block", {"block": {
                "type": "structured_query_receipt",
                "data": result.structured_receipt,
            }})

        for block in response_blocks:
            yield _sse("response_block", {"block": block})
        yield _sse("token", {"text": response_text})

        receipt_data = result.structured_receipt or {}
        sq_receipt = StructuredQueryReceipt(
            parsed_contract=receipt_data.get("parsed_contract", {}),
            execution_path=receipt_data.get("execution_path", "unknown"),
            transformation_applied=contract.transformation,
            operators_applied={
                k: v for k, v in {
                    "sort_direction": contract.sort_direction,
                    "limit": contract.limit,
                    "group_by": contract.group_by,
                    "filter_count": len(contract.filters) if contract.filters else 0,
                }.items() if v
            },
            memory_used=receipt_data.get("memory_used", False),
            degraded=result.degraded,
            canonical_source=result.canonical_source or None,
            degradation_reason=result.degraded_reason,
        )

        turn_receipt = TurnReceipt(
            request_id=request_id,
            lane=Lane.A_FAST,
            dispatch=DispatchTrace(
                raw=None,
                normalized=DispatchDecision(
                    source=DispatchSource.DETERMINISTIC_GUARDRAIL,
                    skill_id="meridian_structured",
                    lane=Lane.A_FAST,
                    needs_retrieval=False,
                    write_intent=False,
                    ambiguity_level=DispatchAmbiguity.LOW,
                    confidence=1.0,
                    fallback_used=False,
                    notes=["meridian_structured_gate"],
                ),
            ),
            fallback_reason=None,
            context=context_receipt,
            skill=SkillSelection(
                skill_id="meridian_structured",
                confidence=1.0,
                triggers_matched=["meridian_structured_parser"],
            ),
            tools=[],
            retrieval=RetrievalReceipt(used=False, result_count=0, status=RetrievalStatus.OK),
            pending_action=None,
            structured_query=sq_receipt,
            status=TurnStatus.SUCCESS,
            degraded_reason=DegradedReason.NO_RESPONSE if result.degraded else None,
        )

        elapsed_ms = int((time.time() - started_at) * 1000)
        timings["render_completion_ms"] = elapsed_ms
        await _persist_conversation_turn(
            conversation_id=conversation_id,
            message=message,
            assistant_content=response_text,
            response_blocks=response_blocks,
            turn_receipt=turn_receipt,
            resolved_scope=resolved_scope,
            request_id=request_id,
            envelope=envelope,
            result_memory=result.result_memory,
        )
        yield _sse(
            "done",
            {
                "session_id": session_id,
                "turn_receipt": turn_receipt.model_dump(mode="json"),
                "trace": _build_trace(
                    turn_receipt=turn_receipt,
                    model="none",
                    elapsed_ms=elapsed_ms,
                    resolved_scope=scope_dump,
                    response_blocks=response_blocks,
                    timings=timings,
                ),
                "response_blocks": response_blocks,
                "resolved_scope": scope_dump,
                "structured_query": result.structured_receipt,
            },
        )

    return _emit()


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

    structured_asset_count = _build_asset_count_fast_response(
        resolved_scope=resolved_scope,
        envelope=envelope,
        retrieval_execution=retrieval_execution,
    )
    if structured_asset_count is not None:
        return structured_asset_count

    structured_follow_up = _build_follow_up_structured_fast_response(
        resolved_scope=resolved_scope,
        envelope=envelope,
        retrieval_execution=retrieval_execution,
    )
    if structured_follow_up is not None:
        return structured_follow_up

    structured_noi = _build_noi_variance_structured_fast_response(
        message=normalized_message,
        resolved_scope=resolved_scope,
        envelope=envelope,
        retrieval_execution=retrieval_execution,
    )
    if structured_noi is not None:
        return structured_noi

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
    pending_continuation: bool = False,
    pending_question_text: str | None = None,
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

    # Initialize harness layer (read-only instrumentation)
    harness_config = HarnessConfig()
    lifecycle = LifecycleManager(config=harness_config)
    harness_logger = HarnessAuditLogger(
        request_id=request_id,
        conversation_id=str(conversation_id) if conversation_id else None,
        env_id=str(env_id) if env_id else None,
    )
    lifecycle.checkpoint(LifecyclePhase.SESSION_START, context_summary={"actor": actor})

    if not OPENAI_API_KEY:
        yield _sse("error", {"message": "OPENAI_API_KEY not configured"})
        return

    # Load thread entity state for conversation context carry-forward
    thread_entity_state: dict[str, Any] | None = None
    if conversation_id:
        try:
            thread_entity_state = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: convo_svc.get_thread_entity_state(str(conversation_id)),
            )
        except Exception:
            thread_entity_state = None

    context_started = time.perf_counter()
    runtime_context = resolve_runtime_context(
        context_envelope=context_envelope,
        env_id=str(env_id) if env_id else None,
        business_id=str(business_id) if business_id else None,
        conversation_id=str(conversation_id) if conversation_id else None,
        actor=actor,
        message=message,
        thread_entity_state=thread_entity_state,
    )
    timings["context_resolution_ms"] = int((time.perf_counter() - context_started) * 1000)
    lifecycle.checkpoint(LifecyclePhase.PRE_DISPATCH, context_summary={
        "resolution_status": runtime_context.receipt.resolution_status,
        "entity_id": runtime_context.resolved_scope.entity_id,
        "inherited": runtime_context.receipt.inherited_entity_id is not None,
    })
    # Log context carry-forward if entity was inherited from thread state
    if runtime_context.receipt.inherited_entity_id:
        harness_logger.log_context_carry_forward(
            inherited_entity_id=runtime_context.receipt.inherited_entity_id,
            inherited_entity_source=runtime_context.receipt.inherited_entity_source,
            entity_name=runtime_context.resolved_scope.entity_name,
        )
    normalized_envelope = runtime_context.envelope
    resolved_scope = runtime_context.resolved_scope
    context_receipt = runtime_context.receipt
    scope_dump = resolved_scope.model_dump()
    pending_action_state: PendingActionReceipt | None = None

    pending_resolution: dict[str, Any] | None = None
    if conversation_id:
        try:
            pending_resolution = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: check_pending_action(str(conversation_id), message),
            )
        except Exception:
            pending_resolution = None

    emit_log(
        level="info",
        service="backend",
        action="assistant_runtime.context_resolved",
        message="Resolved assistant runtime context",
        context={"request_id": request_id, "resolved_scope": scope_dump, "context_receipt": context_receipt.model_dump()},
    )
    yield _sse("context", {"context_envelope": normalized_envelope.model_dump(), "resolved_scope": scope_dump})

    if pending_resolution and pending_resolution.get("intent") in {"cancel", "confirm"}:
        intent = str(pending_resolution.get("intent"))
        pending_row = pending_resolution.get("pending_action") or {}
        pa_id = str(pending_row.get("pending_action_id", ""))
        action_type = pending_row.get("action_type", "action")

        if intent == "cancel":
            # ── Cancel: acknowledge and return ─────────────────────────
            pending_status = PendingActionStatus.CANCELLED
            message_text = f"Cancelled the pending {action_type}."
            response_blocks = [markdown_block(message_text)]
            pending_action_result = None
        else:
            # ── Confirm: execute the stored tool ───────────────────────
            execution = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: execute_confirmed_action(
                    pa_id,
                    resolved_scope=scope_dump,
                    actor=actor,
                ),
            )
            exec_success = execution.get("success", False)
            exec_tool = execution.get("tool_name", action_type)

            if exec_success:
                pending_status = PendingActionStatus.EXECUTED
                exec_result = execution.get("result", {})
                # Build a meaningful message from tool result
                if isinstance(exec_result, dict) and exec_result.get("message"):
                    message_text = str(exec_result["message"])
                else:
                    message_text = f"Done — {action_type} completed successfully."
                response_blocks = [markdown_block(message_text)]
            else:
                pending_status = PendingActionStatus.FAILED
                error_msg = execution.get("error", "Unknown error")
                message_text = f"The {action_type} failed: {error_msg}"
                response_blocks = [markdown_block(message_text)]

            pending_action_result = {
                "pending_action_id": pa_id,
                "status": pending_status.value,
                "action_type": action_type,
                "tool_name": exec_tool,
                "success": exec_success,
                "error": execution.get("error") if not exec_success else None,
            }

        pending_action_state = _pending_action_receipt(
            pending_row,
            fallback_scope_label=_format_scope_label(resolved_scope=resolved_scope, envelope=normalized_envelope),
            status=pending_status,
        )
        turn_receipt = TurnReceipt(
            request_id=request_id,
            lane=Lane.A_FAST,
            dispatch=DispatchTrace(
                raw=None,
                normalized=DispatchDecision(
                    source=DispatchSource.DETERMINISTIC_GUARDRAIL,
                    skill_id="create_entity",
                    lane=Lane.A_FAST,
                    needs_retrieval=False,
                    write_intent=intent == "confirm",
                    ambiguity_level=DispatchAmbiguity.LOW,
                    confidence=1.0,
                    fallback_used=False,
                    notes=[f"pending_action_{intent}"],
                ),
            ),
            fallback_reason=None,
            context=context_receipt,
            skill=SkillSelection(
                skill_id="create_entity",
                confidence=1.0,
                triggers_matched=[intent],
            ),
            tools=[],
            retrieval=RetrievalReceipt(used=False, result_count=0, status=RetrievalStatus.OK),
            pending_action=pending_action_state,
            status=TurnStatus.SUCCESS if pending_status != PendingActionStatus.FAILED else TurnStatus.DEGRADED,
            degraded_reason=DegradedReason.TOOL_FAILED if pending_status == PendingActionStatus.FAILED else None,
        )
        timings["render_completion_ms"] = int((time.time() - started_at) * 1000)
        yield _sse("token", {"text": message_text})
        done_payload: dict[str, Any] = {
            "session_id": session_id,
            "turn_receipt": turn_receipt.model_dump(mode="json"),
            "trace": _build_trace(
                turn_receipt=turn_receipt,
                model="none",
                elapsed_ms=timings["render_completion_ms"] or 0,
                resolved_scope=scope_dump,
                response_blocks=response_blocks,
                timings=timings,
            ),
            "response_blocks": response_blocks,
            "resolved_scope": scope_dump,
        }
        if intent == "confirm" and pending_action_result:
            done_payload["pending_action_result"] = pending_action_result
        yield _sse("done", done_payload)
        await _persist_conversation_turn(
            conversation_id=conversation_id,
            message=message,
            assistant_content=message_text,
            response_blocks=response_blocks,
            turn_receipt=turn_receipt,
            resolved_scope=resolved_scope,
            request_id=request_id,
            envelope=normalized_envelope,
        )
        return

    current_memory_scope = {
        "business_id": resolved_scope.business_id or (str(business_id) if business_id else None),
        "environment_id": resolved_scope.environment_id or (str(env_id) if env_id else None),
        "entity_type": resolved_scope.entity_type,
        "entity_id": resolved_scope.entity_id,
        "entity_name": resolved_scope.entity_name,
    }
    referential_resolution = resolve_referential_followup(
        message=message,
        result_memory=(thread_entity_state or {}).get("result_memory"),
        current_scope=current_memory_scope,
    )
    if referential_resolution.is_referential:
        current_scope_label = _format_scope_label(resolved_scope=resolved_scope, envelope=normalized_envelope)
        emit_log(
            level="info",
            service="backend",
            action=f"assistant_runtime.referential_followup_{referential_resolution.status}",
            message="Processed referential follow-up request",
            context={
                "request_id": request_id,
                "conversation_id": str(conversation_id) if conversation_id else None,
                "business_id": current_memory_scope["business_id"],
                "environment_id": current_memory_scope["environment_id"],
                "current_scope": current_memory_scope,
                "stored_scope": ((thread_entity_state or {}).get("result_memory") or {}).get("scope"),
                "result_type": ((thread_entity_state or {}).get("result_memory") or {}).get("result_type"),
                "matched_pattern": referential_resolution.matched_pattern,
                "bucket_name": referential_resolution.bucket_name,
                "requested_count": referential_resolution.requested_count,
                "resolved_count": referential_resolution.resolved_count,
                "resolution_source": referential_resolution.resolution_source,
            },
        )
        response_text = build_referential_response_text(
            resolution=referential_resolution,
            result_memory=(thread_entity_state or {}).get("result_memory"),
            current_scope_label=current_scope_label,
        )
        response_blocks = [markdown_block(response_text)]
        turn_receipt = TurnReceipt(
            request_id=request_id,
            lane=Lane.A_FAST,
            dispatch=DispatchTrace(
                raw=None,
                normalized=DispatchDecision(
                    source=DispatchSource.DETERMINISTIC_GUARDRAIL,
                    skill_id="lookup_entity",
                    lane=Lane.A_FAST,
                    needs_retrieval=False,
                    write_intent=False,
                    ambiguity_level=DispatchAmbiguity.LOW,
                    confidence=1.0,
                    fallback_used=False,
                    notes=["deterministic_referential_followup"],
                ),
            ),
            fallback_reason=None,
            context=context_receipt,
            skill=SkillSelection(
                skill_id="lookup_entity",
                confidence=1.0,
                triggers_matched=["referential_followup"],
            ),
            tools=[],
            retrieval=RetrievalReceipt(used=False, result_count=0, status=RetrievalStatus.OK),
            pending_action=None,
            status=TurnStatus.SUCCESS,
            degraded_reason=None,
        )
        timings["render_completion_ms"] = int((time.time() - started_at) * 1000)
        yield _sse("token", {"text": response_text})
        await _persist_conversation_turn(
            conversation_id=conversation_id,
            message=message,
            assistant_content=response_text,
            response_blocks=response_blocks,
            turn_receipt=turn_receipt,
            resolved_scope=resolved_scope,
            request_id=request_id,
            envelope=normalized_envelope,
        )
        yield _sse(
            "done",
            {
                "session_id": session_id,
                "turn_receipt": turn_receipt.model_dump(mode="json"),
                "trace": _build_trace(
                    turn_receipt=turn_receipt,
                    model="none",
                    elapsed_ms=timings["render_completion_ms"] or 0,
                    resolved_scope=scope_dump,
                    response_blocks=response_blocks,
                    timings=timings,
                ),
                "response_blocks": response_blocks,
                "resolved_scope": scope_dump,
            },
        )
        return

    meridian_structured = try_run_meridian_structured_query(
        message=message,
        resolved_scope=resolved_scope,
        envelope=normalized_envelope,
        thread_entity_state=thread_entity_state,
    )
    if meridian_structured is not None:
        response_text = meridian_structured.text
        response_blocks = [markdown_block(response_text)]
        turn_status = TurnStatus.DEGRADED if meridian_structured.receipt.degraded else TurnStatus.SUCCESS
        turn_receipt = TurnReceipt(
            request_id=request_id,
            lane=Lane.A_FAST,
            dispatch=DispatchTrace(
                raw=None,
                normalized=DispatchDecision(
                    source=DispatchSource.DETERMINISTIC_GUARDRAIL,
                    skill_id="structured_portfolio_operator",
                    lane=Lane.A_FAST,
                    needs_retrieval=False,
                    write_intent=False,
                    ambiguity_level=DispatchAmbiguity.LOW,
                    confidence=1.0,
                    fallback_used=False,
                    notes=["meridian_structured_runtime"],
                ),
            ),
            fallback_reason=None,
            context=context_receipt,
            skill=SkillSelection(
                skill_id="structured_portfolio_operator",
                confidence=1.0,
                triggers_matched=["meridian_structured_query"],
            ),
            tools=[],
            retrieval=RetrievalReceipt(used=False, result_count=0, status=RetrievalStatus.OK),
            pending_action=None,
            structured_query=meridian_structured.receipt,
            status=turn_status,
            degraded_reason=DegradedReason.STRUCTURED_DEGRADED if meridian_structured.receipt.degraded else None,
        )
        timings["render_completion_ms"] = int((time.time() - started_at) * 1000)
        yield _sse("response_block", {"block": response_blocks[0]})
        yield _sse("token", {"text": response_text})
        await _persist_conversation_turn(
            conversation_id=conversation_id,
            message=message,
            assistant_content=response_text,
            response_blocks=response_blocks,
            turn_receipt=turn_receipt,
            resolved_scope=resolved_scope,
            request_id=request_id,
            envelope=normalized_envelope,
            result_memory=meridian_structured.result_memory,
            structured_query_state=meridian_structured.structured_query_state,
        )
        yield _sse(
            "done",
            {
                "session_id": session_id,
                "turn_receipt": turn_receipt.model_dump(mode="json"),
                "trace": _build_trace(
                    turn_receipt=turn_receipt,
                    model="none",
                    elapsed_ms=timings["render_completion_ms"] or 0,
                    resolved_scope=scope_dump,
                    response_blocks=response_blocks,
                    timings=timings,
                ),
                "response_blocks": response_blocks,
                "resolved_scope": scope_dump,
            },
        )
        return

    # ── Meridian structured gate ────────────────────────────────────────────
    # Deterministic short-circuit: if the message parses into a structured
    # REPE contract AND the current environment is a Meridian demo portal,
    # execute deterministically — no LLM dispatch, no retrieval.
    _meridian_gate_result = await _try_meridian_structured_gate(
        message=message,
        resolved_scope=resolved_scope,
        context_receipt=context_receipt,
        envelope=normalized_envelope,
        thread_entity_state=thread_entity_state,
        request_id=request_id,
        session_id=session_id,
        conversation_id=conversation_id,
        actor=actor,
        started_at=started_at,
        scope_dump=scope_dump,
        timings=timings,
    )
    if _meridian_gate_result is not None:
        async for chunk in _meridian_gate_result:
            yield chunk
        return

    route_started = time.perf_counter()
    visible_context_policy = resolve_visible_context_policy(
        context_envelope=normalized_envelope,
        user_message=message,
    )

    # ── Pending-continuation guardrail ───────────────────────────────────────
    # When the frontend signals that the user is answering a clarifying question
    # Winston just asked a clarifying question. Short replies like "yes", "2026Q1",
    # "NOI", or "10" should resume the prior intent rather than being reclassified.
    # Check confirmation patterns first, then use the continuation detector for
    # value-type slot fills (quarters, metrics, numbers, short phrases).
    _continuation_dispatch: object | None = None
    _is_continuation_reply = False
    if pending_continuation:
        if _CONFIRM_RE.match(message.strip()):
            _is_continuation_reply = True
        else:
            try:
                from app.assistant_runtime.continuation_detector import is_continuation
                # Use conversation_id as thread_id for pending_query lookup
                _thread_key = str(conversation_id) if conversation_id else ""
                _is_continuation_reply = is_continuation(message, _thread_key)
            except Exception:
                # Fall back to simple heuristic: short messages when continuation is flagged
                _is_continuation_reply = len(message.strip().split()) <= 3
    if _is_continuation_reply:
        from app.assistant_runtime.dispatch_engine import DispatchOutcome, build_routed_skill
        from app.services.request_router import RouteDecision

        _cont_decision = DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="run_analysis",
            lane=Lane.C_ANALYSIS,
            needs_retrieval=False,
            write_intent=False,
            ambiguity_level=DispatchAmbiguity.LOW,
            confidence=0.97,
            fallback_used=False,
            notes=["pending_continuation_guardrail"],
        )
        _cont_trace = DispatchTrace(raw=None, normalized=_cont_decision)
        _cont_route = RouteDecision(
            lane="C",
            skip_rag=True,
            skip_tools=False,
            max_tool_rounds=3,
            max_tokens=1024,
            temperature=0.2,
            is_write=False,
            history_max_tokens=2500,
        )
        _cont_skill = build_routed_skill(
            message=message,
            skill_id="run_analysis",
            confidence=0.97,
        )
        _continuation_dispatch = DispatchOutcome(
            trace=_cont_trace,
            route=_cont_route,
            routed_skill=_cont_skill,
        )
        emit_log(
            level="info",
            service="backend",
            action="assistant_runtime.pending_continuation_override",
            message="Routing continuation reply directly to Lane C — skipping LLM dispatch",
            context={"prior_question": (pending_question_text or "")[:200]},
        )

    if _continuation_dispatch is not None:
        dispatch = _continuation_dispatch
    else:
        dispatch = await dispatch_request(
            message=message,
            context_envelope=normalized_envelope,
            resolved_scope=resolved_scope,
            context=context_receipt,
            visible_context_shortcut=visible_context_policy["disable_tools"],
        )
    route = dispatch.route
    lane = legacy_code_to_lane(route.lane)
    routed_skill = dispatch.routed_skill
    timings["route_selection_ms"] = int((time.perf_counter() - route_started) * 1000)
    lifecycle.checkpoint(LifecyclePhase.POST_DISPATCH, context_summary={
        "skill": routed_skill.selection.skill_id,
        "lane": lane.value if lane else None,
        "confidence": dispatch.trace.normalized.confidence,
    })

    # Run quality gates after dispatch (log-only, does not alter control flow)
    post_dispatch_gates = run_gates(
        context=context_receipt,
        dispatch=dispatch.trace.normalized,
        thread_entity_state=thread_entity_state,
    )
    for gate_result in post_dispatch_gates:
        if not gate_result.passed:
            harness_logger.log_gate_result(
                gate_result.gate_name,
                passed=gate_result.passed,
                message=gate_result.message,
                severity=gate_result.severity.value,
            )

    emit_log(
        level="info",
        service="backend",
        action="assistant_runtime.dispatch_selected",
        message="Selected Winston dispatch path",
        context={
            "request_id": request_id,
            "dispatch_raw": dispatch.trace.raw.model_dump(mode="json") if dispatch.trace.raw else None,
            "dispatch_normalized": dispatch.trace.normalized.model_dump(mode="json"),
        },
    )

    yield _sse(
        "status",
        {
            "message": f"Processing {lane.value} with {routed_skill.selection.skill_id or 'no_skill'}",
            "lane": lane.value,
            "skill_id": routed_skill.selection.skill_id,
            "dispatch_source": dispatch.trace.normalized.source,
        },
    )
    yield _sse("progress", {"stage": "resolving_context", "message": "One moment, resolving context..."})

    degraded_reason: DegradedReason | None = None
    if context_receipt.resolution_status == ContextResolutionStatus.MISSING_CONTEXT and lane != Lane.A_FAST:
        degraded_reason = DegradedReason.MISSING_CONTEXT
    elif context_receipt.resolution_status == ContextResolutionStatus.AMBIGUOUS_CONTEXT:
        degraded_reason = DegradedReason.AMBIGUOUS_CONTEXT
    elif routed_skill.definition is None:
        degraded_reason = DegradedReason.NO_SKILL_MATCH

    if degraded_reason in {
        DegradedReason.MISSING_CONTEXT,
        DegradedReason.AMBIGUOUS_CONTEXT,
        DegradedReason.NO_SKILL_MATCH,
    }:
        retrieval_execution = RetrievalExecution(
            chunks=[],
            context_text="",
            receipt=RetrievalReceipt(used=False, result_count=0, status=RetrievalStatus.OK),
        )
        timings["retrieval_ms"] = 0
    else:
        yield _sse("progress", {"stage": "retrieving_data", "message": "Reviewing financial records..."})
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
        if (
            retrieval_execution.receipt.status == RetrievalStatus.EMPTY
            and skill_requires_grounding(routed_skill.selection.skill_id, message=message)
        ):
            # Before degrading, check if visible_data or structured prechecks
            # can serve as a fallback source.
            visible = normalized_envelope.ui.visible_data if normalized_envelope.ui.visible_data else None
            has_visible_context = visible is not None and any([
                visible.funds, visible.assets, visible.investments,
                visible.metrics, visible.pipeline_items, visible.models,
            ])
            # Structured prechecks (fund summary, NOI variance, etc.) inject
            # context_text directly — if present, the LLM has enough to answer.
            has_structured_context = bool(retrieval_execution.context_text and retrieval_execution.context_text.strip())
            if has_visible_context or has_structured_context:
                # Skip degradation — the LLM has enough data from visible context
                # or structured prechecks to produce a useful answer.
                pass
            else:
                degraded_reason = degraded_reason or DegradedReason.RETRIEVAL_EMPTY

    response_blocks: list[dict[str, Any]] = []
    turn_result_memory = extract_result_memory_from_prechecks(
        (retrieval_execution.receipt.debug.structured_prechecks if retrieval_execution.receipt.debug else [])
    )
    if retrieval_execution.chunks:
        citation_block = citations_block(_citation_items(retrieval_execution.chunks))
        response_blocks.append(citation_block)
        yield _sse("response_block", {"block": citation_block})

    if degraded_reason is not None:
        context_blocks, message_text = degraded_blocks_with_context(
            degraded_reason,
            entity_type=resolved_scope.entity_type,
            entity_id=resolved_scope.entity_id,
            entity_name=resolved_scope.entity_name,
            env_id=resolved_scope.environment_id,
            skill_id=routed_skill.selection.skill_id,
        )
        response_blocks = context_blocks + response_blocks
        turn_receipt = TurnReceipt(
            request_id=request_id,
            lane=lane,
            dispatch=dispatch.trace,
            fallback_reason=dispatch.trace.normalized.fallback_reason,
            context=context_receipt,
            skill=routed_skill.selection,
            tools=[],
            retrieval=retrieval_execution.receipt,
            pending_action=pending_action_state,
            status=TurnStatus.DEGRADED,
            degraded_reason=degraded_reason,
        )
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
        await _persist_conversation_turn(
            conversation_id=conversation_id,
            message=message,
            assistant_content=message_text,
            response_blocks=response_blocks,
            turn_receipt=turn_receipt,
            resolved_scope=resolved_scope,
            request_id=request_id,
            envelope=normalized_envelope,
            result_memory=turn_result_memory,
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
        if (
            fast_response.pending_action
            and conversation_id
            and resolved_scope.business_id
        ):
            try:
                pending_row = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: create_pending_action(
                        conversation_id=str(conversation_id),
                        business_id=str(resolved_scope.business_id),
                        env_id=str(resolved_scope.environment_id) if resolved_scope.environment_id else None,
                        actor=actor,
                        skill_id=routed_skill.selection.skill_id,
                        action_type=str(fast_response.pending_action.get("action_type") or "pending_action"),
                        tool_name=fast_response.pending_action.get("tool_name"),
                        params_json=fast_response.pending_action.get("params_json") or {},
                        missing_fields=fast_response.pending_action.get("missing_fields") or [],
                        scope_type=resolved_scope.entity_type,
                        scope_id=resolved_scope.entity_id,
                        scope_label=_format_scope_label(resolved_scope=resolved_scope, envelope=normalized_envelope),
                    ),
                )
                pending_action_state = _pending_action_receipt(
                    pending_row,
                    fallback_action_type=str(fast_response.pending_action.get("action_type") or "pending_action"),
                    fallback_scope_label=_format_scope_label(resolved_scope=resolved_scope, envelope=normalized_envelope),
                    status=PendingActionStatus.AWAITING_CONFIRMATION,
                )
            except Exception:
                pending_action_state = _pending_action_receipt(
                    None,
                    fallback_action_type=str(fast_response.pending_action.get("action_type") or "pending_action"),
                    fallback_scope_label=_format_scope_label(resolved_scope=resolved_scope, envelope=normalized_envelope),
                    status=PendingActionStatus.AWAITING_CONFIRMATION,
                )
        timings["first_token_ms"] = int((time.time() - started_at) * 1000)
        for block in fast_response.response_blocks:
            yield _sse("response_block", {"block": block})
        yield _sse("token", {"text": fast_response.text})
        turn_receipt = TurnReceipt(
            request_id=request_id,
            lane=lane,
            dispatch=dispatch.trace,
            fallback_reason=dispatch.trace.normalized.fallback_reason,
            context=context_receipt,
            skill=routed_skill.selection,
            tools=[],
            retrieval=retrieval_execution.receipt,
            pending_action=pending_action_state,
            status=TurnStatus.SUCCESS,
            degraded_reason=None,
        )
        elapsed_ms = int((time.time() - started_at) * 1000)
        timings["render_completion_ms"] = elapsed_ms
        await _persist_conversation_turn(
            conversation_id=conversation_id,
            message=message,
            assistant_content=fast_response.text,
            response_blocks=fast_response.response_blocks,
            turn_receipt=turn_receipt,
            resolved_scope=resolved_scope,
            request_id=request_id,
            envelope=normalized_envelope,
            result_memory=turn_result_memory,
        )
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
    yield _sse("progress", {"stage": "computing", "message": "I'll pull that up for you..."})

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
                dispatch=dispatch.trace,
                fallback_reason=dispatch.trace.normalized.fallback_reason,
                context=context_receipt,
                skill=routed_skill.selection,
                tools=tool_receipts,
                retrieval=retrieval_execution.receipt,
                pending_action=pending_action_state,
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
                if conversation_id and resolved_scope.business_id:
                    try:
                        pending_row = await asyncio.get_event_loop().run_in_executor(
                            None,
                            lambda: create_pending_action(
                                conversation_id=str(conversation_id),
                                business_id=str(resolved_scope.business_id),
                                env_id=str(resolved_scope.environment_id) if resolved_scope.environment_id else None,
                                actor=actor,
                                skill_id=routed_skill.selection.skill_id,
                                action_type=str(item.receipt.output.get("action") or item.receipt.tool_name),
                                tool_name=item.receipt.tool_name,
                                params_json=item.receipt.output.get("provided") or item.receipt.input,
                                missing_fields=item.receipt.output.get("missing_fields")
                                or item.receipt.output.get("required_fields")
                                or [],
                                scope_type=resolved_scope.entity_type,
                                scope_id=resolved_scope.entity_id,
                                scope_label=_format_scope_label(resolved_scope=resolved_scope, envelope=normalized_envelope),
                            ),
                        )
                        pending_action_state = _pending_action_receipt(
                            pending_row,
                            fallback_action_type=str(item.receipt.output.get("action") or item.receipt.tool_name),
                            fallback_scope_label=_format_scope_label(resolved_scope=resolved_scope, envelope=normalized_envelope),
                            status=PendingActionStatus.AWAITING_CONFIRMATION,
                        )
                    except Exception:
                        pending_action_state = _pending_action_receipt(
                            None,
                            fallback_action_type=str(item.receipt.output.get("action") or item.receipt.tool_name),
                            fallback_scope_label=_format_scope_label(resolved_scope=resolved_scope, envelope=normalized_envelope),
                            status=PendingActionStatus.AWAITING_CONFIRMATION,
                        )
            messages.append(item.tool_message)

    if collected_content.strip():
        response_blocks.insert(0, markdown_block(collected_content.strip()))

    final_status, final_reason = _status_from_tools([receipt.status for receipt in tool_receipts])

    # Run final quality gates with full context
    lifecycle.checkpoint(LifecyclePhase.PRE_RESPONSE)
    visible = normalized_envelope.ui.visible_data if normalized_envelope.ui.visible_data else None
    has_visible = visible is not None and any([
        visible.funds, visible.assets, visible.investments,
        visible.metrics, visible.pipeline_items, visible.models,
    ])
    final_gates = run_gates(
        context=context_receipt,
        dispatch=dispatch.trace.normalized,
        retrieval=retrieval_execution.receipt,
        has_visible_context=has_visible,
        response_text=collected_content,
        thread_entity_state=thread_entity_state,
    )
    gate_dicts = [g.to_dict() for g in final_gates if not g.passed] or None
    for gate_result in (final_gates or []):
        if not gate_result.passed:
            harness_logger.log_gate_result(
                gate_result.gate_name,
                passed=gate_result.passed,
                message=gate_result.message,
                severity=gate_result.severity.value,
            )

    turn_receipt = TurnReceipt(
        request_id=request_id,
        lane=lane,
        dispatch=dispatch.trace,
        fallback_reason=dispatch.trace.normalized.fallback_reason,
        context=context_receipt,
        skill=routed_skill.selection,
        tools=tool_receipts,
        retrieval=retrieval_execution.receipt,
        pending_action=pending_action_state,
        status=final_status,
        degraded_reason=final_reason,
        quality_gates=gate_dicts,
    )
    if final_status == TurnStatus.DEGRADED and not collected_content.strip():
        late_blocks, late_msg = degraded_blocks_with_context(
            final_reason or DegradedReason.TOOL_FAILED,
            entity_type=resolved_scope.entity_type,
            entity_id=resolved_scope.entity_id,
            entity_name=resolved_scope.entity_name,
            env_id=resolved_scope.environment_id,
            skill_id=routed_skill.selection.skill_id,
        )
        response_blocks = late_blocks + response_blocks
        yield _sse("token", {"text": late_msg})

    # ── Minimum response contract: never emit an empty assistant bubble ──
    if not collected_content.strip() and not response_blocks:
        from app.assistant_runtime.degraded_responses import empty_response_fallback
        fallback_blocks, fallback_msg = empty_response_fallback(
            skill_id=routed_skill.selection.skill_id,
            entity_type=resolved_scope.entity_type,
            entity_id=resolved_scope.entity_id,
            entity_name=resolved_scope.entity_name,
            env_id=resolved_scope.environment_id,
        )
        response_blocks = fallback_blocks
        collected_content = fallback_msg
        final_status = TurnStatus.DEGRADED
        final_reason = DegradedReason.NO_RESPONSE
        turn_receipt = turn_receipt.model_copy(update={"status": final_status, "degraded_reason": final_reason})
        yield _sse("token", {"text": fallback_msg})

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

    # Build dynamic suggested_actions based on skill + entity context
    _active_metric_name = None
    try:
        from app.assistant_runtime.metric_normalizer import extract_metric
        _m = extract_metric(message)
        if _m:
            _active_metric_name = _m.get("normalized")
    except Exception:
        pass
    suggested_actions = build_suggested_actions(
        skill_id=routed_skill.selection.skill_id,
        entity_type=resolved_scope.entity_type,
        entity_id=resolved_scope.entity_id,
        entity_name=resolved_scope.entity_name,
        env_id=resolved_scope.environment_id,
        active_metric=_active_metric_name,
    )

    yield _sse(
        "done",
        {
            "session_id": session_id,
            "turn_receipt": turn_receipt.model_dump(mode="json"),
            "trace": trace,
            "response_blocks": response_blocks,
            "resolved_scope": scope_dump,
            "suggested_actions": suggested_actions,
        },
    )

    await _persist_conversation_turn(
        conversation_id=conversation_id,
        message=message,
        assistant_content=collected_content or degraded_message(final_reason) if final_reason else collected_content,
        response_blocks=response_blocks,
        turn_receipt=turn_receipt,
        resolved_scope=resolved_scope,
        request_id=request_id,
        envelope=normalized_envelope,
        result_memory=turn_result_memory,
    )

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
