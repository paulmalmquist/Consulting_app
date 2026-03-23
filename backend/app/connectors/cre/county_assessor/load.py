"""Load parsed county assessor records into dim_entity, bridge_property_entity, and dim_parcel."""
from __future__ import annotations

import json
import logging

from app.connectors.cre.base import ConnectorContext, ensure_source_allowed
from app.db import get_cursor

log = logging.getLogger(__name__)


def load(records: list[dict], context: ConnectorContext) -> int:
    """Load entity, bridge, and parcel records from county assessor data.

    Uses upsert patterns to handle re-runs gracefully.
    """
    ensure_source_allowed("county_assessor")

    entities_loaded = 0
    bridges_loaded = 0
    parcels_loaded = 0

    # Track entity name → entity_id for bridge linking
    entity_map: dict[str, str] = {}
    # Track folio → property_id for bridge linking
    property_map: dict[str, str] = {}

    with get_cursor() as cur:
        # First pass: upsert entities
        for rec in records:
            if rec.get("_record_type") != "entity":
                continue

            cur.execute(
                """
                INSERT INTO dim_entity (env_id, business_id, name, entity_type, identifiers, provenance)
                SELECT
                    %s, %s, %s, %s, %s::jsonb, %s::jsonb
                WHERE NOT EXISTS (
                    SELECT 1 FROM dim_entity
                    WHERE env_id = %s AND business_id = %s
                      AND UPPER(TRIM(name)) = %s AND entity_type = %s
                )
                RETURNING entity_id
                """,
                (
                    context.filters.get("env_id", ""),
                    context.filters.get("business_id", ""),
                    rec["name"],
                    rec["entity_type"],
                    json.dumps(rec["identifiers"]),
                    json.dumps(rec["provenance"]),
                    context.filters.get("env_id", ""),
                    context.filters.get("business_id", ""),
                    rec["name"],
                    rec["entity_type"],
                ),
            )
            row = cur.fetchone()
            if row:
                entity_map[rec["normalized_name"]] = str(row["entity_id"])
                entities_loaded += 1
            else:
                # Entity already exists, look it up
                cur.execute(
                    """
                    SELECT entity_id FROM dim_entity
                    WHERE env_id = %s AND business_id = %s
                      AND UPPER(TRIM(name)) = %s AND entity_type = %s
                    LIMIT 1
                    """,
                    (
                        context.filters.get("env_id", ""),
                        context.filters.get("business_id", ""),
                        rec["name"],
                        rec["entity_type"],
                    ),
                )
                existing = cur.fetchone()
                if existing:
                    entity_map[rec["normalized_name"]] = str(existing["entity_id"])

        # Second pass: upsert parcels and track property mappings
        for rec in records:
            if rec.get("_record_type") != "parcel":
                continue

            # Check if property exists by parcel/folio
            cur.execute(
                """
                SELECT property_id FROM dim_property
                WHERE env_id = %s AND business_id = %s
                  AND %s = ANY(parcel_ids)
                LIMIT 1
                """,
                (
                    context.filters.get("env_id", ""),
                    context.filters.get("business_id", ""),
                    rec["parcel_id"],
                ),
            )
            existing_prop = cur.fetchone()
            if existing_prop:
                property_map[rec["parcel_id"]] = str(existing_prop["property_id"])
            # Note: we don't create dim_property rows here — that's the
            # address standardization + geocoding pipeline's job.
            parcels_loaded += 1

        # Third pass: create bridge_property_entity links
        for rec in records:
            if rec.get("_record_type") != "bridge":
                continue

            entity_id = entity_map.get(rec["owner_name"])
            property_id = property_map.get(rec["folio"])

            if not entity_id or not property_id:
                continue

            cur.execute(
                """
                INSERT INTO bridge_property_entity
                    (env_id, business_id, property_id, entity_id, role, confidence, provenance)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (property_id, entity_id) DO UPDATE
                    SET confidence = GREATEST(bridge_property_entity.confidence, EXCLUDED.confidence)
                """,
                (
                    context.filters.get("env_id", ""),
                    context.filters.get("business_id", ""),
                    property_id,
                    entity_id,
                    rec["role"],
                    rec["confidence"],
                    json.dumps(rec["provenance"]),
                ),
            )
            bridges_loaded += 1

    total = entities_loaded + bridges_loaded + parcels_loaded
    log.info(
        "County assessor load: %d entities, %d bridges, %d parcels (%d total)",
        entities_loaded, bridges_loaded, parcels_loaded, total,
    )
    return total
