"""Pipeline document vector search: hash-based embedding + cosine similarity."""

from __future__ import annotations

import hashlib
import json
import math
from uuid import UUID

from app.db import get_cursor


# ── Embedding helpers (deterministic hash, same as winston_demo) ─────────────

def _hash_embedding(text: str, size: int = 48) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values = [(byte / 255.0) for byte in digest]
    return (values * (int(size / len(values)) + 1))[:size]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    numer = sum(a * b for a, b in zip(left, right))
    left_mag = math.sqrt(sum(a * a for a in left))
    right_mag = math.sqrt(sum(b * b for b in right))
    if left_mag == 0 or right_mag == 0:
        return 0.0
    return numer / (left_mag * right_mag)


def _load_json(val, default):
    if val is None:
        return default
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return default


# ── Public API ───────────────────────────────────────────────────────────────

def vector_search(
    *,
    env_id: str,
    query: str,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    limit: int = 10,
) -> list[dict]:
    """Search document chunks linked to pipeline entities via cosine similarity."""
    conditions = ["del.env_id = %s"]
    params: list = [env_id]

    if entity_type:
        conditions.append("del.entity_type = %s")
        params.append(entity_type)
    if entity_id:
        conditions.append("del.entity_id = %s")
        params.append(str(entity_id))

    where = " AND ".join(conditions)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
              kc.chunk_id,
              d.document_id,
              d.title,
              kc.anchor_label,
              c.content AS snippet,
              kc.embedding,
              ts_rank_cd(kc.search_tsv, plainto_tsquery('english', %s)) AS lexical_rank
            FROM kb_document_chunk kc
            JOIN app.document_chunks c ON c.chunk_id = kc.chunk_id
            JOIN app.document_versions dv ON dv.version_id = kc.version_id
            JOIN app.documents d ON d.document_id = dv.document_id
            JOIN app.document_entity_links del ON del.document_id = d.document_id
            WHERE {where}
              AND kc.search_tsv @@ plainto_tsquery('english', %s)
            ORDER BY lexical_rank DESC
            LIMIT 200
            """,
            (*params, query, query),
        )
        rows = cur.fetchall()

    if not rows:
        return []

    query_embedding = _hash_embedding(query)
    scored: list[dict] = []

    for row in rows:
        chunk_embedding = _load_json(row.get("embedding"), [])
        semantic = _cosine_similarity(query_embedding, chunk_embedding)
        lexical = float(row.get("lexical_rank") or 0.0)
        score = (lexical * 0.7) + (semantic * 0.3)
        scored.append({
            "chunk_id": row["chunk_id"],
            "document_id": row["document_id"],
            "title": row.get("title"),
            "anchor_label": row.get("anchor_label"),
            "snippet": (row.get("snippet") or "")[:500],
            "score": round(score, 4),
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:limit]
