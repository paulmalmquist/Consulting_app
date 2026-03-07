# Winston — Re-Ranking, Model Dispatch & Latency Architecture

> **Scope:** This prompt covers three interconnected improvements: (1) a multi-stage RAG re-ranking pipeline, (2) per-lane model dispatch so complex queries use a stronger model and simple queries stay fast, and (3) latency controls — caching, token budgets, and pipeline optimizations — that keep the system snappy as we add re-ranking overhead. These changes are additive. Nothing in the existing gateway loop breaks.
>
> Every file reference is real. No code in this document.

---

## Current State — What Works and What's Missing

### What works

| Capability | Where |
|-----------|-------|
| 4-lane request routing (A/B/C/D) | `request_router.py` — `classify_request()` |
| Conditional RAG (skip for Lane A/B) | `ai_gateway.py` — `route.skip_rag` flag |
| Parent-child chunking (400/800 tokens) | `rag_indexer.py` — `_create_chunks()` |
| pgvector HNSW cosine search | `rag_indexer.py` — `semantic_search()` |
| Full-text search fallback (tsvector) | `rag_indexer.py` — FTS path when pgvector unavailable |
| Multi-tenant scoping (business/env/entity) | `rag_indexer.py` — WHERE clause filters |
| Per-step timings (context, RAG, prompt, TTFT, model) | `ai_gateway.py` — `timings` dict |
| SSE streaming with immediate token emission | `ai_gateway.py` — `yield _sse("token", ...)` |
| Tool schema caching | `ai_gateway.py` — `_cached_tools` singleton |
| Environment metadata cache (5-min TTL) | `assistant_scope.py` — `_cached_resolve_env()` |

### What's missing

| Gap | Impact |
|-----|--------|
| **Single model for all lanes** — always `gpt-4o-mini` | Lane D (deep reasoning) gets the same model as Lane A (identity queries). Complex analytical questions underperform. Simple questions pay no latency dividend for being simple. |
| **No re-ranking** — top-5 cosine results used directly | Noisy chunks dilute context. Semantically similar but factually irrelevant chunks are injected. No quality filter between retrieval and prompt. |
| **No score threshold** — all top-K chunks injected regardless of score | A chunk scoring 0.18 (noise) is injected alongside a 0.82 (strong match). The model wastes tokens processing irrelevant context. |
| **No hybrid retrieval** — cosine OR FTS, never both | Keyword matches (fund names, acronyms) missed by embeddings. Semantic matches missed by FTS. The best of both is never combined. |
| **No metadata boosting** — entity scope not used for soft ranking | A chunk about Fund III scores the same whether the user is viewing Fund III or Fund VII. The existing scope resolution is wasted on retrieval. |
| **No embedding cache** — same query re-embedded every time | Repeat queries (common in conversational follow-ups) re-call the embedding API. |
| **No RAG result cache** — same scope/query re-searched every time | Follow-up questions in the same conversation re-hit pgvector for identical context. |
| **No prompt token budget** — RAG context can inflate unchecked | Five 800-token parent chunks = 4,000 tokens of context, even when 2 chunks would suffice. |

---

## Part 1 — Model Dispatch

### The Problem

`OPENAI_CHAT_MODEL` is a global env var (`gpt-4o-mini`). The `RouteDecision` controls `max_tokens`, `temperature`, and `max_tool_rounds` per lane — but the model is hardcoded in `stream_kwargs["model"]` at line 440 of `ai_gateway.py`.

This means:
- Lane A questions ("what environment am I in") use the same model as Lane D questions ("compare IRR sensitivity across all funds under three macro scenarios")
- There is no quality upgrade for complex tasks and no speed/cost downgrade for trivial ones
- You cannot experiment with reasoning models (o1-mini, o3-mini) for Lane D without affecting all lanes

### The Fix

**Add `model: str` to `RouteDecision`.**

