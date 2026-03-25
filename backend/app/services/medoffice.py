from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _q(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(value).quantize(Decimal("0.000000000001"))


def list_properties(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM medoffice_properties
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY created_at DESC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def create_property(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO medoffice_properties
            (env_id, business_id, property_name, market, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), payload["property_name"], payload.get("market"),
                payload.get("status") or "active", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def get_property(*, env_id: UUID, business_id: UUID, property_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM medoffice_properties
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND property_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(property_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Property not found")
        return row


def create_tenant(*, env_id: UUID, business_id: UUID, property_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO medoffice_tenants
            (env_id, business_id, property_id, legal_name, specialty, npi_number, license_status,
             coi_expiration_date, risk_level, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(property_id), payload["legal_name"], payload.get("specialty"),
                payload.get("npi_number"), payload.get("license_status"), payload.get("coi_expiration_date"),
                payload.get("risk_level") or "medium", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_lease(*, env_id: UUID, business_id: UUID, property_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO medoffice_leases
            (env_id, business_id, property_id, tenant_id, lease_number, start_date, end_date,
             monthly_base_rent, escalator_type, status, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(property_id), str(payload["tenant_id"]), payload["lease_number"],
                payload.get("start_date"), payload.get("end_date"), _q(payload.get("monthly_base_rent")), payload.get("escalator_type"),
                payload.get("status") or "active", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_compliance_item(*, env_id: UUID, business_id: UUID, property_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO medoffice_compliance_items
            (env_id, business_id, property_id, compliance_type, due_date, status, severity, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(property_id), payload["compliance_type"], payload.get("due_date"),
                payload.get("status") or "open", payload.get("severity") or "medium", payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def create_work_order(*, env_id: UUID, business_id: UUID, property_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO medoffice_work_orders
            (env_id, business_id, property_id, tenant_id, title, priority, status, due_date, created_by, updated_by)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(env_id), str(business_id), str(property_id), str(payload["tenant_id"]) if payload.get("tenant_id") else None,
                payload["title"], payload.get("priority") or "medium", payload.get("status") or "open", payload.get("due_date"),
                payload.get("created_by"), payload.get("created_by")
            ),
        )
        return cur.fetchone()


def seed_demo_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT property_id FROM medoffice_properties WHERE env_id = %s::uuid AND business_id = %s::uuid LIMIT 1",
            (str(env_id), str(business_id)),
        )
        existing = cur.fetchone()
        if existing:
            return {"seeded": False, "property_ids": [str(existing["property_id"])]}

    property_row = create_property(
        env_id=env_id,
        business_id=business_id,
        payload={
            "property_name": "Metro Medical Pavilion",
            "market": "Dallas, TX",
            "status": "active",
            "created_by": actor,
        },
    )
    property_id = UUID(str(property_row["property_id"]))

    tenant = create_tenant(
        env_id=env_id,
        business_id=business_id,
        property_id=property_id,
        payload={
            "legal_name": "Summit Cardiology Group",
            "specialty": "Cardiology",
            "npi_number": "1234567890",
            "license_status": "active",
            "coi_expiration_date": date.today(),
            "risk_level": "low",
            "created_by": actor,
        },
    )

    create_lease(
        env_id=env_id,
        business_id=business_id,
        property_id=property_id,
        payload={
            "tenant_id": tenant["tenant_id"],
            "lease_number": "MOB-301",
            "start_date": date.today(),
            "end_date": date(date.today().year + 7, 12, 31),
            "monthly_base_rent": Decimal("58250"),
            "escalator_type": "cpi",
            "status": "active",
            "created_by": actor,
        },
    )

    create_compliance_item(
        env_id=env_id,
        business_id=business_id,
        property_id=property_id,
        payload={
            "compliance_type": "Generator Load Test",
            "due_date": date.today(),
            "status": "open",
            "severity": "high",
            "created_by": actor,
        },
    )

    create_work_order(
        env_id=env_id,
        business_id=business_id,
        property_id=property_id,
        payload={
            "tenant_id": tenant["tenant_id"],
            "title": "HVAC balancing for Suite 210",
            "priority": "high",
            "status": "open",
            "due_date": date.today(),
            "created_by": actor,
        },
    )

    return {"seeded": True, "property_ids": [str(property_id)]}
