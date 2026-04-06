"""Integration test for pending action execution lifecycle.

Tests execute_confirmed_action() with mocked DB and registry.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest


class TestExecuteConfirmedAction:
    """Test execute_confirmed_action with mocked dependencies."""

    def _make_pending_row(self, *, status="confirmed", tool_name="repe.create_fund", params=None):
        return {
            "pending_action_id": str(uuid4()),
            "conversation_id": str(uuid4()),
            "business_id": str(uuid4()),
            "env_id": "test-env",
            "skill_id": "create_entity",
            "action_type": "create fund",
            "tool_name": tool_name,
            "params_json": json.dumps(params or {"name": "Test Fund"}),
            "status": status,
        }

    @patch("app.services.pending_action_manager._ensure_pending_actions_table")
    @patch("app.services.pending_action_manager.get_cursor")
    @patch("app.services.pending_action_manager._log_execution_receipt")
    def test_successful_execution(self, mock_log, mock_cursor_factory, mock_ensure):
        from app.services.pending_action_manager import execute_confirmed_action

        row = self._make_pending_row()
        pa_id = row["pending_action_id"]

        # Mock cursor: atomic claim returns the row
        mock_cur = MagicMock()
        mock_cur.fetchone.return_value = row
        mock_ctx = MagicMock()
        mock_ctx.__enter__ = MagicMock(return_value=mock_cur)
        mock_ctx.__exit__ = MagicMock(return_value=False)
        mock_cursor_factory.return_value = mock_ctx

        # Mock tool registry
        mock_handler = MagicMock(return_value={"fund_id": "new-123", "message": "Fund created"})
        mock_tool = MagicMock()
        mock_tool.input_model = MagicMock()
        mock_tool.input_model.model_fields = {"confirm": None, "name": None}
        mock_tool.handler = mock_handler

        mock_registry = MagicMock()
        mock_registry.get.return_value = mock_tool

        with patch("app.mcp.registry.registry", mock_registry):
            with patch("app.mcp.audit.execute_tool", return_value={"fund_id": "new-123", "message": "Fund created"}):
                result = execute_confirmed_action(
                    pa_id,
                    resolved_scope={"business_id": row["business_id"], "environment_id": "test-env"},
                    actor="test_user",
                )

        assert result["success"] is True
        assert result["status"] == "executed"
        assert result["tool_name"] == "repe.create_fund"
        mock_log.assert_called_once()

    @patch("app.services.pending_action_manager._ensure_pending_actions_table")
    @patch("app.services.pending_action_manager.get_cursor")
    @patch("app.services.pending_action_manager._log_execution_receipt")
    def test_double_execution_blocked(self, mock_log, mock_cursor_factory, mock_ensure):
        from app.services.pending_action_manager import execute_confirmed_action

        # Cursor returns None (no row matched WHERE status = 'confirmed')
        mock_cur = MagicMock()
        mock_cur.fetchone.return_value = None
        mock_ctx = MagicMock()
        mock_ctx.__enter__ = MagicMock(return_value=mock_cur)
        mock_ctx.__exit__ = MagicMock(return_value=False)
        mock_cursor_factory.return_value = mock_ctx

        result = execute_confirmed_action(
            str(uuid4()),
            resolved_scope={"business_id": str(uuid4())},
        )

        assert result["success"] is False
        assert result["status"] == "already_resolved"
        mock_log.assert_not_called()

    @patch("app.services.pending_action_manager._ensure_pending_actions_table")
    @patch("app.services.pending_action_manager.get_cursor")
    @patch("app.services.pending_action_manager._log_execution_receipt")
    @patch("app.services.pending_action_manager.resolve_pending_action")
    def test_missing_tool_fails_gracefully(self, mock_resolve, mock_log, mock_cursor_factory, mock_ensure):
        from app.services.pending_action_manager import execute_confirmed_action

        row = self._make_pending_row(tool_name="nonexistent.tool")
        pa_id = row["pending_action_id"]

        mock_cur = MagicMock()
        mock_cur.fetchone.return_value = row
        mock_ctx = MagicMock()
        mock_ctx.__enter__ = MagicMock(return_value=mock_cur)
        mock_ctx.__exit__ = MagicMock(return_value=False)
        mock_cursor_factory.return_value = mock_ctx

        mock_registry = MagicMock()
        mock_registry.get.return_value = None  # Tool not found

        with patch("app.mcp.registry.registry", mock_registry):
            result = execute_confirmed_action(
                pa_id,
                resolved_scope={"business_id": row["business_id"]},
            )

        assert result["success"] is False
        assert "not found" in result["error"]
        mock_resolve.assert_called_once()  # Should mark as failed

    @patch("app.services.pending_action_manager._ensure_pending_actions_table")
    @patch("app.services.pending_action_manager.get_cursor")
    @patch("app.services.pending_action_manager._log_execution_receipt")
    @patch("app.services.pending_action_manager.resolve_pending_action")
    def test_tool_execution_failure(self, mock_resolve, mock_log, mock_cursor_factory, mock_ensure):
        from app.services.pending_action_manager import execute_confirmed_action

        row = self._make_pending_row()
        pa_id = row["pending_action_id"]

        mock_cur = MagicMock()
        mock_cur.fetchone.return_value = row
        mock_ctx = MagicMock()
        mock_ctx.__enter__ = MagicMock(return_value=mock_cur)
        mock_ctx.__exit__ = MagicMock(return_value=False)
        mock_cursor_factory.return_value = mock_ctx

        mock_tool = MagicMock()
        mock_tool.input_model = MagicMock()
        mock_tool.input_model.model_fields = {"confirm": None}

        mock_registry = MagicMock()
        mock_registry.get.return_value = mock_tool

        with patch("app.mcp.registry.registry", mock_registry):
            with patch("app.mcp.audit.execute_tool", side_effect=ValueError("Validation failed")):
                result = execute_confirmed_action(
                    pa_id,
                    resolved_scope={"business_id": row["business_id"]},
                )

        assert result["success"] is False
        assert result["status"] == "failed"
        assert "Validation failed" in result["error"]
        mock_resolve.assert_called_once()  # Should mark as failed
