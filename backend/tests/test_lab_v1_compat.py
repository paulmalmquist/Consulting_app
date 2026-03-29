def test_pipeline_global_route_uses_backend_compat_service(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.lab.lab_compat_svc.get_pipeline_global",
        lambda env_id=None: {
            "env_id": str(env_id) if env_id else None,
            "current_stage_name": "Proposal",
            "stages": [{"stage_id": "s1", "stage_name": "Proposal", "order_index": 20}],
        },
    )

    response = client.get("/v1/pipeline/global?env_id=00000000-0000-4000-8000-000000000101")

    assert response.status_code == 200
    payload = response.json()
    assert payload["current_stage_name"] == "Proposal"
    assert payload["stages"][0]["stage_name"] == "Proposal"


def test_pipeline_stage_route_updates_via_backend_compat_service(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.lab.lab_compat_svc.set_environment_pipeline_stage",
        lambda env_id, stage_name, workbook_id: {
            "ok": True,
            "env_id": str(env_id),
            "current_stage_id": "stage-123",
            "current_stage_name": stage_name,
            "pipeline_stage_name": stage_name,
            "workbook_id": workbook_id,
        },
    )

    response = client.patch(
        "/v1/environments/00000000-0000-4000-8000-000000000101/pipeline-stage",
        json={"stage_name": "Proposal", "workbook_id": "wb-1"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["current_stage_name"] == "Proposal"


def test_excel_me_matches_legacy_permission_shape(client):
    response = client.get("/v1/excel/me")

    assert response.status_code == 200
    payload = response.json()
    assert payload["user_id"] == "excel-user"
    assert "environments:read" in payload["permissions"]
    assert "pipeline:write" in payload["permissions"]


def test_excel_schema_preserves_env_id_and_entities(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.lab.lab_excel_svc.list_schema_entities",
        lambda env_id: {
            "env_id": env_id,
            "entities": [
                {
                    "entity": "pipeline_items",
                    "schema": "platform",
                    "table": "pipeline_cards",
                    "display_field": "title",
                    "primary_keys": ["card_id"],
                    "scope": "platform",
                }
            ],
        },
    )

    response = client.get("/v1/excel/schema?env_id=00000000-0000-4000-8000-000000000101")

    assert response.status_code == 200
    payload = response.json()
    assert payload["env_id"] == "00000000-0000-4000-8000-000000000101"
    assert payload["entities"][0]["entity"] == "pipeline_items"


def test_documents_route_translates_backend_document_shape(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.lab.lab_compat_svc.list_documents",
        lambda env_id: {
            "documents": [
                {
                    "doc_id": "00000000-0000-4000-8000-000000000201",
                    "filename": "IC Memo",
                    "mime_type": "application/pdf",
                    "size_bytes": 2048,
                    "created_at": "2026-03-28T12:00:00Z",
                }
            ]
        },
    )

    response = client.get("/v1/environments/00000000-0000-4000-8000-000000000101/documents")

    assert response.status_code == 200
    assert response.json()["documents"][0]["filename"] == "IC Memo"
