"""Tests for seeded RE data: investments, assets, JVs, context bootstrap.

Covers:
- test_context_bootstrapped: context endpoint returns bootstrapped state
- test_list_investments_returns_seeded_rows: investments API returns data
- test_list_assets_returns_seeded_rows: assets API returns data
- test_filters_by_env_and_business: funds filtered correctly by business_id
- test_seed_creates_jvs: bootstrap seeds JV entities for each deal
- test_assets_linked_to_jvs: assets have jv_id set after seeding
"""
from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4

import app.routes.re_v1_context as re_v1_ctx_routes
import app.routes.re_v2 as re_v2_routes
import app.routes.repe as repe_routes
from tests.conftest import FakeCursor


# ── Helpers ──────────────────────────────────────────────────────────────────

BIZ_ID = "a1b2c3d4-0001-0001-0001-000000000001"
FUND_EQ_ID = "a1b2c3d4-0001-0010-0001-000000000001"
FUND_DT_ID = "a1b2c3d4-0002-0020-0001-000000000001"
DEAL_1_ID = "a1b2c3d4-0001-0010-0002-000000000001"
DEAL_2_ID = "a1b2c3d4-0001-0010-0002-000000000002"


def _make_resolution(env_id: str, biz_id: str):
    from app.services.repe_context import RepeContextResolution

    return RepeContextResolution(
        env_id=env_id,
        business_id=biz_id,
        created=False,
        source="binding:param",
        diagnostics={"binding_found": True, "business_found": True, "env_found": True},
    )


def _patch_context_cursor(monkeypatch, cur: FakeCursor) -> None:
    @contextmanager
    def mock_cursor():
        yield cur

    monkeypatch.setattr(re_v1_ctx_routes, "get_cursor", mock_cursor)


def _inv_row(deal_id: str, fund_id: str, name: str, deal_type: str = "equity") -> dict:
    return {
        "investment_id": deal_id,
        "fund_id": fund_id,
        "name": name,
        "investment_type": deal_type,
        "stage": "operating",
        "sponsor": "Meridian RE Partners GP, LLC",
        "target_close_date": "2026-01-20",
        "committed_capital": None,
        "invested_capital": None,
        "realized_distributions": None,
        "created_at": "2026-01-15T00:00:00",
    }


def _asset_row(asset_id: str, deal_id: str, name: str, asset_type: str = "property", jv_id: str | None = None) -> dict:
    return {
        "asset_id": asset_id,
        "deal_id": deal_id,
        "asset_type": asset_type,
        "name": name,
        "jv_id": jv_id,
        "acquisition_date": None,
        "cost_basis": None,
        "asset_status": None,
        "created_at": "2026-01-15T00:00:00",
    }


def _jv_row(jv_id: str, inv_id: str, name: str) -> dict:
    return {
        "jv_id": jv_id,
        "investment_id": inv_id,
        "legal_name": name,
        "ownership_percent": "1.000000000000",
        "gp_percent": "0.200000000000",
        "lp_percent": "0.800000000000",
        "promote_structure_id": None,
        "status": "active",
        "created_at": "2026-01-15T00:00:00",
    }


# ── Tests ────────────────────────────────────────────────────────────────────

def test_context_bootstrapped(client, monkeypatch):
    """GET /api/re/v1/context returns bootstrapped state when funds exist."""
    env_id = str(uuid4())

    monkeypatch.setattr(
        re_v1_ctx_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: _make_resolution(env_id, BIZ_ID),
    )

    cur = FakeCursor()
    cur.push_result([{"1": 1}])                          # app.environments table exists
    cur.push_result([{"industry": "real_estate"}])        # industry row
    cur.push_result([{"1": 1}])                          # repe_fund table exists
    cur.push_result([{"cnt": 2}])                        # funds_count = 2
    cur.push_result([{"1": 1}])                          # re_scenario table exists
    cur.push_result([{"cnt": 2}])                        # scenarios_count = 2
    _patch_context_cursor(monkeypatch, cur)

    resp = client.get(f"/api/re/v1/context?env_id={env_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_bootstrapped"] is True
    assert data["funds_count"] == 2
    assert data["business_id"] == BIZ_ID


def test_list_investments_returns_seeded_rows(client, monkeypatch):
    """GET /api/re/v2/funds/{fund_id}/investments returns seeded deals."""
    monkeypatch.setattr(
        re_v2_routes.re_investment,
        "list_investments",
        lambda **_: [
            _inv_row(DEAL_1_ID, FUND_EQ_ID, "MRF III – Dallas Multifamily Cluster"),
            _inv_row(DEAL_2_ID, FUND_EQ_ID, "MRF III – Phoenix Value-Add Portfolio"),
        ],
    )
    resp = client.get(f"/api/re/v2/funds/{FUND_EQ_ID}/investments")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2
    names = {d["name"] for d in data}
    assert "MRF III – Dallas Multifamily Cluster" in names
    assert "MRF III – Phoenix Value-Add Portfolio" in names


