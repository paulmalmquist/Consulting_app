"""Underwriting / forecast link endpoints + model lock."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.observability.logger import emit_log
from app.schemas.re_institutional import ReModelOut, ReUwLinkOut, ReUwLinkRequest
from app.services import re_model, re_uw_vs_actual

router = APIRouter(prefix="/api/re/v2", tags=["re-uw-links"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


def _log(action: str, msg: str, **ctx):
    emit_log(level="info", service="backend", action=action, message=msg, context=ctx)


# ── Lock Model ───────────────────────────────────────────────────────────────

@router.post("/models/{model_id}/lock", response_model=ReModelOut)
def lock_model(model_id: UUID):
    try:
        row = re_model.lock_model(model_id=model_id)
        _log("re.model.locked", f"Model {model_id} locked")
        return row
    except Exception as exc:
        raise _to_http(exc)


# ── Underwriting Link ────────────────────────────────────────────────────────

@router.post("/investments/{investment_id}/underwriting-link", response_model=ReUwLinkOut, status_code=201)
def create_underwriting_link(investment_id: UUID, body: ReUwLinkRequest):
    try:
        row = re_uw_vs_actual.link_underwriting(
            investment_id=investment_id, model_id=body.model_id,
        )
        _log("re.uw.linked", f"Underwriting linked for investment {investment_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/investments/{investment_id}/underwriting-link", response_model=ReUwLinkOut)
def get_underwriting_link(investment_id: UUID):
    row = re_uw_vs_actual.get_underwriting_link(investment_id=investment_id)
    if not row:
        raise HTTPException(status_code=404, detail="No underwriting link found")
    return row


@router.delete("/investments/{investment_id}/underwriting-link", status_code=204)
def delete_underwriting_link(investment_id: UUID):
    re_uw_vs_actual.remove_underwriting_link(investment_id=investment_id)
    return JSONResponse(status_code=204, content=None)


# ── Forecast Link ────────────────────────────────────────────────────────────

@router.post("/investments/{investment_id}/forecast-link", response_model=ReUwLinkOut, status_code=201)
def create_forecast_link(investment_id: UUID, body: ReUwLinkRequest):
    try:
        row = re_uw_vs_actual.link_forecast(
            investment_id=investment_id, model_id=body.model_id,
        )
        _log("re.fc.linked", f"Forecast linked for investment {investment_id}")
        return row
    except Exception as exc:
        raise _to_http(exc)


@router.get("/investments/{investment_id}/forecast-link", response_model=ReUwLinkOut)
def get_forecast_link(investment_id: UUID):
    row = re_uw_vs_actual.get_forecast_link(investment_id=investment_id)
    if not row:
        raise HTTPException(status_code=404, detail="No forecast link found")
    return row


@router.delete("/investments/{investment_id}/forecast-link", status_code=204)
def delete_forecast_link(investment_id: UUID):
    re_uw_vs_actual.remove_forecast_link(investment_id=investment_id)
    return JSONResponse(status_code=204, content=None)
