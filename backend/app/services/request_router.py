"""Request router — classifies incoming Winston requests into latency lanes.

Lane A: UI-known answer (< 1s target) — no LLM or tiny formatting pass
Lane B: Quick tool-backed (2-4s) — 1 tool round, no RAG
Lane C: Analytical (4-8s) — multi-tool, RAG, SQL
Lane D: Deep reasoning (8-20s) — complex synthesis, dashboards
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from app.config import (
    OPENAI_CHAT_MODEL_FAST,
    OPENAI_CHAT_MODEL_STANDARD,
    OPENAI_CHAT_MODEL_REASONING,
    OPENAI_CHAT_MODEL_AGENTIC,
)
from app.schemas.ai_gateway import AssistantContextEnvelope, ResolvedAssistantScope


@dataclass(frozen=True)
class RouteDecision:
    lane: str  # "A", "B", "C", "D"
    skip_rag: bool
    skip_tools: bool
    max_tool_rounds: int
    max_tokens: int
    temperature: float
    is_write: bool = False
    model: str = ""
    rag_top_k: int = 5
    rag_max_tokens: int = 2400
    history_max_tokens: int = 2000
    use_rerank: bool = False
    use_hybrid: bool = False
    # GPT-5 era fields
    reasoning_effort: str | None = None  # "low" | "medium" | "high"
    needs_verification: bool = False
    needs_query_expansion: bool = False
    needs_structured_retrieval: bool = False
    needs_agentic_executor: bool = False
    # Latency audit fields
    rag_min_score: float = 0.30  # per-lane score threshold
    matched_pattern: str = ""  # which regex pattern matched (for routing audit)


# ── Pattern matchers ─────────────────────────────────────────────────────────

_IDENTITY_RE = re.compile(
    r"\b(what|which|where)\b.*\b(environment|env|page|workspace|module|schema|industry|am i)\b",
    re.IGNORECASE,
)
_SIMPLE_LIST_RE = re.compile(
    r"\b(list|show|which|what are)\b.*\b(funds?|assets?|investments?|deals?|models?|pipeline)\b",
    re.IGNORECASE,
)
_COUNT_RE = re.compile(
    r"\b(how many|count|number of|total)\b.*\b(funds?|assets?|investments?|deals?|models?)\b",
    re.IGNORECASE,
)
_SIMPLE_LOOKUP_RE = re.compile(
    r"\b(get|show|tell|what)\b.*\b(fund|asset|investment|deal|snapshot|overview|summary)\b",
    re.IGNORECASE,
)
# Exclude document-seeking language from simple lookup → should go to Lane C with RAG
_SIMPLE_LOOKUP_EXCLUDE_RE = re.compile(
    r"\b(thesis|memo|analysis|agreement|lease|lpa|ppm|report|document|filing|prospectus)\b",
    re.IGNORECASE,
)
_ANALYTICAL_RE = re.compile(
    r"\b(compare|analyze|trend|forecast|scenario|irr|tvpi|dpi|waterfall|attribution|benchmark|correlation)\b",
    re.IGNORECASE,
)
_LP_SUMMARY_RE = re.compile(
    r"\b(generate|draft|prepare)?\s*(an?\s+)?(lp summary|lp report|investor update|investor summary|quarterly letter)\b|"
    r"\b(capital call|distribution notice)\b",
    re.IGNORECASE,
)
_DEBT_WATCH_RE = re.compile(
    r"\b(debt watch|watchlist|lender update|debt changes?)\b",
    re.IGNORECASE,
)
_SOURCE_AUDIT_RE = re.compile(
    r"\b(what data is this based on|what is this based on|what data did you use|what source(?:s)? did you use|"
    r"exact data source|data source|what tool did you use|which tool did you use|why did you answer that|"
    r"justify|justification)\b",
    re.IGNORECASE,
)
_RECENCY_RE = re.compile(r"\b(latest|recent|current|today)\b", re.IGNORECASE)
_DEEP_RE = re.compile(
    r"\b(dashboard|build|create|generate report|root cause|explain why|deep dive|monte carlo)\b",
    re.IGNORECASE,
)
_RAG_HINT_RE = re.compile(
    r"\b(document|memo|report|filing|agreement|lease|lpa|ppm|prospectus|search|find.*in)\b",
    re.IGNORECASE,
)
_WRITE_RE = re.compile(
    r"\b(create|add|make|set up|register|insert|establish|build)\b[\s\w]{0,40}\b(fund|deal|investment|asset|property)\b|"
    r"\bnew\s+(fund|deal|investment|asset|property)\b",
    re.IGNORECASE,
)
# Exclude ONLY when the primary verb is analytical — not when write verb appears first
_WRITE_EXCLUDE_RE = re.compile(
    r"^\s*(compare|analyze|list|describe|explain|summarize|how (?:many|much|does|do|is|are))\b",
    re.IGNORECASE,
)
# Financial metrics → structured retrieval
_FINANCIAL_METRICS_RE = re.compile(
    r"\b(irr|tvpi|dpi|dscr|cap\s*rate|noi|occupancy|yield|leverage|ltv|debt\s*service)\b",
    re.IGNORECASE,
)
# Vague/broad queries → query expansion
_VAGUE_QUERY_RE = re.compile(
    r"\b(how are we doing|what changed|what.s (new|happening)|pressure points|what.s hurting|"
    r"give me an? (update|overview|summary)|status update|key (issues|risks|concerns))\b",
    re.IGNORECASE,
)
# Agentic tasks → agentic executor
_AGENTIC_RE = re.compile(
    r"\b(debug|inspect|implement|patch|fix the code|edit the|refactor|plan and execute|"
    r"step.by.step|multi.step|chain together)\b",
    re.IGNORECASE,
)
# REPE scenario queries → Lane B (tool-backed, fast) — also handled by fast-path
_REPE_SCENARIO_RE = re.compile(
    r"\b(sell|exit|disposition|sale\s*scenario|waterfall|stress|what\s*if)\b.*\b(cap\s*rate|irr|tvpi|noi|nav|fund|impact)\b|"
    r"\b(cap\s*rate|irr|tvpi|noi|nav|fund|impact)\b.*\b(sell|exit|disposition|sale\s*scenario|waterfall|stress|what\s*if)\b",
    re.IGNORECASE,
)
# Credit decisioning write patterns → Lane C (deterministic, tools + RAG)
_CREDIT_WRITE_RE = re.compile(
    r"\b(create|add|evaluate|ingest|resolve|run)\b[\s\w]{0,40}\b(portfolio|loan|borrower|policy|corpus|exception|decisioning)\b|"
    r"\bnew\s+(portfolio|loan|policy|borrower)\b|"
    r"\b(approve|decline)\b",
    re.IGNORECASE,
)
# Credit policy / corpus queries → Lane C with RAG
_CREDIT_POLICY_RE = re.compile(
    r"\b(what does the policy say|underwriting criteria|credit policy|regulatory|compliance|"
    r"adverse action|what are the rules for|exception handling|SLA|"
    r"fico|dti|ltv|delinquency|charge.off|prepayment)\b",
    re.IGNORECASE,
)


def classify_request(
    *,
    message: str,
    context_envelope: AssistantContextEnvelope,
    resolved_scope: ResolvedAssistantScope,
    visible_context_shortcut: bool,
) -> RouteDecision:
    """Classify a request into a latency lane."""

    # Pre-compute task-shape signals
    has_financial_metrics = bool(_FINANCIAL_METRICS_RE.search(message))
    is_vague = bool(_VAGUE_QUERY_RE.search(message))
    is_agentic = bool(_AGENTIC_RE.search(message))

    # If visible-context policy already said tools are disabled, it's Lane A
    if visible_context_shortcut:
        return RouteDecision(
            lane="A",
            skip_rag=True,
            skip_tools=True,
            max_tool_rounds=0,
            max_tokens=512,
            temperature=0.1,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=0,
            rag_max_tokens=0,
            history_max_tokens=800,
            matched_pattern="visible_context_shortcut",
        )

    # Identity queries
    if _IDENTITY_RE.search(message):
        return RouteDecision(
            lane="A",
            skip_rag=True,
            skip_tools=True,
            max_tool_rounds=0,
            max_tokens=256,
            temperature=0.1,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=0,
            rag_max_tokens=0,
            history_max_tokens=800,
            matched_pattern="identity",
        )

    # Count queries with visible data
    visible_data = context_envelope.ui.visible_data
    if _COUNT_RE.search(message) and visible_data:
        has_data = (
            visible_data.funds or visible_data.assets or
            visible_data.investments or visible_data.models
        )
        if has_data:
            return RouteDecision(
                lane="A",
                skip_rag=True,
                skip_tools=True,
                max_tool_rounds=0,
                max_tokens=256,
                temperature=0.1,
                model=OPENAI_CHAT_MODEL_FAST,
                rag_top_k=0,
                rag_max_tokens=0,
                history_max_tokens=800,
                matched_pattern="count_visible",
            )

    # Write/mutation requests → Lane C (multi-tool for confirmation flow)
    if _WRITE_RE.search(message) and not _WRITE_EXCLUDE_RE.search(message):
        return RouteDecision(
            lane="C",
            skip_rag=True,
            skip_tools=False,
            max_tool_rounds=3,
            max_tokens=1024,
            temperature=0.2,
            is_write=True,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=0,
            rag_max_tokens=0,
            history_max_tokens=2000,
            matched_pattern="write",
        )

    # Agentic tasks → Lane D with agentic model
    if is_agentic:
        return RouteDecision(
            lane="D",
            skip_rag=True,
            skip_tools=False,
            max_tool_rounds=8,
            max_tokens=2048,
            temperature=0.2,
            model=OPENAI_CHAT_MODEL_AGENTIC,
            rag_top_k=5,
            rag_max_tokens=2000,
            history_max_tokens=4000,
            reasoning_effort="high",
            needs_agentic_executor=True,
            rag_min_score=0.25,
            matched_pattern="agentic",
        )

    # Deep reasoning
    if _DEEP_RE.search(message):
        needs_rag = bool(_RAG_HINT_RE.search(message))
        return RouteDecision(
            lane="D",
            skip_rag=not needs_rag,
            skip_tools=False,
            max_tool_rounds=5,
            max_tokens=2048,
            temperature=0.3,
            model=OPENAI_CHAT_MODEL_REASONING,
            rag_top_k=8,
            rag_max_tokens=3000,
            history_max_tokens=4000,
            use_rerank=True,
            use_hybrid=True,
            reasoning_effort="high",
            needs_verification=True,
            needs_query_expansion=is_vague,
            needs_structured_retrieval=has_financial_metrics,
            rag_min_score=0.25,
            matched_pattern="deep",
        )

    # REPE scenario queries → Lane B (fast, 2 tool rounds)
    # These are also handled by the REPE fast-path in ai_gateway.py, but this
    # ensures proper routing if the fast-path confidence is below threshold.
    if _REPE_SCENARIO_RE.search(message):
        return RouteDecision(
            lane="B",
            skip_rag=True,
            skip_tools=False,
            max_tool_rounds=2,
            max_tokens=1024,
            temperature=0.1,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=0,
            rag_max_tokens=0,
            history_max_tokens=1500,
            needs_structured_retrieval=True,
            rag_min_score=0.40,
            matched_pattern="repe_scenario",
        )

    # Credit write requests → Lane C (deterministic, tools enabled)
    if _CREDIT_WRITE_RE.search(message) and not _WRITE_EXCLUDE_RE.search(message):
        return RouteDecision(
            lane="C",
            skip_rag=False,
            skip_tools=False,
            max_tool_rounds=3,
            max_tokens=2048,
            temperature=0.0,
            is_write=True,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=3,
            rag_max_tokens=1500,
            history_max_tokens=2000,
            matched_pattern="credit_write",
        )

    # Credit policy / corpus queries → Lane C with RAG (walled garden)
    if _CREDIT_POLICY_RE.search(message):
        return RouteDecision(
            lane="C",
            skip_rag=False,
            skip_tools=False,
            max_tool_rounds=2,
            max_tokens=1536,
            temperature=0.0,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=5,
            rag_max_tokens=2000,
            history_max_tokens=2000,
            matched_pattern="credit_policy",
        )

    if _LP_SUMMARY_RE.search(message):
        return RouteDecision(
            lane="C",
            skip_rag=False,
            skip_tools=False,
            max_tool_rounds=3,
            max_tokens=2048,
            temperature=0.1,
            model=OPENAI_CHAT_MODEL_STANDARD,
            rag_top_k=6,
            rag_max_tokens=2200,
            history_max_tokens=3000,
            use_rerank=True,
            use_hybrid=True,
            reasoning_effort="medium",
            needs_verification=True,
            matched_pattern="lp_summary",
        )

    if _DEBT_WATCH_RE.search(message) and (_RECENCY_RE.search(message) or "summar" in message.lower()):
        return RouteDecision(
            lane="C",
            skip_rag=False,
            skip_tools=False,
            max_tool_rounds=2,
            max_tokens=1536,
            temperature=0.1,
            model=OPENAI_CHAT_MODEL_STANDARD,
            rag_top_k=5,
            rag_max_tokens=2000,
            history_max_tokens=2500,
            use_rerank=True,
            use_hybrid=True,
            reasoning_effort="medium",
            needs_verification=True,
            matched_pattern="debt_watch",
        )

    if _SOURCE_AUDIT_RE.search(message):
        return RouteDecision(
            lane="C",
            skip_rag=False,
            skip_tools=False,
            max_tool_rounds=2,
            max_tokens=1536,
            temperature=0.0,
            model=OPENAI_CHAT_MODEL_STANDARD,
            rag_top_k=5,
            rag_max_tokens=1800,
            history_max_tokens=2500,
            use_rerank=True,
            use_hybrid=True,
            reasoning_effort="medium",
            needs_verification=True,
            matched_pattern="source_audit",
        )

    # Analytical
    if _ANALYTICAL_RE.search(message):
        needs_rag = bool(_RAG_HINT_RE.search(message))
        return RouteDecision(
            lane="C",
            skip_rag=not needs_rag,
            skip_tools=False,
            max_tool_rounds=3,
            max_tokens=2048,
            temperature=0.2,
            model=OPENAI_CHAT_MODEL_STANDARD,
            rag_top_k=5,
            rag_max_tokens=2000,
            history_max_tokens=3000,
            use_rerank=True,
            use_hybrid=True,
            reasoning_effort="medium",
            needs_verification=True,
            needs_query_expansion=is_vague,
            needs_structured_retrieval=has_financial_metrics,
            matched_pattern="analytical",
        )

    # Simple list with visible data → Lane B (tool-backed) so Winston pulls
    # enriched live data instead of restating what's already on screen.
    if _SIMPLE_LIST_RE.search(message) and visible_data:
        for entity_word, records in [
            ("fund", visible_data.funds),
            ("asset", visible_data.assets),
            ("investment", visible_data.investments),
            ("deal", visible_data.investments),
            ("model", visible_data.models),
            ("pipeline", visible_data.pipeline_items),
        ]:
            if records and entity_word in message.lower():
                return RouteDecision(
                    lane="B",
                    skip_rag=True,
                    skip_tools=False,
                    max_tool_rounds=2,
                    max_tokens=2048,
                    temperature=0.2,
                    model=OPENAI_CHAT_MODEL_FAST,
                    rag_top_k=0,
                    rag_max_tokens=0,
                    history_max_tokens=1500,
                    rag_min_score=0.40,
                    matched_pattern="simple_list_visible",
                )

    # Simple lookup → Lane B (2 tool rounds, no RAG)
    # Exclude document-seeking queries which need RAG (Lane C)
    if _SIMPLE_LOOKUP_RE.search(message) and not _SIMPLE_LOOKUP_EXCLUDE_RE.search(message):
        return RouteDecision(
            lane="B",
            skip_rag=True,
            skip_tools=False,
            max_tool_rounds=2,
            max_tokens=2048,
            temperature=0.2,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=3,
            rag_max_tokens=800,
            history_max_tokens=1500,
            rag_min_score=0.40,
            matched_pattern="simple_lookup",
        )

    # Document/RAG hints → Lane C with RAG
    if _RAG_HINT_RE.search(message):
        return RouteDecision(
            lane="C",
            skip_rag=False,
            skip_tools=False,
            max_tool_rounds=3,
            max_tokens=2048,
            temperature=0.2,
            model=OPENAI_CHAT_MODEL_STANDARD,
            rag_top_k=5,
            rag_max_tokens=2000,
            history_max_tokens=3000,
            use_rerank=True,
            use_hybrid=True,
            reasoning_effort="medium",
            needs_verification=True,
            needs_query_expansion=is_vague,
            matched_pattern="rag_hint",
        )

    # Short messages (< 60 chars) without analytical keywords → Lane B
    if len(message.strip()) < 60:
        return RouteDecision(
            lane="B",
            skip_rag=True,
            skip_tools=False,
            max_tool_rounds=2,
            max_tokens=2048,
            temperature=0.2,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=3,
            rag_max_tokens=800,
            history_max_tokens=1500,
            rag_min_score=0.40,
            matched_pattern="short_message",
        )

    # Default → Lane C
    return RouteDecision(
        lane="C",
        skip_rag=False,
        skip_tools=False,
        max_tool_rounds=3,
        max_tokens=2048,
        temperature=0.2,
        model=OPENAI_CHAT_MODEL_STANDARD,
        rag_top_k=5,
        rag_max_tokens=2000,
        history_max_tokens=3000,
        use_rerank=True,
        use_hybrid=True,
        reasoning_effort="medium",
        needs_verification=True,
        needs_query_expansion=is_vague,
        needs_structured_retrieval=has_financial_metrics,
        matched_pattern="default",
    )
