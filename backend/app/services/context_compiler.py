"""Context Compiler — Layer 2 of Winston's prompt composition pipeline.

Takes a ``CompositionPlan`` from the Prompt Strategy Engine, builds a
priority-ordered list of candidate prompt items, applies per-lane policy
(including RAG constraints and skill-size caps), runs a redundancy filter
across items, and enforces the total token budget by walking items
lowest-priority-first with explicit cut strategies. The result is a
``CompiledContext`` that the composer emits into OpenAI messages without any
further truncation — all cuts happened here.

Priority map (0 = never drop):
    0  current_user_message         never
    5  skill_instructions           trim_to_cap  (MAX_SKILL_TOKENS)
    8  thread_goal                  never
    8  scope_entity                 never
   10  scope_page                   compress
   12  scope_environment            compress
   14  scope_filters                drop
   15  thread_summary               compress
   16  scope_visible_records        trim
   20  workflow_aug                 trim
   30  history                      trim
   40  rag                          drop
   60  domain_blocks                drop
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.lane_policy import LanePolicy
from app.services.prompt_strategy import CompositionPlan
from app.services.rag_policy import RagPolicyResult, apply_rag_policy, format_rag_chunks


# ── Priority and cut-strategy maps ────────────────────────────────────────


PRIORITY: dict[str, int] = {
    "current_user": 0,
    "skill_instructions": 5,
    "thread_goal": 8,
    "scope_entity": 8,
    "scope_page": 10,
    "scope_environment": 12,
    "scope_filters": 14,
    "thread_summary": 15,
    "scope_visible_records": 16,
    "workflow_aug": 20,
    "history": 30,
    "rag": 40,
    "domain_blocks": 60,
}


CUT_STRATEGY: dict[str, str] = {
    "current_user": "never",
    "skill_instructions": "trim_to_cap",
    "thread_goal": "never",
    "scope_entity": "never",
    "scope_page": "compress",
    "scope_environment": "compress",
    "scope_filters": "drop",
    "thread_summary": "compress",
    "scope_visible_records": "trim",
    "workflow_aug": "trim",
    "history": "trim",
    "rag": "drop",
    "domain_blocks": "drop",
}


# ── Data classes ──────────────────────────────────────────────────────────


@dataclass
class CompiledItem:
    key: str
    text: str
    tokens: int
    priority: int
    cut_strategy: str
    included: bool = True
    cut_reason: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "text_len": len(self.text or ""),
            "tokens": self.tokens,
            "priority": self.priority,
            "cut_strategy": self.cut_strategy,
            "included": self.included,
            "cut_reason": self.cut_reason,
            "metadata": self.metadata,
        }


@dataclass
class CompiledContext:
    lane: str
    plan: CompositionPlan
    policy: LanePolicy
    items: dict[str, CompiledItem]
    pre_enforcement_tokens: int
    post_enforcement_tokens: int
    enforcement_trace: list[dict[str, Any]]
    redundancy_trace: list[dict[str, Any]]
    used_thread_summary: bool
    skill_trimmed: bool
    rag_stats: dict[str, Any]
    diagnostics: dict[str, Any]

    def item(self, key: str) -> CompiledItem | None:
        return self.items.get(key)

    def included_item(self, key: str) -> CompiledItem | None:
        it = self.items.get(key)
        return it if it and it.included else None

    def item_text(self, key: str) -> str:
        it = self.included_item(key)
        return (it.text if it else "") or ""

    def item_tokens(self, key: str) -> int:
        it = self.included_item(key)
        return (it.tokens if it else 0) or 0


# ── Public compile entry point ────────────────────────────────────────────


def compile_context(
    *,
    plan: CompositionPlan,
    model: str,
    history_messages: list[dict[str, Any]],
    raw_rag_chunks: list[Any],
    workflow_augmentation: str = "",
    domain_blocks: list[tuple[str, str]] | None = None,
) -> CompiledContext:
    """Build a ``CompiledContext`` from a plan.

    The compiler never looks at the raw user message directly — it takes the
    already-resolved text from ``plan.resolved_user_text`` so deictic
    resolution happens exactly once and is audited on the receipt.
    """
    # Local import to avoid a top-level dependency loop with prompt_receipts
    # (prompt_receipts itself imports nothing from this module at import time,
    # but keeping this late keeps the boundary obvious).
    from app.services.prompt_receipts import count_tokens, get_encoding

    policy = plan.policy
    enc = get_encoding(model)

    items: dict[str, CompiledItem] = {}

    def add(key: str, text: str, metadata: dict[str, Any] | None = None) -> None:
        if not text:
            return
        items[key] = CompiledItem(
            key=key,
            text=text,
            tokens=count_tokens(text, enc),
            priority=PRIORITY[key],
            cut_strategy=CUT_STRATEGY[key],
            metadata=metadata or {},
        )

    # ── Selection phase ──────────────────────────────────────────────────

    # 1. Current user message (always-on, never dropped).
    add("current_user", plan.resolved_user_text)

    # 2. Skill instructions (never dropped, but trimmed to MAX_SKILL_TOKENS).
    skill_trimmed = False
    if plan.skill_id:
        from app.services.prompt_strategy import load_skill_instructions

        skill_text = load_skill_instructions(plan.skill_id)
        if skill_text:
            skill_tokens = count_tokens(skill_text, enc)
            if skill_tokens > policy.max_skill_tokens:
                # Hard trim before entering the compile loop. Skill instruction
                # bloat is a deploy-time problem; the compiler surfaces it.
                safety = 0
                while (
                    count_tokens(skill_text, enc) > policy.max_skill_tokens
                    and len(skill_text) > 200
                    and safety < 20
                ):
                    skill_text = skill_text[: int(len(skill_text) * 0.9)]
                    safety += 1
                skill_trimmed = True
            add(
                "skill_instructions",
                skill_text,
                {
                    "skill_id": plan.skill_id,
                    "source": plan.skill_source,
                    "trimmed": skill_trimmed,
                },
            )

    # 3. Thread goal (compact anchor, never dropped).
    if plan.thread_goal:
        add("thread_goal", plan.thread_goal, {"source": "extracted"})

    # 4. Structured scope (entity is never dropped; the rest are separately
    # compressible or droppable).
    add("scope_entity", plan.scope.entity_text, {"entity_id": plan.scope.entity_id})
    if plan.lane != "A":
        add("scope_page", plan.scope.page_text)
        add("scope_environment", plan.scope.environment_text)
        add("scope_filters", plan.scope.filters_text)
        if policy.use_visible_records and plan.profile.include_visible_records:
            add(
                "scope_visible_records",
                plan.scope.visible_records_text,
            )

    # 5. Thread summary (strategy-gated).
    used_summary = False
    if plan.summary_strategy in ("complement", "replace_history") and plan.summary_text:
        add(
            "thread_summary",
            plan.summary_text,
            {
                "version": plan.summary_version,
                "strategy": plan.summary_strategy,
            },
        )
        used_summary = True

    # 6. Workflow augmentation (pending-action continuation text, etc.).
    add("workflow_aug", workflow_augmentation)

    # 7. Recent history. Strategy decides depth.
    if history_messages:
        if plan.summary_strategy == "replace_history":
            recent = history_messages[-2:]
        else:
            recent = history_messages[-policy.max_history_turns:]
        if recent:
            lines: list[str] = []
            for m in recent:
                role = str(m.get("role", "user"))
                content = str(m.get("content") or "")
                lines.append(f"[{role}] {content}")
            joined = "\n".join(lines)
            message_ids = [
                str(m.get("message_id"))
                for m in recent
                if m.get("message_id")
            ]
            add(
                "history",
                joined,
                {
                    "turns_included": len(recent),
                    "turns_available": len(history_messages),
                    "message_ids": message_ids,
                    "first_created_at": recent[0].get("created_at") if recent else None,
                    "last_created_at": recent[-1].get("created_at") if recent else None,
                    "raw_messages": [
                        {"role": m.get("role"), "content": m.get("content") or ""}
                        for m in recent
                    ],
                },
            )

    # 8. RAG (policy-filtered, lane-gated).
    rag_result: RagPolicyResult = RagPolicyResult(kept=[], stats={"chunks_raw": 0, "chunks_kept": 0})
    if (
        policy.include_rag
        and not plan.profile.force_no_rag
        and raw_rag_chunks
    ):
        active_entity_ids = [plan.scope.entity_id] if plan.scope.entity_id else []
        rag_result = apply_rag_policy(
            raw_rag_chunks,
            max_chunks=policy.max_rag_chunks,
            min_score=policy.rag_min_score,
            active_entity_ids=active_entity_ids,
        )
        if rag_result.kept:
            rag_text = format_rag_chunks(rag_result.kept)
            add(
                "rag",
                rag_text,
                {
                    "chunks_kept": len(rag_result.kept),
                    **rag_result.stats,
                },
            )

    # 9. Domain blocks (optional, lowest priority).
    if policy.use_domain_blocks and domain_blocks:
        joined = "\n\n".join(
            f"## {name}\n{body}" for name, body in domain_blocks if body
        )
        if joined:
            add(
                "domain_blocks",
                joined,
                {"names": [name for name, _ in domain_blocks]},
            )

    # ── Redundancy filter ────────────────────────────────────────────────

    redundancy_trace = _apply_redundancy_filter(items, enc=enc, count_tokens=count_tokens)

    # ── Enforcement phase ────────────────────────────────────────────────

    pre = _total_tokens(items)
    enforcement_trace = _enforce_budget(
        items, budget=policy.total_budget, enc=enc, count_tokens=count_tokens
    )
    post = _total_tokens(items)

    return CompiledContext(
        lane=plan.lane,
        plan=plan,
        policy=policy,
        items=items,
        pre_enforcement_tokens=pre,
        post_enforcement_tokens=post,
        enforcement_trace=enforcement_trace,
        redundancy_trace=redundancy_trace,
        used_thread_summary=used_summary,
        skill_trimmed=skill_trimmed,
        rag_stats=rag_result.stats,
        diagnostics={
            **plan.diagnostics,
            "item_keys_included": [k for k, v in items.items() if v.included],
            "item_keys_excluded": [k for k, v in items.items() if not v.included],
        },
    )


# ── Redundancy filter ─────────────────────────────────────────────────────


REDUNDANCY_THRESHOLD = 0.4

# Pairs of (higher_priority_key, lower_priority_key) to compare. When overlap
# exceeds the threshold, the lower-priority item is shrunk to its
# non-overlapping tokens.
_REDUNDANCY_PAIRS: list[tuple[str, str]] = [
    ("thread_summary", "history"),
    ("scope_entity", "rag"),
    ("scope_entity", "history"),
    ("thread_goal", "thread_summary"),
    ("skill_instructions", "rag"),
]


def _tokenize_set(text: str) -> set[str]:
    return {w.lower() for w in (text or "").split() if len(w) > 3}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _apply_redundancy_filter(
    items: dict[str, CompiledItem],
    *,
    enc: Any,
    count_tokens: Any,
) -> list[dict[str, Any]]:
    trace: list[dict[str, Any]] = []
    sets: dict[str, set[str]] = {
        k: _tokenize_set(it.text) for k, it in items.items() if it.included
    }
    for hi, lo in _REDUNDANCY_PAIRS:
        if hi not in items or lo not in items:
            continue
        if not items[hi].included or not items[lo].included:
            continue
        sim = _jaccard(sets.get(hi, set()), sets.get(lo, set()))
        if sim <= REDUNDANCY_THRESHOLD:
            continue
        overlap = sets[hi] & sets[lo]
        lo_item = items[lo]
        words = (lo_item.text or "").split()
        filtered_words = [w for w in words if w.lower() not in overlap]
        new_text = " ".join(filtered_words).strip()
        new_tokens = count_tokens(new_text, enc) if new_text else 0
        trace.append(
            {
                "a": hi,
                "b": lo,
                "similarity": round(sim, 2),
                "action": "shrank_b",
                "tokens_before": lo_item.tokens,
                "tokens_after": new_tokens,
            }
        )
        lo_item.text = new_text
        lo_item.tokens = new_tokens
        if lo_item.tokens < 20:
            lo_item.included = False
            lo_item.cut_reason = f"redundancy_with_{hi}"
            trace.append(
                {
                    "a": hi,
                    "b": lo,
                    "similarity": round(sim, 2),
                    "action": "dropped_b",
                    "tokens_before": 0,
                    "tokens_after": 0,
                }
            )
    return trace


# ── Budget enforcement ────────────────────────────────────────────────────


def _total_tokens(items: dict[str, CompiledItem]) -> int:
    return sum(it.tokens for it in items.values() if it.included)


def _enforce_budget(
    items: dict[str, CompiledItem],
    *,
    budget: int,
    enc: Any,
    count_tokens: Any,
) -> list[dict[str, Any]]:
    """Walk items lowest-priority-first and cut until total ≤ budget.

    Returns a trace list of every action taken. Every mutation is recorded
    so the receipt can explain exactly what the compiler did and why.
    """
    trace: list[dict[str, Any]] = []
    if _total_tokens(items) <= budget:
        return trace

    ordered = sorted(
        (it for it in items.values()),
        key=lambda it: -it.priority,  # highest priority number (lowest importance) first
    )

    for it in ordered:
        if _total_tokens(items) <= budget:
            break
        if it.cut_strategy == "never":
            continue
        if not it.included:
            continue
        before = it.tokens

        if it.cut_strategy in ("drop",):
            it.included = False
            it.cut_reason = "over_budget_drop"
            trace.append(
                {
                    "key": it.key,
                    "action": "drop",
                    "before": before,
                    "after": 0,
                    "reason": "over_budget",
                }
            )
        elif it.cut_strategy in ("trim", "trim_to_cap"):
            safety = 0
            while (
                it.tokens > 0
                and _total_tokens(items) > budget
                and len(it.text) > 40
                and safety < 40
            ):
                new_len = max(40, int(len(it.text) * 0.8))
                it.text = it.text[:new_len]
                it.tokens = count_tokens(it.text, enc)
                safety += 1
            if it.tokens == 0 or len(it.text) <= 40:
                it.included = False
            it.cut_reason = "over_budget_trim"
            trace.append(
                {
                    "key": it.key,
                    "action": "trim",
                    "before": before,
                    "after": it.tokens,
                    "reason": "over_budget",
                }
            )
        elif it.cut_strategy == "compress":
            safety = 0
            while (
                it.tokens > 0
                and _total_tokens(items) > budget
                and len(it.text) > 40
                and safety < 40
            ):
                new_len = max(40, int(len(it.text) * 0.6))
                it.text = it.text[:new_len]
                it.tokens = count_tokens(it.text, enc)
                safety += 1
            if it.tokens == 0 or len(it.text) <= 40:
                it.included = False
            it.cut_reason = "over_budget_compress"
            trace.append(
                {
                    "key": it.key,
                    "action": "compress",
                    "before": before,
                    "after": it.tokens,
                    "reason": "over_budget",
                }
            )

    if _total_tokens(items) > budget:
        trace.append(
            {
                "key": "_hard_overflow",
                "action": "log_error",
                "before": _total_tokens(items),
                "after": _total_tokens(items),
                "reason": f"budget {budget} exceeded after all cuts",
            }
        )
    return trace
