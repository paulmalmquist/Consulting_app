from fastapi import APIRouter, HTTPException
import time
from uuid import UUID
from app.db import get_cursor
from app.schemas.business import (
    CreateBusinessRequest,
    CreateBusinessResponse,
    ApplyTemplateRequest,
    ApplyCustomRequest,
    OkResponse,
    DepartmentOut,
    CapabilityOut,
)
from app.services import business as biz_svc
from app.services import audit as audit_svc

router = APIRouter(prefix="/api")


@router.get("/templates")
def list_templates():
    """Return available provisioning templates."""
    return biz_svc.list_templates()


@router.post("/businesses", response_model=CreateBusinessResponse)
def create_business(req: CreateBusinessRequest):
    start = time.monotonic()
    result = biz_svc.create_business(req.name, req.slug, req.region)
    ms = int((time.monotonic() - start) * 1000)
    audit_svc.record_event(
        actor="api_user", action="create_business", tool_name="bm.create_business",
        success=True, latency_ms=ms, business_id=result["business_id"],
        object_type="business", object_id=result["business_id"],
        input_data={"name": req.name, "slug": req.slug},
    )
    return CreateBusinessResponse(business_id=result["business_id"], slug=result["slug"])


@router.post("/businesses/{business_id}/apply-template", response_model=OkResponse)
def apply_template(business_id: UUID, req: ApplyTemplateRequest):
    start = time.monotonic()
    try:
        biz_svc.apply_template(
            business_id, req.template_key, req.enabled_departments, req.enabled_capabilities
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    ms = int((time.monotonic() - start) * 1000)
    audit_svc.record_event(
        actor="api_user", action="apply_template", tool_name="bm.apply_template",
        success=True, latency_ms=ms, business_id=business_id,
        object_type="business", object_id=business_id,
        input_data={"template_key": req.template_key},
    )
    return OkResponse()


@router.post("/businesses/{business_id}/apply-custom", response_model=OkResponse)
def apply_custom(business_id: UUID, req: ApplyCustomRequest):
    start = time.monotonic()
    try:
        biz_svc.apply_custom(business_id, req.enabled_departments, req.enabled_capabilities)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    ms = int((time.monotonic() - start) * 1000)
    audit_svc.record_event(
        actor="api_user", action="apply_custom", tool_name="bm.apply_custom",
        success=True, latency_ms=ms, business_id=business_id,
        object_type="business", object_id=business_id,
        input_data={"departments": req.enabled_departments, "capabilities": req.enabled_capabilities},
    )
    return OkResponse()


@router.get("/businesses/{business_id}/departments", response_model=list[DepartmentOut])
def get_business_departments(business_id: UUID):
    rows = biz_svc.list_departments(business_id)
    return [DepartmentOut(**r) for r in rows]


@router.get("/businesses/{business_id}/departments/{dept_key}/capabilities", response_model=list[CapabilityOut])
def get_department_capabilities(business_id: UUID, dept_key: str):
    rows = biz_svc.list_capabilities(business_id, dept_key)
    return [CapabilityOut(**r) for r in rows]


@router.get("/departments")
def list_all_departments():
    """Return all departments in the catalog (for onboarding)."""
    return biz_svc.list_all_departments()


@router.get("/departments/{dept_key}/capabilities")
def list_all_capabilities_for_dept(dept_key: str):
    """Return all capabilities for a department (for onboarding)."""
    return biz_svc.list_all_capabilities_for_dept(dept_key)
