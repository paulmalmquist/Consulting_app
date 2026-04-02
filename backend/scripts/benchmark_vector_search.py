#!/usr/bin/env python3
"""Benchmark vector search latency to determine if pgvector is a real bottleneck.

Usage:
    python -m scripts.benchmark_vector_search --business-id <UUID> [--runs 10]

Runs sample queries through the retrieval pipeline and reports p50/p95/p99
for each stage: embedding, vector search, FTS, reranking, total retrieval.
Compare these against model latency (1-20s) to decide if vector tuning matters.
"""
from __future__ import annotations

import argparse
import statistics
import sys
import time
import uuid

# Ensure the backend app is importable
sys.path.insert(0, ".")

from app.config import OPENAI_API_KEY
from app.services.rag_indexer import semantic_search

# Sample queries across lane complexity levels
SAMPLE_QUERIES = [
    # Lane A-like (identity / context)
    "What environment am I in?",
    "Which page is this?",
    # Lane B-like (simple lookup)
    "Show me the fund overview",
    "List all assets in this portfolio",
    "What is the current NAV?",
    "How many investments are active?",
    "Get the deal snapshot",
    # Lane C-like (analytical / RAG)
    "What does the operating agreement say about distributions?",
    "Compare IRR across funds",
    "Analyze the cap rate sensitivity for this asset",
    "Search for the investment memo for Meridian Tower",
    "What are the covenant compliance terms?",
    "Find the lease agreement for the downtown property",
    "What is the LPA waterfall structure?",
    "Show me the quarterly report analysis",
    # Lane D-like (deep / synthesis)
    "Build me a monthly operating report dashboard",
    "Deep dive into the portfolio risk factors",
    "Generate a report on fund performance attribution",
    "Explain why NAV declined this quarter",
    "Monte Carlo simulation on exit scenarios",
    # Repeat queries (cache testing)
    "What does the operating agreement say about distributions?",
    "Show me the fund overview",
    # Entity-heavy queries (hybrid search benefit)
    "Meridian Tower West acquisition memo",
    "Branford Castle Partners fund III returns",
    "JLL property management agreement",
    "Goldman Sachs real estate fund comparison",
]


def percentile(data: list[float], p: float) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * p / 100
    f = int(k)
    c = f + 1
    if c >= len(sorted_data):
        return sorted_data[f]
    return sorted_data[f] + (k - f) * (sorted_data[c] - sorted_data[f])


def run_benchmark(business_id: str, runs: int = 10, use_hybrid: bool = False):
    if not OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY not configured. Cannot run embeddings.")
        sys.exit(1)

    bid = uuid.UUID(business_id)
    results: dict[str, list[float]] = {
        "embedding_ms": [],
        "vector_search_ms": [],
        "fts_search_ms": [],
        "total_retrieval_ms": [],
    }

    total_queries = len(SAMPLE_QUERIES) * runs
    completed = 0

    print(f"\nRunning {total_queries} queries ({len(SAMPLE_QUERIES)} samples x {runs} runs)")
    print(f"Business ID: {business_id}")
    print(f"Hybrid search: {use_hybrid}")
    print("-" * 60)

    for run in range(runs):
        for query in SAMPLE_QUERIES:
            timings: dict[str, int] = {}
            t0 = time.time()
            try:
                chunks = semantic_search(
                    query=query,
                    business_id=bid,
                    top_k=5,
                    use_hybrid=use_hybrid,
                    timings=timings,
                )
            except Exception as e:
                print(f"  ERROR on '{query[:40]}': {e}")
                continue

            total_ms = int((time.time() - t0) * 1000)
            results["embedding_ms"].append(timings.get("embedding_ms", 0))
            results["vector_search_ms"].append(timings.get("vector_search_ms", 0))
            results["fts_search_ms"].append(timings.get("fts_search_ms", 0))
            results["total_retrieval_ms"].append(total_ms)

            completed += 1
            if completed % 10 == 0:
                print(f"  Progress: {completed}/{total_queries} queries completed")

    print("\n" + "=" * 60)
    print("BENCHMARK RESULTS")
    print("=" * 60)

    for stage, data in results.items():
        if not data:
            continue
        p50 = percentile(data, 50)
        p95 = percentile(data, 95)
        p99 = percentile(data, 99)
        avg = statistics.mean(data)
        print(f"\n  {stage}:")
        print(f"    p50  = {p50:.0f}ms")
        print(f"    p95  = {p95:.0f}ms")
        print(f"    p99  = {p99:.0f}ms")
        print(f"    avg  = {avg:.0f}ms")
        print(f"    min  = {min(data):.0f}ms")
        print(f"    max  = {max(data):.0f}ms")
        print(f"    n    = {len(data)}")

    # Embedding cache analysis
    embed_data = results["embedding_ms"]
    if embed_data:
        cache_hits = sum(1 for t in embed_data if t < 5)  # <5ms likely means cache hit
        print(f"\n  Embedding cache hit estimate: {cache_hits}/{len(embed_data)} "
              f"({cache_hits/len(embed_data)*100:.0f}%)")

    # Bottleneck analysis
    total_avg = statistics.mean(results["total_retrieval_ms"]) if results["total_retrieval_ms"] else 0
    vector_avg = statistics.mean(results["vector_search_ms"]) if results["vector_search_ms"] else 0
    embed_avg = statistics.mean(results["embedding_ms"]) if results["embedding_ms"] else 0

    print(f"\n{'=' * 60}")
    print("BOTTLENECK ANALYSIS")
    print(f"{'=' * 60}")
    if total_avg > 0:
        print(f"  Embedding:     {embed_avg:.0f}ms ({embed_avg/total_avg*100:.0f}% of retrieval)")
        print(f"  Vector search: {vector_avg:.0f}ms ({vector_avg/total_avg*100:.0f}% of retrieval)")
        print(f"  Total retrieval: {total_avg:.0f}ms")
        print()
        if total_avg < 100:
            print("  VERDICT: Retrieval is fast (<100ms). NOT the bottleneck.")
            print("  Focus optimization on model latency, prompt size, or frontend instead.")
        elif total_avg < 300:
            print("  VERDICT: Retrieval is moderate (100-300ms). Minor optimization possible.")
            print("  Consider: ef_search tuning, metadata filter optimization.")
        else:
            print("  VERDICT: Retrieval is slow (>300ms). Worth investigating.")
            print("  Consider: HNSW reindex with ef_construction=128, query batching, caching.")
    else:
        print("  No data collected. Check OPENAI_API_KEY and business_id.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Benchmark pgvector search latency")
    parser.add_argument("--business-id", required=True, help="UUID of the business to query")
    parser.add_argument("--runs", type=int, default=10, help="Number of runs per query (default: 10)")
    parser.add_argument("--hybrid", action="store_true", help="Enable hybrid (vector + FTS) search")
    args = parser.parse_args()

    run_benchmark(args.business_id, runs=args.runs, use_hybrid=args.hybrid)
