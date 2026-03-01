from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query

from app.schemas.re_sustainability import (
    SusAssetDashboardResponse,
    SusAssetProfile,
    SusAssetProfileInput,
    SusCertification,
    SusCertificationInput,
    SusEmissionFactorSet,
    SusEmissionFactorSetInput,
    SusOverviewResponse,
    SusPortfolioFootprintResponse,
    SusProjectionResponse,
    SusRegulatoryExposure,
    SusRegulatoryExposureInput,
    SusReportPayload,
    SusScenarioRunRequest,
    SusScenarioRunResponse,
    SusUtilityAccount,
    SusUtilityAccountInput,
    SusUtilityImportRequest,
    SusUtilityImportResult,
    SusUtilityMonthly,
    SusUtilityMonthlyInput,
)
from app.services import (
    re_sustainability,
    re_sustainability_ingestion,
    re_sustainability_projection,
    re_sustainability_reporting,
)


router = APIRouter(prefix="/api/re/v2/sustainability", tags=["re-v2-sustainability"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, psycopg.errors.UndefinedTable):
        return HTTPException(
            503,
            {"error_code": "SCHEMA_NOT_MIGRATED", "message": "Sustainability schema not migrated.", "detail": "Run migration 287/288."},
        )
    if isinstance(exc, LookupError):
        return HTTPException(404, {"error_code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    return HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": str(exc)})


@router.get("/overview", response_model=SusOverviewResponse)
def get_overview(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    quarter: str = Query(...),
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_sustainability.get_overview(
            env_id=env_id,
            business_id=business_id,
            quarter=quarter,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/portfolio-footprint", response_model=SusPortfolioFootprintResponse)
def get_fund_portfolio_footprint(
    fund_id: UUID,
    year: int = Query(...),
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_sustainability.get_fund_portfolio_footprint(
            fund_id=fund_id,
            year=year,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/investments/{investment_id}/footprint", response_model=SusPortfolioFootprintResponse)
def get_investment_footprint(
    investment_id: UUID,
    year: int = Query(...),
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_sustainability.get_investment_footprint(
            investment_id=investment_id,
            year=year,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/assets/{asset_id}/dashboard", response_model=SusAssetDashboardResponse)
def get_asset_dashboard(
    asset_id: UUID,
    year: int | None = Query(None),
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_sustainability.get_asset_dashboard(
            asset_id=asset_id,
            year=year,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/assets/{asset_id}/profile", response_model=SusAssetProfile)
def get_asset_profile(asset_id: UUID):
    try:
        return re_sustainability.get_asset_profile(asset_id=asset_id)
    except Exception as exc:
        raise _to_http(exc)


@router.put("/assets/{asset_id}/profile", response_model=SusAssetProfile)
def update_asset_profile(asset_id: UUID, body: SusAssetProfileInput):
    try:
        return re_sustainability.upsert_asset_profile(asset_id=asset_id, payload=body.model_dump())
    except Exception as exc:
        raise _to_http(exc)


@router.get("/assets/{asset_id}/utility-accounts", response_model=list[SusUtilityAccount])
def list_utility_accounts(asset_id: UUID):
    try:
        return re_sustainability.list_utility_accounts(asset_id=asset_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/assets/{asset_id}/utility-accounts", response_model=SusUtilityAccount, status_code=201)
def create_utility_account(asset_id: UUID, body: SusUtilityAccountInput):
    try:
        return re_sustainability.create_utility_account(asset_id=asset_id, payload=body.model_dump())
    except Exception as exc:
        raise _to_http(exc)


@router.get("/assets/{asset_id}/utility-monthly", response_model=list[SusUtilityMonthly])
def list_utility_monthly(asset_id: UUID):
    try:
        return re_sustainability.list_utility_monthly(asset_id=asset_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/assets/{asset_id}/utility-monthly", response_model=SusUtilityMonthly, status_code=201)
def upsert_utility_monthly(asset_id: UUID, body: SusUtilityMonthlyInput):
    try:
        return re_sustainability.upsert_utility_monthly(asset_id=asset_id, payload=body.model_dump())
    except Exception as exc:
        raise _to_http(exc)


@router.post("/utility-monthly/import", response_model=SusUtilityImportResult)
def import_utility_monthly(body: SusUtilityImportRequest):
    try:
        return re_sustainability_ingestion.import_utility_csv(
            env_id=body.env_id,
            business_id=body.business_id,
            filename=body.filename,
            csv_text=body.csv_text,
            import_mode=body.import_mode,
            created_by=body.created_by,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/assets/{asset_id}/certifications", response_model=list[SusCertification])
def list_certifications(asset_id: UUID):
    try:
        return re_sustainability.list_certifications(asset_id=asset_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/assets/{asset_id}/certifications", response_model=SusCertification, status_code=201)
def create_certification(asset_id: UUID, body: SusCertificationInput):
    try:
        return re_sustainability.create_certification(asset_id=asset_id, payload=body.model_dump())
    except Exception as exc:
        raise _to_http(exc)


@router.get("/assets/{asset_id}/regulatory-exposure", response_model=list[SusRegulatoryExposure])
def list_regulatory_exposure(asset_id: UUID):
    try:
        return re_sustainability.list_regulatory_exposure(asset_id=asset_id)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/assets/{asset_id}/regulatory-exposure", response_model=SusRegulatoryExposure, status_code=201)
def create_regulatory_exposure(asset_id: UUID, body: SusRegulatoryExposureInput):
    try:
        return re_sustainability.create_regulatory_exposure(asset_id=asset_id, payload=body.model_dump())
    except Exception as exc:
        raise _to_http(exc)


@router.get("/emission-factor-sets", response_model=list[SusEmissionFactorSet])
def list_emission_factor_sets():
    try:
        return re_sustainability.list_emission_factor_sets()
    except Exception as exc:
        raise _to_http(exc)


@router.post("/emission-factor-sets", response_model=SusEmissionFactorSet, status_code=201)
def create_emission_factor_set(body: SusEmissionFactorSetInput):
    try:
        return re_sustainability.create_emission_factor_set(payload=body.model_dump())
    except Exception as exc:
        raise _to_http(exc)


@router.post("/scenarios/run", response_model=SusScenarioRunResponse)
def run_sustainability_projection(body: SusScenarioRunRequest):
    try:
        return re_sustainability_projection.run_projection(
            fund_id=body.fund_id,
            scenario_id=body.scenario_id,
            base_quarter=body.base_quarter,
            horizon_years=body.horizon_years,
            projection_mode=body.projection_mode,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/scenarios/{projection_run_id}", response_model=SusProjectionResponse)
def get_projection(projection_run_id: UUID):
    try:
        return re_sustainability_projection.get_projection(projection_run_id=projection_run_id)
    except Exception as exc:
        raise _to_http(exc)


@router.get("/funds/{fund_id}/reports/{report_key}", response_model=SusReportPayload)
def get_report_payload(
    fund_id: UUID,
    report_key: str,
    scenario_id: UUID | None = Query(None),
):
    try:
        return re_sustainability_reporting.build_report_payload(
            fund_id=fund_id,
            report_key=report_key,
            scenario_id=scenario_id,
        )
    except Exception as exc:
        raise _to_http(exc)
