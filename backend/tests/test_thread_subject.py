"""Thread-subject inheritance tests for PR 7.

Tests cover:
- Asset-count follow-up: entity_type inherited from prior thread_subject
- Fund follow-up: entity_type = "fund" inherited
- NOI concept follow-up: prior_concept_id path, not thread_subject
- Active page entity beats stale thread_subject
- Unrelated message does not inherit thread_subject
- turn_distance = 3 causes subject to be ignored (expiry)
"""
from __future__ import annotations

import pytest

from app.services.prompt_strategy import strategize


def _make_thread_subject(
    entity_type: str,
    entity_label_plural: str,
    result_set_hint: str,
    last_metric: str,
    supported_followups: list[str],
    turn_distance: int = 0,
) -> dict:
    return {
        "subject_type": "entity_collection",
        "entity_type": entity_type,
        "entity_label_plural": entity_label_plural,
        "result_set_hint": result_set_hint,
        "last_metric": last_metric,
        "supported_followups": supported_followups,
        "environment_id": None,
        "confidence": 0.9,
        "source": "structured_executor",
        "turn_distance": turn_distance,
        "created_at": "2026-05-08T00:00:00Z",
    }


def _strategize(
    user_message: str,
    *,
    prior_thread_subject: dict | None = None,
    prior_concept_id: str | None = None,
    prior_concept_confidence: float | None = None,
    resolved_scope: dict | None = None,
    context_envelope: dict | None = None,
) -> dict:
    plan = strategize(
        router_lane="B",
        router_skill_id=None,
        router_intent=None,
        resolved_scope=resolved_scope or {},
        context_envelope=context_envelope or {"environment_slug": "meridian"},
        history_messages=[],
        summary_text=None,
        summary_version=None,
        user_message=user_message,
        prior_concept_id=prior_concept_id,
        prior_concept_confidence=prior_concept_confidence,
        prior_thread_subject=prior_thread_subject,
    )
    return plan.diagnostics


# ── Test 1: Asset-count → "which ones don't have a status" ────────────────


def test_asset_count_followup_inherits_entity_type() -> None:
    """After an asset-count answer, 'which ones don't have a status' inherits entity_type=asset."""
    ts = _make_thread_subject(
        entity_type="asset",
        entity_label_plural="assets",
        result_set_hint="portfolio_assets",
        last_metric="status_count",
        supported_followups=["missing_status", "noncanonical_status", "list_members"],
    )
    diag = _strategize("which ones don't have a status", prior_thread_subject=ts)
    assert diag["thread_subject_inherited"] is True
    assert diag["thread_subject_entity_type"] == "asset"
    assert diag["thread_subject_result_set_hint"] == "portfolio_assets"
    assert diag["thread_subject_last_metric"] == "status_count"
    assert "missing_status" in diag["thread_subject_supported_followups"]


# ── Test 2: Fund-count → "which ones are inactive" ────────────────────────


def test_fund_count_followup_inherits_fund_entity_type() -> None:
    """After a fund-count answer, 'which ones are inactive' inherits entity_type=fund."""
    ts = _make_thread_subject(
        entity_type="fund",
        entity_label_plural="funds",
        result_set_hint="portfolio_funds",
        last_metric="fund_count",
        supported_followups=["list_members", "missing_status"],
    )
    diag = _strategize("which ones are inactive", prior_thread_subject=ts)
    assert diag["thread_subject_inherited"] is True
    assert diag["thread_subject_entity_type"] == "fund"


# ── Test 3: NOI concept follow-up uses prior_concept_id, not thread_subject ──


def test_concept_followup_uses_concept_inheritance_not_thread_subject() -> None:
    """A referential follow-up to an NOI concept turn inherits concept_id via REFERENTIAL_INHERITANCE.

    'What about rate?' is referential (is_referential_message → True) so
    match_with_inheritance promotes prior_concept_id. The thread_subject carries
    entity_type=asset with entity_type already in scope — thread_subject
    does not override, and concept_id is still set.
    """
    ts = _make_thread_subject(
        entity_type="asset",
        entity_label_plural="assets",
        result_set_hint="portfolio_assets",
        last_metric="status_count",
        supported_followups=["missing_status"],
    )
    diag = _strategize(
        "What about rate?",
        prior_concept_id="repe.noi_variance",
        prior_concept_confidence=0.9,
        prior_thread_subject=ts,
        context_envelope={"environment_slug": "meridian"},
        # entity_type set in scope — thread_subject inheritance should not fire
        resolved_scope={"entity_type": "asset"},
    )
    # Concept inheritance fires for referential messages with a prior_concept_id.
    assert diag.get("concept_id") == "repe.noi_variance"
    # Thread subject must NOT override since scope.entity_type was already set.
    assert diag["thread_subject_inherited"] is False


# ── Test 4: Active page entity beats stale thread_subject ─────────────────


def test_active_page_entity_type_overrides_thread_subject() -> None:
    """When scope already has entity_type from the active page, thread_subject does NOT override it."""
    ts = _make_thread_subject(
        entity_type="asset",
        entity_label_plural="assets",
        result_set_hint="portfolio_assets",
        last_metric="status_count",
        supported_followups=["missing_status"],
    )
    # resolved_scope carries entity_type="fund" from the page
    diag = _strategize(
        "which ones don't have a status",
        prior_thread_subject=ts,
        resolved_scope={"entity_type": "fund"},
    )
    # thread_subject inheritance requires scope.entity_type to be empty —
    # since the page already set entity_type="fund", inheritance must NOT fire.
    assert diag["thread_subject_inherited"] is False


# ── Test 5: Unrelated message does not inherit ─────────────────────────────


def test_unrelated_message_does_not_inherit_thread_subject() -> None:
    """A non-referential question does not inherit thread_subject entity_type."""
    ts = _make_thread_subject(
        entity_type="asset",
        entity_label_plural="assets",
        result_set_hint="portfolio_assets",
        last_metric="status_count",
        supported_followups=["missing_status"],
    )
    # A full, self-contained question — not referential
    diag = _strategize(
        "What is the total committed capital across all funds?",
        prior_thread_subject=ts,
    )
    assert diag["thread_subject_inherited"] is False


# ── Test 6: turn_distance = 3 causes expiry ───────────────────────────────


def test_thread_subject_expires_at_turn_distance_3() -> None:
    """A thread_subject with turn_distance=3 exceeds the max (2) and must be ignored."""
    ts = _make_thread_subject(
        entity_type="asset",
        entity_label_plural="assets",
        result_set_hint="portfolio_assets",
        last_metric="status_count",
        supported_followups=["missing_status"],
        turn_distance=3,
    )
    diag = _strategize("which ones don't have a status", prior_thread_subject=ts)
    assert diag["thread_subject_inherited"] is False


# ── Test 7: turn_distance = 2 is still within expiry window ───────────────


def test_thread_subject_at_max_turn_distance_still_inherits() -> None:
    """A thread_subject with turn_distance=2 is exactly at the limit and must still fire."""
    ts = _make_thread_subject(
        entity_type="asset",
        entity_label_plural="assets",
        result_set_hint="portfolio_assets",
        last_metric="status_count",
        supported_followups=["missing_status"],
        turn_distance=2,
    )
    diag = _strategize("which ones don't have a status", prior_thread_subject=ts)
    assert diag["thread_subject_inherited"] is True
    assert diag["thread_subject_entity_type"] == "asset"
