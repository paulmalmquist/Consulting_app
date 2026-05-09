"""Prompt receipt capture — Layer 4 of Winston's prompt composition pipeline.

Builds and persists a durable record of exactly what the model was asked to
produce on every chat turn. A receipt is captured pre-send (so it exists even
when the model call later fails) with one row per tool-loop round. Admins
query these receipts to diagnose memory loss failures in one SQL query.

Key properties:
  * ``request_id`` joins ai_prompt_receipts 1:1 with ai_gateway_logs.
  * Section text strings are captured BEFORE the composer's merge.
  * Token counts use tiktoken with model-aware encoding fallback.
  * Persistence is synchronous via ``run_in_executor`` — fire-and-forget
    create_task is unsafe in SSE StreamingResponse generators in this repo.
  * Environment gated by ``WINSTON_PROMPT_RECEIPT_ENABLED`` (default true).
  * Per-column soft cap via ``WINSTON_PROMPT_RECEIPT_MAX_SECTION_CHARS``
    (default 40000) with a clear truncation sentinel.

Safety: every public function is wrapped in try/except so a receipt failure
never breaks a user turn. Receipts are observability, not a dependency.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

from app.db import get_cursor

logger = logging.getLogger(__name__)

COMPOSER_VERSION = "2026-04-11-v1"


# ── Feature flags ─────────────────────────────────────────────────────────


def is_enabled() -> bool:
    return os.getenv("WINSTON_PROMPT_RECEIPT_ENABLED", "true").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _max_section_chars() -> int:
    try:
        return max(1000, int(os.getenv("WINSTON_PROMPT_RECEIPT_MAX_SECTION_CHARS", "40000")))
    except (TypeError, ValueError):
        return 40000


# ── Token counting (tiktoken with model-aware fallback) ──────────────────


def get_encoding(model: str | None):
    """Return a tiktoken encoding for the given model, or None if tiktoken
    is unavailable. The encoding exposes ``.name`` and ``.encode(text)``.

    Fallback chain:
      1. ``tiktoken.encoding_for_model(model)``    (best match)
      2. ``tiktoken.get_encoding("o200k_base")``   (GPT-4o / GPT-5 family)
      3. ``tiktoken.get_encoding("cl100k_base")``  (GPT-4 family)
    """
    try:
        import tiktoken  # type: ignore
    except Exception:
        return None

    if model:
        try:
            return tiktoken.encoding_for_model(model)
        except Exception:
            pass
    for name in ("o200k_base", "cl100k_base"):
        try:
            return tiktoken.get_encoding(name)
        except Exception:
            continue
    return None


def count_tokens(text: str | None, encoding: Any) -> int:
    if not text:
        return 0
    if encoding is None:
        # Crude fallback when tiktoken is unavailable.
        return max(0, len(text) // 4)
    try:
        return len(encoding.encode(text))
    except Exception:
        return max(0, len(text) // 4)


# ── Receipt builder ──────────────────────────────────────────────────────


@dataclass
class ReceiptRow:
    """Wire format for the ai_prompt_receipts INSERT. Fields map 1:1 to columns."""

    request_id: str
    round_index: int = 0
    capture_point: str = "initial"
    conversation_id: str | None = None
    message_id: str | None = None
    session_id: str | None = None
    env_id: str | None = None
    business_id: str | None = None
    actor: str = "anonymous"
    lane: str | None = None
    intent: str | None = None
    composition_profile: str | None = None
    model: str | None = None
    model_encoding: str | None = None
    composer_version: str = COMPOSER_VERSION
    strategy_version: str | None = None
    fallback_used: bool = False
    skill_id: str | None = None
    skill_source: str | None = None
    skill_tokens: int = 0
    skill_trimmed: bool = False
    lane_policy_json: dict[str, Any] | None = None
    composition_profile_json: dict[str, Any] | None = None
    original_user_text: str | None = None
    resolved_user_text: str | None = None
    deictic_rewrites_json: list[dict[str, Any]] = field(default_factory=list)
    scope_environment_text: str | None = None
    scope_page_text: str | None = None
    scope_entity_text: str | None = None
    scope_filters_text: str | None = None
    scope_visible_records_text: str | None = None
    system_text: str | None = None
    skill_instructions_text: str | None = None
    thread_goal_text: str | None = None
    thread_summary_text: str | None = None
    rag_text: str | None = None
    history_json: list[dict[str, Any]] = field(default_factory=list)
    workflow_augmentation_text: str | None = None
    system_tokens: int = 0
    skill_instructions_tokens: int = 0
    thread_goal_tokens: int = 0
    thread_summary_tokens: int = 0
    scope_entity_tokens: int = 0
    scope_page_tokens: int = 0
    scope_environment_tokens: int = 0
    scope_filters_tokens: int = 0
    scope_visible_records_tokens: int = 0
    rag_tokens: int = 0
    history_tokens: int = 0
    workflow_augmentation_tokens: int = 0
    current_user_tokens: int = 0
    total_prompt_tokens: int = 0
    total_prompt_tokens_upstream: int | None = None
    total_budget: int | None = None
    pre_enforcement_tokens: int | None = None
    enforcement_trace_json: list[dict[str, Any]] = field(default_factory=list)
    redundancy_filter_json: list[dict[str, Any]] = field(default_factory=list)
    history_message_count: int = 0
    history_message_ids: list[str] = field(default_factory=list)
    history_first_created_at: Any = None
    history_last_created_at: Any = None
    history_truncated: bool = False
    truncation_reason: str | None = None
    used_thread_summary: bool = False
    summary_strategy: str | None = None
    thread_summary_version: int | None = None
    active_scope_type: str | None = None
    active_scope_id: str | None = None
    active_scope_label: str | None = None
    resolved_entity_state_json: dict[str, Any] = field(default_factory=dict)
    notes_json: dict[str, Any] = field(default_factory=dict)


def _derive_scope_present_fields(scope: Any) -> set[str]:
    """Return the set of concept required-context field names that the scope
    actually supplies today.

    Maps StructuredScope attributes onto concept required_context field names:
      entity → present if scope.entity_id or scope.entity_label is set
      period → present if scope.quarter is set
      scope  → present if scope.page_title is set (page implies the slicing scope)

    Source-discipline fields (sources, basis, currency, comparison_set) are
    intentionally NOT marked present here. The data layer doesn't yet expose
    per-source as-of dates or basis declarations; faking completeness would
    mask real gaps from PR 3 scorers.
    """
    present: set[str] = set()
    if scope is None:
        return present
    if getattr(scope, "entity_id", None) or getattr(scope, "entity_label", None):
        present.add("entity")
    if getattr(scope, "quarter", None):
        present.add("period")
    if getattr(scope, "page_title", None):
        present.add("scope")
    return present


def build_receipt_from_compiled(
    *,
    compiled: Any,                              # CompiledContext
    system_base: str,
    request_id: str,
    round_index: int,
    capture_point: str,
    conversation_id: str | None,
    session_id: str | None,
    env_id: str | None,
    business_id: str | None,
    actor: str,
    model: str,
    fallback_used: bool,
    active_scope_type: str | None,
    active_scope_id: str | None,
    active_scope_label: str | None,
    resolved_entity_state: dict[str, Any],
    continuity_notes: dict[str, Any],
    messages_delta: list[dict[str, Any]] | None = None,
    current_turn_index: int | None = None,
) -> ReceiptRow:
    """Serialize a CompiledContext into a ReceiptRow.

    ``messages_delta`` is used on tool-followup rounds (capture_point='tool_followup')
    to record only the newly-appended messages instead of recomputing the full
    section text.
    """
    enc = get_encoding(model)
    plan = compiled.plan
    policy = compiled.policy

    # Pull section text from the compiled items (included ones only).
    def t(k: str) -> str:
        return compiled.item_text(k)

    def tok(k: str) -> int:
        return compiled.item_tokens(k)

    system_text = system_base or ""
    system_tokens = count_tokens(system_text, enc)

    # History compact snapshot
    history_item = compiled.item("history")
    history_meta = (history_item.metadata if history_item and history_item.included else {}) or {}
    history_json: list[dict[str, Any]]
    if capture_point == "tool_followup" and messages_delta is not None:
        history_json = list(messages_delta)
    else:
        history_json = list(history_meta.get("raw_messages", []))
    message_ids = [str(x) for x in (history_meta.get("message_ids") or [])]

    history_truncated = any(
        (entry.get("key") == "history") or (entry.get("key") == "_hard_overflow")
        for entry in compiled.enforcement_trace
    )
    truncation_reason = (
        ",".join(
            str(entry.get("key"))
            for entry in compiled.enforcement_trace
            if entry.get("key")
        )
        or None
    )

    # Merge diagnostics + continuity notes + flags.
    notes: dict[str, Any] = {
        **(continuity_notes or {}),
        "strategy_diagnostics": plan.diagnostics,
        "compiler_diagnostics": compiled.diagnostics,
        "rag_stats": compiled.rag_stats,
        "included_items": compiled.diagnostics.get("item_keys_included", []),
        "excluded_items": compiled.diagnostics.get("item_keys_excluded", []),
    }

    # Concept diagnostics — populated whenever a concept matched, so eval scorers
    # can check route correctness, alias normalization, context completeness, and
    # output-contract compliance. Source-discipline fields are intentionally None
    # until the data layer exposes per-source as-of dates.
    if plan.concept_match is not None:
        concept_obj_item = compiled.item("concept_object")
        concept_ext_item = compiled.item("concept_object_extended")
        try:
            from app.assistant_runtime.concepts import load_concept

            concept = load_concept(plan.concept_match.concept_id)
            output_sections_expected = concept.output_contract.all_section_names()
            failure_modes_available = [fm.code for fm in concept.failure_modes]
            required_field_names = concept.required_context.required_field_names()
        except Exception:
            output_sections_expected = []
            failure_modes_available = []
            required_field_names = []

        # Derive required-context present/missing from plan.scope for the
        # fields the system can know today. The rest stay missing — we do
        # NOT fake source-discipline completeness. PR 3 scorers should treat
        # source/basis/currency/comparison_set fields as "not yet plumbed"
        # rather than failing a context gate the data layer can't satisfy.
        scope_present_fields = _derive_scope_present_fields(plan.scope)
        present = [f for f in required_field_names if f in scope_present_fields]
        missing = [f for f in required_field_names if f not in scope_present_fields]

        notes["concept_diagnostics"] = {
            "concept_id": plan.concept_match.concept_id,
            "concept_version": plan.concept_match.version,
            "matched_alias": plan.concept_match.matched_alias,
            "concept_confidence": plan.concept_match.confidence,
            "match_reason": plan.concept_match.match_reason.value,
            "behavior_tier": plan.concept_match.behavior_tier.value,
            "concept_object_included": bool(concept_obj_item and concept_obj_item.included),
            "concept_object_extended_included": bool(
                concept_ext_item and concept_ext_item.included
            ),
            "concept_object_tokens": tok("concept_object"),
            "concept_object_extended_tokens": tok("concept_object_extended"),
            "required_context_present": present,
            "required_context_missing": missing,
            "output_contract_sections_expected": output_sections_expected,
            "failure_modes_available": failure_modes_available,
            "source_inventory": None,
            "source_as_of_dates": None,
            "freshness_status": None,
            "conflict_summary": None,
            "basis_rule_applied": None,
            "scope_rule_applied": None,
        }

        # PR 7 — emit thread_subject from concept-routed turns so referential
        # follow-ups that aren't another concept match still inherit an
        # entity_type anchor. The strategize() consumer reads this on the
        # next turn alongside prior_concept_id.
        notes["thread_subject"] = {
            "subject_type": "concept",
            "entity_type": getattr(plan.scope, "entity_type", None),
            "entity_label_plural": None,
            "result_set_hint": None,
            "last_metric": plan.concept_match.concept_id,
            "supported_followups": [],
            "environment_id": env_id,
            "confidence": float(plan.concept_match.confidence),
            "source": "concept_receipt",
            "turn_distance": 0,
            "created_turn_index": (
                int(current_turn_index)
                if current_turn_index is not None
                else None
            ),
            "max_turn_distance": 2,
        }

    # Evaluate inline diagnostic flags.
    flag_candidate = {
        "total_prompt_tokens": compiled.post_enforcement_tokens or 0,
        "rag_tokens": tok("rag"),
        "history_tokens": tok("history"),
        "scope_environment_tokens": tok("scope_environment"),
        "scope_page_tokens": tok("scope_page"),
        "scope_filters_tokens": tok("scope_filters"),
        "skill_instructions_tokens": tok("skill_instructions"),
        "history_truncated": history_truncated,
        "enforcement_trace_json": compiled.enforcement_trace,
        "redundancy_filter_json": compiled.redundancy_trace,
        "notes_json": notes,
    }
    try:
        from app.services.prompt_diagnostics import evaluate_row as _eval_flags

        flags = _eval_flags(flag_candidate)
        notes["flags"] = [f["rule"] for f in flags]
    except Exception:
        notes["flags"] = []

    row = ReceiptRow(
        request_id=request_id,
        round_index=round_index,
        capture_point=capture_point,
        conversation_id=conversation_id,
        session_id=session_id,
        env_id=env_id,
        business_id=business_id,
        actor=actor,
        lane=compiled.lane,
        intent=plan.intent_hint,
        composition_profile=plan.profile.name,
        model=model,
        model_encoding=getattr(enc, "name", None),
        composer_version=COMPOSER_VERSION,
        strategy_version=plan.strategy_version,
        fallback_used=fallback_used,
        skill_id=plan.skill_id,
        skill_source=plan.skill_source,
        skill_tokens=tok("skill_instructions"),
        skill_trimmed=compiled.skill_trimmed,
        lane_policy_json=policy.to_dict(),
        composition_profile_json=plan.profile.to_dict(),
        original_user_text=plan.original_user_text,
        resolved_user_text=plan.resolved_user_text,
        deictic_rewrites_json=plan.deictic_rewrites or [],
        scope_environment_text=t("scope_environment") or None,
        scope_page_text=t("scope_page") or None,
        scope_entity_text=t("scope_entity") or None,
        scope_filters_text=t("scope_filters") or None,
        scope_visible_records_text=t("scope_visible_records") or None,
        system_text=system_text,
        skill_instructions_text=t("skill_instructions") or None,
        thread_goal_text=t("thread_goal") or None,
        thread_summary_text=t("thread_summary") or None,
        rag_text=t("rag") or None,
        history_json=history_json,
        workflow_augmentation_text=t("workflow_aug") or None,
        system_tokens=system_tokens,
        skill_instructions_tokens=tok("skill_instructions"),
        thread_goal_tokens=tok("thread_goal"),
        thread_summary_tokens=tok("thread_summary"),
        scope_entity_tokens=tok("scope_entity"),
        scope_page_tokens=tok("scope_page"),
        scope_environment_tokens=tok("scope_environment"),
        scope_filters_tokens=tok("scope_filters"),
        scope_visible_records_tokens=tok("scope_visible_records"),
        rag_tokens=tok("rag"),
        history_tokens=tok("history"),
        workflow_augmentation_tokens=tok("workflow_aug"),
        current_user_tokens=tok("current_user"),
        total_prompt_tokens=(compiled.post_enforcement_tokens or 0) + system_tokens,
        total_prompt_tokens_upstream=None,
        total_budget=policy.total_budget,
        pre_enforcement_tokens=(compiled.pre_enforcement_tokens or 0) + system_tokens,
        enforcement_trace_json=list(compiled.enforcement_trace or []),
        redundancy_filter_json=list(compiled.redundancy_trace or []),
        history_message_count=len(history_json),
        history_message_ids=message_ids,
        history_first_created_at=history_meta.get("first_created_at"),
        history_last_created_at=history_meta.get("last_created_at"),
        history_truncated=history_truncated,
        truncation_reason=truncation_reason,
        used_thread_summary=compiled.used_thread_summary,
        summary_strategy=plan.summary_strategy,
        thread_summary_version=plan.summary_version,
        active_scope_type=active_scope_type,
        active_scope_id=active_scope_id,
        active_scope_label=active_scope_label,
        resolved_entity_state_json=resolved_entity_state or {},
        notes_json=notes,
    )
    return row


def build_receipt_minimal(
    *,
    request_id: str,
    conversation_id: str | None,
    session_id: str | None,
    env_id: str | None,
    business_id: str | None,
    actor: str,
    model: str,
    plan: Any,                                   # CompositionPlan
    system_base: str,
    resolved_entity_state: dict[str, Any],
    continuity_notes: dict[str, Any],
) -> ReceiptRow:
    """Build a receipt for the lane-A minimal-mode bypass path.

    Minimal mode skips the full compile_context, so the receipt has fewer
    fields populated but the strategy decisions (profile, skill, deictic
    resolution) are still recorded.
    """
    enc = get_encoding(model)
    policy = plan.policy
    system_tokens = count_tokens(system_base, enc)
    user_tokens = count_tokens(plan.resolved_user_text, enc)
    scope_entity_tokens = count_tokens(plan.scope.entity_text, enc)
    total = system_tokens + user_tokens + scope_entity_tokens

    row = ReceiptRow(
        request_id=request_id,
        round_index=0,
        capture_point="minimal",
        conversation_id=conversation_id,
        session_id=session_id,
        env_id=env_id,
        business_id=business_id,
        actor=actor,
        lane=plan.lane,
        intent=plan.intent_hint,
        composition_profile=plan.profile.name,
        model=model,
        model_encoding=getattr(enc, "name", None),
        composer_version=COMPOSER_VERSION,
        strategy_version=plan.strategy_version,
        fallback_used=False,
        skill_id=plan.skill_id,
        skill_source=plan.skill_source,
        skill_tokens=0,
        skill_trimmed=False,
        lane_policy_json=policy.to_dict(),
        composition_profile_json=plan.profile.to_dict(),
        original_user_text=plan.original_user_text,
        resolved_user_text=plan.resolved_user_text,
        deictic_rewrites_json=plan.deictic_rewrites or [],
        scope_entity_text=plan.scope.entity_text or None,
        system_text=system_base,
        system_tokens=system_tokens,
        scope_entity_tokens=scope_entity_tokens,
        current_user_tokens=user_tokens,
        total_prompt_tokens=total,
        total_budget=policy.total_budget,
        pre_enforcement_tokens=total,
        enforcement_trace_json=[],
        redundancy_filter_json=[],
        history_message_count=0,
        active_scope_type=plan.scope.entity_type,
        active_scope_id=plan.scope.entity_id,
        active_scope_label=plan.scope.short_label,
        resolved_entity_state_json=resolved_entity_state or {},
        notes_json={
            **(continuity_notes or {}),
            "capture_point": "minimal",
            "bypass_reason": "lane_A_minimal",
            "flags": [],
        },
    )
    return row


# ── Persistence ──────────────────────────────────────────────────────────


_TEXT_COLUMNS_FOR_TRUNCATION = (
    "system_text",
    "skill_instructions_text",
    "thread_goal_text",
    "thread_summary_text",
    "scope_environment_text",
    "scope_page_text",
    "scope_entity_text",
    "scope_filters_text",
    "scope_visible_records_text",
    "rag_text",
    "original_user_text",
    "resolved_user_text",
    "workflow_augmentation_text",
)


def _truncate_for_storage(row: ReceiptRow) -> ReceiptRow:
    cap = _max_section_chars()
    truncated_labels: list[str] = []
    for col in _TEXT_COLUMNS_FOR_TRUNCATION:
        value = getattr(row, col, None)
        if isinstance(value, str) and len(value) > cap:
            head = value[: cap - 200]
            setattr(
                row,
                col,
                f"{head}\n\n[...TRUNCATED {len(value) - (cap - 200)} chars for storage; inspect live run for full text...]",
            )
            truncated_labels.append(col)
    if truncated_labels:
        notes = dict(row.notes_json or {})
        existing = notes.get("section_truncated") or []
        notes["section_truncated"] = list(existing) + truncated_labels
        row.notes_json = notes
    return row


_INSERT_COLUMNS = (
    "request_id",
    "round_index",
    "capture_point",
    "conversation_id",
    "message_id",
    "session_id",
    "env_id",
    "business_id",
    "actor",
    "lane",
    "intent",
    "composition_profile",
    "model",
    "model_encoding",
    "composer_version",
    "strategy_version",
    "fallback_used",
    "skill_id",
    "skill_source",
    "skill_tokens",
    "skill_trimmed",
    "lane_policy_json",
    "composition_profile_json",
    "original_user_text",
    "resolved_user_text",
    "deictic_rewrites_json",
    "scope_environment_text",
    "scope_page_text",
    "scope_entity_text",
    "scope_filters_text",
    "scope_visible_records_text",
    "system_text",
    "skill_instructions_text",
    "thread_goal_text",
    "thread_summary_text",
    "rag_text",
    "history_json",
    "workflow_augmentation_text",
    "system_tokens",
    "skill_instructions_tokens",
    "thread_goal_tokens",
    "thread_summary_tokens",
    "scope_entity_tokens",
    "scope_page_tokens",
    "scope_environment_tokens",
    "scope_filters_tokens",
    "scope_visible_records_tokens",
    "rag_tokens",
    "history_tokens",
    "workflow_augmentation_tokens",
    "current_user_tokens",
    "total_prompt_tokens",
    "total_prompt_tokens_upstream",
    "total_budget",
    "pre_enforcement_tokens",
    "enforcement_trace_json",
    "redundancy_filter_json",
    "history_message_count",
    "history_message_ids",
    "history_first_created_at",
    "history_last_created_at",
    "history_truncated",
    "truncation_reason",
    "used_thread_summary",
    "summary_strategy",
    "thread_summary_version",
    "active_scope_type",
    "active_scope_id",
    "active_scope_label",
    "resolved_entity_state_json",
    "notes_json",
)

_JSON_COLUMNS = {
    "lane_policy_json",
    "composition_profile_json",
    "deictic_rewrites_json",
    "history_json",
    "enforcement_trace_json",
    "redundancy_filter_json",
    "resolved_entity_state_json",
    "notes_json",
}

_UUID_LIST_COLUMNS = {"history_message_ids"}


def _serialize_value(col: str, value: Any) -> Any:
    if col in _JSON_COLUMNS:
        return json.dumps(value if value is not None else {}, default=str)
    if col in _UUID_LIST_COLUMNS:
        # psycopg accepts a Python list for uuid[] if values are strings/uuids.
        return list(value or [])
    return value


def persist_receipt(row: ReceiptRow) -> str | None:
    """Synchronous INSERT. Caller must invoke via run_in_executor from async code.

    Returns the inserted id as a string, or None on any failure (including
    the feature flag being off). Never raises.
    """
    if not is_enabled():
        return None
    try:
        row = _truncate_for_storage(row)
        values = tuple(_serialize_value(col, getattr(row, col, None)) for col in _INSERT_COLUMNS)
        placeholders = ", ".join(["%s"] * len(_INSERT_COLUMNS))
        columns_sql = ", ".join(_INSERT_COLUMNS)
        with get_cursor() as cur:
            cur.execute(
                f"INSERT INTO ai_prompt_receipts ({columns_sql}) VALUES ({placeholders}) RETURNING id",
                values,
            )
            result = cur.fetchone()
            if not result:
                return None
            if isinstance(result, dict):
                return str(result.get("id"))
            return str(result[0])
    except Exception:
        logger.exception("failed to persist prompt receipt (request_id=%s)", row.request_id)
        return None


def update_upstream_usage(
    request_id: str, round_index: int, upstream_prompt_tokens: int | None
) -> None:
    """Patch ai_prompt_receipts.total_prompt_tokens_upstream after streaming ends."""
    if not is_enabled():
        return
    if upstream_prompt_tokens is None:
        return
    try:
        with get_cursor() as cur:
            cur.execute(
                "UPDATE ai_prompt_receipts "
                "SET total_prompt_tokens_upstream = %s "
                "WHERE request_id = %s AND round_index = %s",
                (int(upstream_prompt_tokens), request_id, int(round_index)),
            )
    except Exception:
        logger.exception("failed to update upstream usage for %s round %s", request_id, round_index)


def persist_thread_subject(
    conversation_id: str,
    request_id: str,
    session_id: str | None,
    env_id: str | None,
    business_id: str | None,
    actor: str,
    thread_subject: dict[str, Any],
    created_turn_index: int,
) -> None:
    """Write a minimal ai_prompt_receipts row carrying only thread_subject in notes_json.

    Used by the live Meridian structured runtime, which bypasses the normal
    prompt-receipt path but still needs to persist thread_subject for the next
    turn's inheritance.

    ``created_turn_index`` is the user-message count at the moment this turn is
    being answered (e.g., 1 for the first turn, 2 for the second). The next-turn
    consumer subtracts to compute live distance and applies expiry. Safe to call
    from run_in_executor. Never raises.
    """
    if not is_enabled():
        return
    try:
        # Embed created_turn_index in the persisted shape so load_prior_receipt_context
        # can compute live distance.
        ts_payload = dict(thread_subject)
        ts_payload["created_turn_index"] = int(created_turn_index)
        notes = json.dumps({"thread_subject": ts_payload}, default=str)
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO ai_prompt_receipts
                    (request_id, conversation_id, session_id, env_id, business_id,
                     actor, capture_point, notes_json)
                VALUES (%s, %s, %s, %s, %s, %s, 'structured_gate', %s)
                """,
                (
                    str(request_id),
                    str(conversation_id),
                    str(session_id) if session_id else None,
                    str(env_id) if env_id else None,
                    str(business_id) if business_id else None,
                    str(actor),
                    notes,
                ),
            )
    except Exception:
        logger.exception(
            "failed to persist thread_subject receipt for conversation %s", conversation_id
        )


