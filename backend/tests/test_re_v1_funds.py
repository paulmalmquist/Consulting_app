from __future__ import annotations

from uuid import uuid4

import app.routes.re_v1_funds as re_v1_funds_routes
from app.services import repe_context


def _assert_headers(resp, repe_log_context):
    assert resp.headers["X-Request-Id"] == repe_log_context["request_id"]
    assert resp.headers["X-Run-Id"] == repe_log_context["run_id"]


def _fund_row(*, fund_id: str, business_id: str):
    return {
        "fund_id": fund_id,
        "business_id": business_id,
        "name": "Atlas Real Estate Fund I",
        "vintage_year": 2026,
        "fund_type": "closed_end",
        "strategy": "equity",
        "sub_strategy": "value_add",
        "target_size": "250000000",
        "term_years": 10,
        "status": "investing",
        "base_currency": "USD",
        "inception_date": "2026-01-01",
        "quarter_cadence": "quarterly",
        "target_sectors_json": ["multifamily"],
        "target_geographies_json": ["US"],
        "metadata_json": {},
        "created_at": "2026-01-01T00:00:00",
    }


def test_list_re_v1_funds_with_env_context(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    fund_id = str(uuid4())

    monkeypatch.setattr(
        re_v1_funds_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: repe_context.RepeContextResolution(
            env_id=env_id,
            business_id=business_id,
            created=False,
            source="test",
            diagnostics={"binding_found": True},
        ),
    )
    monkeypatch.setattr(
        re_v1_funds_routes.repe,
        "list_funds",
        lambda **_: [_fund_row(fund_id=fund_id, business_id=business_id)],
    )

    resp = client.get(
        f"/api/re/v1/funds?env_id={env_id}",
        headers=repe_log_context["headers"],
    )
    _assert_headers(resp, repe_log_context)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["fund_id"] == fund_id
    assert body[0]["base_currency"] == "USD"


def test_create_re_v1_fund_writes_audit_event(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    fund_id = str(uuid4())
    calls: list[dict] = []

    monkeypatch.setattr(
        re_v1_funds_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: repe_context.RepeContextResolution(
            env_id=env_id,
            business_id=business_id,
            created=True,
            source="test",
            diagnostics={"binding_found": False},
        ),
    )
    monkeypatch.setattr(
        re_v1_funds_routes.repe,
        "create_fund",
        lambda **_: _fund_row(fund_id=fund_id, business_id=business_id),
    )
    monkeypatch.setattr(
        re_v1_funds_routes.audit_svc,
        "record_event",
        lambda **kwargs: calls.append(kwargs),
    )

    resp = client.post(
        "/api/re/v1/funds",
        headers=repe_log_context["headers"],
        json={
            "env_id": env_id,
            "name": "Atlas Real Estate Fund I",
            "vintage_year": 2026,
            "fund_type": "closed_end",
            "strategy": "equity",
            "status": "investing",
            "base_currency": "USD",
            "inception_date": "2026-01-01",
            "quarter_cadence": "quarterly",
            "initial_waterfall_template": "european",
        },
    )
    _assert_headers(resp, repe_log_context)
    assert resp.status_code == 200
    assert resp.json()["fund_id"] == fund_id

    assert len(calls) == 1
    assert calls[0]["action"] == "fund.created"
    assert calls[0]["tool_name"] == "re.v1.funds.create"
    assert calls[0]["object_type"] == "fund"


def test_get_re_v1_fund_details(client, monkeypatch, repe_log_context):
    fund_id = str(uuid4())
    business_id = str(uuid4())

    monkeypatch.setattr(
        re_v1_funds_routes.repe,
        "get_fund",
        lambda **_: (
            _fund_row(fund_id=fund_id, business_id=business_id),
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

    resp = client.get(
        f"/api/re/v1/funds/{fund_id}",
        headers=repe_log_context["headers"],
    )
    _assert_headers(resp, repe_log_context)
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["fund"]["fund_id"] == fund_id
    assert len(payload["terms"]) == 1
