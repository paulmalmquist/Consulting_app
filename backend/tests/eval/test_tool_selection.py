"""Evaluation tests for request routing and lane classification.

Tests classify_request() directly — no LLM mocking needed since routing is regex-based.
"""
import json
from pathlib import Path

import pytest

from app.services.request_router import classify_request


_SEED_PATH = Path(__file__).parent / "seed_qa_pairs.json"
with open(_SEED_PATH) as _f:
    _QA_PAIRS = json.loads(_f.read())


@pytest.mark.parametrize(
    "qa",
    [p for p in _QA_PAIRS if "expected_lane" in p],
    ids=[p["id"] for p in _QA_PAIRS if "expected_lane" in p],
)
def test_lane_classification(qa, minimal_envelope, minimal_scope):
    """Verify each query is routed to the expected lane."""
    route = classify_request(
        message=qa["question"],
        context_envelope=minimal_envelope,
        resolved_scope=minimal_scope,
        visible_context_shortcut=False,
    )
    assert route.lane == qa["expected_lane"], (
        f"Q: {qa['question']!r} — expected lane {qa['expected_lane']}, got {route.lane}"
    )


@pytest.mark.parametrize(
    "qa",
    [p for p in _QA_PAIRS if "expected_skip_rag" in p],
    ids=[p["id"] for p in _QA_PAIRS if "expected_skip_rag" in p],
)
def test_rag_skip_detection(qa, minimal_envelope, minimal_scope):
    """Verify RAG is skipped/enabled as expected per lane."""
    route = classify_request(
        message=qa["question"],
        context_envelope=minimal_envelope,
        resolved_scope=minimal_scope,
        visible_context_shortcut=False,
    )
    assert route.skip_rag == qa["expected_skip_rag"], (
        f"Q: {qa['question']!r} — expected skip_rag={qa['expected_skip_rag']}, got {route.skip_rag}"
    )


@pytest.mark.parametrize(
    "qa",
    [p for p in _QA_PAIRS if p.get("expected_is_write")],
    ids=[p["id"] for p in _QA_PAIRS if p.get("expected_is_write")],
)
def test_write_detection(qa, minimal_envelope, minimal_scope):
    """Verify write/mutation queries are flagged as is_write=True."""
    route = classify_request(
        message=qa["question"],
        context_envelope=minimal_envelope,
        resolved_scope=minimal_scope,
        visible_context_shortcut=False,
    )
    assert route.is_write is True, (
        f"Q: {qa['question']!r} — expected is_write=True, got {route.is_write}"
    )


def test_vague_query_expansion_flag(minimal_envelope, minimal_scope):
    """Verify that vague queries set needs_query_expansion when they reach default/analytical routing.

    Note: Short vague queries like "How are we doing?" hit the <60 char path (Lane B)
    before analytical matchers run. Longer vague+analytical queries trigger expansion.
    """
    # This is long enough (>60 chars) and matches _VAGUE_QUERY_RE + default route
    route = classify_request(
        message="Give me an update on portfolio performance and what changed since last quarter please",
        context_envelope=minimal_envelope,
        resolved_scope=minimal_scope,
        visible_context_shortcut=False,
    )
    assert route.needs_query_expansion is True, (
        f"Expected needs_query_expansion=True, got {route.needs_query_expansion}"
    )


def test_visible_context_shortcut_forces_lane_a(minimal_envelope, minimal_scope):
    """When visible_context_shortcut=True, always route to Lane A."""
    route = classify_request(
        message="Compare IRR across all funds",
        context_envelope=minimal_envelope,
        resolved_scope=minimal_scope,
        visible_context_shortcut=True,
    )
    assert route.lane == "A"
    assert route.skip_rag is True
    assert route.skip_tools is True


def test_lp_summary_routes_to_analysis_with_rag(minimal_envelope, minimal_scope):
    route = classify_request(
        message="Generate LP summary",
        context_envelope=minimal_envelope,
        resolved_scope=minimal_scope,
        visible_context_shortcut=False,
    )
    assert route.lane == "C"
    assert route.skip_rag is False
    assert route.matched_pattern == "lp_summary"


def test_debt_watch_summary_routes_to_retrieval_path(minimal_envelope, minimal_scope):
    route = classify_request(
        message="Summarize the latest debt watch changes for this fund",
        context_envelope=minimal_envelope,
        resolved_scope=minimal_scope,
        visible_context_shortcut=False,
    )
    assert route.lane == "C"
    assert route.skip_rag is False
    assert route.matched_pattern == "debt_watch"


def test_data_source_prompt_routes_to_grounded_retrieval(minimal_envelope, minimal_scope):
    route = classify_request(
        message="What data is this based on?",
        context_envelope=minimal_envelope,
        resolved_scope=minimal_scope,
        visible_context_shortcut=False,
    )
    assert route.lane == "C"
    assert route.skip_rag is False
    assert route.matched_pattern == "source_audit"
