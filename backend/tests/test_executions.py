"""Tests for /api/executions endpoints (mocked DB)."""

from uuid import uuid4


def test_run_execution_stub(client, fake_cursor):
    business_id = str(uuid4())
    dept_id = str(uuid4())
    cap_id = str(uuid4())
    exec_id = str(uuid4())

    fake_cursor.push_result([{"execution_id": exec_id}])

    resp = client.post("/api/executions/run", json={
        "business_id": business_id,
        "department_id": dept_id,
        "capability_id": cap_id,
        "inputs_json": {"amount": 100, "vendor": "Acme"},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["run_id"] == exec_id
    assert data["status"] == "completed"
    assert "processed_inputs" in data["outputs_json"]
    assert "amount" in data["outputs_json"]["processed_inputs"]


def test_list_executions(client, fake_cursor):
    business_id = str(uuid4())
    exec_id = str(uuid4())

    fake_cursor.push_result([{
        "execution_id": exec_id,
        "business_id": business_id,
        "department_id": None,
        "capability_id": None,
        "status": "completed",
        "inputs_json": {},
        "outputs_json": {"message": "done"},
        "created_at": "2024-01-01T00:00:00",
    }])

    resp = client.get(f"/api/executions?business_id={business_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["execution_id"] == exec_id
    assert data[0]["status"] == "completed"


def test_list_executions_with_filters(client, fake_cursor):
    business_id = str(uuid4())
    dept_id = str(uuid4())
    cap_id = str(uuid4())

    fake_cursor.push_result([])  # no results

    resp = client.get(
        f"/api/executions?business_id={business_id}"
        f"&department_id={dept_id}&capability_id={cap_id}"
    )
    assert resp.status_code == 200
    assert resp.json() == []

    # Verify all three filter conditions were used
    query = fake_cursor.queries[0][0]
    assert "e.business_id" in query
    assert "e.department_id" in query
    assert "e.capability_id" in query
