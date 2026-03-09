"""Pipeline deal/property/tranche/contact/activity + map + census endpoints."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.observability.logger import emit_log
from app.schemas.re_pipeline import (
    ReCensusLayerOut,
    ReCensusTractOut,
    ReMapMarkerOut,
    RePipelineActivityCreateRequest,
    RePipelineActivityOut,
    RePipelineContactCreateRequest,
    RePipelineContactOut,
    RePipelineDealCreateRequest,
    RePipelineDealOut,
    RePipelineDealPatchRequest,
    RePipelinePropertyCreateRequest,
    RePipelinePropertyOut,
    RePipelineTrancheCreateRequest,
    RePipelineTrancheOut,
    ReVectorSearchRequest,
    ReVectorSearchResult,
)
from app.services import re_census, re_pipeline

router = APIRouter(prefix="/api/re/v2/pipeline", tags=["re-pipeline"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


def _log(action: str, msg: str, **ctx):
    emit_log(level="info", service="backend", action=action, message=msg, context=ctx)


# ── Deal CRUD ────────────────────────────────────────────────────────────────

@router.get("/deals", response_model=list[RePipelineDealOut])
def list_deals(
    env_id: str = Query(...),
    status: str | None = Query(None),
    strategy: str | None = Query(None),
    fund_id: UUID | None = Query(None),
):
    return re_pipeline.list_deals(
        env_id=env_id, status=status, strategy=strategy, fund_id=fund_id,
    )


@router.post("/deals", response_model=RePipelineDealOut, status_code=201)
def create_deal(body: RePipelineDealCreateRequest, env_id: str = Query(...)):
    try:
        row = re_pipeline.create_deal(env_id=env_id, payload=body.model_dump())
        _log("re.pipeline.deal_created", f"Deal created: {body.deal_name}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/deals/{deal_id}", response_model=RePipelineDealOut)
def get_deal(deal_id: UUID):
    try:
        return re_pipeline.get_deal(deal_id=deal_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/deals/{deal_id}/geo-score")
def get_deal_geo_score(
    deal_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    market_id: str | None = Query(None),
):
    try:
        return re_pipeline.enrich_deal_with_geo(deal_id=str(deal_id), market_id=market_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/radar")
def get_pipeline_radar(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    stage: list[str] | None = Query(None),
):
    try:
        from app.services.re_deal_scoring import batch_score_deals

        deals = batch_score_deals(
            env_id=env_id,
            business_id=str(business_id),
            stage_filter=stage,
        )
        return {"deals": deals, "top_5": deals[:5], "count": len(deals)}
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/deals/{deal_id}", response_model=RePipelineDealOut)
def update_deal(deal_id: UUID, body: RePipelineDealPatchRequest):
    try:
        row = re_pipeline.update_deal(
            deal_id=deal_id,
            payload=body.model_dump(exclude_unset=True),
        )
        _log("re.pipeline.deal_updated", f"Deal {deal_id} updated")
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Property CRUD ────────────────────────────────────────────────────────────

@router.get("/deals/{deal_id}/properties", response_model=list[RePipelinePropertyOut])
def list_properties(deal_id: UUID):
    return re_pipeline.list_properties(deal_id=deal_id)


@router.post("/deals/{deal_id}/properties", response_model=RePipelinePropertyOut, status_code=201)
def create_property(deal_id: UUID, body: RePipelinePropertyCreateRequest):
    try:
        row = re_pipeline.create_property(deal_id=deal_id, payload=body.model_dump())
        _log("re.pipeline.property_created", f"Property added to deal {deal_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/properties/{property_id}", response_model=RePipelinePropertyOut)
def update_property(property_id: UUID, body: RePipelinePropertyCreateRequest):
    try:
        row = re_pipeline.update_property(
            property_id=property_id,
            payload=body.model_dump(exclude_unset=True),
        )
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Tranche CRUD ─────────────────────────────────────────────────────────────

@router.get("/deals/{deal_id}/tranches", response_model=list[RePipelineTrancheOut])
def list_tranches(deal_id: UUID):
    return re_pipeline.list_tranches(deal_id=deal_id)


@router.post("/deals/{deal_id}/tranches", response_model=RePipelineTrancheOut, status_code=201)
def create_tranche(deal_id: UUID, body: RePipelineTrancheCreateRequest):
    try:
        row = re_pipeline.create_tranche(deal_id=deal_id, payload=body.model_dump())
        _log("re.pipeline.tranche_created", f"Tranche added to deal {deal_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.patch("/tranches/{tranche_id}", response_model=RePipelineTrancheOut)
def update_tranche(tranche_id: UUID, body: RePipelineTrancheCreateRequest):
    try:
        row = re_pipeline.update_tranche(
            tranche_id=tranche_id,
            payload=body.model_dump(exclude_unset=True),
        )
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Contact CRUD ─────────────────────────────────────────────────────────────

@router.get("/deals/{deal_id}/contacts", response_model=list[RePipelineContactOut])
def list_contacts(deal_id: UUID):
    return re_pipeline.list_contacts(deal_id=deal_id)


@router.post("/deals/{deal_id}/contacts", response_model=RePipelineContactOut, status_code=201)
def create_contact(deal_id: UUID, body: RePipelineContactCreateRequest):
    try:
        row = re_pipeline.create_contact(deal_id=deal_id, payload=body.model_dump())
        _log("re.pipeline.contact_created", f"Contact added to deal {deal_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Activity CRUD ────────────────────────────────────────────────────────────

@router.get("/deals/{deal_id}/activities", response_model=list[RePipelineActivityOut])
def list_activities(deal_id: UUID, limit: int = Query(50, le=200)):
    return re_pipeline.list_activities(deal_id=deal_id, limit=limit)


@router.post("/deals/{deal_id}/activities", response_model=RePipelineActivityOut, status_code=201)
def create_activity(deal_id: UUID, body: RePipelineActivityCreateRequest):
    try:
        row = re_pipeline.create_activity(deal_id=deal_id, payload=body.model_dump())
        _log("re.pipeline.activity_created", f"Activity added to deal {deal_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Map Markers ──────────────────────────────────────────────────────────────

@router.get("/map/markers", response_model=list[ReMapMarkerOut])
def get_map_markers(
    env_id: str = Query(...),
    sw_lat: Decimal | None = Query(None),
    sw_lon: Decimal | None = Query(None),
    ne_lat: Decimal | None = Query(None),
    ne_lon: Decimal | None = Query(None),
    status: str | None = Query(None),
):
    bbox = None
    if all(v is not None for v in (sw_lat, sw_lon, ne_lat, ne_lon)):
        bbox = (float(sw_lat), float(sw_lon), float(ne_lat), float(ne_lon))
    return re_pipeline.get_map_markers(env_id=env_id, bbox=bbox, status=status)


# ── Census ───────────────────────────────────────────────────────────────────

@router.get("/census/tract", response_model=ReCensusTractOut | None)
def get_census_tract(
    lat: float = Query(...),
    lon: float = Query(...),
    year: int = Query(2023),
):
    return re_census.get_tract_by_latlon(lat=lat, lon=lon, year=year)


@router.get("/census/tracts", response_model=list[ReCensusTractOut])
def get_census_tracts(
    sw_lat: float = Query(...),
    sw_lon: float = Query(...),
    ne_lat: float = Query(...),
    ne_lon: float = Query(...),
    layer: str | None = Query(None),
):
    return re_census.get_tracts_by_bbox(
        bbox=(sw_lat, sw_lon, ne_lat, ne_lon), layer=layer,
    )


@router.get("/census/layers", response_model=list[ReCensusLayerOut])
def list_census_layers():
    return re_census.list_layers()


# ── Vector Search ────────────────────────────────────────────────────────────

@router.post("/docs/ai/search", response_model=list[ReVectorSearchResult])
def vector_search(body: ReVectorSearchRequest, env_id: str = Query(...)):
    try:
        from app.services import re_pipeline_vector
        return re_pipeline_vector.vector_search(
            env_id=env_id,
            query=body.query,
            entity_type=body.entity_type,
            entity_id=body.entity_id,
            limit=body.limit,
        )
    except ImportError:
        raise HTTPException(status_code=501, detail="Vector search not yet available")
    except Exception as exc:
        raise _to_http(exc)
