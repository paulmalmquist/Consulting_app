from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from app.assistant_runtime.skill_router import RoutedSkill, build_routed_skill, route_skill
from app.assistant_runtime.turn_receipts import (
    ContextReceipt,
    DispatchAmbiguity,
    DispatchDecision,
    DispatchSource,
    DispatchTrace,
    ContextResolutionStatus,
    Lane,
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

# ── Fast-path regex guardrails (identity, create, ambiguity only) ─────
# All other routing goes through the tiny router model.
_IDENTITY_PROMPT_RE = re.compile(
    r"\b(what am i looking at|what page|which page|what environment|where am i|which environment|what is this|what (?:fund|deal|asset|property|investment|client) is this)\b",
    re.IGNORECASE,
)
_AMBIGUOUS_DEICTIC_RE = re.compile(
    r"\b(this|that|it|these|those|other|second|first|next|previous)\b",
    re.IGNORECASE,
)
_CREATE_ENTITY_RE = re.compile(
    r"\b(?:create|add|make|set up|register|new)\s+(?:a\s+|an\s+)?(?:fund|deal|asset|property|investment|"
    r"account|opportunity|lead|activity|contact|engagement|proposal)\b",
    re.IGNORECASE,
)

# ═══════════════════════════════════════════════════════════════════════
# Tiny Router — closed enum schema for domain intent classification
# ═══════════════════════════════════════════════════════════════════════

_ENV_ENUM = ["repe", "resume", "crm", "pds", "unknown"]
_ENTITY_TYPE_ENUM = ["fund", "asset", "investment", "project", "account", "opportunity", "person", "unknown"]
_ACTION_ENUM = [
    "summary", "detail", "holdings", "list", "rank", "metric_lookup",
    "trend", "compare", "variance", "create", "update", "explain",
    "search", "count", "draft_email", "unknown",
]
def _build_metric_enum() -> list[str]:
    """Build metric enum from the unified registry (DB-backed) with static fallback."""
    static = ["noi", "irr", "tvpi", "dpi", "nav", "occupancy", "ltv", "dscr", "revenue", "expenses", "ncf"]
    try:
        from app.services.unified_metric_registry import get_registry
        registry = get_registry()
        if registry.has_data:
            keys = [c.metric_key for c in registry.list_all()]
            return sorted(set(k.lower() for k in keys + static)) + ["none"]
    except Exception:
        pass
    return static + ["none"]

_METRIC_ENUM = _build_metric_enum()
_TIMEFRAME_ENUM = ["latest", "quarter", "ttm", "ltm", "custom", "none"]
_CLARIFICATION_FIELD_ENUM = ["entity", "metric", "timeframe", "action", "none"]

_ROUTER_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "winston_router",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "environment":        {"type": "string", "enum": _ENV_ENUM},
                "entity_type":        {"type": "string", "enum": _ENTITY_TYPE_ENUM},
                "entity_name":        {"anyOf": [{"type": "string"}, {"type": "null"}]},
                "action":             {"type": "string", "enum": _ACTION_ENUM},
                "metric":             {"type": "string", "enum": _METRIC_ENUM},
                "timeframe_type":     {"type": "string", "enum": _TIMEFRAME_ENUM},
                "timeframe_value":    {"anyOf": [{"type": "string"}, {"type": "null"}]},
                "needs_clarification":{"type": "boolean"},
                "clarification_field":{"type": "string", "enum": _CLARIFICATION_FIELD_ENUM},
                "confidence":         {"type": "number"},
            },
            "required": [
                "environment", "entity_type", "entity_name", "action",
                "metric", "timeframe_type", "timeframe_value",
                "needs_clarification", "clarification_field", "confidence",
            ],
        },
    },
}


@dataclass(frozen=True)
class RouterIntent:
    """Typed, closed-enum output from the tiny router model."""
    environment: str
    entity_type: str
    entity_name: str | None
    action: str
    metric: str
    timeframe_type: str
    timeframe_value: str | None
    needs_clarification: bool
    clarification_field: str
    confidence: float


