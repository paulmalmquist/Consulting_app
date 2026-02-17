"""Tests for /api/businesses endpoints (mocked DB)."""

from uuid import uuid4


def test_create_business(client, fake_cursor):
    tenant_id = str(uuid4())
    business_id = str(uuid4())

    # Mock: INSERT tenant RETURNING tenant_id
    fake_cursor.push_result([{"tenant_id": tenant_id}])
    # Mock: INSERT business RETURNING business_id, slug
    fake_cursor.push_result([{"business_id": business_id, "slug": "acme-co"}])

    resp = client.post("/api/businesses", json={
        "name": "Acme Co",
        "slug": "acme-co",
        "region": "us",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["business_id"] == business_id
    assert data["slug"] == "acme-co"

    # Verify the queries were made (business create + audit event)
    assert len(fake_cursor.queries) == 3
    assert "INSERT INTO app.tenants" in fake_cursor.queries[0][0]
    assert "INSERT INTO app.businesses" in fake_cursor.queries[1][0]
    assert "INSERT INTO app.audit_events" in fake_cursor.queries[2][0]


def test_apply_template_unknown_key(client, fake_cursor):
    business_id = str(uuid4())
    resp = client.post(f"/api/businesses/{business_id}/apply-template", json={
        "template_key": "nonexistent",
    })
    assert resp.status_code == 400
    assert "Unknown template" in resp.json()["detail"]


def test_apply_template_business_not_found(client, fake_cursor):
    business_id = str(uuid4())

    # Mock: _get_template lookup
    fake_cursor.push_result([{
        "key": "starter",
        "label": "Starter",
        "description": "Starter template",
        "departments": ["finance", "operations", "hr"],
        "capabilities": ["invoice_processing"],
    }])
    # Mock: SELECT 1 FROM app.businesses -> no rows
    fake_cursor.push_result([])

    resp = client.post(f"/api/businesses/{business_id}/apply-template", json={
        "template_key": "starter",
    })
    assert resp.status_code == 404
    assert "Business not found" in resp.json()["detail"]


def test_apply_template_success(client, fake_cursor):
    business_id = str(uuid4())
    dept_id = str(uuid4())
    cap_id = str(uuid4())

    # Mock: _get_template lookup
    fake_cursor.push_result([{
        "key": "starter",
        "label": "Starter",
        "description": "Starter template",
        "departments": ["finance", "operations", "hr"],
        "capabilities": ["invoice_processing", "ar_aging"],
    }])
    # Mock: SELECT 1 (business exists)
    fake_cursor.push_result([{"?column?": 1}])
    # Mock: SELECT department_id for each dept key (3 depts for starter)
    fake_cursor.push_result([{"department_id": dept_id}])
    fake_cursor.push_result([{"department_id": dept_id}])
    fake_cursor.push_result([{"department_id": dept_id}])
    # Mock: SELECT capability_id for each cap key from template
    for _ in range(2):
        fake_cursor.push_result([{"capability_id": cap_id}])

    resp = client.post(f"/api/businesses/{business_id}/apply-template", json={
        "template_key": "starter",
    })
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_apply_custom_business_not_found(client, fake_cursor):
    business_id = str(uuid4())
    fake_cursor.push_result([])  # business not found

    resp = client.post(f"/api/businesses/{business_id}/apply-custom", json={
        "enabled_departments": ["finance"],
        "enabled_capabilities": ["invoice_processing"],
    })
    assert resp.status_code == 404


def test_get_business_departments(client, fake_cursor):
    business_id = str(uuid4())
    dept_id = str(uuid4())

    fake_cursor.push_result([{
        "department_id": dept_id,
        "key": "finance",
        "label": "Finance",
        "icon": "dollar-sign",
        "sort_order": 1,
        "enabled": True,
        "sort_order_override": None,
    }])

    resp = client.get(f"/api/businesses/{business_id}/departments")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["key"] == "finance"


def test_get_department_capabilities(client, fake_cursor):
    business_id = str(uuid4())
    dept_id = str(uuid4())
    cap_id = str(uuid4())

    fake_cursor.push_result([{
        "capability_id": cap_id,
        "department_id": dept_id,
        "department_key": "finance",
        "key": "invoice_processing",
        "label": "Invoice Processing",
        "kind": "action",
        "sort_order": 1,
        "metadata_json": {},
        "enabled": True,
        "sort_order_override": None,
    }])

    resp = client.get(f"/api/businesses/{business_id}/departments/finance/capabilities")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["key"] == "invoice_processing"


def test_list_all_departments(client, fake_cursor):
    dept_id = str(uuid4())
    fake_cursor.push_result([{
        "department_id": dept_id,
        "key": "hr",
        "label": "HR",
        "icon": "users",
        "sort_order": 3,
    }])

    resp = client.get("/api/departments")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["key"] == "hr"
