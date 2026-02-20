from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class CreateBusinessRequest(BaseModel):
    name: str
    slug: str
    region: str = "us"


class CreateBusinessResponse(BaseModel):
    business_id: UUID
    slug: str


class BusinessOut(BaseModel):
    business_id: UUID
    tenant_id: UUID
    name: str
    slug: str
    region: str
    created_at: str | None = None


class ApplyTemplateRequest(BaseModel):
    template_key: str
    enabled_departments: Optional[list[str]] = None  # department keys
    enabled_capabilities: Optional[list[str]] = None  # capability keys


class ApplyCustomRequest(BaseModel):
    enabled_departments: list[str]  # department keys
    enabled_capabilities: list[str]  # capability keys


class OkResponse(BaseModel):
    ok: bool = True


class DepartmentOut(BaseModel):
    department_id: UUID
    key: str
    label: str
    icon: str
    sort_order: int
    enabled: bool = True
    sort_order_override: Optional[int] = None


class CapabilityOut(BaseModel):
    capability_id: UUID
    department_id: UUID
    department_key: str
    key: str
    label: str
    kind: str
    sort_order: int
    metadata_json: dict = {}
    enabled: bool = True
    sort_order_override: Optional[int] = None
