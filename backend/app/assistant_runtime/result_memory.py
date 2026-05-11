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


# ── PR 8a: clustered referential / attribute-lookup patterns ─────────────
#
# Three named clusters, grouped so the resolver doesn't drift into a regex
# junk drawer. Each cluster has its own unit tests in
# backend/tests/test_result_memory.py.
#
# Cluster 1: qualifier phrases. Catch the user-typed forms for "those
# without a status" / "of the ones without statuses" / "of those". When the
# qualifier is status-related, set meaning="noncanonical_status" so the
# response wording reflects the bucket the data actually lives in
# (`other`), NOT a non-existent NULL value.
# Status-qualifier pattern: catches "of the ones without statuses",
# "those without a status", "which ones don't have a status", "the ones
# that aren't given a status", etc. Two structural slots:
#   1. anchor: optional "(of|the|which|with)" before "(ones|those)"
#   2. predicate: one of (without|missing|lacking|have no|don't have|
#      do not have|aren't given) followed by optional article and
#      "status(es)"
_QUALIFIER_STATUS_RE = re.compile(
    r"\b(?:of\s+|the\s+|which\s+|with\s+)?(?:ones|those)\s+"
    r"(?:that\s+)?"
    r"(?:"
    r"without"
    r"|missing"
    r"|lacking"
    r"|have\s+no"
    r"|don'?t\s+have"
    r"|dont\s+have"
    r"|do\s+not\s+have"
    r"|aren'?t\s+given"
    r"|aren'?t\s+assigned"
    r"|are\s+not\s+given"
    r")\s+"
    r"(?:a\s+|any\s+|canonical\s+|valid\s+)?"
    r"status(?:es)?",
    re.IGNORECASE,
)
_QUALIFIER_OF_THOSE_RE = re.compile(
    r"^\s*(?:of\s+)?(?:those|them|the\s+ones|the\s+rest|the\s+others)\b",
    re.IGNORECASE,
)
_QUALIFIER_PHRASE_PATTERNS = (_QUALIFIER_STATUS_RE, _QUALIFIER_OF_THOSE_RE)


# Cluster 2: attribute-lookup phrases. Match natural language forms. Each
# pattern captures `attrs` as a free-form phrase; `_normalize_attrs`
# splits/synonym-maps/whitelist-filters. Capturing greedily (up to a
# stopword, optional trailing punctuation, or end-of-string) sidesteps
# regex-engine non-greedy short-circuits like
# `re.match("[a-z]+?\b", "property type")` returning just "property".
_ATTRIBUTE_PHRASE_RES = (
    # "what [are|is] [their] sector and market", "what sector are they in",
    # "what's their sector"
    re.compile(
        r"\bwhat(?:'?s)?\s+(?:are\s+|is\s+)?(?:their\s+)?"
        r"(?P<attrs>[a-z][a-z\s\-,]*?)"
        r"(?:\s+(?:are|is)\s+(?:they|those|the\s+ones|it)(?:\s+in)?)?"
        r"\s*[?.!]?\s*$",
        re.IGNORECASE,
    ),
    # "show me their property type", "give me their sector and fund"
    re.compile(
        r"\b(?:show|give|tell|list)\s+(?:me\s+)?(?:their|the)\s+"
        r"(?P<attrs>[a-z][a-z\s\-,]*?)"
        r"\s*[?.!]?\s*$",
        re.IGNORECASE,
    ),
    # "sector for those", "market and fund of those",
    # "property type of the ones"
    re.compile(
        r"\b(?P<attrs>[a-z][a-z\s\-,]*?)\s+"
        r"(?:for|of)\s+(?:those|them|the\s+ones)\b",
        re.IGNORECASE,
    ),
)


# Whitelist + synonym map. `fund` IS in: the authoritative attribution
# source is the same repe_asset → repe_deal → repe_fund join that
# `list_property_assets` already uses. Verified before coding per the PR 8a
# precondition. Unknown words drop out.
_ATTRIBUTE_WHITELIST: dict[str, str] = {
    "sector": "property_type",
    "property type": "property_type",
    "property_type": "property_type",
    "market": "market",
    "fund": "fund",
    "status": "status",
    "units": "units",
    "occupancy": "occupancy",
}


def _normalize_attrs(raw: str) -> list[str]:
    """Split a captured attribute phrase on `and`/`,`, map synonyms through
    the whitelist, drop unknowns, preserve order, dedup. Used by the
    attribute-phrase cluster.
    """
    if not raw:
        return []
    parts = re.split(r"\s+and\s+|,", raw, flags=re.IGNORECASE)
    canonical: list[str] = []
    seen: set[str] = set()
    for part in parts:
        word = re.sub(r"\s+", " ", part.strip().lower())
        if not word:
            continue
        # Strip trailing question/sentence punctuation that the regex
        # may have included (e.g., "fund?" → "fund").
        word = word.rstrip("?.!")
        # Drop common pre-attribute fillers ("are", "is", "their", "the").
        word = re.sub(r"^(?:are|is|their|the)\s+", "", word).strip()
        if not word:
            continue
        canonical_name = _ATTRIBUTE_WHITELIST.get(word)
        if canonical_name and canonical_name not in seen:
            canonical.append(canonical_name)
            seen.add(canonical_name)
    return canonical


