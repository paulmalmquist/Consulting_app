from __future__ import annotations

import pytest

from app.assistant_runtime.concepts import (
    BehaviorTier,
    ConceptMatch,
    ConceptObject,
    MatchReason,
    list_concepts,
    load_concept,
    load_concept_summary,
    match_concept,
)
from app.assistant_runtime.concepts.registry import (
    is_referential_message,
    match_with_inheritance,
    validate_concept_registry,
)


def test_registry_lists_noi_variance() -> None:
    assert "repe.noi_variance" in list_concepts()


def test_registry_validates_without_error() -> None:
    validate_concept_registry()


def test_load_concept_returns_full_object() -> None:
    concept = load_concept("repe.noi_variance")
    assert isinstance(concept, ConceptObject)
    assert concept.concept_id == "repe.noi_variance"
    assert concept.canonical_question
    assert "NOI variance" in concept.aliases
    assert "net property income variance" in concept.aliases
    assert "same-property NOI" in concept.aliases
    assert concept.driver_taxonomy.bucket_names()
    assert "rate" in concept.driver_taxonomy.bucket_names()
    assert "occupancy" in concept.driver_taxonomy.bucket_names()
    assert "concessions" in concept.driver_taxonomy.bucket_names()
    assert "bad_debt" in concept.driver_taxonomy.bucket_names()
    required = concept.required_context.required_field_names()
    assert "entity" in required
    assert "comparison_set" in required
    assert "basis" in required
    assert "scope" in required
    sections = concept.output_contract.required_section_names()
    assert sections == [
        "direct_answer",
        "metric_block",
        "driver_bridge",
        "reconciliation",
        "provenance",
        "caveats",
        "confidence",
    ]
    assert concept.file_requirements.get("property_pnl") is not None
    assert concept.file_requirements.get("rent_roll") is not None
    assert concept.file_requirements.get("underwriting") is not None


def test_load_concept_unknown_raises() -> None:
    with pytest.raises(KeyError):
        load_concept("repe.does_not_exist")


def test_behavior_tier_thresholds() -> None:
    assert ConceptMatch.behavior_tier_for_confidence(1.0) == BehaviorTier.PROCEED
    assert ConceptMatch.behavior_tier_for_confidence(0.7) == BehaviorTier.PROCEED
    assert ConceptMatch.behavior_tier_for_confidence(0.69) == BehaviorTier.CLARIFY
    assert ConceptMatch.behavior_tier_for_confidence(0.5) == BehaviorTier.CLARIFY
    assert ConceptMatch.behavior_tier_for_confidence(0.49) == BehaviorTier.CONFIRM
    assert ConceptMatch.behavior_tier_for_confidence(0.4) == BehaviorTier.CONFIRM
    assert ConceptMatch.behavior_tier_for_confidence(0.39) == BehaviorTier.NONE


# ── Tier 1: exact alias ────────────────────────────────────────────────────


def test_exact_alias_full_phrase() -> None:
    match = match_concept(
        "Explain net property income variance",
        environment="meridian",
        entity_type="asset",
    )
    assert match is not None
    assert match.concept_id == "repe.noi_variance"
    assert match.confidence == 1.0
    assert match.match_reason == MatchReason.EXACT_ALIAS
    assert match.behavior_tier == BehaviorTier.PROCEED


def test_exact_alias_same_store() -> None:
    match = match_concept(
        "What happened to same-store NOI?",
        environment="meridian",
        entity_type="asset",
    )
    assert match is not None
    assert match.concept_id == "repe.noi_variance"


# ── Tier 2: substring + intent qualifier ───────────────────────────────────


def test_substring_alias_with_intent() -> None:
    match = match_concept(
        "Why is NOI off plan this quarter?",
        environment="meridian",
        entity_type="asset",
        has_active_entity=True,
    )
    assert match is not None
    assert match.concept_id == "repe.noi_variance"
    assert match.confidence >= 0.6
    assert match.behavior_tier == BehaviorTier.PROCEED or match.behavior_tier == BehaviorTier.CLARIFY


def test_substring_alias_walk() -> None:
    match = match_concept(
        "Walk Q1 to Q2 NOI for Lakeside",
        environment="meridian",
        entity_type="asset",
    )
    assert match is not None
    assert match.concept_id == "repe.noi_variance"


# ── Tier 3: keyword cluster ────────────────────────────────────────────────


