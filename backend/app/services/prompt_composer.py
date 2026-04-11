"""Unified prompt assembly — single function for all AI pipeline calls.

Every LLM invocation in the platform MUST use `compose_prompt()` to build
the message list.  This ensures consistent prompt structure, token budgets,
context separation (INTERNAL vs USER), and auditability.

Usage:
    messages = compose_prompt(
        system_base=SYSTEM_PROMPT_BASE,
        lane=route.lane,
        context_block=context_block,
        rag_context=rag_context,
        history=history_messages,
        user_message=user_message,
        domain_blocks=domain_blocks,
        mutation_rules=mutation_rules,
        session_context=session_context,
        system_role="system",
    )
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


# ── Token budget per lane ────────────────────────────────────────────
# Each section of the prompt has a max token allocation per lane to
# prevent context overflow and keep costs predictable.

@dataclass(frozen=True)
class LaneBudget:
    """Token budget for each prompt section, keyed by lane."""
    system_max: int = 4000
    context_max: int = 2000
    rag_max: int = 2000
    history_max: int = 2000
    user_max: int = 1000

_LANE_BUDGETS: dict[str, LaneBudget] = {
    "A": LaneBudget(system_max=2000, context_max=1000, rag_max=0, history_max=1000, user_max=500),
    "B": LaneBudget(system_max=4000, context_max=2000, rag_max=2000, history_max=1500, user_max=1000),
    "C": LaneBudget(system_max=4000, context_max=2000, rag_max=3000, history_max=2000, user_max=1000),
    "D": LaneBudget(system_max=6000, context_max=3000, rag_max=4000, history_max=3000, user_max=1500),
}


def _estimate_tokens(text: str) -> int:
    """Approximate token count: ~4 chars per token."""
    return len(text) // 4


def _truncate_to_budget(text: str, max_tokens: int) -> str:
    """Truncate text to fit within token budget."""
    if max_tokens <= 0:
        return ""
    approx = _estimate_tokens(text)
    if approx <= max_tokens:
        return text
    # Truncate at ~4 chars per token boundary
    max_chars = max_tokens * 4
    return text[:max_chars] + "\n\n[...truncated to fit context budget]"


@dataclass
class PromptAudit:
    """Audit record of prompt composition for debugging."""
    lane: str
    system_tokens: int = 0
    context_tokens: int = 0
    rag_tokens: int = 0
    history_tokens: int = 0
    user_tokens: int = 0
    domain_block_tokens: int = 0
    session_context_tokens: int = 0
    total_tokens: int = 0
    domain_blocks_applied: list[str] = field(default_factory=list)
    sections_truncated: list[str] = field(default_factory=list)


@dataclass
class PromptSections:
    """Pre-merge raw section text for receipt capture.

    Populated by ``compose_from_compiled`` alongside the OpenAI message list
    so prompt_receipts can inspect each section independently instead of
    trying to re-parse the merged system blob.
    """
    system_text: str = ""
    skill_instructions_text: str = ""
    thread_goal_text: str = ""
    thread_summary_text: str = ""
    scope_entity_text: str = ""
    scope_page_text: str = ""
    scope_environment_text: str = ""
    scope_filters_text: str = ""
    scope_visible_records_text: str = ""
    rag_text: str = ""
    history_messages: list[dict[str, Any]] = field(default_factory=list)
    workflow_augmentation_text: str = ""
    current_user_text: str = ""
    domain_blocks_text: str = ""


def compose_prompt(
    *,
    system_base: str,
    lane: str,
    context_block: str = "",
    rag_context: str = "",
    history: list[dict[str, str]] | None = None,
    user_message: str,
    domain_blocks: list[tuple[str, str]] | None = None,
    mutation_rules: str = "",
    session_context: str = "",
    system_role: str = "system",
    workflow_augmentation: str = "",
) -> tuple[list[dict[str, Any]], PromptAudit]:
    """Compose the full message list for an LLM call.

    Args:
        system_base: The stable base system prompt (cached by OpenAI).
        lane: Route lane (A/B/C/D) — controls token budgets.
        context_block: Environment/page/entity context (INTERNAL to model).
        rag_context: Retrieved document chunks with scores.
        history: Prior conversation messages [{role, content}].
        user_message: The current user query.
        domain_blocks: List of (name, content) tuples for domain specialization.
        mutation_rules: Write-flow rules (if write tools available).
        session_context: Prior waterfall runs / session state.
        system_role: "system" or "developer" (for reasoning models).
        workflow_augmentation: Extra context for pending workflow continuation.

    Returns:
        Tuple of (messages list, audit record).
    """
    budget = _LANE_BUDGETS.get(lane, _LANE_BUDGETS["B"])
    audit = PromptAudit(lane=lane)

    messages: list[dict[str, Any]] = []

    # ── Section 1: Stable system prompt (enables OpenAI prompt caching) ──
    system_text = _truncate_to_budget(system_base, budget.system_max)
    audit.system_tokens = _estimate_tokens(system_text)
    if audit.system_tokens < _estimate_tokens(system_base):
        audit.sections_truncated.append("system_base")
    messages.append({"role": system_role, "content": system_text})

    # ── Section 2: Dynamic blocks (mutation rules + domain + context + RAG) ──
    dynamic_parts: list[str] = []

    # 2a. Mutation or read-only rules
    if mutation_rules:
        dynamic_parts.append(mutation_rules)

    # 2b. Domain-specific blocks (novendor, credit, resume, etc.)
    # Domain blocks share the context budget — track their token usage.
    if domain_blocks:
        _domain_budget = budget.context_max // 2  # domain blocks get half of context budget
        _domain_used = 0
        for name, block_content in domain_blocks:
            _block_tokens = _estimate_tokens(block_content)
            if _domain_used + _block_tokens > _domain_budget:
                block_content = _truncate_to_budget(block_content, _domain_budget - _domain_used)
                audit.sections_truncated.append(f"domain:{name}")
            _domain_used += _estimate_tokens(block_content)
            dynamic_parts.append(block_content)
            audit.domain_blocks_applied.append(name)
        audit.domain_block_tokens = _domain_used

    # 2c. Context block (environment, page, entity, visible data)
    if context_block:
        ctx = _truncate_to_budget(context_block, budget.context_max)
        audit.context_tokens = _estimate_tokens(ctx)
        if audit.context_tokens < _estimate_tokens(context_block):
            audit.sections_truncated.append("context_block")
        dynamic_parts.append(ctx)

    # 2d. Session context (prior waterfall runs, etc.)
    # Budget-checked: session context shares context budget
    if session_context:
        _session_budget = budget.context_max // 4  # session gets quarter of context budget
        sc = _truncate_to_budget(session_context, _session_budget)
        audit.session_context_tokens = _estimate_tokens(sc)
        if audit.session_context_tokens < _estimate_tokens(session_context):
            audit.sections_truncated.append("session_context")
        dynamic_parts.append(sc)

    # 2e. RAG context (retrieved document chunks)
    if rag_context and budget.rag_max > 0:
        rag = _truncate_to_budget(rag_context, budget.rag_max)
        audit.rag_tokens = _estimate_tokens(rag)
        if audit.rag_tokens < _estimate_tokens(rag_context):
            audit.sections_truncated.append("rag_context")
        dynamic_parts.append(rag)

    if dynamic_parts:
        messages.append({"role": system_role, "content": "\n\n".join(dynamic_parts)})

    # ── Section 3: Conversation history (oldest to newest) ──
    # Hard cap: max 6 history messages to prevent prompt bloat from long threads
    MAX_HISTORY_MESSAGES = 6
    if history:
        # Take the most recent messages (trim from the front)
        capped_history = history[-MAX_HISTORY_MESSAGES:] if len(history) > MAX_HISTORY_MESSAGES else history
        if len(capped_history) < len(history):
            audit.sections_truncated.append(f"history_count:{len(history)}->{len(capped_history)}")
        history_tokens_used = 0
        for msg in capped_history:
            msg_tokens = _estimate_tokens(msg.get("content", ""))
            if history_tokens_used + msg_tokens > budget.history_max:
                audit.sections_truncated.append("history_tokens")
                break
            history_tokens_used += msg_tokens
            messages.append({"role": msg["role"], "content": msg["content"]})
        audit.history_tokens = history_tokens_used

    # ── Section 4: Current user message ──
    effective_message = user_message
    if workflow_augmentation:
        effective_message = f"{user_message}\n\n{workflow_augmentation}"

    user_text = _truncate_to_budget(effective_message, budget.user_max)
    audit.user_tokens = _estimate_tokens(user_text)
    messages.append({"role": "user", "content": user_text})

    # ── Compute totals ──
    audit.total_tokens = (
        audit.system_tokens + audit.context_tokens + audit.rag_tokens
        + audit.history_tokens + audit.user_tokens
        + audit.domain_block_tokens + audit.session_context_tokens
    )

    # ── Token budget instrumentation ──
    if audit.sections_truncated:
        logger.info(
            "Prompt truncated: lane=%s total_est=%d truncated=%s",
            lane, audit.total_tokens, ",".join(audit.sections_truncated),
        )
    if audit.total_tokens > 12000:
        logger.warning(
            "Large prompt: lane=%s total_est=%d (sys=%d ctx=%d rag=%d hist=%d user=%d)",
            lane, audit.total_tokens, audit.system_tokens, audit.context_tokens,
            audit.rag_tokens, audit.history_tokens, audit.user_tokens,
        )

    return messages, audit


# ── Unified-runtime composition path ──────────────────────────────────────
#
# The unified runtime uses ``compose_from_compiled`` instead of
# ``compose_prompt``. The compiler has already done all the selection, RAG
# policy, skill trimming, redundancy filtering, and budget enforcement — this
# function only needs to emit OpenAI-shaped messages and a sidecar of raw
# section text for receipt capture.


def compose_from_compiled(
    compiled: Any,                       # CompiledContext (late-imported by caller to avoid cycles)
    *,
    system_base: str,
    system_role: str = "system",
) -> tuple[list[dict[str, Any]], PromptSections]:
    """Emit OpenAI messages + ``PromptSections`` sidecar from a ``CompiledContext``.

    No truncation happens here. If a compiled item is ``included=False``,
    it is dropped from both the messages list and the sidecar.
    """
    sections = PromptSections()
    messages: list[dict[str, Any]] = []

    # 1. Always-on system base.
    messages.append({"role": system_role, "content": system_base})
    sections.system_text = system_base

    def _text(key: str) -> str:
        return compiled.item_text(key) if hasattr(compiled, "item_text") else ""

    # 2. Merged dynamic system block. Order here is the order the model sees.
    dynamic_order = [
        "skill_instructions",
        "thread_goal",
        "scope_entity",
        "scope_page",
        "scope_environment",
        "scope_filters",
        "scope_visible_records",
        "thread_summary",
        "rag",
        "domain_blocks",
    ]
    dynamic_parts: list[str] = []
    for key in dynamic_order:
        text = _text(key)
        if not text:
            continue
        dynamic_parts.append(text)
        # Populate the sidecar with one attribute per section.
        attr_name = f"{key}_text" if key != "domain_blocks" else "domain_blocks_text"
        if hasattr(sections, attr_name):
            setattr(sections, attr_name, text)
    if dynamic_parts:
        messages.append(
            {"role": system_role, "content": "\n\n".join(dynamic_parts)}
        )

    # 3. History as its own messages.
    history_item = compiled.item("history") if hasattr(compiled, "item") else None
    if history_item and history_item.included:
        raw_msgs = history_item.metadata.get("raw_messages") or []
        for m in raw_msgs:
            role = m.get("role") or "user"
            content = m.get("content") or ""
            messages.append({"role": role, "content": content})
        sections.history_messages = list(raw_msgs)

    # 4. Workflow augmentation merges into the current user message.
    user_text = _text("current_user")
    wf_text = _text("workflow_aug")
    if wf_text:
        user_text = f"{user_text}\n\n{wf_text}" if user_text else wf_text
        sections.workflow_augmentation_text = wf_text
    if not user_text:
        user_text = compiled.plan.resolved_user_text if hasattr(compiled, "plan") else ""
    sections.current_user_text = user_text
    messages.append({"role": "user", "content": user_text})

    return messages, sections
