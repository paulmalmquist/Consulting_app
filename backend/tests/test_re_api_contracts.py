from __future__ import annotations

import app.routes.re_fund as re_fund_routes
import app.routes.re_montecarlo as re_montecarlo_routes
import app.routes.re_scenarios as re_scenarios_routes
import app.routes.re_surveillance as re_surveillance_routes
import app.routes.re_valuation as re_valuation_routes
import app.routes.re_waterfall as re_waterfall_routes


def test_post_valuation_run_quarter_contract(client, monkeypatch):
    monkeypatch.setattr(
        re_valuation_routes.svc,
        "run_quarter",
        lambda **_: {
            "valuation_snapshot": {"valuation_snapshot_id": "vs_1", "input_hash": "abc"},
            "asset_financial_state": {"id": "afs_1", "valuation_snapshot_id": "vs_1"},
            "input_hash": "abc",
        },
    )

    resp = client.post(
        "/api/re/valuation/run-quarter",
        json={
            "fin_asset_investment_id": "asset_1",
            "quarter": "2026Q1",
            "assumption_set_id": "as_1",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "valuation_snapshot" in body
    assert "asset_financial_state" in body
    assert body["valuation_snapshot"]["valuation_snapshot_id"] == "vs_1"


def test_post_waterfall_run_shadow_contract(client, monkeypatch):
    monkeypatch.setattr(
        __import__("app.services.re_waterfall", fromlist=["run_shadow"]),
        "run_shadow",
        lambda **_: {
            "waterfall_snapshot": {"waterfall_snapshot_id": "wf_1"},
            "tier_allocations": [],
            "asset_proceeds": [],
            "investor_allocations": [],
        },
    )

    resp = client.post(
        "/api/re/waterfall/run-shadow",
        json={"fin_fund_id": "fund_1", "quarter": "2026Q1", "waterfall_style": "european"},
    )
    assert resp.status_code == 200
    assert resp.json()["waterfall_snapshot"]["waterfall_snapshot_id"] == "wf_1"


def test_post_fund_compute_summary_contract(client, monkeypatch):
    monkeypatch.setattr(
        __import__("app.services.re_fund_aggregation", fromlist=["compute"]),
        "compute",
        lambda **_: {"id": "fs_1", "fin_fund_id": "fund_1", "quarter": "2026Q1", "portfolio_nav": "100"},
    )

    resp = client.post("/api/re/fund/compute-summary", json={"fin_fund_id": "fund_1", "quarter": "2026Q1"})
    assert resp.status_code == 200
    assert resp.json()["id"] == "fs_1"


def test_post_refinance_simulate_contract(client, monkeypatch):
    monkeypatch.setattr(
        __import__("app.services.re_refinance", fromlist=["simulate"]),
        "simulate",
        lambda **_: {"id": "refi_1", "valuation_snapshot_id": "vs_1", "viability_score": 75},
    )

    resp = client.post(
        "/api/re/refinance/simulate",
        json={"fin_asset_investment_id": "asset_1", "quarter": "2026Q1", "new_rate": 0.06},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == "refi_1"


def test_post_stress_run_contract(client, monkeypatch):
    monkeypatch.setattr(
        __import__("app.services.re_stress", fromlist=["run"]),
        "run",
        lambda **_: [{"id": "stress_1", "valuation_snapshot_id": "vs_1", "delta_nav": "-100"}],
    )

    resp = client.post("/api/re/stress/run", json={"fin_asset_investment_id": "asset_1", "quarter": "2026Q1"})
    assert resp.status_code == 200
    assert resp.json()[0]["id"] == "stress_1"


def test_post_surveillance_compute_contract(client, monkeypatch):
    monkeypatch.setattr(
        __import__("app.services.re_surveillance", fromlist=["compute"]),
        "compute",
        lambda **_: {"id": "surv_1", "valuation_snapshot_id": "vs_1", "risk_classification": "LOW"},
    )

    resp = client.post("/api/re/surveillance/compute", json={"fin_asset_investment_id": "asset_1", "quarter": "2026Q1"})
    assert resp.status_code == 200
    assert resp.json()["id"] == "surv_1"


def test_post_montecarlo_run_contract(client, monkeypatch):
    monkeypatch.setattr(
        __import__("app.services.re_monte_carlo", fromlist=["run"]),
        "run",
        lambda **_: {"run": {"id": "mc_run_1"}, "result": {"id": "mc_res_1"}},
    )

    resp = client.post("/api/re/montecarlo/run", json={"fin_asset_investment_id": "asset_1", "quarter": "2026Q1"})
    assert resp.status_code == 200
    assert resp.json()["run"]["id"] == "mc_run_1"


def test_get_asset_quarter_contract(client, monkeypatch):
    monkeypatch.setattr(
        re_valuation_routes.svc,
        "get_asset_financial_state",
        lambda *_: {"id": "afs_1", "valuation_snapshot_id": "vs_1", "quarter": "2026Q1"},
    )

    resp = client.get("/api/re/asset/asset_1/quarter/2026Q1")
    assert resp.status_code == 200
    assert resp.json()["id"] == "afs_1"


def test_get_fund_summary_contract(client, monkeypatch):
    monkeypatch.setattr(
        __import__("app.services.re_fund_aggregation", fromlist=["get_fund_summary"]),
        "get_fund_summary",
        lambda *_: {"id": "fs_1", "quarter": "2026Q1", "portfolio_nav": "100"},
    )

    resp = client.get("/api/re/fund/fund_1/summary/2026Q1")
    assert resp.status_code == 200
    assert resp.json()["id"] == "fs_1"


def test_get_investor_statement_contract(client, monkeypatch):
    monkeypatch.setattr(
        __import__("app.services.re_capital_accounts", fromlist=["get_investor_statement"]),
        "get_investor_statement",
        lambda *_: {
            "investor_id": "inv_1",
            "fund_id": "fund_1",
            "quarter": "2026Q1",
            "dpi": "1.1",
            "rvpi": "0.5",
            "tvpi": "1.6",
        },
    )

    resp = client.get("/api/re/investor/inv_1/statement/fund_1/2026Q1")
    assert resp.status_code == 200
    assert resp.json()["investor_id"] == "inv_1"
