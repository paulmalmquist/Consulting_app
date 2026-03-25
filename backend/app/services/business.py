"""Business service — single source of truth for business operations."""

from uuid import UUID
from typing import Optional

from app.db import get_cursor

# Maps industry_type values to template keys
INDUSTRY_TYPE_TO_TEMPLATE_KEY: dict[str, str] = {
    "repe": "real_estate_pe",
    "real_estate_pe": "real_estate_pe",
    "real_estate": "real_estate_pe",
    "floyorker": "digital_media",
    "digital_media": "digital_media",
    "website": "digital_media",
    "pds_command": "pds_command",
    "credit_risk_hub": "credit_risk_hub",
    "legal_ops_command": "legal_ops_command",
    "medical_office_backoffice": "medical_office_backoffice",
    "pds": "pds_command",
    "credit": "credit_risk_hub",
    "legal": "legal_ops_command",
    "medical": "medical_office_backoffice",
    "consulting": "consulting",
    "consulting_revenue_os": "consulting",
}


def list_templates() -> list[dict]:
    """Return available provisioning templates from the database."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT key, label, description, departments
               FROM app.templates
               ORDER BY key"""
        )
        return cur.fetchall()


def _get_template(template_key: str) -> dict | None:
    """Fetch a single template by key, including capabilities."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT key, label, description, departments, capabilities FROM app.templates WHERE key = %s",
            (template_key,),
        )
        return cur.fetchone()


def create_business(name: str, slug: str, region: str = "us") -> dict:
    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO app.tenants (name) VALUES (%s) RETURNING tenant_id",
            (name,),
        )
        tenant_row = cur.fetchone()
        tenant_id = tenant_row["tenant_id"]

        base_slug = slug
        for attempt in range(0, 20):
            candidate = base_slug if attempt == 0 else f"{base_slug}-{attempt + 1}"
            cur.execute(
                """INSERT INTO app.businesses (tenant_id, name, slug, region)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (slug) DO NOTHING
                   RETURNING business_id, slug""",
                (tenant_id, name, candidate, region),
            )
            row = cur.fetchone()
            if row:
                canonical_tenant_slug = f"{candidate}-{str(tenant_id)[:8]}"
                cur.execute(
                    """INSERT INTO tenant (tenant_id, name, slug)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (tenant_id) DO NOTHING""",
                    (tenant_id, name, canonical_tenant_slug),
                )
                cur.execute(
                    """INSERT INTO business (business_id, tenant_id, name, slug, region)
                       VALUES (%s, %s, %s, %s, %s)
                       ON CONFLICT (business_id) DO NOTHING""",
                    (row["business_id"], tenant_id, name, candidate, region),
                )
                cur.execute(
                    """INSERT INTO fin_partition (
                         tenant_id, business_id, key, partition_type, is_read_only, status
                       )
                       SELECT %s, %s, 'live', 'live', false, 'active'
                       WHERE NOT EXISTS (
                         SELECT 1
                         FROM fin_partition
                         WHERE tenant_id = %s
                           AND business_id = %s
                           AND partition_type = 'live'
                           AND status = 'active'
                       )""",
                    (
                        tenant_id,
                        row["business_id"],
                        tenant_id,
                        row["business_id"],
                    ),
                )
                return {"business_id": row["business_id"], "slug": row["slug"]}
        raise ValueError("Could not allocate a unique business slug")


def list_businesses() -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT business_id, tenant_id, name, slug, region, created_at
               FROM app.businesses
               ORDER BY created_at ASC"""
        )
        return cur.fetchall()


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
    environment_id: Optional[UUID] = None,
) -> None:
    tmpl = _get_template(template_key)
    if not tmpl:
        raise ValueError(f"Unknown template: {template_key}")

    dept_keys = enabled_departments or tmpl["departments"]
    cap_keys = enabled_capabilities
    tmpl_capabilities = tmpl["capabilities"]
    env_id_str = str(environment_id) if environment_id else None

    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM app.businesses WHERE business_id = %s", (str(business_id),))
        if not cur.fetchone():
            raise LookupError("Business not found")

        for dk in dept_keys:
            cur.execute("SELECT department_id FROM app.departments WHERE key = %s", (dk,))
            dept = cur.fetchone()
            if dept:
                cur.execute(
                    """INSERT INTO app.business_departments (business_id, department_id, enabled, environment_id)
                       VALUES (%s, %s, true, %s)
                       ON CONFLICT (business_id, department_id) DO UPDATE SET enabled = true""",
                    (str(business_id), str(dept["department_id"]), env_id_str),
                )

        if tmpl_capabilities == "__all__":
            cur.execute(
                """INSERT INTO app.business_capabilities (business_id, capability_id, enabled, environment_id)
                   SELECT %s, c.capability_id, true, %s
                   FROM app.capabilities c
                   JOIN app.departments d ON d.department_id = c.department_id
                   WHERE d.key = ANY(%s)
                   ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true""",
                (str(business_id), env_id_str, dept_keys),
            )
        else:
            actual_cap_keys = cap_keys if cap_keys else (tmpl_capabilities if isinstance(tmpl_capabilities, list) else [])
            if isinstance(actual_cap_keys, list):
                for ck in actual_cap_keys:
                    cur.execute("SELECT capability_id FROM app.capabilities WHERE key = %s", (ck,))
                    cap = cur.fetchone()
                    if cap:
                        cur.execute(
                            """INSERT INTO app.business_capabilities (business_id, capability_id, enabled, environment_id)
                               VALUES (%s, %s, true, %s)
                               ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true""",
                            (str(business_id), str(cap["capability_id"]), env_id_str),
                        )

        # Capture expected template shape for downstream drift reporting.
        effective_cap_keys: list[str]
        if tmpl_capabilities == "__all__":
            cur.execute(
                """SELECT c.key
                   FROM app.capabilities c
                   JOIN app.departments d ON d.department_id = c.department_id
                   WHERE d.key = ANY(%s)
                   ORDER BY c.key""",
                (dept_keys,),
            )
            effective_cap_keys = [row["key"] for row in cur.fetchall()]
        else:
            effective_cap_keys = cap_keys if cap_keys else (
                tmpl_capabilities if isinstance(tmpl_capabilities, list) else []
            )

        cur.execute(
            """INSERT INTO app.business_template_snapshot
                 (business_id, template_key, expected_departments, expected_capabilities, captured_at, updated_at)
               VALUES (%s, %s, %s, %s, now(), now())
               ON CONFLICT (business_id) DO UPDATE
                 SET template_key = EXCLUDED.template_key,
                     expected_departments = EXCLUDED.expected_departments,
                     expected_capabilities = EXCLUDED.expected_capabilities,
                     updated_at = now()""",
            (str(business_id), template_key, dept_keys, effective_cap_keys),
        )


