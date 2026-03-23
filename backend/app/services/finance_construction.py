"""Construction finance domain service."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.finance.construction_forecast_engine import compute_forecast
from app.finance.utils import qmoney
from app.services.finance_common import get_partition_context


def _get_fin_project(cur, fin_project_id: UUID) -> dict:
    cur.execute(
        "SELECT * FROM fin_construction_project WHERE fin_construction_project_id = %s",
        (str(fin_project_id),),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError("Construction project not found")
    return row


def ensure_fin_project(
    *,
    business_id: UUID,
    partition_id: UUID,
    project_id: UUID,
    code: str,
    name: str,
) -> dict:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, partition_id)
        cur.execute(
            """SELECT *
               FROM fin_construction_project
               WHERE business_id = %s AND partition_id = %s AND project_id = %s""",
            (str(business_id), str(partition_id), str(project_id)),
        )
        existing = cur.fetchone()
        if existing:
            return existing

        cur.execute(
            """INSERT INTO fin_construction_project
               (tenant_id, business_id, partition_id, project_id, code, name, status)
               VALUES (%s, %s, %s, %s, %s, %s, 'active')
               RETURNING *""",
            (
                ctx["tenant_id"],
                str(business_id),
                str(partition_id),
                str(project_id),
                code,
                name,
            ),
        )
        return cur.fetchone()


def create_budget(
    *,
    fin_project_id: UUID,
    name: str,
    base_budget: Decimal,
) -> dict:
    with get_cursor() as cur:
        project = _get_fin_project(cur, fin_project_id)
        cur.execute(
            """INSERT INTO fin_budget
               (tenant_id, business_id, partition_id, fin_construction_project_id,
                name, currency_code, base_budget, status)
               VALUES (%s, %s, %s, %s, %s, 'USD', %s, 'active')
               RETURNING *""",
            (
                project["tenant_id"],
                project["business_id"],
                project["partition_id"],
                project["fin_construction_project_id"],
                name,
                qmoney(base_budget),
            ),
        )
        return cur.fetchone()


def list_budgets(*, fin_project_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fin_project(cur, fin_project_id)
        cur.execute(
            """SELECT *
               FROM fin_budget
               WHERE fin_construction_project_id = %s
               ORDER BY created_at DESC""",
            (str(fin_project_id),),
        )
        return cur.fetchall()


def create_budget_version(
    *,
    fin_budget_id: UUID,
    effective_date: date | None,
    notes: str | None,
    revised_budget: Decimal,
    csi_lines: list[dict] | None,
) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM fin_budget WHERE fin_budget_id = %s", (str(fin_budget_id),))
        budget = cur.fetchone()
        if not budget:
            raise LookupError("Budget not found")

        cur.execute(
            "SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM fin_budget_version WHERE fin_budget_id = %s",
            (str(fin_budget_id),),
        )
        next_version = cur.fetchone()["next_version"]

        cur.execute(
            """INSERT INTO fin_budget_version
               (tenant_id, business_id, partition_id, fin_budget_id, version_no,
                effective_date, notes, is_active)
               VALUES (%s, %s, %s, %s, %s, %s, %s, true)
               RETURNING *""",
            (
                budget["tenant_id"],
                budget["business_id"],
                budget["partition_id"],
                budget["fin_budget_id"],
                next_version,
                effective_date,
                notes,
            ),
        )
        version = cur.fetchone()

        cur.execute(
            "UPDATE fin_budget_version SET is_active = false WHERE fin_budget_id = %s AND fin_budget_version_id <> %s",
            (budget["fin_budget_id"], version["fin_budget_version_id"]),
        )

        lines = csi_lines or [
            {
                "csi_division": "00",
                "cost_code": "BASE",
                "description": "Base budget",
                "original_budget": qmoney(revised_budget),
                "approved_changes": Decimal("0"),
                "revised_budget": qmoney(revised_budget),
                "committed_cost": Decimal("0"),
                "actual_cost": Decimal("0"),
            }
        ]

        for line in lines:
            cur.execute(
                """INSERT INTO fin_budget_line_csi
                   (tenant_id, business_id, partition_id, fin_budget_version_id,
                    csi_division, cost_code, description, original_budget,
                    approved_changes, revised_budget, committed_cost, actual_cost)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    budget["tenant_id"],
                    budget["business_id"],
                    budget["partition_id"],
                    version["fin_budget_version_id"],
                    line["csi_division"],
                    line["cost_code"],
                    line.get("description"),
                    qmoney(line.get("original_budget", revised_budget)),
                    qmoney(line.get("approved_changes", 0)),
                    qmoney(line.get("revised_budget", revised_budget)),
                    qmoney(line.get("committed_cost", 0)),
                    qmoney(line.get("actual_cost", 0)),
                ),
            )

        return version


