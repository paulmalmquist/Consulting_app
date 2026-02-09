from fastapi import APIRouter, HTTPException
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

router = APIRouter(prefix="/api")

# ── Templates catalog ────────────────────────────────────────────────
TEMPLATES = {
    "starter": {
        "label": "Starter",
        "description": "Core business departments: Finance, Operations, HR",
        "departments": ["finance", "operations", "hr"],
        "capabilities": [
            "invoice_processing", "expense_review", "finance_documents", "finance_history",
            "quality_check", "vendor_onboarding", "ops_documents", "ops_history",
            "onboard_employee", "policy_review", "hr_documents", "hr_history",
        ],
    },
    "growth": {
        "label": "Growth",
        "description": "Starter + Sales and Marketing",
        "departments": ["finance", "operations", "hr", "sales", "marketing"],
        "capabilities": [
            "invoice_processing", "expense_review", "finance_documents", "finance_history",
            "quality_check", "vendor_onboarding", "ops_documents", "ops_history",
            "onboard_employee", "policy_review", "hr_documents", "hr_history",
            "proposal_gen", "contract_review", "sales_documents", "sales_history",
            "campaign_brief", "marketing_documents", "marketing_history",
        ],
    },
    "enterprise": {
        "label": "Enterprise",
        "description": "All departments and capabilities",
        "departments": ["finance", "operations", "hr", "sales", "legal", "it", "marketing"],
        "capabilities": "__all__",
    },
}


@router.get("/templates")
def list_templates():
    """Return available provisioning templates."""
    out = []
    for key, tmpl in TEMPLATES.items():
        out.append({
            "key": key,
            "label": tmpl["label"],
            "description": tmpl["description"],
            "departments": tmpl["departments"],
        })
    return out


@router.post("/businesses", response_model=CreateBusinessResponse)
def create_business(req: CreateBusinessRequest):
    with get_cursor() as cur:
        # Create a tenant first (single-tenant UX: one tenant per business)
        cur.execute(
            "INSERT INTO app.tenants (name) VALUES (%s) RETURNING tenant_id",
            (req.name,),
        )
        tenant_row = cur.fetchone()
        tenant_id = tenant_row["tenant_id"]

        cur.execute(
            """INSERT INTO app.businesses (tenant_id, name, slug, region)
               VALUES (%s, %s, %s, %s)
               RETURNING business_id, slug""",
            (tenant_id, req.name, req.slug, req.region),
        )
        row = cur.fetchone()
        return CreateBusinessResponse(business_id=row["business_id"], slug=row["slug"])


