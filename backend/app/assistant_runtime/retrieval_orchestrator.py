from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.assistant_runtime.turn_receipts import RetrievalReceipt, RetrievalStatus, RetrievalPolicy
from app.config import RAG_MIN_SCORE, RAG_OVERFETCH, RAG_TOP_K
from app.services.rag_indexer import RetrievedChunk, semantic_search
from app.services.rag_reranker import rerank_chunks
from app.services.request_router import RouteDecision


@dataclass(frozen=True)
class RetrievalExecution:
    chunks: list[RetrievedChunk]
    context_text: str
    receipt: RetrievalReceipt


def _build_rag_context(chunks: list[RetrievedChunk], *, char_limit: int) -> str:
    if not chunks:
        return ""
    parts = ["RELEVANT DOCUMENT CONTEXT:"]
    for idx, chunk in enumerate(chunks, start=1):
        heading = f" | section={chunk.section_heading}" if chunk.section_heading else ""
        parts.append(
            f"[Doc {idx} | score={chunk.score:.3f}{heading}]\n{chunk.chunk_text[:char_limit]}"
        )
    return "\n\n".join(parts)


async def execute_retrieval(
    *,
    route: RouteDecision,
    retrieval_policy: RetrievalPolicy,
    message: str,
    business_id: str | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> RetrievalExecution:
    if route.skip_rag or retrieval_policy == RetrievalPolicy.NONE or not business_id:
        return RetrievalExecution(
            chunks=[],
            context_text="",
            receipt=RetrievalReceipt(used=False, result_count=0, status=RetrievalStatus.OK),
        )

    top_k = route.rag_top_k if route.rag_top_k > 0 else RAG_TOP_K
    raw_chunks = semantic_search(
        query=message,
        business_id=uuid.UUID(str(business_id)),
        env_id=uuid.UUID(str(env_id)) if env_id else None,
        entity_type=entity_type,
        entity_id=uuid.UUID(str(entity_id)) if entity_id else None,
        top_k=top_k,
        use_hybrid=route.use_hybrid,
        overfetch=RAG_OVERFETCH if route.use_rerank else None,
        return_all=route.use_rerank,
    )
    if route.use_rerank and len(raw_chunks) > 1:
        chunks = await rerank_chunks(query=message, chunks=raw_chunks, top_k=top_k)
    else:
        chunks = list(raw_chunks)
    min_score = getattr(route, "rag_min_score", RAG_MIN_SCORE)
    chunks = [chunk for chunk in chunks if chunk.score >= min_score]
    if not chunks:
        return RetrievalExecution(
            chunks=[],
            context_text="",
            receipt=RetrievalReceipt(used=True, result_count=0, status=RetrievalStatus.EMPTY),
        )

    char_limit = 500 if retrieval_policy == RetrievalPolicy.LIGHT else 1100
    return RetrievalExecution(
        chunks=chunks,
        context_text=_build_rag_context(chunks, char_limit=char_limit),
        receipt=RetrievalReceipt(used=True, result_count=len(chunks), status=RetrievalStatus.OK),
    )