def load_prior_receipt_context(
    conversation_id: str,
    current_turn_index: int | None = None,
) -> dict[str, Any]:
    """Return thread-subject fields from the most recent receipt for this conversation.

    Extracts concept_diagnostics (for prior_concept_id / prior_confidence) and
    thread_subject (for non-concept entity memory). Returns an empty dict on any
    failure — callers must treat all fields as optional.

    When ``current_turn_index`` is supplied AND the loaded thread_subject has a
    ``created_turn_index``, computes live ``turn_distance`` and drops the subject
    if it exceeds ``max_turn_distance`` (default 2). When either index is missing,
    falls back to the stored ``turn_distance`` and lets the consumer enforce its
    own bound — back-compat with receipts written before this PR.

    Safe to call from a run_in_executor thread.
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT notes_json
                FROM ai_prompt_receipts
                WHERE conversation_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (str(conversation_id),),
            )
            row = cur.fetchone()
        if not row:
            return {}
        notes = row["notes_json"] if isinstance(row, dict) else row[0]
        if isinstance(notes, str):
            notes = json.loads(notes)
        if not isinstance(notes, dict):
            return {}
        result: dict[str, Any] = {}
        cd = notes.get("concept_diagnostics") or {}
        if cd.get("concept_id"):
            result["prior_concept_id"] = cd["concept_id"]
            result["prior_concept_confidence"] = cd.get("concept_confidence")
        ts = notes.get("thread_subject") or {}
        if ts:
            # Compute live turn_distance from created_turn_index when both ends
            # are available. Stored turn_distance is set at write-time and
            # remains 0 — the consumer should trust the live computation.
            created_idx = ts.get("created_turn_index")
            if current_turn_index is not None and isinstance(created_idx, int):
                live_distance = max(0, int(current_turn_index) - int(created_idx))
                ts = dict(ts)
                ts["turn_distance"] = live_distance
                max_distance = int(ts.get("max_turn_distance") or 2)
                if live_distance > max_distance:
                    return result  # subject expired; do not return it
            result["prior_thread_subject"] = ts
        return result
    except Exception:
        logger.exception("failed to load prior receipt context for conversation %s", conversation_id)
        return {}
