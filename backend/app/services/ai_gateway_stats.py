"""Latency statistics for the AI gateway — aggregated by lane.

Queries ``ai_gateway_logs`` to produce p50/p95 timing breakdowns,
token usage, cache hit rates, and retrieval quality metrics.
"""
from __future__ import annotations

import logging
from typing import Any

from app.db import get_cursor

logger = logging.getLogger(__name__)


def get_latency_stats(
    *,
    business_id: str | None = None,
    hours: int = 24,
    lane: str | None = None,
) -> list[dict[str, Any]]:
    """Return per-lane latency statistics over the given time window.

    Each row includes:
    - request_count, p50/p95 total_ms, p50/p95 ttft_ms
    - avg prompt/completion tokens, avg chunks retrieved/injected
    - avg model_ms, avg tool_execution_ms
    - cache hit rates (rag, embedding)
    - avg rag_search_ms, avg rerank_ms
    """
    conditions = ["created_at > NOW() - INTERVAL '%s hours'"]
    params: list[Any] = [hours]

    if business_id:
        conditions.append("business_id = %s")
        params.append(business_id)
    if lane:
        conditions.append("route_lane = %s")
        params.append(lane)

    where = " AND ".join(conditions)

    sql = f"""
    SELECT
        route_lane,
        COUNT(*)::int                                                    AS request_count,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY elapsed_ms)        AS p50_total_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY elapsed_ms)        AS p95_total_ms,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY COALESCE(ttft_ms, 0))  AS p50_ttft_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY COALESCE(ttft_ms, 0))  AS p95_ttft_ms,
        ROUND(AVG(prompt_tokens))::int                                   AS avg_prompt_tokens,
        ROUND(AVG(completion_tokens))::int                               AS avg_completion_tokens,
        ROUND(AVG(rag_chunks_raw))::int                                  AS avg_chunks_retrieved,
        ROUND(AVG(rag_chunks_used))::int                                 AS avg_chunks_injected,
        ROUND(AVG(COALESCE(model_ms, 0)))::int                          AS avg_model_ms,
        ROUND(AVG(COALESCE((timings_json->>'tool_execution_ms')::int, 0)))::int
                                                                         AS avg_tool_ms,
        ROUND(AVG(COALESCE((timings_json->>'rag_search_ms')::int, 0)))::int
                                                                         AS avg_rag_search_ms,
        ROUND(AVG(COALESCE((timings_json->>'rerank_ms')::int, 0)))::int  AS avg_rerank_ms,
        ROUND(AVG(COALESCE((timings_json->>'embedding_ms')::int, 0)))::int
                                                                         AS avg_embedding_ms,
        ROUND(AVG(COALESCE((timings_json->>'vector_search_ms')::int, 0)))::int
                                                                         AS avg_vector_search_ms,
        ROUND(AVG(COALESCE((timings_json->>'prompt_assembly_ms')::int, 0)))::int
                                                                         AS avg_prompt_assembly_ms,
        ROUND(AVG(CASE WHEN rag_cache_hit THEN 1.0 ELSE 0.0 END) * 100, 1)
                                                                         AS rag_cache_hit_pct,
        ROUND(AVG(CASE WHEN embedding_cache_hit THEN 1.0 ELSE 0.0 END) * 100, 1)
                                                                         AS embedding_cache_hit_pct,
        ROUND(AVG(cost_total)::numeric, 6)                               AS avg_cost
    FROM ai_gateway_logs
    WHERE {where}
    GROUP BY route_lane
    ORDER BY route_lane
    """
    try:
        with get_cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            return [dict(row) for row in rows]
    except Exception:
        logger.exception("Failed to query latency stats")
        return []
