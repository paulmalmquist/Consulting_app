"""Finance scenario/snapshot service."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from app.db import get_cursor
from app.finance.scenario_engine import create_scenario_partition, create_snapshot
from app.services.finance_common import get_partition_context


def list_partitions(*, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT partition_id, tenant_id, business_id, key, partition_type,
                      base_partition_id, is_read_only, status, created_at
               FROM fin_partition
               WHERE business_id = %s
               ORDER BY
                 CASE partition_type
                   WHEN 'live' THEN 1
                   WHEN 'snapshot' THEN 2
                   WHEN 'scenario' THEN 3
                   ELSE 4
                 END,
                 created_at DESC""",
            (str(business_id),),
        )
        return cur.fetchall()


def snapshot_live_partition(
    *,
    business_id: UUID,
    live_partition_id: UUID,
    snapshot_as_of: date,
    dataset_version_id: UUID | None = None,
    rule_version_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, live_partition_id)
        if ctx["partition_type"] != "live":
            raise ValueError("Only live partitions can be snapshotted")

        return create_snapshot(
            cur,
            tenant_id=str(ctx["tenant_id"]),
            business_id=str(business_id),
            live_partition_id=str(live_partition_id),
            snapshot_as_of=snapshot_as_of,
            dataset_version_id=str(dataset_version_id) if dataset_version_id else None,
            rule_version_id=str(rule_version_id) if rule_version_id else None,
        )


def create_simulation(
    *,
    business_id: UUID,
    base_partition_id: UUID,
    scenario_key: str,
) -> dict:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, base_partition_id)
        return create_scenario_partition(
            cur,
            tenant_id=str(ctx["tenant_id"]),
            business_id=str(business_id),
            base_partition_id=str(base_partition_id),
            scenario_key=scenario_key,
        )


def diff_vs_live(*, simulation_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT partition_id, base_partition_id, partition_type, tenant_id, business_id
               FROM fin_partition
               WHERE partition_id = %s""",
            (str(simulation_id),),
        )
        scenario = cur.fetchone()
        if not scenario:
            raise LookupError("Simulation partition not found")
        if scenario["partition_type"] != "scenario":
            raise ValueError("simulation_id must point to a scenario partition")

        base_partition_id = scenario["base_partition_id"]
        if not base_partition_id:
            raise ValueError("Scenario partition has no baseline")

        cur.execute(
            """SELECT
                 COALESCE(SUM(al.amount), 0) AS total_allocated,
                 COUNT(*)::int AS line_count
               FROM fin_allocation_line al
               JOIN fin_allocation_run ar ON ar.fin_allocation_run_id = al.fin_allocation_run_id
               WHERE ar.partition_id = %s""",
            (str(simulation_id),),
        )
        scenario_totals = cur.fetchone()

        cur.execute(
            """SELECT
                 COALESCE(SUM(al.amount), 0) AS total_allocated,
                 COUNT(*)::int AS line_count
               FROM fin_allocation_line al
               JOIN fin_allocation_run ar ON ar.fin_allocation_run_id = al.fin_allocation_run_id
               WHERE ar.partition_id = %s""",
            (str(base_partition_id),),
        )
        live_totals = cur.fetchone()

        delta_total = scenario_totals["total_allocated"] - live_totals["total_allocated"]
        delta_lines = scenario_totals["line_count"] - live_totals["line_count"]

        return {
            "simulation_partition_id": scenario["partition_id"],
            "baseline_partition_id": base_partition_id,
            "simulation_total_allocated": scenario_totals["total_allocated"],
            "baseline_total_allocated": live_totals["total_allocated"],
            "delta_total_allocated": delta_total,
            "simulation_line_count": scenario_totals["line_count"],
            "baseline_line_count": live_totals["line_count"],
            "delta_line_count": delta_lines,
        }
