"""Load SEC EDGAR parsed records into dim_entity and doc_store_index."""
from __future__ import annotations

import json
import logging

from app.connectors.cre.base import ConnectorContext, ensure_source_allowed
from app.db import get_cursor

log = logging.getLogger(__name__)


def load(records: list[dict], context: ConnectorContext) -> int:
    ensure_source_allowed("sec_edgar")
    loaded = 0

    with get_cursor() as cur:
        for rec in records:
            if rec.get("_record_type") == "entity":
                cur.execute(
                    """
                    INSERT INTO dim_entity (env_id, business_id, name, entity_type, identifiers, provenance)
                    SELECT %s, %s, %s, %s, %s::jsonb, %s::jsonb
                    WHERE NOT EXISTS (
                        SELECT 1 FROM dim_entity WHERE env_id = %s AND business_id = %s
                          AND UPPER(TRIM(name)) = UPPER(TRIM(%s)) AND entity_type = %s
                    )
                    """,
                    (
                        context.filters.get("env_id", ""), context.filters.get("business_id", ""),
                        rec["name"], rec["entity_type"],
                        json.dumps(rec.get("identifiers", {})), json.dumps(rec.get("provenance", {})),
                        context.filters.get("env_id", ""), context.filters.get("business_id", ""),
                        rec["name"], rec["entity_type"],
                    ),
                )
                loaded += cur.rowcount

            elif rec.get("_record_type") == "document":
                cur.execute(
                    """
                    INSERT INTO doc_store_index (env_id, business_id, type, uri, extracted_json, provenance)
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        context.filters.get("env_id", ""), context.filters.get("business_id", ""),
                        rec.get("type", "SEC_FILING"), rec.get("uri", ""),
                        json.dumps({"filing_date": rec.get("filing_date"), "company_name": rec.get("company_name"), "cik": rec.get("cik")}),
                        json.dumps(rec.get("provenance", {})),
                    ),
                )
                loaded += cur.rowcount

    log.info("SEC EDGAR load: %d records", loaded)
    return loaded