# ── Deterministic intent → skill mapping table ───────────────────────
# Tuple: (skill_id, lane, needs_retrieval, write_intent)
_IntentMapping = tuple[str, Lane, bool, bool]

_INTENT_MAP: dict[tuple[str, str], _IntentMapping] = {
    # REPE fund actions
    ("fund", "summary"):       ("fund_summary",             Lane.B_LOOKUP,   True,  False),
    ("fund", "detail"):        ("fund_summary",             Lane.B_LOOKUP,   True,  False),
    ("fund", "holdings"):      ("fund_holdings",            Lane.C_ANALYSIS, True,  False),
    ("fund", "list"):          ("fund_summary",             Lane.B_LOOKUP,   True,  False),
    ("fund", "metric_lookup"): ("explain_metric",           Lane.C_ANALYSIS, True,  False),
    ("fund", "trend"):         ("trend_metric",             Lane.C_ANALYSIS, True,  False),
    ("fund", "rank"):          ("rank_metric",              Lane.C_ANALYSIS, True,  False),
    ("fund", "explain"):       ("run_analysis",             Lane.C_ANALYSIS, True,  False),
    # REPE asset actions
    ("asset", "summary"):      ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    ("asset", "detail"):       ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    ("asset", "metric_lookup"):("explain_metric",           Lane.C_ANALYSIS, True,  False),
    ("asset", "rank"):         ("rank_metric",              Lane.C_ANALYSIS, True,  False),
    ("asset", "trend"):        ("trend_metric",             Lane.C_ANALYSIS, True,  False),
    ("asset", "list"):         ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    ("asset", "explain"):      ("explain_metric",           Lane.C_ANALYSIS, True,  False),
    # Investment
    ("investment", "summary"): ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    ("investment", "detail"):  ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    # Resume / person
    ("person", "explain"):     ("resume_qa",                Lane.C_ANALYSIS, True,  False),
    ("person", "summary"):     ("resume_qa",                Lane.C_ANALYSIS, True,  False),
    ("person", "detail"):      ("resume_qa",                Lane.C_ANALYSIS, True,  False),
    ("person", "search"):      ("resume_qa",                Lane.C_ANALYSIS, True,  False),
    ("person", "draft_email"): ("draft_email",              Lane.C_ANALYSIS, False, True),
    # CRM
    ("account", "list"):       ("lookup_entity",            Lane.C_ANALYSIS, True,  False),
    ("account", "search"):     ("lookup_entity",            Lane.C_ANALYSIS, True,  False),
    ("account", "summary"):    ("lookup_entity",            Lane.C_ANALYSIS, True,  False),
    ("opportunity", "list"):   ("lookup_entity",            Lane.C_ANALYSIS, True,  False),
    ("opportunity", "summary"):("lookup_entity",            Lane.C_ANALYSIS, True,  False),
    # PDS
    ("project", "summary"):    ("lookup_entity",            Lane.C_ANALYSIS, True,  False),
    ("project", "list"):       ("lookup_entity",            Lane.C_ANALYSIS, True,  False),
    ("project", "detail"):     ("lookup_entity",            Lane.C_ANALYSIS, True,  False),
    # Count queries (fast path — precheck provides the canonical count)
    ("fund", "count"):         ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    ("asset", "count"):        ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
}

# Wildcard fallbacks: match any entity_type
_INTENT_WILDCARD: dict[str, _IntentMapping] = {
    "variance":     ("explain_metric_variance",  Lane.C_ANALYSIS, True,  False),
    "compare":      ("compare_entities",         Lane.C_ANALYSIS, True,  False),
    "create":       ("create_entity",            Lane.C_ANALYSIS, False, True),
    "update":       ("create_entity",            Lane.C_ANALYSIS, False, True),
    "explain":      ("run_analysis",             Lane.C_ANALYSIS, True,  False),
    "search":       ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    "list":         ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    "summary":      ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    "detail":       ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    "holdings":     ("fund_holdings",            Lane.C_ANALYSIS, True,  False),
    "metric_lookup":("explain_metric",           Lane.C_ANALYSIS, True,  False),
    "rank":         ("rank_metric",              Lane.C_ANALYSIS, True,  False),
    "trend":        ("trend_metric",             Lane.C_ANALYSIS, True,  False),
    "count":        ("lookup_entity",            Lane.B_LOOKUP,   True,  False),
    "draft_email":  ("draft_email",              Lane.C_ANALYSIS, False, True),
    "unknown":      ("run_analysis",             Lane.C_ANALYSIS, True,  False),
}


