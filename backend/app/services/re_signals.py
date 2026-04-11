"""
Market signal CRUD and strength scoring for the REPE opportunity layer.

Signals represent detected market events (rent growth, distress, cap-rate
moves, etc.) that may be clustered into investment hypotheses
(repe_opportunities).  All writes are env-scoped via RLS.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)


# ── Source-type weight table (used in compute_signal_strength) ──────────────
_SOURCE_WEIGHTS: dict[str, float] = {
    "broker": 90.0,
    "market_data": 85.0,
    "internal": 75.0,
    "ai_scan": 60.0,
    "news": 55.0,
    "manual": 50.0,
}

# Normalisation upper-bounds by signal_type for the magnitude component.
# raw_value is divided by this to produce a 0–100 scalar.
_MAGNITUDE_SCALES: dict[str, float] = {
    "cap_rate_move": 3.0,        # percentage-point spread, e.g. 1.5 pp → 50
    "vacancy_trend": 20.0,       # vacancy delta in pct pts, 10 pp → 50
    "rent_growth": 10.0,         # pct, 5% → 50
    "distress": 100.0,           # arbitrary index 0-100
    "development_pipeline": 50.0,  # units in 000s, 25k → 50
    "macro": 100.0,
    "transaction": 100.0,
    "custom": 100.0,
}


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


# ── Public functions ─────────────────────────────────────────────────────────

def list_signal_sources() -> list[dict]:
    """Return all active signal sources (global reference table, no env filter)."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT source_id, source_code, source_name, source_type, active, created_at
            FROM repe_signal_sources
            ORDER BY source_name
            """
        )
        return list(cur.fetchall())


def list_signals(
    *,
    env_id: str | UUID,
    signal_type: str | None = None,
    market: str | None = None,
    direction: str | None = None,
    min_strength: float | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 200,
) -> list[dict]:
    """Return signals for the given env, with optional filters."""
    env = str(env_id)
    params: list = [env]
    clauses: list[str] = ["s.env_id = %s"]

    if signal_type:
        clauses.append("s.signal_type = %s")
        params.append(signal_type)
    if market:
        clauses.append("s.market ILIKE %s")
        params.append(f"%{market}%")
    if direction:
        clauses.append("s.direction = %s")
        params.append(direction)
    if min_strength is not None:
        clauses.append("s.strength >= %s")
        params.append(min_strength)
    if date_from:
        clauses.append("s.signal_date >= %s")
        params.append(date_from)
    if date_to:
        clauses.append("s.signal_date <= %s")
        params.append(date_to)

    where = " AND ".join(clauses)
    params.append(limit)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                s.signal_id, s.env_id, s.source_id,
                src.source_name, src.source_type,
                s.signal_type, s.market, s.submarket, s.property_type,
                s.signal_date, s.strength, s.raw_value, s.direction,
                s.signal_headline, s.signal_body,
                s.ai_generated, s.ai_model_version,
                s.metadata_json, s.created_at, s.updated_at
            FROM repe_signals s
            LEFT JOIN repe_signal_sources src ON src.source_id = s.source_id
            WHERE {where}
            ORDER BY s.signal_date DESC, s.strength DESC NULLS LAST
            LIMIT %s
            """,
            params,
        )
        return list(cur.fetchall())


def get_signal(signal_id: str | UUID) -> dict:
    """Return a single signal or raise LookupError."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                s.*, src.source_name, src.source_type
            FROM repe_signals s
            LEFT JOIN repe_signal_sources src ON src.source_id = s.source_id
            WHERE s.signal_id = %s
            """,
            [str(signal_id)],
        )
        row = cur.fetchone()
    if row is None:
        raise LookupError(f"Signal {signal_id} not found")
    return dict(row)


