"""Draw Calculator — line item population, G702/G703 math, and total aggregation.

Follows the G702 computation pattern from capital_projects.create_pay_app().
"""
from __future__ import annotations

import json
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import draw_audit


# ── Helpers ───────────────────────────────────────────────────────

def _d(val: Any) -> Decimal:
    if val is None:
        return Decimal("0")
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _compute_line(line: dict[str, Any]) -> dict[str, Any]:
    """Compute derived G703 fields for a single line item."""
    scheduled = _d(line.get("scheduled_value"))
    previous = _d(line.get("previous_draws"))
    current = _d(line.get("current_draw"))
    materials = _d(line.get("materials_stored"))
    ret_pct = Decimal(str(line.get("retainage_pct", "10.0000")))

    total_completed = previous + current + materials
    pct_complete = (
        (total_completed / scheduled * Decimal("100")).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        if scheduled > 0 else Decimal("0")
    )
    retainage = (total_completed * ret_pct / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    balance = scheduled - total_completed

    return {
        "total_completed": total_completed,
        "percent_complete": pct_complete,
        "retainage_amount": retainage,
        "balance_to_finish": balance,
    }


# ── Draw creation ─────────────────────────────────────────────────

def create_draw_request(
    *,
    project_id: UUID,
    env_id: UUID,
    business_id: UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Create a new draw request and pre-populate line items from budget."""
    with get_cursor() as cur:
        # Auto-assign next draw number
        cur.execute(
            "SELECT COALESCE(MAX(draw_number), 0) + 1 AS next_num FROM cp_draw_request WHERE project_id = %s::uuid",
            (str(project_id),),
        )
        next_num = cur.fetchone()["next_num"]

        cur.execute(
            """
            INSERT INTO cp_draw_request (
              env_id, business_id, project_id, draw_number, title,
              billing_period_start, billing_period_end,
              status, created_by
            ) VALUES (
              %s::uuid, %s::uuid, %s::uuid, %s, %s,
              %s, %s,
              'draft', %s
            )
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(project_id), next_num,
                payload.get("title"),
                payload.get("billing_period_start"), payload.get("billing_period_end"),
                payload.get("created_by"),
            ),
        )
        draw = cur.fetchone()
        draw_id = draw["draw_request_id"]

        # Populate line items from project budget
        _populate_lines_from_budget(cur, env_id, business_id, project_id, draw_id)

        # Aggregate totals
        _update_totals(cur, draw_id)

        # Re-fetch with totals
        cur.execute("SELECT * FROM cp_draw_request WHERE draw_request_id = %s::uuid", (str(draw_id),))
        draw = cur.fetchone()

    draw_audit.log_draw_event(
        env_id=env_id, business_id=business_id, project_id=project_id,
        draw_request_id=draw_id, entity_type="draw_request", entity_id=draw_id,
        action="created", new_state={"status": "draft", "draw_number": next_num},
        actor=payload.get("created_by", "system"),
    )

    return draw


def _populate_lines_from_budget(
    cur: Any, env_id: UUID, business_id: UUID, project_id: UUID, draw_request_id: UUID,
) -> None:
    """Create draw line items from budget lines, carrying forward previous draws."""
    # Get budget lines from existing PDS budget structure
    cur.execute(
        """
        SELECT bl.budget_line_id, bl.cost_code, bl.line_label, bl.approved_amount,
               bl.committed_amount
        FROM pds_budget_lines bl
        WHERE bl.project_id = %s::uuid AND bl.env_id = %s::uuid AND bl.business_id = %s::uuid
        ORDER BY bl.cost_code
        """,
        (str(project_id), str(env_id), str(business_id)),
    )
    budget_lines = cur.fetchall()

    # Get previous draws total per cost code from latest funded/approved draw
    cur.execute(
        """
        SELECT dli.cost_code,
               SUM(dli.total_completed) AS cumulative_drawn
        FROM cp_draw_line_item dli
        JOIN cp_draw_request dr ON dr.draw_request_id = dli.draw_request_id
        WHERE dr.project_id = %s::uuid
          AND dr.status IN ('funded','approved','submitted_to_lender')
          AND dr.draw_request_id != %s::uuid
        GROUP BY dli.cost_code
        """,
        (str(project_id), str(draw_request_id)),
    )
    prev_map = {r["cost_code"]: _d(r["cumulative_drawn"]) for r in cur.fetchall()}

    for bl in budget_lines:
        code = bl["cost_code"]
        scheduled = _d(bl.get("approved_amount"))
        previous = prev_map.get(code, Decimal("0"))
        computed = _compute_line({
            "scheduled_value": scheduled,
            "previous_draws": previous,
            "current_draw": Decimal("0"),
            "materials_stored": Decimal("0"),
            "retainage_pct": Decimal("10.0000"),
        })

        cur.execute(
            """
            INSERT INTO cp_draw_line_item (
              env_id, business_id, draw_request_id, cost_code, description,
              scheduled_value, previous_draws, current_draw, materials_stored,
              total_completed, percent_complete, retainage_pct, retainage_amount,
              balance_to_finish
            ) VALUES (
              %s::uuid, %s::uuid, %s::uuid, %s, %s,
              %s, %s, 0, 0,
              %s, %s, 10.0000, %s,
              %s
            )
            ON CONFLICT (draw_request_id, cost_code) DO NOTHING
            """,
            (
                str(env_id), str(business_id), str(draw_request_id),
                code, bl.get("line_label", code),
                str(scheduled), str(previous),
                str(computed["total_completed"]), str(computed["percent_complete"]),
                str(computed["retainage_amount"]), str(computed["balance_to_finish"]),
            ),
        )