def list_budget_versions(*, fin_project_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fin_project(cur, fin_project_id)
        cur.execute(
            """SELECT bv.*, b.name AS budget_name
               FROM fin_budget_version bv
               JOIN fin_budget b ON b.fin_budget_id = bv.fin_budget_id
               WHERE b.fin_construction_project_id = %s
               ORDER BY bv.created_at DESC""",
            (str(fin_project_id),),
        )
        return cur.fetchall()


def create_change_order(
    *,
    fin_project_id: UUID,
    change_order_ref: str,
    cost_impact: Decimal,
    schedule_impact_days: int,
    status: str,
) -> dict:
    with get_cursor() as cur:
        project = _get_fin_project(cur, fin_project_id)
        cur.execute(
            """SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version
               FROM fin_change_order_version
               WHERE fin_construction_project_id = %s AND change_order_ref = %s""",
            (project["fin_construction_project_id"], change_order_ref),
        )
        next_version = cur.fetchone()["next_version"]

        cur.execute(
            """INSERT INTO fin_change_order_version
               (tenant_id, business_id, partition_id, fin_construction_project_id,
                change_order_ref, version_no, status, cost_impact, schedule_impact_days, submitted_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
               RETURNING *""",
            (
                project["tenant_id"],
                project["business_id"],
                project["partition_id"],
                project["fin_construction_project_id"],
                change_order_ref,
                next_version,
                status,
                qmoney(cost_impact),
                schedule_impact_days,
            ),
        )
        return cur.fetchone()


def list_change_orders(*, fin_project_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fin_project(cur, fin_project_id)
        cur.execute(
            """SELECT *
               FROM fin_change_order_version
               WHERE fin_construction_project_id = %s
               ORDER BY change_order_ref, version_no DESC""",
            (str(fin_project_id),),
        )
        return cur.fetchall()


def run_forecast(
    *,
    fin_run_id: UUID,
    fin_project_id: UUID,
    as_of_date: date,
) -> dict:
    with get_cursor() as cur:
        project = _get_fin_project(cur, fin_project_id)

        cur.execute(
            """SELECT bl.*
               FROM fin_budget_line_csi bl
               JOIN fin_budget_version bv ON bv.fin_budget_version_id = bl.fin_budget_version_id
               JOIN fin_budget b ON b.fin_budget_id = bv.fin_budget_id
               WHERE b.fin_construction_project_id = %s
                 AND bv.is_active = true""",
            (project["fin_construction_project_id"],),
        )
        lines = cur.fetchall()
        if not lines:
            raise ValueError("No active budget version lines found for forecast")

        revised = qmoney(sum((qmoney(r["revised_budget"]) for r in lines), Decimal("0")))
        committed = qmoney(sum((qmoney(r["committed_cost"]) for r in lines), Decimal("0")))
        actual = qmoney(sum((qmoney(r["actual_cost"]) for r in lines), Decimal("0")))

        summary = compute_forecast(
            revised_budget=revised,
            committed_cost=committed,
            actual_cost=actual,
        )

        cur.execute(
            """INSERT INTO fin_forecast_snapshot
               (tenant_id, business_id, partition_id, fin_construction_project_id,
                as_of_date, forecast_at_completion, total_budget, total_committed,
                total_actual, total_remaining, status, fin_run_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'completed', %s)
               RETURNING *""",
            (
                project["tenant_id"],
                project["business_id"],
                project["partition_id"],
                project["fin_construction_project_id"],
                as_of_date,
                summary["forecast_at_completion"],
                summary["total_budget"],
                summary["total_committed"],
                summary["total_actual"],
                summary["total_remaining"],
                str(fin_run_id),
            ),
        )
        snapshot = cur.fetchone()

        for line in lines:
            variance_amount = qmoney(qmoney(line["actual_cost"]) - qmoney(line["revised_budget"]))
            variance_pct = qmoney(
                (variance_amount / qmoney(line["revised_budget"])) if qmoney(line["revised_budget"]) != 0 else 0
            )
            cur.execute(
                """INSERT INTO fin_forecast_line
                   (tenant_id, business_id, partition_id, fin_forecast_snapshot_id,
                    csi_division, cost_code, forecast_cost, variance_amount, variance_pct)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    project["tenant_id"],
                    project["business_id"],
                    project["partition_id"],
                    snapshot["fin_forecast_snapshot_id"],
                    line["csi_division"],
                    line["cost_code"],
                    qmoney(line["actual_cost"]),
                    variance_amount,
                    variance_pct,
                ),
            )

        return {
            "deterministic_hash": f"forecast:{snapshot['fin_forecast_snapshot_id']}",
            "result_refs": [{"result_table": "fin_forecast_snapshot", "result_id": snapshot["fin_forecast_snapshot_id"]}],
            "forecast_snapshot_id": snapshot["fin_forecast_snapshot_id"],
            "forecast_at_completion": summary["forecast_at_completion"],
        }


def list_forecasts(*, fin_project_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_fin_project(cur, fin_project_id)
        cur.execute(
            """SELECT *
               FROM fin_forecast_snapshot
               WHERE fin_construction_project_id = %s
               ORDER BY as_of_date DESC, created_at DESC""",
            (str(fin_project_id),),
        )
        return cur.fetchall()