This is a one-field addition to the dataclass in `request_router.py`. The `classify_request()` function sets it per lane. The gateway reads it from `route.model` instead of `OPENAI_CHAT_MODEL`.

### Recommended Model Mapping

| Lane | Model | Rationale |
|------|-------|-----------|
| **A** | `gpt-4o-mini` | Fastest, cheapest. These are formatting passes over UI-visible data. Sub-second target. |
| **B** | `gpt-4o-mini` | Quick tool lookups. Model quality doesn't matter much — the answer comes from the tool, not the model's reasoning. |
| **C** | `gpt-4o` | Analytical queries need better reasoning for metric extraction, comparison tables, and multi-source synthesis. The latency budget (4–8s) allows a larger model. |
| **D** | `gpt-4o` | Deep reasoning. Dashboard composition, multi-step synthesis, root cause analysis. Could also use `o3-mini` for chain-of-thought tasks if you want to experiment. |
| **C (write)** | `gpt-4o-mini` | Write/mutation requests (Lane C, `is_write=True`) are parameter extraction, not reasoning. The confirmation flow means the model just needs to map fields accurately — mini is sufficient and faster. |

### Configuration

**Add to `config.py`:**

```
OPENAI_CHAT_MODEL_FAST  = os.getenv("OPENAI_CHAT_MODEL_FAST",  "gpt-4o-mini")
OPENAI_CHAT_MODEL_HEAVY = os.getenv("OPENAI_CHAT_MODEL_HEAVY", "gpt-4o")
```

The router uses these constants rather than hardcoding model names. This keeps model selection configurable via environment without code changes.

### Changes Required

