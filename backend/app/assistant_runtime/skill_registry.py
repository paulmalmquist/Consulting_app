from __future__ import annotations

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
        description="Explain a single metric value, definition, or focused data point lookup.",
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
            "show me",
            "current",
            "cap rate",
            "occupancy",
        ],
        capability_tags=["lookup", "analysis"],
        allowed_tool_tags=["repe", "finance", "analysis", "document", "credit", "resume", "sql_agent", "metrics"],
        retrieval_policy=RetrievalPolicy.LIGHT,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "citations"],
        preferred_loop_pattern="investigate",
        max_tool_calls=3,
    ),
    SkillDefinition(
        id="rank_metric",
        description="Rank or compare multiple entities by a metric (best, worst, top N).",
        triggers=[
            "best",
            "worst",
            "top",
            "bottom",
            "rank",
            "ranking",
            "compare all",
            "highest",
            "lowest",
            "performing",
            "underperforming",
            "outperforming",
            "sort by",
            "order by",
            "leaderboard",
        ],
        capability_tags=["analysis"],
        allowed_tool_tags=["repe", "finance", "analysis", "sql_agent", "metrics"],
        retrieval_policy=RetrievalPolicy.FULL,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "citations", "workflow_result"],
        preferred_loop_pattern="analyze",
        requires_grounding=True,
        max_tool_calls=5,
    ),
    SkillDefinition(
        id="trend_metric",
        description="Show metric trend over time, time-series, or period-over-period change.",
        triggers=[
            "trend",
            "over time",
            "trailing",
            "ttm",
            "ltm",
            "quarterly trend",
            "monthly trend",
            "year over year",
            "yoy",
            "period",
            "historical",
            "time series",
            "past",
            "last 12",
        ],
        capability_tags=["analysis"],
        allowed_tool_tags=["repe", "finance", "analysis", "sql_agent", "metrics"],
        retrieval_policy=RetrievalPolicy.FULL,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "citations", "workflow_result"],
        preferred_loop_pattern="analyze",
        requires_grounding=True,
        max_tool_calls=5,
    ),
    SkillDefinition(
        id="explain_metric_variance",
        description="Explain variance, deviation from underwriting, plan, or budget.",
        triggers=[
            "variance",
            "underwriting",
            "down vs",
            "why is",
            "vs plan",
            "vs budget",
            "deviation",
            "shortfall",
            "miss",
            "gap",
            "below plan",
            "above plan",
            "off track",
        ],
        capability_tags=["analysis"],
        allowed_tool_tags=["repe", "finance", "analysis", "document", "sql_agent"],
        retrieval_policy=RetrievalPolicy.FULL,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "citations", "workflow_result"],
        preferred_loop_pattern="analyze",
        requires_grounding=True,
        max_tool_calls=5,
    ),
    SkillDefinition(
        id="compare_entities",
        description="Head-to-head comparison of two or more named entities.",
        triggers=[
            "compare",
            "vs",
            "versus",
            "head to head",
            "side by side",
            "how does",
            "difference between",
            "stack up",
        ],
        capability_tags=["analysis"],
        allowed_tool_tags=["repe", "finance", "analysis", "document", "sql_agent"],
        retrieval_policy=RetrievalPolicy.FULL,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "citations", "workflow_result"],
        preferred_loop_pattern="analyze",
        requires_grounding=True,
        max_tool_calls=5,
    ),
    SkillDefinition(
        id="run_analysis",
        description="Run general analytical work — forecasts, scenarios, deep dives, reports.",
        triggers=[
            "analyze",
            "analysis",
            "forecast",
            "scenario",
            "deep dive",
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
        id="fund_summary",
        description="List and summarize funds in the portfolio — names, strategies, vintages, status.",
        triggers=["summary", "funds", "portfolio", "list funds", "how many funds"],
        capability_tags=["lookup", "read"],
        allowed_tool_tags=["core", "repe", "finance", "metrics"],
        retrieval_policy=RetrievalPolicy.LIGHT,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "table", "kpi_group"],
        preferred_loop_pattern="investigate",
        max_tool_calls=2,
    ),
    SkillDefinition(
        id="fund_holdings",
        description="Show assets, investments, and properties under a specific fund.",
        triggers=["holdings", "breakdown", "portfolio breakdown", "what does it own", "assets in fund"],
        capability_tags=["lookup", "read"],
        allowed_tool_tags=["core", "repe", "finance", "metrics"],
        retrieval_policy=RetrievalPolicy.FULL,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "table", "citations"],
        preferred_loop_pattern="investigate",
        requires_grounding=True,
        max_tool_calls=3,
    ),
    SkillDefinition(
        id="resume_qa",
        description="Answer career, resume, and biographical questions using RAG narrative documents.",
        triggers=["resume", "career", "experience", "when did paul", "kayne anderson", "jll", "novendor"],
        capability_tags=["lookup", "read"],
        allowed_tool_tags=["resume", "document"],
        retrieval_policy=RetrievalPolicy.FULL,
        confirmation_mode=ConfirmationMode.NONE,
        response_blocks=["markdown_text", "citations"],
        preferred_loop_pattern="investigate",
        requires_grounding=True,
        max_tool_calls=3,
    ),
    SkillDefinition(
        id="draft_email",
        description="Draft an outreach or employer email for review before sending.",
        triggers=["draft email", "outreach", "email employer", "send email"],
        capability_tags=["write"],
        allowed_tool_tags=["resume", "write", "novendor"],
        retrieval_policy=RetrievalPolicy.NONE,
        confirmation_mode=ConfirmationMode.REQUIRED,
        response_blocks=["markdown_text", "confirmation"],
        preferred_loop_pattern="execute",
        max_tool_calls=2,
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

# Descriptions map — used by the tiny router model to understand what each skill does.
# This replaces the trigger-matching approach with LLM-driven classification.
SKILL_DESCRIPTIONS = {skill.id: skill.description for skill in SKILLS}


def skill_requires_grounding(skill_id: str | None, *, message: str | None = None) -> bool:
    """Determine if a skill requires RAG grounding before tool execution.

    Explicit requires_grounding on the SkillDefinition always wins.
    If not set, falls back to retrieval_policy:
      FULL → always grounded (analytical/comparison skills with no tool fallback)
      NONE → never grounded (write actions, confirmations)
      LIGHT → not grounded by default — tool-capable skills fetch their own data;
              explicit requires_grounding=True opts individual skills back in.
    """
    if not skill_id:
        return False
    skill = SKILL_BY_ID.get(skill_id)
    if skill is None:
        return False
    # Explicit field wins over policy inference
    if skill.requires_grounding is not None:
        return skill.requires_grounding
    if skill.retrieval_policy == RetrievalPolicy.FULL:
        return True
    if skill.retrieval_policy == RetrievalPolicy.NONE:
        return False
    # LIGHT: tool-capable skills handle their own data — don't block on empty RAG
    return False


def validate_skill_registry() -> None:
    seen: set[str] = set()
    for skill in SKILLS:
        if skill.id in seen:
            raise ValueError(f"Duplicate skill id: {skill.id}")
        seen.add(skill.id)
        if not skill.allowed_tool_tags:
            raise ValueError(f"Skill {skill.id} must declare allowed_tool_tags")
