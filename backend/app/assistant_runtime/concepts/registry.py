from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from app.assistant_runtime.concepts.schema import (
    BehaviorTier,
    ConceptMatch,
    ConceptObject,
    MatchReason,
)

CONCEPTS_DIR = Path(__file__).resolve().parent
CONCEPT_FILES: dict[str, Path] = {
    "repe.noi_variance": CONCEPTS_DIR / "repe" / "noi_variance.json",
}

_INTENT_QUALIFIERS = (
    "variance",
    "miss",
    "missed",
    "off plan",
    "off budget",
    "bridge",
    "walk",
    "walk q",
    "down",
    "decline",
    "drop",
    "explain",
    "explanation",
    "vs underwriting",
    "vs budget",
    "vs forecast",
    "vs plan",
    "compared to",
    "headwind",
    "tailwind",
    "drag",
    "beat",
    "shortfall",
)

_DIRECTIONAL_PHRASES = (
    "down",
    "off",
    "light",
    "missed",
    "miss",
    "worse",
    "soft",
    "weak",
    "feels off",
    "looks light",
    "looks off",
    "going on",
    "what happened",
    "why is",
    "why was",
    "why did",
    "behind",
    "below",
    "lagging",
)

_METRIC_HINTS = (
    "noi",
    "net operating income",
    "net property income",
    "property noi",
    "revenue",
    "expenses",
    "opex",
    "operating expenses",
    "margin",
    "occupancy",
    "rent",
    "concessions",
    "bad debt",
)

_REFERENTIAL_PHRASES = (
    "what about",
    "and vs",
    "and versus",
    "compared to",
    "compared with",
    "the same",
    "same question",
    "same thing",
)

_REFERENTIAL_PRONOUNS = ("that", "this", "it", "those", "these")

_REFERENTIAL_LEAD_WORDS = ("and", "or", "but")

_BARE_WH_WORDS = ("what", "why", "how")


def _word_boundary_pattern(text: str) -> re.Pattern[str]:
    return re.compile(r"\b" + re.escape(text.lower()) + r"\b", re.IGNORECASE)


@lru_cache(maxsize=32)
def _load_concept_file(path: Path) -> ConceptObject:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return ConceptObject.model_validate(raw)


def list_concepts() -> list[str]:
    return list(CONCEPT_FILES.keys())


def load_concept(concept_id: str) -> ConceptObject:
    path = CONCEPT_FILES.get(concept_id)
    if path is None:
        raise KeyError(f"Unknown concept_id: {concept_id}")
    if not path.exists():
        raise FileNotFoundError(f"Concept file missing: {path}")
    return _load_concept_file(path)


def validate_concept_registry() -> None:
    missing = [str(p) for p in CONCEPT_FILES.values() if not p.exists()]
    if missing:
        raise ValueError(f"Missing concept files: {missing}")
    for concept_id in CONCEPT_FILES:
        load_concept(concept_id)


_LEADING_FILLER = (
    "explain",
    "what is",
    "what's",
    "whats",
    "show me",
    "give me",
    "tell me",
    "describe",
    "summarize",
    "summarise",
    "do you know",
    "can you",
    "could you",
    "please",
)


def _strip_leading_filler(message_low: str) -> str:
    text = message_low.strip()
    changed = True
    while changed:
        changed = False
        for filler in _LEADING_FILLER:
            if text.startswith(filler + " ") or text == filler:
                text = text[len(filler):].strip()
                changed = True
                break
    return text


def _scan_for_alias(message_low: str, alias: str) -> tuple[str, float, MatchReason] | None:
    alias_low = alias.lower().strip()
    if not alias_low:
        return None
    match = _word_boundary_pattern(alias_low).search(message_low)
    if match is None:
        return None

    stripped = _strip_leading_filler(message_low).rstrip("?.!,").strip()
    non_alias_chars = max(0, len(stripped) - len(alias_low))
    if stripped == alias_low or non_alias_chars <= 12:
        return alias, 1.0, MatchReason.EXACT_ALIAS

    if any(q in message_low for q in _INTENT_QUALIFIERS):
        return alias, 0.8, MatchReason.SUBSTRING_ALIAS

    return alias, 0.6, MatchReason.KEYWORD_CLUSTER


def _has_metric_hint(message_low: str) -> bool:
    return any(_word_boundary_pattern(m).search(message_low) for m in _METRIC_HINTS)