def test_keyword_cluster_metric_plus_directional() -> None:
    match = match_concept(
        "Why was revenue down in Q2?",
        environment="meridian",
        entity_type="asset",
    )
    assert match is not None
    assert match.concept_id == "repe.noi_variance"
    assert match.match_reason in {MatchReason.KEYWORD_CLUSTER, MatchReason.SUBSTRING_ALIAS}


# ── Tier 4: contextual trigger ─────────────────────────────────────────────


def test_contextual_trigger_whats_going_on() -> None:
    match = match_concept(
        "What's going on with this asset?",
        environment="meridian",
        entity_type="asset",
        has_active_entity=True,
    )
    assert match is not None
    assert match.concept_id == "repe.noi_variance"
    assert 0.4 <= match.confidence < 0.7
    assert match.match_reason == MatchReason.CONTEXTUAL_TRIGGER
    assert match.behavior_tier in {BehaviorTier.CLARIFY, BehaviorTier.CONFIRM}


def test_contextual_trigger_looks_light() -> None:
    match = match_concept(
        "This looks light, why?",
        environment="meridian",
        entity_type="asset",
        has_active_entity=True,
    )
    assert match is not None
    assert match.concept_id == "repe.noi_variance"
    assert match.match_reason == MatchReason.CONTEXTUAL_TRIGGER


def test_contextual_trigger_requires_active_entity() -> None:
    match = match_concept(
        "What's going on?",
        environment="meridian",
        entity_type="asset",
        has_active_entity=False,
    )
    assert match is None


def test_contextual_trigger_uses_page_context_for_metric_inference() -> None:
    # Directional message with no metric word and no soft-language allowlist
    # phrase. Page context names NOI directly (visible widget) — should match
    # at the page-implied confidence floor (0.4).
    match = match_concept(
        "Why is this fund off?",
        environment="meridian",
        entity_type="fund",
        has_active_entity=True,
        page_context="Fund Detail noi_strip kpi_strip quarterly_metrics",
    )
    assert match is not None
    assert match.concept_id == "repe.noi_variance"
    assert match.match_reason == MatchReason.CONTEXTUAL_TRIGGER
    assert match.confidence == 0.4
    assert match.behavior_tier in {BehaviorTier.CLARIFY, BehaviorTier.CONFIRM}


def test_contextual_trigger_page_context_via_page_title_words() -> None:
    # Page title alone (no widgets) carries enough metric signal. The message
    # has a directional phrase ("below") but no metric word.
    match = match_concept(
        "Why is this below where I expected?",
        environment="meridian",
        entity_type="fund",
        has_active_entity=True,
        page_context="Operating Performance Summary",
    )
    assert match is not None
    assert match.match_reason == MatchReason.CONTEXTUAL_TRIGGER
    assert match.confidence == 0.4


def test_contextual_trigger_unrelated_page_does_not_match() -> None:
    # Same directional-but-vague message, but page context is irrelevant
    # (legal review page) — should NOT match. Page context isn't a free pass;
    # it must actually imply an NOI-family metric.
    match = match_concept(
        "Why is this off?",
        environment="meridian",
        entity_type="fund",
        has_active_entity=True,
        page_context="Legal Review legal_clauses approval_queue",
    )
    assert match is None


def test_contextual_trigger_message_metric_outranks_page_inference() -> None:
    # When the message itself names the metric, confidence stays at 0.5
    # regardless of page context. Page-implied is the weaker signal.
    match = match_concept(
        "Why is NOI off?",
        environment="meridian",
        entity_type="fund",
        has_active_entity=True,
        page_context="Fund Detail noi_strip",
    )
    assert match is not None
    # "NOI" + directional ("off") triggers the keyword_cluster tier first
    # at 0.6, before contextual_trigger is even consulted.
    assert match.confidence >= 0.5


# ── Negative: bare definition, no scope, wrong env ────────────────────────


def test_bare_definition_does_not_match() -> None:
    assert match_concept("What is NOI?", environment="meridian", entity_type="asset") is None


def test_bare_definition_no_match_2() -> None:
    assert match_concept("Define net operating income", environment="meridian", entity_type="asset") is None


def test_unrelated_question_no_match() -> None:
    match = match_concept(
        "What is the weather today?",
        environment="meridian",
        entity_type="asset",
    )
    assert match is None


