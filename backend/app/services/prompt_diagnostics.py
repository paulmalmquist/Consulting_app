"""Prompt receipt diagnostic rules — Layer 5 (feedback loop, inline path).

Evaluates a single receipt row-shape dict against a set of rules that surface
common memory-loss patterns. Runs inline at receipt-write time so each row
lands in the database with ``notes_json.flags = ["rag_overuse", ...]``
indexed for search. Also runs in the aggregated health view to count flag
occurrences per (env_id, composition_profile, hour) bucket.

Each rule is a pure predicate over a plain dict. The ``evaluate_row`` function
catches any exception from any rule and returns only the rules that fired
cleanly — a buggy rule never breaks receipt capture.

To add a rule: append a tuple to ``DIAGNOSTIC_RULES`` and update
``v_ai_prompt_health`` in the 10000 migration to count it.
"""
from __future__ import annotations

from typing import Any, Callable


Rule = tuple[str, Callable[[dict[str, Any]], bool], str, str]


def _get(row: dict[str, Any], key: str, default: Any = 0) -> Any:
    value = row.get(key, default)
    if value is None:
        return default
    return value


def _share(numerator: Any, denominator: Any) -> float:
    try:
        n = float(numerator or 0)
        d = float(denominator or 0)
        if d <= 0:
            return 0.0
        return n / d
    except (TypeError, ValueError):
        return 0.0


DIAGNOSTIC_RULES: list[Rule] = [
    (
        "rag_overuse",
        lambda r: _share(r.get("rag_tokens"), r.get("total_prompt_tokens")) > 0.6,
        "warning",
        "RAG chunks consumed more than 60% of the prompt budget.",
    ),
    (
        "history_starvation",
        lambda r: (
            (_get(r, "history_tokens") < 200)
            and (int(_get(r, "notes_json", {}).get("prior_messages_found", 0) or 0) > 4)
        ),
        "warning",
        "History was present in the conversation but <200 tokens made it into the prompt.",
    ),
    (
        "context_bloat",
        lambda r: (
            int(_get(r, "scope_environment_tokens", 0) or 0)
            + int(_get(r, "scope_page_tokens", 0) or 0)
            + int(_get(r, "scope_filters_tokens", 0) or 0)
        )
        > 5000,
        "info",
        "Scope environment + page + filters together exceeded 5000 tokens.",
    ),
    (
        "rag_crowded_out_history",
        lambda r: bool(r.get("history_truncated"))
        and _share(r.get("rag_tokens"), r.get("total_prompt_tokens")) > 0.4,
        "warning",
        "History was trimmed while RAG occupied more than 40% of the prompt.",
    ),
    (
        "skill_dominance",
        lambda r: _share(r.get("skill_instructions_tokens"), r.get("total_prompt_tokens")) > 0.3,
        "warning",
        "Skill instructions consumed more than 30% of the prompt budget.",
    ),
    (
        "hard_overflow",
        lambda r: any(
            (entry or {}).get("key") == "_hard_overflow"
            for entry in (r.get("enforcement_trace_json") or [])
        ),
        "error",
        "Budget was exceeded even after all cuts.",
    ),
    (
        "redundancy_high",
        lambda r: any(
            (entry or {}).get("similarity", 0) > 0.6
            for entry in (r.get("redundancy_filter_json") or [])
        ),
        "info",
        "Two sections had more than 60% token overlap.",
    ),
    (
        "profile_downgrade",
        lambda r: bool(
            _get(r, "notes_json", {}).get("strategy_diagnostics", {}).get("scope_downgrade_applied")
        ),
        "warning",
        "Composition profile required an entity but scope had none — fell back to default.",
    ),
    (
        "scope_drift",
        lambda r: bool(_get(r, "notes_json", {}).get("ui_scope_overrode_thread_scope")),
        "info",
        "UI scope overrode the thread's prior scope for this turn.",
    ),
]


def evaluate_row(row: dict[str, Any]) -> list[dict[str, Any]]:
    """Return a list of ``{rule, severity, explanation}`` dicts for every rule that fired.

    Any rule that raises is skipped silently so a broken predicate can't
    break receipt capture.
    """
    if not row:
        return []
    fired: list[dict[str, Any]] = []
    for name, predicate, severity, explanation in DIAGNOSTIC_RULES:
        try:
            if predicate(row):
                fired.append(
                    {
                        "rule": name,
                        "severity": severity,
                        "explanation": explanation,
                    }
                )
        except Exception:
            # A broken rule must never break capture.
            continue
    return fired
