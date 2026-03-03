"""Pipeline deal/property/tranche/contact/activity CRUD + map markers."""

from __future__ import annotations

import json
from uuid import UUID

from app.db import get_cursor


# ── Deal CRUD ────────────────────────────────────────────────────────────────

_DEAL_COLS = """deal_id, env_id, fund_id, deal_name, status, source, strategy,
               property_type, target_close_date, headline_price, target_irr,
               target_moic, notes, created_by, created_at, updated_at"""


def list_deals(
    *,
    env_id: str,
    status: str | None = None,
    strategy: str | None = None,
    fund_id: UUID | None = None,
) -> list[dict]:
    conditions = ["env_id = %s"]
    params: list = [env_id]
    if status:
        conditions.append("status = %s")
        params.append(status)
    if strategy:
        conditions.append("strategy = %s")
        params.append(strategy)
    if fund_id:
        conditions.append("fund_id = %s")
        params.append(str(fund_id))
    where = " AND ".join(conditions)
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_DEAL_COLS} FROM re_pipeline_deal WHERE {where} ORDER BY created_at DESC",
            params,
        )
        return cur.fetchall()


def get_deal(*, deal_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(f"SELECT {_DEAL_COLS} FROM re_pipeline_deal WHERE deal_id = %s", (str(deal_id),))
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Pipeline deal {deal_id} not found")
        return row


def create_deal(*, env_id: str, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO re_pipeline_deal
                (env_id, fund_id, deal_name, status, source, strategy, property_type,
                 target_close_date, headline_price, target_irr, target_moic, notes, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING {_DEAL_COLS}
            """,
            (
                env_id,
                str(payload.get("fund_id")) if payload.get("fund_id") else None,
                payload["deal_name"],
                payload.get("status", "sourced"),
                payload.get("source"),
                payload.get("strategy"),
                payload.get("property_type"),
                payload.get("target_close_date"),
                payload.get("headline_price"),
                payload.get("target_irr"),
                payload.get("target_moic"),
                payload.get("notes"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def update_deal(*, deal_id: UUID, payload: dict) -> dict:
    updatable = [
        "deal_name", "fund_id", "status", "source", "strategy", "property_type",
        "target_close_date", "headline_price", "target_irr", "target_moic", "notes",
    ]
    sets = []
    params = []
    for field in updatable:
        if field in payload and payload[field] is not None:
            sets.append(f"{field} = %s")
            params.append(str(payload[field]) if field == "fund_id" else payload[field])
    if not sets:
        return get_deal(deal_id=deal_id)
    sets.append("updated_at = now()")
    params.append(str(deal_id))
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE re_pipeline_deal SET {', '.join(sets)} WHERE deal_id = %s RETURNING {_DEAL_COLS}",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Pipeline deal {deal_id} not found")
        return row


# ── Property CRUD ────────────────────────────────────────────────────────────

_PROP_COLS = """property_id, deal_id, canonical_property_id, property_name, address, city, state, zip,
               lat, lon, property_type, units, sqft, year_built,
               occupancy, noi, asking_cap_rate, census_tract_geoid, created_at"""


def list_properties(*, deal_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_PROP_COLS} FROM re_pipeline_property WHERE deal_id = %s ORDER BY property_name",
            (str(deal_id),),
        )
        return cur.fetchall()


def create_property(*, deal_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO re_pipeline_property
                (deal_id, property_name, address, city, state, zip,
                 lat, lon, property_type, units, sqft, year_built,
                 occupancy, noi, asking_cap_rate)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING {_PROP_COLS}
            """,
            (
                str(deal_id),
                payload["property_name"],
                payload.get("address"),
                payload.get("city"),
                payload.get("state"),
                payload.get("zip"),
                payload.get("lat"),
                payload.get("lon"),
                payload.get("property_type"),
                payload.get("units"),
                payload.get("sqft"),
                payload.get("year_built"),
                payload.get("occupancy"),
                payload.get("noi"),
                payload.get("asking_cap_rate"),
            ),
        )
        return cur.fetchone()


def update_property(*, property_id: UUID, payload: dict) -> dict:
    updatable = [
        "property_name", "address", "city", "state", "zip", "lat", "lon",
        "property_type", "units", "sqft", "year_built", "occupancy", "noi", "asking_cap_rate",
    ]
    sets = []
    params = []
    for field in updatable:
        if field in payload and payload[field] is not None:
            sets.append(f"{field} = %s")
            params.append(payload[field])
    if not sets:
        raise ValueError("No fields to update")
    params.append(str(property_id))
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE re_pipeline_property SET {', '.join(sets)} WHERE property_id = %s RETURNING {_PROP_COLS}",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Pipeline property {property_id} not found")
        return row


# ── Tranche CRUD ─────────────────────────────────────────────────────────────

_TRANCHE_COLS = """tranche_id, deal_id, tranche_name, tranche_type, close_date,
                   commitment_amount, price, terms_json, status, created_at"""


def list_tranches(*, deal_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_TRANCHE_COLS} FROM re_pipeline_tranche WHERE deal_id = %s ORDER BY close_date",
            (str(deal_id),),
        )
        return cur.fetchall()


