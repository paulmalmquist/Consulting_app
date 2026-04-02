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

import json
from dataclasses import dataclass, field
from typing import Any


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
    total_tokens: int = 0
    domain_blocks_applied: list[str] = field(default_factory=list)
    sections_truncated: list[str] = field(default_factory=list)


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
    if domain_blocks:
        for name, block_content in domain_blocks:
            dynamic_parts.append(block_content)
            audit.domain_blocks_applied.append(name)

    # 2c. Context block (environment, page, entity, visible data)
    if context_block:
        ctx = _truncate_to_budget(context_block, budget.context_max)
        audit.context_tokens = _estimate_tokens(ctx)
        if audit.context_tokens < _estimate_tokens(context_block):
            audit.sections_truncated.append("context_block")
        dynamic_parts.append(ctx)

    # 2d. Session context (prior waterfall runs, etc.)
    if session_context:
        dynamic_parts.append(session_context)

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
    if history:
        history_tokens_used = 0
        for msg in history:
            msg_tokens = _estimate_tokens(msg.get("content", ""))
            if history_tokens_used + msg_tokens > budget.history_max:
                audit.sections_truncated.append("history")
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
    )

    return messages, audit
