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
