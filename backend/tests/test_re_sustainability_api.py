from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import app.routes.re_sustainability as sus_routes


def _now() -> datetime:
    return datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


def test_get_overview(client, monkeypatch):
    business_id = uuid4()

    monkeypatch.setattr(
        sus_routes.re_sustainability,
        "get_overview",
        lambda **_: {
            "quarter": "2026Q1",
            "year": 2026,
            "top_cards": {
                "total_annual_energy_kwh_equiv": 1250000,
                "total_emissions_tons": 420.5,
            },
            "audit_timestamp": _now(),
            "open_issues": 2,
            "context": {"env_id": "env-demo", "business_id": business_id},
        },
    )

    resp = client.get(
        "/api/re/v2/sustainability/overview",
        params={"env_id": "env-demo", "business_id": str(business_id), "quarter": "2026Q1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["quarter"] == "2026Q1"
    assert data["open_issues"] == 2


def test_get_asset_dashboard_not_applicable(client, monkeypatch):
    asset_id = uuid4()

    monkeypatch.setattr(
        sus_routes.re_sustainability,
        "get_asset_dashboard",
        lambda **_: {
            "asset_id": asset_id,
            "not_applicable": True,
            "reason": "Debt assets are excluded from sustainability calculations.",
            "cards": {},
            "trends": {},
            "utility_rows": [],
            "issues": [],
            "profile": {},
            "audit_timestamp": _now(),
        },
    )

    resp = client.get(f"/api/re/v2/sustainability/assets/{asset_id}/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert data["not_applicable"] is True
    assert "excluded" in data["reason"]


def test_import_utility_monthly(client, monkeypatch):
    business_id = uuid4()
    ingestion_run_id = uuid4()

    monkeypatch.setattr(
        sus_routes.re_sustainability_ingestion,
        "import_utility_csv",
        lambda **_: {
            "ingestion_run_id": ingestion_run_id,
            "filename": "utility.csv",
            "rows_read": 4,
            "rows_written": 3,
            "rows_blocked": 1,
            "issue_count": 1,
            "sha256": "abc123",
            "status": "success",
        },
    )

    resp = client.post(
        "/api/re/v2/sustainability/utility-monthly/import",
        json={
            "env_id": "env-demo",
            "business_id": str(business_id),
            "filename": "utility.csv",
            "csv_text": "asset_id,utility_type,year,month,usage_kwh,cost_total\n",
            "import_mode": "manual",
            "created_by": "test",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["rows_written"] == 3
    assert data["rows_blocked"] == 1


def test_run_projection(client, monkeypatch):
    fund_id = uuid4()
    scenario_id = uuid4()
    projection_run_id = uuid4()

    monkeypatch.setattr(
        sus_routes.re_sustainability_projection,
        "run_projection",
        lambda **_: {
            "projection_run_id": projection_run_id,
            "fund_id": fund_id,
            "scenario_id": scenario_id,
            "status": "success",
            "summary": {
                "projected_fund_irr": 0.138,
                "projected_lp_net_irr": 0.112,
            },
            "created_at": _now(),
        },
    )

    resp = client.post(
        "/api/re/v2/sustainability/scenarios/run",
        json={
            "fund_id": str(fund_id),
            "scenario_id": str(scenario_id),
            "base_quarter": "2026Q1",
            "horizon_years": 5,
            "projection_mode": "carbon_tax",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["projection_run_id"] == str(projection_run_id)
    assert data["summary"]["projected_fund_irr"] == 0.138


def test_report_payload_validation_error_maps_to_400(client, monkeypatch):
    fund_id = uuid4()

    monkeypatch.setattr(
        sus_routes.re_sustainability_reporting,
        "build_report_payload",
        lambda **_: (_ for _ in ()).throw(ValueError("Unsupported report key")),
    )

    resp = client.get(f"/api/re/v2/sustainability/funds/{fund_id}/reports/gresb")
    assert resp.status_code == 400
    data = resp.json()
    assert data["detail"]["error_code"] == "VALIDATION_ERROR"
