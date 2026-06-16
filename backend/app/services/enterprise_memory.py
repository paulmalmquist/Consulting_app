"""Enterprise Memory Index (plan PR 15, Phase 6) — scoped retrieval, NO LLM.

A retrieval/index layer, NOT an answerer. It returns RECORDS WITH CITATIONS (item_type,
source_id, title, indexed_at); it never synthesizes an answer and makes no model call.

Scoping: env_id NULL = org-global (e.g. ADRs), visible read-only to every env; non-null =
env-scoped. Cross-env reads are blocked in BOTH the DB policy and the service WHERE clause.
Writing a global (null-env) row is admin/system-only (enforced here, not relaxed at the DB).

Embedding is ASYNCHRONOUS: index_item writes the row fast (embedding NULL, status 'pending')
and never calls the provider on the request path; embed_pending_item fills it in the
background. Missing provider FAILS CLOSED — embedding stays NULL with status 'no_provider';
a zero/fake vector is NEVER stored (this module gates on OPENAI_API_KEY BEFORE calling the
shared embedding code, which would otherwise return zero-vectors).
"""
from __future__ import annotations

import json
from uuid import UUID

from app.config import OPENAI_EMBEDDING_MODEL
from app.db import get_cursor
from app.observability.logger import emit_log

ITEM_TYPES = ("adr", "investigation", "card", "decision", "workflow")
EMBED_DIM = 1536


def _set_tenant(cur, env_id: str | None) -> None:
    # Global (null-env) reads run with an empty scope; the RLS IS NULL branch still exposes
    # global rows, and env rows are excluded because '' matches no real env.
    cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id or "",))


def _has_provider() -> bool:
    # Re-read at call time (tests/process may set it) rather than trusting an import-time copy.
    from app import config
    return bool(getattr(config, "OPENAI_API_KEY", ""))


# ── index (fast, no provider call) ────────────────────────────────────────────
def index_item(
    *,
    item_type: str,
    source_id: str,
    title: str,
    content_text: str,
    business_id: str | UUID,
    env_id: str | None,
    summary: str | None = None,
    source_ref: dict | None = None,
    metadata: dict | None = None,
) -> dict:
    """Upsert a memory row synchronously with embedding NULL + status 'pending', and return
    fast. Idempotent by (item_type, source_id, business_id, env_id). Never calls the provider.
    """
    if item_type not in ITEM_TYPES:
        return {"item_id": None, "embedding_status": None, "null_reason": "invalid_item_type"}
    if not source_id or not title or not content_text:
        return {"item_id": None, "embedding_status": None, "null_reason": "invalid_inputs"}
    biz = business_id if isinstance(business_id, UUID) else UUID(str(business_id))

    # The unique key spans (item_type, source_id, business_id, env_id) but env_id is nullable,
    # so two partial unique indexes back it (env vs global). ON CONFLICT targets the matching
    # one by its index predicate, which is fixed per call since env_id is known here.
    conflict = (
        "(item_type, source_id, business_id) WHERE env_id IS NULL" if env_id is None
        else "(item_type, source_id, business_id, env_id) WHERE env_id IS NOT NULL"
    )
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            f"""INSERT INTO nv_enterprise_memory_items
                   (env_id, business_id, item_type, source_id, title, summary, content_text,
                    embedding_status, source_ref, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s)
               ON CONFLICT {conflict} DO UPDATE SET
                   title = EXCLUDED.title,
                   summary = EXCLUDED.summary,
                   content_text = EXCLUDED.content_text,
                   source_ref = EXCLUDED.source_ref,
                   metadata = EXCLUDED.metadata,
                   embedding = NULL,
                   embedding_status = 'pending',
                   embedding_model = NULL,
                   null_reason = NULL,
                   indexed_at = now(),
                   updated_at = now()
               RETURNING id::text""",
            (env_id, str(biz), item_type, source_id, title, summary, content_text,
             json.dumps(source_ref or {}), json.dumps(metadata or {})),
        )
        item_id = cur.fetchone()["id"]
    return {"item_id": item_id, "embedding_status": "pending", "null_reason": None}


# ── background embedding fill (provider fail-closed) ───────────────────────────
def embed_pending_item(item_id: str) -> dict:
    """Fill one row's embedding. Runs in the background (or via the backfill script). FAILS
    CLOSED on a missing/erroring provider — never writes a zero/fake vector.
    """
    # Provider absent → mark no_provider, do NOT call the shared embedding code (it would
    # return a zero-vector that poisons cosine ranking).
    if not _has_provider():
        _mark_status(item_id, status="no_provider", null_reason="embedding_provider_unavailable")
        return {"item_id": item_id, "embedding_status": "no_provider"}

    with get_cursor() as cur:
        cur.execute(
            "SELECT env_id, content_text FROM nv_enterprise_memory_items WHERE id = %s", (item_id,)
        )
        row = cur.fetchone()
    if not row:
        return {"item_id": item_id, "embedding_status": None, "null_reason": "item_not_found"}

    try:
        from app.services.rag_indexer import _embed_texts
        vec = _embed_texts([row["content_text"]])[0]
        if len(vec) != EMBED_DIM:
            raise ValueError(f"embedding dim {len(vec)} != {EMBED_DIM}")
        emb_str = "[" + ",".join(str(x) for x in vec) + "]"
    except Exception as exc:  # noqa: BLE001 — fail closed; row stays unranked, never faked
        emit_log(level="error", service="enterprise_memory", action="embed_failed",
                 message=str(exc), error=exc)
        _mark_status(item_id, status="error", null_reason="embedding_failed")
        return {"item_id": item_id, "embedding_status": "error"}

    with get_cursor() as cur:
        cur.execute(
            """UPDATE nv_enterprise_memory_items
               SET embedding = %s::vector, embedding_status = 'indexed',
                   embedding_model = %s, null_reason = NULL, updated_at = now()
               WHERE id = %s""",
            (emb_str, OPENAI_EMBEDDING_MODEL, item_id),
        )
    return {"item_id": item_id, "embedding_status": "indexed"}


