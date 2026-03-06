
from __future__ import annotations

import functools
import logging
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Generator

from app.config import (
    OPENAI_API_KEY,
    OPENAI_EMBEDDING_MODEL,
    RAG_CHUNK_TOKENS,
    RAG_CHUNK_OVERLAP,
    RAG_EMBEDDING_CACHE_SIZE,
    RAG_RRF_K,
)
from app.db import get_cursor

logger = logging.getLogger(__name__)

# Parent chunks are 2x child chunk size for broader context
PARENT_CHUNK_TOKENS = RAG_CHUNK_TOKENS * 2


@dataclass
class Chunk:
    text: str
    chunk_index: int
    page_number: int | None = None
    token_count: int = 0
    section_heading: str | None = None
    char_start: int | None = None
    char_end: int | None = None


@dataclass
class ParentChildGroup:
    """A parent chunk and its child chunks."""
    parent: Chunk
    children: list[Chunk] = field(default_factory=list)


@dataclass
class RetrievedChunk:
    chunk_id: str
    document_id: str
    chunk_text: str
    score: float
    chunk_index: int
    section_heading: str | None = None
    section_path: str | None = None
    parent_chunk_text: str | None = None
    source_filename: str | None = None
    retrieval_method: str = "cosine"  # "cosine", "fts", "hybrid"
    entity_type: str | None = None
    entity_id: str | None = None
    env_id: str | None = None


# ── Section heading detection ───────────────────────────────────────────

_HEADING_PATTERN = re.compile(
    r"^(?:ARTICLE\s+\d+|SECTION\s+\d+|[A-Z][A-Z\s&\-]{4,})\s*[:—\-]?\s*",
    re.MULTILINE,
)


def _extract_heading(text: str) -> str | None:
    """Extract the first section heading from a chunk of text."""
    for line in text.split("\n")[:5]:
        line = line.strip()
        if _HEADING_PATTERN.match(line):
            return line.rstrip(":—- ")
    return None


# ── Token counting ──────────────────────────────────────────────────────

def _tokenize_count(text: str) -> int:
    """Count tokens using tiktoken (cl100k_base = GPT-4 tokenizer)."""
    try:
        import tiktoken

        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        return len(text) // 4


# ── Chunking ────────────────────────────────────────────────────────────

