"""RAG chunk selection policy.

Pure, deterministic functions applied to the raw ranked chunks returned by
retrieval_orchestrator BEFORE they enter the context compiler. Enforces
per-lane maximums, score thresholds, deduplication, and active-entity boost.

The goal is simple: never let RAG spray garbage across the prompt just because
the retrieval layer returned a lot of candidates. What enters the compiler is
already policy-checked.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

# Works with existing rag_indexer.RetrievedChunk (duck-typed, not imported to
# avoid a circular dependency through ai_gateway).
#
# Required attributes on each chunk: chunk_text, score, document_id,
# chunk_index, section_heading, entity_id, entity_type.


ENTITY_BOOST = 0.10


@dataclass
class RagPolicyResult:
    kept: list[Any]
    stats: dict[str, Any]


def _get(obj: Any, name: str, default: Any = None) -> Any:
    """Attribute-or-key access so tests can pass plain dicts."""
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _chunk_text(chunk: Any) -> str:
    # RetrievedChunk uses .chunk_text; tests may use .text or ["text"].
    return (
        _get(chunk, "chunk_text")
        or _get(chunk, "text")
        or ""
    )


def apply_rag_policy(
    chunks: Iterable[Any],
    *,
    max_chunks: int,
    min_score: float,
    active_entity_ids: list[str] | None = None,
) -> RagPolicyResult:
    """Filter, boost, dedupe, and cap a list of retrieved chunks.

    Returns a ``RagPolicyResult`` with the kept chunks (ordered by effective
    score, descending) and a stats dict suitable for receipt diagnostics.
    """
    chunks = list(chunks or [])
    stats: dict[str, Any] = {
        "chunks_raw": len(chunks),
        "dropped_below_min_score": 0,
        "deduped": 0,
        "entity_boosted": 0,
        "chunks_kept": 0,
        "policy_max_chunks": max_chunks,
        "policy_min_score": min_score,
    }

    if max_chunks <= 0 or not chunks:
        return RagPolicyResult(kept=[], stats=stats)

    active_ids = {str(e) for e in (active_entity_ids or []) if e}

    # 1. Minimum-score filter.
    before = len(chunks)
    filtered: list[Any] = []
    for c in chunks:
        try:
            score = float(_get(c, "score", 0.0) or 0.0)
        except (TypeError, ValueError):
            score = 0.0
        if score >= min_score:
            filtered.append(c)
    stats["dropped_below_min_score"] = before - len(filtered)

    # 2. Entity boost: bump chunks whose entity_id matches the active scope.
    def effective_score(c: Any) -> float:
        try:
            base = float(_get(c, "score", 0.0) or 0.0)
        except (TypeError, ValueError):
            base = 0.0
        ent = _get(c, "entity_id")
        if active_ids and ent and str(ent) in active_ids:
            return base + ENTITY_BOOST
        return base

    boosted_count = 0
    for c in filtered:
        ent = _get(c, "entity_id")
        if active_ids and ent and str(ent) in active_ids:
            boosted_count += 1
    stats["entity_boosted"] = boosted_count

    filtered.sort(key=effective_score, reverse=True)

    # 3. Dedupe by (document_id, section_heading/chunk_index) AND by 200-char
    # prefix of the chunk body, to catch near-duplicates that share a stem.
    seen_keys: set[tuple[Any, Any]] = set()
    seen_prefixes: set[str] = set()
    deduped: list[Any] = []
    for c in filtered:
        key = (
            _get(c, "document_id"),
            _get(c, "section_heading") or _get(c, "chunk_index"),
        )
        prefix = _chunk_text(c)[:200]
        if key in seen_keys or (prefix and prefix in seen_prefixes):
            stats["deduped"] += 1
            continue
        seen_keys.add(key)
        if prefix:
            seen_prefixes.add(prefix)
        deduped.append(c)

    # 4. Hard cap.
    kept = deduped[:max_chunks]
    stats["chunks_kept"] = len(kept)
    return RagPolicyResult(kept=kept, stats=stats)


def format_rag_chunks(chunks: Iterable[Any]) -> str:
    """Deterministic formatter used by the compiler to build the RAG item text."""
    parts: list[str] = []
    for idx, c in enumerate(chunks, start=1):
        try:
            score = float(_get(c, "score", 0.0) or 0.0)
        except (TypeError, ValueError):
            score = 0.0
        heading = _get(c, "section_heading")
        header = f"[Doc {idx} | score={score:.2f}"
        if heading:
            header += f" | section={heading}"
        header += "]"
        body = _chunk_text(c)
        parts.append(f"{header}\n{body}")
    return "\n\n---\n\n".join(parts)
