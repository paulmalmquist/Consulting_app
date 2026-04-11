"""Admin-only inspection endpoints for prompt receipts + policy proposals.

These endpoints let an authorized operator inspect exactly what was sent to
the model on any turn, aggregate diagnostic flags across an environment, and
review policy-change proposals from the autotuner.

Gate: requires an authenticated request AND the ``x-bm-platform-admin: true``
header (forwarded by the Next.js proxy for platform admins and env managers).
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from app.auth.platform import require_authenticated_request
from app.db import get_cursor

router = APIRouter(prefix="/api/admin/ai", tags=["admin-ai"])


def _require_admin(request: Request) -> None:
    require_authenticated_request(request)
    header = (request.headers.get("x-bm-platform-admin") or "").strip().lower()
    if header != "true":
        raise HTTPException(status_code=403, detail="Admin access required")


_LIST_COLUMNS = [
    "id",
    "created_at",
    "request_id",
    "round_index",
    "capture_point",
    "conversation_id",
    "session_id",
    "env_id",
    "business_id",
    "actor",
    "lane",
    "intent",
    "composition_profile",
    "model",
    "skill_id",
    "skill_source",
    "skill_trimmed",
    "system_tokens",
    "skill_instructions_tokens",
    "thread_goal_tokens",
    "thread_summary_tokens",
    "scope_entity_tokens",
    "scope_page_tokens",
    "scope_environment_tokens",
    "scope_filters_tokens",
    "rag_tokens",
    "history_tokens",
    "current_user_tokens",
    "total_prompt_tokens",
    "total_prompt_tokens_upstream",
    "total_budget",
    "pre_enforcement_tokens",
    "history_message_count",
    "history_truncated",
    "used_thread_summary",
    "summary_strategy",
    "active_scope_type",
    "active_scope_id",
    "active_scope_label",
    "fallback_used",
    "notes_json",
]


@router.get("/prompt-receipts")
def list_receipts(
    request: Request,
    conversation_id: str | None = Query(None),
    request_id: str | None = Query(None),
    env_id: str | None = Query(None),
    composition_profile: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
) -> dict[str, Any]:
    _require_admin(request)
    clauses: list[str] = []
    params: list[Any] = []
    if conversation_id:
        clauses.append("conversation_id = %s")
        params.append(conversation_id)
    if request_id:
        clauses.append("request_id = %s")
        params.append(request_id)
    if env_id:
        clauses.append("env_id::text = %s")
        params.append(env_id)
    if composition_profile:
        clauses.append("composition_profile = %s")
        params.append(composition_profile)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    columns_sql = ", ".join(_LIST_COLUMNS)
    sql = f"SELECT {columns_sql} FROM ai_prompt_receipts {where} ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        rows = cur.fetchall() or []
    return {"items": [_serialize_row(row) for row in rows]}


@router.get("/prompt-receipts/{receipt_id}")
def get_receipt(receipt_id: str, request: Request) -> dict[str, Any]:
    _require_admin(request)
    with get_cursor() as cur:
        cur.execute("SELECT * FROM ai_prompt_receipts WHERE id = %s", (receipt_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return _serialize_row(row)


@router.get("/prompt-health")
def prompt_health(
    request: Request,
    env_id: str | None = Query(None),
    composition_profile: str | None = Query(None),
    window_hours: int = Query(24, ge=1, le=168),
) -> dict[str, Any]:
    _require_admin(request)
    clauses: list[str] = [
        "bucket >= now() - (%s::text || ' hours')::interval",
    ]
    params: list[Any] = [str(int(window_hours))]
    if env_id:
        clauses.append("env_id::text = %s")
        params.append(env_id)
    if composition_profile:
        clauses.append("composition_profile = %s")
        params.append(composition_profile)
    where = "WHERE " + " AND ".join(clauses)
    with get_cursor() as cur:
        cur.execute(
            f"SELECT * FROM v_ai_prompt_health {where} ORDER BY bucket DESC",
            tuple(params),
        )
        rows = cur.fetchall() or []
    return {"items": [_serialize_row(row) for row in rows], "window_hours": window_hours}


@router.get("/prompt-policy-proposals")
def list_policy_proposals(
    request: Request,
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> dict[str, Any]:
    _require_admin(request)
    clauses: list[str] = []
    params: list[Any] = []
    if status:
        clauses.append("status = %s")
        params.append(status)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    params.append(limit)
    with get_cursor() as cur:
        cur.execute(
            f"""SELECT id, created_at, proposed_by, reason, signal_window, signal_metrics,
                       current_policy, proposed_policy, status, reviewed_by, reviewed_at, applied_at
                FROM ai_prompt_policy_proposals
                {where}
                ORDER BY created_at DESC
                LIMIT %s""",
            tuple(params),
        )
        rows = cur.fetchall() or []
    return {"items": [_serialize_row(row) for row in rows]}


@router.post("/prompt-policy-proposals/{proposal_id}/decision")
def decide_policy_proposal(
    proposal_id: str, request: Request, decision: str = Query(..., pattern="^(approved|rejected)$")
) -> dict[str, Any]:
    _require_admin(request)
    actor = request.headers.get("x-bm-actor", "anonymous")
    with get_cursor() as cur:
        cur.execute(
            """UPDATE ai_prompt_policy_proposals
                  SET status = %s, reviewed_by = %s, reviewed_at = now()
                WHERE id = %s
            RETURNING id, status, reviewed_by, reviewed_at""",
            (decision, actor, proposal_id),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return _serialize_row(row)


def _serialize_row(row: Any) -> dict[str, Any]:
    if row is None:
        return {}
    if isinstance(row, dict):
        out = {}
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                out[k] = v.isoformat()
            elif isinstance(v, (dict, list)):
                out[k] = v
            elif isinstance(v, (bytes, bytearray)):
                try:
                    out[k] = json.loads(v)
                except Exception:
                    out[k] = v.decode("utf-8", errors="replace")
            else:
                out[k] = v
        return out
    # psycopg tuple fallback
    return {str(i): v for i, v in enumerate(row)}
