from __future__ import annotations

from uuid import uuid4

import pytest

import app.routes.finance as finance_routes


def _run_row(run_id: str, business_id: str, partition_id: str, *, engine_kind: str = "waterfall") -> dict:
    return {
        "fin_run_id": run_id,
        "tenant_id": str(uuid4()),
        "business_id": business_id,
        "partition_id": partition_id,
        "engine_kind": engine_kind,
        "status": "completed",
        "idempotency_key": "idem-key-1234",
        "deterministic_hash": "hash-123",
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


@pytest.fixture(autouse=True)
def _patch_materialization(monkeypatch):
    monkeypatch.setattr(finance_routes.materialization, "enqueue_materialization_job", lambda **_: None)
    monkeypatch.setattr(finance_routes.materialization, "materialize_business_snapshot", lambda **_: None)


@pytest.fixture
def ids():
    return {
        "business_id": str(uuid4()),
        "partition_id": str(uuid4()),
        "fund_id": str(uuid4()),
        "run_id": str(uuid4()),
        "participant_id": str(uuid4()),
        "distribution_event_id": str(uuid4()),
        "simulation_id": str(uuid4()),
    }


def _assert_headers(resp, repe_log_context):
    assert resp.headers["X-Request-Id"] == repe_log_context["request_id"]
    assert resp.headers["X-Run-Id"] == repe_log_context["run_id"]


def test_submit_run_and_results(client, monkeypatch, ids, repe_log_context):
    repe_log_context["log_event"]("test.repe.run.submit.start", "Submitting waterfall run")

    monkeypatch.setattr(
        finance_routes.finance_runtime,
        "submit_run",
        lambda **_: _run_row(ids["run_id"], ids["business_id"], ids["partition_id"]),
    )
    monkeypatch.setattr(finance_routes.finance_runtime, "get_run_results", lambda **_: [])

    resp = client.post(
        "/api/fin/v1/runs",
        headers=repe_log_context["headers"],
        json={
            "engine_kind": "waterfall",
            "business_id": ids["business_id"],
            "partition_id": ids["partition_id"],
            "as_of_date": "2028-12-31",
            "idempotency_key": "idem-key-1234",
            "fund_id": ids["fund_id"],
            "distribution_event_id": ids["distribution_event_id"],
        },
    )
    repe_log_context["capture_response"](resp)
    _assert_headers(resp, repe_log_context)
    assert resp.status_code == 200
    assert resp.json()["run"]["fin_run_id"] == ids["run_id"]


def test_get_run_and_not_found(client, monkeypatch, ids, repe_log_context):
    monkeypatch.setattr(
        finance_routes.finance_runtime,
        "get_run",
        lambda **kwargs: _run_row(ids["run_id"], ids["business_id"], ids["partition_id"])
        if str(kwargs["run_id"]) == ids["run_id"]
        else None,
    )

    ok = client.get(f"/api/fin/v1/runs/{ids['run_id']}", headers=repe_log_context["headers"])
    repe_log_context["capture_response"](ok)
    _assert_headers(ok, repe_log_context)
    assert ok.status_code == 200

    bad = client.get(f"/api/fin/v1/runs/{uuid4()}", headers=repe_log_context["headers"])
    repe_log_context["capture_response"](bad)
    _assert_headers(bad, repe_log_context)
    assert bad.status_code == 404


def test_get_run_results(client, monkeypatch, ids, repe_log_context):
    monkeypatch.setattr(
        finance_routes.finance_runtime,
        "get_run_results",
        lambda **_: [{"result_table": "fin_allocation_run", "result_id": str(uuid4()), "created_at": "2028-12-31T00:00:00"}],
    )
    resp = client.get(f"/api/fin/v1/runs/{ids['run_id']}/results", headers=repe_log_context["headers"])
    repe_log_context["capture_response"](resp)
    _assert_headers(resp, repe_log_context)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_funds_create_list_and_validation(client, monkeypatch, ids, repe_log_context):
    monkeypatch.setattr(
        finance_routes.finance_repe,
        "create_fund",
        lambda **_: {
            "fin_fund_id": ids["fund_id"],
            "business_id": ids["business_id"],
            "partition_id": ids["partition_id"],
            "fund_code": "GRF1",
            "name": "GreenRock Fund I",
            "strategy": "core",
            "pref_rate": "0.08",
            "carry_rate": "0.20",
            "waterfall_style": "european",
            "created_at": "2028-01-01T00:00:00",
        },
    )
    monkeypatch.setattr(
        finance_routes.finance_repe,
        "list_funds",
        lambda **_: [{"fin_fund_id": ids["fund_id"], "fund_code": "GRF1", "name": "GreenRock Fund I", "strategy": "core"}],
    )

    create_resp = client.post(
        "/api/fin/v1/funds",
        headers=repe_log_context["headers"],
        json={
            "business_id": ids["business_id"],
            "partition_id": ids["partition_id"],
            "fund_code": "GRF1",
            "name": "GreenRock Fund I",
            "strategy": "core",
            "vintage_date": "2028-01-01",
            "pref_rate": "0.08",
            "carry_rate": "0.2",
            "waterfall_style": "european",
        },
    )
    repe_log_context["capture_response"](create_resp)
    _assert_headers(create_resp, repe_log_context)
    assert create_resp.status_code == 200

    list_resp = client.get(
        f"/api/fin/v1/funds?business_id={ids['business_id']}&partition_id={ids['partition_id']}",
        headers=repe_log_context["headers"],
    )
    repe_log_context["capture_response"](list_resp)
    _assert_headers(list_resp, repe_log_context)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    invalid_resp = client.post("/api/fin/v1/funds", headers=repe_log_context["headers"], json={"name": "broken"})
    repe_log_context["capture_response"](invalid_resp)
    _assert_headers(invalid_resp, repe_log_context)
    assert invalid_resp.status_code == 422


def test_participants_create_list_filter(client, monkeypatch, ids, repe_log_context):
    observed: dict[str, str | None] = {"participant_type": None}

    monkeypatch.setattr(
        finance_routes.finance_repe,
        "create_participant",
        lambda **_: {
            "fin_participant_id": ids["participant_id"],
            "business_id": ids["business_id"],
            "name": "LP One",
            "participant_type": "lp",
            "created_at": "2028-01-01T00:00:00",
        },
    )

    def _list_participants(**kwargs):
        observed["participant_type"] = kwargs.get("participant_type")
        return [
            {
                "fin_participant_id": ids["participant_id"],
                "business_id": ids["business_id"],
                "name": "LP One",
                "participant_type": kwargs.get("participant_type") or "lp",
                "created_at": "2028-01-01T00:00:00",
            }
        ]

    monkeypatch.setattr(finance_routes.finance_repe, "list_participants", _list_participants)

    create_resp = client.post(
        "/api/fin/v1/participants",
        headers=repe_log_context["headers"],
        json={"business_id": ids["business_id"], "name": "LP One", "participant_type": "lp"},
    )
    repe_log_context["capture_response"](create_resp)
    _assert_headers(create_resp, repe_log_context)
    assert create_resp.status_code == 200

    list_resp = client.get(
        f"/api/fin/v1/participants?business_id={ids['business_id']}&participant_type=lp",
        headers=repe_log_context["headers"],
    )
    repe_log_context["capture_response"](list_resp)
    _assert_headers(list_resp, repe_log_context)
    assert list_resp.status_code == 200
    assert observed["participant_type"] == "lp"


def test_commitments_create_list_effective_date(client, monkeypatch, ids, repe_log_context):
    monkeypatch.setattr(
        finance_routes.finance_repe,
        "create_commitment",
        lambda **_: {
            "fin_commitment_id": str(uuid4()),
            "business_id": ids["business_id"],
            "fin_participant_id": ids["participant_id"],
            "commitment_role": "lp",
            "commitment_date": "2028-02-01",
            "committed_amount": "1000000",
        },
    )
    monkeypatch.setattr(
        finance_routes.finance_repe,
        "list_commitments",
        lambda **_: [
            {
                "fin_commitment_id": str(uuid4()),
                "fin_participant_id": ids["participant_id"],
                "participant_name": "LP One",
                "commitment_role": "lp",
                "commitment_date": "2028-02-01",
                "committed_amount": "1000000",
            }
        ],
    )

    create_resp = client.post(
        f"/api/fin/v1/funds/{ids['fund_id']}/commitments",
        headers=repe_log_context["headers"],
        json={
            "fin_participant_id": ids["participant_id"],
            "commitment_role": "lp",
            "commitment_date": "2028-02-01",
            "committed_amount": "1000000",
        },
    )
    repe_log_context["capture_response"](create_resp)
    _assert_headers(create_resp, repe_log_context)
    assert create_resp.status_code == 200

    list_resp = client.get(f"/api/fin/v1/funds/{ids['fund_id']}/commitments", headers=repe_log_context["headers"])
    repe_log_context["capture_response"](list_resp)
    _assert_headers(list_resp, repe_log_context)
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["commitment_date"] == "2028-02-01"


def test_capital_calls_and_assets(client, monkeypatch, ids, repe_log_context):
    monkeypatch.setattr(
        finance_routes.finance_repe,
        "create_capital_call",
        lambda **_: {
            "fin_capital_call_id": str(uuid4()),
            "business_id": ids["business_id"],
            "call_number": 1,
            "call_date": "2028-03-01",
            "amount_requested": "250000",
            "status": "open",
        },
    )
    monkeypatch.setattr(finance_routes.finance_repe, "list_capital_calls", lambda **_: [{"fin_capital_call_id": str(uuid4()), "call_number": 1, "call_date": "2028-03-01", "amount_requested": "250000", "status": "open"}])
    monkeypatch.setattr(
        finance_routes.finance_repe,
        "create_asset_investment",
        lambda **_: {
            "fin_asset_investment_id": str(uuid4()),
            "business_id": ids["business_id"],
            "asset_name": "Asset A",
            "acquisition_date": "2028-04-01",
            "cost_basis": "100",
            "status": "active",
        },
    )
    monkeypatch.setattr(finance_routes.finance_repe, "list_assets", lambda **_: [{"fin_asset_investment_id": str(uuid4()), "asset_name": "Asset A", "cost_basis": "100", "status": "active"}])

    c_create = client.post(
        f"/api/fin/v1/funds/{ids['fund_id']}/capital-calls",
        headers=repe_log_context["headers"],
        json={"call_date": "2028-03-01", "amount_requested": "250000", "purpose": "Ops"},
    )
    repe_log_context["capture_response"](c_create)
    _assert_headers(c_create, repe_log_context)
    assert c_create.status_code == 200

    c_list = client.get(f"/api/fin/v1/funds/{ids['fund_id']}/capital-calls", headers=repe_log_context["headers"])
    repe_log_context["capture_response"](c_list)
    _assert_headers(c_list, repe_log_context)
    assert c_list.status_code == 200

    a_create = client.post(
        f"/api/fin/v1/funds/{ids['fund_id']}/assets",
        headers=repe_log_context["headers"],
        json={"asset_name": "Asset A", "acquisition_date": "2028-04-01", "cost_basis": "100"},
    )
    repe_log_context["capture_response"](a_create)
    _assert_headers(a_create, repe_log_context)
    assert a_create.status_code == 200

    a_list = client.get(f"/api/fin/v1/funds/{ids['fund_id']}/assets", headers=repe_log_context["headers"])
    repe_log_context["capture_response"](a_list)
    _assert_headers(a_list, repe_log_context)
    assert a_list.status_code == 200


def test_contributions_distributions_and_payouts(client, monkeypatch, ids, repe_log_context):
    monkeypatch.setattr(
        finance_routes.finance_repe,
        "create_contribution",
        lambda **_: {
            "fin_contribution_id": str(uuid4()),
            "business_id": ids["business_id"],
            "fin_participant_id": ids["participant_id"],
            "amount_contributed": "1000",
            "status": "collected",
        },
    )
    monkeypatch.setattr(
        finance_routes.finance_repe,
        "create_distribution_event",
        lambda **_: {
            "fin_distribution_event_id": ids["distribution_event_id"],
            "business_id": ids["business_id"],
            "event_date": "2028-05-01",
            "gross_proceeds": "1500",
            "net_distributable": "1500",
            "event_type": "sale",
            "status": "open",
        },
    )
    monkeypatch.setattr(finance_routes.finance_repe, "list_distribution_events", lambda **_: [{"fin_distribution_event_id": ids["distribution_event_id"], "event_date": "2028-05-01", "gross_proceeds": "1500", "net_distributable": "1500", "event_type": "sale", "status": "open"}])
    monkeypatch.setattr(finance_routes.finance_repe, "list_distribution_payouts", lambda **_: [{"fin_distribution_payout_id": str(uuid4()), "fin_participant_id": ids["participant_id"], "payout_type": "return_of_capital", "amount": "1500", "payout_date": "2028-05-02"}])

    contrib = client.post(
        f"/api/fin/v1/funds/{ids['fund_id']}/contributions",
        headers=repe_log_context["headers"],
        json={
            "fin_participant_id": ids["participant_id"],
            "contribution_date": "2028-04-01",
            "amount_contributed": "1000",
            "status": "collected",
        },
    )
    repe_log_context["capture_response"](contrib)
    _assert_headers(contrib, repe_log_context)
    assert contrib.status_code == 200

    dist_create = client.post(
        f"/api/fin/v1/funds/{ids['fund_id']}/distribution-events",
        headers=repe_log_context["headers"],
        json={"event_date": "2028-05-01", "gross_proceeds": "1500", "event_type": "sale"},
    )
    repe_log_context["capture_response"](dist_create)
    _assert_headers(dist_create, repe_log_context)
    assert dist_create.status_code == 200

    dist_list = client.get(f"/api/fin/v1/funds/{ids['fund_id']}/distribution-events", headers=repe_log_context["headers"])
    repe_log_context["capture_response"](dist_list)
    _assert_headers(dist_list, repe_log_context)
    assert dist_list.status_code == 200

    payouts = client.get(
        f"/api/fin/v1/funds/{ids['fund_id']}/distribution-events/{ids['distribution_event_id']}/payouts",
        headers=repe_log_context["headers"],
    )
    repe_log_context["capture_response"](payouts)
    _assert_headers(payouts, repe_log_context)
    assert payouts.status_code == 200


def test_waterfall_idempotency_and_allocations(client, monkeypatch, ids, repe_log_context):
    run_map: dict[str, str] = {}

    def _submit_run(**kwargs):
        idem = kwargs["idempotency_key"]
        run_id = run_map.setdefault(idem, str(uuid4()))
        return _run_row(run_id, ids["business_id"], ids["partition_id"])

    monkeypatch.setattr(finance_routes.finance_runtime, "submit_run", _submit_run)
    monkeypatch.setattr(finance_routes.finance_runtime, "get_run_results", lambda **_: [{"result_table": "fin_allocation_run", "result_id": str(uuid4())}])
    monkeypatch.setattr(finance_routes.finance_repe, "list_waterfall_allocations", lambda **_: [{"line_number": 1, "label": "return_of_capital", "amount": "100"}])

    body = {
        "business_id": ids["business_id"],
        "partition_id": ids["partition_id"],
        "as_of_date": "2028-12-31",
        "idempotency_key": "same-key-12345",
        "distribution_event_id": ids["distribution_event_id"],
    }
    first = client.post(f"/api/fin/v1/funds/{ids['fund_id']}/waterfall-runs", headers=repe_log_context["headers"], json=body)
    repe_log_context["capture_response"](first)
    _assert_headers(first, repe_log_context)
    assert first.status_code == 200

    second = client.post(f"/api/fin/v1/funds/{ids['fund_id']}/waterfall-runs", headers=repe_log_context["headers"], json=body)
    repe_log_context["capture_response"](second)
    _assert_headers(second, repe_log_context)
    assert second.status_code == 200
    assert first.json()["run"]["fin_run_id"] == second.json()["run"]["fin_run_id"]

    alloc = client.get(
        f"/api/fin/v1/funds/{ids['fund_id']}/waterfall-runs/{first.json()['run']['fin_run_id']}/allocations",
        headers=repe_log_context["headers"],
    )
    repe_log_context["capture_response"](alloc)
    _assert_headers(alloc, repe_log_context)
    assert alloc.status_code == 200


def test_capital_rollforward_run_and_list_effective_date(client, monkeypatch, ids, repe_log_context):
    monkeypatch.setattr(
        finance_routes.finance_runtime,
        "submit_run",
        lambda **_: _run_row(ids["run_id"], ids["business_id"], ids["partition_id"], engine_kind="capital_rollforward"),
    )
    monkeypatch.setattr(finance_routes.finance_runtime, "get_run_results", lambda **_: [{"result_table": "fin_capital_rollforward", "result_id": str(uuid4())}])

    observed: dict[str, str | None] = {"as_of_date": None}

    def _list_rollforward(**kwargs):
        observed["as_of_date"] = str(kwargs.get("as_of_date")) if kwargs.get("as_of_date") else None
        return [{"as_of_date": observed["as_of_date"] or "2028-12-31", "closing_balance": "999"}]

    monkeypatch.setattr(finance_routes.finance_repe, "list_capital_rollforward", _list_rollforward)

    run_resp = client.post(
        f"/api/fin/v1/funds/{ids['fund_id']}/capital-rollforward-runs",
        headers=repe_log_context["headers"],
        json={
            "business_id": ids["business_id"],
            "partition_id": ids["partition_id"],
            "as_of_date": "2028-12-31",
            "idempotency_key": "rollforward-key-1234",
        },
    )
    repe_log_context["capture_response"](run_resp)
    _assert_headers(run_resp, repe_log_context)
    assert run_resp.status_code == 200

    list_resp = client.get(
        f"/api/fin/v1/funds/{ids['fund_id']}/capital-rollforward?as_of_date=2028-12-31",
        headers=repe_log_context["headers"],
    )
    repe_log_context["capture_response"](list_resp)
    _assert_headers(list_resp, repe_log_context)
    assert list_resp.status_code == 200
    assert observed["as_of_date"] == "2028-12-31"


def test_partitions_snapshot_and_simulation_stubs(client, monkeypatch, ids, repe_log_context):
    monkeypatch.setattr(
        finance_routes.finance_scenarios,
        "list_partitions",
        lambda **_: [{"partition_id": ids["partition_id"], "partition_type": "live", "key": "live"}],
    )
    monkeypatch.setattr(
        finance_routes.finance_scenarios,
        "snapshot_live_partition",
        lambda **_: {"partition_id": str(uuid4()), "partition_type": "snapshot", "key": "snap_20281231"},
    )
    monkeypatch.setattr(
        finance_routes.finance_scenarios,
        "create_simulation",
        lambda **_: {"simulation_id": ids["simulation_id"], "base_partition_id": ids["partition_id"], "status": "draft"},
    )
    monkeypatch.setattr(
        finance_routes.finance_scenarios,
        "diff_vs_live",
        lambda **_: {"simulation_id": ids["simulation_id"], "changes": [{"table": "fin_fund", "change_type": "updated"}]},
    )

    partitions = client.get(f"/api/fin/v1/partitions?business_id={ids['business_id']}", headers=repe_log_context["headers"])
    repe_log_context["capture_response"](partitions)
    _assert_headers(partitions, repe_log_context)
    assert partitions.status_code == 200

    snapshot = client.post(
        f"/api/fin/v1/partitions/{ids['partition_id']}/snapshot",
        headers=repe_log_context["headers"],
        json={"business_id": ids["business_id"], "snapshot_as_of": "2028-12-31"},
    )
    repe_log_context["capture_response"](snapshot)
    _assert_headers(snapshot, repe_log_context)
    assert snapshot.status_code == 200

    simulation = client.post(
        "/api/fin/v1/simulations",
        headers=repe_log_context["headers"],
        json={"business_id": ids["business_id"], "base_partition_id": ids["partition_id"], "scenario_key": "upside"},
    )
    repe_log_context["capture_response"](simulation)
    _assert_headers(simulation, repe_log_context)
    assert simulation.status_code == 200

    diff = client.get(f"/api/fin/v1/simulations/{ids['simulation_id']}/diff-vs-live", headers=repe_log_context["headers"])
    repe_log_context["capture_response"](diff)
    _assert_headers(diff, repe_log_context)
    assert diff.status_code == 200


def test_not_found_maps_to_404(client, monkeypatch, ids, repe_log_context):
    monkeypatch.setattr(
        finance_routes.finance_repe,
        "list_distribution_payouts",
        lambda **_: (_ for _ in ()).throw(LookupError("Distribution event not found")),
    )

    resp = client.get(
        f"/api/fin/v1/funds/{ids['fund_id']}/distribution-events/{ids['distribution_event_id']}/payouts",
        headers=repe_log_context["headers"],
    )
    repe_log_context["capture_response"](resp)
    _assert_headers(resp, repe_log_context)
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()