| File | Change |
|------|--------|
| `backend/app/config.py` | Add `OPENAI_CHAT_MODEL_FAST`, `OPENAI_CHAT_MODEL_HEAVY` |
| `backend/app/services/request_router.py` | Add `model: str` field to `RouteDecision`; set per lane in `classify_request()` |
| `backend/app/services/ai_gateway.py` | Replace `"model": OPENAI_CHAT_MODEL` with `"model": route.model` in `stream_kwargs` (line 440). Also include `route.model` in the trace so the debug panel shows which model was used. |
| `repo-b/src/components/commandbar/AdvancedDrawer.tsx` | Display `winstonTrace.model` in the Overview tab (it's already in the trace — just surface it) |

### Latency Impact

- Lane A/B: no change (stays on mini)
- Lane C: +200–500ms for the model call, but the context is richer and the answer is better. Within the 4–8s budget.
- Lane D: +500–1000ms, but these are already 8–20s requests. The quality improvement is worth it.
- Write requests: no change (stays on mini)

---

## Part 2 — Re-Ranking Pipeline

### Architecture Overview

Insert a re-ranking stage between retrieval and prompt injection. The existing `semantic_search()` function continues to do the initial candidate retrieval, but it over-fetches. A new `rag_reranker.py` module then filters, re-scores, and selects the final chunks.

```
Current:
  semantic_search(top_k=5) → inject all 5 → model

Proposed:
  semantic_search(top_k=20)
    → hybrid_merge(cosine_results, fts_results)     [optional, Lane C/D only]
    → metadata_boost(candidates, resolved_scope)
    → score_threshold_filter(candidates, min_score)
    → cross_encoder_rerank(query, candidates)        [optional, Lane C/D only]
    → diversity_dedup(candidates)
    → take top-N per lane budget
    → inject → model
```

### Stage 1 — Score Threshold Gate

**What it does:** Drop chunks below a configurable minimum similarity score before they reach the prompt.

**Config:** `RAG_MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.30"))`

**Where it runs:** In `ai_gateway.py`, immediately after `semantic_search()` returns, before formatting the RAG context block. Filter: `rag_chunks = [c for c in rag_chunks if c.score >= RAG_MIN_SCORE]`

**When no chunks pass:** The RAG context block says:
```
RELEVANT DOCUMENT CONTEXT:
No documents found with sufficient relevance to this query.
```

This prevents the model from fabricating citations. Currently, even a 0.12-scoring chunk gets injected and the model sometimes cites it.

**Latency impact:** Negative (saves tokens by injecting fewer chunks). Net positive.

---

### Stage 2 — Hybrid Retrieval with Reciprocal Rank Fusion

**What it does:** Run cosine similarity search AND full-text search in parallel, then merge results using reciprocal rank fusion (RRF).

**Why it matters:** Embedding search misses exact keyword matches. When a user asks "what's the DSCR for Ashford Commons," the embedding model might not strongly match a chunk containing "Debt Service Coverage Ratio: 1.42x" because the acronym "DSCR" and the spelled-out form have different embeddings. FTS catches this because it matches the literal string.

**Implementation approach:**

Modify `semantic_search()` in `rag_indexer.py` to accept a `hybrid: bool = False` parameter. When `hybrid=True`:

1. Run the existing cosine search with `top_k * 3` (over-fetch)
2. Run the existing FTS fallback path concurrently (it's already implemented — just not used when pgvector is available)
3. Merge using RRF: for each unique `chunk_id` across both lists, compute `rrf_score = Σ(1 / (k + rank_i))` with `k=60`
4. Sort by `rrf_score` descending, return top `top_k * 3` candidates to the re-ranker

**When to use:** Only for Lane C and D. Lane B doesn't use RAG. Lane A skips everything.

**Latency impact:** The FTS query runs in parallel with the cosine query (both are DB queries on the same table, different indexes). Net latency increase is near zero for the retrieval stage; the merge is in-memory and instant.

**Changes:**
| File | Change |
|------|--------|
| `rag_indexer.py` | Add `hybrid` param to `semantic_search()`; run cosine + FTS concurrently via two cursor calls; merge with RRF |
| `ai_gateway.py` | Pass `hybrid=True` when `route.lane in ("C", "D")` |
| `config.py` | Add `RAG_RRF_K = 60` (RRF constant, tunable) |

---

### Stage 3 — Metadata Boosting

**What it does:** Boost scores for chunks that match the current entity scope or content type.

**Why it matters:** When the user is viewing Fund III and asks about cap rates, a chunk from a Fund III IC memo should outrank a chunk from a Fund VII quarterly report — even if the cosine scores are similar.

**Boost rules:**

| Condition | Boost |
|-----------|-------|
| Chunk `entity_id` matches `resolved_scope.entity_id` | +0.12 |
| Chunk `entity_type` matches `resolved_scope.entity_type` | +0.05 |
| Chunk `env_id` matches current `env_id` | +0.03 |
| Chunk `content_type_hint` matches query type (financial question → `uw_model`; legal question → `operating_agreement`) | +0.08 |

The boosts are additive and applied to the raw cosine score before the threshold filter and re-ranker. This means a chunk scoring 0.28 from the exact entity in scope gets boosted to 0.40+ and passes the threshold, while a 0.28 chunk from a different entity stays below.

**Query type → content type mapping:** Use the router's existing classification:
- Lane C (analytical) + financial keywords (IRR, NOI, cap rate, DSCR) → boost `uw_model`, `quarterly_report`
- RAG-hint queries (memo, document, agreement) → boost matching `content_type_hint`
- Write queries → no RAG, so boosting is irrelevant

**Where it runs:** In the new `rag_reranker.py`, after retrieval, before cross-encoder re-ranking. It adjusts the `score` field on each `RetrievedChunk`.

**Changes:**
| File | Change |
|------|--------|
| `rag_reranker.py` (new) | `apply_metadata_boost(chunks, resolved_scope, route)` |
| `ai_gateway.py` | Pass `resolved_scope` and `route` to the reranker |

---

### Stage 4 — Cross-Encoder Re-Ranking

**What it does:** Re-score the top candidates using a model that sees the full query + chunk text pair, producing much higher quality relevance judgments than embedding distance alone.

**Options (in order of recommendation):**

| Option | Latency | Cost | Quality | Integration |
|--------|---------|------|---------|-------------|
| **Cohere Rerank v3** | ~200ms for 20 docs | $0.002/search | Excellent | Single API call, returns scores |
| **Jina Reranker v2** | ~150ms | $0.002/search | Very good | REST API, drop-in |
| **LLM-based (gpt-4o-mini)** | ~800ms | ~$0.001 | Good | Already have the key, no new dependency |
| **Local model (bge-reranker)** | ~100ms | Free | Good | Needs a model runtime (ONNX or sentence-transformers) |

**Recommended: Cohere Rerank v3** — best quality-to-latency ratio, simple integration, no infrastructure. Single API call: send query + 20 candidate texts, receive re-scored and re-ordered results.

**LLM-based fallback:** If you don't want a new API dependency, use `gpt-4o-mini` with a structured prompt:

```
Score the relevance of each passage to the query on a scale of 0-10.
Query: "{query}"
Passages: [list of chunk texts]
Return JSON: [{"chunk_id": "...", "score": N}, ...]
```

This is slower (~800ms) but uses your existing API key and adds no new vendor.

**When to use:** Lane C and D only. Lane B queries are simple tool lookups — re-ranking adds latency without value.

**Where it runs:** In `rag_reranker.py`, after metadata boosting, before diversity dedup.

**Changes:**
| File | Change |
|------|--------|
| `rag_reranker.py` (new) | `cross_encoder_rerank(query, chunks, method="cohere"|"llm")` |
| `config.py` | Add `RAG_RERANK_ENABLED`, `RAG_RERANK_METHOD`, `COHERE_API_KEY` (optional) |

---

### Stage 5 — Diversity Deduplication

**What it does:** If multiple chunks from the same document section score similarly after re-ranking, keep only the highest-scoring one and backfill with the next-best chunk from a different section/document.

**Why it matters:** Parent-child chunking can produce three consecutive children from the same parent that all match a query. After parent expansion, you get the same 800-token parent block injected three times — pure waste.

**Algorithm (Maximal Marginal Relevance, simplified):**
1. Sort candidates by re-ranked score descending
2. For each candidate, check if a chunk from the same `(document_id, section_path)` is already selected
3. If yes, skip it and take the next candidate from a different section
4. Continue until you have `final_top_k` chunks

**Where it runs:** In `rag_reranker.py`, as the final stage before returning to `ai_gateway.py`.

---

### Stage 6 — Lane-Adaptive Retrieval Budget

**What it does:** Adjust how many chunks are retrieved, re-ranked, and injected based on the lane.

| Lane | Over-Fetch | Re-Rank | Hybrid | Final top-K | Max RAG tokens |
|------|-----------|---------|--------|-------------|----------------|
| A | — | — | — | 0 | 0 |
| B | 5 | No | No | 2 | 800 |
| C | 20 | Yes | Yes | 5 | 2,400 |
| D | 20 | Yes | Yes | 7 | 3,600 |

**Max RAG tokens** is a new budget cap. After selecting the final chunks, truncate the combined RAG context to this limit. This prevents a single dense document from consuming the entire context window.

**Changes:**
| File | Change |
|------|--------|
| `request_router.py` | Add `rag_top_k: int`, `rag_rerank: bool`, `rag_hybrid: bool`, `rag_max_tokens: int` to `RouteDecision` |
| `ai_gateway.py` | Use `route.rag_top_k` instead of global `RAG_TOP_K`; pass `route.rag_rerank` and `route.rag_hybrid` to the reranker; enforce `route.rag_max_tokens` when building the context block |

---

### New File: `backend/app/services/rag_reranker.py`

**Public API:**

```
rerank_chunks(
    query: str,
    candidates: list[RetrievedChunk],
    resolved_scope: ResolvedScope,
    route: RouteDecision,
) -> list[RetrievedChunk]
```

**Internal pipeline (called in order):**
1. `apply_metadata_boost(candidates, resolved_scope, route)` — adjust scores
2. `filter_by_threshold(candidates, min_score)` — drop noise
3. `cross_encoder_rerank(query, candidates, method)` — re-score (if `route.rag_rerank`)
4. `diversity_dedup(candidates)` — remove redundancy
5. Return `candidates[:route.rag_top_k]`

---

## Part 3 — Latency Controls

### 3a. Embedding Cache

**Problem:** Follow-up questions in a conversation often repeat or closely resemble the initial query. Each one re-calls the OpenAI embedding API (~100ms).

**Fix:** In-memory LRU cache for embeddings, keyed by `(query_text, model_name)`. Use `functools.lru_cache` with `maxsize=256` on the `_embed()` function inside `rag_indexer.py`. Since embeddings are deterministic for the same input, this is safe.

**Scope:** Process-level cache (lives as long as the FastAPI worker). No shared state needed.

**Latency saving:** ~100ms per cache hit (the embedding API round-trip).

**Changes:**
| File | Change |
|------|--------|
| `rag_indexer.py` | Wrap `_embed()` (the single-text embedding helper) with `@lru_cache(maxsize=256)` |
| `config.py` | Add `RAG_EMBEDDING_CACHE_SIZE = 256` |

---

### 3b. RAG Result Cache (Short TTL)

**Problem:** In a multi-turn conversation about the same entity, each turn re-runs the full pgvector search + re-ranking pipeline for similar queries.

**Fix:** Cache the final re-ranked chunk list, keyed by `(query_hash, business_id, env_id, entity_id)`, with a 60-second TTL. If the same query hits within 60 seconds for the same scope, return cached results.

**Why 60 seconds:** Long enough for conversational follow-ups ("tell me more about that" → same context needed), short enough that new documents indexed mid-session are picked up quickly.

**Where:** In `ai_gateway.py`, wrap the `semantic_search() → rerank_chunks()` pipeline with a TTL cache check.

**Latency saving:** Eliminates embedding + pgvector + re-ranking for cache hits (~300–600ms total).

**Changes:**
| File | Change |
|------|--------|
| `ai_gateway.py` | Add `_rag_cache: dict` with TTL eviction; check before search; populate after rerank |
| `config.py` | Add `RAG_CACHE_TTL_SECONDS = 60` |

---

### 3c. Prompt Token Budget Management

**Problem:** RAG context is injected without a budget. Five parent chunks at 800 tokens = 4,000 tokens of RAG context. Combined with the system prompt (~600 tokens), context block (~400 tokens), and conversation history (variable), the prompt can balloon to 8,000+ tokens — increasing model latency and cost.

**Fix:** Enforce a per-lane RAG token budget (see lane-adaptive table in Part 2). After selecting the final chunks, count their combined tokens. If over budget, drop the lowest-scoring chunk. Repeat until under budget.

**Additional optimization:** For Lane B (quick lookups), truncate each chunk to 400 tokens (child size, not parent) since the full parent expansion is unnecessary for simple answers.

**Where:** In `ai_gateway.py`, after the reranker returns and before the RAG context string is built.

---

### 3d. Conversation History Budget

**Current state:** History is limited to the last 10 messages for Lane C/D, 6 for Lane A/B. But there's no token-level budget — 6 long messages can still be thousands of tokens.

**Fix:** Add a `max_history_tokens` parameter to the history loading. Count tokens as messages are appended (use tiktoken or a simple `len(text) // 4` approximation). Stop appending when the budget is exhausted. Most recent messages have priority (they're appended last, so older ones get dropped first).

| Lane | Max history messages | Max history tokens |
|------|---------------------|--------------------|
| A | 4 | 1,000 |
| B | 6 | 2,000 |
| C | 10 | 4,000 |
| D | 10 | 6,000 |

---

### 3e. Parallel RAG + Context Resolution

**Current state:** Context resolution completes before RAG search starts. They are sequential.

**Fix:** Run them concurrently with `asyncio.gather()`:

```
[resolve_assistant_scope()]  }
[resolve_visible_context_policy()]  } concurrent
[semantic_search() → rerank()]  }
```

RAG search needs `business_id` and `env_id` from context resolution. But these come from the context envelope (frontend-provided), not from the scope resolver. The scope resolver enriches with entity-level detail, which RAG doesn't strictly need for the initial search. So RAG can start with the envelope-provided `business_id`/`env_id` immediately, and the full resolved scope is used later for metadata boosting in the reranker.

**Latency saving:** RAG search (~200ms) overlaps with context resolution (~50ms). Net saving is the smaller of the two — but it compounds with other savings.

---

### 3f. Re-Ranker Latency Budget

Re-ranking adds latency. Control it explicitly.

| Re-rank method | Expected latency | Budget |
|---------------|-----------------|--------|
| Metadata boost only (no cross-encoder) | ~5ms | Always allowed |
| Cohere Rerank | ~200ms | Lane C/D only |
| LLM-based rerank | ~800ms | Lane D only |
| No re-ranking | 0ms | Lane A/B |

**Timeout:** If the cross-encoder API call exceeds 500ms, fall back to metadata-boosted cosine scores. The re-ranker should never block the pipeline beyond its budget.

**Where:** `rag_reranker.py` wraps the cross-encoder call in `asyncio.wait_for(timeout=0.5)`.

---

## Part 4 — Additional Improvements

### 4a. Citation Quality from Re-Ranking

Currently, citations are emitted for all RAG chunks with their raw cosine scores. After re-ranking, the citation scores should reflect the re-ranked scores, not the raw cosine scores. This gives the frontend accurate relevance indicators.

**Change:** Emit `citation` SSE events after re-ranking, using the re-ranked score.

### 4b. RAG Context Format Improvement

Currently, RAG chunks are injected as:
```
[Doc 1, chunk_id=abc, score=0.823]
{raw parent text}
```

After re-ranking, improve the format to include provenance:
```
[Doc 1 | score=0.823 | source=IC Memo — Ashford Commons | section=Financial Summary]
{parent text, trimmed to token budget}
```

This helps the model attribute information correctly and produce better citations in its response.

### 4c. Trace Enrichment

Add re-ranking metadata to the `WinstonTrace` in the `done` SSE event:

```
"rag": {
  "candidates_retrieved": 20,
  "candidates_after_threshold": 14,
  "candidates_after_rerank": 5,
  "rerank_method": "cohere",
  "rerank_ms": 185,
  "hybrid_search": true,
  "scores": [0.823, 0.791, 0.756, 0.712, 0.688]
}
```

This surfaces re-ranking quality in the AdvancedDrawer and enables future tuning.

### 4d. Query Expansion (Phase 2)

For Lane D queries, consider expanding the user's query before embedding. A short LLM call can rephrase "how are we doing" into "fund performance metrics IRR TVPI DPI for the current environment." The expanded query produces better embeddings and retrieves more relevant chunks.

This is a Phase 2 optimization — adds latency (~300ms for the expansion call) but can dramatically improve retrieval quality for vague queries.

---

## Implementation Sequence

These phases can overlap. Phase 1 is independent. Phase 2 and 3 can be built in parallel.

### Phase 1 — Score Threshold + Model Dispatch (immediate, no new dependencies)
1. Add `RAG_MIN_SCORE` to config; filter in `ai_gateway.py` after `semantic_search()`
2. Add `model` field to `RouteDecision`; add `OPENAI_CHAT_MODEL_FAST` / `OPENAI_CHAT_MODEL_HEAVY` to config
3. Use `route.model` in `stream_kwargs` instead of `OPENAI_CHAT_MODEL`
4. Test: Lane A/B → `gpt-4o-mini`; Lane C/D → `gpt-4o`; verify in trace

### Phase 2 — Re-Ranking Pipeline (new file, moderate effort)
5. Create `rag_reranker.py` with `rerank_chunks()` public API
6. Implement metadata boosting (uses existing scope resolution — no new API calls)
7. Implement diversity dedup
8. Add lane-adaptive retrieval budgets to `RouteDecision`
9. Test: compare chunk quality before/after reranking on sample queries

### Phase 3 — Hybrid Retrieval + Cross-Encoder (adds API dependency)
10. Add `hybrid` parameter to `semantic_search()`; implement concurrent cosine + FTS
11. Implement RRF merge
12. Integrate Cohere Rerank (or LLM-based fallback)
13. Add reranker timeout/fallback
14. Test: verify hybrid catches keyword-only matches; verify reranker improves ordering

### Phase 4 — Caching + Latency Controls
15. Embedding cache (LRU on `_embed()`)
16. RAG result cache (60s TTL)
17. Prompt token budget enforcement per lane
18. Conversation history token budget
19. Parallel context resolution + RAG search
20. Test: measure latency before/after on repeated queries

---

## Files Changed Summary

| File | Change Type | What Changes |
|------|-------------|--------------|
| `backend/app/services/rag_reranker.py` | **New** | `rerank_chunks()`, metadata boost, threshold filter, cross-encoder, diversity dedup |
| `backend/app/config.py` | **Modified** | Add `OPENAI_CHAT_MODEL_FAST`, `OPENAI_CHAT_MODEL_HEAVY`, `RAG_MIN_SCORE`, `RAG_RRF_K`, `RAG_RERANK_ENABLED`, `RAG_RERANK_METHOD`, `COHERE_API_KEY`, `RAG_EMBEDDING_CACHE_SIZE`, `RAG_CACHE_TTL_SECONDS` |
| `backend/app/services/request_router.py` | **Modified** | Add `model`, `rag_top_k`, `rag_rerank`, `rag_hybrid`, `rag_max_tokens` fields to `RouteDecision`; set per lane in `classify_request()` |
| `backend/app/services/ai_gateway.py` | **Modified** | Use `route.model` for OpenAI call; call `rerank_chunks()` after `semantic_search()`; enforce RAG token budget; add embedding cache; add RAG result cache; parallel context + RAG |
| `backend/app/services/rag_indexer.py` | **Modified** | Add `hybrid` param to `semantic_search()`; implement concurrent cosine + FTS; add RRF merge; add embedding LRU cache |
| `backend/app/services/assistant_scope.py` | **Modified** | Expose `resolved_scope` fields needed for metadata boosting (entity_id, entity_type, env_id) |
| `repo-b/src/components/commandbar/AdvancedDrawer.tsx` | **Modified** | Show model name in Overview tab; show RAG re-ranking stats in Runtime tab |

---

## Latency Budget After All Changes

| Lane | Current Estimate | After Model Dispatch | After Re-Ranking + Caching | Target |
|------|-----------------|---------------------|---------------------------|--------|
| A | 1–2s | 0.5–1s (mini, no RAG) | 0.5–1s (unchanged) | < 1s |
| B | 3–5s | 2–3s (mini, 2 chunks) | 1.5–2.5s (cache hits) | 2–4s |
| C | 5–10s | 4–8s (gpt-4o, better context) | 4–7s (reranked, budgeted) | 4–8s |
| D | 10–20s | 8–15s (gpt-4o, richer context) | 8–14s (hybrid + reranked) | 8–20s |

Lane A and B get faster. Lane C stays within budget but with much better answer quality. Lane D gets better context and a stronger model within the existing budget.

---

## Key Principle: Re-Ranking Pays for Itself

Re-ranking adds ~200ms of compute (cross-encoder) but removes wasted tokens from the prompt. Fewer, more relevant chunks mean:
- Smaller prompt → faster model inference (model latency scales with input tokens)
- Better context → fewer hallucinations → fewer follow-up questions
- Token budget enforcement → predictable, bounded prompt sizes

The net latency impact of re-ranking is often negative (faster overall) because the token savings in the model call outweigh the re-ranking overhead.
