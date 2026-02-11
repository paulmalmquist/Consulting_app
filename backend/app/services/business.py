"""Business service — single source of truth for business operations."""

import json
from uuid import UUID

from app.db import get_cursor

# Default catalog used when templates table is unavailable (e.g., tests/local bootstrap).
_DEFAULT_TEMPLATES: list[dict] = [
    {
        "key": "starter",
        "label": "Starter",
        "description": "Core business departments: Finance, Operations, HR",
        "departments": ["finance", "operations", "hr"],
        "capabilities": [
            "invoice_processing",
            "expense_review",
            "finance_documents",
            "finance_history",
            "quality_check",
            "vendor_onboarding",
            "ops_documents",
            "ops_history",
            "onboard_employee",
            "policy_review",
            "hr_documents",
            "hr_history",
        ],
    },
    {
        "key": "growth",
        "label": "Growth",
        "description": "Starter + Sales and Marketing",
        "departments": ["finance", "operations", "hr", "sales", "marketing"],
        "capabilities": [
            "invoice_processing",
            "expense_review",
            "finance_documents",
            "finance_history",
            "quality_check",
            "vendor_onboarding",
            "ops_documents",
            "ops_history",
            "onboard_employee",
            "policy_review",
            "hr_documents",
            "hr_history",
            "proposal_gen",
            "contract_review",
            "sales_documents",
            "sales_history",
            "campaign_brief",
            "marketing_documents",
            "marketing_history",
        ],
    },
    {
        "key": "enterprise",
        "label": "Enterprise",
        "description": "All departments and capabilities",
        "departments": ["finance", "operations", "hr", "sales", "legal", "it", "marketing"],
        "capabilities": "__all__",
    },
]
_DEFAULT_TEMPLATE_BY_KEY = {t["key"]: t for t in _DEFAULT_TEMPLATES}


def _coerce_json(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _normalize_template_row(row: dict) -> dict:
    departments = _coerce_json(row.get("departments", []))
    capabilities = _coerce_json(row.get("capabilities", []))
    if not isinstance(departments, list):
        departments = []
    if capabilities != "__all__" and not isinstance(capabilities, list):
        capabilities = []
    return {
        "key": row.get("key"),
        "label": row.get("label"),
        "description": row.get("description", ""),
        "departments": departments,
        "capabilities": capabilities,
    }


def list_templates() -> list[dict]:
    """Return available provisioning templates."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT key, label, description, departments, capabilities
                   FROM app.templates
                   ORDER BY key"""
            )
            rows = cur.fetchall()
            if rows:
                return [_normalize_template_row(r) for r in rows]
    except Exception:
        # Fall back to default templates when DB is unavailable or table is missing.
        pass
    return [dict(t) for t in _DEFAULT_TEMPLATES]


def _get_template(template_key: str) -> dict | None:
    """Fetch a single template by key, including capabilities."""
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT key, label, description, departments, capabilities FROM app.templates WHERE key = %s",
                (template_key,),
            )
            row = cur.fetchone()
            if row:
                return _normalize_template_row(row)
    except Exception:
        pass
    fallback = _DEFAULT_TEMPLATE_BY_KEY.get(template_key)
    return dict(fallback) if fallback else None


def create_business(name: str, slug: str, region: str = "us") -> dict:
    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO app.tenants (name) VALUES (%s) RETURNING tenant_id",
            (name,),
        )
        tenant_row = cur.fetchone()
        tenant_id = tenant_row["tenant_id"]

        cur.execute(
            """INSERT INTO app.businesses (tenant_id, name, slug, region)
               VALUES (%s, %s, %s, %s)
               RETURNING business_id, slug""",
            (tenant_id, name, slug, region),
        )
        row = cur.fetchone()
        return {"business_id": row["business_id"], "slug": row["slug"]}


def get_business(business_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT business_id, tenant_id, name, slug, region, created_at FROM app.businesses WHERE business_id = %s",
            (str(business_id),),
        )
        return cur.fetchone()


def apply_template(
    business_id: UUID,
    template_key: str,
    enabled_departments: list[str] | None = None,
    enabled_capabilities: list[str] | None = None,
) -> None:
    tmpl = _get_template(template_key)
    if not tmpl:
        raise ValueError(f"Unknown template: {template_key}")

    dept_keys = enabled_departments or tmpl["departments"]
    cap_keys = enabled_capabilities
    tmpl_capabilities = tmpl["capabilities"]

    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM app.businesses WHERE business_id = %s", (str(business_id),))
        if not cur.fetchone():
            raise LookupError("Business not found")

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

        if tmpl_capabilities == "__all__":
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
            actual_cap_keys = cap_keys if cap_keys else (tmpl_capabilities if isinstance(tmpl_capabilities, list) else [])
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


def apply_custom(
    business_id: UUID,
    enabled_departments: list[str],
    enabled_capabilities: list[str],
) -> None:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM app.businesses WHERE business_id = %s", (str(business_id),))
        if not cur.fetchone():
            raise LookupError("Business not found")

        for dk in enabled_departments:
            cur.execute("SELECT department_id FROM app.departments WHERE key = %s", (dk,))
            dept = cur.fetchone()
            if dept:
                cur.execute(
                    """INSERT INTO app.business_departments (business_id, department_id, enabled)
                       VALUES (%s, %s, true)
                       ON CONFLICT (business_id, department_id) DO UPDATE SET enabled = true""",
                    (str(business_id), str(dept["department_id"])),
                )

        for ck in enabled_capabilities:
            cur.execute("SELECT capability_id FROM app.capabilities WHERE key = %s", (ck,))
            cap = cur.fetchone()
            if cap:
                cur.execute(
                    """INSERT INTO app.business_capabilities (business_id, capability_id, enabled)
                       VALUES (%s, %s, true)
                       ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true""",
                    (str(business_id), str(cap["capability_id"])),
                )


def list_departments(business_id: UUID) -> list[dict]:
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
        return cur.fetchall()


def list_capabilities(business_id: UUID, dept_key: str) -> list[dict]:
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
        return cur.fetchall()


def list_all_departments() -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT department_id, key, label, icon, sort_order FROM app.departments ORDER BY sort_order"
        )
        return cur.fetchall()


def list_all_capabilities_for_dept(dept_key: str) -> list[dict]:
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
