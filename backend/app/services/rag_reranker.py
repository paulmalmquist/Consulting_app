"""RAG re-ranking pipeline — cross-encoder re-scoring with Cohere or LLM fallback."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from app.config import COHERE_API_KEY, OPENAI_API_KEY, RAG_RERANK_METHOD
from app.services.rag_indexer import RetrievedChunk

logger = logging.getLogger(__name__)

# Re-ranker timeout — fall back to input order if exceeded
_RERANK_TIMEOUT_SECONDS = 0.5


async def rerank_chunks(
    query: str,
    chunks: list[RetrievedChunk],
    top_k: int = 5,
    method: str | None = None,
) -> list[RetrievedChunk]:
    """Re-rank chunks using cross-encoder scoring.

    Methods:
    - "cohere": Cohere Rerank v3 API (fastest, best quality)
    - "llm": gpt-4o-mini structured scoring fallback
    - "none": skip re-ranking, return input unchanged

    Falls back gracefully on timeout or error.
    """
    effective_method = method or RAG_RERANK_METHOD

    if effective_method == "none" or len(chunks) <= 1:
        return chunks[:top_k]

    start = time.time()
    try:
        if effective_method == "cohere" and COHERE_API_KEY:
            result = await asyncio.wait_for(
                _cohere_rerank(query, chunks, top_k),
                timeout=_RERANK_TIMEOUT_SECONDS,
            )
        elif effective_method == "llm" or (effective_method == "cohere" and not COHERE_API_KEY):
            result = await asyncio.wait_for(
                _llm_rerank(query, chunks, top_k),
                timeout=2.0,  # LLM rerank is slower, give it more time
            )
        else:
            result = chunks[:top_k]

        elapsed_ms = int((time.time() - start) * 1000)
        logger.debug("Rerank (%s): %d -> %d chunks in %dms", effective_method, len(chunks), len(result), elapsed_ms)
        return result

    except asyncio.TimeoutError:
        logger.warning("Rerank timeout (%s) after %.0fms — falling back to input order", effective_method, (time.time() - start) * 1000)
        return chunks[:top_k]
    except Exception:
        logger.exception("Rerank error (%s) — falling back to input order", effective_method)
        return chunks[:top_k]


async def _cohere_rerank(
    query: str,
    chunks: list[RetrievedChunk],
    top_k: int,
) -> list[RetrievedChunk]:
    """Re-rank using Cohere Rerank v3 API."""
    import cohere

    co = cohere.AsyncClientV2(api_key=COHERE_API_KEY)
    documents = [c.chunk_text[:2000] for c in chunks]

    response = await co.rerank(
        model="rerank-v3.5",
        query=query,
        documents=documents,
        top_n=top_k,
    )

    reranked: list[RetrievedChunk] = []
    for result in response.results:
        original = chunks[result.index]
        reranked.append(RetrievedChunk(
            chunk_id=original.chunk_id,
            document_id=original.document_id,
            chunk_text=original.chunk_text,
            score=result.relevance_score,
            chunk_index=original.chunk_index,
            section_heading=original.section_heading,
            section_path=original.section_path,
            parent_chunk_text=original.parent_chunk_text,
            source_filename=original.source_filename,
            retrieval_method=original.retrieval_method,
            entity_type=original.entity_type,
            entity_id=original.entity_id,
            env_id=original.env_id,
        ))
    return reranked


async def _llm_rerank(
    query: str,
    chunks: list[RetrievedChunk],
    top_k: int,
) -> list[RetrievedChunk]:
    """Re-rank using gpt-4o-mini structured scoring as fallback."""
    import openai

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

    # Build document list for scoring
    docs = []
    for i, chunk in enumerate(chunks):
        docs.append({"id": i, "text": chunk.chunk_text[:500]})

    prompt = f"""Score the relevance of each passage to the query on a scale of 0 to 10.
Query: "{query}"

Passages:
{json.dumps(docs, indent=2)}

Return ONLY a JSON array of objects with "id" (int) and "score" (float 0-10), sorted by score descending. No other text."""

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=512,
    )

    content = response.choices[0].message.content or "[]"
    # Parse JSON from response (handle markdown code blocks)
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    scored: list[dict[str, Any]] = json.loads(content)
    scored.sort(key=lambda x: -x.get("score", 0))

    reranked: list[RetrievedChunk] = []
    for entry in scored[:top_k]:
        idx = entry["id"]
        if 0 <= idx < len(chunks):
            original = chunks[idx]
            reranked.append(RetrievedChunk(
                chunk_id=original.chunk_id,
                document_id=original.document_id,
                chunk_text=original.chunk_text,
                score=entry["score"] / 10.0,  # Normalize to 0-1
                chunk_index=original.chunk_index,
                section_heading=original.section_heading,
                section_path=original.section_path,
                parent_chunk_text=original.parent_chunk_text,
                source_filename=original.source_filename,
                retrieval_method=original.retrieval_method,
                entity_type=original.entity_type,
                entity_id=original.entity_id,
                env_id=original.env_id,
            ))
    return reranked
