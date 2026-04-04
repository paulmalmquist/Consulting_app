from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.assistant_runtime.skill_registry import SKILL_BY_ID, skill_requires_grounding
from app.assistant_runtime.skill_router import RoutedSkill, build_routed_skill, route_skill
from app.assistant_runtime.turn_receipts import (
    ContextReceipt,
    DispatchAmbiguity,
    DispatchDecision,
    DispatchProposal,
    DispatchSource,
    DispatchTrace,
    ContextResolutionStatus,
    Lane,
    RetrievalPolicy,
    legacy_code_to_lane,
)
from app.config import (
    OPENAI_CHAT_MODEL_AGENTIC,
    OPENAI_CHAT_MODEL_DISPATCH,
    OPENAI_CHAT_MODEL_FAST,
    OPENAI_CHAT_MODEL_REASONING,
    OPENAI_CHAT_MODEL_STANDARD,
    OPENAI_DISPATCH_CONFIDENCE_THRESHOLD,
)
from app.schemas.ai_gateway import AssistantContextEnvelope, ResolvedAssistantScope
from app.services.ai_client import get_instrumented_client
from app.services.model_registry import map_openai_error, sanitize_params
from app.services.request_router import RouteDecision, classify_request

_SOURCE_AUDIT_RE = re.compile(
    r"\b(what data is this based on|what is this based on|what data did you use|what source(?:s)? did you use|"
    r"exact data source|data source|what tool did you use|which tool did you use|why did you answer that|justify|justification)\b",
    re.IGNORECASE,
)
_IDENTITY_PROMPT_RE = re.compile(
    r"\b(what am i looking at|what page|which page|what environment|where am i|which environment|what is this|what (?:fund|deal|asset|property|investment|client) is this)\b",
    re.IGNORECASE,
)
_AMBIGUOUS_DEICTIC_RE = re.compile(
    r"\b(this|that|it|these|those|other|second|first|next|previous)\b",
    re.IGNORECASE,
)
_CREATE_ENTITY_RE = re.compile(
    r"\b(?:create|add|make|set up|register|new)\s+(?:a\s+|an\s+)?(?:fund|deal|asset|property|investment)\b",
    re.IGNORECASE,
)
_DEBT_RISK_RE = re.compile(r"\b(debt risk|debt watch|watchlist)\b", re.IGNORECASE)
_METRIC_ANOMALY_RE = re.compile(
    r"\b(blank|variance|underwriting|occupancy|noi|down vs|debt risk|debt watch|watchlist)\b",
    re.IGNORECASE,
)

_DISPATCH_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "winston_dispatch",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "skill": {
                    "anyOf": [{"type": "string"}, {"type": "null"}],
                },
                "lane": {
                    "anyOf": [
                        {"type": "string", "enum": [lane.value for lane in Lane]},
                        {"type": "null"},
                    ],
                },
                "needs_retrieval": {"type": "boolean"},
                "write_intent": {"type": "boolean"},
                "ambiguity_level": {
                    "type": "string",
                    "enum": [level.value for level in DispatchAmbiguity],
                },
                "confidence": {
                    "type": "number",
                    "minimum": 0.0,
                    "maximum": 1.0,
                },
            },
            "required": [
                "skill",
                "lane",
                "needs_retrieval",
                "write_intent",
                "ambiguity_level",
                "confidence",
            ],
        },
    },
}


@dataclass(frozen=True)
class DispatchOutcome:
    trace: DispatchTrace
    route: RouteDecision
    routed_skill: RoutedSkill


class DispatchModelFailure(ValueError):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _flatten_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
            elif hasattr(item, "text"):
                parts.append(str(getattr(item, "text", "")))
        return "".join(parts)
    return str(content or "")


def _parse_dispatch_payload(payload: str) -> DispatchProposal:
    text = (payload or "").strip()
    if not text:
        raise DispatchModelFailure("dispatcher_empty_output")
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.DOTALL)
    return DispatchProposal.model_validate(json.loads(text))


