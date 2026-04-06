"""Capability graph API — exposes the Winston capability inventory per environment.

Advisory endpoint only. The returned graph describes what Winston can do
for a given environment but does NOT enforce authorization or write permissions
(those are handled independently by the existing MCP and gateway guardrails).

GET /api/v1/capability/graph?env_id=...&business_id=...&industry_type=repe
"""
from __future__ import annotations

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/v1/capability", tags=["capability"])


@router.get("/graph")
def get_capability_graph(
    env_id: str = Query(..., description="Lab environment UUID"),
    business_id: str = Query(..., description="Tenant business UUID"),
    industry_type: str = Query("repe", description="One of: repe, pds, crm, resume, trading"),
) -> dict:
    """Return a structured capability snapshot for this environment.

    Aggregates: SQL templates, DB metrics, MCP tools, skill registry,
    Winston launch surfaces, and grounding table references.

    This is advisory/runtime truth — not a permission gate.
    """
    from app.services.capability_graph import build_capability_graph
    return build_capability_graph(
        env_id=env_id,
        business_id=business_id,
        industry_type=industry_type,
    )
