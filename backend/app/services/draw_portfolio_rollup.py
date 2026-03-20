"""Portfolio-level draw summary — aggregates draw data across all projects.

Follows the get_portfolio_summary() pattern from capital_projects.py.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor


def _d(val: Any) -> Decimal:
    if val is None:
        return Decimal("0")
    return Decimal(str(val)).quantize(Decimal("0.01"))


def get_draw_portfolio_summary(
    *,
    env_id: UUID,
    business_id: UUID,
) -> dict[str, Any]:
    """Aggregate draw data across all projects using v_project_draw_summary."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ds.*, p.name AS project_name,
                   (SELECT status FROM cp_draw_request
                    WHERE project_id = ds.project_id
                    ORDER BY draw_number DESC LIMIT 1) AS latest_status
            FROM v_project_draw_summary ds
            JOIN pds_projects p ON p.project_id = ds.project_id
            WHERE ds.env_id = %s::uuid AND ds.business_id = %s::uuid
            ORDER BY p.name
            """,
            (str(env_id), str(business_id)),
        )
        rows = cur.fetchall()

    total_draws = 0
    total_drawn = Decimal("0")
    total_retainage = Decimal("0")
    total_pending = 0
    projects: list[dict[str, Any]] = []

    for row in rows:
        draws = int(row.get("total_draws", 0))
        drawn = _d(row.get("total_drawn_amount"))
        ret = _d(row.get("total_retainage"))
        pending = int(row.get("pending_draws", 0))

        total_draws += draws
        total_drawn += drawn
        total_retainage += ret
        total_pending += pending

        projects.append({
            "project_id": str(row["project_id"]),
            "project_name": row.get("project_name", ""),
            "total_draws": draws,
            "total_drawn": str(drawn),
            "total_retainage": str(ret),
            "latest_draw_number": row.get("latest_draw_number"),
            "latest_status": row.get("latest_status"),
        })

    return {
        "total_projects": len(projects),
        "total_draws": total_draws,
        "total_drawn_amount": str(total_drawn),
        "total_retainage": str(total_retainage),
        "pending_draws": total_pending,
        "projects": projects,
    }


def get_budget_vs_actual(
    *,
    project_id: UUID,
    env_id: UUID,
    business_id: UUID,
) -> dict[str, Any]:
    """Compare budget line items to actual draw amounts."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              bl.cost_code,
              bl.line_label AS description,
              bl.approved_amount AS approved_budget,
              COALESCE(bl.committed_amount, 0) AS committed,
              COALESCE(drawn.total_drawn, 0) AS total_drawn
            FROM pds_budget_lines bl
            LEFT JOIN LATERAL (
              SELECT SUM(dli.total_completed) AS total_drawn
              FROM cp_draw_line_item dli
              JOIN cp_draw_request dr ON dr.draw_request_id = dli.draw_request_id
              WHERE dli.cost_code = bl.cost_code
                AND dr.project_id = bl.project_id
                AND dr.status IN ('funded','approved','submitted_to_lender')
            ) drawn ON true
            WHERE bl.project_id = %s::uuid AND bl.env_id = %s::uuid AND bl.business_id = %s::uuid
            ORDER BY bl.cost_code
            """,
            (str(project_id), str(env_id), str(business_id)),
        )
        rows = cur.fetchall()

    lines: list[dict[str, Any]] = []
    for row in rows:
        budget = _d(row.get("approved_budget"))
        drawn = _d(row.get("total_drawn"))
        remaining = budget - drawn
        pct = (drawn / budget * Decimal("100")).quantize(Decimal("0.01")) if budget > 0 else Decimal("0")

        lines.append({
            "cost_code": row["cost_code"],
            "description": row.get("description", ""),
            "approved_budget": str(budget),
            "committed": str(_d(row.get("committed"))),
            "total_drawn": str(drawn),
            "balance_remaining": str(remaining),
            "percent_drawn": str(pct),
        })

    return {
        "project_id": str(project_id),
        "lines": lines,
        "totals": {
            "approved_budget": str(sum(_d(l["approved_budget"]) for l in lines)),
            "committed": str(sum(_d(l["committed"]) for l in lines)),
            "total_drawn": str(sum(_d(l["total_drawn"]) for l in lines)),
            "balance_remaining": str(sum(_d(l["balance_remaining"]) for l in lines)),
        },
    }
