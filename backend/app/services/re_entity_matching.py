"""CRE Fuzzy Entity Matching Service.

Generates entity resolution candidates by comparing entity names
(Jaro-Winkler via rapidfuzz), address overlap, and role co-occurrence.
Uses blocking by normalized name prefix to avoid O(n^2).
"""
from __future__ import annotations

import json
import logging
import re
from uuid import UUID

from app.db import get_cursor

log = logging.getLogger(__name__)

# Per-entity-type merge confidence thresholds
_THRESHOLDS: dict[str, float] = {
    "owner": 0.85,
    "borrower": 0.80,
    "lender": 0.80,
    "manager": 0.75,
    "tenant": 0.70,
    "broker": 0.70,
}
_DEFAULT_THRESHOLD = 0.78

# Signal weights for composite score
_W_NAME = 0.50
_W_ADDRESS = 0.30
_W_ROLE = 0.20

# Suffixes to strip for normalization
_CORP_SUFFIXES = re.compile(
    r"\b(LLC|L\.L\.C\.|INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|LP|L\.P\.|"
    r"CO|COMPANY|GROUP|HOLDINGS|PARTNERS|PARTNERSHIP|TRUST|FUND|ASSOCIATES|"
    r"MANAGEMENT|MGMT|PROPERTIES|REALTY|REAL ESTATE|INVESTMENTS|CAPITAL)\b",
    re.IGNORECASE,
)


