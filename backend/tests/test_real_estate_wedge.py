from uuid import uuid4

from app.services.real_estate import compute_underwrite_outputs


def test_re_trust_create_and_list(client, fake_cursor):
    business_id = str(uuid4())
    trust_id = str(uuid4())

    fake_cursor.push_result([{"ok": 1}])  # business exists
    fake_cursor.push_result([{
        "trust_id": trust_id,
        "business_id": business_id,
        "name": "Trust A",
        "external_ids": {"code": "A"},
        "created_by": "tester",
        "created_at": "2024-01-01T00:00:00",
    }])
    resp = client.post("/api/real-estate/trusts", json={
        "business_id": business_id,
        "name": "Trust A",
        "external_ids": {"code": "A"},
        "created_by": "tester",
    })
    assert resp.status_code == 201
    assert resp.json()["trust_id"] == trust_id

    fake_cursor.push_result([{"ok": 1}])  # business exists
    fake_cursor.push_result([{
        "trust_id": trust_id,
        "business_id": business_id,
        "name": "Trust A",
        "external_ids": {"code": "A"},
        "created_by": "tester",
        "created_at": "2024-01-01T00:00:00",
    }])
    list_resp = client.get(f"/api/real-estate/trusts?business_id={business_id}")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
    assert list_resp.json()[0]["name"] == "Trust A"


