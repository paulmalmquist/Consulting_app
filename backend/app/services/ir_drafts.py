"""IR Draft service — create, review, approve/reject LP letters and capital statements."""
from __future__ import annotations

import json
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def create_draft(
    *,
    env_id: str,
    business_id: str | UUID,
    fund_id: str | UUID,
    quarter: str,
    draft_type: str = "lp_letter",
    content_json: dict,
    narrative_text: str | None = None,
    generated_by: str = "winston",
) -> dict:
    """Create a new IR draft."""
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO re_ir_drafts
               (env_id, business_id, fund_id, quarter, draft_type,
                status, content_json, narrative_text, generated_by)
               VALUES (%s, %s, %s, %s, %s, 'draft', %s::jsonb, %s, %s)
               RETURNING *""",
            (
                env_id, str(business_id), str(fund_id), quarter, draft_type,
                json.dumps(content_json, default=str),
                narrative_text, generated_by,
            ),
        )
        row = cur.fetchone()
        emit_log(
            level="info", service="backend",
            action="ir_drafts.create",
            message=f"IR draft created: {draft_type} for {quarter}",
            context={"fund_id": str(fund_id), "draft_id": str(row["id"])},
        )
        return _serialize(row)


def get_draft(draft_id: str | UUID) -> dict | None:
    """Fetch a single draft."""
    with get_cursor() as cur:
        cur.execute("SELECT * FROM re_ir_drafts WHERE id = %s", (str(draft_id),))
        row = cur.fetchone()
        return _serialize(row) if row else None


def list_drafts(
    business_id: str | UUID,
    *,
    fund_id: str | UUID | None = None,
    quarter: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """List IR drafts with optional filters."""
    conditions = ["d.business_id = %s"]
    params: list = [str(business_id)]

    if fund_id:
        conditions.append("d.fund_id = %s")
        params.append(str(fund_id))
    if quarter:
        conditions.append("d.quarter = %s")
        params.append(quarter)
    if status:
        conditions.append("d.status = %s")
        params.append(status)

    where = " AND ".join(conditions)
    params.append(limit)

    with get_cursor() as cur:
        cur.execute(
            f"""SELECT d.*, f.name AS fund_name
                FROM re_ir_drafts d
                LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
                WHERE {where}
                ORDER BY d.created_at DESC
                LIMIT %s""",
            params,
        )
        return [_serialize(r) for r in cur.fetchall()]


def approve_draft(
    draft_id: str | UUID,
    *,
    actor: str = "gp_principal",
    notes: str | None = None,
) -> dict:
    """Approve a draft."""
    with get_cursor() as cur:
        cur.execute(
            """UPDATE re_ir_drafts
               SET status = 'approved', reviewed_by = %s,
                   reviewed_at = now(), review_notes = %s, updated_at = now()
               WHERE id = %s AND status IN ('draft', 'pending_review')
               RETURNING *""",
            (actor, notes, str(draft_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Draft {draft_id} not found or already finalized")
        emit_log(
            level="info", service="backend",
            action="ir_drafts.approve",
            message=f"IR draft approved: {row['draft_type']} {row['quarter']}",
            context={"draft_id": str(draft_id), "actor": actor},
        )
        return _serialize(row)


def reject_draft(
    draft_id: str | UUID,
    *,
    actor: str = "gp_principal",
    reason: str = "",
) -> dict:
    """Reject a draft."""
    with get_cursor() as cur:
        cur.execute(
            """UPDATE re_ir_drafts
               SET status = 'rejected', reviewed_by = %s,
                   reviewed_at = now(), review_notes = %s, updated_at = now()
               WHERE id = %s AND status IN ('draft', 'pending_review')
               RETURNING *""",
            (actor, reason, str(draft_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Draft {draft_id} not found or already finalized")
        return _serialize(row)


def _serialize(row: dict) -> dict:
    """Make row JSON-safe."""
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif isinstance(v, (int, float, str, bool, list, dict)) or v is None:
            out[k] = v
        else:
            out[k] = str(v)
    return out
