from __future__ import annotations

from uuid import uuid4

import app.routes.repe as repe_routes


def _assert_headers(resp, repe_log_context):
    assert resp.headers["X-Request-Id"] == repe_log_context["request_id"]
    assert resp.headers["X-Run-Id"] == repe_log_context["run_id"]


def test_funds_create_list_get(client, monkeypatch, repe_log_context):
    business_id = str(uuid4())
    fund_id = str(uuid4())

    monkeypatch.setattr(
        repe_routes.repe,
        "list_funds",
        lambda **_: [
            {
                "fund_id": fund_id,
                "business_id": business_id,
                "name": "GreenRock Value Add Fund I",
                "vintage_year": 2026,
                "fund_type": "closed_end",
                "strategy": "equity",
                "sub_strategy": "value_add",
                "target_size": "500000000",
                "term_years": 10,
                "status": "investing",
                "created_at": "2026-01-01T00:00:00",
            }
        ],
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "create_fund",
        lambda **_: {
            "fund_id": fund_id,
            "business_id": business_id,
            "name": "GreenRock Value Add Fund I",
            "vintage_year": 2026,
            "fund_type": "closed_end",
            "strategy": "equity",
            "sub_strategy": "value_add",
            "target_size": "500000000",
            "term_years": 10,
            "status": "investing",
            "created_at": "2026-01-01T00:00:00",
        },
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "get_fund",
        lambda **_: (
            {
                "fund_id": fund_id,
                "business_id": business_id,
                "name": "GreenRock Value Add Fund I",
                "vintage_year": 2026,
                "fund_type": "closed_end",
                "strategy": "equity",
                "sub_strategy": "value_add",
                "target_size": "500000000",
                "term_years": 10,
                "status": "investing",
                "created_at": "2026-01-01T00:00:00",
            },
            [
                {
                    "fund_term_id": str(uuid4()),
                    "fund_id": fund_id,
                    "effective_from": "2026-01-01",
                    "effective_to": None,
                    "management_fee_rate": "0.02",
                    "management_fee_basis": "committed",
                    "preferred_return_rate": "0.08",
                    "carry_rate": "0.20",
                    "waterfall_style": "european",
                    "catch_up_style": "full",
                    "created_at": "2026-01-01T00:00:00",
                }
            ],
        ),
    )

    create_resp = client.post(
        f"/api/repe/businesses/{business_id}/funds",
        headers=repe_log_context["headers"],
        json={
            "name": "GreenRock Value Add Fund I",
            "vintage_year": 2026,
            "fund_type": "closed_end",
            "strategy": "equity",
            "sub_strategy": "value_add",
            "target_size": "500000000",
            "term_years": 10,
            "status": "investing",
        },
    )
    _assert_headers(create_resp, repe_log_context)
    assert create_resp.status_code == 200

    list_resp = client.get(
        f"/api/repe/businesses/{business_id}/funds",
        headers=repe_log_context["headers"],
    )
    _assert_headers(list_resp, repe_log_context)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    get_resp = client.get(f"/api/repe/funds/{fund_id}", headers=repe_log_context["headers"])
    _assert_headers(get_resp, repe_log_context)
    assert get_resp.status_code == 200
    assert get_resp.json()["fund"]["fund_id"] == fund_id


