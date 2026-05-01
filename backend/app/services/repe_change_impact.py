"""Impact preview helpers for staged REPE change sets."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID, uuid4

from app.db import get_cursor


def _num(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        if isinstance(value, dict) and "value" in value:
            value = value["value"]
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def compute_change_impact(*, change_set_id: str | UUID) -> dict[str, Any]:
    """Persist a deterministic impact preview for a staged/validated change set."""

    engine_run_id = uuid4()
    previews: list[dict[str, Any]] = []

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT cs.env_id, cs.business_id, cs.entity_type, cs.entity_id, cs.period,
                   ci.target_column, ci.old_value, ci.new_value
            FROM re_change_sets cs
            JOIN re_change_items ci ON ci.change_set_id = cs.change_set_id
            WHERE cs.change_set_id = %s
            """,
            (str(change_set_id),),
        )
        rows = list(cur.fetchall())

        for row in rows:
            before = _num(row["old_value"])
            after = _num(row["new_value"])
            delta = None if before is None or after is None else after - before
            affected_metric_key = str(row["target_column"])
            preview = {
                "affected_metric_key": affected_metric_key,
                "affected_entity_type": row["entity_type"],
                "affected_entity_id": row["entity_id"],
                "affected_period": row["period"],
                "before_value": before,
                "after_value": after,
                "delta": delta,
                "compute_engine": "reporting",
                "engine_run_id": engine_run_id,
            }
            previews.append(preview)
            cur.execute(
                """
                INSERT INTO re_change_impact_preview (
                  env_id, business_id, change_set_id, affected_metric_key,
                  affected_entity_type, affected_entity_id, affected_period,
                  before_value, after_value, delta, compute_engine, engine_run_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    row["env_id"],
                    row["business_id"],
                    str(change_set_id),
                    affected_metric_key,
                    row["entity_type"],
                    row["entity_id"],
                    row["period"],
                    before,
                    after,
                    delta,
                    "reporting",
                    engine_run_id,
                ),
            )

        cur.execute(
            """
            UPDATE re_change_sets
            SET status = 'impact_computed', updated_at = now()
            WHERE change_set_id = %s AND status IN ('staged', 'validated', 'impact_computed')
            """,
            (str(change_set_id),),
        )

    return {
        "change_set_id": str(change_set_id),
        "status": "impact_computed",
        "engine_run_id": str(engine_run_id),
        "impact_preview": previews,
    }
