from __future__ import annotations

from datetime import date
from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query

from app.schemas.re_intelligence import (
    CreDocumentExtractionOut,
    CreDocumentExtractionRequest,
    CreExternalitiesBundleOut,
    CreFeatureValueOut,
    CreForecastMaterializeRequest,
    CreForecastOut,
    CreForecastQuestionCreateRequest,
    CreForecastQuestionOut,
    CreForecastSignalsBundleOut,
    CreGeographyFeatureCollectionOut,
    CreIngestRunCreateRequest,
    CreIngestRunOut,
    CrePropertyDetailOut,
    CrePropertySummaryOut,
    CreResolutionCandidateApproveRequest,
    CreResolutionCandidateOut,
    CreResolutionDecisionOut,
)
from app.services import re_intelligence

router = APIRouter(prefix="/api/re/v2/intelligence", tags=["re-intelligence"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, psycopg.errors.UndefinedTable):
        return HTTPException(
            503,
            {"error_code": "SCHEMA_NOT_MIGRATED", "message": "CRE intelligence schema not migrated.", "detail": "Run migrations 303-305."},
        )
    if isinstance(exc, LookupError):
        return HTTPException(404, {"error_code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    return HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": str(exc)})


def _parse_bbox(raw: str | None) -> tuple[float, float, float, float] | None:
    if not raw:
        return None
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must be min_lon,min_lat,max_lon,max_lat")
    min_lon, min_lat, max_lon, max_lat = (float(part) for part in parts)
    return (min_lon, min_lat, max_lon, max_lat)


@router.post("/ingest/runs", response_model=CreIngestRunOut, status_code=201)
def create_ingest_run(body: CreIngestRunCreateRequest):
    try:
        return re_intelligence.create_ingest_run(
            source_key=body.source_key,
            scope=body.scope,
            filters=body.filters,
            force_refresh=body.force_refresh,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/ingest/runs", response_model=list[CreIngestRunOut])
def list_ingest_runs(
    source_key: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
):
    try:
        return re_intelligence.list_ingest_runs(source_key=source_key, status=status, limit=limit)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/geographies", response_model=CreGeographyFeatureCollectionOut)
def list_geographies(
    bbox: str | None = Query(None),
    layer: str | None = Query(None),
    metric_key: str | None = Query(None),
    period: date | None = Query(None),
):
    try:
        return re_intelligence.list_geographies(
            bbox=_parse_bbox(bbox),
            layer=layer,
            metric_key=metric_key,
            period=period,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/properties", response_model=list[CrePropertySummaryOut])
def list_properties(
    env_id: UUID = Query(...),
    bbox: str | None = Query(None),
    property_type: str | None = Query(None),
    search: str | None = Query(None),
    risk_band: str | None = Query(None),
):
    try:
        return re_intelligence.list_properties(
            env_id=env_id,
            bbox=_parse_bbox(bbox),
            property_type=property_type,
            search=search,
            risk_band=risk_band,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/properties/{property_id}", response_model=CrePropertyDetailOut)
def get_property_detail(property_id: UUID):
    try:
        return re_intelligence.get_property_detail(property_id=property_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/properties/{property_id}/externalities", response_model=CreExternalitiesBundleOut)
def get_property_externalities(property_id: UUID, period: date | None = Query(None)):
    try:
        return re_intelligence.get_property_externalities(property_id=property_id, period=period)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/properties/{property_id}/features", response_model=list[CreFeatureValueOut])
def get_property_features(
    property_id: UUID,
    period: date | None = Query(None),
    version: str | None = Query(None),
):
    try:
        return re_intelligence.get_property_features(property_id=property_id, period=period, version=version)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/forecasts/materialize", response_model=list[CreForecastOut])
def materialize_forecasts(body: CreForecastMaterializeRequest):
    try:
        return re_intelligence.materialize_forecasts(
            scope=body.scope,
            entity_ids=body.entity_ids,
            targets=body.targets,
            horizon=body.horizon,
            feature_version=body.feature_version,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/forecasts/{forecast_id}", response_model=CreForecastOut)
def get_forecast(forecast_id: UUID):
    try:
        return re_intelligence.get_forecast(forecast_id=forecast_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/questions", response_model=list[CreForecastQuestionOut])
def list_questions(
    env_id: UUID | None = Query(None),
    business_id: UUID | None = Query(None),
    scope: str | None = Query(None),
    status: str | None = Query(None),
):
    try:
        return re_intelligence.list_questions(env_id=env_id, business_id=business_id, scope=scope, status=status)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/questions", response_model=CreForecastQuestionOut, status_code=201)
def create_question(body: CreForecastQuestionCreateRequest):
    try:
        return re_intelligence.create_question(
            env_id=body.env_id,
            business_id=body.business_id,
            text=body.text,
            scope=body.scope,
            event_date=body.event_date,
            resolution_criteria=body.resolution_criteria,
            resolution_source=body.resolution_source,
            entity_id=body.entity_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/questions/{question_id}/signals", response_model=CreForecastSignalsBundleOut)
def get_question_signals(question_id: UUID):
    try:
        return re_intelligence.get_question_signals(question_id=question_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/questions/{question_id}/signals/refresh", response_model=CreForecastSignalsBundleOut)
def refresh_question_signals(question_id: UUID):
    try:
        return re_intelligence.refresh_question_signals(question_id=question_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/entity-resolution/candidates", response_model=list[CreResolutionCandidateOut])
def list_resolution_candidates(
    env_id: UUID | None = Query(None),
    business_id: UUID | None = Query(None),
    status: str | None = Query(None),
    entity_type: str | None = Query(None),
):
    try:
        return re_intelligence.list_resolution_candidates(
            env_id=env_id,
            business_id=business_id,
            status=status,
            entity_type=entity_type,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/entity-resolution/candidates/{candidate_id}/approve", response_model=CreResolutionDecisionOut)
def approve_resolution_candidate(candidate_id: UUID, body: CreResolutionCandidateApproveRequest):
    try:
        return re_intelligence.approve_resolution_candidate(
            candidate_id=candidate_id,
            approved_by=body.approved_by,
            decision_notes=body.decision_notes,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.post("/documents/extractions", response_model=CreDocumentExtractionOut, status_code=201)
def create_document_extraction(body: CreDocumentExtractionRequest):
    try:
        return re_intelligence.create_document_extraction(
            document_id=body.document_id,
            profile_key=body.profile_key,
            property_id=body.property_id,
            entity_id=body.entity_id,
        )
    except Exception as exc:
        raise _to_http(exc)

