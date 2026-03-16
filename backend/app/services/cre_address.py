"""CRE Address Standardization Service.

Parses, normalizes, and deduplicates US addresses using the usaddress library.
Follows USPS publication 28 abbreviation conventions.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from uuid import UUID

from app.db import get_cursor

log = logging.getLogger(__name__)

# USPS Pub 28 suffix abbreviations (most common)
_SUFFIX_MAP: dict[str, str] = {
    "ALLEY": "ALY", "AVENUE": "AVE", "BOULEVARD": "BLVD", "CIRCLE": "CIR",
    "COURT": "CT", "COVE": "CV", "CROSSING": "XING", "DRIVE": "DR",
    "EXPRESSWAY": "EXPY", "FREEWAY": "FWY", "HIGHWAY": "HWY", "LANE": "LN",
    "LOOP": "LOOP", "PARKWAY": "PKWY", "PLACE": "PL", "PLAZA": "PLZ",
    "POINT": "PT", "ROAD": "RD", "SQUARE": "SQ", "STREET": "ST",
    "TERRACE": "TER", "TRAIL": "TRL", "TURNPIKE": "TPKE", "WAY": "WAY",
}

# Directional abbreviations
_DIRECTION_MAP: dict[str, str] = {
    "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
    "NORTHEAST": "NE", "NORTHWEST": "NW", "SOUTHEAST": "SE", "SOUTHWEST": "SW",
}

# Unit type abbreviations
_UNIT_MAP: dict[str, str] = {
    "APARTMENT": "APT", "BUILDING": "BLDG", "FLOOR": "FL", "SUITE": "STE",
    "UNIT": "UNIT", "ROOM": "RM", "DEPARTMENT": "DEPT",
}


@dataclass(slots=True)
class AddressComponents:
    number: str = ""
    pre_direction: str = ""
    street_name: str = ""
    street_suffix: str = ""
    post_direction: str = ""
    unit_type: str = ""
    unit_number: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    raw: str = ""
    standardized: str = ""
    confidence: float = 1.0
    errors: list[str] = field(default_factory=list)


def parse_address(raw: str) -> AddressComponents:
    """Parse a raw US address string into structured components.

    Uses the usaddress library for probabilistic address parsing.
    Falls back to basic regex if usaddress is unavailable.
    """
    components = AddressComponents(raw=raw.strip())

    try:
        import usaddress
        tagged, addr_type = usaddress.tag(raw)
    except ImportError:
        log.warning("usaddress not installed — using basic regex fallback")
        return _fallback_parse(raw, components)
    except usaddress.RepeatedLabelError:
        components.confidence = 0.3
        components.errors.append("Repeated label in address")
        return _fallback_parse(raw, components)

    components.number = tagged.get("AddressNumber", "")
    components.pre_direction = tagged.get("StreetNamePreDirectional", "")
    components.street_name = tagged.get("StreetName", "")
    components.street_suffix = tagged.get("StreetNamePostType", "")
    components.post_direction = tagged.get("StreetNamePostDirectional", "")
    components.unit_type = tagged.get("OccupancyType", "")
    components.unit_number = tagged.get("OccupancyIdentifier", "")
    components.city = tagged.get("PlaceName", "")
    components.state = tagged.get("StateName", "")
    components.zip_code = tagged.get("ZipCode", "")

    if addr_type == "Ambiguous":
        components.confidence = 0.6
    elif addr_type == "Street Address":
        components.confidence = 0.95

    components.standardized = standardize_address(components)
    return components


def _fallback_parse(raw: str, components: AddressComponents) -> AddressComponents:
    """Basic regex fallback when usaddress is not available."""
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) >= 3:
        components.city = parts[-2].strip() if len(parts) >= 2 else ""
        state_zip = parts[-1].strip().split()
        if state_zip:
            components.state = state_zip[0]
        if len(state_zip) > 1:
            components.zip_code = state_zip[-1]
    components.confidence = 0.4
    components.standardized = _normalize_whitespace(raw.upper())
    return components


def standardize_address(components: AddressComponents) -> str:
    """Convert parsed components to USPS canonical form.

    Example: "123 MAIN ST APT 4, MIAMI, FL 33131"
    """
    parts: list[str] = []

    if components.number:
        parts.append(components.number.upper())

    if components.pre_direction:
        d = components.pre_direction.upper()
        parts.append(_DIRECTION_MAP.get(d, d))

    if components.street_name:
        parts.append(components.street_name.upper())

    if components.street_suffix:
        s = components.street_suffix.upper()
        parts.append(_SUFFIX_MAP.get(s, s))

    if components.post_direction:
        d = components.post_direction.upper()
        parts.append(_DIRECTION_MAP.get(d, d))

    street_line = " ".join(parts)

    if components.unit_type or components.unit_number:
        ut = components.unit_type.upper()
        ut = _UNIT_MAP.get(ut, ut)
        un = components.unit_number.upper().lstrip("#")
        if ut and un:
            street_line += f" {ut} {un}"
        elif un:
            street_line += f" #{un}"

    city = components.city.upper().strip()
    state = components.state.upper().strip()
    zipcode = components.zip_code.strip()

    if city and state:
        full = f"{street_line}, {city}, {state}"
    elif city:
        full = f"{street_line}, {city}"
    else:
        full = street_line

    if zipcode:
        full += f" {zipcode}"

    return _normalize_whitespace(full)


def _normalize_whitespace(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def deduplicate_address(
    standardized: str,
    env_id: str | UUID,
    business_id: str | UUID,
) -> str | None:
    """Check dim_property for an existing property matching this standardized address.

    Returns property_id if found, None if new.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT property_id FROM dim_property
            WHERE env_id = %s AND business_id = %s
              AND UPPER(TRIM(address)) = %s
            LIMIT 1
            """,
            (str(env_id), str(business_id), standardized),
        )
        row = cur.fetchone()
    return str(row["property_id"]) if row else None


def batch_standardize(addresses: list[str]) -> list[AddressComponents]:
    """Parse and standardize a batch of addresses."""
    return [parse_address(addr) for addr in addresses]
