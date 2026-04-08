from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any


MAX_RESULT_MEMORY_ROWS = 200
RESULT_MEMORY_SOURCE = "result_memory.bucket_members"
_SUPPORTED_RESULT_TYPES = frozenset({"bucketed_count", "list", "ranked_list"})
_BUCKET_ORDER = ("active", "disposed", "pipeline", "other")
_BUCKET_LABELS = {
    "active": "Active",
    "disposed": "Disposed",
    "pipeline": "Pipeline",
    "other": "Other / non-canonical status",
}

_OTHER_COUNT_RE = re.compile(
    r"\b(?:what\s+are\s+the\s+names\s+of\s+)?(?:the\s+)?(?:other|remaining)\s+(?P<count>\d+)\b",
    re.IGNORECASE,
)
_PLAIN_NAMES_RE = re.compile(
    r"^\s*(which\s+ones|list\s+them|show\s+them|their\s+names)\s*[?.!]*\s*$",
    re.IGNORECASE,
)
_EXPLICIT_BUCKET_RE = re.compile(
    r"\bthe\s+(?P<bucket>active|disposed|pipeline|other)\s+ones\b",
    re.IGNORECASE,
)
_NOT_BUCKET_RE = re.compile(
    r"\bnot\s+(?P<direct>active|disposed)\b|\bnot\s+in\s+(?P<indirect>pipeline)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ReferentialIntent:
    matched_pattern: str
    bucket_name: str | None = None
    complement_of: str | None = None
    requested_count: int | None = None
    use_all_rows: bool = False


@dataclass(frozen=True)
class ReferentialResolution:
    is_referential: bool
    status: str
    matched_pattern: str | None = None
    bucket_name: str | None = None
    complement_of: str | None = None
    requested_count: int | None = None
    resolved_count: int | None = None
    rows: list[dict[str, Any]] = field(default_factory=list)
    resolution_source: str = RESULT_MEMORY_SOURCE


def build_memory_scope(
    *,
    business_id: str | None,
    environment_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
    entity_name: str | None,
) -> dict[str, Any]:
    return {
        "business_id": business_id,
        "environment_id": environment_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
    }


def build_query_signature(*, result_type: str, source_name: str, scope: dict[str, Any]) -> str:
    return ":".join(
        [
            result_type,
            source_name,
            str(scope.get("business_id") or ""),
            str(scope.get("environment_id") or ""),
            str(scope.get("entity_type") or ""),
            str(scope.get("entity_id") or ""),
        ]
    )


def build_bucketed_count_result_memory(
    *,
    scope: dict[str, Any],
    query_signature: str,
    summary: dict[str, Any],
    rows: list[dict[str, Any]],
    bucket_members: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    capped_rows = rows[:MAX_RESULT_MEMORY_ROWS]
    return {
        "result_type": "bucketed_count",
        "scope": scope,
        "query_signature": query_signature,
        "summary": summary,
        "rows": capped_rows,
        "bucket_members": _cap_bucket_members(bucket_members),
        "stored_at": None,
    }


def build_list_result_memory(
    *,
    scope: dict[str, Any],
    query_signature: str,
    summary: dict[str, Any],
    rows: list[dict[str, Any]],
    result_type: str = "list",
) -> dict[str, Any]:
    normalized_type = result_type if result_type in {"list", "ranked_list"} else "list"
    return {
        "result_type": normalized_type,
        "scope": scope,
        "query_signature": query_signature,
        "summary": summary,
        "rows": rows[:MAX_RESULT_MEMORY_ROWS],
        "bucket_members": {},
        "stored_at": None,
    }


def extract_result_memory_from_prechecks(prechecks: list[Any]) -> dict[str, Any] | None:
    for precheck in prechecks:
        evidence = getattr(precheck, "evidence", None) or {}
        result_memory = evidence.get("result_memory")
        if _valid_result_memory(result_memory):
            return result_memory
    return None


def compatible_result_memory_scope(
    result_memory: dict[str, Any] | None,
    current_scope: dict[str, Any] | None,
) -> bool:
    if not _valid_result_memory(result_memory) or not current_scope:
        return False

    stored_scope = result_memory.get("scope") or {}
    if not stored_scope:
        return False

    if stored_scope.get("business_id") != current_scope.get("business_id"):
        return False

    stored_env = stored_scope.get("environment_id")
    current_env = current_scope.get("environment_id")
    if stored_env and current_env and stored_env != current_env:
        return False

    stored_entity_type = stored_scope.get("entity_type")
    stored_entity_id = stored_scope.get("entity_id")
    current_entity_type = current_scope.get("entity_type")
    current_entity_id = current_scope.get("entity_id")
    if stored_entity_type and stored_entity_id:
        if current_entity_type and current_entity_id:
            return (
                stored_entity_type == current_entity_type
                and stored_entity_id == current_entity_id
            )
        return True

    return True


def resolve_referential_followup(
    *,
    message: str,
    result_memory: dict[str, Any] | None,
    current_scope: dict[str, Any],
) -> ReferentialResolution:
    intent = _parse_intent(message)
    if intent is None:
        return ReferentialResolution(is_referential=False, status="not_referential")

    if not _valid_result_memory(result_memory):
        return ReferentialResolution(
            is_referential=True,
            status="no_memory",
            matched_pattern=intent.matched_pattern,
            requested_count=intent.requested_count,
        )

    if not compatible_result_memory_scope(result_memory, current_scope):
        return ReferentialResolution(
            is_referential=True,
            status="scope_mismatch",
            matched_pattern=intent.matched_pattern,
            requested_count=intent.requested_count,
        )

    result_type = result_memory.get("result_type")
    if result_type == "bucketed_count":
        return _resolve_bucketed_count(intent=intent, result_memory=result_memory)
    if result_type in {"list", "ranked_list"} and intent.use_all_rows:
        rows = list(result_memory.get("rows") or [])
        return ReferentialResolution(
            is_referential=True,
            status="resolved",
            matched_pattern=intent.matched_pattern,
            requested_count=intent.requested_count,
            resolved_count=len(rows),
            rows=rows,
        )
    return ReferentialResolution(
        is_referential=True,
        status="unsupported_pattern",
        matched_pattern=intent.matched_pattern,
        requested_count=intent.requested_count,
    )


def build_asset_count_response_text(*, scope_label: str, summary: dict[str, Any]) -> str:
    total = int(summary.get("total") or 0)
    bucket_counts = summary.get("bucket_counts") or {}
    lines = [
        f"{scope_label} has {total} total property assets in the portal. Of those:",
        f"- Active: {int(bucket_counts.get('active') or 0)}",
        f"- Disposed: {int(bucket_counts.get('disposed') or 0)}",
        f"- Pipeline: {int(bucket_counts.get('pipeline') or 0)}",
    ]
    other_count = int(bucket_counts.get("other") or 0)
    if other_count > 0:
        lines.append(f"- Other / non-canonical status: {other_count}")
    active_definition = summary.get("active_definition")
    if active_definition:
        lines.append("")
        lines.append(f"Note: {active_definition}")
    return "\n".join(lines)


def build_referential_response_text(
    *,
    resolution: ReferentialResolution,
    result_memory: dict[str, Any] | None,
    current_scope_label: str,
) -> str:
    stored_scope_label = format_scope_label((result_memory or {}).get("scope") or {})

    if resolution.status == "no_memory":
        return (
            "I don't have a compatible saved result set for this thread, so I can't resolve "
            "that deterministically. Ask me to rerun the asset count for "
            f"{current_scope_label}."
        )

    if resolution.status == "scope_mismatch":
        return (
            f"The saved result set was for {stored_scope_label}, but the current scope is "
            f"{current_scope_label}. Ask me to rerun the asset count for the current scope."
        )

    if resolution.status == "unsupported_pattern":
        return (
            'I can only resolve explicit follow-ups like "the other 4", '
            '"the active ones", or "not active" from saved result memory right now.'
        )

    if resolution.status != "resolved":
        return (
            "I couldn't resolve that deterministically from the saved result memory. "
            f"Ask me to rerun the count for {current_scope_label}."
        )

    summary = (result_memory or {}).get("summary") or {}
    bucket_label = _bucket_display_label(resolution.bucket_name)
    requested = resolution.requested_count
    resolved_count = int(resolution.resolved_count or 0)

    if resolved_count == 0:
        if resolution.complement_of:
            return (
                f"There aren't any saved items for {stored_scope_label} that are not "
                f"{resolution.complement_of.replace('_', ' ')}."
            )
        if resolution.bucket_name == "other":
            return (
                f"There aren't any property assets outside the canonical active/disposed/pipeline "
                f"buckets in the saved result for {stored_scope_label}."
            )
        if resolution.bucket_name:
            return f"There aren't any {bucket_label.lower()} items in the saved result for {stored_scope_label}."
        return f"There aren't any matching items in the saved result for {stored_scope_label}."

    if requested is not None and requested != resolved_count:
        intro = (
            f"I found {resolved_count} matching item(s) in the saved result for {stored_scope_label}, "
            f"not {requested}:"
        )
    elif resolution.complement_of:
        intro = (
            f"The {resolved_count} item(s) in the saved result for {stored_scope_label} that are not "
            f"{resolution.complement_of.replace('_', ' ')} are:"
        )
    elif resolution.bucket_name == "other":
        intro = (
            f"The {resolved_count} property asset(s) outside the canonical active/disposed/pipeline "
            f"buckets in the saved result for {stored_scope_label} are:"
        )
    elif resolution.bucket_name:
        intro = f"The {resolved_count} {bucket_label.lower()} item(s) in the saved result for {stored_scope_label} are:"
    elif summary.get("item_label"):
        intro = f"Here are the {resolved_count} saved {summary['item_label']} for {stored_scope_label}:"
    else:
        intro = f"Here are the {resolved_count} saved items for {stored_scope_label}:"

    lines = [intro]
    for row in resolution.rows[:MAX_RESULT_MEMORY_ROWS]:
        lines.append(f"- {row.get('name') or 'Unnamed'}")
    if resolved_count > len(resolution.rows[:MAX_RESULT_MEMORY_ROWS]):
        lines.append(f"- ...and {resolved_count - len(resolution.rows[:MAX_RESULT_MEMORY_ROWS])} more")
    return "\n".join(lines)


def format_scope_label(scope: dict[str, Any] | None) -> str:
    data = scope or {}
    entity_type = data.get("entity_type")
    entity_name = data.get("entity_name")
    environment_id = data.get("environment_id")
    if entity_type == "environment":
        return entity_name or environment_id or "the current environment"
    if entity_name:
        return entity_name
    if environment_id:
        return environment_id
    return "the current scope"


def _resolve_bucketed_count(
    *,
    intent: ReferentialIntent,
    result_memory: dict[str, Any],
) -> ReferentialResolution:
    bucket_members = result_memory.get("bucket_members") or {}
    summary = result_memory.get("summary") or {}
    if intent.use_all_rows:
        bucket_name = _default_bucket_name(bucket_members)
        if bucket_name is None:
            return ReferentialResolution(
                is_referential=True,
                status="unsupported_pattern",
                matched_pattern=intent.matched_pattern,
                requested_count=intent.requested_count,
            )
        rows = list(bucket_members.get(bucket_name) or [])
        return ReferentialResolution(
            is_referential=True,
            status="resolved",
            matched_pattern=intent.matched_pattern,
            bucket_name=bucket_name,
            requested_count=intent.requested_count,
            resolved_count=len(rows),
            rows=rows,
        )

    if intent.bucket_name:
        if intent.bucket_name == "other":
            primary_bucket = str(summary.get("primary_bucket") or "").strip().lower() or None
            requested_count = intent.requested_count
            if primary_bucket and requested_count is not None:
                remainder_rows = []
                for bucket_name, bucket_rows in bucket_members.items():
                    if bucket_name == primary_bucket:
                        continue
                    remainder_rows.extend(list(bucket_rows or []))
                if len(remainder_rows) == requested_count:
                    return ReferentialResolution(
                        is_referential=True,
                        status="resolved",
                        matched_pattern=intent.matched_pattern,
                        complement_of=primary_bucket,
                        requested_count=requested_count,
                        resolved_count=len(remainder_rows),
                        rows=remainder_rows,
                    )
        rows = list(bucket_members.get(intent.bucket_name) or [])
        return ReferentialResolution(
            is_referential=True,
            status="resolved",
            matched_pattern=intent.matched_pattern,
            bucket_name=intent.bucket_name,
            complement_of=intent.complement_of,
            requested_count=intent.requested_count,
            resolved_count=len(rows),
            rows=rows,
        )

    if intent.complement_of:
        rows = []
        for bucket_name, bucket_rows in bucket_members.items():
            if bucket_name == intent.complement_of:
                continue
            rows.extend(list(bucket_rows or []))
        return ReferentialResolution(
            is_referential=True,
            status="resolved",
            matched_pattern=intent.matched_pattern,
            complement_of=intent.complement_of,
            requested_count=intent.requested_count,
            resolved_count=len(rows),
            rows=rows,
        )

    return ReferentialResolution(
        is_referential=True,
        status="unsupported_pattern",
        matched_pattern=intent.matched_pattern,
        requested_count=intent.requested_count,
    )


def _default_bucket_name(bucket_members: dict[str, list[dict[str, Any]]]) -> str | None:
    other_rows = list(bucket_members.get("other") or [])
    if other_rows:
        return "other"
    non_active = [
        bucket_name
        for bucket_name in _BUCKET_ORDER
        if bucket_name != "active" and bucket_members.get(bucket_name)
    ]
    if len(non_active) == 1:
        return non_active[0]
    return None


def _bucket_display_label(bucket_name: str | None) -> str:
    if not bucket_name:
        return "Saved"
    return _BUCKET_LABELS.get(bucket_name, bucket_name.replace("_", " ").title())


def _parse_intent(message: str) -> ReferentialIntent | None:
    text = (message or "").strip()
    if not text:
        return None

    match = _OTHER_COUNT_RE.search(text)
    if match:
        return ReferentialIntent(
            matched_pattern="other_count",
            bucket_name="other",
            requested_count=int(match.group("count")),
        )

    match = _EXPLICIT_BUCKET_RE.search(text)
    if match:
        return ReferentialIntent(
            matched_pattern="explicit_bucket",
            bucket_name=match.group("bucket").lower(),
        )

    match = _NOT_BUCKET_RE.search(text)
    if match:
        bucket_name = (match.group("direct") or match.group("indirect") or "").lower()
        if bucket_name:
            return ReferentialIntent(
                matched_pattern="not_bucket",
                complement_of=bucket_name,
            )

    if _PLAIN_NAMES_RE.match(text):
        return ReferentialIntent(
            matched_pattern="plain_names",
            use_all_rows=True,
        )

    return None


def _cap_bucket_members(bucket_members: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    remaining = MAX_RESULT_MEMORY_ROWS
    capped: dict[str, list[dict[str, Any]]] = {}
    bucket_names = list(_BUCKET_ORDER) + [
        bucket_name for bucket_name in bucket_members.keys() if bucket_name not in _BUCKET_ORDER
    ]
    for bucket_name in bucket_names:
        rows = list(bucket_members.get(bucket_name) or [])
        if not rows:
            capped[bucket_name] = []
            continue
        if remaining <= 0:
            capped[bucket_name] = []
            continue
        kept = rows[:remaining]
        capped[bucket_name] = kept
        remaining -= len(kept)
    return capped


def _valid_result_memory(result_memory: dict[str, Any] | None) -> bool:
    if not isinstance(result_memory, dict):
        return False
    result_type = result_memory.get("result_type")
    return result_type in _SUPPORTED_RESULT_TYPES and isinstance(result_memory.get("scope"), dict)
