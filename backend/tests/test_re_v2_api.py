"""Tests for the RE v2 institutional API routes."""
from __future__ import annotations

from uuid import uuid4

import app.routes.re_v2 as re_v2_routes


def _inv_row(fund_id: str, inv_id: str | None = None) -> dict:
    return {
        "investment_id": inv_id or str(uuid4()),
        "fund_id": fund_id,
        "name": "Downtown Office JV",
        "investment_type": "equity",
        "stage": "operating",
        "sponsor": "Acme Sponsor",
        "target_close_date": "2026-06-30",
        "committed_capital": "50000000",
        "invested_capital": "40000000",
        "realized_distributions": "5000000",
        "created_at": "2026-01-15T00:00:00",
    }


def _jv_row(inv_id: str, jv_id: str | None = None) -> dict:
    return {
        "jv_id": jv_id or str(uuid4()),
        "investment_id": inv_id,
        "legal_name": "Downtown JV LLC",
        "ownership_percent": "0.800000000000",
        "gp_percent": "0.200000000000",
        "lp_percent": "0.800000000000",
        "promote_structure_id": None,
        "status": "active",
        "created_at": "2026-01-15T00:00:00",
    }


def _partner_row(business_id: str) -> dict:
    return {
        "partner_id": str(uuid4()),
        "business_id": business_id,
        "entity_id": None,
        "name": "Test LP Fund",
        "partner_type": "lp",
        "created_at": "2026-01-01T00:00:00",
    }


def test_list_investments(client, monkeypatch):
    fund_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_investment,
        "list_investments",
        lambda **_: [_inv_row(fund_id)],
    )
    resp = client.get(f"/api/re/v2/funds/{fund_id}/investments")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Downtown Office JV"


def test_create_investment(client, monkeypatch):
    fund_id = str(uuid4())
    inv_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_investment,
        "create_investment",
        lambda **_: _inv_row(fund_id, inv_id),
    )
    resp = client.post(
        f"/api/re/v2/funds/{fund_id}/investments",
        json={"name": "Downtown Office JV", "deal_type": "equity"},
    )
    assert resp.status_code == 201
    assert resp.json()["investment_id"] == inv_id


def test_get_investment(client, monkeypatch):
    inv_id = str(uuid4())
    fund_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_investment,
        "get_investment",
        lambda **_: _inv_row(fund_id, inv_id),
    )
    resp = client.get(f"/api/re/v2/investments/{inv_id}")
    assert resp.status_code == 200
    assert resp.json()["investment_id"] == inv_id


def test_list_jvs(client, monkeypatch):
    inv_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_jv,
        "list_jvs",
        lambda **_: [_jv_row(inv_id)],
    )
    resp = client.get(f"/api/re/v2/investments/{inv_id}/jvs")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_create_jv(client, monkeypatch):
    inv_id = str(uuid4())
    jv_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_jv,
        "create_jv",
        lambda **_: _jv_row(inv_id, jv_id),
    )
    resp = client.post(
        f"/api/re/v2/investments/{inv_id}/jvs",
        json={"legal_name": "Downtown JV LLC", "ownership_percent": 0.8},
    )
    assert resp.status_code == 201
    assert resp.json()["jv_id"] == jv_id


def test_create_partner(client, monkeypatch):
    biz_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_partner,
        "create_partner",
        lambda **_: _partner_row(biz_id),
    )
    resp = client.post(
        f"/api/re/v2/partners?business_id={biz_id}",
        json={"name": "Test LP Fund", "partner_type": "lp"},
    )
    assert resp.status_code == 201
    assert resp.json()["partner_type"] == "lp"


def test_list_fund_partners(client, monkeypatch):
    fund_id = str(uuid4())
    biz_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_partner,
        "list_fund_partners",
        lambda **_: [_partner_row(biz_id)],
    )
    resp = client.get(f"/api/re/v2/funds/{fund_id}/partners")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_record_capital_entry(client, monkeypatch):
    fund_id = str(uuid4())
    partner_id = str(uuid4())
    entry_id = str(uuid4())

    monkeypatch.setattr(
        re_v2_routes.re_capital_ledger,
        "record_entry",
        lambda **_: {
            "entry_id": entry_id,
            "fund_id": fund_id,
            "investment_id": None,
            "jv_id": None,
            "partner_id": partner_id,
            "entry_type": "contribution",
            "amount": "10000000",
            "currency": "USD",
            "fx_rate_to_base": "1.0",
            "amount_base": "10000000",
            "effective_date": "2026-03-31",
            "quarter": "2026Q1",
            "memo": "First call",
            "source": "manual",
            "source_ref": None,
            "run_id": None,
            "created_at": "2026-03-31T00:00:00",
        },
    )

    resp = client.post(
        f"/api/re/v2/funds/{fund_id}/capital-ledger",
        json={
            "partner_id": partner_id,
            "entry_type": "contribution",
            "amount": 10000000,
            "effective_date": "2026-03-31",
            "quarter": "2026Q1",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["entry_type"] == "contribution"


def test_list_scenarios(client, monkeypatch):
    fund_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_scenario,
        "list_scenarios",
        lambda **_: [
            {
                "scenario_id": str(uuid4()),
                "fund_id": fund_id,
                "name": "Base",
                "description": None,
                "scenario_type": "base",
                "is_base": True,
                "parent_scenario_id": None,
                "base_assumption_set_id": None,
                "status": "active",
                "created_at": "2026-01-01T00:00:00",
            }
        ],
    )
    resp = client.get(f"/api/re/v2/funds/{fund_id}/scenarios")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["is_base"] is True


def test_quarter_close(client, monkeypatch):
    fund_id = str(uuid4())
    run_id = str(uuid4())

    monkeypatch.setattr(
        re_v2_routes.re_quarter_close,
        "run_quarter_close",
        lambda **_: {
            "run_id": run_id,
            "fund_id": fund_id,
            "quarter": "2026Q1",
            "scenario_id": None,
            "fund_state": None,
            "fund_metrics": None,
            "waterfall_run": None,
            "assets_processed": 3,
            "jvs_processed": 1,
            "investments_processed": 1,
            "status": "success",
        },
    )

    resp = client.post(
        f"/api/re/v2/funds/{fund_id}/quarter-close",
        json={"quarter": "2026Q1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["assets_processed"] == 3


def test_investment_not_found(client, monkeypatch):
    inv_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_investment,
        "get_investment",
        lambda **_: (_ for _ in ()).throw(LookupError("Not found")),
    )
    resp = client.get(f"/api/re/v2/investments/{inv_id}")
    assert resp.status_code == 404
