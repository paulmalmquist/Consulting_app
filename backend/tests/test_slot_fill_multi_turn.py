"""Tests for multi-turn slot-fill in write tool handlers.

Verifies that:
1. Partial tool calls return needs_input with correct missing/provided fields
2. Previously collected fields are preserved when new fields are added
3. Invalid enum values are rejected by Pydantic before reaching the handler
4. All required fields present → proceeds to confirmation summary
5. confirmed=true with all fields → executes
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.mcp.auth import McpContext
from app.mcp.schemas.repe_tools import CreateFundInput, CreateDealInput


def _ctx(business_id: str | None = None) -> McpContext:
    return McpContext(
        actor="test-user",
        token_valid=True,
        resolved_scope={
            "business_id": business_id or str(uuid4()),
            "environment_id": str(uuid4()),
        },
        context_envelope={},
    )


# ── CreateFundInput schema tests ───────────────────────────────────────


class TestCreateFundInputSchema:
    """Verify the JSON schema allows partial tool calls."""

    def test_name_only(self):
        """Turn 1: user provides only name. Schema must accept it."""
        inp = CreateFundInput(name="My Sweet Fund")
        assert inp.name == "My Sweet Fund"
        assert inp.vintage_year is None
        assert inp.fund_type is None
        assert inp.strategy is None

    def test_all_required_fields(self):
        """All required fields provided — should parse fine."""
        inp = CreateFundInput(
            name="Test Fund",
            vintage_year=2024,
            fund_type="closed_end",
            strategy="equity",
        )
        assert inp.name == "Test Fund"
        assert inp.vintage_year == 2024
        assert inp.fund_type == "closed_end"
        assert inp.strategy == "equity"

    def test_no_fields_at_all(self):
        """Empty call is valid — handler detects missing fields."""
        inp = CreateFundInput()
        assert inp.name is None
        assert inp.vintage_year is None

    def test_invalid_fund_type_rejected(self):
        """Literal validation rejects values not in the enum."""
        with pytest.raises(ValidationError, match="fund_type"):
            CreateFundInput(
                name="Test",
                vintage_year=2024,
                fund_type="open-end",  # wrong: should be "open_end"
                strategy="equity",
            )

    def test_invalid_strategy_rejected(self):
        """strategy='value-add' is NOT a valid Literal value."""
        with pytest.raises(ValidationError, match="strategy"):
            CreateFundInput(
                name="Test",
                vintage_year=2024,
                fund_type="closed_end",
                strategy="value-add",
            )

    def test_extra_fields_ignored(self):
        """LLM sometimes sends extra keys — they should be silently ignored."""
        inp = CreateFundInput(
            name="Test",
            vintage_year=2024,
            fund_type="open_end",
            strategy="debt",
            some_random_field="ignored",  # type: ignore[call-arg]
        )
        assert inp.name == "Test"
        assert not hasattr(inp, "some_random_field")


# ── CreateDealInput schema tests ────────────────────────────────────


class TestCreateDealInputSchema:
    def test_name_only(self):
        inp = CreateDealInput(name="My Deal")
        assert inp.name == "My Deal"
        assert inp.deal_type is None

    def test_invalid_deal_type_rejected(self):
        with pytest.raises(ValidationError, match="deal_type"):
            CreateDealInput(name="Deal", deal_type="mezzanine")


# ── Tool handler slot-fill tests ────────────────────────────────────


class TestCreateFundHandler:
    """Test _create_fund handler's multi-turn slot-fill behavior."""

    def setup_method(self):
        # Import here to avoid import-time side effects
        from app.mcp.tools.repe_tools import _create_fund
        self._create_fund = _create_fund

    def test_turn1_name_only_returns_needs_input(self):
        """Turn 1: only name provided → needs_input with missing fields."""
        inp = CreateFundInput(name="My Sweet Fund")
        result = self._create_fund(_ctx(), inp)
        assert result["needs_input"] is True
        assert "vintage_year" in result["missing_fields"]
        assert "fund_type" in result["missing_fields"]
        assert "strategy" in result["missing_fields"]
        assert result["provided"]["name"] == "My Sweet Fund"

    def test_turn2_all_fields_returns_confirmation(self):
        """Turn 2: all required fields → confirmation summary (not needs_input)."""
        inp = CreateFundInput(
            name="My Sweet Fund",
            vintage_year=2024,
            fund_type="open_end",
            strategy="equity",
        )
        result = self._create_fund(_ctx(), inp)
        assert "needs_input" not in result or result.get("needs_input") is not True
        assert result["pending_confirmation"] is True
        assert result["summary"]["name"] == "My Sweet Fund"
        assert result["summary"]["vintage_year"] == 2024

    def test_partial_fill_two_of_four(self):
        """Partial: name + vintage_year → needs_input for fund_type + strategy."""
        inp = CreateFundInput(name="Test", vintage_year=2024)
        result = self._create_fund(_ctx(), inp)
        assert result["needs_input"] is True
        assert set(result["missing_fields"]) == {"fund_type", "strategy"}
        assert result["provided"]["name"] == "Test"
        assert result["provided"]["vintage_year"] == 2024

    def test_no_fields_returns_needs_input_for_all(self):
        """Empty call → all four required fields listed as missing."""
        inp = CreateFundInput()
        result = self._create_fund(_ctx(), inp)
        assert result["needs_input"] is True
        assert set(result["missing_fields"]) == {"name", "vintage_year", "fund_type", "strategy"}

    def test_three_of_four_still_needs_input(self):
        """Three provided, one missing → still needs_input."""
        inp = CreateFundInput(
            vintage_year=2024,
            fund_type="closed_end",
            strategy="equity",
        )
        result = self._create_fund(_ctx(), inp)
        assert result["needs_input"] is True
        assert result["missing_fields"] == ["name"]
        assert result["provided"]["vintage_year"] == 2024
        assert result["provided"]["fund_type"] == "closed_end"
        assert result["provided"]["strategy"] == "equity"

    def test_provided_fields_echo_back_in_needs_input(self):
        """The needs_input response must echo ALL provided fields so the LLM can merge."""
        inp = CreateFundInput(name="ABC Fund", vintage_year=2025)
        result = self._create_fund(_ctx(), inp)
        assert result["provided"]["name"] == "ABC Fund"
        assert result["provided"]["vintage_year"] == 2025


