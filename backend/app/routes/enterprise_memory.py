"""Enterprise Memory API (plan PR 15) — scoped retrieval, NO LLM.

Returns RECORDS WITH CITATIONS; never answers. Reads are env-scoped (and see org-global
null-env rows read-only). Writing is admin-only; writing a GLOBAL (null-env) row requires
admin and is the only way a global record is minted — a normal env actor cannot leak into
the global pool. Embedding fill is deferred to a BackgroundTask; the request returns fast.
Every handler fails closed to {..., null_reason} rather than a 500.

Paths:
    GET  /api/ade/memory/search                          scoped retrieval (records + citations)
    POST /api/ade/memory/index                           admin-only; upsert + async embed
    GET  /api/ade/memory/similar/{item_type}/{source_id} similar records by stored embedding
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Query, Request
from pydantic import BaseModel

from app.auth.platform import require_authenticated_request, require_environment_access
from app.observability.logger import emit_log
from app.services import enterprise_memory as svc

router = APIRouter(prefix="/api/ade/memory", tags=["ade"])

_ADMIN_ROLES = {"admin"}


class IndexBody(BaseModel):
    item_type: str
    source_id: str
    title: str
    content_text: str
    business_id: UUID
    env_id: str | None = None  # null => org-global record (admin-only)
    summary: str | None = None
    source_ref: dict | None = None
    metadata: dict | None = None


@router.get("/search")
def search(request: Request, env_id: str = Query(...), business_id: UUID = Query(...),
           q: str = Query(...), item_type: str = Query(None), top_k: int = Query(5, ge=1, le=50)):
    require_environment_access(request, env_id=env_id)
    try:
        return svc.search(env_id, business_id, q, item_type=item_type, top_k=top_k)
    except Exception as exc:  # noqa: BLE001 — fail closed, never 500
        emit_log(level="error", service="enterprise_memory", action="search_route_failed", message=str(exc), error=exc)
        return {"items": [], "null_reason": "search_unavailable"}


@router.post("/index")
def index(body: IndexBody, request: Request, background_tasks: BackgroundTasks):
    # Admin-only write. Env-scoped writes are gated against that env; a global (null-env)
    # write requires an admin actor (no env to scope against) — this is the only mint path
    # for a global record, so a normal env actor can never create one.
    if body.env_id:
        require_environment_access(request, env_id=body.env_id, allowed_app_roles=_ADMIN_ROLES, strict=True)
    else:
        auth = require_authenticated_request(request)
        if getattr(auth, "app_role", None) not in _ADMIN_ROLES:
            return {"item_id": None, "embedding_status": None, "null_reason": "global_write_requires_admin"}
    try:
        result = svc.index_item(
            item_type=body.item_type, source_id=body.source_id, title=body.title,
            content_text=body.content_text, business_id=body.business_id, env_id=body.env_id,
            summary=body.summary, source_ref=body.source_ref, metadata=body.metadata,
        )
        # Defer embedding off the request path — returns fast with status 'pending'.
        if result.get("item_id"):
            background_tasks.add_task(svc.embed_pending_item, result["item_id"])
        return result
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="enterprise_memory", action="index_route_failed", message=str(exc), error=exc)
        return {"item_id": None, "embedding_status": None, "null_reason": "index_unavailable"}


@router.get("/similar/{item_type}/{source_id}")
def similar(item_type: str, source_id: str, request: Request,
            env_id: str = Query(...), business_id: UUID = Query(...), top_k: int = Query(5, ge=1, le=50)):
    require_environment_access(request, env_id=env_id)
    try:
        return svc.similar_items(item_type, source_id, env_id, business_id, top_k=top_k)
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="enterprise_memory", action="similar_route_failed", message=str(exc), error=exc)
        return {"items": [], "null_reason": "similar_unavailable"}