def _update_totals(cur: Any, draw_request_id: UUID) -> None:
    """Aggregate line items into draw request header totals."""
    cur.execute(
        """
        SELECT
          COALESCE(SUM(previous_draws), 0)    AS total_previous_draws,
          COALESCE(SUM(current_draw), 0)      AS total_current_draw,
          COALESCE(SUM(materials_stored), 0)   AS total_materials_stored,
          COALESCE(SUM(retainage_amount), 0)  AS total_retainage_held
        FROM cp_draw_line_item
        WHERE draw_request_id = %s::uuid
        """,
        (str(draw_request_id),),
    )
    agg = cur.fetchone()
    total_previous = _d(agg["total_previous_draws"])
    total_current = _d(agg["total_current_draw"])
    total_materials = _d(agg["total_materials_stored"])
    total_retainage = _d(agg["total_retainage_held"])
    total_due = total_current + total_materials - total_retainage

    cur.execute(
        """
        UPDATE cp_draw_request SET
          total_previous_draws = %s,
          total_current_draw = %s,
          total_materials_stored = %s,
          total_retainage_held = %s,
          total_amount_due = %s,
          updated_at = now()
        WHERE draw_request_id = %s::uuid
        """,
        (
            str(total_previous), str(total_current), str(total_materials),
            str(total_retainage), str(total_due), str(draw_request_id),
        ),
    )


# ── Line item updates ─────────────────────────────────────────────

def update_line_items(
    *,
    draw_request_id: UUID,
    env_id: UUID,
    business_id: UUID,
    items: list[dict[str, Any]],
    actor: str = "system",
) -> dict[str, Any]:
    """Update draw line item amounts. Only allowed for draft/revision_requested draws."""
    with get_cursor() as cur:
        # Validate status
        cur.execute(
            "SELECT status, project_id FROM cp_draw_request WHERE draw_request_id = %s::uuid AND env_id = %s::uuid",
            (str(draw_request_id), str(env_id)),
        )
        draw = cur.fetchone()
        if not draw:
            raise LookupError(f"Draw request {draw_request_id} not found")
        if draw["status"] not in ("draft", "revision_requested"):
            raise ValueError(f"Cannot edit line items when draw is '{draw['status']}'")

        project_id = draw["project_id"]

        for item in items:
            lid = item["line_item_id"]
            current_draw = _d(item.get("current_draw", 0))
            materials = _d(item.get("materials_stored", 0))

            # Fetch existing for audit
            cur.execute(
                "SELECT * FROM cp_draw_line_item WHERE line_item_id = %s::uuid AND draw_request_id = %s::uuid",
                (str(lid), str(draw_request_id)),
            )
            existing = cur.fetchone()
            if not existing:
                continue

            computed = _compute_line({
                "scheduled_value": existing["scheduled_value"],
                "previous_draws": existing["previous_draws"],
                "current_draw": current_draw,
                "materials_stored": materials,
                "retainage_pct": existing["retainage_pct"],
            })

            cur.execute(
                """
                UPDATE cp_draw_line_item SET
                  current_draw = %s, materials_stored = %s,
                  total_completed = %s, percent_complete = %s,
                  retainage_amount = %s, balance_to_finish = %s,
                  override_reason = %s, updated_at = now()
                WHERE line_item_id = %s::uuid
                """,
                (
                    str(current_draw), str(materials),
                    str(computed["total_completed"]), str(computed["percent_complete"]),
                    str(computed["retainage_amount"]), str(computed["balance_to_finish"]),
                    item.get("override_reason"),
                    str(lid),
                ),
            )

            draw_audit.log_draw_event(
                env_id=env_id, business_id=business_id, project_id=project_id,
                draw_request_id=draw_request_id,
                entity_type="line_item", entity_id=lid,
                action="line_item_updated", actor=actor,
                previous_state={"current_draw": str(existing["current_draw"]), "materials_stored": str(existing["materials_stored"])},
                new_state={"current_draw": str(current_draw), "materials_stored": str(materials)},
            )

        # Re-aggregate totals
        _update_totals(cur, draw_request_id)

        # Return updated draw
        cur.execute("SELECT * FROM v_draw_request_detail WHERE draw_request_id = %s::uuid", (str(draw_request_id),))
        return cur.fetchone()