def create_signal(env_id: str | UUID, payload: dict) -> dict:
    """
    Insert a new signal.  Computes ``strength`` from the formula before insert
    unless the caller supplies an explicit value.
    """
    env = str(env_id)
    p = dict(payload)

    # Resolve source_type for strength calculation
    source_type = p.get("source_type") or _resolve_source_type(p.get("source_id"))

    if p.get("strength") is None:
        p["strength"] = compute_signal_strength(
            source_type=source_type or "manual",
            signal_date=p.get("signal_date") or date.today(),
            raw_value=p.get("raw_value"),
            signal_type=p.get("signal_type") or "custom",
            direction=p.get("direction") or "neutral",
        )

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO repe_signals (
                env_id, source_id, signal_type, market, submarket,
                property_type, signal_date, strength, raw_value, direction,
                signal_headline, signal_body,
                ai_generated, ai_model_version, metadata_json
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s,
                %s, %s, %s
            )
            RETURNING *
            """,
            [
                env,
                p.get("source_id"),
                p.get("signal_type", "custom"),
                p.get("market"),
                p.get("submarket"),
                p.get("property_type"),
                p.get("signal_date") or date.today(),
                p["strength"],
                p.get("raw_value"),
                p.get("direction", "neutral"),
                p.get("signal_headline", ""),
                p.get("signal_body"),
                bool(p.get("ai_generated", False)),
                p.get("ai_model_version"),
                p.get("metadata_json") or "{}",
            ],
        )
        row = cur.fetchone()
    return dict(row)


def update_signal(signal_id: str | UUID, payload: dict) -> dict:
    """Patch a signal row.  Re-computes strength if relevant fields change."""
    existing = get_signal(signal_id)
    p = dict(payload)

    recompute_fields = {"source_id", "signal_date", "raw_value", "signal_type", "direction"}
    if recompute_fields.intersection(p.keys()) and p.get("strength") is None:
        merged = {**existing, **p}
        source_type = _resolve_source_type(merged.get("source_id")) or merged.get("source_type") or "manual"
        p["strength"] = compute_signal_strength(
            source_type=source_type,
            signal_date=merged.get("signal_date") or date.today(),
            raw_value=merged.get("raw_value"),
            signal_type=merged.get("signal_type") or "custom",
            direction=merged.get("direction") or "neutral",
        )

    allowed = {
        "source_id", "signal_type", "market", "submarket", "property_type",
        "signal_date", "strength", "raw_value", "direction",
        "signal_headline", "signal_body", "ai_generated", "ai_model_version",
        "metadata_json",
    }
    updates = {k: v for k, v in p.items() if k in allowed}
    if not updates:
        return existing

    set_clauses = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [str(signal_id)]

    with get_cursor() as cur:
        cur.execute(
            f"UPDATE repe_signals SET {set_clauses} WHERE signal_id = %s RETURNING *",
            values,
        )
        row = cur.fetchone()
    if row is None:
        raise LookupError(f"Signal {signal_id} not found")
    return dict(row)


def delete_signal(signal_id: str | UUID) -> None:
    """Delete a signal (cascades to opportunity signal links)."""
    with get_cursor() as cur:
        cur.execute("DELETE FROM repe_signals WHERE signal_id = %s", [str(signal_id)])


def bulk_insert_signals(env_id: str | UUID, signals: list[dict]) -> dict:
    """
    Insert multiple signals.  Skips duplicates silently (ON CONFLICT DO NOTHING).
    Returns ``{inserted: n, errors: []}``.
    """
    env = str(env_id)
    inserted = 0
    errors: list[str] = []

    for raw in signals:
        try:
            norm = normalize_signal(raw)
            source_type = norm.get("source_type") or _resolve_source_type(norm.get("source_id")) or "manual"
            if norm.get("strength") is None:
                norm["strength"] = compute_signal_strength(
                    source_type=source_type,
                    signal_date=norm.get("signal_date") or date.today(),
                    raw_value=norm.get("raw_value"),
                    signal_type=norm.get("signal_type") or "custom",
                    direction=norm.get("direction") or "neutral",
                )

            with get_cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO repe_signals (
                        env_id, source_id, signal_type, market, submarket,
                        property_type, signal_date, strength, raw_value, direction,
                        signal_headline, signal_body,
                        ai_generated, ai_model_version, metadata_json
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s
                    )
                    ON CONFLICT DO NOTHING
                    """,
                    [
                        env,
                        norm.get("source_id"),
                        norm.get("signal_type", "custom"),
                        norm.get("market"),
                        norm.get("submarket"),
                        norm.get("property_type"),
                        norm.get("signal_date") or date.today(),
                        norm["strength"],
                        norm.get("raw_value"),
                        norm.get("direction", "neutral"),
                        norm.get("signal_headline", ""),
                        norm.get("signal_body"),
                        bool(norm.get("ai_generated", False)),
                        norm.get("ai_model_version"),
                        norm.get("metadata_json") or "{}",
                    ],
                )
                if cur.rowcount:
                    inserted += 1

        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))
            logger.warning("bulk_insert_signals: skipped row — %s", exc)

    return {"inserted": inserted, "errors": errors}


