"""Capital Call & Distribution Notice Generator.

Generates per-investor notices for capital calls and distributions,
routes them through the approval workflow, and supports batch operations.
"""
from __future__ import annotations

import json
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def generate_capital_call_notices(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    call_entry_id: UUID,
) -> dict:
    """Generate per-LP capital call notices for a specific capital call event.

    1. Get call details from re_capital_ledger_entry
    2. Get LP roster + commitments from re_partner + re_partner_commitment
    3. Compute pro-rata per LP
    4. Create re_notice records with status=pending_review
    5. Create approval workflow entries
    """
    with get_cursor() as cur:
        # Get the capital call event
        cur.execute(
            """
            SELECT * FROM re_capital_ledger_entry
            WHERE entry_id = %s AND fund_id = %s AND entry_type = 'contribution'
            """,
            (str(call_entry_id), str(fund_id)),
        )
        call_event = cur.fetchone()
        if not call_event:
            raise LookupError(f"Capital call event {call_entry_id} not found")

        total_call = Decimal(str(call_event["amount_base"]))
        due_date = call_event.get("effective_date")

        # Get fund name
        cur.execute("SELECT name FROM repe_fund WHERE fund_id = %s", (str(fund_id),))
        fund_row = cur.fetchone()
        fund_name = fund_row["name"] if fund_row else "Fund"

        # Get all active LP commitments
        cur.execute(
            """
            SELECT pc.partner_id, pc.committed_amount, p.name AS partner_name, p.partner_type
            FROM re_partner_commitment pc
            JOIN re_partner p ON p.partner_id = pc.partner_id
            WHERE pc.fund_id = %s AND pc.status = 'active'
            ORDER BY p.name
            """,
            (str(fund_id),),
        )
        commitments = cur.fetchall()

        if not commitments:
            raise ValueError(f"No active commitments found for fund {fund_id}")

        # Compute total commitments for pro-rata
        total_committed = sum(Decimal(str(c["committed_amount"])) for c in commitments)

        notices = []
        for comm in commitments:
            committed = Decimal(str(comm["committed_amount"]))
            pro_rata = (committed / total_committed) if total_committed > 0 else Decimal("0")
            call_amount = (total_call * pro_rata).quantize(Decimal("0.01"))

            # Create notice record
            cur.execute(
                """
                INSERT INTO re_notice
                    (env_id, business_id, fund_id, partner_id, notice_type, source_entry_id,
                     amount, due_date, fund_name, partner_name, status)
                VALUES (%s, %s, %s, %s, 'capital_call', %s, %s, %s, %s, %s, 'pending_review')
                RETURNING id
                """,
                (
                    env_id, str(business_id), str(fund_id), str(comm["partner_id"]),
                    str(call_entry_id), str(call_amount), due_date,
                    fund_name, comm["partner_name"],
                ),
            )
            notice_row = cur.fetchone()

            notices.append({
                "notice_id": str(notice_row["id"]),
                "partner_name": comm["partner_name"],
                "partner_type": comm["partner_type"],
                "committed_amount": float(committed),
                "pro_rata_pct": float(pro_rata * 100),
                "call_amount": float(call_amount),
                "due_date": str(due_date) if due_date else None,
                "status": "pending_review",
            })

        # Create approval workflow entry
        cur.execute(
            """
            INSERT INTO epi_workflow_observation
                (business_id, workflow_name, entity_type, entity_id, transition_label, outcome)
            VALUES (%s, 'capital_call_notices', 'fund', %s, 'generated', 'pending')
            """,
            (str(business_id), str(fund_id)),
        )

    emit_log(
        level="info",
        service="backend",
        action="notice.generate_capital_call",
        message=f"Generated {len(notices)} capital call notices for {fund_name}",
        context={"fund_id": str(fund_id), "total_call": float(total_call), "notices": len(notices)},
    )

    return {
        "fund_id": str(fund_id),
        "fund_name": fund_name,
        "notice_type": "capital_call",
        "total_call_amount": float(total_call),
        "due_date": str(due_date) if due_date else None,
        "total_notices": len(notices),
        "notices": notices,
    }


