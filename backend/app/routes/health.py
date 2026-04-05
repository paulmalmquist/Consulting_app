from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.observability.deploy_state import get_deploy_state, is_ready

router = APIRouter()


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/health/live")
def health_live():
    return {"status": "alive"}


@router.get("/health/ready")
def health_ready():
    state = get_deploy_state()
    if state is None:
        return JSONResponse(
            status_code=503,
            content={"ready": False, "reason": "startup_in_progress"},
        )
    payload = state.to_dict()
    if is_ready():
        return payload
    return JSONResponse(status_code=503, content=payload)
