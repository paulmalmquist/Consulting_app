from __future__ import annotations

from typing import Any

import openai

from app.config import OPENAI_API_KEY, PSYCHRAG_EMBEDDING_DIMENSION, PSYCHRAG_EMBEDDING_MODEL, PSYCHRAG_TOP_K
from app.db import get_cursor


def _token_count(text: str) -> int:
    return max(1, len(text.split()))


def _vector_literal(values: list[float] | None) -> str | None:
    if values is None:
        return None
    return "[" + ",".join(f"{value:.10f}" for value in values) + "]"


def _get_embedding_client() -> openai.OpenAI | None:
    if not OPENAI_API_KEY:
        return None
    return openai.OpenAI(api_key=OPENAI_API_KEY)


def embed_text(text: str) -> list[float] | None:
    client = _get_embedding_client()
    if client is None or not text.strip():
        return None
    try:
        response = client.embeddings.create(
            model=PSYCHRAG_EMBEDDING_MODEL,
            input=[text],
        )
        embedding = response.data[0].embedding
        if len(embedding) != PSYCHRAG_EMBEDDING_DIMENSION:
            return None
        return embedding
    except Exception:
        return None


def ingest_document(*, actor_id: str, practice_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not payload.get("approved_for_rag"):
        raise ValueError("PsychRAG only ingests documents that are explicitly approved for retrieval")
    if payload.get("source_license") not in {"owned", "licensed", "public_domain", "rights_cleared"}:
        raise ValueError("PsychRAG cannot ingest restricted material into the retrieval corpus")

    chunks = payload.get("chunks") or []
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO psychrag_kb_documents (
              practice_id, title, author, document_type, source_url,
              source_license, approved_for_rag, rights_notes, embedding_model,
              total_chunks, metadata, ingested_by
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            RETURNING id, title, document_type, source_license, approved_for_rag, total_chunks, ingested_at
            """,
            (
                practice_id,
                payload["title"],
                payload.get("author"),
                payload["document_type"],
                payload.get("source_url"),
                payload["source_license"],
                bool(payload.get("approved_for_rag")),
                payload.get("rights_notes"),
                PSYCHRAG_EMBEDDING_MODEL if chunks else None,
                len(chunks),
                payload.get("metadata") or {},
                actor_id,
            ),
        )
        document = cur.fetchone()

        for idx, chunk in enumerate(chunks):
            content = (chunk.get("content") or "").strip()
            if not content:
                continue
            embedding = embed_text(content)
            cur.execute(
                """
                INSERT INTO psychrag_kb_chunks (
                  document_id, chunk_index, content, chapter, section,
                  page_start, page_end, token_count, embedding
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    document["id"],
                    idx,
                    content,
                    chunk.get("chapter"),
                    chunk.get("section"),
                    chunk.get("page_start"),
                    chunk.get("page_end"),
                    _token_count(content),
                    _vector_literal(embedding),
                ),
            )

    return document


def list_documents() -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, title, document_type, source_license, approved_for_rag, total_chunks, ingested_at
            FROM psychrag_kb_documents
            ORDER BY ingested_at DESC
            """
        )
        return cur.fetchall()


def retrieve_clinical_context(query: str, *, top_k: int | None = None) -> list[dict[str, Any]]:
    limit = top_k or PSYCHRAG_TOP_K
    query_embedding = embed_text(query)
    with get_cursor() as cur:
        if query_embedding is not None:
            vector = _vector_literal(query_embedding)
            cur.execute(
                """
                SELECT c.id, c.document_id, d.title, c.chapter, c.section, c.page_start, c.page_end,
                       c.content, 1 - (c.embedding <=> %s::vector) AS score
                FROM psychrag_kb_chunks c
                JOIN psychrag_kb_documents d ON d.id = c.document_id
                WHERE d.approved_for_rag = true
                  AND d.source_license IN ('owned', 'licensed', 'public_domain', 'rights_cleared')
                  AND c.embedding IS NOT NULL
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
                """,
                (vector, vector, limit),
            )
            rows = cur.fetchall()
            if rows:
                return rows

        cur.execute(
            """
            SELECT c.id, c.document_id, d.title, c.chapter, c.section, c.page_start, c.page_end,
                   c.content, ts_rank(c.search_tsv, plainto_tsquery('english', %s)) AS score
            FROM psychrag_kb_chunks c
            JOIN psychrag_kb_documents d ON d.id = c.document_id
            WHERE d.approved_for_rag = true
              AND d.source_license IN ('owned', 'licensed', 'public_domain', 'rights_cleared')
              AND c.search_tsv @@ plainto_tsquery('english', %s)
            ORDER BY score DESC, c.created_at DESC
            LIMIT %s
            """,
            (query, query, limit),
        )
        return cur.fetchall()
