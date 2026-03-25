"""Pipeline deal/property/tranche/contact/activity CRUD + map markers."""

from __future__ import annotations

from datetime import date, datetime, timezone
import json
import logging
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)


# ── Deal CRUD ────────────────────────────────────────────────────────────────

_DEAL_BASE_COLS = """d.deal_id, d.env_id, d.fund_id, d.deal_name, d.status, d.source, d.strategy,
                    d.property_type, d.target_close_date, d.headline_price, d.target_irr,
                    d.target_moic, d.notes, d.created_by, d.created_at, d.updated_at"""

_DEAL_SUMMARY_COLS = f"""{_DEAL_BASE_COLS},
                         f.name AS fund_name,
                         prop.city,
                         prop.state,
                         COALESCE(prop.property_count, 0) AS property_count,
                         contact.broker_name,
                         contact.broker_org,
                         contact.sponsor_name,
                         activity.last_activity_at,
                         COALESCE(activity.activity_count, 0) AS activity_count,
                         tranche.open_equity_required,
                         tranche.committed_debt"""

_DEAL_SUMMARY_JOINS = """
LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
LEFT JOIN LATERAL (
    SELECT
        MIN(p.city) FILTER (WHERE NULLIF(TRIM(p.city), '') IS NOT NULL) AS city,
        MIN(p.state) FILTER (WHERE NULLIF(TRIM(p.state), '') IS NOT NULL) AS state,
        COUNT(*)::int AS property_count
    FROM re_pipeline_property p
    WHERE p.deal_id = d.deal_id
) prop ON TRUE
LEFT JOIN LATERAL (
    SELECT
        MAX(c.name) FILTER (WHERE LOWER(COALESCE(c.role, '')) LIKE '%%broker%%') AS broker_name,
        MAX(c.org) FILTER (WHERE LOWER(COALESCE(c.role, '')) LIKE '%%broker%%') AS broker_org,
        MAX(c.name) FILTER (WHERE LOWER(COALESCE(c.role, '')) LIKE '%%sponsor%%') AS sponsor_name
    FROM re_pipeline_contact c
    WHERE c.deal_id = d.deal_id
) contact ON TRUE
LEFT JOIN LATERAL (
    SELECT
        MAX(a.occurred_at) AS last_activity_at,
        COUNT(*)::int AS activity_count
    FROM re_pipeline_activity a
    WHERE a.deal_id = d.deal_id
) activity ON TRUE
LEFT JOIN LATERAL (
    SELECT
        SUM(
            CASE
                WHEN t.tranche_type IN ('equity', 'pref_equity')
                     AND COALESCE(t.status, 'open') NOT IN ('withdrawn', 'closed', 'funded', 'committed')
                THEN COALESCE(t.commitment_amount, 0)
                ELSE 0
            END
        ) AS open_equity_required,
        SUM(
            CASE
                WHEN t.tranche_type IN ('senior_debt', 'bridge', 'mezz', 'note_purchase')
                     AND COALESCE(t.status, 'open') IN ('committed', 'funded', 'closed')
                THEN COALESCE(t.commitment_amount, 0)
                ELSE 0
            END
        ) AS committed_debt
    FROM re_pipeline_tranche t
    WHERE t.deal_id = d.deal_id
) tranche ON TRUE
"""

_STATUS_ORDER = {
    "sourced": 0,
    "screening": 1,
    "loi": 2,
    "dd": 3,
    "ic": 4,
    "closing": 5,
    "closed": 6,
    "dead": -1,
}


