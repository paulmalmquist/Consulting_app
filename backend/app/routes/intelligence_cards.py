"""Intelligence Card System API (plan PR 4, Phase 2).

CRUD over the living-feed card model. Mounted under /api/ade/intel to reuse the
committed ADE proxy and keep path naming consistent with the rest of the surface.

Paths:
    GET   /api/ade/intel/cards            list (anomaly + priority + recency ordered)
    POST  /api/ade/intel/cards            upsert (idempotent by env_id + source_ref)
    PATCH /api/ade/intel/cards/{id}       dismiss or bump priority

No home-page wiring, no agents/investigations — those are later Phase 2 PRs.
Reads fail closed with a null_reason rather than erroring open.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.observability.logger import emit_log
from app.services import intelligence_cards as svc

router = APIRouter(prefix="/api/ade/intel", tags=["ade"])


class UpsertCardBody(BaseModel):
    env_id: str
    business_id: UUID
    card_type: str
    title: str
    summary: str | None = None
    source_ref: dict = Field(default_factory=dict)
    priority_score: float = 0.0
    anomaly_flag: bool = False
    created_by: str | None = "system"


class PatchCardBody(BaseModel):
    env_id: str
    business_id: UUID
    dismiss: bool | None = None
    priority_delta: float | None = None


@router.get("/cards")
def list_cards(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    limit: int = Query(50, ge=1, le=200),
    include_dismissed: bool = Query(False),
    card_type: str = Query(None),
):
    try:
        rows = svc.list_cards(
            env_id, business_id, limit=limit,
            include_dismissed=include_dismissed, card_type=card_type,
        )
        return {"cards": rows, "null_reason": None}
    except ValueError as exc:
        raise HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="intelligence_cards", action="list_failed", message=str(exc), error=exc)
        return {"cards": [], "null_reason": "intel_cards_unavailable"}


@router.post("/cards")
def upsert_card(body: UpsertCardBody):
    try:
        card = svc.upsert_card(
            body.env_id, body.business_id,
            card_type=body.card_type, title=body.title, summary=body.summary,
            source_ref=body.source_ref, priority_score=body.priority_score,
            anomaly_flag=body.anomaly_flag, created_by=body.created_by,
        )
        return {**card, "null_reason": None}
    except ValueError as exc:
        raise HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="intelligence_cards", action="upsert_failed", message=str(exc), error=exc)
        raise HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": "intel_cards_write_unavailable"})


@router.patch("/cards/{card_id}")
def patch_card(card_id: UUID, body: PatchCardBody):
    """Dismiss a card or bump its priority. Exactly one action per call."""
    try:
        if body.dismiss:
            card = svc.dismiss_card(body.env_id, body.business_id, card_id)
        elif body.priority_delta is not None:
            card = svc.bump_priority(body.env_id, body.business_id, card_id, body.priority_delta)
        else:
            raise HTTPException(400, {"error_code": "VALIDATION_ERROR",
                                     "message": "provide dismiss=true or priority_delta"})
        if card is None:
            raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown card: {card_id}"})
        return {**card, "null_reason": None}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="intelligence_cards", action="patch_failed", message=str(exc), error=exc)
        raise HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": "intel_cards_write_unavailable"})
