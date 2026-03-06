"""Cost estimation for AI gateway requests."""
from __future__ import annotations

# Pricing per 1M tokens (USD) — update as models change
_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "o1-mini": {"input": 3.00, "output": 12.00},
    "o1": {"input": 15.00, "output": 60.00},
    "o3-mini": {"input": 1.10, "output": 4.40},
}

# Embedding pricing per 1M tokens
_EMBEDDING_PRICING: dict[str, float] = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
}

# Rerank pricing per search
_RERANK_PRICING: dict[str, float] = {
    "cohere": 0.002,
    "llm": 0.001,  # approximate for gpt-4o-mini rerank call
}


def estimate_cost(
    *,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    embedding_model: str | None = None,
    embedding_tokens: int = 0,
    rerank_method: str | None = None,
) -> dict[str, float]:
    """Estimate total request cost in USD.

    Returns a dict with individual cost components and total.
    """
    pricing = _PRICING.get(model, _PRICING.get("gpt-4o-mini", {"input": 0.15, "output": 0.60}))
    model_cost = (prompt_tokens * pricing["input"] + completion_tokens * pricing["output"]) / 1_000_000

    embedding_cost = 0.0
    if embedding_model and embedding_tokens > 0:
        rate = _EMBEDDING_PRICING.get(embedding_model, 0.02)
        embedding_cost = embedding_tokens * rate / 1_000_000

    rerank_cost = 0.0
    if rerank_method and rerank_method != "none":
        rerank_cost = _RERANK_PRICING.get(rerank_method, 0.0)

    total = model_cost + embedding_cost + rerank_cost

    return {
        "model_cost": round(model_cost, 6),
        "embedding_cost": round(embedding_cost, 6),
        "rerank_cost": round(rerank_cost, 6),
        "total_cost": round(total, 6),
    }
