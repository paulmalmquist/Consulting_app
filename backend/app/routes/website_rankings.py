"""Website OS — Rankings module routes."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from uuid import UUID

from app.services import website_rankings as svc

router = APIRouter(prefix="/api/website/rankings", tags=["website-rankings"])


class EntityCreateRequest(BaseModel):
    env_id: str
    name: str
    category: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    tags: Optional[list] = None
    editorial_notes: Optional[str] = None


class RankingListCreateRequest(BaseModel):
    env_id: str
    name: str
    category: Optional[str] = None
    area: Optional[str] = None


class RankingEntrySetRequest(BaseModel):
    env_id: str
    entity_id: Optional[str] = None
    rank: int
    score: Optional[float] = None
    notes: Optional[str] = None


class BadgeAwardRequest(BaseModel):
    env_id: str
    entity_id: str
    badge_type: str


# ── Entities ──────────────────────────────────────────────────────────

@router.get("/entities")
def list_entities(
    env_id: str = Query(...),
    category: Optional[str] = Query(None),
):
    try:
        return svc.list_entities(env_id=env_id, category=category)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/entities", status_code=201)
def create_entity(req: EntityCreateRequest):
    try:
        return svc.create_entity(
            env_id=req.env_id,
            name=req.name,
            category=req.category,
            location=req.location,
            website=req.website,
            instagram=req.instagram,
            tags=req.tags,
            editorial_notes=req.editorial_notes,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Ranking lists ─────────────────────────────────────────────────────

@router.get("/lists")
def list_ranking_lists(env_id: str = Query(...)):
    try:
        return svc.list_ranking_lists(env_id=env_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/lists", status_code=201)
def create_ranking_list(req: RankingListCreateRequest):
    try:
        return svc.create_ranking_list(
            env_id=req.env_id,
            name=req.name,
            category=req.category,
            area=req.area,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/lists/{list_id}")
def get_ranking_list(list_id: UUID, env_id: str = Query(...)):
    try:
        return svc.get_ranking_list_with_entries(str(list_id), env_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/lists/{list_id}/entries")
def set_ranking_entry(list_id: UUID, req: RankingEntrySetRequest):
    try:
        return svc.set_ranking_entry(
            ranking_list_id=str(list_id),
            entity_id=req.entity_id,
            rank=req.rank,
            score=req.score,
            notes=req.notes,
            env_id=req.env_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Champion badges ───────────────────────────────────────────────────

@router.get("/badges")
def list_champion_badges(env_id: str = Query(...)):
    try:
        return svc.list_champion_badges(env_id=env_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/badges", status_code=201)
def award_champion_badge(req: BadgeAwardRequest):
    try:
        return svc.award_champion_badge(
            env_id=req.env_id,
            entity_id=req.entity_id,
            badge_type=req.badge_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Audit log ─────────────────────────────────────────────────────────

@router.get("/changes")
def list_ranking_changes(
    env_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
):
    try:
        return svc.list_ranking_changes(env_id=env_id, limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Stats ─────────────────────────────────────────────────────────────

@router.get("/stats")
def get_rankings_stats(env_id: str = Query(...)):
    try:
        return svc.get_rankings_stats(env_id=env_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