def _deterministic_dispatch(*, message: str, context: ContextReceipt) -> DispatchTrace | None:
    normalized_message = message or ""
    if context.resolution_status == ContextResolutionStatus.AMBIGUOUS_CONTEXT and _AMBIGUOUS_DEICTIC_RE.search(normalized_message):
        decision = DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="lookup_entity",
            lane=Lane.B_LOOKUP,
            needs_retrieval=False,
            write_intent=False,
            ambiguity_level=DispatchAmbiguity.HIGH,
            confidence=0.99,
            fallback_used=False,
            notes=["deterministic_ambiguity_guardrail"],
        )
        return DispatchTrace(raw=None, normalized=decision)
    if context.resolution_status == ContextResolutionStatus.RESOLVED and _IDENTITY_PROMPT_RE.search(normalized_message):
        decision = DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="lookup_entity",
            lane=Lane.A_FAST,
            needs_retrieval=False,
            write_intent=False,
            ambiguity_level=DispatchAmbiguity.LOW,
            confidence=1.0,
            fallback_used=False,
            notes=["deterministic_identity_guardrail"],
        )
        return DispatchTrace(raw=None, normalized=decision)
    if context.resolution_status == ContextResolutionStatus.RESOLVED and _SOURCE_AUDIT_RE.search(normalized_message):
        decision = DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="run_analysis",
            lane=Lane.B_LOOKUP,
            needs_retrieval=False,
            write_intent=False,
            ambiguity_level=DispatchAmbiguity.LOW,
            confidence=0.96,
            fallback_used=False,
            notes=["deterministic_source_audit_guardrail"],
        )
        return DispatchTrace(raw=None, normalized=decision)
    if context.resolution_status == ContextResolutionStatus.RESOLVED and _DEBT_RISK_RE.search(normalized_message):
        decision = DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="run_analysis",
            lane=Lane.C_ANALYSIS,
            needs_retrieval=True,
            write_intent=False,
            ambiguity_level=DispatchAmbiguity.LOW,
            confidence=0.97,
            fallback_used=False,
            notes=["deterministic_debt_risk_guardrail"],
        )
        return DispatchTrace(raw=None, normalized=decision)
    if context.resolution_status == ContextResolutionStatus.RESOLVED and _METRIC_ANOMALY_RE.search(normalized_message):
        decision = DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="run_analysis" if _DEBT_RISK_RE.search(normalized_message) else "explain_metric",
            lane=Lane.C_ANALYSIS,
            needs_retrieval=True,
            write_intent=False,
            ambiguity_level=DispatchAmbiguity.LOW,
            confidence=0.96,
            fallback_used=False,
            notes=["deterministic_metric_anomaly_guardrail"],
        )
        return DispatchTrace(raw=None, normalized=decision)
    if _CREATE_ENTITY_RE.search(normalized_message):
        decision = DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="create_entity",
            lane=Lane.C_ANALYSIS,
            needs_retrieval=False,
            write_intent=True,
            ambiguity_level=DispatchAmbiguity.LOW,
            confidence=0.98,
            fallback_used=False,
            notes=["deterministic_write_guardrail"],
        )
        return DispatchTrace(raw=None, normalized=decision)
    return None


def _context_summary(
    *,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
    context: ContextReceipt,
    visible_context_shortcut: bool,
) -> dict[str, Any]:
    return {
        "message_route": context_envelope.ui.route,
        "surface": context_envelope.ui.surface,
        "active_environment_id": context_envelope.ui.active_environment_id,
        "active_environment_name": context_envelope.ui.active_environment_name,
        "page_entity_type": context_envelope.ui.page_entity_type,
        "page_entity_id": context_envelope.ui.page_entity_id,
        "page_entity_name": context_envelope.ui.page_entity_name,
        "selected_entities": [
            {
                "entity_type": item.entity_type,
                "entity_id": item.entity_id,
                "name": item.name,
                "source": item.source,
            }
            for item in context_envelope.ui.selected_entities[:4]
        ],
        "resolved_scope": resolved_scope.model_dump(mode="json"),
        "context_receipt": context.model_dump(mode="json"),
        "visible_context_shortcut": visible_context_shortcut,
    }