@dataclass(frozen=True)
class ReferentialIntent:
    matched_pattern: str
    bucket_name: str | None = None
    complement_of: str | None = None
    requested_count: int | None = None
    use_all_rows: bool = False
    # PR 8a additions:
    # - `requested_attributes` is the canonical-column list extracted by the
    #   attribute-phrase cluster (e.g., ["property_type", "market"]).
    # - `meaning` carries the qualifier semantics so the response wording
    #   reflects what the data actually means (e.g.,
    #   "noncanonical_status" — never claim NULL when the data is just
    #   non-canonical).
    requested_attributes: list[str] = field(default_factory=list)
    meaning: str | None = None


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
    # PR 8a: carried through from ReferentialIntent for the lifecycle's
    # attribute-lookup branch.
    requested_attributes: list[str] = field(default_factory=list)
    meaning: str | None = None


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
            requested_attributes=list(intent.requested_attributes),
            meaning=intent.meaning,
        )

    if not compatible_result_memory_scope(result_memory, current_scope):
        return ReferentialResolution(
            is_referential=True,
            status="scope_mismatch",
            matched_pattern=intent.matched_pattern,
            requested_count=intent.requested_count,
            requested_attributes=list(intent.requested_attributes),
            meaning=intent.meaning,
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
            requested_attributes=list(intent.requested_attributes),
            meaning=intent.meaning,
        )
    return ReferentialResolution(
        is_referential=True,
        status="unsupported_pattern",
        matched_pattern=intent.matched_pattern,
        requested_count=intent.requested_count,
        requested_attributes=list(intent.requested_attributes),
        meaning=intent.meaning,
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


def build_attribute_lookup_response_text(
    *,
    rows: list[dict[str, Any]],
    requested_attributes: list[str],
    meaning: str | None,
    scope_label: str,
) -> str:
    """Format the response text for an attribute-lookup follow-up.

    `rows` carries one dict per asset_id with `name` plus the requested
    attribute keys. `requested_attributes` is the canonical column list
    in user-visible order. `meaning` shapes the intro: when
    "noncanonical_status" the intro says "with a non-canonical status",
    never "without a status" — the data lives in the `other` bucket, not
    NULL.

    Attribute display labels:
      property_type → "property type"
      market        → "market"
      fund          → "fund"
      status        → "status"
      units         → "units"
      occupancy     → "occupancy"
    """
    if not rows:
        return (
            f"I have a saved result set for {scope_label} but no rows "
            f"matched the requested attribute lookup."
        )

    if meaning == "noncanonical_status":
        intro = (
            f"The {len(rows)} property asset(s) in {scope_label} with a "
            f"non-canonical status are:"
        )
    else:
        intro = (
            f"Here are the {len(rows)} saved item(s) in {scope_label}:"
        )

    display_labels = {
        "property_type": "property type",
        "market": "market",
        "fund": "fund",
        "status": "status",
        "units": "units",
        "occupancy": "occupancy",
    }

    lines = [intro]
    for row in rows[:MAX_RESULT_MEMORY_ROWS]:
        name = row.get("name") or "Unnamed"
        attr_parts: list[str] = []
        for attr in requested_attributes:
            label = display_labels.get(attr, attr.replace("_", " "))
            raw = row.get(attr)
            value = "n/a" if raw is None or raw == "" else str(raw)
            attr_parts.append(f"{label}: {value}")
        if attr_parts:
            lines.append(f"- {name} — {', '.join(attr_parts)}")
        else:
            lines.append(f"- {name}")
    if len(rows) > MAX_RESULT_MEMORY_ROWS:
        lines.append(f"- ...and {len(rows) - MAX_RESULT_MEMORY_ROWS} more")
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
    # PR 8a — pre-bind the new fields so every return path threads them.
    _attrs = list(intent.requested_attributes)
    _meaning = intent.meaning
    if intent.use_all_rows:
        bucket_name = _default_bucket_name(bucket_members)
        if bucket_name is None:
            return ReferentialResolution(
                is_referential=True,
                status="unsupported_pattern",
                matched_pattern=intent.matched_pattern,
                requested_count=intent.requested_count,
                requested_attributes=_attrs,
                meaning=_meaning,
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
            requested_attributes=_attrs,
            meaning=_meaning,
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
                        requested_attributes=_attrs,
                        meaning=_meaning,
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
            requested_attributes=_attrs,
            meaning=_meaning,
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
            requested_attributes=_attrs,
            meaning=_meaning,
        )

    return ReferentialResolution(
        is_referential=True,
        status="unsupported_pattern",
        matched_pattern=intent.matched_pattern,
        requested_count=intent.requested_count,
        requested_attributes=_attrs,
        meaning=_meaning,
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
    """Recognize a referential follow-up message.

    Dispatch order (most specific first):
      1. `other N` count pattern ("the other 4")
      2. Explicit bucket ("the active ones")
      3. Negation ("not active")
      4. Plain-names ("which ones", "list them")
      5. PR 8a clusters: qualifier-phrase + attribute-phrase
    """
    text = (message or "").strip()
    if not text:
        return None

    match = _OTHER_COUNT_RE.search(text)
    if match:
        return _augment_with_attributes(
            ReferentialIntent(
                matched_pattern="other_count",
                bucket_name="other",
                requested_count=int(match.group("count")),
            ),
            text,
        )

    match = _EXPLICIT_BUCKET_RE.search(text)
    if match:
        return _augment_with_attributes(
            ReferentialIntent(
                matched_pattern="explicit_bucket",
                bucket_name=match.group("bucket").lower(),
            ),
            text,
        )

    match = _NOT_BUCKET_RE.search(text)
    if match:
        bucket_name = (match.group("direct") or match.group("indirect") or "").lower()
        if bucket_name:
            return _augment_with_attributes(
                ReferentialIntent(
                    matched_pattern="not_bucket",
                    complement_of=bucket_name,
                ),
                text,
            )

    if _PLAIN_NAMES_RE.match(text):
        return _augment_with_attributes(
            ReferentialIntent(
                matched_pattern="plain_names",
                use_all_rows=True,
            ),
            text,
        )

    # PR 8a — qualifier-phrase cluster. Catches "of the ones without
    # statuses" / "those without a status" / "of those". When the qualifier
    # is status-related, route to the existing `other` bucket and tag with
    # meaning="noncanonical_status" so the response wording is honest
    # about the data.
    qualifier_intent = _match_qualifier_cluster(text)
    if qualifier_intent is not None:
        return _augment_with_attributes(qualifier_intent, text)

    # PR 8a — attribute-phrase cluster, standalone (no qualifier above).
    # Only fires if the captured attribute resolves through the whitelist.
    # "what sector are they in" with no qualifier → use_all_rows so the
    # resolver applies to whatever the saved memory holds.
    standalone_attrs = _extract_attribute_phrase(text)
    if standalone_attrs:
        return ReferentialIntent(
            matched_pattern="attribute_lookup",
            use_all_rows=True,
            requested_attributes=standalone_attrs,
        )

    return None


def _match_qualifier_cluster(text: str) -> ReferentialIntent | None:
    """Match the qualifier-phrase cluster (status-related and bare-of-those
    forms). Returns an intent or None. Attribute resolution is layered on
    top by `_augment_with_attributes`.
    """
    # Status qualifier — most specific.
    m = _QUALIFIER_STATUS_RE.search(text)
    if m and m.group(0):
        # The regex captures both "ones without statuses" and bare "ones"
        # alone. Differentiate: if the matched span contains a status word,
        # treat as noncanonical_status; otherwise treat as bare reference.
        span = m.group(0).lower()
        if "status" in span:
            return ReferentialIntent(
                matched_pattern="qualifier_noncanonical_status",
                bucket_name="other",
                meaning="noncanonical_status",
            )

    # Bare "of those" / "those" / "the ones" anchored at start.
    m = _QUALIFIER_OF_THOSE_RE.match(text)
    if m:
        return ReferentialIntent(
            matched_pattern="qualifier_bare_reference",
            use_all_rows=True,
        )

    return None


def _extract_attribute_phrase(text: str) -> list[str]:
    """Run the attribute-phrase patterns against `text` and return the
    canonical column list. Empty list if nothing matched OR if all matched
    words drop out of the whitelist (so the LLM path can take over).
    """
    for pattern in _ATTRIBUTE_PHRASE_RES:
        match = pattern.search(text)
        if not match:
            continue
        raw = match.group("attrs")
        canonical = _normalize_attrs(raw)
        if canonical:
            return canonical
    return []


def _augment_with_attributes(
    intent: ReferentialIntent, text: str
) -> ReferentialIntent:
    """If the message also contains an attribute-lookup phrase, attach the
    requested attributes to the given intent. Preserves the original
    matched_pattern so callers can still see which bucket/qualifier path
    fired. Frozen dataclass requires replace().
    """
    if intent.requested_attributes:
        return intent
    attrs = _extract_attribute_phrase(text)
    if not attrs:
        return intent
    from dataclasses import replace as _dc_replace

    return _dc_replace(intent, requested_attributes=attrs)


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