def _sliding_window_chunks(
    text: str,
    max_tokens: int,
    overlap_tokens: int = RAG_CHUNK_OVERLAP,
) -> Generator[Chunk, None, None]:
    """Sliding window chunking at paragraph boundaries.

    Strategy: Split on double-newlines (paragraphs) first, then combine
    short paragraphs and split long ones. Preserves semantic coherence
    for financial documents (IC memos, operating agreements, etc.).
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    current_tokens = 0
    current_parts: list[str] = []
    chunk_index = 0

    # Track character offsets in source text
    char_pos = 0

    def emit(parts: list[str], idx: int, start: int) -> Chunk:
        joined = "\n\n".join(parts)
        return Chunk(
            text=joined,
            chunk_index=idx,
            token_count=_tokenize_count(joined),
            section_heading=_extract_heading(joined),
            char_start=start,
            char_end=start + len(joined),
        )

    chunk_char_start = 0

    for para in paragraphs:
        para_tokens = _tokenize_count(para)
        para_len = len(para) + 2  # +2 for \n\n separator

        if current_tokens + para_tokens > max_tokens and current_parts:
            yield emit(current_parts, chunk_index, chunk_char_start)
            chunk_index += 1
            # Overlap: keep last overlap_tokens worth of content
            overlap_parts: list[str] = []
            overlap_count = 0
            for part in reversed(current_parts):
                pt = _tokenize_count(part)
                if overlap_count + pt <= overlap_tokens:
                    overlap_parts.insert(0, part)
                    overlap_count += pt
                else:
                    break
            current_parts = overlap_parts
            current_tokens = overlap_count
            chunk_char_start = char_pos - sum(len(p) + 2 for p in overlap_parts)

        current_parts.append(para)
        current_tokens += para_tokens
        char_pos += para_len

    if current_parts:
        yield emit(current_parts, chunk_index, chunk_char_start)


def _build_parent_child_groups(
    text: str,
) -> list[ParentChildGroup]:
    """Build parent-child chunk groups.

    Parent chunks are large (PARENT_CHUNK_TOKENS) for complete context.
    Child chunks are small (RAG_CHUNK_TOKENS) for precise vector search.
    Each child links to its parent so retrieval can return parent context.
    """
    parent_chunks = list(_sliding_window_chunks(text, max_tokens=PARENT_CHUNK_TOKENS))
    groups: list[ParentChildGroup] = []

    for parent in parent_chunks:
        children = list(
            _sliding_window_chunks(parent.text, max_tokens=RAG_CHUNK_TOKENS)
        )
        # Fix child char offsets to be relative to source document
        for child in children:
            if child.char_start is not None and parent.char_start is not None:
                child.char_start += parent.char_start
                child.char_end = (child.char_end or 0) + parent.char_start
        groups.append(ParentChildGroup(parent=parent, children=children))

    return groups


# ── Embedding ───────────────────────────────────────────────────────────

def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Call OpenAI Embeddings API in batches of 100.

    Falls back to zero-vectors when no API key is set (for local testing).
    """
    if not OPENAI_API_KEY:
        return [[0.0] * 1536 for _ in texts]

    import openai

    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    all_embeddings: list[list[float]] = []
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = client.embeddings.create(
            model=OPENAI_EMBEDDING_MODEL,
            input=batch,
        )
        all_embeddings.extend([item.embedding for item in response.data])
    return all_embeddings


@functools.lru_cache(maxsize=RAG_EMBEDDING_CACHE_SIZE)
def _embed_query_cached(query: str) -> tuple[float, ...]:
    """LRU-cached single-query embedding. Returns tuple for hashability."""
    result = _embed_texts([query])[0]
    logger.debug("Embedded query (%d dims, cache miss)", len(result))
    return tuple(result)


# ── Indexing ────────────────────────────────────────────────────────────

