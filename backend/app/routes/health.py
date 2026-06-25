import os
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.observability.deploy_state import get_deploy_state, is_ready

router = APIRouter()


def _read_deployed_git_sha() -> str | None:
    """Return the git SHA captured at deploy time, or None if not available.

    Resolution order:
      1. Environment variable ``GIT_SHA`` (set explicitly by the deploy ritual
         or by Railway when source-connected).
      2. ``app/_git_sha.txt`` file written by ``scripts/deploy_backend.sh``
         before ``railway up``. The file lives inside ``app/`` so the
         Dockerfile's ``COPY app ./app`` carries it into the image; a sibling
         file at ``backend/.git_sha`` would not enter the build context.
    """
    env_sha = os.environ.get("GIT_SHA")
    if env_sha:
        return env_sha.strip() or None
    try:
        sha_file = Path(__file__).resolve().parent.parent / "_git_sha.txt"
        if sha_file.is_file():
            text = sha_file.read_text(encoding="utf-8").strip()
            return text or None
    except Exception:
        return None
    return None


_DEPLOYED_GIT_SHA = _read_deployed_git_sha()


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


@router.get("/healthz")
def healthz():
    return {"status": "ok", "version": _DEPLOYED_GIT_SHA}


@router.get("/version")
def version():
    """Return the git SHA the running container was built from.

    Returns ``{"git_sha": null}`` when no SHA was captured at deploy time.
    Used to confirm a deploy actually shipped the commit you intended.
    """
    return {"git_sha": _DEPLOYED_GIT_SHA}
