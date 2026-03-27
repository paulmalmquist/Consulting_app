"""Consulting Revenue OS – Pipeline service.

Manages consulting-specific pipeline stages, kanban views, and stage advancement.
Builds on the canonical CRM tables (crm_pipeline_stage, crm_opportunity, crm_opportunity_stage_history).
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.reporting_common import resolve_tenant_id

# Consulting-specific pipeline stages (overrides generic CRM defaults)
_CONSULTING_STAGES = [
    ("research", "Research", 5, 0.05, False, False),
    ("identified", "Identified", 10, 0.10, False, False),
    ("contacted", "Contacted", 20, 0.15, False, False),
    ("engaged", "Engaged", 30, 0.25, False, False),
    ("meeting", "Meeting", 40, 0.40, False, False),
    ("qualified", "Qualified", 50, 0.55, False, False),
    ("proposal", "Proposal", 70, 0.70, False, False),
    ("closed_won", "Closed Won", 90, 1.0, True, True),
    ("closed_lost", "Closed Lost", 100, 0.0, True, False),
]


def list_consulting_pipeline_stages(*, business_id: UUID) -> list[dict]:
    """Return consulting pipeline stages, auto-seeding if none exist."""
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            SELECT crm_pipeline_stage_id, key, label, stage_order,
                   win_probability, is_closed, is_won, created_at
            FROM crm_pipeline_stage
            WHERE tenant_id = %s AND business_id = %s
            ORDER BY stage_order, created_at
            """,
            (tenant_id, str(business_id)),
        )
        rows = cur.fetchall()

        if rows:
            return rows

        # Auto-seed consulting-specific stages
        for key, label, order, prob, closed, won in _CONSULTING_STAGES:
            cur.execute(
                """
                INSERT INTO crm_pipeline_stage
                  (tenant_id, business_id, key, label, stage_order, win_probability, is_closed, is_won)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, business_id, key) DO NOTHING
                """,
                (tenant_id, str(business_id), key, label, order, prob, closed, won),
            )

        cur.execute(
            """
            SELECT crm_pipeline_stage_id, key, label, stage_order,
                   win_probability, is_closed, is_won, created_at
            FROM crm_pipeline_stage
            WHERE tenant_id = %s AND business_id = %s
            ORDER BY stage_order, created_at
            """,
            (tenant_id, str(business_id)),
        )
        return cur.fetchall()


def get_pipeline_kanban(*, env_id: str, business_id: UUID) -> dict:
    """Return opportunities grouped by pipeline stage in kanban format."""
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)

        # Get stages
        cur.execute(
            """
            SELECT crm_pipeline_stage_id, key, label, stage_order, win_probability
            FROM crm_pipeline_stage
            WHERE tenant_id = %s AND business_id = %s
            ORDER BY stage_order
            """,
            (tenant_id, str(business_id)),
        )
        stages = cur.fetchall()

        # Get open opportunities with stage info
        cur.execute(
            """
            SELECT o.crm_opportunity_id, o.name, o.amount,
                   a.name AS account_name,
                   s.key AS stage_key, s.label AS stage_label,
                   o.expected_close_date, o.created_at
            FROM crm_opportunity o
            LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            WHERE o.business_id = %s AND o.status = 'open'
            ORDER BY o.created_at DESC
            """,
            (str(business_id),),
        )
        opportunities = cur.fetchall()

    # Group opportunities by stage
    stage_map: dict[str, list[dict]] = {}
    for opp in opportunities:
        key = opp.get("stage_key") or "unknown"
        stage_map.setdefault(key, []).append(opp)

    total_pipeline = Decimal("0")
    weighted_pipeline = Decimal("0")
    columns = []

    for stage in stages:
        key = stage["key"]
        cards = stage_map.get(key, [])
        col_total = sum(Decimal(str(c.get("amount", 0))) for c in cards)
        prob = Decimal(str(stage.get("win_probability") or 0))
        col_weighted = col_total * prob
        total_pipeline += col_total
        weighted_pipeline += col_weighted

        columns.append({
            "stage_key": key,
            "stage_label": stage["label"],
            "stage_order": stage["stage_order"],
            "win_probability": prob,
            "cards": cards,
            "total_value": col_total,
            "weighted_value": col_weighted,
        })

    return {
        "columns": columns,
        "total_pipeline": total_pipeline,
        "weighted_pipeline": weighted_pipeline,
    }


def advance_opportunity_stage(
    *,
    business_id: UUID,
    opportunity_id: UUID,
    to_stage_key: str,
    note: str | None = None,
) -> dict:
    """Move an opportunity to a new stage and record history."""
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)

        # Get current stage
        cur.execute(
            """
            SELECT crm_pipeline_stage_id FROM crm_opportunity
            WHERE crm_opportunity_id = %s AND business_id = %s
            """,
            (str(opportunity_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Opportunity {opportunity_id} not found")
        from_stage_id = row["crm_pipeline_stage_id"]

        # Resolve target stage
        cur.execute(
            """
            SELECT crm_pipeline_stage_id, is_closed, is_won
            FROM crm_pipeline_stage
            WHERE tenant_id = %s AND business_id = %s AND key = %s
            """,
            (tenant_id, str(business_id), to_stage_key),
        )
        to_stage = cur.fetchone()
        if not to_stage:
            raise ValueError(f"Pipeline stage '{to_stage_key}' not found")

        to_stage_id = to_stage["crm_pipeline_stage_id"]

        # Update opportunity
        new_status = "open"
        if to_stage["is_closed"]:
            new_status = "won" if to_stage["is_won"] else "lost"

        cur.execute(
            """
            UPDATE crm_opportunity
            SET crm_pipeline_stage_id = %s, status = %s
            WHERE crm_opportunity_id = %s
            RETURNING crm_opportunity_id, name, status
            """,
            (str(to_stage_id), new_status, str(opportunity_id)),
        )
        updated = cur.fetchone()

        # Record stage history
        cur.execute(
            """
            INSERT INTO crm_opportunity_stage_history
              (tenant_id, business_id, crm_opportunity_id, from_stage_id, to_stage_id, changed_at, note)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                tenant_id,
                str(business_id),
                str(opportunity_id),
                str(from_stage_id) if from_stage_id else None,
                str(to_stage_id),
                datetime.now(timezone.utc),
                note or f"Moved to {to_stage_key}",
            ),
        )

    emit_log(
        level="info",
        service="backend",
        action="cro.pipeline.stage_advanced",
        message=f"Opportunity {opportunity_id} moved to {to_stage_key}",
        context={"opportunity_id": str(opportunity_id), "to_stage": to_stage_key},
    )
    return updated
