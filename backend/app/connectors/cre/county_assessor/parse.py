"""Parse county assessor records into dim_entity, bridge_property_entity, and dim_parcel rows."""
from __future__ import annotations

import re
from typing import Any

from app.connectors.cre.base import ConnectorContext

# Suffixes to strip for owner name normalization
_CORP_SUFFIXES = re.compile(
    r"\b(LLC|L\.L\.C\.|INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|LP|L\.P\.|"
    r"CO|COMPANY|GROUP|HOLDINGS|PARTNERS|PARTNERSHIP|TRUST)\b",
    re.IGNORECASE,
)


def _normalize_owner(name: str) -> str:
    """Normalize owner name for entity creation."""
    n = name.upper().strip()
    n = _CORP_SUFFIXES.sub("", n)
    n = re.sub(r"[^A-Z0-9 ]", "", n)
    return re.sub(r"\s+", " ", n).strip()


def parse(raw: dict, context: ConnectorContext) -> list[dict[str, Any]]:
    """Parse raw Socrata records into structured rows for loading.

    Each output row has a `_record_type` field indicating whether it's
    an entity, property-entity bridge, or parcel record.
    """
    records = raw.get("records", [])
    cbsa = raw.get("cbsa", "")
    parsed: list[dict[str, Any]] = []

    for rec in records:
        # Common fields (vary by county dataset schema)
        folio = rec.get("folio_num") or rec.get("parcel_id") or rec.get("folio") or ""
        owner_name = rec.get("owner_name") or rec.get("own_name") or rec.get("owner1") or ""
        address = rec.get("site_addr") or rec.get("property_address") or rec.get("address") or ""
        assessed_value = rec.get("assessed_val") or rec.get("total_assessed") or rec.get("assessed_value")
        county_fips = rec.get("_county_fips", "")

        if not owner_name or not folio:
            continue

        normalized_owner = _normalize_owner(owner_name)
        if not normalized_owner:
            continue

        # Entity record
        parsed.append({
            "_record_type": "entity",
            "name": owner_name.strip().upper(),
            "normalized_name": normalized_owner,
            "entity_type": "owner",
            "identifiers": {"folio": folio, "county_fips": county_fips},
            "provenance": {"source": "county_assessor", "cbsa": cbsa, "county_fips": county_fips},
        })

        # Property-entity bridge
        parsed.append({
            "_record_type": "bridge",
            "folio": folio,
            "owner_name": normalized_owner,
            "role": "owner",
            "confidence": 0.90,
            "provenance": {"source": "county_assessor"},
        })

        # Parcel record (if we have address or assessed value)
        if address or assessed_value:
            parsed.append({
                "_record_type": "parcel",
                "parcel_id": folio,
                "address": address,
                "assessed_value": float(assessed_value) if assessed_value else None,
                "county_fips": county_fips,
                "provenance": {"source": "county_assessor", "cbsa": cbsa},
            })

    return parsed
