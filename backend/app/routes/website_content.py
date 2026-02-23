"""Website OS — Content module routes."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from uuid import UUID

from app.services import website_content as svc

router = APIRouter(prefix="/api/website/content", tags=["website-content"])


class ContentItemCreateRequest(BaseModel):
    env_id: str
    title: str
    slug: str
    category: Optional[str] = None
    area: Optional[str] = None
    state: str = "idea"
    target_keyword: Optional[str] = None
    monetization_type: str = "none"
    publish_date: Optional[str] = None


class ContentStateUpdateRequest(BaseModel):
    env_id: str
    state: str


@router.get("/items")
def list_content_items(
    env_id: str = Query(...),
    state: Optional[str] = Query(None),
):
    try:
        return svc.list_content_items(env_id=env_id, state=state)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/items", status_code=201)
def create_content_item(req: ContentItemCreateRequest):
    try:
        return svc.create_content_item(
            env_id=req.env_id,
            title=req.title,
            slug=req.slug,
            category=req.category,
            area=req.area,
            state=req.state,
            target_keyword=req.target_keyword,
            monetization_type=req.monetization_type,
            publish_date=req.publish_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/items/{item_id}/state")
def update_content_state(item_id: UUID, req: ContentStateUpdateRequest):
    try:
        return svc.update_content_state(
            item_id=str(item_id),
            env_id=req.env_id,
            new_state=req.state,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/stats")
def get_content_stats(env_id: str = Query(...)):
    try:
        return svc.get_content_stats(env_id=env_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