def _map_intent_to_skill(intent: RouterIntent) -> _IntentMapping:
    """Deterministic lookup: router intent → (skill_id, lane, retrieval, write)."""
    key = (intent.entity_type, intent.action)
    if key in _INTENT_MAP:
        return _INTENT_MAP[key]
    if intent.action in _INTENT_WILDCARD:
        return _INTENT_WILDCARD[intent.action]
    return ("run_analysis", Lane.C_ANALYSIS, True, False)


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


def _deterministic_dispatch(*, message: str, context: ContextReceipt) -> DispatchTrace | None:
    """Fast-path regex guardrails that bypass the router model entirely.

    Only kept for the most unambiguous, zero-latency patterns:
    - Identity questions ("what page is this")
    - Create/write intent ("create a new fund")
    - Ambiguous deictic references with missing context

    All other routing goes through the tiny router model.
    """
    normalized_message = message or ""

    # Ambiguous context + deictic reference → force lookup
    if context.resolution_status == ContextResolutionStatus.AMBIGUOUS_CONTEXT and _AMBIGUOUS_DEICTIC_RE.search(normalized_message):
        return DispatchTrace(raw=None, normalized=DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="lookup_entity", lane=Lane.B_LOOKUP,
            needs_retrieval=False, write_intent=False,
            ambiguity_level=DispatchAmbiguity.HIGH, confidence=0.99,
            fallback_used=False, notes=["deterministic_ambiguity_guardrail"],
        ))

    # Identity questions ("what page is this", "what environment")
    if context.resolution_status == ContextResolutionStatus.RESOLVED and _IDENTITY_PROMPT_RE.search(normalized_message):
        return DispatchTrace(raw=None, normalized=DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="lookup_entity", lane=Lane.A_FAST,
            needs_retrieval=False, write_intent=False,
            ambiguity_level=DispatchAmbiguity.LOW, confidence=1.0,
            fallback_used=False, notes=["deterministic_identity_guardrail"],
        ))

    # Create / write intent ("create a new fund", "add an opportunity")
    if _CREATE_ENTITY_RE.search(normalized_message):
        return DispatchTrace(raw=None, normalized=DispatchDecision(
            source=DispatchSource.DETERMINISTIC_GUARDRAIL,
            skill_id="create_entity", lane=Lane.C_ANALYSIS,
            needs_retrieval=False, write_intent=True,
            ambiguity_level=DispatchAmbiguity.LOW, confidence=0.98,
            fallback_used=False, notes=["deterministic_write_guardrail"],
        ))

    # Everything else → router model
    return None