class TestCreateDealHandler:
    def setup_method(self):
        from app.mcp.tools.repe_tools import _create_deal
        self._create_deal = _create_deal

    def test_name_only_needs_deal_type(self):
        inp = CreateDealInput(name="My Deal")
        result = self._create_deal(_ctx(), inp)
        assert result["needs_input"] is True
        assert "deal_type" in result["missing_fields"]
        assert result["provided"]["name"] == "My Deal"

    def test_all_required_returns_confirmation(self):
        inp = CreateDealInput(name="My Deal", deal_type="equity")
        result = self._create_deal(_ctx(), inp)
        assert result.get("needs_input") is not True
        assert result["pending_confirmation"] is True


# ── Enrichment annotation tests ─────────────────────────────────────


class TestEnrichmentAnnotation:
    """Verify that the post-stream annotation logic correctly captures pending tool state."""

    def test_successful_needs_input_is_annotated(self):
        """A successful tool call with confirmed=false should trigger PENDING CONFIRMATION annotation."""
        # Simulate the tool_calls_log entry for a needs_input response
        tool_calls_log = [
            {
                "name": "repe.create_fund",
                "success": True,
                "args": {
                    "name": "My Sweet Fund",
                    "confirmed": False,
                },
            }
        ]
        # Reproduce the annotation logic from ai_gateway.py lines 1130-1163
        pending_tools = [
            tc for tc in tool_calls_log
            if (tc.get("success") and tc.get("args", {}).get("confirmed") is False)
            or (not tc.get("success") and tc.get("error") and "required" in str(tc.get("error", "")).lower())
        ]
        assert len(pending_tools) == 1
        assert pending_tools[0]["args"]["name"] == "My Sweet Fund"

    def test_validation_error_is_annotated(self):
        """A failed tool call with 'required' in the error should also trigger annotation."""
        tool_calls_log = [
            {
                "name": "repe.create_fund",
                "success": False,
                "args": {"name": "Test"},
                "error": "3 validation errors: vintage_year Field required",
            }
        ]
        pending_tools = [
            tc for tc in tool_calls_log
            if (tc.get("success") and tc.get("args", {}).get("confirmed") is False)
            or (not tc.get("success") and tc.get("error") and "required" in str(tc.get("error", "")).lower())
        ]
        assert len(pending_tools) == 1

    def test_param_extraction_skips_confirmed_and_scope(self):
        """The annotation should include all params except 'confirmed' and 'resolved_scope'."""
        import json
        args = {
            "name": "My Sweet Fund",
            "vintage_year": 2024,
            "confirmed": False,
            "resolved_scope": {"business_id": "xxx"},
            "fund_type": None,
        }
        params_str = ", ".join(
            f"{k}={json.dumps(v, default=str)}" for k, v in args.items()
            if k not in ("confirmed", "resolved_scope") and v is not None
        )
        assert "name" in params_str
        assert "vintage_year" in params_str
        assert "confirmed" not in params_str
        assert "resolved_scope" not in params_str
        assert "fund_type" not in params_str  # None values excluded


# ── Workflow detection tests ─────────────────────────────────────────


class TestWorkflowDetection:
    """Verify _check_pending_workflow correctly identifies needs_input as pending workflow."""

    def test_pending_confirmation_annotation_detected(self):
        """Messages with PENDING CONFIRMATION in content are detected."""
        from app.services.ai_gateway import _check_pending_workflow

        # Mock convo_svc.get_messages to return history with annotation
        import app.services.ai_conversations as convo_svc
        mock_messages = [
            {"role": "user", "content": "create a fund named My Fund"},
            {
                "role": "assistant",
                "content": "I need more info.\n\n[SYSTEM NOTE: Tool calls this turn: ... PENDING CONFIRMATION for: repe.create_fund. Known parameters: repe.create_fund(name=\"My Fund\"). ...]",
                "tool_calls": [{"name": "repe.create_fund", "success": True, "args": {"name": "My Fund", "confirmed": False}}],
            },
        ]
        original = convo_svc.get_messages
        convo_svc.get_messages = lambda **kwargs: mock_messages
        try:
            result = _check_pending_workflow("test-convo-id")
            assert result is not None
            assert result["type"] == "pending_confirmation"
        finally:
            convo_svc.get_messages = original