@router.post("/businesses/{business_id}/apply-template", response_model=OkResponse)
def apply_template(business_id: UUID, req: ApplyTemplateRequest):
    tmpl = TEMPLATES.get(req.template_key)
    if not tmpl:
        raise HTTPException(status_code=400, detail=f"Unknown template: {req.template_key}")

    dept_keys = req.enabled_departments or tmpl["departments"]
    cap_keys = req.enabled_capabilities

    with get_cursor() as cur:
        # Validate business exists
        cur.execute("SELECT 1 FROM app.businesses WHERE business_id = %s", (str(business_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Business not found")

        # Enable departments
        for dk in dept_keys:
            cur.execute("SELECT department_id FROM app.departments WHERE key = %s", (dk,))
            dept = cur.fetchone()
            if dept:
                cur.execute(
                    """INSERT INTO app.business_departments (business_id, department_id, enabled)
                       VALUES (%s, %s, true)
                       ON CONFLICT (business_id, department_id) DO UPDATE SET enabled = true""",
                    (str(business_id), str(dept["department_id"])),
                )

        # Enable capabilities
        if tmpl["capabilities"] == "__all__":
            # Enable all capabilities for enabled departments
            cur.execute(
                """INSERT INTO app.business_capabilities (business_id, capability_id, enabled)
                   SELECT %s, c.capability_id, true
                   FROM app.capabilities c
                   JOIN app.departments d ON d.department_id = c.department_id
                   WHERE d.key = ANY(%s)
                   ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true""",
                (str(business_id), dept_keys),
            )
        else:
            actual_cap_keys = cap_keys if cap_keys else tmpl.get("capabilities", [])
            if isinstance(actual_cap_keys, list):
                for ck in actual_cap_keys:
                    cur.execute("SELECT capability_id FROM app.capabilities WHERE key = %s", (ck,))
                    cap = cur.fetchone()
                    if cap:
                        cur.execute(
                            """INSERT INTO app.business_capabilities (business_id, capability_id, enabled)
                               VALUES (%s, %s, true)
                               ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true""",
                            (str(business_id), str(cap["capability_id"])),
                        )

    return OkResponse()


@router.post("/businesses/{business_id}/apply-custom", response_model=OkResponse)
def apply_custom(business_id: UUID, req: ApplyCustomRequest):
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM app.businesses WHERE business_id = %s", (str(business_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Business not found")

        for dk in req.enabled_departments:
            cur.execute("SELECT department_id FROM app.departments WHERE key = %s", (dk,))
            dept = cur.fetchone()
            if dept:
                cur.execute(
                    """INSERT INTO app.business_departments (business_id, department_id, enabled)
                       VALUES (%s, %s, true)
                       ON CONFLICT (business_id, department_id) DO UPDATE SET enabled = true""",
                    (str(business_id), str(dept["department_id"])),
                )

        for ck in req.enabled_capabilities:
            cur.execute("SELECT capability_id FROM app.capabilities WHERE key = %s", (ck,))
            cap = cur.fetchone()
            if cap:
                cur.execute(
                    """INSERT INTO app.business_capabilities (business_id, capability_id, enabled)
                       VALUES (%s, %s, true)
                       ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true""",
                    (str(business_id), str(cap["capability_id"])),
                )

    return OkResponse()


@router.get("/businesses/{business_id}/departments", response_model=list[DepartmentOut])
def get_business_departments(business_id: UUID):
    with get_cursor() as cur:
        cur.execute(
            """SELECT d.department_id, d.key, d.label, d.icon, d.sort_order,
                      bd.enabled, bd.sort_order_override
               FROM app.departments d
               JOIN app.business_departments bd ON bd.department_id = d.department_id
               WHERE bd.business_id = %s AND bd.enabled = true
               ORDER BY COALESCE(bd.sort_order_override, d.sort_order)""",
            (str(business_id),),
        )
        rows = cur.fetchall()
        return [DepartmentOut(**r) for r in rows]


@router.get("/businesses/{business_id}/departments/{dept_key}/capabilities", response_model=list[CapabilityOut])
def get_department_capabilities(business_id: UUID, dept_key: str):
    with get_cursor() as cur:
        cur.execute(
            """SELECT c.capability_id, c.department_id, d.key as department_key,
                      c.key, c.label, c.kind, c.sort_order, c.metadata_json,
                      bc.enabled, bc.sort_order_override
               FROM app.capabilities c
               JOIN app.departments d ON d.department_id = c.department_id
               JOIN app.business_capabilities bc ON bc.capability_id = c.capability_id
               WHERE bc.business_id = %s AND d.key = %s AND bc.enabled = true
               ORDER BY COALESCE(bc.sort_order_override, c.sort_order)""",
            (str(business_id), dept_key),
        )
        rows = cur.fetchall()
        return [CapabilityOut(**r) for r in rows]


@router.get("/departments")
def list_all_departments():
    """Return all departments in the catalog (for onboarding)."""
    with get_cursor() as cur:
        cur.execute("SELECT department_id, key, label, icon, sort_order FROM app.departments ORDER BY sort_order")
        return cur.fetchall()


@router.get("/departments/{dept_key}/capabilities")
def list_all_capabilities_for_dept(dept_key: str):
    """Return all capabilities for a department (for onboarding)."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT c.capability_id, c.department_id, d.key as department_key,
                      c.key, c.label, c.kind, c.sort_order, c.metadata_json
               FROM app.capabilities c
               JOIN app.departments d ON d.department_id = c.department_id
               WHERE d.key = %s
               ORDER BY c.sort_order""",
            (dept_key,),
        )
        return cur.fetchall()