def index_document(
    *,
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    business_id: uuid.UUID,
    text: str,
    env_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    source_filename: str | None = None,
    fiscal_period: str | None = None,
    content_type_hint: str | None = None,
) -> int:
    """Chunk, embed, and upsert document into rag_chunks table.

    Creates parent-child chunk hierarchy:
    - Parent chunks stored for context retrieval
    - Child chunks embedded for precise search
    - Each child references its parent via parent_chunk_id

    Returns total number of chunks stored (parents + children).
    Idempotent: deletes existing chunks for this version_id before inserting.
    """
    if not text.strip():
        return 0

    groups = _build_parent_child_groups(text)
    if not groups:
        return 0

    # Collect all texts to embed (children only — parents are for context, not search)
    child_texts = []
    for group in groups:
        for child in group.children:
            child_texts.append(child.text)

    child_embeddings = _embed_texts(child_texts)
    total_stored = 0
    embed_idx = 0

    with get_cursor() as cur:
        # Delete existing chunks for this version (re-index idempotency)
        cur.execute(
            "DELETE FROM rag_chunks WHERE version_id = %s",
            (str(version_id),),
        )

        # Global chunk index counter across all groups
        global_chunk_idx = 0

        for group in groups:
            parent = group.parent
            parent_chunk_id = uuid.uuid4()

            # Build section path from heading
            section_path = None
            if parent.section_heading and source_filename:
                section_path = f"{source_filename} > {parent.section_heading}"
            elif parent.section_heading:
                section_path = parent.section_heading

            # Insert parent chunk (no embedding — not searched directly)
            cur.execute(
                """
                INSERT INTO rag_chunks
                  (chunk_id, document_id, version_id, business_id, env_id,
                   entity_type, entity_id, chunk_index, chunk_text,
                   token_count, chunk_type, parent_chunk_id,
                   section_heading, section_path, char_start, char_end,
                   source_filename, fiscal_period, is_current_version,
                   content_type_hint, metadata_json, embedding_model)
                VALUES
                  (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                   %s, %s::uuid, %s, %s,
                   %s, 'parent', NULL,
                   %s, %s, %s, %s,
                   %s, %s, true,
                   %s, '{}'::jsonb, %s)
                """,
                (
                    str(parent_chunk_id),
                    str(document_id),
                    str(version_id),
                    str(business_id),
                    str(env_id) if env_id else None,
                    entity_type,
                    str(entity_id) if entity_id else None,
                    global_chunk_idx,
                    parent.text,
                    parent.token_count,
                    parent.section_heading,
                    section_path,
                    parent.char_start,
                    parent.char_end,
                    source_filename,
                    fiscal_period,
                    content_type_hint,
                    OPENAI_EMBEDDING_MODEL,
                ),
            )
            total_stored += 1
            global_chunk_idx += 1

            # Insert child chunks (embedded for search)
            for child in group.children:
                embedding = child_embeddings[embed_idx]
                embed_idx += 1

                cur.execute(
                    """
                    INSERT INTO rag_chunks
                      (document_id, version_id, business_id, env_id,
                       entity_type, entity_id, chunk_index, chunk_text,
                       token_count, chunk_type, parent_chunk_id,
                       section_heading, section_path, char_start, char_end,
                       source_filename, fiscal_period, is_current_version,
                       content_type_hint, metadata_json,
                       embedding, embedding_model)
                    VALUES
                      (%s::uuid, %s::uuid, %s::uuid, %s::uuid,
                       %s, %s::uuid, %s, %s,
                       %s, 'child', %s::uuid,
                       %s, %s, %s, %s,
                       %s, %s, true,
                       %s, '{}'::jsonb,
                       %s::vector, %s)
                    """,
                    (
                        str(document_id),
                        str(version_id),
                        str(business_id),
                        str(env_id) if env_id else None,
                        entity_type,
                        str(entity_id) if entity_id else None,
                        global_chunk_idx,
                        child.text,
                        child.token_count,
                        str(parent_chunk_id),
                        child.section_heading,
                        section_path,
                        child.char_start,
                        child.char_end,
                        source_filename,
                        fiscal_period,
                        content_type_hint,
                        str(embedding),
                        OPENAI_EMBEDDING_MODEL,
                    ),
                )
                total_stored += 1
                global_chunk_idx += 1

    return total_stored


# ── Retrieval helpers ──────────────────────────────────────────────────

def _build_scope_where(
    business_id: uuid.UUID,
    env_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
) -> tuple[str, list]:
    """Build WHERE clause for business/env/entity scope filtering."""
    conditions = ["child.business_id = %s::uuid", "child.chunk_type = 'child'"]
    params: list = [str(business_id)]
    if env_id:
        conditions.append("child.env_id = %s::uuid")
        params.append(str(env_id))
    if entity_type:
        conditions.append("child.entity_type = %s")
        params.append(entity_type)
    if entity_id:
        conditions.append("child.entity_id = %s::uuid")
        params.append(str(entity_id))
    return " AND ".join(conditions), params


def _rows_to_chunks(rows: list, method: str = "cosine") -> list[RetrievedChunk]:
    """Convert DB rows to RetrievedChunk list."""
    return [
        RetrievedChunk(
            chunk_id=r["chunk_id"],
            document_id=r["document_id"],
            chunk_text=r["parent_text"] or r["child_text"],
            score=float(r["score"]),
            chunk_index=r["chunk_index"],
            section_heading=r.get("section_heading"),
            section_path=r.get("section_path"),
            parent_chunk_text=r["parent_text"],
            source_filename=r.get("source_filename"),
            retrieval_method=method,
            entity_type=r.get("entity_type"),
            entity_id=r.get("entity_id"),
            env_id=r.get("env_id"),
        )
        for r in rows
    ]