def _parse_datetime(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time(), tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def _days_since(value) -> int | None:
    parsed = _parse_datetime(value)
    if not parsed:
        return None
    delta = datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)
    return max(0, int(delta.total_seconds() // 86400))


def _days_until(value) -> int | None:
    parsed = _parse_datetime(value)
    if not parsed:
        return None
    delta = parsed.astimezone(timezone.utc) - datetime.now(timezone.utc)
    return int(delta.total_seconds() // 86400)


def _derive_equity_required(row: dict):
    open_equity = row.get("open_equity_required")
    if open_equity not in (None, 0):
        return open_equity

    headline_price = row.get("headline_price")
    committed_debt = row.get("committed_debt")
    if headline_price is None or committed_debt in (None, 0):
        return None

    remaining_equity = headline_price - committed_debt
    return remaining_equity if remaining_equity > 0 else 0


def _derive_attention_flags(row: dict) -> list[str]:
    status = row.get("status") or "sourced"
    status_rank = _STATUS_ORDER.get(status, 0)
    property_count = int(row.get("property_count") or 0)
    activity_days = _days_since(row.get("last_activity_at"))
    close_days = _days_until(row.get("target_close_date"))
    equity_required = row.get("equity_required")

    flags: set[str] = set()
    if activity_days is None or activity_days > 10:
        flags.add("stale")

    if status_rank >= 1 and property_count == 0:
        flags.add("missing_diligence")
    if status_rank >= 1 and not any((row.get("broker_name"), row.get("broker_org"), row.get("source"))):
        flags.add("missing_diligence")
    if status in {"ic", "closing"} and (activity_days is None or activity_days > 5):
        flags.add("missing_diligence")
    if status_rank >= 2 and equity_required in (None, 0):
        flags.add("capital_gap")
    if status in {"ic", "closing"} or (close_days is not None and close_days <= 45):
        flags.add("priority")

    return sorted(flags)


def _hydrate_deal_summary(row: dict) -> dict:
    item = dict(row)
    item["property_count"] = int(item.get("property_count") or 0)
    item["activity_count"] = int(item.get("activity_count") or 0)
    item["equity_required"] = _derive_equity_required(item)
    item["attention_flags"] = _derive_attention_flags(item)
    item.pop("open_equity_required", None)
    item.pop("committed_debt", None)
    return item


def list_deals(
    *,
    env_id: str,
    status: str | None = None,
    strategy: str | None = None,
    fund_id: UUID | None = None,
) -> list[dict]:
    conditions = ["d.env_id = %s"]
    params: list = [env_id]
    if status:
        conditions.append("d.status = %s")
        params.append(status)
    if strategy:
        conditions.append("d.strategy = %s")
        params.append(strategy)
    if fund_id:
        conditions.append("d.fund_id = %s")
        params.append(str(fund_id))
    where = " AND ".join(conditions)
    logger.debug("list_deals env=%s status=%s strategy=%s fund=%s", env_id, status, strategy, fund_id)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT {_DEAL_SUMMARY_COLS}
            FROM re_pipeline_deal d
            {_DEAL_SUMMARY_JOINS}
            WHERE {where}
            ORDER BY COALESCE(activity.last_activity_at, d.updated_at, d.created_at) DESC, d.created_at DESC
            """,
            params,
        )
        rows = cur.fetchall()
    logger.debug("list_deals returned %d rows for env=%s", len(rows), env_id)
    return [_hydrate_deal_summary(row) for row in rows]


def get_deal(*, deal_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT {_DEAL_SUMMARY_COLS}
            FROM re_pipeline_deal d
            {_DEAL_SUMMARY_JOINS}
            WHERE d.deal_id = %s
            """,
            (str(deal_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Pipeline deal {deal_id} not found")
        return _hydrate_deal_summary(row)


def enrich_deal_with_geo(*, deal_id: str, market_id: str | None = None) -> dict:
    from app.services import re_geography

    context = re_geography.get_deal_geo_context(deal_id=deal_id)
    market = context.get("market_metrics") or {}
    return {
        "deal_id": deal_id,
        "market_id": market_id or market.get("market_id"),
        "market_cap_rate": market.get("market_cap_rate"),
        "population_growth_pct": market.get("population_growth_pct"),
        "vacancy_rate": market.get("vacancy_rate"),
        "employment_growth_pct": market.get("employment_growth_pct"),
        "geo_risk_score": market.get("geo_risk_score") or context.get("geo_risk_score"),
    }


def create_deal(*, env_id: str, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_pipeline_deal
                (env_id, fund_id, deal_name, status, source, strategy, property_type,
                 target_close_date, headline_price, target_irr, target_moic, notes, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING deal_id, env_id, fund_id, deal_name, status, source, strategy,
                      property_type, target_close_date, headline_price, target_irr,
                      target_moic, notes, created_by, created_at, updated_at
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
        row = cur.fetchone()
        return _hydrate_deal_summary(row)


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
            f"""UPDATE re_pipeline_deal
                SET {', '.join(sets)}
                WHERE deal_id = %s
                RETURNING deal_id, env_id, fund_id, deal_name, status, source, strategy,
                          property_type, target_close_date, headline_price, target_irr,
                          target_moic, notes, created_by, created_at, updated_at""",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Pipeline deal {deal_id} not found")
        return _hydrate_deal_summary(row)


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
