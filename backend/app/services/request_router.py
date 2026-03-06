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
_ANALYTICAL_RE = re.compile(
    r"\b(compare|analyze|trend|forecast|scenario|irr|tvpi|dpi|waterfall|attribution|benchmark|correlation)\b",
    re.IGNORECASE,
)
_DEEP_RE = re.compile(
    r"\b(dashboard|build|create|generate report|root cause|explain why|deep dive|monte carlo)\b",
    re.IGNORECASE,
)
_RAG_HINT_RE = re.compile(
    r"\b(document|memo|report|filing|agreement|lease|lpa|ppm|prospectus|search|find.*in)\b",
    re.IGNORECASE,
)
_WRITE_RE = re.compile(
    r"\b(create|add a new|set up a|register a|insert a)\b[\s\w]{0,40}\b(fund|deal|investment|asset|property)\b",
    re.IGNORECASE,
)
# Exclude analytical/navigational queries that happen to contain write-like keywords
_WRITE_EXCLUDE_RE = re.compile(
    r"\b(compare|analyze|show|list|what|how|tell me|describe|explain|summarize)\b",
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
            history_max_tokens=1500,
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
        )

    # Simple list with visible data already present → Lane A
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
                )

    # Simple lookup → Lane B (1 tool round, no RAG)
    if _SIMPLE_LOOKUP_RE.search(message):
        return RouteDecision(
            lane="B",
            skip_rag=True,
            skip_tools=False,
            max_tool_rounds=1,
            max_tokens=1024,
            temperature=0.2,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=3,
            rag_max_tokens=800,
            history_max_tokens=1500,
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
        )

    # Short messages (< 60 chars) without analytical keywords → Lane B
    if len(message.strip()) < 60:
        return RouteDecision(
            lane="B",
            skip_rag=True,
            skip_tools=False,
            max_tool_rounds=2,
            max_tokens=1024,
            temperature=0.2,
            model=OPENAI_CHAT_MODEL_FAST,
            rag_top_k=3,
            rag_max_tokens=800,
            history_max_tokens=1500,
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
    )
