"""Regression tests for GET /api/consulting/execution/board.

Guards the logger bug fix: when execution_auto.run_auto_generation raises, the
route must fail closed with a clean HTTP 500 ("Auto-task generation unavailable")
and must NOT raise a TypeError from a malformed emit_log() call.

History: emit_log() is keyword-only and does not accept exc_info=. The board
route previously called emit_log("error", ..., exc_info=auto_exc), so the
error handler itself raised TypeError and masked the real failure.

Observed error envelope (global handler wraps the HTTPException):
    {"detail": {"error_code": "INTERNAL_ERROR",
                "message": "500: Auto-task generation unavailable"}}
"""

from unittest.mock import patch
from uuid import uuid4


def _assert_fail_closed(resp):
    """The route must fail closed with the clean message, not an emit_log TypeError."""
    assert resp.status_code == 500
    message = resp.json()["detail"]["message"]
    assert "Auto-task generation unavailable" in message
    # If emit_log were still called with the old positional + exc_info=
    # signature, a TypeError would be raised before the HTTPException and
    # this clean message would never reach the client.
    assert "TypeError" not in message
    assert "exc_info" not in message


def test_board_fails_closed_when_auto_generation_raises(client):
    """A failing auto-generator yields a clean 500, not a TypeError."""
    business_id = str(uuid4())

    def _boom(*args, **kwargs):
        raise RuntimeError("simulated downstream auto-generation failure")

    with patch(
        "app.routes.consulting.execution_auto.run_auto_generation",
        side_effect=_boom,
    ):
        resp = client.get(
            f"/api/consulting/execution/board"
            f"?env_id=novendor&business_id={business_id}"
        )

    _assert_fail_closed(resp)


def test_board_logger_call_does_not_raise_typeerror(client):
    """emit_log in the failure path must accept its kwargs (regression)."""
    business_id = str(uuid4())

    with patch(
        "app.routes.consulting.execution_auto.run_auto_generation",
        side_effect=ValueError("boom"),
    ):
        resp = client.get(
            f"/api/consulting/execution/board"
            f"?env_id=novendor&business_id={business_id}"
        )

    _assert_fail_closed(resp)
