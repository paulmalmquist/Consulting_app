"""Tests for /api/fin/v1 endpoints (mocked DB)."""

from datetime import date
from uuid import uuid4


def _run_row(run_id: str, business_id: str, partition_id: str) -> dict:
    return {
        "fin_run_id": run_id,
        "tenant_id": str(uuid4()),
        "business_id": business_id,
        "partition_id": partition_id,
        "engine_kind": "waterfall",
        "status": "completed",
        "idempotency_key": "idem-key-123",
        "deterministic_hash": "abc123",
        "as_of_date": "2028-12-31",
        "dataset_version_id": None,
        "fin_rule_version_id": None,
        "input_ref_table": "fin_distribution_event",
        "input_ref_id": str(uuid4()),
        "started_at": "2028-12-31T00:00:00",
        "completed_at": "2028-12-31T00:00:01",
        "error_message": None,
        "created_at": "2028-12-31T00:00:00",
    }


def test_submit_run_idempotent_returns_existing_run(client, fake_cursor):
    run_id = str(uuid4())
    business_id = str(uuid4())
    partition_id = str(uuid4())

    fake_cursor.push_result(
        [
            {
                "partition_id": partition_id,
                "tenant_id": str(uuid4()),
                "business_id": business_id,
                "key": "live",
                "partition_type": "live",
                "is_read_only": False,
                "status": "active",
            }
        ]
    )
    # Existing run lookup in _insert_run
    fake_cursor.push_result([_run_row(run_id, business_id, partition_id)])
    # Result refs lookup
    fake_cursor.push_result([])

    resp = client.post(
        "/api/fin/v1/runs",
        json={
            "engine_kind": "waterfall",
            "business_id": business_id,
            "partition_id": partition_id,
            "as_of_date": "2028-12-31",
            "idempotency_key": "idem-key-123",
            "fund_id": str(uuid4()),
            "distribution_event_id": str(uuid4()),
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["run"]["fin_run_id"] == run_id
    assert data["run"]["engine_kind"] == "waterfall"
    assert data["result_refs"] == []


def test_create_and_list_funds(client, fake_cursor):
    business_id = str(uuid4())
    partition_id = str(uuid4())
    fund_entity_id = str(uuid4())
    fund_id = str(uuid4())

    # create_fund query chain
    fake_cursor.push_result(
        [
            {
                "partition_id": partition_id,
                "tenant_id": str(uuid4()),
                "business_id": business_id,
                "key": "live",
                "partition_type": "live",
                "is_read_only": False,
                "status": "active",
            }
        ]
    )
    fake_cursor.push_result([{"fin_entity_type_id": str(uuid4())}])
    fake_cursor.push_result([{"fin_entity_id": fund_entity_id}])
    fake_cursor.push_result(
        [
            {
                "fin_fund_id": fund_id,
                "tenant_id": str(uuid4()),
                "business_id": business_id,
                "partition_id": partition_id,
                "fin_entity_id": fund_entity_id,
                "fund_code": "GRF1",
                "name": "GreenRock Fund I",
                "strategy": "core",
                "pref_rate": "0.08",
                "carry_rate": "0.20",
                "waterfall_style": "european",
                "created_at": "2028-01-01T00:00:00",
            }
        ]
    )

    create_resp = client.post(
        "/api/fin/v1/funds",
        json={
            "business_id": business_id,
            "partition_id": partition_id,
            "fund_code": "GRF1",
            "name": "GreenRock Fund I",
            "strategy": "core",
            "vintage_date": "2028-01-01",
            "term_years": 10,
            "pref_rate": "0.08",
            "pref_is_compound": False,
            "catchup_rate": "1.0",
            "carry_rate": "0.2",
            "waterfall_style": "european",
        },
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["fin_fund_id"] == fund_id

    # list_funds query chain
    fake_cursor.push_result(
        [
            {
                "partition_id": partition_id,
                "tenant_id": str(uuid4()),
                "business_id": business_id,
                "key": "live",
                "partition_type": "live",
                "is_read_only": False,
                "status": "active",
            }
        ]
    )
    fake_cursor.push_result(
        [
            {
                "fin_fund_id": fund_id,
                "fund_code": "GRF1",
                "name": "GreenRock Fund I",
                "strategy": "core",
            }
        ]
    )

    list_resp = client.get(f"/api/fin/v1/funds?business_id={business_id}&partition_id={partition_id}")
    assert list_resp.status_code == 200
    funds = list_resp.json()
    assert len(funds) == 1
    assert funds[0]["fund_code"] == "GRF1"