# ── Draw queries ──────────────────────────────────────────────────

def get_draw_request(
    *, draw_request_id: UUID, env_id: UUID, business_id: UUID,
) -> dict[str, Any]:
    """Get draw request with line items, invoices, and inspections."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM v_draw_request_detail WHERE draw_request_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid",
            (str(draw_request_id), str(env_id), str(business_id)),
        )
        draw = cur.fetchone()
        if not draw:
            raise LookupError(f"Draw request {draw_request_id} not found")

        # Line items
        cur.execute(
            "SELECT * FROM cp_draw_line_item WHERE draw_request_id = %s::uuid ORDER BY cost_code",
            (str(draw_request_id),),
        )
        draw["line_items"] = cur.fetchall()

        # Invoices
        cur.execute(
            "SELECT * FROM cp_invoice WHERE draw_request_id = %s::uuid ORDER BY created_at DESC",
            (str(draw_request_id),),
        )
        draw["invoices"] = cur.fetchall()

        # Inspections
        cur.execute(
            "SELECT * FROM cp_inspection WHERE draw_request_id = %s::uuid ORDER BY inspection_date DESC",
            (str(draw_request_id),),
        )
        draw["inspections"] = cur.fetchall()

    return draw


def list_draw_requests(
    *, project_id: UUID, env_id: UUID, business_id: UUID,
    limit: int = 50, offset: int = 0,
) -> list[dict[str, Any]]:
    """List draw requests for a project with entity counts."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM v_draw_request_detail
            WHERE project_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY draw_number DESC
            LIMIT %s OFFSET %s
            """,
            (str(project_id), str(env_id), str(business_id),
             max(1, min(limit, 200)), max(0, offset)),
        )
        return cur.fetchall()


# ── Status transitions ────────────────────────────────────────────

VALID_TRANSITIONS: dict[str, list[str]] = {
    "draft": ["pending_review"],
    "pending_review": ["approved", "rejected", "revision_requested"],
    "revision_requested": ["pending_review"],
    "approved": ["submitted_to_lender"],
    "submitted_to_lender": ["funded"],
}


def transition_draw_status(
    *,
    draw_request_id: UUID,
    env_id: UUID,
    business_id: UUID,
    new_status: str,
    actor: str,
    hitl_approval: bool = False,
    rejection_reason: str | None = None,
    variance_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Transition draw request status with validation and audit logging."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM cp_draw_request WHERE draw_request_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid",
            (str(draw_request_id), str(env_id), str(business_id)),
        )
        draw = cur.fetchone()
        if not draw:
            raise LookupError(f"Draw request {draw_request_id} not found")

        current = draw["status"]
        allowed = VALID_TRANSITIONS.get(current, [])
        if new_status not in allowed:
            raise ValueError(f"Cannot transition from '{current}' to '{new_status}'. Allowed: {allowed}")

        project_id = draw["project_id"]

        # Build update fields
        updates = ["status = %s", "updated_at = now()", "updated_by = %s"]
        params: list[Any] = [new_status, actor]

        if new_status == "pending_review":
            updates.append("submitted_at = now()")
        elif new_status == "approved":
            updates.extend(["approved_at = now()", "approved_by = %s"])
            params.append(actor)
        elif new_status == "rejected":
            updates.extend(["rejected_at = now()", "rejection_reason = %s"])
            params.append(rejection_reason)
        elif new_status == "submitted_to_lender":
            updates.append("submitted_to_lender_at = now()")
        elif new_status == "funded":
            updates.append("funded_at = now()")

        # Store variance results when submitting
        if variance_result and new_status == "pending_review":
            updates.extend(["variance_flags_json = %s::jsonb", "variance_amount_at_risk = %s"])
            params.extend([
                json.dumps(variance_result.get("flags", [])),
                str(variance_result.get("total_amount_at_risk", "0")),
            ])

        params.append(str(draw_request_id))
        set_clause = ", ".join(updates)

        cur.execute(
            f"UPDATE cp_draw_request SET {set_clause} WHERE draw_request_id = %s::uuid RETURNING *",
            params,
        )
        updated = cur.fetchone()

    draw_audit.log_draw_event(
        env_id=env_id, business_id=business_id, project_id=project_id,
        draw_request_id=draw_request_id,
        entity_type="draw_request", entity_id=draw_request_id,
        action="status_change", actor=actor,
        hitl_approval=hitl_approval,
        previous_state={"status": current},
        new_state={"status": new_status},
    )

    emit_log(
        level="info", service="backend",
        action=f"cp.draw.{new_status}",
        message=f"Draw {draw_request_id} transitioned {current} -> {new_status}",
        context={"draw_request_id": str(draw_request_id), "actor": actor, "hitl": hitl_approval},
    )

    return updated
