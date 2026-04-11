"""Prompt Strategy Engine — Layer 1 of Winston's prompt composition pipeline.

Decides WHAT goes into a prompt before the compiler decides HOW MUCH fits:

  router output           (lane, skill, intent, ...)    ┐
  resolved scope          (env, page, entity, filters)  │
  history + summary       (prior turns, rolling summary)│──▶  strategize()  ──▶  CompositionPlan
  user message            (raw text, may contain deictics)                             │
                                                                                        ▼
                                                                                compile_context()

The strategy engine is deterministic and override-capable. It collapses router
noise into a small set of composition profiles, resolves deictic references
like "this fund" using the active scope, selects a skill with deterministic
fallback rules, extracts a compact thread goal, picks a summary strategy, and
decomposes the scope into separately-prioritized sections.

See repo docs: skills/winston-remediation-playbook (memory loss post-mortem)
and skills/winston-agentic-build (composition control architecture).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, asdict, field
from typing import Any

from app.assistant_runtime.prompt_registry import SKILL_PROMPT_FILES, load_prompt
from app.services.lane_policy import LanePolicy, get_policy

STRATEGY_VERSION = "2026-04-11-v1"


# ── Composition profiles ───────────────────────────────────────────────────


@dataclass(frozen=True)
class CompositionProfile:
    """Deterministic override layer on top of router decisions.

    A profile locks the shape of the prompt for a known intent class. When the
    router returns a lane, the profile may override it. When the router
    returns a skill, the profile may force a specific skill. This collapses
    turn-to-turn router noise into a stable composition.
    """

    name: str
    force_lane: str | None = None
    force_skill: str | None = None
    force_no_rag: bool = False
    require_scope_entity: bool = False
    require_goal_anchor: bool = True
    summary_mode: str = "auto"  # 'auto' | 'always' | 'never'
    include_visible_records: bool = True
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


COMPOSITION_PROFILES: dict[str, CompositionProfile] = {
    "simple_lookup": CompositionProfile(
        name="simple_lookup",
        force_lane="A",
        force_no_rag=True,
        require_scope_entity=False,
        summary_mode="never",
        include_visible_records=False,
        require_goal_anchor=False,
        notes="Yes/no, status, and single-fact questions. No RAG, no summary.",
    ),
    "entity_question": CompositionProfile(
        name="entity_question",
        force_lane="B",
        require_scope_entity=True,
        summary_mode="auto",
        notes="Metric / attribute questions about an active entity.",
    ),
    "analysis": CompositionProfile(
        name="analysis",
        force_lane="C",
        force_skill="run_analysis",
        require_scope_entity=True,
        summary_mode="auto",
        notes="Structured analysis requiring scope and the analysis skill.",
    ),
    "lp_summary": CompositionProfile(
        name="lp_summary",
        force_lane="C",
        force_skill="generate_lp_summary",
        require_scope_entity=True,
        summary_mode="complement",
    ),
    "deep_reasoning": CompositionProfile(
        name="deep_reasoning",
        force_lane="D",
        summary_mode="complement",
        notes="Multi-entity or cross-fund reasoning with tool use.",
    ),
    "create_entity": CompositionProfile(
        name="create_entity",
        force_lane="C",
        force_skill="create_entity",
        require_scope_entity=False,
    ),
    "default": CompositionProfile(name="default"),
}


# Rule-based intent → profile mapping. First match wins. Runs AFTER the router.
# Keep this small and obvious; grows as we learn.
_PROFILE_RULES: list[tuple[str, str]] = [
    ("lookup", "simple_lookup"),
    ("status", "simple_lookup"),
    ("yes_no", "simple_lookup"),
    ("count", "simple_lookup"),
    ("explain_metric", "entity_question"),
    ("what_is", "entity_question"),
    ("how_much", "entity_question"),
    ("analyze", "analysis"),
    ("analysis", "analysis"),
    ("variance", "analysis"),
    ("compare", "analysis"),
    ("generate_lp", "lp_summary"),
    ("lp_summary", "lp_summary"),
    ("create", "create_entity"),
    ("build", "deep_reasoning"),
    ("deep", "deep_reasoning"),
]


def classify_profile(intent: str | None, router_lane: str | None) -> CompositionProfile:
    """Pick a composition profile from an intent string, falling back to default."""
    if intent:
        lowered = intent.lower()
        for needle, profile_name in _PROFILE_RULES:
            if needle in lowered:
                return COMPOSITION_PROFILES[profile_name]
    return COMPOSITION_PROFILES["default"]


def derive_intent_hint(
    *, router_skill_id: str | None, message: str
) -> str | None:
    """Derive a stable intent hint when the router doesn't provide one.

    The router's DispatchDecision today returns skill_id + lane but no intent
    string. We fold skill_id + message keywords into a best-effort hint so the
    profile rules have something to match.
    """
    parts: list[str] = []
    if router_skill_id:
        parts.append(router_skill_id)
    low = (message or "").lower()
    if "what is" in low or "what's" in low:
        parts.append("what_is")
    if "how much" in low or "how many" in low:
        parts.append("how_much")
    if "compare" in low:
        parts.append("compare")
    if "analyze" in low or "analysis" in low or "variance" in low:
        parts.append("analyze")
    if "create" in low or "add a" in low or "new " in low:
        parts.append("create")
    if "generate lp" in low or "lp report" in low or "lp summary" in low:
        parts.append("generate_lp")
    if "status" in low or "yes or no" in low or "is there" in low:
        parts.append("status")
    if "lookup" in low or "show me" in low or "find " in low:
        parts.append("lookup")
    return ".".join(parts) if parts else None


# ── Deictic resolution ─────────────────────────────────────────────────────


# Ordered: more-specific patterns first.
_DEICTIC_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bthis\s+(fund|asset|deal|investment|entity|property|loan)\b", re.IGNORECASE), "entity_label"),
    (re.compile(r"\bthe\s+(fund|asset|deal|investment|entity|property|loan)\b", re.IGNORECASE), "entity_label"),
    (re.compile(r"\bthis\s+page\b", re.IGNORECASE), "page_anchor"),
    (re.compile(r"\bhere\b", re.IGNORECASE), "page_anchor"),
    (re.compile(r"\bcurrent(ly)?\b", re.IGNORECASE), "quarter_or_page"),
    (re.compile(r"\bit\b", re.IGNORECASE), "entity_label_conservative"),
]


def resolve_deictics(
    user_message: str, scope_hint: dict[str, Any]
) -> tuple[str, list[dict[str, Any]]]:
    """Rewrite "this fund", "here", "currently", "it" using the active scope.

    Only rewrites when scope provides an unambiguous anchor. Always appends a
    trailing ``[context anchor: ...]`` line so the model has at least one
    explicit reference even when no in-message rewrite fires.

    Returns ``(resolved_text, rewrites)`` where ``rewrites`` is a list of dicts
    describing each substitution for the receipt.
    """
    text = user_message or ""
    rewrites: list[dict[str, Any]] = []

    entity_label = scope_hint.get("entity_label")
    page_title = scope_hint.get("page_title")
    quarter = scope_hint.get("quarter")

    for pattern, kind in _DEICTIC_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        replacement: str | None = None
        if kind == "entity_label" and entity_label:
            replacement = f'"{entity_label}"'
        elif kind == "entity_label_conservative" and entity_label:
            # Only rewrite bare "it" when there's no competing noun in the
            # sentence, to avoid false positives like "does it show the IRR".
            if not re.search(r"\b(fund|asset|deal|investment|property|loan|page|screen)\b", text, re.IGNORECASE):
                replacement = f'"{entity_label}"'
        elif kind == "page_anchor" and page_title:
            if entity_label:
                replacement = f'the {page_title} page for "{entity_label}"'
            else:
                replacement = f"the {page_title} page"
        elif kind == "quarter_or_page" and quarter:
            replacement = f"as of {quarter}"

        if replacement:
            text = text[: match.start()] + replacement + text[match.end():]
            rewrites.append(
                {"from": match.group(0), "to": replacement, "kind": kind}
            )

    # Append an explicit anchor line so the model always has an authoritative
    # reference even when no rewrite fired.
    anchor_parts: list[str] = []
    if entity_label:
        anchor_parts.append(f'active entity: "{entity_label}"')
    if page_title:
        anchor_parts.append(f"page: {page_title}")
    if quarter:
        anchor_parts.append(f"quarter: {quarter}")
    if anchor_parts:
        text = f"{text}\n\n[context anchor: {'; '.join(anchor_parts)}]"

    return text, rewrites


# ── Thread goal extraction ─────────────────────────────────────────────────


_GOAL_VERBS = {
    "validate", "verify", "check", "build", "fix", "review", "compare",
    "explain", "analyze", "investigate", "debug", "draft", "generate", "model",
    "audit", "troubleshoot", "reconcile", "forecast", "project", "design",
}


def extract_thread_goal(
    history: list[dict[str, Any]] | None, summary: str | None
) -> str | None:
    """Return a compact goal anchor (<≈120 tokens) for the current thread.

    Heuristic, no LLM call:
      1. Scan the last five user messages for an action verb from ``_GOAL_VERBS``.
      2. Otherwise, use the first sentence of the rolling summary if present.
      3. Otherwise, return None.
    """
    history = history or []
    recent_user: list[str] = [
        str(m.get("content") or "")
        for m in history
        if m.get("role") == "user"
    ][-5:]
    for msg in recent_user:
        words = msg.split()
        lowered = [w.lower().strip(".,!?:;") for w in words]
        for idx, word in enumerate(lowered):
            if word in _GOAL_VERBS:
                fragment = " ".join(words[idx: idx + 15])
                return f"The user is working on: {fragment}"

    if summary:
        first = summary.split(".")[0].strip()
        if first:
            return f"Thread goal: {first}."
    return None


# ── Deterministic skill selection ─────────────────────────────────────────


# (intent prefix, entity_type_or_None, lane_or_None, skill_id)
_SKILL_RULES: list[tuple[str, str | None, str | None, str]] = [
    ("explain_metric", None, None, "explain_metric"),
    ("what_is", None, None, "explain_metric"),
    ("analyze", None, "C", "run_analysis"),
    ("analyze", None, "D", "run_analysis"),
    ("analysis", None, "C", "run_analysis"),
    ("variance", None, None, "run_analysis"),
    ("lookup", None, None, "lookup_entity"),
    ("generate_lp", None, None, "generate_lp_summary"),
    ("lp_summary", None, None, "generate_lp_summary"),
    ("create", None, None, "create_entity"),
]


def select_skill(
    *,
    profile: CompositionProfile,
    router_skill_id: str | None,
    intent: str | None,
    entity_type: str | None,
    lane: str,
) -> tuple[str | None, str]:
    """Pick a skill_id deterministically.

    Priority: profile override  >  router decision  >  rule fallback  >  none.
    Returns ``(skill_id, source)`` where source is one of
    ``{'profile', 'router', 'rule', 'none'}``.
    """
    if profile.force_skill and profile.force_skill in SKILL_PROMPT_FILES:
        return profile.force_skill, "profile"
    if router_skill_id and router_skill_id in SKILL_PROMPT_FILES:
        return router_skill_id, "router"
    if intent:
        low = intent.lower()
        for prefix, et, ln, sid in _SKILL_RULES:
            if not low.startswith(prefix) and prefix not in low:
                continue
            if et is not None and et != entity_type:
                continue
            if ln is not None and ln != lane:
                continue
            if sid in SKILL_PROMPT_FILES:
                return sid, "rule"
    return None, "none"


def load_skill_instructions(skill_id: str | None) -> str:
    """Load a skill prompt file by id, or return empty string."""
    if not skill_id or skill_id not in SKILL_PROMPT_FILES:
        return ""
    try:
        return load_prompt(SKILL_PROMPT_FILES[skill_id])
    except Exception:
        return ""


# ── Thread summary strategy ────────────────────────────────────────────────


def pick_summary_strategy(
    *,
    profile: CompositionProfile,
    summary_available: bool,
    history_count: int,
    history_tokens_estimate: int,
    max_history_turns: int,
) -> str:
    """Return 'none' | 'complement' | 'replace_history'.

    Semantics:
      - ``none``              : don't include the summary at all.
      - ``complement``        : include summary + the recent-window history.
      - ``replace_history``   : include summary and truncate history to ~2 turns.
    """
    if profile.summary_mode == "never":
        return "none"
    if not summary_available:
        return "none"
    if profile.summary_mode == "always":
        return "complement"
    # auto
    if history_count <= max_history_turns and history_tokens_estimate < 800:
        return "none"
    if history_count > max_history_turns * 2:
        return "replace_history"
    return "complement"


# ── Structured scope decomposition ────────────────────────────────────────


@dataclass
class StructuredScope:
    """Scope decomposed into separately-prioritized sections.

    The compiler treats each section as an independent compiler item with its
    own priority and cut strategy, so compression is surgical. For example,
    ``scope_filters`` is cheapest to drop (priority 14) but ``scope_entity``
    is never dropped (priority 8, tied with ``thread_goal``).
    """

    environment_text: str = ""
    page_text: str = ""
    entity_text: str = ""
    filters_text: str = ""
    visible_records_text: str = ""
    # Bare facts used by deictic resolution:
    entity_label: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    page_title: str | None = None
    quarter: str | None = None
    short_label: str = ""


def _scope_text_line(label: str, value: Any) -> str:
    if value is None or value == "":
        return ""
    return f"{label}: {value}"


def _nonempty_lines(*lines: str) -> str:
    return "\n".join(line for line in lines if line)


def decompose_scope(
    resolved_scope: Any,
    context_envelope: Any,
) -> StructuredScope:
    """Turn a resolved scope + envelope into a structured, priority-ready bundle.

    Accepts pydantic models, dataclasses, or plain dicts so unit tests can
    pass lightweight shims without constructing the full runtime schemas.
    """

    def _attr(obj: Any, name: str, default: Any = None) -> Any:
        if obj is None:
            return default
        if isinstance(obj, dict):
            return obj.get(name, default)
        return getattr(obj, name, default)

    env_id = _attr(resolved_scope, "environment_id")
    env_slug = _attr(context_envelope, "environment_slug") or _attr(context_envelope, "env_slug")
    env_name = (
        _attr(context_envelope, "environment_name")
        or _attr(context_envelope, "env_name")
        or env_slug
    )
    business_id = _attr(resolved_scope, "business_id")
    schema_name = _attr(resolved_scope, "schema_name")
    industry = _attr(resolved_scope, "industry")

    entity_type = _attr(resolved_scope, "entity_type")
    entity_id = _attr(resolved_scope, "entity_id")
    entity_name = _attr(resolved_scope, "entity_name")

    page = _attr(context_envelope, "page", None)
    page_route = _attr(page, "route") if page is not None else None
    page_title = _attr(page, "title") if page is not None else None
    visible_widgets = _attr(page, "visible_widgets", []) if page is not None else []

    filters = _attr(context_envelope, "filters", None)
    quarter = (
        _attr(filters, "quarter")
        or _attr(filters, "period")
        or _attr(context_envelope, "quarter")
        if filters is not None
        else _attr(context_envelope, "quarter")
    )
    scenario = _attr(filters, "scenario") if filters is not None else None
    date_range = _attr(filters, "date_range") if filters is not None else None

    visible_records = _attr(context_envelope, "visible_records", None)
    if visible_records is None:
        visible_records = _attr(context_envelope, "visible_data", None)

    environment_text = _nonempty_lines(
        "[environment]",
        _scope_text_line("env_id", env_id),
        _scope_text_line("env_name", env_name),
        _scope_text_line("business_id", business_id),
        _scope_text_line("schema", schema_name),
        _scope_text_line("industry", industry),
    )

    page_text = ""
    if page is not None or page_title or page_route:
        page_text = _nonempty_lines(
            "[page]",
            _scope_text_line("title", page_title),
            _scope_text_line("route", page_route),
            _scope_text_line(
                "visible_widgets",
                ", ".join(visible_widgets) if visible_widgets else None,
            ),
        )

    entity_text = ""
    if entity_id or entity_name or entity_type:
        entity_text = _nonempty_lines(
            "[active entity]",
            _scope_text_line("type", entity_type),
            _scope_text_line("id", entity_id),
            _scope_text_line("name", entity_name),
        )

    filters_text = ""
    if quarter or scenario or date_range:
        filters_text = _nonempty_lines(
            "[filters]",
            _scope_text_line("quarter", quarter),
            _scope_text_line("scenario", scenario),
            _scope_text_line("date_range", date_range),
        )

    visible_records_text = ""
    if visible_records:
        # Keep this compact; the compiler will trim if needed.
        try:
            import json as _json
            vr_text = _json.dumps(visible_records, default=str)[:4000]
        except Exception:
            vr_text = str(visible_records)[:4000]
        visible_records_text = f"[visible records]\n{vr_text}"

    short_label_parts: list[str] = []
    if env_name:
        short_label_parts.append(str(env_name))
    if entity_name:
        short_label_parts.append(str(entity_name))
    elif entity_type and entity_id:
        short_label_parts.append(f"{entity_type}:{entity_id}")
    short_label = " / ".join(short_label_parts) or "no scope"

    return StructuredScope(
        environment_text=environment_text,
        page_text=page_text,
        entity_text=entity_text,
        filters_text=filters_text,
        visible_records_text=visible_records_text,
        entity_label=entity_name,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        page_title=page_title,
        quarter=str(quarter) if quarter else None,
        short_label=short_label,
    )


# ── Minimal mode bypass (lane A) ──────────────────────────────────────────


def minimal_prompt_for_lane_a(
    *,
    system_base: str,
    resolved_user_text: str,
    scope: StructuredScope,
    system_role: str = "system",
) -> list[dict[str, str]]:
    """Build a 3-message prompt directly for lane A.

    Bypasses the full compile_context path. Still writes a receipt downstream
    with ``capture_point="minimal"`` so lane A turns remain observable.
    """
    scope_header = scope.entity_text or scope.short_label or "no active entity"
    return [
        {
            "role": system_role,
            "content": (
                f"{system_base}\n\n"
                "[lane=A minimal mode — no RAG, no history beyond 2 turns, no domain blocks]"
            ),
        },
        {
            "role": system_role,
            "content": f"[scope] {scope.short_label}\n{scope_header}",
        },
        {"role": "user", "content": resolved_user_text},
    ]


# ── Strategize entry point ────────────────────────────────────────────────


@dataclass
class CompositionPlan:
    profile: CompositionProfile
    lane: str
    skill_id: str | None
    skill_source: str
    intent_hint: str | None
    original_user_text: str
    resolved_user_text: str
    deictic_rewrites: list[dict[str, Any]] = field(default_factory=list)
    scope: StructuredScope = field(default_factory=StructuredScope)
    thread_goal: str | None = None
    summary_strategy: str = "none"
    summary_text: str | None = None
    summary_version: int | None = None
    is_minimal: bool = False
    strategy_version: str = STRATEGY_VERSION
    diagnostics: dict[str, Any] = field(default_factory=dict)
    policy: LanePolicy = field(default_factory=lambda: get_policy("B"))


def strategize(
    *,
    router_lane: str,
    router_skill_id: str | None,
    router_intent: str | None,
    resolved_scope: Any,
    context_envelope: Any,
    history_messages: list[dict[str, Any]],
    summary_text: str | None,
    summary_version: int | None,
    user_message: str,
) -> CompositionPlan:
    """Produce a deterministic ``CompositionPlan`` ready for the compiler."""

    # Derive an intent string if the router didn't give us one.
    intent_hint = router_intent or derive_intent_hint(
        router_skill_id=router_skill_id, message=user_message
    )

    profile = classify_profile(intent_hint, router_lane)

    # Profile may override the lane. This is the determinism fix for router
    # noise: the same intent class always gets the same lane.
    effective_lane = profile.force_lane or _normalize_lane(router_lane)
    policy = get_policy(effective_lane)

    scope = decompose_scope(resolved_scope, context_envelope)

    diagnostics: dict[str, Any] = {
        "router_lane": _normalize_lane(router_lane),
        "effective_lane": effective_lane,
        "profile_override_applied": bool(
            profile.force_lane and profile.force_lane != _normalize_lane(router_lane)
        ),
        "profile_skill_override_applied": bool(
            profile.force_skill and profile.force_skill != router_skill_id
        ),
        "scope_downgrade_applied": False,
        "intent_hint_source": "router" if router_intent else ("derived" if intent_hint else "none"),
    }

    # Fail closed: if the profile requires an entity but scope doesn't have
    # one, fall back to the default profile rather than producing a
    # prompt that pretends to know what "this fund" means.
    if profile.require_scope_entity and not scope.entity_label:
        profile = COMPOSITION_PROFILES["default"]
        effective_lane = _normalize_lane(router_lane)
        policy = get_policy(effective_lane)
        diagnostics["scope_downgrade_applied"] = True

    # Deictic resolution uses the active scope hint.
    scope_hint = {
        "entity_label": scope.entity_label,
        "entity_type": scope.entity_type,
        "page_title": scope.page_title,
        "quarter": scope.quarter,
    }
    resolved_user_text, deictic_rewrites = resolve_deictics(user_message, scope_hint)

    skill_id, skill_source = select_skill(
        profile=profile,
        router_skill_id=router_skill_id,
        intent=intent_hint,
        entity_type=scope.entity_type,
        lane=effective_lane,
    )

    thread_goal = (
        extract_thread_goal(history_messages, summary_text)
        if profile.require_goal_anchor
        else None
    )

    summary_strategy = pick_summary_strategy(
        profile=profile,
        summary_available=bool(summary_text),
        history_count=len(history_messages or []),
        history_tokens_estimate=sum(
            len(str(m.get("content") or "")) for m in (history_messages or [])
        ) // 4,
        max_history_turns=policy.max_history_turns,
    )

    is_minimal = profile.force_lane == "A" and effective_lane == "A"

    return CompositionPlan(
        profile=profile,
        lane=effective_lane,
        skill_id=skill_id,
        skill_source=skill_source,
        intent_hint=intent_hint,
        original_user_text=user_message,
        resolved_user_text=resolved_user_text,
        deictic_rewrites=deictic_rewrites,
        scope=scope,
        thread_goal=thread_goal,
        summary_strategy=summary_strategy,
        summary_text=summary_text,
        summary_version=summary_version,
        is_minimal=is_minimal,
        strategy_version=STRATEGY_VERSION,
        diagnostics=diagnostics,
        policy=policy,
    )


def _normalize_lane(lane: str | None) -> str:
    """Collapse 'A_FAST' → 'A', etc. Accepts bare letters already."""
    if not lane:
        return "B"
    key = str(lane).upper()
    if "_" in key:
        key = key.split("_", 1)[0]
    if key in ("A", "B", "C", "D"):
        return key
    return "B"
