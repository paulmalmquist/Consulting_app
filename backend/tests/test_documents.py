"""Tests for /api/documents endpoints (mocked DB + storage)."""

from uuid import uuid4


def test_init_upload_business_not_found(client, fake_cursor, fake_storage):
    fake_cursor.push_result([])  # SELECT tenant_id -> no rows

    resp = client.post("/api/documents/init-upload", json={
        "business_id": str(uuid4()),
        "filename": "test.pdf",
        "content_type": "application/pdf",
    })
    assert resp.status_code == 404
    assert "Business not found" in resp.json()["detail"]


def test_init_upload_success(client, fake_cursor, fake_storage):
    tenant_id = str(uuid4())
    business_id = str(uuid4())
    document_id = str(uuid4())
    version_id = str(uuid4())

    # SELECT tenant_id FROM app.businesses
    fake_cursor.push_result([{"tenant_id": tenant_id}])
    # SELECT existing document
    fake_cursor.push_result([])
    # INSERT INTO app.documents RETURNING document_id
    fake_cursor.push_result([{"document_id": document_id}])
    # SELECT COALESCE(MAX(version_number)...) -> next_ver
    fake_cursor.push_result([{"next_ver": 1}])
    # INSERT INTO app.document_versions RETURNING version_id
    fake_cursor.push_result([{"version_id": version_id}])

    resp = client.post("/api/documents/init-upload", json={
        "business_id": business_id,
        "filename": "report.pdf",
        "content_type": "application/pdf",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["document_id"] == document_id
    assert data["version_id"] == version_id
    assert "signed_upload_url" in data
    assert data["signed_upload_url"].startswith("https://")


def test_init_upload_storage_key_format(client, fake_cursor, fake_storage):
    """Storage key should contain tenant/business/department/document/version path."""
    tenant_id = str(uuid4())
    business_id = str(uuid4())
    department_id = str(uuid4())
    document_id = str(uuid4())
    version_id = str(uuid4())

    fake_cursor.push_result([{"tenant_id": tenant_id}])
    fake_cursor.push_result([])
    fake_cursor.push_result([{"document_id": document_id}])
    fake_cursor.push_result([{"next_ver": 1}])
    fake_cursor.push_result([{"version_id": version_id}])

    resp = client.post("/api/documents/init-upload", json={
        "business_id": business_id,
        "department_id": department_id,
        "filename": "report.pdf",
        "content_type": "application/pdf",
    })
    assert resp.status_code == 200
    key = resp.json()["storage_key"]
    assert f"tenant/{tenant_id}" in key
    assert f"business/{business_id}" in key
    assert f"department/{department_id}" in key
    assert f"document/{document_id}" in key
    assert f"v/{version_id}" in key
    assert key.endswith("/report.pdf")


def test_complete_upload_not_found(client, fake_cursor):
    fake_cursor.rowcount = 0
    fake_cursor.push_result([])

    resp = client.post("/api/documents/complete-upload", json={
        "document_id": str(uuid4()),
        "version_id": str(uuid4()),
        "sha256": "abc123",
        "byte_size": 1024,
    })
    assert resp.status_code == 404


def test_complete_upload_success(client, fake_cursor):
    fake_cursor.push_result([{"virtual_path": None}])  # SELECT document
    fake_cursor.push_result([])  # UPDATE returns nothing via fetchone

    resp = client.post("/api/documents/complete-upload", json={
        "document_id": str(uuid4()),
        "version_id": str(uuid4()),
        "sha256": "abc123def456",
        "byte_size": 2048,
    })
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_list_documents(client, fake_cursor):
    business_id = str(uuid4())
    doc_id = str(uuid4())

    fake_cursor.push_result([{
        "document_id": doc_id,
        "business_id": business_id,
        "department_id": None,
        "title": "Test Doc",
        "virtual_path": None,
        "status": "draft",
        "created_at": "2024-01-01T00:00:00",
        "latest_version_number": 1,
        "latest_content_type": "application/pdf",
        "latest_size_bytes": 1024,
    }])

    resp = client.get(f"/api/documents?business_id={business_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["document_id"] == doc_id
    assert data[0]["title"] == "Test Doc"


def test_list_documents_entity_scope(client, fake_cursor):
    business_id = str(uuid4())
    env_id = str(uuid4())
    entity_id = str(uuid4())

    fake_cursor.push_result([{
        "document_id": str(uuid4()),
        "business_id": business_id,
        "department_id": None,
        "title": "Fund Attachment",
        "virtual_path": f"re/env/{env_id}/fund/{entity_id}/fund-attachment.pdf",
        "status": "available",
        "created_at": "2024-01-01T00:00:00",
        "latest_version_number": 1,
        "latest_content_type": "application/pdf",
        "latest_size_bytes": 2048,
    }])

    resp = client.get(
        f"/api/documents?business_id={business_id}&env_id={env_id}&entity_type=fund&entity_id={entity_id}"
    )
    assert resp.status_code == 200
    assert any(
        "FROM app.document_entity_links del" in sql
        for (sql, _params) in fake_cursor.queries
    )


def test_list_documents_entity_scope_requires_full_context(client):
    business_id = str(uuid4())
    env_id = str(uuid4())

    resp = client.get(
        f"/api/documents?business_id={business_id}&env_id={env_id}&entity_type=fund"
    )
    assert resp.status_code == 400
    assert "required together" in resp.json()["detail"]


def test_list_document_versions(client, fake_cursor):
    doc_id = str(uuid4())
    ver_id = str(uuid4())

    fake_cursor.push_result([{
        "version_id": ver_id,
        "document_id": doc_id,
        "version_number": 1,
        "state": "available",
        "original_filename": "test.pdf",
        "mime_type": "application/pdf",
        "size_bytes": 1024,
        "content_hash": "abc123",
        "created_at": "2024-01-01T00:00:00",
    }])

    resp = client.get(f"/api/documents/{doc_id}/versions")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["version_number"] == 1
    assert data[0]["state"] == "available"


def test_download_url_not_found(client, fake_cursor, fake_storage):
    fake_cursor.push_result([])  # no version found

    resp = client.get(f"/api/documents/{uuid4()}/versions/{uuid4()}/download-url")
    assert resp.status_code == 404


def test_download_url_success(client, fake_cursor, fake_storage):
    fake_cursor.push_result([{
        "bucket": "documents",
        "object_key": "tenant/1/business/2/doc.pdf",
    }])

    resp = client.get(f"/api/documents/{uuid4()}/versions/{uuid4()}/download-url")
    assert resp.status_code == 200
    data = resp.json()
    assert "signed_download_url" in data
    assert data["signed_download_url"].startswith("https://")


def test_init_upload_rejects_malformed_re_virtual_path(client):
    resp = client.post("/api/documents/init-upload", json={
        "business_id": str(uuid4()),
        "filename": "rent-roll.csv",
        "content_type": "text/csv",
        "virtual_path": "re/env/not-a-uuid/fund/also-not-uuid/rent-roll.csv",
    })
    assert resp.status_code == 400
    assert "Malformed RE virtual_path prefix" in resp.json()["detail"]


def test_init_upload_entity_link_inserted(client, fake_cursor):
    tenant_id = str(uuid4())
    business_id = str(uuid4())
    env_id = str(uuid4())
    fund_id = str(uuid4())
    document_id = str(uuid4())
    version_id = str(uuid4())

    fake_cursor.push_result([{"tenant_id": tenant_id}])  # tenant lookup
    fake_cursor.push_result([])  # existing document lookup
    fake_cursor.push_result([{"document_id": document_id}])  # insert document
    fake_cursor.push_result([{"next_ver": 1}])  # next version
    fake_cursor.push_result([{"version_id": version_id}])  # insert version

    resp = client.post("/api/documents/init-upload", json={
        "business_id": business_id,
        "filename": "fund-summary.pdf",
        "content_type": "application/pdf",
        "virtual_path": f"re/env/{env_id}/fund/{fund_id}/fund-summary.pdf",
        "entity_type": "fund",
        "entity_id": fund_id,
        "env_id": env_id,
    })
    assert resp.status_code == 200
    assert any(
        "INSERT INTO app.document_entity_links" in sql
        for (sql, _params) in fake_cursor.queries
    )


def test_complete_upload_rejects_entity_context_mismatch(client, fake_cursor):
    document_id = str(uuid4())
    version_id = str(uuid4())
    env_id = str(uuid4())
    deal_id = str(uuid4())
    wrong_env_id = str(uuid4())

    fake_cursor.push_result([
        {"virtual_path": f"re/env/{env_id}/deal/{deal_id}/package.pdf"}
    ])

    resp = client.post("/api/documents/complete-upload", json={
        "document_id": document_id,
        "version_id": version_id,
        "sha256": "abc123",
        "byte_size": 1024,
        "entity_type": "investment",
        "entity_id": deal_id,
        "env_id": wrong_env_id,
    })
    assert resp.status_code == 400
    assert "Entity context does not match document virtual_path" in resp.json()["detail"]
