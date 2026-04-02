-- 1003: Extend ai_gateway_logs with granular timing data, cache hit flags,
-- prompt audit, and routing pattern for the latency audit system.

ALTER TABLE ai_gateway_logs ADD COLUMN IF NOT EXISTS timings_json jsonb;
ALTER TABLE ai_gateway_logs ADD COLUMN IF NOT EXISTS rag_cache_hit boolean DEFAULT false;
ALTER TABLE ai_gateway_logs ADD COLUMN IF NOT EXISTS embedding_cache_hit boolean DEFAULT false;
ALTER TABLE ai_gateway_logs ADD COLUMN IF NOT EXISTS prompt_audit_json jsonb;
ALTER TABLE ai_gateway_logs ADD COLUMN IF NOT EXISTS matched_pattern text;

COMMENT ON COLUMN ai_gateway_logs.timings_json IS 'Granular per-stage timing breakdown: embedding_ms, vector_search_ms, fts_search_ms, rerank_ms, prompt_assembly_ms, tool_filter_ms, model_ms, ttft_ms, total_ms, etc.';
COMMENT ON COLUMN ai_gateway_logs.rag_cache_hit IS 'Whether the RAG result cache was hit for this request';
COMMENT ON COLUMN ai_gateway_logs.embedding_cache_hit IS 'Whether the embedding LRU cache was hit for this request';
COMMENT ON COLUMN ai_gateway_logs.prompt_audit_json IS 'Token breakdown by prompt section: system, context, rag, history, user, domain_blocks';
COMMENT ON COLUMN ai_gateway_logs.matched_pattern IS 'Which routing regex pattern matched this request (for routing audit)';

-- Index for latency analysis queries grouped by lane
CREATE INDEX IF NOT EXISTS ai_gateway_logs_lane_created_idx
ON ai_gateway_logs (route_lane, created_at DESC);