def normalize_signal(raw: dict) -> dict:
    """
    Pure function: normalise raw external signal dict into canonical field names.
    Does not touch the database.
    """
    out: dict = {}

    # Field aliases
    out["source_id"] = raw.get("source_id")
    out["source_type"] = raw.get("source_type")
    out["signal_type"] = raw.get("signal_type") or raw.get("type") or "custom"
    out["market"] = raw.get("market") or raw.get("metro")
    out["submarket"] = raw.get("submarket")
    out["property_type"] = raw.get("property_type") or raw.get("asset_type")

    # signal_date: accept string or date
    raw_date = raw.get("signal_date") or raw.get("date") or raw.get("event_date")
    if isinstance(raw_date, str):
        try:
            out["signal_date"] = date.fromisoformat(raw_date[:10])
        except ValueError:
            out["signal_date"] = date.today()
    elif isinstance(raw_date, (date, datetime)):
        out["signal_date"] = raw_date if isinstance(raw_date, date) else raw_date.date()
    else:
        out["signal_date"] = date.today()

    out["raw_value"] = raw.get("raw_value") or raw.get("value")
    out["direction"] = raw.get("direction") or "neutral"
    out["signal_headline"] = raw.get("signal_headline") or raw.get("headline") or raw.get("title") or ""
    out["signal_body"] = raw.get("signal_body") or raw.get("body") or raw.get("description")
    out["ai_generated"] = bool(raw.get("ai_generated", False))
    out["ai_model_version"] = raw.get("ai_model_version")
    out["metadata_json"] = raw.get("metadata_json") or raw.get("metadata") or {}
    out["strength"] = raw.get("strength")

    return out


def compute_signal_strength(
    *,
    source_type: str,
    signal_date: date,
    raw_value: float | None,
    signal_type: str,
    direction: str,
) -> float:
    """
    Deterministic formula (pure, no DB):

        source_weight  = lookup by source_type (50 fallback)
        recency        = max(20, 100 - (days_old / 365 * 80))
        magnitude      = clamp(raw_value / scale_for_type, 0, 100)  or 50 if missing
        direction_conf = {positive:100, negative:100, neutral:40}.get(direction, 50)

        strength = 0.30*source_weight + 0.30*recency + 0.25*magnitude + 0.15*direction_conf
    """
    source_weight = _SOURCE_WEIGHTS.get(source_type, 50.0)

    today = date.today()
    days_old = max(0, (today - signal_date).days)
    recency = max(20.0, 100.0 - (days_old / 365.0 * 80.0))

    if raw_value is not None:
        scale = _MAGNITUDE_SCALES.get(signal_type, 100.0)
        magnitude = _clamp(abs(float(raw_value)) / scale * 100.0)
    else:
        magnitude = 50.0

    direction_conf = {"positive": 100.0, "negative": 100.0, "neutral": 40.0}.get(direction, 50.0)

    raw_strength = (
        0.30 * source_weight
        + 0.30 * recency
        + 0.25 * magnitude
        + 0.15 * direction_conf
    )
    return round(_clamp(raw_strength), 2)


# ── Internal helpers ─────────────────────────────────────────────────────────

def _resolve_source_type(source_id: str | UUID | None) -> str | None:
    """Look up source_type from repe_signal_sources given a source_id."""
    if source_id is None:
        return None
    with get_cursor() as cur:
        cur.execute(
            "SELECT source_type FROM repe_signal_sources WHERE source_id = %s",
            [str(source_id)],
        )
        row = cur.fetchone()
    return row["source_type"] if row else None
