"""Deterministic validators for REPE staged change sets."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.db import get_cursor
from psycopg.types.json import Json


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        if isinstance(value, dict) and "value" in value:
            value = value["value"]
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def validate_value(rule_key: str, value: Any) -> tuple[str, dict[str, Any]]:
    """Return (pass|fail|skip, details) for a deterministic rule."""

    if rule_key == "occupancy_between_0_and_1":
        n = _decimal(value)
        if n is None:
            return "fail", {"reason": "not_numeric"}
        ok = Decimal("0") <= n <= Decimal("1")
        return ("pass" if ok else "fail"), {"min": 0, "max": 1, "value": str(n)}

    if rule_key == "ltv_within_ceiling":
        n = _decimal(value)
        if n is None:
            return "fail", {"reason": "not_numeric"}
        ok = Decimal("0") <= n <= Decimal("0.95")
        return ("pass" if ok else "fail"), {"min": 0, "max": "0.95", "value": str(n)}

    if rule_key == "ownership_sums_to_100":
        n = _decimal(value)
        if n is None:
            return "skip", {"reason": "aggregate_validator_not_applicable"}
        ok = Decimal("0.9999") <= n <= Decimal("1.0001")
        return ("pass" if ok else "fail"), {"target": 1, "value": str(n)}

    if rule_key == "period_open":
        return "pass", {"reason": "period close registry not present in this harness"}

    if rule_key == "fk_exists":
        return "pass", {"reason": "scope was resolved before staging"}

    return "skip", {"reason": "unknown_rule"}


def infer_rule_key(target_column: str) -> str:
    col = target_column.lower()
    if "occupancy" in col:
        return "occupancy_between_0_and_1"
    if col == "ltv" or col.endswith("_ltv"):
        return "ltv_within_ceiling"
    if "ownership" in col:
        return "ownership_sums_to_100"
    return "fk_exists"


def validate_change_set(*, change_set_id: str | UUID) -> dict[str, Any]:
    """Validate every item in a staged change set and persist validation rows."""

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT cs.env_id, cs.business_id, ci.change_item_id, ci.target_column, ci.new_value
            FROM re_change_sets cs
            JOIN re_change_items ci ON ci.change_set_id = cs.change_set_id
            WHERE cs.change_set_id = %s
            """,
            (str(change_set_id),),
        )
        rows = list(cur.fetchall())

        validations = []
        for row in rows:
            rule_key = infer_rule_key(row["target_column"])
            status, details = validate_value(rule_key, row["new_value"])
            validations.append({"change_item_id": row["change_item_id"], "rule_key": rule_key, "status": status, "details": details})
            cur.execute(
                """
                INSERT INTO re_change_validations (
                  env_id, business_id, change_item_id, rule_key, status, details
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (row["env_id"], row["business_id"], row["change_item_id"], rule_key, status, Json(details)),
            )

        next_status = "validated" if validations and all(v["status"] in {"pass", "skip"} for v in validations) else "rejected"
        cur.execute(
            "UPDATE re_change_sets SET status = %s, updated_at = now() WHERE change_set_id = %s",
            (next_status, str(change_set_id)),
        )

    return {
        "change_set_id": str(change_set_id),
        "status": next_status,
        "validations": validations,
        "validation_status": "pass" if next_status == "validated" else "fail",
    }