def _normalize_name(name: str) -> str:
    """Normalize entity name for blocking and comparison."""
    n = name.upper().strip()
    n = _CORP_SUFFIXES.sub("", n)
    n = re.sub(r"[^A-Z0-9 ]", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def _blocking_key(normalized: str) -> str:
    """First 3 chars of normalized name for blocking."""
    return normalized[:3] if len(normalized) >= 3 else normalized


def _name_similarity(a: str, b: str) -> float:
    """Compute Jaro-Winkler similarity between two normalized names."""
    try:
        from rapidfuzz.distance import JaroWinkler
        return JaroWinkler.similarity(a, b) / 100.0 if JaroWinkler.similarity(a, b) > 1 else JaroWinkler.similarity(a, b)
    except ImportError:
        # Fallback: simple token overlap (Jaccard)
        tokens_a = set(a.split())
        tokens_b = set(b.split())
        if not tokens_a or not tokens_b:
            return 0.0
        return len(tokens_a & tokens_b) / len(tokens_a | tokens_b)


def _address_overlap(
    properties_a: set[str],
    properties_b: set[str],
) -> float:
    """Compute address overlap score: fraction of shared properties."""
    if not properties_a or not properties_b:
        return 0.0
    shared = len(properties_a & properties_b)
    total = len(properties_a | properties_b)
    return shared / total if total > 0 else 0.0


def _role_similarity(roles_a: set[str], roles_b: set[str]) -> float:
    """Compute role co-occurrence: 1.0 if same roles, 0.0 if disjoint."""
    if not roles_a or not roles_b:
        return 0.0
    return len(roles_a & roles_b) / len(roles_a | roles_b)


def run_entity_matching(
    *,
    env_id: UUID,
    business_id: UUID,
    entity_type: str | None = None,
    dry_run: bool = False,
) -> list[dict]:
    """Generate merge/link candidates for entities with similar names.

    Args:
        env_id: Environment scope.
        business_id: Business scope.
        entity_type: Optional filter (e.g., 'owner'). None = all types.
        dry_run: If True, return candidates without persisting.

    Returns:
        List of candidate dicts with scores and evidence.
    """
    with get_cursor() as cur:
        # Load entities
        conditions = ["env_id = %s", "business_id = %s"]
        params: list = [str(env_id), str(business_id)]
        if entity_type:
            conditions.append("entity_type = %s")
            params.append(entity_type)

        where = " AND ".join(conditions)
        cur.execute(
            f"SELECT entity_id, name, entity_type FROM dim_entity WHERE {where}",
            params,
        )
        entities = cur.fetchall()

        if len(entities) < 2:
            log.info("Fewer than 2 entities — nothing to match")
            return []

        # Load property links for address overlap
        entity_ids = [str(e["entity_id"]) for e in entities]
        cur.execute(
            """
            SELECT entity_id, property_id, role
            FROM bridge_property_entity
            WHERE entity_id = ANY(%s::uuid[])
            """,
            (entity_ids,),
        )
        links = cur.fetchall()

    # Build lookup maps
    entity_properties: dict[str, set[str]] = {}
    entity_roles: dict[str, set[str]] = {}
    for link in links:
        eid = str(link["entity_id"])
        entity_properties.setdefault(eid, set()).add(str(link["property_id"]))
        entity_roles.setdefault(eid, set()).add(link["role"])

    # Normalize names and group by blocking key
    normalized: dict[str, str] = {}
    blocks: dict[str, list[dict]] = {}
    for e in entities:
        eid = str(e["entity_id"])
        norm = _normalize_name(e["name"] or "")
        normalized[eid] = norm
        key = _blocking_key(norm)
        if key:
            blocks.setdefault(key, []).append(e)

    # Pairwise comparison within blocks
    candidates = []
    seen_pairs: set[tuple[str, str]] = set()

    for block_entities in blocks.values():
        for i, a in enumerate(block_entities):
            for b in block_entities[i + 1:]:
                aid = str(a["entity_id"])
                bid = str(b["entity_id"])
                pair = (min(aid, bid), max(aid, bid))
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)

                # Compute scores
                name_score = _name_similarity(normalized[aid], normalized[bid])
                if name_score < 0.60:
                    continue  # skip low name similarity early

                addr_score = _address_overlap(
                    entity_properties.get(aid, set()),
                    entity_properties.get(bid, set()),
                )
                role_score = _role_similarity(
                    entity_roles.get(aid, set()),
                    entity_roles.get(bid, set()),
                )

                composite = (_W_NAME * name_score) + (_W_ADDRESS * addr_score) + (_W_ROLE * role_score)

                # Check threshold for entity type
                etype = a["entity_type"]
                threshold = _THRESHOLDS.get(etype, _DEFAULT_THRESHOLD)
                if composite < threshold:
                    continue

                candidates.append({
                    "entity_a_id": aid,
                    "entity_a_name": a["name"],
                    "entity_b_id": bid,
                    "entity_b_name": b["name"],
                    "entity_type": etype,
                    "confidence": round(composite, 4),
                    "name_score": round(name_score, 4),
                    "address_score": round(addr_score, 4),
                    "role_score": round(role_score, 4),
                })

    log.info(
        "Entity matching for env %s: %d entities, %d blocks, %d candidates above threshold",
        env_id, len(entities), len(blocks), len(candidates),
    )

    if dry_run or not candidates:
        return candidates

    # Persist candidates to cre_entity_resolution_candidate
    with get_cursor() as cur:
        for c in candidates:
            cur.execute(
                """
                INSERT INTO cre_entity_resolution_candidate
                    (env_id, business_id, candidate_type, entity_a_id, entity_b_id,
                     confidence, evidence, status)
                VALUES (%s, %s, 'merge', %s, %s, %s, %s::jsonb, 'pending')
                ON CONFLICT DO NOTHING
                """,
                (
                    str(env_id), str(business_id),
                    c["entity_a_id"], c["entity_b_id"],
                    c["confidence"],
                    json.dumps({
                        "name_score": c["name_score"],
                        "address_score": c["address_score"],
                        "role_score": c["role_score"],
                        "entity_a_name": c["entity_a_name"],
                        "entity_b_name": c["entity_b_name"],
                    }),
                ),
            )

    log.info("Persisted %d entity resolution candidates", len(candidates))
    return candidates
