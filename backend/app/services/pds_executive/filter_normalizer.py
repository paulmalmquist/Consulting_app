from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
from typing import Any
from uuid import UUID


SUPPORTED_GRAINS: tuple[str, ...] = ("portfolio", "account", "project", "issue")


@dataclass(frozen=True)
class NormalizedFilters:
    env_id: UUID
    business_id: UUID
    grain: str
    as_of_date: date
    date_from: date | None = None
    date_to: date | None = None
    entity_ids: tuple[UUID, ...] = field(default_factory=tuple)
    status_filters: tuple[str, ...] = field(default_factory=tuple)
    include_suppressed: bool = False

    def as_receipt_filters(self) -> dict[str, Any]:
        return {
            "env_id": str(self.env_id),
            "business_id": str(self.business_id),
            "grain": self.grain,
            "as_of_date": self.as_of_date.isoformat(),
            "date_from": self.date_from.isoformat() if self.date_from else None,
            "date_to": self.date_to.isoformat() if self.date_to else None,
            "entity_ids": [str(e) for e in self.entity_ids],
            "status_filters": list(self.status_filters),
            "include_suppressed": self.include_suppressed,
        }

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class FilterValidationError(ValueError):
    """Raised when inputs cannot be normalized into a valid filter contract."""


def _coerce_uuid(value: Any, field_name: str) -> UUID:
    if isinstance(value, UUID):
        return value
    if not value:
        raise FilterValidationError(f"{field_name} is required")
    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise FilterValidationError(f"{field_name} must be a UUID") from exc


def _coerce_date(value: Any, field_name: str, *, required: bool = False) -> date | None:
    if value is None or value == "":
        if required:
            raise FilterValidationError(f"{field_name} is required")
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError) as exc:
        raise FilterValidationError(f"{field_name} must be ISO date (YYYY-MM-DD)") from exc


def _coerce_entity_ids(value: Any) -> tuple[UUID, ...]:
    if not value:
        return ()
    if isinstance(value, (str, UUID)):
        value = [value]
    out: list[UUID] = []
    for idx, item in enumerate(value):
        out.append(_coerce_uuid(item, f"entity_ids[{idx}]"))
    return tuple(out)


def _coerce_statuses(value: Any) -> tuple[str, ...]:
    if not value:
        return ()
    if isinstance(value, str):
        value = [value]
    out = tuple(str(s).strip().lower() for s in value if str(s).strip())
    return out


def normalize_filters(
    *,
    env_id: Any,
    business_id: Any,
    grain: Any,
    as_of_date: Any = None,
    date_from: Any = None,
    date_to: Any = None,
    entity_ids: Any = None,
    status_filters: Any = None,
    include_suppressed: bool = False,
) -> NormalizedFilters:
    """Single entry point for every metric-producing service.

    All downstream compute functions receive a NormalizedFilters instance.
    No service may construct ad-hoc filter shapes.
    """
    resolved_env_id = _coerce_uuid(env_id, "env_id")
    resolved_business_id = _coerce_uuid(business_id, "business_id")

    grain_str = str(grain or "").strip().lower()
    if grain_str not in SUPPORTED_GRAINS:
        raise FilterValidationError(
            f"grain must be one of {SUPPORTED_GRAINS}; got {grain_str!r}"
        )

    resolved_as_of = _coerce_date(as_of_date, "as_of_date") or date.today()
    resolved_from = _coerce_date(date_from, "date_from")
    resolved_to = _coerce_date(date_to, "date_to")
    if resolved_from and resolved_to and resolved_from > resolved_to:
        raise FilterValidationError("date_from must be <= date_to")

    return NormalizedFilters(
        env_id=resolved_env_id,
        business_id=resolved_business_id,
        grain=grain_str,
        as_of_date=resolved_as_of,
        date_from=resolved_from,
        date_to=resolved_to,
        entity_ids=_coerce_entity_ids(entity_ids),
        status_filters=_coerce_statuses(status_filters),
        include_suppressed=bool(include_suppressed),
    )