def generate_distribution_notices(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    distribution_entry_id: UUID,
) -> dict:
    """Generate per-LP distribution notices."""
    with get_cursor() as cur:
        # Get the distribution event
        cur.execute(
            """
            SELECT * FROM re_capital_ledger_entry
            WHERE entry_id = %s AND fund_id = %s AND entry_type = 'distribution'
            """,
            (str(distribution_entry_id), str(fund_id)),
        )
        dist_event = cur.fetchone()
        if not dist_event:
            raise LookupError(f"Distribution event {distribution_entry_id} not found")

        total_dist = Decimal(str(dist_event["amount_base"]))
        effective_date = dist_event.get("effective_date")

        # Get fund name
        cur.execute("SELECT name FROM repe_fund WHERE fund_id = %s", (str(fund_id),))
        fund_row = cur.fetchone()
        fund_name = fund_row["name"] if fund_row else "Fund"

        # Get all active LP commitments
        cur.execute(
            """
            SELECT pc.partner_id, pc.committed_amount, p.name AS partner_name, p.partner_type
            FROM re_partner_commitment pc
            JOIN re_partner p ON p.partner_id = pc.partner_id
            WHERE pc.fund_id = %s AND pc.status = 'active'
            ORDER BY p.name
            """,
            (str(fund_id),),
        )
        commitments = cur.fetchall()

        if not commitments:
            raise ValueError(f"No active commitments found for fund {fund_id}")

        total_committed = sum(Decimal(str(c["committed_amount"])) for c in commitments)

        notices = []
        for comm in commitments:
            committed = Decimal(str(comm["committed_amount"]))
            pro_rata = (committed / total_committed) if total_committed > 0 else Decimal("0")
            dist_amount = (total_dist * pro_rata).quantize(Decimal("0.01"))

            cur.execute(
                """
                INSERT INTO re_notice
                    (env_id, business_id, fund_id, partner_id, notice_type, source_entry_id,
                     amount, due_date, fund_name, partner_name, status)
                VALUES (%s, %s, %s, %s, 'distribution', %s, %s, %s, %s, %s, 'pending_review')
                RETURNING id
                """,
                (
                    env_id, str(business_id), str(fund_id), str(comm["partner_id"]),
                    str(distribution_entry_id), str(dist_amount), effective_date,
                    fund_name, comm["partner_name"],
                ),
            )
            notice_row = cur.fetchone()

            notices.append({
                "notice_id": str(notice_row["id"]),
                "partner_name": comm["partner_name"],
                "partner_type": comm["partner_type"],
                "committed_amount": float(committed),
                "pro_rata_pct": float(pro_rata * 100),
                "distribution_amount": float(dist_amount),
                "effective_date": str(effective_date) if effective_date else None,
                "status": "pending_review",
            })

        # Create approval workflow entry
        cur.execute(
            """
            INSERT INTO epi_workflow_observation
                (business_id, workflow_name, entity_type, entity_id, transition_label, outcome)
            VALUES (%s, 'distribution_notices', 'fund', %s, 'generated', 'pending')
            """,
            (str(business_id), str(fund_id)),
        )

    emit_log(
        level="info",
        service="backend",
        action="notice.generate_distribution",
        message=f"Generated {len(notices)} distribution notices for {fund_name}",
        context={"fund_id": str(fund_id), "total_dist": float(total_dist), "notices": len(notices)},
    )

    return {
        "fund_id": str(fund_id),
        "fund_name": fund_name,
        "notice_type": "distribution",
        "total_distribution_amount": float(total_dist),
        "effective_date": str(effective_date) if effective_date else None,
        "total_notices": len(notices),
        "notices": notices,
    }


def approve_notice(*, notice_id: UUID, approved_by: str) -> dict:
    """Approve a single notice."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE re_notice SET status = 'approved', approved_by = %s, approved_at = now()
            WHERE id = %s AND status = 'pending_review'
            RETURNING id, partner_name, notice_type, amount, status
            """,
            (approved_by, str(notice_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Notice {notice_id} not found or already processed")
        return {
            "notice_id": str(row["id"]),
            "partner_name": row["partner_name"],
            "notice_type": row["notice_type"],
            "amount": float(row["amount"]),
            "status": row["status"],
        }


def batch_approve_notices(*, fund_id: UUID, notice_type: str, approved_by: str) -> dict:
    """Approve all pending notices for a fund and type."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE re_notice SET status = 'approved', approved_by = %s, approved_at = now()
            WHERE fund_id = %s AND notice_type = %s AND status = 'pending_review'
            RETURNING id
            """,
            (approved_by, str(fund_id), notice_type),
        )
        rows = cur.fetchall()
        return {
            "fund_id": str(fund_id),
            "notice_type": notice_type,
            "approved_count": len(rows),
        }