def test_environment_filter_excludes() -> None:
    match = match_concept(
        "Why is NOI off plan?",
        environment="floyorker",
        entity_type="asset",
        has_active_entity=True,
    )
    assert match is None


def test_entity_type_filter_excludes() -> None:
    match = match_concept(
        "Why is NOI off plan?",
        environment="meridian",
        entity_type="contact",
        has_active_entity=True,
    )
    assert match is None


# ── Referential message detection ──────────────────────────────────────────


def test_referential_what_about() -> None:
    assert is_referential_message("What about underwriting?")


def test_referential_compared_to() -> None:
    assert is_referential_message("Compared to last quarter?")


def test_referential_pronoun_lead() -> None:
    assert is_referential_message("That seems off, why?")


def test_referential_short_and_question() -> None:
    assert is_referential_message("Why?")


def test_referential_short_what_about_rate() -> None:
    assert is_referential_message("What about rate?")


def test_non_referential_full_question() -> None:
    assert not is_referential_message("Why did NOI miss the underwriting target for Austin West last quarter?")


def test_non_referential_with_entity() -> None:
    assert not is_referential_message("Explain Austin West NOI variance")


def test_referential_which_ones_with_qualifier() -> None:
    assert is_referential_message("which ones don't have a status")


def test_referential_which_ones_bare() -> None:
    assert is_referential_message("which ones?")


def test_referential_which_short() -> None:
    assert is_referential_message("which ones are missing")


def test_non_referential_which_long() -> None:
    # 6 words after stripping punctuation — exceeds the 5-word bare-WH limit
    assert not is_referential_message("which assets should we review for Q3")


# ── Inheritance integration ────────────────────────────────────────────────


def test_inheritance_carries_prior_concept() -> None:
    match = match_with_inheritance(
        "What about underwriting?",
        prior_concept_id="repe.noi_variance",
        prior_confidence=0.9,
        environment="meridian",
        entity_type="asset",
        has_active_entity=True,
    )
    assert match is not None
    assert match.concept_id == "repe.noi_variance"
    assert match.match_reason == MatchReason.REFERENTIAL_INHERITANCE
    assert match.confidence == 0.9


def test_inheritance_skipped_when_message_is_concrete() -> None:
    match = match_with_inheritance(
        "Explain net property income variance for River Park",
        prior_concept_id="repe.noi_variance",
        prior_confidence=0.9,
        environment="meridian",
        entity_type="asset",
    )
    assert match is not None
    assert match.match_reason != MatchReason.REFERENTIAL_INHERITANCE
    assert match.match_reason in {MatchReason.EXACT_ALIAS, MatchReason.SUBSTRING_ALIAS}


def test_inheritance_no_prior_falls_through() -> None:
    match = match_with_inheritance(
        "What about that?",
        prior_concept_id=None,
        prior_confidence=None,
        environment="meridian",
        entity_type="asset",
        has_active_entity=True,
    )
    assert match is None


# ── Concept summary rendering for compiler ─────────────────────────────────


def test_concept_summary_tier_1_includes_core_blocks() -> None:
    text = load_concept_summary("repe.noi_variance", tier=1)
    assert "repe.noi_variance" in text
    assert "Canonical question:" in text
    assert "Required context:" in text
    assert "Driver taxonomy:" in text
    assert "Output contract sections" in text
    assert "Failure modes" not in text


def test_concept_summary_tier_2_adds_reasoning_and_failures() -> None:
    text = load_concept_summary("repe.noi_variance", tier=2)
    assert "Reasoning steps:" in text
    assert "Failure modes" in text
    assert "Cannot compute if:" in text


def test_concept_summary_clarify_appends_instruction() -> None:
    text = load_concept_summary(
        "repe.noi_variance", tier=1, behavior_tier=BehaviorTier.CLARIFY
    )
    assert "clarification sentence" in text


def test_concept_summary_confirm_appends_instruction() -> None:
    text = load_concept_summary(
        "repe.noi_variance", tier=1, behavior_tier=BehaviorTier.CONFIRM
    )
    assert "one-line confirmation question" in text


def test_concept_summary_proceed_no_extra_instruction() -> None:
    text = load_concept_summary(
        "repe.noi_variance", tier=1, behavior_tier=BehaviorTier.PROCEED
    )
    assert "clarification sentence" not in text
    assert "confirmation question" not in text
