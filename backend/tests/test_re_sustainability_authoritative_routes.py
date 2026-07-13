from __future__ import annotations

import app.routes.re_sustainability as sus_routes

BASE_PARAMS = {
    "business_id": "00000000-0000-0000-0000-000000000001",
    "env_id": "env-test",
    "entity_scope": "portfolio",
    "period_key": "2026Q1",
    "metric_family": "ghg",
}

_FULL_STATE = {
    "entity_scope": "portfolio",
    "period_key": "2026Q1",
    "requested_period_key": "2026Q1",
    "period_exact": True,
    "state_origin": "authoritative",
    "snapshot_version": "v1",
    "promotion_state": "released",
    "trust_status": "audited",
    "null_reason": None,
    "metrics": [
        {"metric_key": "scope1_emissions", "value": 42.0, "unit": "tCO2e", "null_reason": None, "trust_status": "audited"},
    ],
    "evidence": [
        {
            "metric_key": "scope1_emissions",
            "source_table": "sus_utility_monthly",
            "source_row_ref": "row-1",
            "emission_factor_set_id": None,
            "ingestion_run_id": None,
            "formula_id": None,
        }
    ],
}

_UNAVAILABLE_STATE = {
    "entity_scope": "portfolio",
    "period_key": "2026Q1",
    "requested_period_key": "2026Q1",
    "period_exact": False,
    "state_origin": "authoritative",
    "snapshot_version": None,
    "promotion_state": None,
    "trust_status": "missing_source",
    "null_reason": "snapshot_unavailable",
    "metrics": [],
    "evidence": [],
}


def test_authoritative_overview_returns_reader_payload(client, monkeypatch):
    monkeypatch.setattr(
        sus_routes.re_sustainability_authoritative,
        "get_authoritative_state",
        lambda **_: _FULL_STATE,
    )
    resp = client.get("/api/re/v2/sustainability/authoritative/overview", params=BASE_PARAMS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["snapshot_version"] == "v1"
    assert data["trust_status"] == "audited"
    assert len(data["metrics"]) == 1
    assert data["metrics"][0]["metric_key"] == "scope1_emissions"


def test_authoritative_metric_returns_single_metric_shape(client, monkeypatch):
    monkeypatch.setattr(
        sus_routes.re_sustainability_authoritative,
        "get_metric",
        lambda **_: {
            "value": 42.0,
            "unit": "tCO2e",
            "null_reason": None,
            "trust_status": "audited",
            "snapshot_version": "v1",
            "state_origin": "authoritative",
        },
    )
    resp = client.get(
        "/api/re/v2/sustainability/authoritative/metric/scope1_emissions",
        params=BASE_PARAMS,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["value"] == 42.0
    assert data["snapshot_version"] == "v1"
    assert data["state_origin"] == "authoritative"


def test_authoritative_metric_evidence_returns_list_200(client, monkeypatch):
    monkeypatch.setattr(
        sus_routes.re_sustainability_authoritative,
        "get_authoritative_state",
        lambda **_: _FULL_STATE,
    )
    resp = client.get(
        "/api/re/v2/sustainability/authoritative/metric/scope1_emissions/evidence",
        params=BASE_PARAMS,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "evidence" in data
    assert isinstance(data["evidence"], list)
    assert data["evidence"][0]["metric_key"] == "scope1_emissions"


def test_authoritative_metric_evidence_empty_when_snapshot_unavailable(client, monkeypatch):
    monkeypatch.setattr(
        sus_routes.re_sustainability_authoritative,
        "get_authoritative_state",
        lambda **_: _UNAVAILABLE_STATE,
    )
    resp = client.get(
        "/api/re/v2/sustainability/authoritative/metric/scope1_emissions/evidence",
        params=BASE_PARAMS,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["evidence"] == []


def test_authoritative_context_includes_required_fields(client, monkeypatch):
    monkeypatch.setattr(
        sus_routes.re_sustainability_authoritative,
        "get_authoritative_state",
        lambda **_: _FULL_STATE,
    )
    resp = client.get("/api/re/v2/sustainability/authoritative/context", params=BASE_PARAMS)
    assert resp.status_code == 200
    data = resp.json()
    assert "snapshot_version" in data
    assert "trust_status" in data
    assert "metrics" in data
    assert isinstance(data["metrics"], list)
    assert data["metrics"][0]["metric_key"] == "scope1_emissions"
    assert data["metrics"][0]["value"] == 42.0


def test_authoritative_context_unavailable_snapshot(client, monkeypatch):
    monkeypatch.setattr(
        sus_routes.re_sustainability_authoritative,
        "get_authoritative_state",
        lambda **_: _UNAVAILABLE_STATE,
    )
    resp = client.get("/api/re/v2/sustainability/authoritative/context", params=BASE_PARAMS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["null_reason"] == "snapshot_unavailable"
    assert data["snapshot_version"] is None
    assert data["metrics"] == []
