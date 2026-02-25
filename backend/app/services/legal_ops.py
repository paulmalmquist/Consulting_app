from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _q(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(value).quantize(Decimal("0.000000000001"))


def list_matters(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_matters
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def create_matter(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_matters
            (env_id, business_id, matter_number, title, matter_type, related_entity_type, related_entity_id,
             counterparty, outside_counsel, internal_owner, risk_level, budget_amount, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), payload["matter_number"], payload["title"], payload["matter_type"],
                payload.get("related_entity_type"), str(payload["related_entity_id"]) if payload.get("related_entity_id") else None,
                payload.get("counterparty"), payload.get("outside_counsel"), payload.get("internal_owner"), payload.get("risk_level") or "medium",
                _q(payload.get("budget_amount")), payload.get("status") or "open", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def get_matter(*, env_id: UUID, business_id: UUID, matter_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM legal_matters
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND matter_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(matter_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Matter not found")
        return row


def create_contract(*, env_id: UUID, business_id: UUID, matter_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_contracts
            (env_id, business_id, matter_id, contract_ref, contract_type, counterparty_name, effective_date,
             expiration_date, governing_law, auto_renew, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(matter_id), payload["contract_ref"], payload["contract_type"], payload.get("counterparty_name"),
                payload.get("effective_date"), payload.get("expiration_date"), payload.get("governing_law"), bool(payload.get("auto_renew", False)),
                payload.get("status") or "draft", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_deadline(*, env_id: UUID, business_id: UUID, matter_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_deadlines
            (env_id, business_id, matter_id, deadline_type, due_date, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(matter_id), payload["deadline_type"], payload["due_date"],
                payload.get("status") or "open", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_approval(*, env_id: UUID, business_id: UUID, matter_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_approvals
            (env_id, business_id, matter_id, approval_type, approver, status, approved_at, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s,
                    CASE WHEN %s = 'approved' THEN now() ELSE NULL END,
                    %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(matter_id), payload["approval_type"], payload.get("approver"),
                payload.get("status") or "pending", payload.get("status") or "pending", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_spend_entry(*, env_id: UUID, business_id: UUID, matter_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO legal_spend_entries
            (env_id, business_id, matter_id, outside_counsel, invoice_ref, amount, incurred_date, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(matter_id), payload.get("outside_counsel"), payload.get("invoice_ref"),
                _q(payload["amount"]), payload.get("incurred_date"), payload.get("created_by"), payload.get("created_by")
            ),
        )
        entry = cur.fetchone()
        cur.execute(
            """
            UPDATE legal_matters
            SET actual_spend = actual_spend + %s,
                updated_by = %s,
                updated_at = now()
            WHERE matter_id = %s::uuid
            """,
            (_q(payload["amount"]), payload.get("created_by"), str(matter_id)),
        )
        return entry


def seed_demo_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT matter_id FROM legal_matters WHERE env_id = %s::uuid AND business_id = %s::uuid LIMIT 1",
            (str(env_id), str(business_id)),
        )
        existing = cur.fetchone()
        if existing:
            return {"seeded": False, "matter_ids": [str(existing["matter_id"])]}

    matter_a = create_matter(
        env_id=env_id,
        business_id=business_id,
        payload={
            "matter_number": "LEG-2001",
            "title": "Main Street Acquisition PSA",
            "matter_type": "Acquisition",
            "counterparty": "Cedar Holdings",
            "outside_counsel": "Foster & Bell LLP",
            "internal_owner": "General Counsel",
            "risk_level": "high",
            "budget_amount": Decimal("240000"),
            "status": "open",
            "created_by": actor,
        },
    )
    mid_a = UUID(str(matter_a["matter_id"]))
    create_contract(
        env_id=env_id,
        business_id=business_id,
        matter_id=mid_a,
        payload={
            "contract_ref": "PSA-2026-014",
            "contract_type": "PSA",
            "counterparty_name": "Cedar Holdings",
            "effective_date": date.today(),
            "governing_law": "NY",
            "auto_renew": False,
            "status": "negotiation",
            "created_by": actor,
        },
    )
    create_deadline(
        env_id=env_id,
        business_id=business_id,
        matter_id=mid_a,
        payload={"deadline_type": "Closing", "due_date": date.today(), "status": "open", "created_by": actor},
    )
    create_approval(
        env_id=env_id,
        business_id=business_id,
        matter_id=mid_a,
        payload={"approval_type": "Signature Authority", "approver": "CFO", "status": "pending", "created_by": actor},
    )

    matter_b = create_matter(
        env_id=env_id,
        business_id=business_id,
        payload={
            "matter_number": "LEG-2002",
            "title": "Vendor MSA Renewal",
            "matter_type": "Vendor",
            "counterparty": "Prime Build Co",
            "outside_counsel": "In-house",
            "internal_owner": "Deputy GC",
            "risk_level": "medium",
            "budget_amount": Decimal("40000"),
            "status": "open",
            "created_by": actor,
        },
    )
    mid_b = UUID(str(matter_b["matter_id"]))
    create_spend_entry(
        env_id=env_id,
        business_id=business_id,
        matter_id=mid_b,
        payload={"outside_counsel": "In-house", "invoice_ref": "INT-001", "amount": Decimal("8500"), "incurred_date": date.today(), "created_by": actor},
    )

    return {"seeded": True, "matter_ids": [str(mid_a), str(mid_b)]}
