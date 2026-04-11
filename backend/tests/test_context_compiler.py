"""Unit tests for the Context Compiler (Layer 2)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


from app.services.context_compiler import compile_context
from app.services.lane_policy import LANE_POLICY, LanePolicy, MAX_SKILL_TOKENS
from app.services.prompt_strategy import (
    COMPOSITION_PROFILES,
    CompositionPlan,
    StructuredScope,
    STRATEGY_VERSION,
)


# ── Shims ─────────────────────────────────────────────────────────────────


@dataclass
class FakeChunk:
    """Minimal RetrievedChunk shape for tests."""

    chunk_text: str
    score: float
    document_id: str = "doc-1"
    chunk_index: int = 0
    section_heading: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    env_id: str | None = None


def _plan(
    *,
    lane: str = "C",
    profile: str = "default",
    skill_id: str | None = None,
    user_message: str = "what is the IRR",
    entity_label: str = "Meridian Value Fund I",
    summary_text: str | None = None,
    summary_strategy: str = "none",
    is_minimal: bool = False,
    scope_overrides: dict[str, Any] | None = None,
) -> CompositionPlan:
    scope = StructuredScope(
        environment_text="[environment]\nenv_name: Meridian Capital Management",
        page_text="[page]\ntitle: Fund Detail\nroute: /lab/env/x/re/funds/1",
        entity_text=f"[active entity]\ntype: fund\nname: {entity_label}\nid: fund-1",
        filters_text="[filters]\nquarter: 2025Q4",
        visible_records_text="",
        entity_label=entity_label,
        entity_type="fund",
        entity_id="fund-1",
        page_title="Fund Detail",
        quarter="2025Q4",
        short_label=f"Meridian / {entity_label}",
    )
    if scope_overrides:
        for k, v in scope_overrides.items():
            setattr(scope, k, v)

    profile_obj = COMPOSITION_PROFILES[profile]
    policy = LANE_POLICY[lane]
    return CompositionPlan(
        profile=profile_obj,
        lane=lane,
        skill_id=skill_id,
        skill_source="rule" if skill_id else "none",
        intent_hint="explain_metric.irr",
        original_user_text=user_message,
        resolved_user_text=user_message,
        deictic_rewrites=[],
        scope=scope,
        thread_goal="The user is working on: validate fund returns",
        summary_strategy=summary_strategy,
        summary_text=summary_text,
        summary_version=1 if summary_text else None,
        is_minimal=is_minimal,
        strategy_version=STRATEGY_VERSION,
        diagnostics={},
        policy=policy,
    )


# ── 1. Lane A compile skips most items ───────────────────────────────────


def test_lane_a_compile_excludes_rag_and_scope_filters():
    plan = _plan(lane="A", profile="simple_lookup")
    compiled = compile_context(
        plan=plan,
        model="gpt-4o-mini",
        history_messages=[],
        raw_rag_chunks=[FakeChunk("stuff", 0.9)],
        workflow_augmentation="",
    )
    keys = {k for k, v in compiled.items.items() if v.included}
    assert "current_user" in keys
    assert "scope_entity" in keys  # entity is always included
    assert "rag" not in keys
    assert "scope_page" not in keys
    assert "scope_environment" not in keys
    assert "scope_filters" not in keys
    assert "thread_summary" not in keys


# ── 2. Overflow cuts RAG before history before scope ─────────────────────


def test_overflow_cuts_rag_before_history_and_scope_entity_survives():
    big_rag = [
        FakeChunk("x" * 2000, 0.9, document_id=f"d{i}", chunk_index=i)
        for i in range(5)
    ]
    big_history = [
        {"role": "user", "content": "y" * 500, "message_id": f"m{i}"}
        for i in range(8)
    ]
    # Force a tiny budget via a custom policy so cuts definitely trigger.
    tiny_policy = LanePolicy(
        total_budget=400,
        include_rag=True,
        max_history_turns=6,
        max_rag_chunks=5,
        rag_min_score=0.1,
        use_thread_summary=True,
        use_visible_context=True,
        use_domain_blocks=False,
        use_visible_records=False,
    )
    plan = _plan(lane="C")
    plan.policy = tiny_policy
    compiled = compile_context(
        plan=plan,
        model="gpt-4o-mini",
        history_messages=big_history,
        raw_rag_chunks=big_rag,
        workflow_augmentation="",
    )
    # Order of drops (lowest priority first): rag(40) before history(30).
    trace_keys = [entry["key"] for entry in compiled.enforcement_trace]
    # RAG cut actions should appear before any history cut actions.
    if "rag" in trace_keys and "history" in trace_keys:
        assert trace_keys.index("rag") < trace_keys.index("history")
    # scope_entity (priority 8, never cut strategy) must remain included.
    assert compiled.included_item("scope_entity") is not None
    # current_user is never dropped.
    assert compiled.included_item("current_user") is not None


# ── 3. Skill > MAX_SKILL_TOKENS is trimmed to cap ────────────────────────


def test_skill_instructions_trimmed_to_cap(monkeypatch):
    """Skill files are trimmed before compile_context returns."""

    def _fake_load(skill_id: str | None) -> str:
        return "word " * 5000  # way more than MAX_SKILL_TOKENS characters

    monkeypatch.setattr(
        "app.services.context_compiler.load_skill_instructions",
        _fake_load,
        raising=False,
    )
    # Import-time reference: context_compiler imports load_skill_instructions
    # locally inside compile_context, so patch the strategy module instead.
    monkeypatch.setattr(
        "app.services.prompt_strategy.load_skill_instructions",
        _fake_load,
    )

    plan = _plan(lane="C", skill_id="explain_metric")
    compiled = compile_context(
        plan=plan,
        model="gpt-4o-mini",
        history_messages=[],
        raw_rag_chunks=[],
        workflow_augmentation="",
    )
    skill_item = compiled.included_item("skill_instructions")
    assert skill_item is not None
    assert compiled.skill_trimmed is True
    assert skill_item.tokens <= MAX_SKILL_TOKENS + 50  # tiktoken slop allowance


# ── 4. current_user + thread_goal + scope_entity never dropped ───────────


def test_protected_items_never_dropped_under_extreme_pressure():
    tiny_policy = LanePolicy(
        total_budget=50,  # absurdly small
        include_rag=False,
        max_history_turns=0,
        max_rag_chunks=0,
        rag_min_score=1.0,
        use_thread_summary=False,
        use_visible_context=False,
        use_domain_blocks=False,
        use_visible_records=False,
    )
    plan = _plan(lane="C")
    plan.policy = tiny_policy
    compiled = compile_context(
        plan=plan,
        model="gpt-4o-mini",
        history_messages=[],
        raw_rag_chunks=[],
        workflow_augmentation="",
    )
    # These four items must still be present regardless of budget.
    assert compiled.included_item("current_user") is not None
    assert compiled.included_item("scope_entity") is not None
    if plan.thread_goal:
        assert compiled.included_item("thread_goal") is not None


# ── 5. Redundancy filter shrinks history when overlapping with summary ──


def test_redundancy_filter_shrinks_history_overlap_with_summary():
    summary = "meridian fund returns validated capital account reconciled"
    history = [
        {
            "role": "user",
            "content": "meridian fund returns validated capital account reconciled pending approval",
            "message_id": "m1",
        }
    ]
    plan = _plan(
        lane="C",
        summary_text=summary,
        summary_strategy="complement",
    )
    compiled = compile_context(
        plan=plan,
        model="gpt-4o-mini",
        history_messages=history,
        raw_rag_chunks=[],
        workflow_augmentation="",
    )
    # Redundancy filter should have fired on (thread_summary, history).
    shrank_actions = [
        entry
        for entry in compiled.redundancy_trace
        if entry.get("action") == "shrank_b"
        and entry.get("a") == "thread_summary"
        and entry.get("b") == "history"
    ]
    assert shrank_actions, f"redundancy trace was {compiled.redundancy_trace}"


# ── 6. Hard overflow logged when budget impossible ──────────────────────


def test_hard_overflow_trace_when_cuts_insufficient():
    # Budget so small even the always-on items won't fit.
    tiny_policy = LanePolicy(
        total_budget=1,
        include_rag=False,
        max_history_turns=0,
        max_rag_chunks=0,
        rag_min_score=1.0,
        use_thread_summary=False,
        use_visible_context=False,
        use_domain_blocks=False,
        use_visible_records=False,
    )
    plan = _plan(lane="C")
    plan.policy = tiny_policy
    compiled = compile_context(
        plan=plan,
        model="gpt-4o-mini",
        history_messages=[],
        raw_rag_chunks=[],
        workflow_augmentation="",
    )
    trace_keys = [entry["key"] for entry in compiled.enforcement_trace]
    assert "_hard_overflow" in trace_keys


# ── 7. RAG policy dedupes and filters by min_score ───────────────────────


def test_rag_policy_drops_below_min_score_and_dedupes():
    chunks = [
        FakeChunk("alpha unique body text here", 0.70, document_id="docA", chunk_index=1),
        FakeChunk("alpha unique body text here", 0.69, document_id="docA", chunk_index=1),  # dup by key
        FakeChunk("beta unique body text here", 0.30, document_id="docB", chunk_index=2),  # below min
        FakeChunk("gamma unique body text here", 0.60, document_id="docC", chunk_index=3),
    ]
    plan = _plan(lane="C")
    compiled = compile_context(
        plan=plan,
        model="gpt-4o-mini",
        history_messages=[],
        raw_rag_chunks=chunks,
        workflow_augmentation="",
    )
    stats = compiled.rag_stats
    assert stats["chunks_raw"] == 4
    assert stats["dropped_below_min_score"] >= 1
    assert stats["deduped"] >= 1
    assert stats["chunks_kept"] <= LANE_POLICY["C"].max_rag_chunks
