"""Consulting Revenue OS – Proposal service.

Proposal CRUD with auto-margin calculation, version bumping,
status management, and acceptance flow.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def _compute_margin(total_value: Decimal, cost_estimate: Decimal) -> Decimal | None:
    """Compute margin percentage: (total - cost) / total."""
    if total_value <= 0:
        return None
    return round((total_value - cost_estimate) / total_value, 4)


def create_proposal(
    *,
    env_id: str,
    business_id: UUID,
    crm_opportunity_id: UUID | None = None,
    crm_account_id: UUID | None = None,
    title: str,
    pricing_model: str | None = None,
    total_value: Decimal,
    cost_estimate: Decimal = Decimal("0"),
    valid_until=None,
    scope_summary: str | None = None,
    risk_notes: str | None = None,
) -> dict:
    """Create a new proposal with auto-computed margin."""
    margin = _compute_margin(total_value, cost_estimate)

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_proposal
              (env_id, business_id, crm_opportunity_id, crm_account_id,
               title, pricing_model, total_value, cost_estimate, margin_pct,
               valid_until, scope_summary, risk_notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, env_id, business_id, crm_opportunity_id, crm_account_id,
                      title, version, status, pricing_model, total_value,
                      cost_estimate, margin_pct, valid_until, sent_at,
                      accepted_at, rejected_at, scope_summary, risk_notes, created_at
            """,
            (
                env_id, str(business_id),
                str(crm_opportunity_id) if crm_opportunity_id else None,
                str(crm_account_id) if crm_account_id else None,
                title, pricing_model,
                str(total_value), str(cost_estimate), str(margin) if margin is not None else None,
                valid_until, scope_summary, risk_notes,
            ),
        )
        row = cur.fetchone()

    emit_log(
        level="info",
        service="backend",
        action="cro.proposal.created",
        message=f"Proposal created: {title}",
        context={"proposal_id": str(row["id"]), "margin_pct": str(margin)},
    )
    return row


def list_proposals(
    *,
    env_id: str,
    business_id: UUID,
    status: str | None = None,
    crm_account_id: UUID | None = None,
) -> list[dict]:
    """List proposals with optional status/account filter."""
    with get_cursor() as cur:
        sql = """
            SELECT p.id, p.env_id, p.business_id, p.crm_opportunity_id, p.crm_account_id,
                   p.title, p.version, p.status, p.pricing_model, p.total_value,
                   p.cost_estimate, p.margin_pct, p.valid_until, p.sent_at,
                   p.accepted_at, p.rejected_at, p.scope_summary, p.risk_notes,
                   a.name AS account_name,
                   p.created_at
            FROM cro_proposal p
            LEFT JOIN crm_account a ON a.crm_account_id = p.crm_account_id
            WHERE p.env_id = %s AND p.business_id = %s
        """
        params: list = [env_id, str(business_id)]

        if status:
            sql += " AND p.status = %s"
            params.append(status)

        if crm_account_id:
            sql += " AND p.crm_account_id = %s"
            params.append(str(crm_account_id))

        sql += " ORDER BY p.created_at DESC"
        cur.execute(sql, tuple(params))
        return cur.fetchall()


def get_proposal(*, proposal_id: UUID) -> dict:
    """Get a single proposal by ID."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.id, p.env_id, p.business_id, p.crm_opportunity_id, p.crm_account_id,
                   p.title, p.version, p.status, p.pricing_model, p.total_value,
                   p.cost_estimate, p.margin_pct, p.valid_until, p.sent_at,
                   p.accepted_at, p.rejected_at, p.scope_summary, p.risk_notes,
                   a.name AS account_name,
                   p.created_at
            FROM cro_proposal p
            LEFT JOIN crm_account a ON a.crm_account_id = p.crm_account_id
            WHERE p.id = %s
            """,
            (str(proposal_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Proposal {proposal_id} not found")
        return row


def update_proposal_status(
    *,
    proposal_id: UUID,
    status: str,
    rejection_reason: str | None = None,
) -> dict:
    """Update proposal status (draft → sent → viewed → accepted/rejected/expired)."""
    now = datetime.now(timezone.utc)

    with get_cursor() as cur:
        # Build dynamic SET clause based on status
        set_parts = ["status = %s", "updated_at = %s"]
        params: list = [status, now]

        if status == "sent":
            set_parts.append("sent_at = %s")
            params.append(now)
        elif status == "accepted":
            set_parts.append("accepted_at = %s")
            params.append(now)
        elif status == "rejected":
            set_parts.append("rejected_at = %s")
            params.append(now)
            set_parts.append("rejection_reason = %s")
            params.append(rejection_reason)

        params.append(str(proposal_id))

        cur.execute(
            f"""
            UPDATE cro_proposal
            SET {', '.join(set_parts)}
            WHERE id = %s
            RETURNING id, status, sent_at, accepted_at, rejected_at, rejection_reason
            """,
            tuple(params),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Proposal {proposal_id} not found")

    emit_log(
        level="info",
        service="backend",
        action="cro.proposal.status_updated",
        message=f"Proposal {proposal_id} → {status}",
        context={"proposal_id": str(proposal_id), "status": status},
    )
    return row


def create_new_version(*, proposal_id: UUID) -> dict:
    """Create a new version of a proposal (copies fields, bumps version)."""
    with get_cursor() as cur:
        # Get current proposal
        cur.execute(
            """
            SELECT env_id, business_id, crm_opportunity_id, crm_account_id,
                   title, pricing_model, total_value, cost_estimate, margin_pct,
                   valid_until, scope_summary, risk_notes, version
            FROM cro_proposal WHERE id = %s
            """,
            (str(proposal_id),),
        )
        original = cur.fetchone()
        if not original:
            raise LookupError(f"Proposal {proposal_id} not found")

        new_version = original["version"] + 1

        cur.execute(
            """
            INSERT INTO cro_proposal
              (env_id, business_id, crm_opportunity_id, crm_account_id,
               title, version, pricing_model, total_value, cost_estimate, margin_pct,
               valid_until, scope_summary, risk_notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, env_id, business_id, crm_opportunity_id, crm_account_id,
                      title, version, status, pricing_model, total_value,
                      cost_estimate, margin_pct, valid_until, sent_at,
                      accepted_at, rejected_at, scope_summary, risk_notes, created_at
            """,
            (
                original["env_id"], str(original["business_id"]),
                str(original["crm_opportunity_id"]) if original["crm_opportunity_id"] else None,
                str(original["crm_account_id"]) if original["crm_account_id"] else None,
                original["title"], new_version, original["pricing_model"],
                str(original["total_value"]), str(original["cost_estimate"]),
                str(original["margin_pct"]) if original["margin_pct"] is not None else None,
                original["valid_until"], original["scope_summary"], original["risk_notes"],
            ),
        )
        return cur.fetchone()
