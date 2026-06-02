"""Ticket 7B regression guard — run_auto_generation must not hold a pooled
DB connection across its passes.

Incident: run_auto_generation opened ONE `with get_cursor()` and held it
across all 8 passes. Every GET /execution/board pinned one of the 10 pool
connections for the whole multi-pass run; under concurrency the pool drained
and the entire /api/consulting/* router hung.

Fix: each independent pass gets its own short-lived `with get_cursor()` so
the connection returns to the pool between passes.

This test wraps get_cursor with an instrumented context manager that tracks
how many cursors are checked out *at the same time*. If any future change
re-merges passes under one cursor, `max_concurrent` rises above 1 and this
fails loudly. It also asserts the cursor is acquired once per pass (8×), not
once total — proving the connection is genuinely released and re-acquired.
"""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import patch
from uuid import uuid4

from app.services import execution_auto
from tests.conftest import FakeCursor


def test_run_auto_generation_releases_cursor_between_passes():
    """No two passes may hold a cursor simultaneously; the pooled connection
    must be released and re-acquired per pass."""
    state = {"open": 0, "max_concurrent": 0, "acquisitions": 0}
    cur = FakeCursor()

    @contextmanager
    def instrumented_get_cursor():
        state["open"] += 1
        state["acquisitions"] += 1
        state["max_concurrent"] = max(state["max_concurrent"], state["open"])
        try:
            yield cur
        finally:
            state["open"] -= 1

    with patch(
        "app.services.execution_auto.get_cursor", instrumented_get_cursor
    ):
        report = execution_auto.run_auto_generation(
            env_id="envX", business_id=uuid4()
        )

    # The core invariant: never more than one cursor open at a time. A value
    # of 2+ means a pass nested or the old single-cursor-across-all-passes
    # structure was reintroduced.
    assert state["max_concurrent"] == 1, (
        f"run_auto_generation held {state['max_concurrent']} cursors at once "
        f"— passes must each scope their own get_cursor() so the pooled "
        f"connection is released between passes (Ticket 7B)."
    )
    # All cursors must be closed when the function returns.
    assert state["open"] == 0
    # The connection must be acquired once PER PASS, not once total — proof
    # the per-pass scoping is real. There are 8 passes today; if a pass is
    # added/removed this bound updates, but it must never drop to 1 (that
    # would mean a single cursor spans everything again).
    assert state["acquisitions"] >= 8, (
        f"expected one get_cursor() per pass (>=8), got "
        f"{state['acquisitions']} — passes may have been merged under one cursor."
    )
    # Behavior unchanged: report still has the AutoGenerateReport shape.
    for key in (
        "pipeline_no_next_action",
        "pipeline_stale_3d",
        "pipeline_no_outreach",
        "pipeline_proposal_sent_no_followup",
        "outreach_no_reply_2d",
        "proof_backlog_top",
        "promoted_to_today",
        "waiting_re_engaged",
    ):
        assert key in report, f"report missing key {key}"
        assert isinstance(report[key], int)
