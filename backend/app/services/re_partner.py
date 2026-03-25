from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _q(v: Decimal | None) -> Decimal | None:
    return Decimal(v).quantize(Decimal("0.000000000001")) if v is not None else None


def list_partners(*, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT partner_id, business_id, entity_id, name, partner_type, created_at
            FROM re_partner
            WHERE business_id = %s
            ORDER BY created_at DESC
            """,
            (str(business_id),),
        )
        return cur.fetchall()


def list_fund_partners(*, fund_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.partner_id, p.business_id, p.entity_id, p.name, p.partner_type,
                   p.created_at,
                   pc.commitment_id, pc.committed_amount, pc.commitment_date, pc.status AS commitment_status
            FROM re_partner p
            JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
            WHERE pc.fund_id = %s
            ORDER BY p.created_at DESC
            """,
            (str(fund_id),),
        )
        return cur.fetchall()


def get_partner(*, partner_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT partner_id, business_id, entity_id, name, partner_type, created_at
            FROM re_partner
            WHERE partner_id = %s
            """,
            (str(partner_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Partner {partner_id} not found")
        return row


def create_partner(*, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_partner (business_id, entity_id, name, partner_type)
            VALUES (%s, %s, %s, %s)
            RETURNING partner_id, business_id, entity_id, name, partner_type, created_at
            """,
            (
                str(business_id),
                str(payload["entity_id"]) if payload.get("entity_id") else None,
                payload["name"],
                payload["partner_type"],
            ),
        )
        return cur.fetchone()


def create_commitment(*, partner_id: UUID, fund_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT 1 FROM re_partner WHERE partner_id = %s", (str(partner_id),)
        )
        if not cur.fetchone():
            raise LookupError(f"Partner {partner_id} not found")

        cur.execute(
            "SELECT 1 FROM repe_fund WHERE fund_id = %s", (str(fund_id),)
        )
        if not cur.fetchone():
            raise LookupError(f"Fund {fund_id} not found")

        cur.execute(
            """
            INSERT INTO re_partner_commitment (
                partner_id, fund_id, committed_amount, commitment_date
            )
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (partner_id, fund_id) DO UPDATE
            SET committed_amount = EXCLUDED.committed_amount,
                commitment_date = EXCLUDED.commitment_date
            RETURNING commitment_id, partner_id, fund_id, committed_amount,
                      commitment_date, status, created_at
            """,
            (
                str(partner_id),
                str(fund_id),
                _q(payload["committed_amount"]),
                payload["commitment_date"],
            ),
        )
        return cur.fetchone()


def list_commitments(*, fund_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT pc.commitment_id, pc.partner_id, pc.fund_id,
                   pc.committed_amount, pc.commitment_date, pc.status,
                   pc.created_at, p.name AS partner_name, p.partner_type
            FROM re_partner_commitment pc
            JOIN re_partner p ON p.partner_id = pc.partner_id
            WHERE pc.fund_id = %s
            ORDER BY pc.created_at DESC
            """,
            (str(fund_id),),
        )
        return cur.fetchall()