def test_deals_assets_and_ownership(client, monkeypatch, repe_log_context):
    fund_id = str(uuid4())
    deal_id = str(uuid4())
    asset_id = str(uuid4())

    monkeypatch.setattr(
        repe_routes.repe,
        "list_deals",
        lambda **_: [
            {
                "deal_id": deal_id,
                "fund_id": fund_id,
                "name": "Sunset Towers Acquisition",
                "deal_type": "equity",
                "stage": "underwriting",
                "sponsor": "Sponsor",
                "target_close_date": "2026-06-30",
                "created_at": "2026-01-01T00:00:00",
            }
        ],
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "create_deal",
        lambda **_: {
            "deal_id": deal_id,
            "fund_id": fund_id,
            "name": "Sunset Towers Acquisition",
            "deal_type": "equity",
            "stage": "underwriting",
            "sponsor": "Sponsor",
            "target_close_date": "2026-06-30",
            "created_at": "2026-01-01T00:00:00",
        },
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "get_deal",
        lambda **_: {
            "deal_id": deal_id,
            "fund_id": fund_id,
            "name": "Sunset Towers Acquisition",
            "deal_type": "equity",
            "stage": "underwriting",
            "sponsor": "Sponsor",
            "target_close_date": "2026-06-30",
            "created_at": "2026-01-01T00:00:00",
        },
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "create_asset",
        lambda **_: {
            "asset_id": asset_id,
            "deal_id": deal_id,
            "asset_type": "property",
            "name": "Sunset Towers",
            "created_at": "2026-01-01T00:00:00",
        },
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "list_assets",
        lambda **_: [
            {
                "asset_id": asset_id,
                "deal_id": deal_id,
                "asset_type": "property",
                "name": "Sunset Towers",
                "created_at": "2026-01-01T00:00:00",
            }
        ],
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "get_asset",
        lambda **_: (
            {
                "asset_id": asset_id,
                "deal_id": deal_id,
                "asset_type": "property",
                "name": "Sunset Towers",
                "created_at": "2026-01-01T00:00:00",
            },
            {"property_type": "multifamily", "units": 280},
        ),
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "get_asset_ownership",
        lambda **_: {
            "asset_id": asset_id,
            "as_of_date": "2026-02-20",
            "links": [],
            "entity_edges": [],
        },
    )

    create_deal_resp = client.post(
        f"/api/repe/funds/{fund_id}/deals",
        headers=repe_log_context["headers"],
        json={
            "name": "Sunset Towers Acquisition",
            "deal_type": "equity",
            "stage": "underwriting",
        },
    )
    _assert_headers(create_deal_resp, repe_log_context)
    assert create_deal_resp.status_code == 200

    list_deals_resp = client.get(f"/api/repe/funds/{fund_id}/deals", headers=repe_log_context["headers"])
    _assert_headers(list_deals_resp, repe_log_context)
    assert list_deals_resp.status_code == 200

    get_deal_resp = client.get(f"/api/repe/deals/{deal_id}", headers=repe_log_context["headers"])
    _assert_headers(get_deal_resp, repe_log_context)
    assert get_deal_resp.status_code == 200

    create_asset_resp = client.post(
        f"/api/repe/deals/{deal_id}/assets",
        headers=repe_log_context["headers"],
        json={
            "asset_type": "property",
            "name": "Sunset Towers",
            "property_type": "multifamily",
            "units": 280,
        },
    )
    _assert_headers(create_asset_resp, repe_log_context)
    assert create_asset_resp.status_code == 200

    list_assets_resp = client.get(f"/api/repe/deals/{deal_id}/assets", headers=repe_log_context["headers"])
    _assert_headers(list_assets_resp, repe_log_context)
    assert list_assets_resp.status_code == 200

    get_asset_resp = client.get(f"/api/repe/assets/{asset_id}", headers=repe_log_context["headers"])
    _assert_headers(get_asset_resp, repe_log_context)
    assert get_asset_resp.status_code == 200

    ownership_resp = client.get(f"/api/repe/assets/{asset_id}/ownership", headers=repe_log_context["headers"])
    _assert_headers(ownership_resp, repe_log_context)
    assert ownership_resp.status_code == 200


def test_entities_ownership_seed_and_validation(client, monkeypatch, repe_log_context):
    business_id = str(uuid4())
    entity_id = str(uuid4())

    monkeypatch.setattr(
        repe_routes.repe,
        "create_entity",
        lambda **_: {
            "entity_id": entity_id,
            "business_id": business_id,
            "name": "GreenRock GP LLC",
            "entity_type": "gp",
            "jurisdiction": "DE",
            "created_at": "2026-01-01T00:00:00",
        },
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "create_ownership_edge",
        lambda **_: {
            "ownership_edge_id": str(uuid4()),
            "from_entity_id": entity_id,
            "to_entity_id": str(uuid4()),
            "percent": "0.6",
            "effective_from": "2026-01-01",
            "effective_to": None,
            "created_at": "2026-01-01T00:00:00",
        },
    )
    monkeypatch.setattr(
        repe_routes.repe,
        "seed_demo",
        lambda **_: {
            "business_id": business_id,
            "funds": [str(uuid4())],
            "deals": [str(uuid4())],
            "assets": [str(uuid4())],
            "entities": [entity_id],
        },
    )

    entity_resp = client.post(
        "/api/repe/entities",
        headers=repe_log_context["headers"],
        json={
            "business_id": business_id,
            "name": "GreenRock GP LLC",
            "entity_type": "gp",
            "jurisdiction": "DE",
        },
    )
    _assert_headers(entity_resp, repe_log_context)
    assert entity_resp.status_code == 200

    edge_resp = client.post(
        "/api/repe/ownership-edges",
        headers=repe_log_context["headers"],
        json={
            "from_entity_id": entity_id,
            "to_entity_id": str(uuid4()),
            "percent": "0.6",
            "effective_from": "2026-01-01",
        },
    )
    _assert_headers(edge_resp, repe_log_context)
    assert edge_resp.status_code == 200

    seed_resp = client.post(f"/api/repe/businesses/{business_id}/seed", headers=repe_log_context["headers"])
    _assert_headers(seed_resp, repe_log_context)
    assert seed_resp.status_code == 200

    invalid = client.post(
        f"/api/repe/businesses/{business_id}/funds",
        headers=repe_log_context["headers"],
        json={"name": "Missing shape"},
    )
    _assert_headers(invalid, repe_log_context)
    assert invalid.status_code == 422