def test_re_loans_crud_and_detail_shape(client, fake_cursor):
    business_id = str(uuid4())
    trust_id = str(uuid4())
    loan_id = str(uuid4())

    fake_cursor.push_result([{"trust_id": trust_id, "business_id": business_id}])
    fake_cursor.push_result([{
        "loan_id": loan_id,
        "trust_id": trust_id,
        "business_id": business_id,
        "loan_identifier": "LOAN-001",
        "external_ids": {},
        "original_balance_cents": 2500000000,
        "current_balance_cents": 2300000000,
        "rate_decimal": 0.0675,
        "maturity_date": "2028-12-31",
        "servicer_status": "watchlist",
        "metadata_json": {},
        "created_by": None,
        "created_at": "2024-01-01T00:00:00",
    }])
    create_resp = client.post("/api/real-estate/loans", json={
        "business_id": business_id,
        "trust_id": trust_id,
        "loan_identifier": "LOAN-001",
        "original_balance_cents": 2500000000,
        "current_balance_cents": 2300000000,
        "rate_decimal": 0.0675,
        "maturity_date": "2028-12-31",
        "servicer_status": "watchlist",
        "borrowers": [{"name": "Borrower A"}],
        "properties": [{"address_line1": "100 Main", "city": "Dallas", "state": "TX"}],
    })
    assert create_resp.status_code == 201
    assert create_resp.json()["loan_id"] == loan_id

    fake_cursor.push_result([{"ok": 1}])  # business exists
    fake_cursor.push_result([{
        "loan_id": loan_id,
        "trust_id": trust_id,
        "business_id": business_id,
        "loan_identifier": "LOAN-001",
        "external_ids": {},
        "original_balance_cents": 2500000000,
        "current_balance_cents": 2300000000,
        "rate_decimal": 0.0675,
        "maturity_date": "2028-12-31",
        "servicer_status": "watchlist",
        "metadata_json": {},
        "created_by": None,
        "created_at": "2024-01-01T00:00:00",
    }])
    list_resp = client.get(f"/api/real-estate/loans?business_id={business_id}&trust_id={trust_id}")
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["loan_identifier"] == "LOAN-001"

    fake_cursor.push_result([{
        "loan_id": loan_id,
        "trust_id": trust_id,
        "business_id": business_id,
        "loan_identifier": "LOAN-001",
        "external_ids": {},
        "original_balance_cents": 2500000000,
        "current_balance_cents": 2300000000,
        "rate_decimal": 0.0675,
        "maturity_date": "2028-12-31",
        "servicer_status": "watchlist",
        "metadata_json": {},
        "created_by": None,
        "created_at": "2024-01-01T00:00:00",
    }])
    fake_cursor.push_result([{"name": "Borrower A"}])
    fake_cursor.push_result([{"address_line1": "100 Main"}])
    fake_cursor.push_result([{
        "surveillance_id": str(uuid4()),
        "period_end_date": "2025-01-31",
        "metrics_json": {},
        "dscr": 1.2,
        "occupancy": 0.9,
        "noi_cents": 190000000,
        "notes": None,
        "created_by": None,
        "created_at": "2025-02-01T00:00:00",
    }])
    detail = client.get(f"/api/real-estate/loans/{loan_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert "borrowers" in body
    assert "properties" in body
    assert "latest_surveillance" in body


def test_re_surveillance_ordering(client, fake_cursor):
    loan_id = str(uuid4())
    business_id = str(uuid4())
    fake_cursor.push_result([{"loan_id": loan_id, "business_id": business_id}])
    fake_cursor.push_result([{
        "surveillance_id": str(uuid4()),
        "loan_id": loan_id,
        "business_id": business_id,
        "period_end_date": "2025-03-31",
        "metrics_json": {},
        "dscr": 1.1,
        "occupancy": 0.86,
        "noi_cents": 180000000,
        "notes": None,
        "created_by": None,
        "created_at": "2025-04-01T00:00:00",
    }])
    resp = client.get(f"/api/real-estate/loans/{loan_id}/surveillance")
    assert resp.status_code == 200
    assert resp.json()[0]["period_end_date"] == "2025-03-31"


def test_underwrite_calc_deterministic_and_diff():
    loan = {"current_balance_cents": 2300000000, "rate_decimal": 0.0675}
    latest = {"noi_cents": 190000000, "occupancy": 0.84}
    first = compute_underwrite_outputs(
        loan_row=loan,
        latest_surveillance=latest,
        requested_inputs={"cap_rate": 0.0625},
    )
    assert round(first.outputs["value"], 2) == round((1900000 / 0.0625), 2)
    assert "occupancy_below_85" in first.outputs["risk_flags"]

    second = compute_underwrite_outputs(
        loan_row=loan,
        latest_surveillance=latest,
        requested_inputs={"cap_rate": 0.07},
        prior_outputs=first.outputs,
    )
    assert "diff" in second.outputs
    assert second.outputs["diff"]["value_delta"] < 0


def test_underwrite_endpoint_returns_created_run(client, monkeypatch):
    loan_id = str(uuid4())
    business_id = str(uuid4())
    run_id = str(uuid4())
    execution_id = str(uuid4())

    def _fake_run_execution(**_kwargs):
        return {
            "run_id": execution_id,
            "status": "completed",
            "outputs_json": {
                "underwrite_run": {
                    "underwrite_run_id": run_id,
                    "loan_id": loan_id,
                    "business_id": business_id,
                    "execution_id": execution_id,
                    "run_at": "2025-01-01T00:00:00Z",
                    "inputs_json": {"cap_rate": 0.0625},
                    "outputs_json": {"value": 30000000},
                    "document_ids": [],
                    "diff_from_run_id": None,
                    "created_by": "tester",
                    "version": 1,
                    "created_at": "2025-01-01T00:00:00Z",
                }
            },
        }

    monkeypatch.setattr("app.routes.real_estate.execution_svc.run_execution", _fake_run_execution)
    resp = client.post(f"/api/real-estate/loans/{loan_id}/underwrite-runs", json={
        "business_id": business_id,
        "cap_rate": 0.0625,
    })
    assert resp.status_code == 201
    assert resp.json()["version"] == 1


def test_workout_cases_and_actions(client, fake_cursor):
    loan_id = str(uuid4())
    case_id = str(uuid4())
    business_id = str(uuid4())
    action_id = str(uuid4())

    fake_cursor.push_result([{"loan_id": loan_id, "business_id": business_id}])
    fake_cursor.push_result([{
        "case_id": case_id,
        "loan_id": loan_id,
        "business_id": business_id,
        "case_status": "open",
        "opened_at": "2025-01-01T00:00:00Z",
        "closed_at": None,
        "assigned_to": None,
        "summary": "Case",
        "created_by": None,
        "created_at": "2025-01-01T00:00:00Z",
    }])
    case_resp = client.post(f"/api/real-estate/loans/{loan_id}/workout-cases", json={
        "business_id": business_id,
        "summary": "Case",
    })
    assert case_resp.status_code == 201

    fake_cursor.push_result([{"case_id": case_id, "business_id": business_id}])
    fake_cursor.push_result([{
        "action_id": action_id,
        "case_id": case_id,
        "business_id": business_id,
        "action_type": "collect_docs",
        "status": "open",
        "due_date": None,
        "owner": None,
        "summary": "Collect",
        "audit_log_json": {},
        "document_ids": [],
        "created_by": None,
        "created_at": "2025-01-02T00:00:00Z",
    }])
    action_resp = client.post(f"/api/real-estate/workout-cases/{case_id}/actions", json={
        "business_id": business_id,
        "action_type": "collect_docs",
        "summary": "Collect",
    })
    assert action_resp.status_code == 201


def test_events_round_trip_with_document_ids(client, fake_cursor):
    loan_id = str(uuid4())
    business_id = str(uuid4())
    event_id = str(uuid4())
    doc_ids = ["doc_1", "doc_2"]

    fake_cursor.push_result([{"loan_id": loan_id, "business_id": business_id}])
    fake_cursor.push_result([{
        "event_id": event_id,
        "loan_id": loan_id,
        "business_id": business_id,
        "event_type": "servicing_note",
        "event_date": "2025-01-15",
        "severity": "medium",
        "description": "note",
        "document_ids": doc_ids,
        "created_by": None,
        "created_at": "2025-01-15T00:00:00Z",
    }])
    create_resp = client.post(f"/api/real-estate/loans/{loan_id}/events", json={
        "business_id": business_id,
        "event_type": "servicing_note",
        "event_date": "2025-01-15",
        "severity": "medium",
        "description": "note",
        "document_ids": doc_ids,
    })
    assert create_resp.status_code == 201
    assert create_resp.json()["document_ids"] == doc_ids

    fake_cursor.push_result([{"loan_id": loan_id, "business_id": business_id}])
    fake_cursor.push_result([{
        "event_id": event_id,
        "loan_id": loan_id,
        "business_id": business_id,
        "event_type": "servicing_note",
        "event_date": "2025-01-15",
        "severity": "medium",
        "description": "note",
        "document_ids": doc_ids,
        "created_by": None,
        "created_at": "2025-01-15T00:00:00Z",
    }])
    list_resp = client.get(f"/api/real-estate/loans/{loan_id}/events")
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["document_ids"] == doc_ids

