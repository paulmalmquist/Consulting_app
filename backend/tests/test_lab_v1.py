from datetime import UTC, datetime


def test_lab_chat_returns_translated_response(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.lab.lab_compat_svc.chat",
        lambda env_id, **kwargs: {
            "answer": f"Reply for {env_id}",
            "citations": [
                {
                    "doc_id": "00000000-0000-4000-8000-000000000201",
                    "filename": "IC Memo",
                    "chunk_id": "00000000-0000-4000-8000-000000000301",
                    "snippet": "Debt service coverage is 1.18x.",
                    "score": 0.91,
                }
            ],
            "suggested_actions": [],
        },
    )

    response = client.post(
        "/v1/chat",
        json={
            "env_id": "00000000-0000-4000-8000-000000000001",
            "message": "hello",
            "limit": 5,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["answer"] == "Reply for 00000000-0000-4000-8000-000000000001"
    assert payload["citations"][0]["filename"] == "IC Memo"


def test_get_pipeline_returns_seeded_board(client, fake_cursor):
    env_id = "00000000-0000-4000-8000-000000000010"
    created_at = datetime(2026, 3, 28, 12, 0, tzinfo=UTC)

    fake_cursor.push_result(
        [
            {
                "env_id": env_id,
                "client_name": "Acme Health",
                "industry": "healthcare",
                "industry_type": "healthcare",
                "workspace_template_key": "healthcare",
                "schema_name": "env_acme_health",
                "is_active": True,
                "business_id": "00000000-0000-4000-8000-000000000020",
                "repe_initialized": False,
                "created_at": created_at,
                "notes": None,
                "pipeline_stage_name": None,
            }
        ]
    )
    fake_cursor.push_result([{"cnt": 0}])
    fake_cursor.push_result(
        [
            {
                "stage_id": "00000000-0000-4000-8000-000000000101",
                "stage_key": "intake",
                "stage_name": "Intake",
                "order_index": 10,
                "color_token": "slate",
                "created_at": created_at,
                "updated_at": created_at,
            }
        ]
    )
    fake_cursor.push_result(
        [
            {
                "card_id": "00000000-0000-4000-8000-000000000201",
                "stage_id": "00000000-0000-4000-8000-000000000101",
                "title": "New inbound opportunity",
                "account_name": "Northwind Health",
                "owner": "ops-lead",
                "value_cents": 180000,
                "priority": "medium",
                "due_date": None,
                "notes": None,
                "rank": 10,
                "created_at": created_at,
                "updated_at": created_at,
            }
        ]
    )

    response = client.get(f"/v1/pipeline?env_id={env_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["env_id"] == env_id
    assert payload["industry_type"] == "healthcare"
    assert payload["stages"][0]["stage_name"] == "Intake"
    assert payload["cards"][0]["title"] == "New inbound opportunity"
    assert sum("INSERT INTO v1.pipeline_stages" in sql for sql, _ in fake_cursor.queries) == 5


def test_create_pipeline_stage_returns_wrapped_stage(client, fake_cursor):
    env_id = "00000000-0000-4000-8000-000000000011"
    created_at = datetime(2026, 3, 28, 12, 30, tzinfo=UTC)

    fake_cursor.push_result(
        [
            {
                "env_id": env_id,
                "client_name": "Acme Ops",
                "industry": "general",
                "industry_type": "general",
                "workspace_template_key": "general",
                "schema_name": "env_acme_ops",
                "is_active": True,
                "business_id": "00000000-0000-4000-8000-000000000021",
                "repe_initialized": False,
                "created_at": created_at,
                "notes": None,
                "pipeline_stage_name": None,
            }
        ]
    )
    fake_cursor.push_result([{"cnt": 1}])
    fake_cursor.push_result([{"key": "lead"}])
    fake_cursor.push_result([{"max_sort": 10}])
    fake_cursor.push_result(
        [
            {
                "stage_id": "00000000-0000-4000-8000-000000000301",
                "stage_key": "proposal",
                "stage_name": "Proposal",
                "order_index": 20,
                "color_token": "amber",
                "created_at": created_at,
                "updated_at": created_at,
            }
        ]
    )

    response = client.post(
        "/v1/pipeline/stages",
        json={"env_id": env_id, "stage_name": "Proposal", "color_token": "amber"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["stage"]["stage_name"] == "Proposal"
    assert payload["stage"]["stage_key"] == "proposal"


def test_delete_environment_returns_ok(client, fake_cursor):
    env_id = "00000000-0000-4000-8000-000000000012"
    fake_cursor.push_result(
        [
            {
                "env_id": env_id,
                "client_name": "Delete Me",
                "industry": "general",
                "industry_type": "general",
                "workspace_template_key": "general",
                "schema_name": "env_delete_me",
                "is_active": True,
                "business_id": None,
                "repe_initialized": False,
                "created_at": datetime(2026, 3, 28, 13, 0, tzinfo=UTC),
                "notes": None,
                "pipeline_stage_name": None,
            }
        ]
    )

    response = client.delete(f"/v1/environments/{env_id}")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "env_id": env_id}
