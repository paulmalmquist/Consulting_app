from __future__ import annotations

import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.ingest import (
    DataPointCreateRequest,
    DataPointRegistryOut,
    IngestProfileResponse,
    IngestRecipeCreateRequest,
    IngestRecipeOut,
    IngestRunOut,
    IngestRunRequest,
    IngestSourceCreateRequest,
    IngestSourceOut,
    IngestTableOut,
    IngestTableRowsResponse,
    IngestTargetOut,
    IngestValidateResponse,
    IngestValidationRequest,
    MetricSuggestionResponse,
)
from app.services import ingest as ingest_svc

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


@router.get("/targets", response_model=list[IngestTargetOut])
def list_targets():
    return [IngestTargetOut(**target) for target in ingest_svc.list_targets()]


@router.post("/sources", response_model=IngestSourceOut)
def create_source(req: IngestSourceCreateRequest):
    try:
        source = ingest_svc.create_source(
            business_id=req.business_id,
            env_id=req.env_id,
            name=req.name,
            description=req.description,
            document_id=req.document_id,
            document_version_id=req.document_version_id,
            file_type=req.file_type,
            uploaded_by=req.uploaded_by,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return IngestSourceOut(**source)


@router.get("/sources", response_model=list[IngestSourceOut])
def list_sources(
    business_id: Optional[UUID] = Query(None),
    env_id: Optional[UUID] = Query(None),
):
    rows = ingest_svc.list_sources(business_id=business_id, env_id=env_id)
    return [IngestSourceOut(**row) for row in rows]


@router.get("/sources/{source_id}/profile", response_model=IngestProfileResponse)
def get_source_profile(source_id: UUID, version: Optional[int] = Query(None)):
    try:
        payload = ingest_svc.profile_source(source_id=source_id, version_num=version)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return IngestProfileResponse(**payload)


@router.post("/sources/{source_id}/recipes", response_model=IngestRecipeOut)
def create_recipe(source_id: UUID, req: IngestRecipeCreateRequest):
    try:
        payload = ingest_svc.create_recipe(source_id=source_id, payload=req.model_dump())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return IngestRecipeOut(**payload)


@router.get("/recipes/{recipe_id}", response_model=IngestRecipeOut)
def get_recipe(recipe_id: UUID):
    try:
        payload = ingest_svc.get_recipe(recipe_id=recipe_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return IngestRecipeOut(**payload)


@router.post("/recipes/{recipe_id}/validate", response_model=IngestValidateResponse)
def validate_recipe(recipe_id: UUID, req: IngestValidationRequest):
    try:
        payload = ingest_svc.validate_recipe(
            recipe_id=recipe_id,
            source_version_id=req.source_version_id,
            preview_rows=req.preview_rows,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return IngestValidateResponse(**payload)


@router.post("/recipes/{recipe_id}/run", response_model=IngestRunOut)
def run_recipe(recipe_id: UUID, req: IngestRunRequest):
    try:
        payload = ingest_svc.run_recipe(recipe_id=recipe_id, source_version_id=req.source_version_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return IngestRunOut(**payload)


@router.get("/runs/{run_id}", response_model=IngestRunOut)
def get_run(run_id: UUID):
    try:
        payload = ingest_svc.get_run(run_id=run_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return IngestRunOut(**payload)


@router.get("/tables", response_model=list[IngestTableOut])
def list_tables(
    business_id: Optional[UUID] = Query(None),
    env_id: Optional[UUID] = Query(None),
):
    rows = ingest_svc.list_tables(business_id=business_id, env_id=env_id)
    return [IngestTableOut(**row) for row in rows]


@router.get("/tables/{table_key}/rows", response_model=IngestTableRowsResponse)
def get_table_rows(
    table_key: str,
    business_id: Optional[UUID] = Query(None),
    env_id: Optional[UUID] = Query(None),
    filters: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    parsed_filters: dict[str, str] | None = None
    if filters:
        try:
            raw = json.loads(filters)
            if isinstance(raw, dict):
                parsed_filters = {str(k): str(v) for k, v in raw.items()}
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid filters JSON: {exc}")

    payload = ingest_svc.get_table_rows(
        table_key=table_key,
        business_id=business_id,
        env_id=env_id,
        filters=parsed_filters,
        limit=limit,
        offset=offset,
    )
    return IngestTableRowsResponse(**payload)


@router.get("/metrics/data-points", response_model=list[DataPointRegistryOut])
def list_data_points(
    business_id: Optional[UUID] = Query(None),
    env_id: Optional[UUID] = Query(None),
):
    rows = ingest_svc.list_data_points(business_id=business_id, env_id=env_id)
    return [DataPointRegistryOut(**row) for row in rows]


@router.post("/metrics/data-points", response_model=DataPointRegistryOut)
def create_data_point(req: DataPointCreateRequest):
    payload = ingest_svc.create_data_point(req.model_dump())
    return DataPointRegistryOut(**payload)


@router.get("/tables/{table_key}/metric-suggestions", response_model=MetricSuggestionResponse)
def suggest_metrics_for_table(
    table_key: str,
    business_id: Optional[UUID] = Query(None),
    env_id: Optional[UUID] = Query(None),
):
    payload = ingest_svc.suggest_metrics_for_table(
        table_key=table_key,
        business_id=business_id,
        env_id=env_id,
    )
    return MetricSuggestionResponse(**payload)
