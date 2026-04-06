from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

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
    r"\b(?:create|add|make|set up|register|new)\s+(?:a\s+|an\s+)?(?:fund|deal|asset|property|investment|"
    r"account|opportunity|lead|activity|contact|engagement|proposal)\b",
    re.IGNORECASE,
)
_DEBT_RISK_RE = re.compile(r"\b(debt risk|debt watch|watchlist)\b", re.IGNORECASE)

# ── Fund/portfolio summary guardrail ─────────────────────────────────
_FUND_SUMMARY_RE = re.compile(
    r"\b(?:(?:summary|overview|snapshot|list|show)\s+(?:of\s+)?(?:the\s+)?(?:funds?|portfolio)|"
    r"(?:funds?|portfolio)\s+(?:summary|overview|snapshot|list)|"
    r"(?:list|show|give)\s+(?:me\s+)?(?:the\s+)?(?:all\s+)?funds?|"
    r"how\s+many\s+funds?|what\s+funds?)\b",
    re.IGNORECASE,
)

# ── Fund holdings / portfolio breakdown guardrail ────────────────────
# Must not match "portfolio strategy" or "portfolio performance" (analysis queries).
# Only matches holdings-specific phrases.
_FUND_HOLDINGS_RE = re.compile(
    r"\b(?:holdings?|"
    r"(?:current\s+)?(?:portfolio|assets)\s+(?:breakdown|composition|allocation)|"
    r"breakdown\s+(?:of\s+)?(?:current\s+)?(?:holdings?|portfolio|assets)|"
    r"what\s+(?:does\s+(?:it|this|this\s+fund|the\s+fund)\s+)?own|"
    r"(?:show|list|give)\s+(?:me\s+)?(?:the\s+)?(?:holdings?|assets\s+in)|"
    r"assets?\s+(?:in\s+)?(?:this|the)\s+fund|"
    r"underlying\s+assets?|"
    r"what\s+(?:assets?|properties)\s+(?:are\s+)?(?:in|under))\b",
    re.IGNORECASE,
)

# ── Fund metrics guardrail ───────────────────────────────────────────
_FUND_METRICS_RE = re.compile(
    r"\b(?:(?:fund|portfolio)\s+metrics|metrics\s+for|"
    r"(?:get|show|what\s+are)\s+(?:the\s+)?(?:fund\s+)?metrics)\b",
    re.IGNORECASE,
)

# ── Resume / biographical guardrail ──────────────────────────────────
_RESUME_QUERY_RE = re.compile(
    r"\b(?:(?:when\s+did|where\s+did|how\s+long)\s+(?:paul|he)|"
    r"(?:paul'?s?|his)\s+(?:experience|career|role|skills?|background|resume|cv|timeline|work)|"
    r"(?:summarize|describe|tell\s+me\s+about|explain)\s+(?:paul'?s?|his|the)\s+(?:experience|career|role|time|work|background)|"
    r"kayne\s+anderson|jll|novendor|jpmc|jp\s*morgan)\b",
    re.IGNORECASE,
)

# ── CRM follow-up / activity guardrail ───────────────────────────────
_CRM_ACTIVITY_RE = re.compile(
    r"\b(?:follow\s*up|next\s+action|pending\s+task|overdue|"
    r"(?:who|what)\s+(?:should\s+)?(?:i|we)\s+(?:follow|reach|contact|call)|"
    r"pipeline\s+(?:summary|scoreboard|status)|"
    r"(?:list|show)\s+(?:my\s+)?(?:leads?|accounts?|opportunities|activities))\b",
    re.IGNORECASE,
)

# ── Per-intent metric regexes (checked in specificity order) ─────────
_RANK_METRIC_RE = re.compile(
    r"\b(best|worst|top\s*\d*|bottom\s*\d*|rank|ranking|highest|lowest|"
    r"(?:best|worst|top|bottom)\s+performing|underperforming|outperforming|"
    r"sort\s+by|order\s+by|leaderboard|compare\s+all)\b",
    re.IGNORECASE,
)
_TREND_METRIC_RE = re.compile(
    r"\b(trend|over\s+time|trailing\s+\d+|ttm|ltm|quarterly\s+trend|monthly\s+trend|"
    r"year\s+over\s+year|yoy|time\s+series|historical|"
    r"past\s+\d+\s+(?:months?|quarters?|years?)|"
    r"last\s+\d+\s+(?:months?|quarters?|years?)|"
    r"last\s+twelve\s+months)\b",
    re.IGNORECASE,
)
_VARIANCE_METRIC_RE = re.compile(
    r"\b(variance|underwriting|down\s+vs|vs\s+plan|vs\s+budget|deviation|shortfall|"
    r"miss(?:ed)?|gap|below\s+plan|above\s+plan|off\s+track|"
    r"why\s+is\s+.*(?:down|low|negative|below|off))\b",
    re.IGNORECASE,
)
_COMPARE_ENTITIES_RE = re.compile(
    r"\b(?:compare\s+\w+\s+(?:to|and|vs|with)\s+\w+|"
    r"\w+\s+vs\.?\s+\w+|"
    r"head\s+to\s+head|side\s+by\s+side|"
    r"how\s+does\s+\w+\s+compare|difference\s+between|stack\s+up)\b",
    re.IGNORECASE,
)
_METRIC_ANOMALY_RE = re.compile(
    r"\b(blank|variance|underwriting|occupancy|noi|down vs|debt risk|debt watch|watchlist|"
    r"irr|tvpi|dpi|dscr|ltv|cap rate|revenue|expenses|ncf)\b",
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
    "search", "draft_email", "unknown",
]
_METRIC_ENUM = ["noi", "irr", "tvpi", "dpi", "nav", "occupancy", "ltv", "dscr", "revenue", "expenses", "ncf", "none"]
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


