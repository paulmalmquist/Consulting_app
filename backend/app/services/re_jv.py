from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _q(v: Decimal | None) -> Decimal | None:
    return Decimal(v).quantize(Decimal("0.000000000001")) if v is not None else None


def list_jvs(*, investment_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT jv_id, investment_id, legal_name, ownership_percent,
                   gp_percent, lp_percent, promote_structure_id, status, created_at
            FROM re_jv
            WHERE investment_id = %s
            ORDER BY created_at DESC
            """,
            (str(investment_id),),
        )
        return cur.fetchall()


def get_jv(*, jv_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT jv_id, investment_id, legal_name, ownership_percent,
                   gp_percent, lp_percent, promote_structure_id, status, created_at
            FROM re_jv
            WHERE jv_id = %s
            """,
            (str(jv_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"JV {jv_id} not found")
        return row


def create_jv(*, investment_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT 1 FROM repe_deal WHERE deal_id = %s", (str(investment_id),)
        )
        if not cur.fetchone():
            raise LookupError(f"Investment {investment_id} not found")

        cur.execute(
            """
            INSERT INTO re_jv (
                investment_id, legal_name, ownership_percent,
                gp_percent, lp_percent, promote_structure_id
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING jv_id, investment_id, legal_name, ownership_percent,
                      gp_percent, lp_percent, promote_structure_id, status, created_at
            """,
            (
                str(investment_id),
                payload["legal_name"],
                _q(payload.get("ownership_percent", Decimal("1.0"))),
                _q(payload.get("gp_percent")),
                _q(payload.get("lp_percent")),
                str(payload["promote_structure_id"]) if payload.get("promote_structure_id") else None,
            ),
        )
        return cur.fetchone()


def list_jv_assets(*, jv_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT a.asset_id, a.deal_id, a.asset_type, a.name,
                   a.jv_id, a.acquisition_date, a.cost_basis,
                   a.asset_status, a.created_at
            FROM repe_asset a
            WHERE a.jv_id = %s
            ORDER BY a.created_at DESC
            """,
            (str(jv_id),),
        )
        return cur.fetchall()


def add_partner_share(*, jv_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM re_jv WHERE jv_id = %s", (str(jv_id),))
        if not cur.fetchone():
            raise LookupError(f"JV {jv_id} not found")

        cur.execute(
            """
            INSERT INTO re_jv_partner_share (
                jv_id, partner_id, ownership_percent, share_class,
                effective_from, effective_to
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (jv_id, partner_id, share_class, effective_from) DO UPDATE
            SET ownership_percent = EXCLUDED.ownership_percent,
                effective_to = EXCLUDED.effective_to
            RETURNING id, jv_id, partner_id, ownership_percent, share_class,
                      effective_from, effective_to, created_at
            """,
            (
                str(jv_id),
                str(payload["partner_id"]),
                _q(payload["ownership_percent"]),
                payload.get("share_class", "common"),
                payload["effective_from"],
                payload.get("effective_to"),
            ),
        )
        return cur.fetchone()


def list_partner_shares(*, jv_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ps.id, ps.jv_id, ps.partner_id, ps.ownership_percent,
                   ps.share_class, ps.effective_from, ps.effective_to,
                   ps.created_at, p.name AS partner_name, p.partner_type
            FROM re_jv_partner_share ps
            JOIN re_partner p ON p.partner_id = ps.partner_id
            WHERE ps.jv_id = %s
            ORDER BY ps.effective_from DESC
            """,
            (str(jv_id),),
        )
        return cur.fetchall()
