"""CRE Work Package API routes."""
from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import cre_work_packages

router = APIRouter(prefix="/api/re/v2/work-packages", tags=["cre-work-packages"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, psycopg.errors.UndefinedTable):
        return HTTPException(503, {"error_code": "SCHEMA_NOT_MIGRATED", "message": "Work package schema not migrated."})
    if isinstance(exc, LookupError):
        return HTTPException(404, {"error_code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    return HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": str(exc)})


class WorkPackageRunRequest(BaseModel):
    env_id: UUID
    business_id: UUID
    inputs: dict = Field(default_factory=dict)
    created_by: str = Field(min_length=2, max_length=200)


@router.get("/")
def list_work_packages(category: str | None = Query(None)):
    """List available work packages."""
    try:
        return cre_work_packages.list_packages(category=category)
    except Exception as exc:
        raise _to_http(exc)


@router.post("/{package_key}/run", status_code=201)
def run_work_package(package_key: str, body: WorkPackageRunRequest):
    """Execute a work package."""
    try:
        return cre_work_packages.execute_work_package(
            package_key=package_key,
            env_id=body.env_id,
            business_id=body.business_id,
            inputs=body.inputs,
            created_by=body.created_by,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/runs/{run_id}")
def get_work_package_run(run_id: UUID):
    """Get a work package run status."""
    try:
        return cre_work_packages.get_run(run_id=run_id)
    except Exception as exc:
        raise _to_http(exc)