def apply_industry_template(
    business_id: UUID,
    industry_type: str | None,
    environment_id: Optional[UUID] = None,
) -> str | None:
    """Resolve industry_type to a template key and apply it.
    Passes environment_id so department rows are environment-scoped."""
    if not industry_type:
        return None
    template_key = INDUSTRY_TYPE_TO_TEMPLATE_KEY.get(industry_type.lower())
    if not template_key:
        return None
    apply_template(business_id, template_key, environment_id=environment_id)
    return template_key


def apply_custom(
    business_id: UUID,
    enabled_departments: list[str],
    enabled_capabilities: list[str],
    environment_id: Optional[UUID] = None,
) -> None:
    env_id_str = str(environment_id) if environment_id else None
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM app.businesses WHERE business_id = %s", (str(business_id),))
        if not cur.fetchone():
            raise LookupError("Business not found")

        for dk in enabled_departments:
            cur.execute("SELECT department_id FROM app.departments WHERE key = %s", (dk,))
            dept = cur.fetchone()
            if dept:
                cur.execute(
                    """INSERT INTO app.business_departments (business_id, department_id, enabled, environment_id)
                       VALUES (%s, %s, true, %s)
                       ON CONFLICT (business_id, department_id) DO UPDATE SET enabled = true""",
                    (str(business_id), str(dept["department_id"]), env_id_str),
                )

        for ck in enabled_capabilities:
            cur.execute("SELECT capability_id FROM app.capabilities WHERE key = %s", (ck,))
            cap = cur.fetchone()
            if cap:
                cur.execute(
                    """INSERT INTO app.business_capabilities (business_id, capability_id, enabled, environment_id)
                       VALUES (%s, %s, true, %s)
                       ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true""",
                    (str(business_id), str(cap["capability_id"]), env_id_str),
                )


def list_departments(business_id: UUID, environment_id: Optional[UUID] = None) -> list[dict]:
    with get_cursor() as cur:
        if environment_id:
            cur.execute(
                """SELECT d.department_id, d.key, d.label, d.icon, d.sort_order,
                          bd.enabled, bd.sort_order_override
                   FROM app.departments d
                   JOIN app.business_departments bd ON bd.department_id = d.department_id
                   WHERE bd.business_id = %s AND bd.environment_id = %s AND bd.enabled = true
                   ORDER BY COALESCE(bd.sort_order_override, d.sort_order)""",
                (str(business_id), str(environment_id)),
            )
        else:
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


def list_capabilities(business_id: UUID, dept_key: str, environment_id: Optional[UUID] = None) -> list[dict]:
    with get_cursor() as cur:
        if environment_id:
            cur.execute(
                """SELECT c.capability_id, c.department_id, d.key as department_key,
                          c.key, c.label, c.kind, c.sort_order, c.metadata_json,
                          bc.enabled, bc.sort_order_override
                   FROM app.capabilities c
                   JOIN app.departments d ON d.department_id = c.department_id
                   JOIN app.business_capabilities bc ON bc.capability_id = c.capability_id
                   WHERE bc.business_id = %s AND d.key = %s AND bc.enabled = true
                     AND bc.environment_id = %s
                   ORDER BY COALESCE(bc.sort_order_override, c.sort_order)""",
                (str(business_id), dept_key, str(environment_id)),
            )
        else:
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
