"""Agent Personalities API (plan PR 13) — deterministic role agents, NO LLM.

Read-only registry + run-now. An agent run filters the env's existing intelligence cards
by its role and upserts one role-tagged rollup card; it never invents findings and never
calls a model. Env-scoped, fail-closed.

Paths:
    GET  /api/ade/agents               list the fixed agent registry (cfo/operations/...)
    POST /api/ade/agents/run           run one agent (agent_type) or all (omit), persist rollups
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.auth.platform import require_environment_access
from app.observability.logger import emit_log
from app.services import agent_personalities as svc

router = APIRouter(prefix="/api/ade/agents", tags=["ade"])


class RunBody(BaseModel):
    env_id: str
    business_id: UUID
    agent_type: str | None = None  # one agent; omit to run all four


@router.get("")
def list_agents():
    return {"agents": svc.list_agents(), "null_reason": None}


@router.post("/run")
def run(body: RunBody, request: Request):
    require_environment_access(request, env_id=body.env_id)
    try:
        if body.agent_type:
            result = svc.run_agent(body.agent_type, body.env_id, body.business_id)
            return {"results": [result],
                    "cards_upserted": 1 if result.get("card_id") else 0, "null_reason": None}
        return {**svc.run_all(body.env_id, body.business_id), "null_reason": None}
    except Exception as exc:  # noqa: BLE001 — fail closed, never 500 with fabricated data
        emit_log(level="error", service="agent_personalities", action="run_failed", message=str(exc), error=exc)
        return {"results": [], "cards_upserted": 0, "null_reason": "agents_run_unavailable"}
