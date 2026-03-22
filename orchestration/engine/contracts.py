from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .paths import ORCH_DIR


@dataclass(frozen=True)
class Contracts:
    session_schema: dict[str, Any]
    log_schema: dict[str, Any]
    intent_taxonomy: dict[str, Any]
    model_routing_rules: dict[str, Any]


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_contracts() -> Contracts:
    return Contracts(
        session_schema=_load_json(ORCH_DIR / "session_schema.json"),
        log_schema=_load_json(ORCH_DIR / "log_schema.json"),
        intent_taxonomy=_load_json(ORCH_DIR / "intent_taxonomy.json"),
        model_routing_rules=_load_json(ORCH_DIR / "model_routing_rules.json"),
    )


def validate_with_schema(schema: dict[str, Any], payload: dict[str, Any]) -> None:
    v = Draft202012Validator(schema)
    errors = sorted(v.iter_errors(payload), key=lambda e: e.path)
    if errors:
        msg = "; ".join(f"{'.'.join(str(x) for x in e.path) or '$'}: {e.message}" for e in errors)
        raise ValueError(msg)