def _mark_status(item_id: str, *, status: str, null_reason: str | None) -> None:
    with get_cursor() as cur:
        cur.execute(
            """UPDATE nv_enterprise_memory_items
               SET embedding_status = %s, null_reason = %s, updated_at = now()
               WHERE id = %s""",
            (status, null_reason, item_id),
        )


def list_pending(limit: int = 200) -> list[str]:
    """Ids of rows still awaiting an embedding (for the manual backfill sweep)."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT id::text FROM nv_enterprise_memory_items "
            "WHERE embedding_status = 'pending' ORDER BY indexed_at LIMIT %s",
            (limit,),
        )
        return [r["id"] for r in cur.fetchall()]


# ── retrieval (records + citations only, NO answer, NO LLM) ────────────────────
def _embed_query(query: str) -> str | None:
    """Embed a search query. Fail closed (None) when no provider — search then returns an
    honest empty rather than ranking against a fake vector."""
    if not _has_provider():
        return None
    try:
        from app.services.rag_indexer import _embed_texts
        vec = _embed_texts([query])[0]
        if len(vec) != EMBED_DIM:
            return None
        return "[" + ",".join(str(x) for x in vec) + "]"
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="enterprise_memory", action="query_embed_failed",
                 message=str(exc), error=exc)
        return None


def _citation(row: dict) -> dict:
    return {
        "item_type": row["item_type"],
        "source_id": row["source_id"],
        "title": row["title"],
        "summary": row.get("summary"),
        "indexed_at": row["indexed_at"].isoformat() if row.get("indexed_at") else None,
        "env_id": row.get("env_id"),
        "scope": "global" if row.get("env_id") is None else "env",
        "score": row.get("score"),
    }


def search(env_id: str, business_id: str | UUID, query: str, *,
           item_type: str | None = None, top_k: int = 5) -> dict:
    """Vector search over the env's records + org-global records. Returns RECORDS WITH
    CITATIONS, never an answer. Fail closed on missing provider / empty / error."""
    if not query or not query.strip():
        return {"items": [], "null_reason": "empty_query"}
    if item_type and item_type not in ITEM_TYPES:
        return {"items": [], "null_reason": "invalid_item_type"}

    emb = _embed_query(query)
    if emb is None:
        return {"items": [], "null_reason": "embedding_provider_unavailable"}

    # Defense-in-depth: the explicit WHERE mirrors the RLS policy (env rows for THIS env, plus
    # global null-env rows), so the contract holds even on a superuser connection.
    conds = ["embedding IS NOT NULL", "(env_id IS NULL OR env_id = %s)"]
    params: list = [emb, env_id]
    if item_type:
        conds.append("item_type = %s")
        params.append(item_type)
    where = " AND ".join(conds)
    try:
        with get_cursor() as cur:
            _set_tenant(cur, env_id)
            cur.execute(
                f"""SELECT item_type, source_id, title, summary, env_id::text, indexed_at,
                           1 - (embedding <=> %s::vector) AS score
                    FROM nv_enterprise_memory_items
                    WHERE {where}
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s""",
                [emb] + params[1:] + [emb, top_k],
            )
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001 — fail closed, never 500, never unscoped rows
        emit_log(level="error", service="enterprise_memory", action="search_failed",
                 message=str(exc), error=exc)
        return {"items": [], "null_reason": "search_unavailable"}

    if not rows:
        return {"items": [], "null_reason": "no_matching_records"}
    return {"items": [_citation(r) for r in rows], "null_reason": None}


def similar_items(item_type: str, source_id: str, env_id: str, business_id: str | UUID,
                  *, top_k: int = 5) -> dict:
    """Find records similar to an already-indexed item, by its STORED embedding (no re-embed).
    If the seed isn't indexed yet, fail closed rather than embed-on-read (which would block)."""
    if item_type not in ITEM_TYPES:
        return {"items": [], "null_reason": "invalid_item_type"}
    try:
        with get_cursor() as cur:
            _set_tenant(cur, env_id)
            cur.execute(
                """SELECT id::text, embedding IS NOT NULL AS has_emb
                   FROM nv_enterprise_memory_items
                   WHERE item_type = %s AND source_id = %s AND (env_id IS NULL OR env_id = %s)
                   LIMIT 1""",
                (item_type, source_id, env_id),
            )
            seed = cur.fetchone()
            if not seed:
                return {"items": [], "null_reason": "seed_not_found"}
            if not seed["has_emb"]:
                return {"items": [], "null_reason": "seed_not_indexed"}
            cur.execute(
                """SELECT item_type, source_id, title, summary, env_id::text, indexed_at,
                          1 - (embedding <=> (SELECT embedding FROM nv_enterprise_memory_items WHERE id = %s)) AS score
                   FROM nv_enterprise_memory_items
                   WHERE embedding IS NOT NULL AND id <> %s AND (env_id IS NULL OR env_id = %s)
                   ORDER BY embedding <=> (SELECT embedding FROM nv_enterprise_memory_items WHERE id = %s)
                   LIMIT %s""",
                (seed["id"], seed["id"], env_id, seed["id"], top_k),
            )
            rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="enterprise_memory", action="similar_failed",
                 message=str(exc), error=exc)
        return {"items": [], "null_reason": "similar_unavailable"}

    if not rows:
        return {"items": [], "null_reason": "no_similar_records"}
    return {"items": [_citation(r) for r in rows], "null_reason": None}