def create_tranche(*, deal_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO re_pipeline_tranche
                (deal_id, tranche_name, tranche_type, close_date,
                 commitment_amount, price, terms_json, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING {_TRANCHE_COLS}
            """,
            (
                str(deal_id),
                payload["tranche_name"],
                payload.get("tranche_type", "equity"),
                payload.get("close_date"),
                payload.get("commitment_amount"),
                payload.get("price"),
                json.dumps(payload.get("terms_json", {})),
                payload.get("status", "open"),
            ),
        )
        return cur.fetchone()


def update_tranche(*, tranche_id: UUID, payload: dict) -> dict:
    updatable = ["tranche_name", "tranche_type", "close_date", "commitment_amount", "price", "status"]
    sets = []
    params = []
    for field in updatable:
        if field in payload and payload[field] is not None:
            sets.append(f"{field} = %s")
            params.append(payload[field])
    if "terms_json" in payload:
        sets.append("terms_json = %s")
        params.append(json.dumps(payload["terms_json"]))
    if not sets:
        raise ValueError("No fields to update")
    params.append(str(tranche_id))
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE re_pipeline_tranche SET {', '.join(sets)} WHERE tranche_id = %s RETURNING {_TRANCHE_COLS}",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Pipeline tranche {tranche_id} not found")
        return row


# ── Contact CRUD ─────────────────────────────────────────────────────────────

_CONTACT_COLS = "contact_id, deal_id, name, email, phone, org, role, created_at"


def list_contacts(*, deal_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_CONTACT_COLS} FROM re_pipeline_contact WHERE deal_id = %s ORDER BY name",
            (str(deal_id),),
        )
        return cur.fetchall()


def create_contact(*, deal_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO re_pipeline_contact (deal_id, name, email, phone, org, role)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING {_CONTACT_COLS}
            """,
            (str(deal_id), payload["name"], payload.get("email"), payload.get("phone"),
             payload.get("org"), payload.get("role")),
        )
        return cur.fetchone()


# ── Activity CRUD ────────────────────────────────────────────────────────────

_ACTIVITY_COLS = "activity_id, deal_id, tranche_id, activity_type, occurred_at, body, created_by, created_at"


def list_activities(*, deal_id: UUID, limit: int = 50) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_ACTIVITY_COLS} FROM re_pipeline_activity WHERE deal_id = %s "
            f"ORDER BY occurred_at DESC LIMIT %s",
            (str(deal_id), limit),
        )
        return cur.fetchall()


def create_activity(*, deal_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO re_pipeline_activity
                (deal_id, tranche_id, activity_type, body, created_by,
                 occurred_at)
            VALUES (%s, %s, %s, %s, %s, COALESCE(%s, now()))
            RETURNING {_ACTIVITY_COLS}
            """,
            (
                str(deal_id),
                str(payload["tranche_id"]) if payload.get("tranche_id") else None,
                payload["activity_type"],
                payload.get("body"),
                payload.get("created_by"),
                payload.get("occurred_at"),
            ),
        )
        return cur.fetchone()


# ── Map Markers ──────────────────────────────────────────────────────────────

def get_map_markers(
    *,
    env_id: str,
    bbox: tuple[float, float, float, float] | None = None,
    status: str | None = None,
) -> list[dict]:
    """Return markers for properties with lat/lon within optional bbox."""
    conditions = ["d.env_id = %s", "p.lat IS NOT NULL", "p.lon IS NOT NULL"]
    params: list = [env_id]
    if bbox:
        sw_lat, sw_lon, ne_lat, ne_lon = bbox
        conditions.append("p.lat BETWEEN %s AND %s")
        conditions.append("p.lon BETWEEN %s AND %s")
        params.extend([sw_lat, ne_lat, sw_lon, ne_lon])
    if status:
        conditions.append("d.status = %s")
        params.append(status)
    where = " AND ".join(conditions)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT d.deal_id, p.canonical_property_id, d.deal_name, d.status, p.lat, p.lon,
                   p.property_name, p.property_type, d.headline_price
            FROM re_pipeline_property p
            JOIN re_pipeline_deal d ON d.deal_id = p.deal_id
            WHERE {where}
            ORDER BY d.deal_name
            """,
            params,
        )
        return cur.fetchall()
