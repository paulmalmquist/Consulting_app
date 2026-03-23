"""Partition snapshot/scenario helpers for finance isolation."""

from __future__ import annotations

from datetime import date
from uuid import uuid4


def create_snapshot(
    cur,
    *,
    tenant_id: str,
    business_id: str,
    live_partition_id: str,
    snapshot_as_of: date,
    dataset_version_id: str | None = None,
    rule_version_id: str | None = None,
    created_by: str | None = None,
) -> dict:
    cur.execute(
        """SELECT partition_id, partition_type
           FROM fin_partition
           WHERE partition_id = %s AND tenant_id = %s AND business_id = %s""",
        (live_partition_id, tenant_id, business_id),
    )
    live = cur.fetchone()
    if not live:
        raise LookupError("Live partition not found")
    if live["partition_type"] != "live":
        raise ValueError("Snapshot source must be a live partition")

    snapshot_key = f"snapshot-{snapshot_as_of.isoformat()}-{str(uuid4())[:8]}"
    cur.execute(
        """INSERT INTO fin_partition
           (tenant_id, business_id, key, partition_type, base_partition_id, is_read_only, status, created_by)
           VALUES (%s, %s, %s, 'snapshot', %s, true, 'active', %s)
           RETURNING partition_id""",
        (tenant_id, business_id, snapshot_key, live_partition_id, created_by),
    )
    snapshot_partition_id = cur.fetchone()["partition_id"]

    cur.execute(
        """INSERT INTO fin_snapshot
           (tenant_id, business_id, live_partition_id, snapshot_partition_id, snapshot_as_of,
            dataset_version_id, rule_version_id, created_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING snapshot_id""",
        (
            tenant_id,
            business_id,
            live_partition_id,
            snapshot_partition_id,
            snapshot_as_of,
            dataset_version_id,
            rule_version_id,
            created_by,
        ),
    )
    snapshot_id = cur.fetchone()["snapshot_id"]

    return {
        "snapshot_id": snapshot_id,
        "snapshot_partition_id": snapshot_partition_id,
        "snapshot_key": snapshot_key,
    }


def create_scenario_partition(
    cur,
    *,
    tenant_id: str,
    business_id: str,
    base_partition_id: str,
    scenario_key: str,
    created_by: str | None = None,
) -> dict:
    cur.execute(
        """SELECT partition_id, partition_type
           FROM fin_partition
           WHERE partition_id = %s AND tenant_id = %s AND business_id = %s""",
        (base_partition_id, tenant_id, business_id),
    )
    base = cur.fetchone()
    if not base:
        raise LookupError("Base partition not found")

    cur.execute(
        """INSERT INTO fin_partition
           (tenant_id, business_id, key, partition_type, base_partition_id, is_read_only, status, created_by)
           VALUES (%s, %s, %s, 'scenario', %s, false, 'active', %s)
           RETURNING partition_id""",
        (tenant_id, business_id, scenario_key, base_partition_id, created_by),
    )
    scenario_partition_id = cur.fetchone()["partition_id"]

    return {
        "scenario_partition_id": scenario_partition_id,
        "scenario_key": scenario_key,
    }
