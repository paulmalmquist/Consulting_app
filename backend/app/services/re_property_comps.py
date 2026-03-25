"""Property comps service.

CRUD for RE property sale and lease comps per asset.
"""
from __future__ import annotations

from uuid import UUID

from app.db import get_cursor


def load_comps(
    *,
    asset_id: UUID,
    env_id: str,
    business_id: UUID,
    comp_type: str,
    data: list[dict],
) -> list[dict]:
    """Bulk insert comps for an asset."""
    inserted = []
    with get_cursor() as cur:
        for item in data:
            cur.execute(
                """
                INSERT INTO re_property_comp
                    (env_id, business_id, asset_id, comp_type,
                     address, submarket, close_date, sale_price,
                     cap_rate, noi, size_sf, price_per_sf,
                     rent_psf, term_months, source)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    env_id,
                    str(business_id),
                    str(asset_id),
                    comp_type,
                    item.get("address"),
                    item.get("submarket"),
                    item.get("close_date"),
                    str(item["sale_price"]) if item.get("sale_price") else None,
                    str(item["cap_rate"]) if item.get("cap_rate") else None,
                    str(item["noi"]) if item.get("noi") else None,
                    str(item["size_sf"]) if item.get("size_sf") else None,
                    str(item["price_per_sf"]) if item.get("price_per_sf") else None,
                    str(item["rent_psf"]) if item.get("rent_psf") else None,
                    item.get("term_months"),
                    item.get("source"),
                ),
            )
            row = cur.fetchone()
            inserted.append(row)
    return inserted


def list_comps(
    *,
    asset_id: UUID,
    comp_type: str | None = None,
) -> list[dict]:
    """Query comps for an asset, optionally filtered by comp_type."""
    with get_cursor() as cur:
        conditions = ["asset_id = %s"]
        params: list = [str(asset_id)]
        if comp_type:
            conditions.append("comp_type = %s")
            params.append(comp_type)
        cur.execute(
            f"""
            SELECT * FROM re_property_comp
            WHERE {' AND '.join(conditions)}
            ORDER BY close_date DESC NULLS LAST
            """,
            params,
        )
        return cur.fetchall()


def get_comp_summary(*, asset_id: UUID) -> dict:
    """Compute summary stats for an asset's comps."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT comp_type,
                   COUNT(*) as count,
                   AVG(cap_rate) as avg_cap_rate,
                   AVG(price_per_sf) as avg_price_per_sf,
                   AVG(sale_price) as avg_sale_price
            FROM re_property_comp
            WHERE asset_id = %s
            GROUP BY comp_type
            """,
            (str(asset_id),),
        )
        rows = cur.fetchall()
        result: dict = {"sale": None, "lease": None}
        for row in rows:
            ct = row["comp_type"]
            result[ct] = {
                "count": row["count"],
                "avg_cap_rate": str(row["avg_cap_rate"]) if row["avg_cap_rate"] else None,
                "avg_price_per_sf": str(row["avg_price_per_sf"]) if row["avg_price_per_sf"] else None,
                "avg_sale_price": str(row["avg_sale_price"]) if row["avg_sale_price"] else None,
            }
        return result
