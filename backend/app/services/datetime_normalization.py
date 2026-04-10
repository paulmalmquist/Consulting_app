from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Any

UTC = timezone.utc
UTC_MIN = datetime.min.replace(tzinfo=UTC)


def utc_now() -> datetime:
    return datetime.now(UTC)


def coerce_utc_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=UTC)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


def datetime_sort_key(value: Any) -> datetime:
    return coerce_utc_datetime(value) or UTC_MIN


def serialize_utc_datetime(value: Any) -> str | None:
    parsed = coerce_utc_datetime(value)
    return parsed.isoformat() if parsed else None
