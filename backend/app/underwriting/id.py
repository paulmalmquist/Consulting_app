from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid5

UNDERWRITING_NAMESPACE_UUID = UUID("a70c0002-8f4e-4e59-9934-48f1e7a6f76a")


def _normalize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _normalize_value(value[k]) for k in sorted(value.keys())}
    if isinstance(value, list):
        return [_normalize_value(v) for v in value]
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, float):
        return format(Decimal(str(value)), "f")
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def canonical_json(payload: dict[str, Any]) -> str:
    normalized = _normalize_value(payload)
    return json.dumps(normalized, sort_keys=True, separators=(",", ":"))


def sha256_hex(payload: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def deterministic_run_identity(payload: dict[str, Any]) -> tuple[UUID, str]:
    input_hash = sha256_hex(payload)
    return uuid5(UNDERWRITING_NAMESPACE_UUID, input_hash), input_hash
