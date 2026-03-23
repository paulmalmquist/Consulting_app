from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.underwriting.id import deterministic_run_identity


def _run_row_from_payload(payload: dict) -> dict:
    run_id, input_hash = deterministic_run_identity(payload)
    now = datetime.now(timezone.utc).isoformat()
    return {
        "run_id": str(run_id),
        "tenant_id": str(uuid4()),
        "business_id": payload["business_id"],
        "env_id": payload.get("env_id"),
        "execution_id": str(uuid4()),
        "property_name": payload["property_name"],
        "property_type": payload["property_type"],
        "status": "created",
        "research_version": 0,
        "normalized_version": 0,
        "model_input_version": 0,
        "output_version": 0,
        "model_version": "uw_model_v1",
        "normalization_version": "uw_norm_v1",
        "contract_version": payload.get("contract_version", "uw_research_contract_v1"),
        "input_hash": input_hash,
        "dataset_version_id": None,
        "rule_version_id": None,
        "error_message": None,
        "created_at": now,
        "updated_at": now,
    }


def test_research_contract_endpoint(client):
    resp = client.get("/api/underwriting/contracts/research")
    assert resp.status_code == 200
    body = resp.json()
    assert body["contract_version"] == "uw_research_contract_v1"
    assert "properties" in body["schema"]


def test_ingest_research_rejects_uncited_fact(client):
    run_id = str(uuid4())
    payload = {
        "contract_version": "uw_research_contract_v1",
        "sources": [],
        "extracted_datapoints": [
            {
                "datum_key": "vacancy_rate",
                "fact_class": "fact",
                "value": "5.0%",
                "unit": "pct_decimal",
            }
        ],
        "sale_comps": [],
        "lease_comps": [],
        "market_snapshot": [],
        "unknowns": [],
        "assumption_suggestions": [],
    }
    resp = client.post(f"/api/underwriting/runs/{run_id}/ingest-research", json=payload)
    assert resp.status_code == 422
    assert "requires citation_key" in resp.json()["detail"]


def test_create_run_idempotent_behavior(client, monkeypatch):
    state: dict[str, dict] = {}

    def _mock_create_run(req):
        payload = req.model_dump(mode="python")
        row = _run_row_from_payload(payload)
        state.setdefault(row["input_hash"], row)
        return state[row["input_hash"]]

    monkeypatch.setattr("app.routes.underwriting.uw_svc.create_run", _mock_create_run)

    business_id = str(uuid4())
    base_payload = {
        "business_id": business_id,
        "property_name": "Sunset Gardens",
        "property_type": "multifamily",
        "city": "Dallas",
        "state_province": "TX",
        "gross_area_sf": 125000,
        "unit_count": 220,
        "occupancy_pct": 0.94,
        "in_place_noi_cents": 520000000,
        "purchase_price_cents": 8600000000,
    }
    r1 = client.post("/api/underwriting/runs", json=base_payload)
    r2 = client.post("/api/underwriting/runs", json=base_payload)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["run_id"] == r2.json()["run_id"]

    r3 = client.post(
        "/api/underwriting/runs",
        json={**base_payload, "property_name": "Sunset Gardens Annex"},
    )
    assert r3.status_code == 200
    assert r3.json()["run_id"] != r1.json()["run_id"]


def test_run_scenarios_and_reports_endpoint_shapes(client, monkeypatch):
    run_id = str(uuid4())

    def _mock_run_scenarios(*, run_id, req):
        return {
            "run_id": run_id,
            "status": "completed",
            "model_input_version": 1,
            "output_version": 1,
            "scenarios": [
                {
                    "scenario_id": str(uuid4()),
                    "name": "Base",
                    "scenario_type": "base",
                    "recommendation": "buy",
                    "valuation": {"direct_cap_value_cents": 1},
                    "returns": {"levered_irr": 0.12},
                    "debt": {"min_dscr": 1.3},
                    "sensitivities": {},
                }
            ],
        }

    def _mock_get_reports(*, run_id):
        return {
            "run_id": run_id,
            "scenarios": [
                {
                    "scenario_id": str(uuid4()),
                    "name": "Base",
                    "scenario_type": "base",
                    "recommendation": "buy",
                    "artifacts": {
                        "ic_memo_md": {
                            "artifact_type": "ic_memo_md",
                            "content_md": "# memo",
                            "content_json": None,
                        }
                    },
                }
            ],
        }

    monkeypatch.setattr("app.routes.underwriting.uw_svc.run_scenarios", _mock_run_scenarios)
    monkeypatch.setattr("app.routes.underwriting.uw_svc.get_reports", _mock_get_reports)

    scenario_resp = client.post(
        f"/api/underwriting/runs/{run_id}/scenarios/run",
        json={"include_defaults": True, "custom_scenarios": []},
    )
    assert scenario_resp.status_code == 200
    assert scenario_resp.json()["status"] == "completed"
    assert len(scenario_resp.json()["scenarios"]) == 1

    reports_resp = client.get(f"/api/underwriting/runs/{run_id}/reports")
    assert reports_resp.status_code == 200
    assert len(reports_resp.json()["scenarios"]) == 1