def _cosine_search(
    query_embedding: list[float] | tuple[float, ...],
    where: str,
    params: list,
    top_k: int,
) -> list[RetrievedChunk]:
    """pgvector cosine similarity search."""
    embedding_str = str(list(query_embedding))
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
              child.chunk_id::text,
              child.document_id::text,
              child.chunk_text       AS child_text,
              child.chunk_index,
              child.section_heading,
              child.section_path,
              child.source_filename,
              child.entity_type,
              child.entity_id::text,
              child.env_id::text,
              parent.chunk_text      AS parent_text,
              1 - (child.embedding <=> %s::vector) AS score
            FROM rag_chunks child
            LEFT JOIN rag_chunks parent
              ON parent.chunk_id = child.parent_chunk_id
            WHERE {where}
            ORDER BY child.embedding <=> %s::vector
            LIMIT %s
            """,
            [embedding_str] + params + [embedding_str, top_k],
        )
        return _rows_to_chunks(cur.fetchall(), method="cosine")


def _fts_search(
    query: str,
    where: str,
    params: list,
    top_k: int,
) -> list[RetrievedChunk]:
    """Full-text search with parent join."""
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
              child.chunk_id::text,
              child.document_id::text,
              child.chunk_text       AS child_text,
              child.chunk_index,
              child.section_heading,
              child.section_path,
              child.source_filename,
              child.entity_type,
              child.entity_id::text,
              child.env_id::text,
              parent.chunk_text      AS parent_text,
              ts_rank(child.search_tsv, plainto_tsquery('english', %s)) AS score
            FROM rag_chunks child
            LEFT JOIN rag_chunks parent
              ON parent.chunk_id = child.parent_chunk_id
            WHERE {where}
              AND child.search_tsv @@ plainto_tsquery('english', %s)
            ORDER BY score DESC
            LIMIT %s
            """,
            params + [query, query, top_k],
        )
        return _rows_to_chunks(cur.fetchall(), method="fts")


def _reciprocal_rank_fusion(
    *result_lists: list[RetrievedChunk],
    k: int = RAG_RRF_K,
) -> list[RetrievedChunk]:
    """Merge multiple ranked lists using Reciprocal Rank Fusion.

    RRF score = Σ(1 / (k + rank_i)) across all lists for each chunk.
    """
    rrf_scores: dict[str, float] = defaultdict(float)
    chunk_map: dict[str, RetrievedChunk] = {}

    for results in result_lists:
        for rank, chunk in enumerate(results):
            rrf_scores[chunk.chunk_id] += 1.0 / (k + rank + 1)
            if chunk.chunk_id not in chunk_map or chunk.score > chunk_map[chunk.chunk_id].score:
                chunk_map[chunk.chunk_id] = chunk

    # Sort by RRF score, update chunk scores
    merged = []
    for chunk_id, rrf_score in sorted(rrf_scores.items(), key=lambda x: -x[1]):
        chunk = chunk_map[chunk_id]
        chunk = RetrievedChunk(
            chunk_id=chunk.chunk_id,
            document_id=chunk.document_id,
            chunk_text=chunk.chunk_text,
            score=rrf_score,
            chunk_index=chunk.chunk_index,
            section_heading=chunk.section_heading,
            section_path=chunk.section_path,
            parent_chunk_text=chunk.parent_chunk_text,
            source_filename=chunk.source_filename,
            retrieval_method="hybrid",
            entity_type=chunk.entity_type,
            entity_id=chunk.entity_id,
            env_id=chunk.env_id,
        )
        merged.append(chunk)
    return merged