def _dispatch_messages(
    *,
    message: str,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
    context: ContextReceipt,
    visible_context_shortcut: bool,
) -> list[dict[str, str]]:
    skill_lines = [
        f"- {skill.id}: {skill.description} | retrieval={skill.retrieval_policy.value} | confirmation={skill.confirmation_mode.value}"
        for skill in SKILL_BY_ID.values()
    ]
    system = (
        "You are Winston's dispatcher. Return only JSON matching the provided schema.\n"
        "Choose the smallest sufficient lane.\n"
        "Use skill=null only when no listed skill fits.\n"
        "Set needs_retrieval=true only when the answer needs grounded document/data lookup beyond current UI context.\n"
        "Set write_intent=true only for create/update/delete/mutate requests.\n"
        "Set ambiguity_level=high when the prompt relies on pronouns or stale context and current scope is missing or ambiguous.\n"
        "Confidence must be a number between 0 and 1.\n"
        "Available skills:\n"
        + "\n".join(skill_lines)
    )
    user = json.dumps(
        {
            "message": message,
            "context": _context_summary(
                context_envelope=context_envelope,
                resolved_scope=resolved_scope,
                context=context,
                visible_context_shortcut=visible_context_shortcut,
            ),
        },
        ensure_ascii=True,
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _dispatch_params(
    *,
    message: str,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
    context: ContextReceipt,
    visible_context_shortcut: bool,
    max_tokens: int,
) -> dict[str, Any]:
    params = sanitize_params(
        OPENAI_CHAT_MODEL_DISPATCH,
        messages=_dispatch_messages(
            message=message,
            context_envelope=context_envelope,
            resolved_scope=resolved_scope,
            context=context,
            visible_context_shortcut=visible_context_shortcut,
        ),
        max_tokens=max_tokens,
        reasoning_effort="low",
        stream=False,
        temperature=0,
    )
    params["response_format"] = _DISPATCH_SCHEMA
    params["seed"] = 7
    return params


async def _model_dispatch(
    *,
    message: str,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
    context: ContextReceipt,
    visible_context_shortcut: bool,
) -> tuple[DispatchProposal, list[str]]:
    client = get_instrumented_client()
    retry_notes: list[str] = []
    last_failure: str | None = None
    for idx, max_tokens in enumerate((220, 360)):
        params = _dispatch_params(
            message=message,
            context_envelope=context_envelope,
            resolved_scope=resolved_scope,
            context=context,
            visible_context_shortcut=visible_context_shortcut,
            max_tokens=max_tokens,
        )
        completion = await client.chat.completions.create(**params)
        if not completion.choices:
            last_failure = "dispatcher_no_choices"
        else:
            choice = completion.choices[0]
            content = _flatten_content(choice.message.content)
            finish_reason = str(getattr(choice, "finish_reason", "") or "").lower()
            if not (content or "").strip():
                last_failure = "dispatcher_truncated" if finish_reason == "length" else "dispatcher_empty_output"
            else:
                try:
                    proposal = _parse_dispatch_payload(content)
                except DispatchModelFailure as exc:
                    last_failure = exc.reason
                except json.JSONDecodeError:
                    last_failure = "dispatcher_invalid_json"
                except ValidationError:
                    last_failure = "dispatcher_invalid_schema"
                else:
                    if idx > 0 and retry_notes:
                        retry_notes.append(f"dispatch_retry_succeeded_after:{last_failure or 'unknown'}")
                    return proposal, retry_notes

        if idx == 0 and last_failure in {
            "dispatcher_truncated",
            "dispatcher_empty_output",
            "dispatcher_invalid_json",
            "dispatcher_invalid_schema",
            "dispatcher_invalid_response",
            "dispatcher_no_choices",
        }:
            retry_notes.append(f"dispatch_retry_after:{last_failure}")
            continue
        raise DispatchModelFailure(last_failure or "dispatcher_invalid_response")

    raise DispatchModelFailure(last_failure or "dispatcher_invalid_response")


def _fallback_trace(
    *,
    fallback_route: RouteDecision,
    fallback_skill: RoutedSkill,
    reason: str,
) -> DispatchTrace:
    fallback_lane = legacy_code_to_lane(fallback_route.lane)
    decision = DispatchDecision(
        source=DispatchSource.LEGACY_FALLBACK,
        skill_id=fallback_skill.selection.skill_id,
        lane=fallback_lane,
        needs_retrieval=not fallback_route.skip_rag,
        write_intent=fallback_route.is_write,
        ambiguity_level=DispatchAmbiguity.LOW,
        confidence=fallback_skill.selection.confidence,
        fallback_used=True,
        fallback_reason=reason,
        notes=[reason, f"legacy_pattern:{fallback_route.matched_pattern or 'unknown'}"],
    )
    return DispatchTrace(raw=None, normalized=decision)


def _normalize_dispatch(
    *,
    proposal: DispatchProposal | None,
    fallback_route: RouteDecision,
    fallback_skill: RoutedSkill,
    context: ContextReceipt,
    message: str,
    fallback_reason: str | None = None,
    extra_notes: list[str] | None = None,
) -> DispatchTrace:
    if proposal is None:
        return _fallback_trace(
            fallback_route=fallback_route,
            fallback_skill=fallback_skill,
            reason=fallback_reason or "dispatcher_unavailable",
        )

    notes: list[str] = list(extra_notes or [])
    fallback_used = False
    lane = proposal.lane or legacy_code_to_lane(fallback_route.lane)
    if not isinstance(lane, Lane):
        lane = Lane(lane)

    skill_id = proposal.skill
    if skill_id is not None and skill_id not in SKILL_BY_ID:
        notes.append(f"unknown_skill:{skill_id}")
        skill_id = None

    if proposal.confidence < OPENAI_DISPATCH_CONFIDENCE_THRESHOLD:
        notes.append("low_confidence_dispatch")
        fallback_used = True

    if fallback_used:
        return DispatchTrace(
            raw=proposal,
            normalized=_fallback_trace(
                fallback_route=fallback_route,
                fallback_skill=fallback_skill,
                reason="low_confidence_dispatch",
            ).normalized,
        )

    if skill_id is None and fallback_skill.selection.skill_id and proposal.confidence < 0.5:
        notes.append("missing_skill_fell_back")
        return DispatchTrace(
            raw=proposal,
            normalized=_fallback_trace(
                fallback_route=fallback_route,
                fallback_skill=fallback_skill,
                reason="missing_skill_fell_back",
            ).normalized,
        )

    if context.resolution_status == ContextResolutionStatus.AMBIGUOUS_CONTEXT and skill_id is None and fallback_skill.selection.skill_id:
        skill_id = fallback_skill.selection.skill_id
        notes.append("ambiguous_context_forced_fallback_skill")

    normalized_write_intent = proposal.write_intent
    if proposal.write_intent and skill_id != "create_entity":
        if fallback_route.is_write or _CREATE_ENTITY_RE.search(message):
            notes.append("write_intent_forced_create_entity")
            skill_id = "create_entity"
        else:
            normalized_write_intent = False
            notes.append("spurious_write_intent_suppressed")

    skill_def = SKILL_BY_ID.get(skill_id) if skill_id else None
    if _METRIC_ANOMALY_RE.search(message or "") and skill_id in {None, "lookup_entity", "explain_metric"}:
        if re.search(r"\b(debt risk|debt watch|watchlist)\b", message or "", re.IGNORECASE):
            skill_id = "run_analysis"
        elif re.search(r"\b(why|explain|blank|variance|underwriting|occupancy|noi|down vs)\b", message or "", re.IGNORECASE):
            skill_id = "explain_metric"
        else:
            skill_id = "run_analysis"
        notes.append("metric_anomaly_skill_normalized")
        skill_def = SKILL_BY_ID.get(skill_id) if skill_id else None

    needs_retrieval = proposal.needs_retrieval
    if skill_id == "lookup_entity" and fallback_route.skip_rag:
        needs_retrieval = False
        notes.append("lookup_retrieval_suppressed")
    if skill_requires_grounding(skill_id, message=message):
        needs_retrieval = True
        notes.append("retrieval_required_by_skill")
    if skill_def and skill_def.retrieval_policy == RetrievalPolicy.NONE:
        needs_retrieval = False

    if skill_id == "create_entity" and lane in (Lane.A_FAST, Lane.B_LOOKUP):
        lane = Lane.C_ANALYSIS
        notes.append("write_lane_promoted")
    if context.resolution_status == ContextResolutionStatus.AMBIGUOUS_CONTEXT and lane == Lane.A_FAST:
        lane = Lane.B_LOOKUP
        notes.append("ambiguous_context_lane_promoted")
    if needs_retrieval and lane == Lane.A_FAST:
        lane = Lane.C_ANALYSIS if skill_id in {"explain_metric", "run_analysis", "generate_lp_summary"} else Lane.B_LOOKUP
        notes.append("grounded_lane_promoted")
    if skill_id == "generate_lp_summary" and lane in (Lane.A_FAST, Lane.B_LOOKUP):
        lane = Lane.C_ANALYSIS
        needs_retrieval = True
        notes.append("lp_summary_lane_promoted")
    if skill_id == "run_analysis" and lane == Lane.A_FAST:
        lane = Lane.B_LOOKUP if not needs_retrieval else Lane.C_ANALYSIS
        notes.append("analysis_lane_promoted")
    if context.resolution_status != "resolved" and proposal.ambiguity_level == DispatchAmbiguity.LOW:
        notes.append("context_scope_non_resolved")

    normalized = DispatchDecision(
        source=DispatchSource.MODEL,
        skill_id=skill_id,
        lane=lane,
        needs_retrieval=needs_retrieval,
        write_intent=normalized_write_intent,
        ambiguity_level=proposal.ambiguity_level,
        confidence=round(proposal.confidence, 2),
        fallback_used=False,
        fallback_reason=None,
        notes=notes,
    )
    return DispatchTrace(raw=proposal, normalized=normalized)


def _route_from_dispatch(
    *,
    normalized: DispatchDecision,
    fallback_route: RouteDecision,
) -> RouteDecision:
    lane = normalized.lane
    route_kwargs: dict[str, Any]
    if lane == Lane.A_FAST:
        route_kwargs = {
            "lane": "A",
            "skip_rag": True,
            "skip_tools": True,
            "max_tool_rounds": 0,
            "max_tokens": 384,
            "temperature": 0.1,
            "model": OPENAI_CHAT_MODEL_FAST,
            "rag_top_k": 0,
            "rag_max_tokens": 0,
            "history_max_tokens": 800,
            "matched_pattern": f"dispatch:{normalized.source.value}",
        }
    elif lane == Lane.B_LOOKUP:
        route_kwargs = {
            "lane": "B",
            "skip_rag": not normalized.needs_retrieval,
            "skip_tools": False,
            "max_tool_rounds": 2,
            "max_tokens": 1024,
            "temperature": 0.1,
            "model": OPENAI_CHAT_MODEL_FAST,
            "rag_top_k": 3 if normalized.needs_retrieval else 0,
            "rag_max_tokens": 800 if normalized.needs_retrieval else 0,
            "history_max_tokens": 1500,
            "use_rerank": False,
            "use_hybrid": False,
            "rag_min_score": 0.40,
            "matched_pattern": f"dispatch:{normalized.source.value}",
        }
    elif lane == Lane.D_DEEP:
        route_kwargs = {
            "lane": "D",
            "skip_rag": not normalized.needs_retrieval,
            "skip_tools": False,
            "max_tool_rounds": 5,
            "max_tokens": 2048,
            "temperature": 0.2,
            "model": OPENAI_CHAT_MODEL_AGENTIC if normalized.write_intent else OPENAI_CHAT_MODEL_REASONING,
            "rag_top_k": 8 if normalized.needs_retrieval else 0,
            "rag_max_tokens": 3000 if normalized.needs_retrieval else 0,
            "history_max_tokens": 4000,
            "use_rerank": normalized.needs_retrieval,
            "use_hybrid": normalized.needs_retrieval,
            "reasoning_effort": "high",
            "needs_verification": normalized.needs_retrieval,
            "needs_query_expansion": fallback_route.needs_query_expansion,
            "needs_structured_retrieval": normalized.needs_retrieval and fallback_route.needs_structured_retrieval,
            "needs_agentic_executor": True,
            "rag_min_score": 0.25,
            "matched_pattern": f"dispatch:{normalized.source.value}",
        }
    else:
        route_kwargs = {
            "lane": "C",
            "skip_rag": not normalized.needs_retrieval,
            "skip_tools": False,
            "max_tool_rounds": 3,
            "max_tokens": 1024 if normalized.write_intent else 2048,
            "temperature": 0.1 if normalized.write_intent else 0.2,
            "model": OPENAI_CHAT_MODEL_FAST if normalized.write_intent else OPENAI_CHAT_MODEL_STANDARD,
            "rag_top_k": 5 if normalized.needs_retrieval else 0,
            "rag_max_tokens": 2000 if normalized.needs_retrieval else 0,
            "history_max_tokens": 2500,
            "use_rerank": normalized.needs_retrieval,
            "use_hybrid": normalized.needs_retrieval,
            "reasoning_effort": None if normalized.write_intent else "medium",
            "needs_verification": normalized.needs_retrieval,
            "needs_query_expansion": fallback_route.needs_query_expansion if normalized.needs_retrieval else False,
            "needs_structured_retrieval": normalized.needs_retrieval and fallback_route.needs_structured_retrieval,
            "needs_agentic_executor": False,
            "matched_pattern": f"dispatch:{normalized.source.value}",
        }

    route_kwargs["is_write"] = normalized.write_intent
    return RouteDecision(**route_kwargs)


async def dispatch_request(
    *,
    message: str,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
    context: ContextReceipt,
    visible_context_shortcut: bool,
) -> DispatchOutcome:
    fallback_route = classify_request(
        message=message,
        context_envelope=context_envelope,
        resolved_scope=resolved_scope,
        visible_context_shortcut=visible_context_shortcut,
    )
    fallback_lane = legacy_code_to_lane(fallback_route.lane)
    fallback_skill = route_skill(message=message, lane=fallback_lane, route=fallback_route, context=context)

    deterministic = _deterministic_dispatch(message=message, context=context)
    if deterministic is not None:
        route = _route_from_dispatch(normalized=deterministic.normalized, fallback_route=fallback_route)
        skill = build_routed_skill(
            message=message,
            skill_id=deterministic.normalized.skill_id,
            confidence=deterministic.normalized.confidence,
        )
        return DispatchOutcome(trace=deterministic, route=route, routed_skill=skill)

    proposal: DispatchProposal | None = None
    dispatch_notes: list[str] = []
    fallback_reason: str | None = None
    try:
        proposal, dispatch_notes = await _model_dispatch(
            message=message,
            context_envelope=context_envelope,
            resolved_scope=resolved_scope,
            context=context,
            visible_context_shortcut=visible_context_shortcut,
        )
    except DispatchModelFailure as exc:
        proposal = None
        fallback_reason = exc.reason
    except Exception as exc:
        mapped = map_openai_error(exc, OPENAI_CHAT_MODEL_DISPATCH)
        proposal = None
        fallback = _fallback_trace(
            fallback_route=fallback_route,
            fallback_skill=fallback_skill,
            reason=f"dispatcher_error:{mapped.debug_message[:80]}",
        )
        route = _route_from_dispatch(normalized=fallback.normalized, fallback_route=fallback_route)
        skill = build_routed_skill(
            message=message,
            skill_id=fallback.normalized.skill_id,
            confidence=fallback.normalized.confidence,
        )
        return DispatchOutcome(trace=fallback, route=route, routed_skill=skill)

    trace = _normalize_dispatch(
        proposal=proposal,
        fallback_route=fallback_route,
        fallback_skill=fallback_skill,
        context=context,
        message=message,
        fallback_reason=fallback_reason,
        extra_notes=dispatch_notes,
    )
    route = _route_from_dispatch(normalized=trace.normalized, fallback_route=fallback_route)
    skill = build_routed_skill(
        message=message,
        skill_id=trace.normalized.skill_id,
        confidence=trace.normalized.confidence if trace.normalized.skill_id else fallback_skill.selection.confidence,
    )
    if skill.definition is None and trace.normalized.skill_id is None:
        skill = fallback_skill if trace.normalized.source == DispatchSource.LEGACY_FALLBACK else skill
    return DispatchOutcome(trace=trace, route=route, routed_skill=skill)