def _has_directional(message_low: str) -> bool:
    for phrase in _DIRECTIONAL_PHRASES:
        if " " in phrase:
            if phrase in message_low:
                return True
        elif _word_boundary_pattern(phrase).search(message_low):
            return True
    return False


def _has_intent_qualifier(message_low: str) -> bool:
    return any(q in message_low for q in _INTENT_QUALIFIERS)


def _is_bare_definition_question(message_low: str) -> bool:
    stripped = message_low.strip().rstrip("?").strip()
    if stripped.startswith("what is "):
        rest = stripped[len("what is "):].strip()
        if len(rest.split()) <= 3 and not _has_directional(rest) and not _has_intent_qualifier(rest):
            return True
    if stripped.startswith("what's "):
        rest = stripped[len("what's "):].strip()
        if len(rest.split()) <= 3 and not _has_directional(rest) and not _has_intent_qualifier(rest):
            return True
    if stripped.startswith("define "):
        return True
    return False


def is_referential_message(message: str) -> bool:
    if not message:
        return False
    low = message.lower().strip()
    stripped = low.rstrip("?.!").strip()
    if not stripped:
        return False
    for phrase in _REFERENTIAL_PHRASES:
        if phrase in stripped:
            return True
    first_word = stripped.split()[0] if stripped.split() else ""
    if first_word in _REFERENTIAL_PRONOUNS:
        return True
    if first_word in _REFERENTIAL_LEAD_WORDS:
        body = stripped[len(first_word):].strip()
        if body and len(body.split()) <= 6:
            return True
    if first_word in _BARE_WH_WORDS:
        words = stripped.split()
        if len(words) <= 5:
            tokens = " ".join(words[1:])
            if not re.search(r"[A-Z][a-zA-Z]{3,}", message):
                if not any(c.isdigit() for c in tokens):
                    return True
    return False


def match_concept(
    message: str,
    *,
    environment: str | None = None,
    entity_type: str | None = None,
    has_active_entity: bool = False,
) -> ConceptMatch | None:
    """Deterministic four-tier concept matcher.

    Tier 1 — exact alias (word-bounded) → 1.0
    Tier 2 — substring alias + intent qualifier → 0.8
    Tier 3 — keyword cluster (metric + directional/comparison) → 0.6
    Tier 4 — contextual trigger (entity present + metric/implied + directional) → 0.4–0.6
    Otherwise → no match.

    Bare definition questions ("What is NOI?") never match — they need the
    intent qualifier or directional language to pass.
    """

    if not message or not message.strip():
        return None

    message_low = message.lower()

    if _is_bare_definition_question(message_low) and not _has_directional(message_low):
        return None

    candidate_ids = list_concepts()
    candidates: list[ConceptObject] = []
    for concept_id in candidate_ids:
        try:
            concept = load_concept(concept_id)
        except (KeyError, FileNotFoundError):
            continue
        if not concept.applies_to(environment, entity_type):
            continue
        candidates.append(concept)

    if not candidates:
        return None

    best: tuple[ConceptObject, str | None, float, MatchReason] | None = None

    for concept in candidates:
        for alias in [*concept.aliases, concept.canonical_question]:
            hit = _scan_for_alias(message_low, alias)
            if hit is None:
                continue
            alias_text, confidence, reason = hit
            if best is None or confidence > best[2]:
                best = (concept, alias_text, confidence, reason)

    if best is not None and best[2] >= 0.8:
        concept, alias_text, confidence, reason = best
        return ConceptMatch(
            concept_id=concept.concept_id,
            version=concept.version,
            matched_alias=alias_text,
            confidence=confidence,
            match_reason=reason,
            behavior_tier=ConceptMatch.behavior_tier_for_confidence(confidence),
        )

    if _has_metric_hint(message_low) and (_has_directional(message_low) or _has_intent_qualifier(message_low)):
        for concept in candidates:
            return ConceptMatch(
                concept_id=concept.concept_id,
                version=concept.version,
                matched_alias=None,
                confidence=0.6,
                match_reason=MatchReason.KEYWORD_CLUSTER,
                behavior_tier=ConceptMatch.behavior_tier_for_confidence(0.6),
            )

    if has_active_entity and _has_directional(message_low):
        implied_metric = _has_metric_hint(message_low) or "going on" in message_low or "looks light" in message_low or "feels off" in message_low
        if implied_metric:
            confidence = 0.5 if _has_metric_hint(message_low) else 0.4
            for concept in candidates:
                return ConceptMatch(
                    concept_id=concept.concept_id,
                    version=concept.version,
                    matched_alias=None,
                    confidence=confidence,
                    match_reason=MatchReason.CONTEXTUAL_TRIGGER,
                    behavior_tier=ConceptMatch.behavior_tier_for_confidence(confidence),
                )

    return None


