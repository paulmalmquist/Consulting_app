"""Tests for pending query continuation state machine.

Covers:
  - is_continuation: positive and negative detection
  - is_cancellation: cancel patterns
  - resolve_continuation: slot filling, multi-slot, completion, clear-on-complete
  - _extract_slot_value: quarter normalization, metric extraction, numeric parsing
"""
from __future__ import annotations


from app.assistant_runtime.pending_query import (
    PendingQuery,
    clear_pending_query,
    get_pending_query,
    set_pending_query,
)
from app.assistant_runtime.continuation_detector import (
    is_cancellation,
    is_continuation,
    resolve_continuation,
)


# ── Fixtures ──────────────────────────────────────────────────────────

def _make_pq(missing_slots=None, template_key="repe.irr_ranked", params=None):
    return PendingQuery(
        template_key=template_key,
        params=params or {"business_id": "abc-123", "limit": 10},
        missing_slots=missing_slots or ["quarter"],
        prompt="get fund metrics for Meridian Fund III",
        clarification_asked="Which quarter? (e.g. 2026Q1, or say 'latest')",
    )


# ── is_continuation ───────────────────────────────────────────────────

class TestIsContinuation:
    def setup_method(self):
        clear_pending_query("t1")
        clear_pending_query("t2")

    def test_yes_with_pending(self):
        set_pending_query("t1", _make_pq())
        assert is_continuation("yes", "t1") is True

    def test_ok_with_pending(self):
        set_pending_query("t1", _make_pq())
        assert is_continuation("ok", "t1") is True

    def test_quarter_value_with_pending(self):
        set_pending_query("t1", _make_pq())
        assert is_continuation("2026Q1", "t1") is True

    def test_latest_with_pending(self):
        set_pending_query("t1", _make_pq())
        assert is_continuation("latest", "t1") is True

    def test_metric_name_with_pending(self):
        set_pending_query("t1", _make_pq(missing_slots=["metric"]))
        assert is_continuation("NOI", "t1") is True

    def test_numeric_limit_with_pending(self):
        set_pending_query("t1", _make_pq(missing_slots=["limit"]))
        assert is_continuation("20", "t1") is True

    def test_false_when_no_pending(self):
        # t2 has no pending query
        assert is_continuation("what is the NOI for Riverfront", "t2") is False

    def test_false_for_new_question_with_pending(self):
        set_pending_query("t1", _make_pq())
        # Full new question should NOT be a continuation
        assert is_continuation("show me the top 5 assets by NOI", "t1") is False

    def test_false_for_long_sentence_with_question_word(self):
        set_pending_query("t1", _make_pq())
        assert is_continuation("what is the best fund by IRR this year", "t1") is False


# ── is_cancellation ───────────────────────────────────────────────────

class TestIsCancellation:
    def test_no(self):
        assert is_cancellation("no") is True

    def test_cancel(self):
        assert is_cancellation("cancel") is True

    def test_never_mind(self):
        assert is_cancellation("never mind") is True

    def test_affirmative_not_cancel(self):
        assert is_cancellation("yes") is False

    def test_empty_not_cancel(self):
        assert is_cancellation("") is False


# ── resolve_continuation ──────────────────────────────────────────────

class TestResolveContinuation:
    def setup_method(self):
        clear_pending_query("t3")
        clear_pending_query("t4")
        clear_pending_query("t5")

    def test_resolves_last_slot_returns_complete(self):
        set_pending_query("t3", _make_pq(missing_slots=["quarter"]))
        result = resolve_continuation("2026Q1", "t3")
        assert result is not None
        assert result["template_key"] == "repe.irr_ranked"
        assert result["params"]["quarter"] == "2026Q1"
        # Store should be cleared
        assert get_pending_query("t3") is None

    def test_resolves_latest_quarter_as_none(self):
        set_pending_query("t3", _make_pq(missing_slots=["quarter"]))
        result = resolve_continuation("latest", "t3")
        assert result is not None
        # "latest" maps to None (SQL will use MAX())
        assert result["params"]["quarter"] is None

    def test_multi_slot_returns_none_when_more_needed(self):
        set_pending_query("t4", _make_pq(
            missing_slots=["quarter", "metric"],
            template_key="repe.noi_ranked",
        ))
        result = resolve_continuation("2026Q1", "t4")
        # Only first slot filled — more needed
        assert result is None
        # Store should still have pq with one slot remaining
        pq = get_pending_query("t4")
        assert pq is not None
        assert pq.missing_slots == ["metric"]
        assert pq.params["quarter"] == "2026Q1"

    def test_multi_slot_resolves_on_second_turn(self):
        set_pending_query("t4", _make_pq(
            missing_slots=["quarter", "metric"],
            template_key="repe.noi_ranked",
        ))
        # First slot
        resolve_continuation("2026Q1", "t4")
        # Second slot
        result = resolve_continuation("NOI", "t4")
        assert result is not None
        assert result["params"]["quarter"] == "2026Q1"
        assert get_pending_query("t4") is None

    def test_cancellation_clears_store(self):
        set_pending_query("t5", _make_pq())
        result = resolve_continuation("cancel", "t5")
        assert result is not None
        assert result.get("cancelled") is True
        assert get_pending_query("t5") is None

    def test_returns_none_when_no_pending(self):
        result = resolve_continuation("2026Q1", "nonexistent_thread")
        assert result is None
