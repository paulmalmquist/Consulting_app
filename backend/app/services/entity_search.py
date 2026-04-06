"""Environment-scoped entity search with multi-strategy matching.

Resolves entity names from user messages to database records using:
1. Normalized exact match (score 1.0)
2. Prefix match (score 0.95)
3. Alias table lookup (score 0.93)
4. Fuzzy match via pg_trgm similarity (score = similarity * 0.9)

Results include a disambiguation flag when top candidates are too close.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass
from uuid import UUID

from app.db import get_cursor

_SPACE_RE = re.compile(r"[^a-z0-9]+")

# ── Cache (5-min TTL, per business_id) ──────────────────────────────
_name_cache: dict[str, tuple[float, list[_CachedEntity]]] = {}
_NAME_CACHE_TTL = 300


@dataclass(frozen=True)
class _CachedEntity:
    entity_type: str
    entity_id: str
    name: str
    normalized_name: str
    source_table: str


@dataclass
class EntitySearchResult:
    entity_type: str
    entity_id: str
    name: str
    score: float
    match_strategy: str  # "exact", "prefix", "alias", "fuzzy"
    source_table: str
    disambiguation_needed: bool = False


def _normalize(value: str | None) -> str:
    return _SPACE_RE.sub(" ", (value or "").lower()).strip()


def _load_entity_names(business_id: UUID) -> list[_CachedEntity]:
    """Load all entity names for a business into memory."""
    key = str(business_id)
    now = time.time()
    cached = _name_cache.get(key)
    if cached and now - cached[0] < _NAME_CACHE_TTL:
        return cached[1]

    entities: list[_CachedEntity] = []
    with get_cursor() as cur:
        # Funds
        cur.execute(
            "SELECT fund_id, name FROM repe_fund WHERE business_id = %s",
            (str(business_id),),
        )
        for row in cur.fetchall():
            name = row.get("name") or ""
            if name:
                entities.append(_CachedEntity(
                    entity_type="fund", entity_id=str(row["fund_id"]),
                    name=name, normalized_name=_normalize(name), source_table="repe_fund",
                ))

        # Assets
        cur.execute(
            """SELECT a.asset_id, a.name
               FROM repe_asset a
               JOIN repe_deal d ON d.deal_id = a.deal_id
               JOIN repe_fund f ON f.fund_id = d.fund_id
               WHERE f.business_id = %s""",
            (str(business_id),),
        )
        for row in cur.fetchall():
            name = row.get("name") or ""
            if name:
                entities.append(_CachedEntity(
                    entity_type="asset", entity_id=str(row["asset_id"]),
                    name=name, normalized_name=_normalize(name), source_table="repe_asset",
                ))

        # Deals
        cur.execute(
            """SELECT d.deal_id, d.name
               FROM repe_deal d
               JOIN repe_fund f ON f.fund_id = d.fund_id
               WHERE f.business_id = %s""",
            (str(business_id),),
        )
        for row in cur.fetchall():
            name = row.get("name") or ""
            if name:
                entities.append(_CachedEntity(
                    entity_type="deal", entity_id=str(row["deal_id"]),
                    name=name, normalized_name=_normalize(name), source_table="repe_deal",
                ))

    _name_cache[key] = (now, entities)
    # Evict stale entries
    if len(_name_cache) > 50:
        cutoff = now - _NAME_CACHE_TTL
        stale = [k for k, (ts, _) in _name_cache.items() if ts < cutoff]
        for k in stale:
            _name_cache.pop(k, None)

    return entities


def _score_exact(query_norm: str, entity: _CachedEntity) -> float | None:
    if entity.normalized_name == query_norm:
        return 1.0
    return None


def _score_prefix(query_norm: str, entity: _CachedEntity) -> float | None:
    if entity.normalized_name.startswith(query_norm) and len(query_norm) >= 3:
        return 0.95
    return None


def _score_contains(query_norm: str, entity: _CachedEntity) -> float | None:
    if query_norm in entity.normalized_name and len(query_norm) >= 4:
        return 0.88
    if entity.normalized_name in query_norm and len(entity.normalized_name) >= 4:
        return 0.87
    return None


_NOISE_WORDS = frozenset({
    "fund", "asset", "property", "capital", "management", "group", "inc",
    "llc", "partners", "advisors", "advisory", "the", "a", "an", "for",
    "of", "in", "at", "by", "real", "estate", "investment", "investments",
})


def _significant_tokens(text: str) -> set[str]:
    """Extract significant tokens by stripping common noise words."""
    return {t for t in text.split() if len(t) >= 3 and t not in _NOISE_WORDS}


def _score_token_overlap(query_norm: str, entity: _CachedEntity) -> float | None:
    """Score based on shared tokens — handles partial name mentions."""
    query_tokens = set(query_norm.split())
    entity_tokens = set(entity.normalized_name.split())
    if not entity_tokens:
        return None
    overlap = query_tokens & entity_tokens
    if not overlap:
        return None
    # Require at least one meaningful token (len >= 3)
    meaningful = [t for t in overlap if len(t) >= 3]
    if not meaningful:
        return None
    coverage = len(overlap) / len(entity_tokens)
    if coverage >= 0.5:
        return 0.85 * coverage
    return None


def _score_significant_word(query_norm: str, entity: _CachedEntity) -> float | None:
    """Score based on significant-word overlap — strips noise like 'fund', 'capital', etc.

    Handles cases where user says "Meridian Real Estate Fund III" and the entity
    is "Meridian Core-Plus Income" — standard token overlap fails because coverage
    is too low, but the significant word "meridian" should still surface it.
    """
    q_sig = _significant_tokens(query_norm)
    e_sig = _significant_tokens(entity.normalized_name)
    if not q_sig or not e_sig:
        return None
    overlap = q_sig & e_sig
    if not overlap:
        return None
    # Score based on how many significant entity tokens matched
    coverage = len(overlap) / len(e_sig)
    if coverage >= 0.5:
        return 0.80 * coverage  # High confidence
    if len(overlap) >= 1:
        return 0.70 * (len(overlap) / max(len(e_sig), len(q_sig)))  # Partial match
    return None


def search_entities_by_name(
    *,
    query: str,
    business_id: UUID,
    env_id: UUID | None = None,
    entity_types: list[str] | None = None,
    limit: int = 5,
) -> list[EntitySearchResult]:
    """Search for entities matching a query string within a business.

    Applies matching strategies in priority order and returns the best hits.
    If top candidates are within 0.05 score of each other, marks them as
    needing disambiguation.
    """
    query_norm = _normalize(query)
    if not query_norm or len(query_norm) < 2:
        return []

    entities = _load_entity_names(business_id)
    if entity_types:
        entities = [e for e in entities if e.entity_type in entity_types]

    # Score every entity across all strategies, keep best per entity
    scored: list[EntitySearchResult] = []
    for entity in entities:
        best_score: float | None = None
        best_strategy = ""

        for strategy, scorer in [
            ("exact", _score_exact),
            ("prefix", _score_prefix),
            ("contains", _score_contains),
            ("token_overlap", _score_token_overlap),
            ("significant_word", _score_significant_word),
        ]:
            score = scorer(query_norm, entity)
            if score is not None and (best_score is None or score > best_score):
                best_score = score
                best_strategy = strategy

        if best_score is not None and best_score > 0.3:
            scored.append(EntitySearchResult(
                entity_type=entity.entity_type,
                entity_id=entity.entity_id,
                name=entity.name,
                score=best_score,
                match_strategy=best_strategy,
                source_table=entity.source_table,
            ))

    # Sort by score descending, then by name length ascending (prefer specific)
    scored.sort(key=lambda r: (-r.score, len(r.name)))
    scored = scored[:limit]

    # Mark disambiguation if top candidates are too close
    if len(scored) >= 2 and scored[0].score - scored[1].score < 0.05:
        for r in scored:
            r.disambiguation_needed = True

    return scored


def search_entities_by_name_fuzzy_db(
    *,
    query: str,
    business_id: UUID,
    limit: int = 5,
) -> list[EntitySearchResult]:
    """Fuzzy search using pg_trgm similarity() — DB round-trip fallback.

    Only called when in-memory matching returns no results and the query
    looks like it could be a misspelled entity name (>= 5 chars).
    """
    query_norm = _normalize(query)
    if not query_norm or len(query_norm) < 5:
        return []

    results: list[EntitySearchResult] = []
    with get_cursor() as cur:
        # Check if pg_trgm is available
        cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")
        if not cur.fetchone():
            return []

        for table, id_col, entity_type in [
            ("repe_fund", "fund_id", "fund"),
            ("repe_asset", "asset_id", "asset"),
        ]:
            if table == "repe_fund":
                cur.execute(
                    f"""SELECT {id_col}, name, similarity(lower(name), %s) AS sim
                        FROM {table}
                        WHERE business_id = %s AND similarity(lower(name), %s) > 0.3
                        ORDER BY sim DESC LIMIT %s""",
                    (query_norm, str(business_id), query_norm, limit),
                )
            else:
                cur.execute(
                    f"""SELECT a.{id_col}, a.name, similarity(lower(a.name), %s) AS sim
                        FROM {table} a
                        JOIN repe_deal d ON d.deal_id = a.deal_id
                        JOIN repe_fund f ON f.fund_id = d.fund_id
                        WHERE f.business_id = %s AND similarity(lower(a.name), %s) > 0.3
                        ORDER BY sim DESC LIMIT %s""",
                    (query_norm, str(business_id), query_norm, limit),
                )
            for row in cur.fetchall():
                results.append(EntitySearchResult(
                    entity_type=entity_type,
                    entity_id=str(row[id_col]),
                    name=row["name"],
                    score=float(row["sim"]) * 0.9,
                    match_strategy="fuzzy",
                    source_table=table,
                ))

    results.sort(key=lambda r: -r.score)
    if len(results) >= 2 and results[0].score - results[1].score < 0.05:
        for r in results:
            r.disambiguation_needed = True
    return results[:limit]
