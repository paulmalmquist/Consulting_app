from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from .contracts import SUPPORTED_EVENT_TYPES


_DAMAGE_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*([KMB])?\s*$", re.IGNORECASE)
_EVENT_ALIASES = {
    "tstm wind": "thunderstorm wind",
    "thunderstorm winds": "thunderstorm wind",
    "flash flooding": "flash flood",
    "hurricane": "hurricane/typhoon",
    "typhoon": "hurricane/typhoon",
    "wild fire": "wildfire",
}


def parse_damage_amount(value: object) -> float | None:
    """Parse NOAA-style damage fields such as 25K, 1.2M, or 0."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.upper() in {"NA", "N/A", "UNK", "UNKNOWN", "?", "-"}:
        return None
    match = _DAMAGE_RE.match(text.replace(",", ""))
    if not match:
        return None
    try:
        number = Decimal(match.group(1))
    except InvalidOperation:
        return None
    suffix = (match.group(2) or "").upper()
    multiplier = {"": 1, "K": 1_000, "M": 1_000_000, "B": 1_000_000_000}[suffix]
    return float(number * multiplier)


def normalize_fips(value: object) -> str | None:
    """Return a five-digit county FIPS or None."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if "." in text:
        text = text.split(".", 1)[0]
    digits = "".join(ch for ch in text if ch.isdigit())
    if not digits:
        return None
    if len(digits) > 5:
        digits = digits[-5:]
    return digits.zfill(5)


def normalize_event_type(value: object) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).strip().lower().replace("_", " ").split())
    if not text:
        return None
    text = _EVENT_ALIASES.get(text, text)
    return text if text in SUPPORTED_EVENT_TYPES else None
