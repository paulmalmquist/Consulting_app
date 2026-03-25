from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from time import perf_counter
from typing import Any, Callable

from app.db import get_cursor


@dataclass(slots=True)
class ConnectorContext:
    run_id: str
    source_key: str
    scope: str
    filters: dict[str, Any]
    force_refresh: bool = False


@dataclass(slots=True)
class ConnectorResult:
    source_key: str
    rows_read: int
    rows_written: int
    raw_artifact_path: str
    token_cost: float = 0.0


class BaseConnector:
    def __init__(
        self,
        *,
        source_key: str,
        fetch_fn: Callable[[ConnectorContext], Any],
        parse_fn: Callable[[Any, ConnectorContext], list[dict[str, Any]]],
        load_fn: Callable[[list[dict[str, Any]], ConnectorContext], int],
    ):
        self.source_key = source_key
        self._fetch = fetch_fn
        self._parse = parse_fn
        self._load = load_fn

    def run(self, context: ConnectorContext) -> ConnectorResult:
        start = perf_counter()
        raw = self._fetch(context)
        parsed = self._parse(raw, context)
        rows_written = self._load(parsed, context)
        _ = perf_counter() - start
        return ConnectorResult(
            source_key=self.source_key,
            rows_read=len(parsed),
            rows_written=rows_written,
            raw_artifact_path=f"cre-intel/raw/{self.source_key}/{context.run_id}.json",
            token_cost=0.0,
        )


def ensure_source_allowed(source_key: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT source_key
            FROM cre_source_registry
            WHERE source_key = %s
              AND is_enabled = true
              AND license_class IN ('public', 'open')
              AND allows_robotic_access = true
            """,
            (source_key,),
        )
        row = cur.fetchone()
    if not row:
        raise ValueError(f"Source '{source_key}' is not enabled for robotic access")


def upsert_geographies(records: list[dict[str, Any]]) -> int:
    rows_written = 0
    with get_cursor() as cur:
        for row in records:
            geometry = row.get("geometry_geojson")
            geometry_json = json.dumps(geometry) if geometry else None
            cur.execute(
                """
                INSERT INTO dim_geography (
                  geography_type, geoid, name, state_code, cbsa_code, vintage, geom, metadata_json
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s,
                  CASE WHEN %s IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326) END,
                  %s::jsonb
                )
                ON CONFLICT (geography_type, geoid, vintage) DO UPDATE
                SET name = EXCLUDED.name,
                    state_code = EXCLUDED.state_code,
                    cbsa_code = EXCLUDED.cbsa_code,
                    geom = COALESCE(EXCLUDED.geom, dim_geography.geom),
                    metadata_json = EXCLUDED.metadata_json
                """,
                (
                    row["geography_type"],
                    row["geoid"],
                    row["name"],
                    row.get("state_code"),
                    row.get("cbsa_code"),
                    row["vintage"],
                    geometry_json,
                    geometry_json,
                    json.dumps(row.get("metadata_json", {})),
                ),
            )
            rows_written += 1
    return rows_written


def upsert_market_facts(records: list[dict[str, Any]]) -> int:
    rows_written = 0
    with get_cursor() as cur:
        for row in records:
            cur.execute(
                """
                SELECT geography_id
                FROM dim_geography
                WHERE geography_type = %s
                  AND geoid = %s
                ORDER BY vintage DESC
                LIMIT 1
                """,
                (row["geography_type"], row["geoid"]),
            )
            geo = cur.fetchone()
            if not geo:
                continue
            cur.execute(
                """
                INSERT INTO fact_market_timeseries (
                  geography_id, period, metric_key, value, units, source, vintage, pulled_at, provenance
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, now(), %s::jsonb)
                ON CONFLICT DO NOTHING
                """,
                (
                    str(geo["geography_id"]),
                    row["period"],
                    row["metric_key"],
                    row["value"],
                    row.get("units"),
                    row["source"],
                    row.get("vintage"),
                    json.dumps(row.get("provenance", {})),
                ),
            )
            rows_written += 1
    return rows_written


def upsert_geography_aliases(records: list[dict[str, Any]]) -> int:
    rows_written = 0
    with get_cursor() as cur:
        for row in records:
            cur.execute(
                """
                SELECT geography_id
                FROM dim_geography
                WHERE geography_type = %s
                  AND geoid = %s
                ORDER BY vintage DESC
                LIMIT 1
                """,
                (row["geography_type"], row["geoid"]),
            )
            geo = cur.fetchone()
            if not geo:
                continue
            cur.execute(
                """
                INSERT INTO cre_geography_alias (
                  geography_id, alias_type, alias_value, source, metadata_json
                )
                VALUES (%s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (alias_type, alias_value, source) DO UPDATE
                SET geography_id = EXCLUDED.geography_id,
                    metadata_json = EXCLUDED.metadata_json
                """,
                (
                    str(geo["geography_id"]),
                    row["alias_type"],
                    row["alias_value"],
                    row["source"],
                    json.dumps(row.get("metadata_json", {})),
                ),
            )
            rows_written += 1
    return rows_written


def as_period(raw: str) -> date:
    return date.fromisoformat(raw)