def match_with_inheritance(
    message: str,
    *,
    prior_concept_id: str | None,
    prior_confidence: float | None,
    environment: str | None = None,
    entity_type: str | None = None,
    has_active_entity: bool = False,
) -> ConceptMatch | None:
    """Apply follow-up inheritance: referential messages reuse the prior concept.

    Inherited matches carry the prior turn's confidence and a synthetic
    match_reason of REFERENTIAL_INHERITANCE so receipts and scorers can tell
    them apart from fresh matches.
    """
    if prior_concept_id and is_referential_message(message):
        try:
            concept = load_concept(prior_concept_id)
        except (KeyError, FileNotFoundError):
            concept = None
        if concept is not None:
            inherited_conf = prior_confidence if prior_confidence is not None else 0.7
            return ConceptMatch(
                concept_id=concept.concept_id,
                version=concept.version,
                matched_alias=None,
                confidence=inherited_conf,
                match_reason=MatchReason.REFERENTIAL_INHERITANCE,
                behavior_tier=ConceptMatch.behavior_tier_for_confidence(inherited_conf),
            )
    return match_concept(
        message,
        environment=environment,
        entity_type=entity_type,
        has_active_entity=has_active_entity,
    )


def _behavior_instruction(tier: BehaviorTier, concept: ConceptObject) -> str:
    if tier == BehaviorTier.PROCEED:
        return ""
    if tier == BehaviorTier.CLARIFY:
        return (
            "Confidence on this routing is moderate. Answer normally, then add exactly one short "
            "clarification sentence at the end inviting the user to redirect if you misread the question."
        )
    if tier == BehaviorTier.CONFIRM:
        return (
            "Confidence on this routing is low. Do not produce the analytical answer yet. Reply with a "
            "single one-line confirmation question naming the concept and active entity, and stop."
        )
    return ""


def load_concept_summary(
    concept_id: str,
    *,
    tier: int = 1,
    behavior_tier: BehaviorTier = BehaviorTier.PROCEED,
) -> str:
    """Render a concept object as text for the context compiler.

    tier=1 → canonical question + compressed driver taxonomy + output contract structure
    tier=2 → adds reasoning steps + failure modes + cannot-compute rules

    behavior_tier appends a templated instruction block when the match was
    low-confidence, so the model knows to clarify or confirm rather than
    relying on a free-text "low confidence" label.
    """
    concept = load_concept(concept_id)

    parts: list[str] = []
    parts.append(f"## Concept: {concept.concept_id} (v{concept.version})")
    parts.append(f"Canonical question: {concept.canonical_question}")

    required_names = concept.required_context.required_field_names()
    if required_names:
        parts.append("Required context: " + ", ".join(required_names))

    if concept.driver_taxonomy.buckets:
        parts.append("Driver taxonomy:")
        parts.append(concept.driver_taxonomy.compressed_text())

    if concept.output_contract.sections:
        section_line = " → ".join(concept.output_contract.all_section_names())
        parts.append(f"Output contract sections (in order): {section_line}")

    if tier >= 2:
        if concept.reasoning_steps:
            parts.append("Reasoning steps:")
            for step in concept.reasoning_steps:
                parts.append(f"- {step.name}: {step.description}")
        if concept.failure_modes:
            parts.append("Failure modes (use these instead of inventing):")
            for fm in concept.failure_modes:
                parts.append(f"- {fm.code}: {fm.description}")
        if concept.cannot_compute_rules:
            parts.append("Cannot compute if:")
            for rule in concept.cannot_compute_rules:
                parts.append(f"- {rule.precondition} → fail with {rule.failure_mode_code}")

    instruction = _behavior_instruction(behavior_tier, concept)
    if instruction:
        parts.append("")
        parts.append(instruction)

    return "\n".join(parts)
