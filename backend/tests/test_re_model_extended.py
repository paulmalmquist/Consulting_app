"""Tests for the extended RE model API routes (scope, overrides, run, MC)."""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import app.routes.re_v2 as re_v2_routes


def _model_row(fund_id: str, model_id: str | None = None) -> dict:
    return {
        "model_id": model_id or str(uuid4()),
        "fund_id": fund_id,
        "name": "Base Case Q4",
        "description": "Q4 base case model",
        "status": "draft",
        "strategy_type": "equity",
        "base_snapshot_id": None,
        "created_by": None,
        "approved_at": None,
        "approved_by": None,
        "created_at": "2026-01-15T00:00:00",
        "updated_at": "2026-01-15T00:00:00",
    }


def _scope_row(model_id: str) -> dict:
    return {
        "id": str(uuid4()),
        "model_id": model_id,
        "scope_type": "asset",
        "scope_node_id": str(uuid4()),
        "include": True,
        "created_at": "2026-01-15T00:00:00",
    }


def _override_row(model_id: str) -> dict:
    return {
        "id": str(uuid4()),
        "model_id": model_id,
        "scope_node_type": "asset",
        "scope_node_id": str(uuid4()),
        "key": "exit_cap_rate",
        "value_type": "decimal",
        "value_decimal": "0.065",
        "value_int": None,
        "value_text": None,
        "value_json": None,
        "reason": "Stress test",
        "is_active": True,
        "created_at": "2026-01-15T00:00:00",
    }


# ── Model CRUD ───────────────────────────────────────────────────────────────


def test_list_models(client, monkeypatch):
    fund_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "list_models",
        lambda **_: [_model_row(fund_id)],
    )
    resp = client.get(f"/api/re/v2/funds/{fund_id}/models")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Base Case Q4"
    assert data[0]["strategy_type"] == "equity"


def test_create_model_with_strategy(client, monkeypatch):
    fund_id = str(uuid4())
    model_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "create_model",
        lambda **_: _model_row(fund_id, model_id),
    )
    resp = client.post(
        f"/api/re/v2/funds/{fund_id}/models",
        json={"name": "Base Case Q4", "strategy_type": "equity"},
    )
    assert resp.status_code == 201
    assert resp.json()["model_id"] == model_id
    assert resp.json()["strategy_type"] == "equity"


def test_get_model(client, monkeypatch):
    model_id = str(uuid4())
    fund_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "get_model",
        lambda **_: _model_row(fund_id, model_id),
    )
    resp = client.get(f"/api/re/v2/models/{model_id}")
    assert resp.status_code == 200
    assert resp.json()["model_id"] == model_id


def test_approve_model(client, monkeypatch):
    model_id = str(uuid4())
    fund_id = str(uuid4())
    approved = _model_row(fund_id, model_id)
    approved["status"] = "official_base_case"
    approved["approved_at"] = datetime.now().isoformat()
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "set_official_base_case",
        lambda **_: approved,
    )
    resp = client.patch(
        f"/api/re/v2/models/{model_id}",
        json={"status": "approved"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "official_base_case"


# ── Model Scope ──────────────────────────────────────────────────────────────


def test_list_model_scope(client, monkeypatch):
    model_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "list_model_scope",
        lambda **_: [_scope_row(model_id)],
    )
    resp = client.get(f"/api/re/v2/models/{model_id}/scope")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["scope_type"] == "asset"
    assert data[0]["include"] is True


def test_add_model_scope(client, monkeypatch):
    model_id = str(uuid4())
    scope = _scope_row(model_id)
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "is_model_locked",
        lambda **_: False,
    )
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "add_model_scope",
        lambda **_: scope,
    )
    resp = client.post(
        f"/api/re/v2/models/{model_id}/scope",
        json={"scope_type": "asset", "scope_node_id": scope["scope_node_id"]},
    )
    assert resp.status_code == 201
    assert resp.json()["scope_type"] == "asset"


def test_remove_model_scope(client, monkeypatch):
    model_id = str(uuid4())
    node_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "is_model_locked",
        lambda **_: False,
    )
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "remove_model_scope",
        lambda **_: None,
    )
    resp = client.delete(f"/api/re/v2/models/{model_id}/scope/asset/{node_id}")
    assert resp.status_code == 204


# ── Model Overrides ──────────────────────────────────────────────────────────


def test_list_model_overrides(client, monkeypatch):
    model_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "list_model_overrides",
        lambda **_: [_override_row(model_id)],
    )
    resp = client.get(f"/api/re/v2/models/{model_id}/overrides")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["key"] == "exit_cap_rate"


def test_set_model_override(client, monkeypatch):
    model_id = str(uuid4())
    override = _override_row(model_id)
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "is_model_locked",
        lambda **_: False,
    )
    monkeypatch.setattr(
        re_v2_routes.re_model,
        "set_model_override",
        lambda **_: override,
    )
    resp = client.post(
        f"/api/re/v2/models/{model_id}/overrides",
        json={
            "scope_node_type": "asset",
            "scope_node_id": override["scope_node_id"],
            "key": "exit_cap_rate",
            "value_type": "decimal",
            "value_decimal": 0.065,
            "reason": "Stress test",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["key"] == "exit_cap_rate"
