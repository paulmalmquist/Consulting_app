"""Shared helpers for deterministic finance math and hashing."""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_EVEN, getcontext
from hashlib import sha256
from typing import Any

getcontext().prec = 42

MONEY_QUANT = Decimal("0.000000000001")


def to_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def qmoney(value: Any) -> Decimal:
    return to_decimal(value).quantize(MONEY_QUANT, rounding=ROUND_HALF_EVEN)


def parse_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value)
    raise ValueError(f"Unsupported date value: {value!r}")


def canonical_json(data: Any) -> str:
    def _default(obj: Any) -> str:
        if isinstance(obj, Decimal):
            return format(obj, "f")
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return str(obj)

    return json.dumps(data, sort_keys=True, separators=(",", ":"), default=_default)


def deterministic_hash(data: Any) -> str:
    return sha256(canonical_json(data).encode("utf-8")).hexdigest()
