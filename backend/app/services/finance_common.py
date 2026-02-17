"""Shared finance service helpers."""

from __future__ import annotations

from uuid import UUID


def get_partition_context(cur, business_id: UUID, partition_id: UUID) -> dict:
    cur.execute(
        """SELECT partition_id, tenant_id, business_id, key, partition_type, is_read_only, status
           FROM fin_partition
           WHERE partition_id = %s AND business_id = %s""",
        (str(partition_id), str(business_id)),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError("Partition not found for business")
    if row["status"] != "active":
        raise ValueError("Partition is not active")
    return row


def require_non_live_partition_for_simulation(context: dict) -> None:
    if context["partition_type"] == "live":
        raise ValueError("Simulation write APIs cannot mutate live partitions")
