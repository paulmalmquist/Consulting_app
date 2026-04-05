from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import AI_GATEWAY_ENABLED
from app.db import get_cursor

WINSTON_SCHEMA_VERSION_MARKER = "424_winston_conversation_metadata"
REQUIRED_CONVERSATION_COLUMNS = (
    "thread_kind",
    "scope_type",
    "scope_id",
    "scope_label",
    "launch_source",
    "context_summary",
    "last_route",
)
REQUIRED_CONVERSATION_INDEXES = ("idx_ai_conversations_business_thread_kind",)
ALLOWED_THREAD_KINDS = ("contextual", "general")
ALLOWED_SCOPE_TYPES = (
    "environment",
    "business",
    "fund",
    "investment",
    "deal",
    "asset",
    "model",
    "global",
    "unknown",
)


@dataclass
class WinstonReadinessResult:
    ok: bool
    enabled: bool
    schema_version_marker: str
    required_columns: list[str]
    required_indexes: list[str]
    missing_columns: list[str]
    missing_indexes: list[str]
    supported_launch_surface_ids: list[str]
    issues: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "enabled": self.enabled,
            "schema_version_marker": self.schema_version_marker,
            "required_columns": self.required_columns,
            "required_indexes": self.required_indexes,
            "missing_columns": self.missing_columns,
            "missing_indexes": self.missing_indexes,
            "supported_launch_surface_ids": self.supported_launch_surface_ids,
            "issues": self.issues,
            "allowed_thread_kinds": list(ALLOWED_THREAD_KINDS),
            "allowed_scope_types": list(ALLOWED_SCOPE_TYPES),
        }


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _launch_surfaces_path() -> Path:
    return _repo_root() / "repo-b" / "contracts" / "winston-launch-surfaces.json"


@lru_cache(maxsize=1)
def load_winston_launch_surface_contract() -> dict[str, Any]:
    with _launch_surfaces_path().open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _query_ai_conversation_columns() -> set[str]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT column_name
               FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ai_conversations'"""
        )
        rows = cur.fetchall() or []
    names: set[str] = set()
    for row in rows:
        if isinstance(row, dict) and row.get("column_name"):
            names.add(str(row["column_name"]))
    return names


def _query_ai_conversation_indexes() -> set[str]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT indexname
               FROM pg_indexes
               WHERE schemaname = 'public' AND tablename = 'ai_conversations'"""
        )
        rows = cur.fetchall() or []
    names: set[str] = set()
    for row in rows:
        if isinstance(row, dict) and row.get("indexname"):
            names.add(str(row["indexname"]))
    return names


def validate_winston_launch_surface_contract(contract: dict[str, Any] | None = None) -> list[str]:
    payload = contract or load_winston_launch_surface_contract()
    issues: list[str] = []
    surfaces = payload.get("surfaces")
    if payload.get("schema_version_marker") != WINSTON_SCHEMA_VERSION_MARKER:
        issues.append("Launch surface contract schema_version_marker does not match Winston readiness marker.")
    if not isinstance(surfaces, list) or not surfaces:
        issues.append("Launch surface contract must define at least one supported surface.")
        return issues

    required_keys = {
        "id",
        "route_pattern",
        "surface",
        "thread_kind",
        "scope_type",
        "required_context_fields",
        "launch_source",
        "entity_selection_required",
        "expected_degraded_behavior",
    }
    seen_ids: set[str] = set()
    for surface in surfaces:
        missing = sorted(required_keys - set(surface.keys()))
        if missing:
            issues.append(f"Launch surface {surface.get('id', '<unknown>')} missing keys: {', '.join(missing)}")
        surface_id = str(surface.get("id") or "")
        if not surface_id:
            issues.append("Launch surface id must be non-empty.")
        elif surface_id in seen_ids:
            issues.append(f"Duplicate launch surface id: {surface_id}")
        else:
            seen_ids.add(surface_id)
        if surface.get("thread_kind") not in ALLOWED_THREAD_KINDS:
            issues.append(f"Launch surface {surface_id} uses unsupported thread_kind={surface.get('thread_kind')}")
        if surface.get("scope_type") not in ALLOWED_SCOPE_TYPES:
            issues.append(f"Launch surface {surface_id} uses unsupported scope_type={surface.get('scope_type')}")
        if not isinstance(surface.get("required_context_fields"), list) or not surface.get("required_context_fields"):
            issues.append(f"Launch surface {surface_id} must declare required_context_fields.")
    return issues


def get_winston_readiness() -> WinstonReadinessResult:
    issues: list[str] = []
    missing_columns: list[str] = []
    missing_indexes: list[str] = []
    supported_launch_surface_ids: list[str] = []

    try:
        contract = load_winston_launch_surface_contract()
        issues.extend(validate_winston_launch_surface_contract(contract))
        supported_launch_surface_ids = [str(item.get("id")) for item in contract.get("surfaces", [])]
    except Exception as exc:
        issues.append(f"Failed to load Winston launch surface contract: {exc}")
        contract = None

    try:
        columns = _query_ai_conversation_columns()
        missing_columns = [column for column in REQUIRED_CONVERSATION_COLUMNS if column not in columns]
        if missing_columns:
            issues.append(f"ai_conversations missing required Winston columns: {', '.join(missing_columns)}")
    except Exception as exc:
        issues.append(f"Failed to inspect ai_conversations columns: {exc}")

    try:
        indexes = _query_ai_conversation_indexes()
        missing_indexes = [index for index in REQUIRED_CONVERSATION_INDEXES if index not in indexes]
        if missing_indexes:
            issues.append(f"ai_conversations missing required Winston indexes: {', '.join(missing_indexes)}")
    except Exception as exc:
        issues.append(f"Failed to inspect ai_conversations indexes: {exc}")

    ok = AI_GATEWAY_ENABLED and len(issues) == 0
    return WinstonReadinessResult(
        ok=ok,
        enabled=AI_GATEWAY_ENABLED,
        schema_version_marker=WINSTON_SCHEMA_VERSION_MARKER,
        required_columns=list(REQUIRED_CONVERSATION_COLUMNS),
        required_indexes=list(REQUIRED_CONVERSATION_INDEXES),
        missing_columns=missing_columns,
        missing_indexes=missing_indexes,
        supported_launch_surface_ids=supported_launch_surface_ids,
        issues=issues,
    )


def ensure_winston_companion_ready() -> None:
    readiness = get_winston_readiness()
    if readiness.ok:
        return
    if readiness.issues:
        raise RuntimeError("; ".join(readiness.issues))
    raise RuntimeError("Winston companion readiness failed.")
