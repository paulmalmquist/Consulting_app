from __future__ import annotations

import re

from app.assistant_runtime.turn_receipts import (
    ConfirmationMode,
    RetrievalPolicy,
    SkillDefinition,
)


SKILLS: tuple[SkillDefinition, ...] = (
    SkillDefinition(
        id="lookup_entity",
        description="Look up current environment, entity, or operational facts.",
        triggers=[
            "list",
            "show",
            "which",
            "what environment",
            "what page",
            "which fund",
            "which funds",
            "how many",
            "count",
            "status",
            "who",
            "what can you",
            "help me",
            "capabilities",
            "what do you",
        ],
        capability_tags=["lookup", "read"],
        allowed_tool_tags=["core", "meta", "repe", "finance", "env", "business", "document", "resume", "crm", "novendor"],
        retrieval_policy=RetrievalPolicy.LIGHT,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "citations", "tool_activity"],
        preferred_loop_pattern="investigate",
        max_tool_calls=3,
    ),
    SkillDefinition(
        id="explain_metric",
        description="Explain a metric, definition, or focused data point.",
        triggers=[
            "explain",
            "what is",
            "what does",
            "meaning of",
            "metric",
            "irr",
            "tvpi",
            "dpi",
            "noi",
            "dscr",
            "ltv",
        ],
        capability_tags=["lookup", "analysis"],
        allowed_tool_tags=["repe", "finance", "analysis", "document", "credit", "resume", "sql_agent"],
        retrieval_policy=RetrievalPolicy.LIGHT,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "citations"],
        preferred_loop_pattern="investigate",
        max_tool_calls=3,
    ),
    SkillDefinition(
        id="run_analysis",
        description="Run comparative or analytical work that may need retrieval and tools.",
        triggers=[
            "analyze",
            "analysis",
            "compare",
            "trend",
            "forecast",
            "scenario",
            "deep dive",
            "why",
            "correlation",
            "benchmark",
            "report",
            "thesis",
            "memo",
        ],
        capability_tags=["analysis"],
        allowed_tool_tags=["repe", "analysis", "finance", "document", "report", "workflow", "ops", "platform", "credit", "sql_agent", "crm", "novendor"],
        retrieval_policy=RetrievalPolicy.FULL,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "citations", "workflow_result"],
        preferred_loop_pattern="analyze",
        requires_grounding=True,
        max_tool_calls=5,
    ),
    SkillDefinition(
        id="generate_lp_summary",
        description="Generate LP or investor-facing summaries and reports.",
        triggers=[
            "lp summary",
            "lp report",
            "investor update",
            "investor summary",
            "capital call",
            "distribution",
            "quarterly letter",
        ],
        capability_tags=["analysis", "reporting"],
        allowed_tool_tags=["report", "investor", "finance", "ir", "repe", "document"],
        retrieval_policy=RetrievalPolicy.FULL,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "workflow_result", "citations"],
        preferred_loop_pattern="analyze",
        requires_grounding=True,
        max_tool_calls=5,
    ),
    SkillDefinition(
        id="create_entity",
        description="Create or mutate an entity or workflow record with confirmation.",
        triggers=[
            "create",
            "add",
            "make",
            "register",
            "insert",
            "new fund",
            "new deal",
            "new asset",
            "set up",
            "update",
            "delete",
        ],
        capability_tags=["write"],
        allowed_tool_tags=["write", "core", "platform", "business", "env", "crm", "credit", "work", "document", "novendor"],
        retrieval_policy=RetrievalPolicy.NONE,
        confirmation_mode=ConfirmationMode.REQUIRED,
        response_blocks=["markdown_text", "confirmation", "error"],
        preferred_loop_pattern="execute",
        max_tool_calls=2,
    ),
)

SKILL_BY_ID = {skill.id: skill for skill in SKILLS}

_GROUNDED_CONTEXT_RE = re.compile(
    r"\b("
    r"variance|underwriting|occupancy|debt watch|watchlist|lender|debt risk|risk|noi|irr|tvpi|dpi|dscr|ltv|"
    r"blank|down vs|why is|latest|today|"
    r"changes|source|basis|based on|summary|lp summary"
    r")\b",
    re.IGNORECASE,
)


def skill_requires_grounding(skill_id: str | None, *, message: str | None = None) -> bool:
    if not skill_id:
        return False
    skill = SKILL_BY_ID.get(skill_id)
    if skill is None:
        return False
    if skill.retrieval_policy == RetrievalPolicy.FULL:
        return True
    if skill.retrieval_policy == RetrievalPolicy.NONE:
        return False
    if skill_id in {"lookup_entity", "explain_metric"}:
        return bool(_GROUNDED_CONTEXT_RE.search(message or ""))
    return False


def validate_skill_registry() -> None:
    seen: set[str] = set()
    for skill in SKILLS:
        if skill.id in seen:
            raise ValueError(f"Duplicate skill id: {skill.id}")
        seen.add(skill.id)
        if not skill.triggers:
            raise ValueError(f"Skill {skill.id} must declare at least one trigger")
        if not skill.allowed_tool_tags:
            raise ValueError(f"Skill {skill.id} must declare allowed_tool_tags")