def _parse_dispatch_payload(payload: str) -> DispatchProposal:
    text = (payload or "").strip()
    if not text:
        raise DispatchModelFailure("dispatcher_empty_output")
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.DOTALL)
    return DispatchProposal.model_validate(json.loads(text))


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


_ROUTER_SYSTEM_PROMPT = (
    "You are a domain intent classifier. Return ONLY JSON matching the schema.\n\n"
    "Valid environments: repe, resume, crm, pds, unknown\n"
    "Valid entity_types: fund, asset, investment, project, account, opportunity, person, unknown\n"
    "Valid actions: summary, detail, holdings, list, rank, metric_lookup, trend, compare, variance, create, update, explain, search, draft_email, unknown\n"
    "Valid metrics: noi, irr, tvpi, dpi, nav, occupancy, ltv, dscr, revenue, expenses, ncf, none\n"
    "Valid timeframe_types: latest, quarter, ttm, ltm, custom, none\n"
    "Valid clarification_fields: entity, metric, timeframe, action, none\n\n"
    "Rules:\n"
    '- "holdings", "breakdown", "what does it own", "assets in fund" → action=holdings\n'
    '- "best/worst/top/rank/performing" → action=rank\n'
    '- "trend/over time/quarterly/historical" → action=trend\n'
    '- "variance/vs budget/underwriting/below plan" → action=variance\n'
    '- "compare X to Y" / "X vs Y" → action=compare\n'
    '- Resume/career/Paul/biography questions → environment=resume, entity_type=person\n'
    "- If entity name is mentioned, extract it into entity_name\n"
    "- Set needs_clarification=true only when a required field cannot be inferred\n"
    "- confidence: 0.9+ if clear, 0.7-0.9 if reasonable, <0.7 if ambiguous"
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
    proposal: DispatchProposal | RouterIntent | None,
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
            notes.append("low_confidence_router")
            return DispatchTrace(
                raw=None,
                normalized=_fallback_trace(
                    fallback_route=fallback_route,
                    fallback_skill=fallback_skill,
                    reason="low_confidence_router",
                ).normalized,
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

    # ── Legacy DispatchProposal path (backward compat) ────────────────
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
    # Fine-grained metric skill normalization — try specific intents first
    if _METRIC_ANOMALY_RE.search(message or "") and skill_id in {None, "lookup_entity", "explain_metric"}:
        if _DEBT_RISK_RE.search(message or ""):
            skill_id = "run_analysis"
        elif _RANK_METRIC_RE.search(message or ""):
            skill_id = "rank_metric"
        elif _VARIANCE_METRIC_RE.search(message or ""):
            skill_id = "explain_metric_variance"
        elif _TREND_METRIC_RE.search(message or ""):
            skill_id = "trend_metric"
        elif _COMPARE_ENTITIES_RE.search(message or ""):
            skill_id = "compare_entities"
        elif re.search(r"\b(why|explain|blank|down vs)\b", message or "", re.IGNORECASE):
            skill_id = "explain_metric"
        else:
            skill_id = "explain_metric"
        notes.append("metric_skill_normalized")
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
    _ANALYSIS_LANE_SKILLS = {"explain_metric", "run_analysis", "generate_lp_summary",
                              "rank_metric", "trend_metric", "explain_metric_variance", "compare_entities"}
    if needs_retrieval and lane == Lane.A_FAST:
        lane = Lane.C_ANALYSIS if skill_id in _ANALYSIS_LANE_SKILLS else Lane.B_LOOKUP
        notes.append("grounded_lane_promoted")
    if skill_id == "generate_lp_summary" and lane in (Lane.A_FAST, Lane.B_LOOKUP):
        lane = Lane.C_ANALYSIS
        needs_retrieval = True
        notes.append("lp_summary_lane_promoted")
    if skill_id in {"run_analysis", "rank_metric", "trend_metric", "explain_metric_variance", "compare_entities"} and lane == Lane.A_FAST:
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
