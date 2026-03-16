"""PDS Advanced Analytics endpoints — project health, EVM, portfolio health, CLV, predict delay."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.services import pds_advanced_analytics as svc

router = APIRouter(prefix="/api/pds/v2/analytics", tags=["pds-v2-analytics"])


@router.get("/project-health/{project_id}")
def project_health(
    request: Request,
    project_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_project_health(
            env_id=env_id, business_id=str(business_id), project_id=str(project_id),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.analytics.project_health.failed", context={})


@router.get("/evm/{project_id}")
def evm(
    request: Request,
    project_id: UUID,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_evm(
            env_id=env_id, business_id=str(business_id), project_id=str(project_id),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.analytics.evm.failed", context={})


@router.get("/portfolio-health")
def portfolio_health(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_portfolio_health(env_id=env_id, business_id=str(business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.analytics.portfolio_health.failed", context={})


class PredictDelayRequest(BaseModel):
    project_id: str
    env_id: str
    business_id: str


@router.post("/predict-delay")
async def predict_delay(request: Request, req: PredictDelayRequest):
    """OpenAI-assisted delay prediction for a project."""
    try:
        health = svc.get_project_health(
            env_id=req.env_id, business_id=req.business_id, project_id=req.project_id,
        )
        evm_data = svc.get_evm(
            env_id=req.env_id, business_id=req.business_id, project_id=req.project_id,
        )

        from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL_STANDARD
        from app.services.model_registry import sanitize_params
        import openai
        import json

        if not OPENAI_API_KEY:
            return {"error": "OpenAI API key not configured"}

        client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

        prompt = f"""Analyze this project and predict delay risk.

Project Health: {json.dumps(health, default=str)}
EVM Metrics: CPI={evm_data.get('cpi')}, SPI={evm_data.get('spi')}, EAC={evm_data.get('eac')}, BAC={evm_data.get('bac')}

Return JSON with:
- probability_of_delay (0-100)
- likely_delay_days (integer)
- top_risk_factors (ranked list of strings)
- recommended_actions (list of strings)
"""
        create_kwargs = sanitize_params(
            OPENAI_CHAT_MODEL_STANDARD,
            messages=[
                {"role": "system", "content": "You are a construction project risk analyst. Return valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=512,
            temperature=0,
        )
        response = await client.chat.completions.create(**create_kwargs)
        content = (response.choices[0].message.content or "{}").strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        prediction = json.loads(content)
        return {
            "project_id": req.project_id,
            "health_score": health.get("composite_score"),
            "prediction": prediction,
        }

    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.analytics.predict_delay.failed", context={})


@router.get("/client-lifetime-value")
def client_lifetime_value(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID = Query(...),
):
    try:
        return svc.get_client_lifetime_value(env_id=env_id, business_id=str(business_id))
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="pds.analytics.clv.failed", context={})