_ROUTER_SYSTEM_PROMPT = (
    "You are a domain intent classifier for a real estate private equity AI platform. "
    "Return ONLY JSON matching the schema. Do not explain.\n\n"
    "Enums:\n"
    "  environment: repe, resume, crm, pds, unknown\n"
    "  entity_type: fund, asset, investment, project, account, opportunity, person, unknown\n"
    "  action: summary, detail, holdings, list, rank, metric_lookup, trend, compare, variance, create, update, explain, search, draft_email, unknown\n"
    "  metric: noi, irr, tvpi, dpi, nav, occupancy, ltv, dscr, revenue, expenses, ncf, none\n"
    "  timeframe_type: latest, quarter, ttm, ltm, custom, none\n"
    "  clarification_field: entity, metric, timeframe, action, none\n\n"
    "Examples:\n"
    '{"message":"give me a rundown of the funds"} → {"environment":"repe","entity_type":"fund","entity_name":null,"action":"summary","metric":"none","timeframe_type":"none","timeframe_value":null,"needs_clarification":false,"clarification_field":"none","confidence":0.92}\n'
    '{"message":"walk me through what IGF VII owns"} → {"environment":"repe","entity_type":"fund","entity_name":"IGF VII","action":"holdings","metric":"none","timeframe_type":"none","timeframe_value":null,"needs_clarification":false,"clarification_field":"none","confidence":0.95}\n'
    '{"message":"best performing assets by NOI"} → {"environment":"repe","entity_type":"asset","entity_name":null,"action":"rank","metric":"noi","timeframe_type":"latest","timeframe_value":null,"needs_clarification":false,"clarification_field":"none","confidence":0.93}\n'
    '{"message":"what is the occupancy for Riverfront Residences"} → {"environment":"repe","entity_type":"asset","entity_name":"Riverfront Residences","action":"metric_lookup","metric":"occupancy","timeframe_type":"latest","timeframe_value":null,"needs_clarification":false,"clarification_field":"none","confidence":0.94}\n'
    '{"message":"when did Paul start at Kayne Anderson"} → {"environment":"resume","entity_type":"person","entity_name":"Paul","action":"explain","metric":"none","timeframe_type":"none","timeframe_value":null,"needs_clarification":false,"clarification_field":"none","confidence":0.91}\n'
    '{"message":"NOI trend for 2025"} → {"environment":"repe","entity_type":"unknown","entity_name":null,"action":"trend","metric":"noi","timeframe_type":"custom","timeframe_value":"2025","needs_clarification":true,"clarification_field":"entity","confidence":0.78}\n'
    '{"message":"compare actual vs budget"} → {"environment":"repe","entity_type":"unknown","entity_name":null,"action":"variance","metric":"none","timeframe_type":"latest","timeframe_value":null,"needs_clarification":false,"clarification_field":"none","confidence":0.88}\n'
    '{"message":"who should I follow up with today"} → {"environment":"crm","entity_type":"account","entity_name":null,"action":"search","metric":"none","timeframe_type":"latest","timeframe_value":null,"needs_clarification":false,"clarification_field":"none","confidence":0.87}\n'
    '{"message":"how many assets do we own"} → {"environment":"repe","entity_type":"asset","entity_name":null,"action":"count","metric":"none","timeframe_type":"latest","timeframe_value":null,"needs_clarification":false,"clarification_field":"none","confidence":0.95}\n'
)


