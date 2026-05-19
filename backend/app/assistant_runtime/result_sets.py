"""PR 8b — multi-set result memory.

A conversation can surface several distinct row sets over its lifetime:

    turn 1: "how many assets"              → set: portfolio assets (bucketed)
    turn 3: "list the funds"               → set: portfolio funds
    turn 5: "for the funds, which are..."  → must resolve to the FUND set,
                                              not the most recent answer

PR 8a's single-slot `result_memory` (latest structured answer wins) cannot
serve turn 5 once turn 3's fund list overwrote the asset set. PR 8b adds a
bounded, TTL'd LIST of result sets, each tagged with a stable
`result_set_id`, a human `label`, resolvable `aliases`, and the entity ids
/ names. Resolution is alias-match → recency → entity-type, and a set is
ignored once it ages past `ttl_turns`.

This module is intentionally separate from `result_memory.py`: PR 8a's
single-slot path stays exactly as-is and keeps working. The lifecycle
consults the multi-set resolver first and falls back to the single-slot
resolver, so this is purely additive.

Persistence note: every `convo_svc.update_thread_*` helper rebuilds
`thread_entity_state` from a fixed key set, so a new `result_sets` key is
dropped unless ALL of them carry it forward. PR 8b.3 handles that — it is
the mechanism that makes "a failed/tool turn does not erase result_sets"
true.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any

MAX_RESULT_SETS = 6
DEFAULT_TTL_TURNS = 5
MAX_RESULT_SET_ROWS = 200

# Phrases that, on their own, reference "the set we were just looking at"
# without naming an attribute or entity type. These let bare follow-ups
# ("of those", "the rest") fall back to the most-recent live set.
#
# The negative lookahead is load-bearing: "the ones WITHOUT statuses" is a
# *specific* alias phrase, not a generic reference. If the specific set it
# names has expired, we must NOT silently rebind to whatever set is most
# recent — that produces a confidently-wrong answer. So a generic token
# followed by a restrictive qualifier (without / with / that / missing /
# lacking / in / are / don't ...) does not count as generic; it falls
# through and the LLM can ask for clarification.
_RESTRICTIVE_QUALIFIER = (
    r"without|with|that|which|missing|lacking|in\b|are\b|is\b|"
    r"do\b|don'?t|dont|have|has|no\b|not\b"
)
_GENERIC_SET_REFERENCE_RE = re.compile(
    r"\b(?:of\s+)?(?:those|them|these|the\s+ones|the\s+rest|the\s+others|"
    r"that\s+(?:list|set|group)|the\s+(?:list|set|group))\b"
    rf"(?!\s+(?:{_RESTRICTIVE_QUALIFIER}))",
    re.IGNORECASE,
)


@dataclass
class ResultSet:
    """One durable, addressable row set captured from a structured answer."""

    result_set_id: str
    label: str
    entity_type: str
    entity_names: list[str]
    entity_ids: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)
    attributes_available: list[str] = field(default_factory=list)
    source: str = "structured_executor"
    source_query: str | None = None
    source_turn_id: str | None = None
    created_turn_index: int = 0
    ttl_turns: int = DEFAULT_TTL_TURNS
    confidence: float = 0.9
    environment_id: str | None = None
    business_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "result_set_id": self.result_set_id,
            "label": self.label,
            "entity_type": self.entity_type,
            "entity_names": self.entity_names[:MAX_RESULT_SET_ROWS],
            "entity_ids": self.entity_ids[:MAX_RESULT_SET_ROWS],
            "aliases": self.aliases,
            "attributes_available": self.attributes_available,
            "source": self.source,
            "source_query": self.source_query,
            "source_turn_id": self.source_turn_id,
            "created_turn_index": self.created_turn_index,
            "ttl_turns": self.ttl_turns,
            "confidence": self.confidence,
            "environment_id": self.environment_id,
            "business_id": self.business_id,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "ResultSet":
        return cls(
            result_set_id=str(raw.get("result_set_id") or ""),
            label=str(raw.get("label") or ""),
            entity_type=str(raw.get("entity_type") or ""),
            entity_names=list(raw.get("entity_names") or []),
            entity_ids=list(raw.get("entity_ids") or []),
            aliases=list(raw.get("aliases") or []),
            attributes_available=list(raw.get("attributes_available") or []),
            source=str(raw.get("source") or "structured_executor"),
            source_query=raw.get("source_query"),
            source_turn_id=raw.get("source_turn_id"),
            created_turn_index=int(raw.get("created_turn_index") or 0),
            ttl_turns=int(raw.get("ttl_turns") or DEFAULT_TTL_TURNS),
            confidence=float(raw.get("confidence") or 0.9),
            environment_id=raw.get("environment_id"),
            business_id=raw.get("business_id"),
        )


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")
    return slug or "set"


def make_result_set_id(*, entity_type: str, label: str, scope_key: str) -> str:
    """Stable id: same entity_type + label + scope re-emits the same id so
    a refreshed set replaces (not duplicates) the prior one."""
    base = f"{entity_type}:{_slugify(label)}:{scope_key}"
    digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:8]
    return f"{_slugify(entity_type)}_{_slugify(label)}_{digest}"


def build_result_set(
    *,
    entity_type: str,
    label: str,
    entity_names: list[str],
    entity_ids: list[str] | None = None,
    aliases: list[str] | None = None,
    attributes_available: list[str] | None = None,
    source: str = "structured_executor",
    source_query: str | None = None,
    source_turn_id: str | None = None,
    created_turn_index: int = 0,
    ttl_turns: int = DEFAULT_TTL_TURNS,
    confidence: float = 0.9,
    environment_id: str | None = None,
    business_id: str | None = None,
    scope_key: str | None = None,
) -> ResultSet:
    """Construct a ResultSet. Auto-generates aliases from the entity type
    and label so the resolver has phrase hooks even if the producer only
    passes a label.
    """
    auto_aliases = _auto_aliases(entity_type=entity_type, label=label)
    merged_aliases: list[str] = []
    for alias in [*(aliases or []), *auto_aliases]:
        norm = alias.strip().lower()
        if norm and norm not in merged_aliases:
            merged_aliases.append(norm)
    rsid = make_result_set_id(
        entity_type=entity_type,
        label=label,
        scope_key=scope_key or (environment_id or business_id or "global"),
    )
    return ResultSet(
        result_set_id=rsid,
        label=label,
        entity_type=entity_type,
        entity_names=list(entity_names),
        entity_ids=list(entity_ids or []),
        aliases=merged_aliases,
        attributes_available=list(attributes_available or []),
        source=source,
        source_query=source_query,
        source_turn_id=source_turn_id,
        created_turn_index=created_turn_index,
        ttl_turns=ttl_turns,
        confidence=confidence,
        environment_id=environment_id,
        business_id=business_id,
    )


def _auto_aliases(*, entity_type: str, label: str) -> list[str]:
    et = (entity_type or "").strip().lower()
    lbl = (label or "").strip().lower()
    out: list[str] = []
    if lbl:
        out.append(lbl)
        # "assets without statuses" → also "the assets without statuses"
        out.append(f"the {lbl}")
    if et:
        plural = et if et.endswith("s") else f"{et}s"
        out.append(plural)
        out.append(f"the {plural}")
        out.append(f"those {plural}")
    return out


def upsert_result_set(
    existing: list[dict[str, Any]] | None,
    new_set: "ResultSet | dict[str, Any]",
    *,
    max_sets: int = MAX_RESULT_SETS,
) -> list[dict[str, Any]]:
    """Append `new_set`, replacing any prior entry with the same
    result_set_id (a refreshed set supersedes the stale one), then evict
    oldest beyond `max_sets`. Returns the new list of dicts.

    Accepts a ResultSet or an already-serialized dict (a dict
    round-tripped from storage can legitimately be re-upserted).

    Crucially this is additive — it never *clears* the list, so a turn
    that produces a new set keeps every other still-live set.
    """
    new_dict = new_set.to_dict() if isinstance(new_set, ResultSet) else dict(new_set)
    new_id = new_dict.get("result_set_id")
    kept: list[dict[str, Any]] = []
    for item in existing or []:
        if not isinstance(item, dict):
            continue
        if item.get("result_set_id") == new_id:
            continue  # superseded
        kept.append(item)
    kept.append(new_dict)
    # Most-recent-last; evict from the front when over capacity.
    if len(kept) > max_sets:
        kept = kept[-max_sets:]
    return kept


# ── Resolver ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ResultSetMatch:
    matched: bool
    result_set: dict[str, Any] | None = None
    match_reason: str | None = None  # "alias" | "generic_recent" | "entity_type"
    turn_distance: int | None = None
    expired_candidates: int = 0


def _scope_compatible(
    rs: dict[str, Any], current_scope: dict[str, Any] | None
) -> bool:
    if not current_scope:
        return True
    cs_biz = current_scope.get("business_id")
    rs_biz = rs.get("business_id")
    if cs_biz and rs_biz and str(cs_biz) != str(rs_biz):
        return False
    cs_env = current_scope.get("environment_id")
    rs_env = rs.get("environment_id")
    if cs_env and rs_env and str(cs_env) != str(rs_env):
        return False
    return True


def resolve_result_set(
    *,
    message: str,
    result_sets: list[dict[str, Any]] | None,
    current_turn_index: int,
    current_scope: dict[str, Any] | None = None,
) -> ResultSetMatch:
    """Pick the best live result set for a referential message.

    Precedence:
      1. Alias hit — message contains an alias phrase of a set. Among
         alias hits, prefer the most recent (highest created_turn_index).
      2. Generic set reference ("of those", "the rest") with no alias —
         the most recent live set.
      3. No match.

    A set is "live" only while
    `current_turn_index - created_turn_index <= ttl_turns`. Expired sets
    are skipped (counted in `expired_candidates` for diagnostics) — they
    are NOT deleted here; eviction is upsert/`prune_expired`'s job.

    Scope-incompatible sets (different business/environment) are skipped.
    """
    sets = [s for s in (result_sets or []) if isinstance(s, dict)]
    if not sets:
        return ResultSetMatch(matched=False)

    lower = (message or "").strip().lower()
    if not lower:
        return ResultSetMatch(matched=False)

    expired = 0
    alias_hits: list[tuple[int, dict[str, Any]]] = []
    live_sets: list[tuple[int, dict[str, Any]]] = []

    for rs in sets:
        if not _scope_compatible(rs, current_scope):
            continue
        created = int(rs.get("created_turn_index") or 0)
        ttl = int(rs.get("ttl_turns") or DEFAULT_TTL_TURNS)
        distance = current_turn_index - created
        if distance > ttl:
            expired += 1
            continue
        live_sets.append((created, rs))
        for alias in rs.get("aliases") or []:
            alias_norm = str(alias).strip().lower()
            if alias_norm and alias_norm in lower:
                alias_hits.append((created, rs))
                break

    if alias_hits:
        alias_hits.sort(key=lambda pair: pair[0])
        created, rs = alias_hits[-1]
        return ResultSetMatch(
            matched=True,
            result_set=rs,
            match_reason="alias",
            turn_distance=current_turn_index - created,
            expired_candidates=expired,
        )

    if live_sets and _GENERIC_SET_REFERENCE_RE.search(lower):
        live_sets.sort(key=lambda pair: pair[0])
        created, rs = live_sets[-1]
        return ResultSetMatch(
            matched=True,
            result_set=rs,
            match_reason="generic_recent",
            turn_distance=current_turn_index - created,
            expired_candidates=expired,
        )

    return ResultSetMatch(matched=False, expired_candidates=expired)


def result_set_from_structured_outcome(
    *,
    thread_subject: dict[str, Any] | None,
    result_memory: dict[str, Any] | None,
    source_query: str | None,
    source_turn_id: str | None,
    created_turn_index: int,
    environment_id: str | None,
    business_id: str | None,
) -> ResultSet | None:
    """Derive a ResultSet from a structured outcome's existing
    `thread_subject` + `result_memory`. Returns None when there isn't
    enough to build an addressable set (no entity type, or no rows).

    This keeps producers untouched: the Meridian runtime already emits
    thread_subject (entity_type, entity_label_plural, supported_followups,
    result_set_hint) and result_memory (rows / bucket_members). We project
    those into a durable, alias-addressable set rather than editing every
    outcome constructor.
    """
    ts = thread_subject or {}
    rm = result_memory or {}
    entity_type = ts.get("entity_type")
    if not entity_type:
        return None

    # Collect rows: bucketed_count → flatten bucket_members; list → rows.
    rows: list[dict[str, Any]] = []
    bucket_members = rm.get("bucket_members") or {}
    if bucket_members:
        for bucket_rows in bucket_members.values():
            rows.extend(bucket_rows or [])
    if not rows:
        rows = list(rm.get("rows") or [])
    if not rows:
        return None

    entity_names = [
        str(r.get("name")) for r in rows if r.get("name")
    ][:MAX_RESULT_SET_ROWS]
    entity_ids = [
        str(r.get("id") or r.get("asset_id") or r.get("entity_id"))
        for r in rows
        if (r.get("id") or r.get("asset_id") or r.get("entity_id"))
    ][:MAX_RESULT_SET_ROWS]
    if not entity_names:
        return None

    label_plural = ts.get("entity_label_plural") or f"{entity_type}s"
    result_set_hint = ts.get("result_set_hint")
    label = result_set_hint or f"{label_plural}"

    # Aliases: producer hints + the label + entity plural (build_result_set
    # adds the entity-type auto-aliases). supported_followups names like
    # "missing_status" become readable phrase hooks.
    aliases: list[str] = [label_plural]
    if result_set_hint:
        aliases.append(result_set_hint.replace("_", " "))
    for fu in ts.get("supported_followups") or []:
        phrase = str(fu).replace("_", " ")
        aliases.append(phrase)
        if "status" in phrase:
            # the failing real phrasing: "ones without statuses"
            aliases.append("ones without statuses")
            aliases.append("ones without a status")

    scope_key = environment_id or business_id or "global"
    return build_result_set(
        entity_type=entity_type,
        label=label,
        entity_names=entity_names,
        entity_ids=entity_ids,
        aliases=aliases,
        attributes_available=["property_type", "market", "fund", "status"]
        if entity_type == "asset"
        else [],
        source=str(ts.get("source") or "structured_executor"),
        source_query=source_query,
        source_turn_id=source_turn_id,
        created_turn_index=created_turn_index,
        confidence=float(ts.get("confidence") or 0.9),
        environment_id=environment_id,
        business_id=business_id,
        scope_key=scope_key,
    )


def result_memory_from_set(matched: dict[str, Any]) -> dict[str, Any]:
    """Project a stored result_set back into the single-slot
    `result_memory` shape (result_type='list') so the existing PR 8a
    `resolve_referential_followup` + attribute-lookup machinery can run
    on it unchanged. No rendering logic is duplicated — PR 8b only
    decides *which row set* the proven PR 8a path operates on.
    """
    names = matched.get("entity_names") or []
    ids = matched.get("entity_ids") or []
    entity_type = matched.get("entity_type") or "asset"
    rows: list[dict[str, Any]] = []
    for idx, name in enumerate(names):
        row: dict[str, Any] = {"name": name, "entity_type": entity_type}
        if idx < len(ids):
            row["id"] = ids[idx]
        rows.append(row)
    return {
        "result_type": "list",
        "scope": {
            "business_id": matched.get("business_id"),
            "environment_id": matched.get("environment_id"),
            "entity_type": "environment",
            "entity_id": matched.get("environment_id"),
            "entity_name": None,
        },
        "query_signature": f"result_set:{matched.get('result_set_id')}",
        "summary": {
            "total": len(rows),
            "item_label": matched.get("label") or f"{entity_type}(s)",
        },
        "rows": rows[:MAX_RESULT_SET_ROWS],
        "bucket_members": {},
        "stored_at": None,
    }


def prune_expired(
    result_sets: list[dict[str, Any]] | None,
    *,
    current_turn_index: int,
) -> list[dict[str, Any]]:
    """Drop sets aged past their ttl_turns. Called on the write path so
    stale sets don't accumulate. Read-path resolution also skips expired
    sets defensively, so a missed prune never produces a wrong answer.
    """
    out: list[dict[str, Any]] = []
    for rs in result_sets or []:
        if not isinstance(rs, dict):
            continue
        created = int(rs.get("created_turn_index") or 0)
        ttl = int(rs.get("ttl_turns") or DEFAULT_TTL_TURNS)
        if current_turn_index - created <= ttl:
            out.append(rs)
    return out
