"""Query rewriting — generate search variants for multi-query RAG retrieval."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL_FAST
from app.services.model_registry import sanitize_params

logger = logging.getLogger(__name__)

_EXPAND_PROMPT = """Generate {n} alternative phrasings of this search query for a real estate investment platform.
Each variant should capture the same intent but use different terminology or structure.
Return ONLY a JSON array of strings. No other text.

Original query: "{query}"
"""


async def expand_query(
    query: str,
    *,
    num_variants: int = 3,
    trace: Any = None,
) -> list[str]:
    """Generate query variants for multi-query retrieval.

    Returns [original_query, variant_1, variant_2, ...].
    Falls back to [query] on any error.
    """
    if not OPENAI_API_KEY:
        return [query]

    try:
        import openai

        client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
        _create_kwargs = sanitize_params(
            OPENAI_CHAT_MODEL_FAST,
            messages=[{"role": "user", "content": _EXPAND_PROMPT.format(n=num_variants, query=query)}],
            max_tokens=256,
            temperature=0.7,
        )
        response = await asyncio.wait_for(
            client.chat.completions.create(**_create_kwargs),
            timeout=1.5,
        )

        content = (response.choices[0].message.content or "[]").strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        variants = json.loads(content)
        if not isinstance(variants, list):
            return [query]

        result = [query] + [v for v in variants if isinstance(v, str) and v.strip()]
        logger.debug("Query expansion: %d variants for '%s'", len(result) - 1, query[:80])

        if trace is not None:
            try:
                trace.generation(
                    name="query_expansion",
                    model=OPENAI_CHAT_MODEL_FAST,
                    input=query,
                    output=result,
                ).end()
            except Exception:
                pass

        return result

    except asyncio.TimeoutError:
        logger.warning("Query expansion timeout (1.5s) — using original query")
        return [query]
    except Exception:
        logger.exception("Query expansion failed — using original query")
        return [query]
