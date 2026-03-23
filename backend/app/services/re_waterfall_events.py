"""Helpers for waterfall realtime event emission."""
from __future__ import annotations

from typing import Any


def insert_waterfall_event(
    cur,
    *,
    fund_id: str,
    run_id: str,
    event_type: str = "run_completed",
    payload: dict[str, Any] | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO re_waterfall_event (
            event_type,
            fund_id,
            run_id,
            payload
        )
        VALUES (%s, %s, %s, %s::jsonb)
        """,
        (
            event_type,
            fund_id,
            run_id,
            payload or {},
        ),
    )