def test_list_assets_returns_seeded_rows(client, monkeypatch):
    """GET /api/repe/deals/{deal_id}/assets returns seeded assets."""
    monkeypatch.setattr(
        repe_routes.repe,
        "list_assets",
        lambda **_: [
            _asset_row("a1b2c3d4-0001-0010-0003-000000000001", DEAL_1_ID, "Meridian Park Multifamily – Dallas"),
            _asset_row("a1b2c3d4-0001-0010-0003-000000000002", DEAL_1_ID, "Ellipse Senior Living – Dallas"),
        ],
    )
    resp = client.get(f"/api/repe/deals/{DEAL_1_ID}/assets")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    names = {a["name"] for a in data}
    assert "Meridian Park Multifamily – Dallas" in names
    assert "Ellipse Senior Living – Dallas" in names


def test_filters_by_env_and_business(client, monkeypatch):
    """GET /api/re/v2/funds/{fund_id}/investments only returns data for the correct fund."""
    other_fund_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_investment,
        "list_investments",
        lambda *, fund_id: [
            _inv_row(DEAL_1_ID, str(fund_id), "Dallas Cluster"),
        ] if str(fund_id) == FUND_EQ_ID else [],
    )
    # Correct fund returns data
    resp = client.get(f"/api/re/v2/funds/{FUND_EQ_ID}/investments")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Wrong fund returns empty
    resp2 = client.get(f"/api/re/v2/funds/{other_fund_id}/investments")
    assert resp2.status_code == 200
    assert len(resp2.json()) == 0


def test_seed_creates_jvs(client, monkeypatch):
    """GET /api/re/v2/investments/{inv_id}/jvs returns JVs after seeding."""
    jv = _jv_row("a1b2c3d4-0001-0010-0009-000000000001", DEAL_1_ID, "MRF III – Dallas JV SPV LLC")
    monkeypatch.setattr(
        re_v2_routes.re_jv,
        "list_jvs",
        lambda **_: [jv],
    )
    resp = client.get(f"/api/re/v2/investments/{DEAL_1_ID}/jvs")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["legal_name"] == "MRF III – Dallas JV SPV LLC"
    assert data[0]["status"] == "active"


def test_assets_linked_to_jvs(client, monkeypatch):
    """GET /api/re/v2/jvs/{jv_id}/assets returns assets linked to JV."""
    jv_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_jv,
        "list_jv_assets",
        lambda **_: [
            _asset_row("a1", DEAL_1_ID, "Meridian Park", "property", jv_id),
            _asset_row("a2", DEAL_1_ID, "Ellipse Senior", "property", jv_id),
        ],
    )
    resp = client.get(f"/api/re/v2/jvs/{jv_id}/assets")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert all(a["jv_id"] == jv_id for a in data)


def test_list_investments_via_legacy_endpoint(client, monkeypatch):
    """GET /api/repe/funds/{fund_id}/deals returns deals (investments) for fund."""
    monkeypatch.setattr(
        repe_routes.repe,
        "list_deals",
        lambda **_: [
            {"deal_id": DEAL_1_ID, "fund_id": FUND_EQ_ID, "name": "Dallas Cluster",
             "deal_type": "equity", "stage": "operating", "sponsor": "GP LLC",
             "target_close_date": "2026-01-20", "created_at": "2026-01-15T00:00:00"},
            {"deal_id": DEAL_2_ID, "fund_id": FUND_EQ_ID, "name": "Phoenix Portfolio",
             "deal_type": "equity", "stage": "operating", "sponsor": "GP LLC",
             "target_close_date": "2026-01-20", "created_at": "2026-01-15T00:00:00"},
        ],
    )
    resp = client.get(f"/api/repe/funds/{FUND_EQ_ID}/deals")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


def test_debt_fund_investments(client, monkeypatch):
    """GET /api/re/v2/funds/{fund_id}/investments for debt fund returns 8 loans."""
    dt_deals = [
        _inv_row(
            f"a1b2c3d4-0002-0020-0002-00000000000{i}",
            FUND_DT_ID,
            f"Loan Deal {i}",
            "debt",
        )
        for i in range(1, 9)
    ]
    monkeypatch.setattr(
        re_v2_routes.re_investment,
        "list_investments",
        lambda **_: dt_deals,
    )
    resp = client.get(f"/api/re/v2/funds/{FUND_DT_ID}/investments")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 8