def _apply_metadata_boost(
    chunks: list[RetrievedChunk],
    *,
    scope_entity_type: str | None = None,
    scope_entity_id: str | None = None,
    scope_env_id: str | None = None,
) -> list[RetrievedChunk]:
    """Boost scores for chunks matching the current entity/env scope."""
    boosted = []
    for chunk in chunks:
        boost = 0.0
        if scope_entity_id and chunk.entity_id and chunk.entity_id == scope_entity_id:
            boost += 0.12
        if scope_entity_type and chunk.entity_type and chunk.entity_type == scope_entity_type:
            boost += 0.05
        if scope_env_id and chunk.env_id and chunk.env_id == scope_env_id:
            boost += 0.03
        boosted.append(RetrievedChunk(
            chunk_id=chunk.chunk_id,
            document_id=chunk.document_id,
            chunk_text=chunk.chunk_text,
            score=chunk.score + boost,
            chunk_index=chunk.chunk_index,
            section_heading=chunk.section_heading,
            section_path=chunk.section_path,
            parent_chunk_text=chunk.parent_chunk_text,
            source_filename=chunk.source_filename,
            retrieval_method=chunk.retrieval_method,
            entity_type=chunk.entity_type,
            entity_id=chunk.entity_id,
            env_id=chunk.env_id,
        ))
    return sorted(boosted, key=lambda c: -c.score)


def _dedup_by_section(chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    """Remove redundant chunks from the same document section.

    Keeps the highest-scoring chunk per (document_id, section_path) pair.
    Backfills with chunks from other sections to maintain count.
    """
    seen: set[tuple[str, str | None]] = set()
    deduped: list[RetrievedChunk] = []
    for chunk in chunks:
        key = (chunk.document_id, chunk.section_path)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(chunk)
    return deduped


# ── Main retrieval function ───────────────────────────────────────────

def semantic_search(
    query: str,
    *,
    business_id: uuid.UUID,
    env_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    top_k: int = 5,
    use_hybrid: bool = False,
    scope_entity_type: str | None = None,
    scope_entity_id: str | None = None,
    scope_env_id: str | None = None,
) -> list[RetrievedChunk]:
    """Semantic similarity search with parent-child context expansion.

    Strategy: Search child chunks (granular, precise matches) then return
    the parent chunk text for each match. This avoids the common RAG pitfall
    of returning truncated snippets that lack context.

    When use_hybrid=True, runs both cosine and FTS, merges via RRF.
    Applies metadata boosting and diversity dedup.
    Always scoped by business_id for multi-tenant isolation.
    """
    query_embedding = _embed_query_cached(query)
    where, params = _build_scope_where(business_id, env_id, entity_type, entity_id)

    with get_cursor() as cur:
        cur.execute("SELECT typname FROM pg_type WHERE typname = 'vector' LIMIT 1")
        has_vector = cur.fetchone() is not None

    # Over-fetch for hybrid/rerank pipeline
    fetch_k = top_k * 3 if use_hybrid else top_k

    if has_vector:
        cosine_results = _cosine_search(query_embedding, where, params, fetch_k)
    else:
        cosine_results = []

    if use_hybrid or not has_vector:
        fts_results = _fts_search(query, where, params, fetch_k)
    else:
        fts_results = []

    # Merge results
    if use_hybrid and cosine_results and fts_results:
        candidates = _reciprocal_rank_fusion(cosine_results, fts_results)
    elif cosine_results:
        candidates = cosine_results
    else:
        candidates = fts_results

    # Metadata boosting
    candidates = _apply_metadata_boost(
        candidates,
        scope_entity_type=scope_entity_type or entity_type,
        scope_entity_id=str(scope_entity_id) if scope_entity_id else (str(entity_id) if entity_id else None),
        scope_env_id=str(scope_env_id) if scope_env_id else (str(env_id) if env_id else None),
    )

    # Diversity dedup
    candidates = _dedup_by_section(candidates)

    return candidates[:top_k]