def _router_messages(
    *,
    message: str,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
) -> list[dict[str, str]]:
    """Build the tiny router prompt. Minimal context, no skill definitions."""
    ctx = {
        "environment": context_envelope.ui.active_environment_name or "",
        "page_entity_type": context_envelope.ui.page_entity_type or "",
        "page_entity_name": context_envelope.ui.page_entity_name or "",
        "scope_type": resolved_scope.resolved_scope_type or "",
        "entity_type": resolved_scope.entity_type or "",
        "entity_name": resolved_scope.entity_name or "",
    }
    user = json.dumps({"message": message, "context": ctx}, ensure_ascii=True)
    return [
        {"role": "system", "content": _ROUTER_SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def _router_params(
    *,
    message: str,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
    max_tokens: int,
) -> dict[str, Any]:
    params = sanitize_params(
        OPENAI_CHAT_MODEL_DISPATCH,
        messages=_router_messages(
            message=message,
            context_envelope=context_envelope,
            resolved_scope=resolved_scope,
        ),
        max_tokens=max_tokens,
        reasoning_effort="low",
        stream=False,
        temperature=0,
    )
    params["response_format"] = _ROUTER_SCHEMA
    params["seed"] = 7
    return params


def _parse_router_intent(payload: str) -> RouterIntent:
    """Parse strict JSON from the router model into a RouterIntent."""
    text = (payload or "").strip()
    if not text:
        raise DispatchModelFailure("router_empty_output")
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.DOTALL)
    data = json.loads(text)
    return RouterIntent(
        environment=data.get("environment", "unknown"),
        entity_type=data.get("entity_type", "unknown"),
        entity_name=data.get("entity_name"),
        action=data.get("action", "unknown"),
        metric=data.get("metric", "none"),
        timeframe_type=data.get("timeframe_type", "none"),
        timeframe_value=data.get("timeframe_value"),
        needs_clarification=data.get("needs_clarification", False),
        clarification_field=data.get("clarification_field", "none"),
        confidence=float(data.get("confidence", 0.5)),
    )


async def _model_dispatch(
    *,
    message: str,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
    context: ContextReceipt,
    visible_context_shortcut: bool,
) -> tuple[RouterIntent, list[str]]:
    """Call the tiny router model and parse a RouterIntent."""
    client = get_instrumented_client()
    retry_notes: list[str] = []
    last_failure: str | None = None
    for idx, max_tokens in enumerate((220, 360)):
        params = _router_params(
            message=message,
            context_envelope=context_envelope,
            resolved_scope=resolved_scope,
            max_tokens=max_tokens,
        )
        completion = await client.chat.completions.create(**params)
        if not completion.choices:
            last_failure = "router_no_choices"
        else:
            choice = completion.choices[0]
            content = _flatten_content(choice.message.content)
            finish_reason = str(getattr(choice, "finish_reason", "") or "").lower()
            if not (content or "").strip():
                last_failure = "router_truncated" if finish_reason == "length" else "router_empty_output"
            else:
                try:
                    intent = _parse_router_intent(content)
                except DispatchModelFailure as exc:
                    last_failure = exc.reason
                except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                    last_failure = "router_invalid_json"
                else:
                    if idx > 0 and retry_notes:
                        retry_notes.append(f"router_retry_succeeded_after:{last_failure or 'unknown'}")
                    return intent, retry_notes

        if idx == 0 and last_failure:
            retry_notes.append(f"router_retry_after:{last_failure}")
            continue
        raise DispatchModelFailure(last_failure or "router_invalid_response")

    raise DispatchModelFailure(last_failure or "router_invalid_response")


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
    proposal: RouterIntent | None,
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

    # ── RouterIntent path (new closed-enum router) ────────────────────
    if isinstance(proposal, RouterIntent):
        if proposal.confidence < OPENAI_DISPATCH_CONFIDENCE_THRESHOLD:
            # Low confidence: use lookup_entity as safe default instead of
            # falling back to the legacy regex system (which is less reliable
            # than even a low-confidence model output).
            notes.append("low_confidence_router_safe_default")
            return DispatchTrace(
                raw=None,
                normalized=DispatchDecision(
                    source=DispatchSource.MODEL,
                    skill_id="lookup_entity",
                    lane=Lane.B_LOOKUP,
                    needs_retrieval=True,
                    write_intent=False,
                    ambiguity_level=DispatchAmbiguity.HIGH,
                    confidence=round(proposal.confidence, 2),
                    fallback_used=False,
                    notes=notes + [f"router:{proposal.entity_type}/{proposal.action}"],
                ),
            )

        skill_id, lane, needs_retrieval, write_intent = _map_intent_to_skill(proposal)
        notes.append(f"router:{proposal.entity_type}/{proposal.action}")
        if proposal.entity_name:
            notes.append(f"entity_name:{proposal.entity_name}")
        if proposal.metric and proposal.metric != "none":
            notes.append(f"metric:{proposal.metric}")

        normalized = DispatchDecision(
            source=DispatchSource.MODEL,
            skill_id=skill_id,
            lane=lane,
            needs_retrieval=needs_retrieval,
            write_intent=write_intent,
            ambiguity_level=DispatchAmbiguity.HIGH if proposal.needs_clarification else DispatchAmbiguity.LOW,
            confidence=round(proposal.confidence, 2),
            fallback_used=False,
            notes=notes,
        )
        return DispatchTrace(raw=None, normalized=normalized)

    # If we reach here, proposal is an unexpected type — fall back safely
    notes.append("unexpected_proposal_type")
    return _fallback_trace(
        fallback_route=fallback_route,
        fallback_skill=fallback_skill,
        reason="unexpected_proposal_type",
    )


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

    proposal: RouterIntent | None = None
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
