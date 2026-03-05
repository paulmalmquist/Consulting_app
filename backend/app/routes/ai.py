"""Legacy AI routes — kept for backward compatibility.

The sidecar-dependent endpoints now return 501 with a redirect message
to the new AI Gateway at /api/ai/gateway/*. The health endpoint reports
the gateway status instead.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/health")
def health():
    return JSONResponse(
        content={
            "enabled": False,
            "sidecar_ok": False,
            "mode": "gateway",
            "message": "AI sidecar removed. Use /api/ai/gateway/health for the new AI Gateway.",
        }
    )


@router.post("/ask")
def ask():
    raise HTTPException(
        status_code=301,
        detail="AI sidecar removed. Use POST /api/ai/gateway/ask instead.",
    )


@router.post("/code_task")
def code_task():
    raise HTTPException(
        status_code=301,
        detail="AI sidecar removed. Use POST /api/ai/gateway/ask instead.",
    )
