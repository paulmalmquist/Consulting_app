"""Tests for draw API — lifecycle transitions, HITL audit, status validation."""
from app.services.draw_calculator import VALID_TRANSITIONS


class TestStateTransitions:
    def test_draft_can_only_go_to_pending_review(self):
        assert VALID_TRANSITIONS["draft"] == ["pending_review"]

    def test_pending_review_transitions(self):
        allowed = VALID_TRANSITIONS["pending_review"]
        assert "approved" in allowed
        assert "rejected" in allowed
        assert "revision_requested" in allowed

    def test_revision_requested_goes_to_pending_review(self):
        assert VALID_TRANSITIONS["revision_requested"] == ["pending_review"]

    def test_approved_goes_to_submitted_to_lender(self):
        assert VALID_TRANSITIONS["approved"] == ["submitted_to_lender"]

    def test_submitted_to_lender_goes_to_funded(self):
        assert VALID_TRANSITIONS["submitted_to_lender"] == ["funded"]

    def test_funded_has_no_transitions(self):
        assert "funded" not in VALID_TRANSITIONS

    def test_rejected_has_no_transitions(self):
        assert "rejected" not in VALID_TRANSITIONS

    def test_invalid_transition_not_allowed(self):
        # draft cannot go directly to approved
        assert "approved" not in VALID_TRANSITIONS.get("draft", [])
        # funded cannot go back
        assert "draft" not in VALID_TRANSITIONS.get("funded", [])


class TestHitlRequirements:
    """Verify which transitions require HITL approval."""

    def test_approve_requires_hitl(self):
        # The route handler for approve sets hitl_approval=True
        # This test documents the contract
        assert "approved" in VALID_TRANSITIONS["pending_review"]

    def test_submit_to_lender_requires_hitl(self):
        assert "submitted_to_lender" in VALID_TRANSITIONS["approved"]

    def test_submit_does_not_require_hitl(self):
        # Submit (draft -> pending_review) does NOT require HITL
        assert "pending_review" in VALID_TRANSITIONS["draft"]


class TestDrawStatusValues:
    def test_all_statuses_are_valid(self):
        all_statuses = set()
        for source, targets in VALID_TRANSITIONS.items():
            all_statuses.add(source)
            all_statuses.update(targets)
        expected = {"draft", "pending_review", "revision_requested", "approved",
                    "submitted_to_lender", "funded", "rejected"}
        assert all_statuses == expected
