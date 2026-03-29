"""Tests for the BOS-owned /api/trades execution layer."""

from __future__ import annotations

from uuid import uuid4

from app.services import trades as trades_svc


class _BrokerStub:
    def connect(self, use_paper: bool = True):
        return True

    def is_connected(self):
        return True

    def get_account_summary(self, account_mode: str = "paper"):
        return {"NetLiquidation": 100000, "equity_value": 100000, "account_mode": account_mode}

    def get_market_data(self, symbol: str):
        return {
            "market_price": 100,
            "average_daily_volume": 5_000_000,
            "spread_bps": 10,
            "volatility_pct": 2,
            "symbol": symbol,
        }

    def submit_order(self, **kwargs):
        return {"broker_order_id": "paper-123", "status": "submitted", **kwargs}

    def cancel_order(self, **kwargs):
        return {"status": "cancelled", **kwargs}


def test_create_trade_intent_requires_fields(client):
    business_id = str(uuid4())
    payload = {
        "business_id": business_id,
        "source_type": "history_rhymes",
        "symbol": "NVDA",
        "side": "buy",
        "confidence_score": 72,
        "time_horizon": "swing",
        "trap_risk_score": 28,
        "invalidation_condition": "Break below prior low",
        "expected_scenario": "Momentum continuation",
    }

    resp = client.post("/api/trades/intents", json=payload)
    assert resp.status_code == 422
    assert any(item["loc"][-1] == "thesis_summary" for item in resp.json()["detail"])


def test_create_trade_intent_success(client, fake_cursor):
    business_id = str(uuid4())
    intent_id = str(uuid4())

    fake_cursor.push_result([
        {
            "trade_intent_id": intent_id,
            "business_id": business_id,
            "env_id": None,
            "source_type": "history_rhymes",
            "source_ref_id": "forecast-1",
            "symbol": "NVDA",
            "side": "buy",
            "order_type": "limit",
            "thesis_summary": "AI capex bid remains intact.",
            "invalidation_condition": "Loss of 50 DMA",
            "expected_scenario": "Trend continuation",
            "confidence_score": 81,
            "trap_risk_score": 22,
            "status": "pending_risk",
            "created_at": "2026-03-28T12:00:00Z",
            "updated_at": "2026-03-28T12:00:00Z",
        }
    ])

    resp = client.post(
        "/api/trades/intents",
        json={
            "business_id": business_id,
            "source_type": "history_rhymes",
            "source_ref_id": "forecast-1",
            "symbol": "NVDA",
            "side": "buy",
            "thesis_summary": "AI capex bid remains intact.",
            "confidence_score": 81,
            "time_horizon": "2-6 weeks",
            "trap_risk_score": 22,
            "invalidation_condition": "Loss of 50 DMA",
            "expected_scenario": "Trend continuation",
            "order_type": "limit",
            "limit_price": 101.5,
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["trade_intent_id"] == intent_id
    assert data["status"] == "pending_risk"
    assert fake_cursor.queries[0][0].startswith("\n            INSERT INTO app.trade_intents")


def test_run_trade_risk_check_returns_reduce(client, fake_cursor, monkeypatch):
    business_id = str(uuid4())
    intent_id = str(uuid4())
    risk_id = str(uuid4())

    monkeypatch.setattr(trades_svc, "get_broker_service", lambda: _BrokerStub())
    monkeypatch.setattr(
        trades_svc,
        "_load_regime_snapshot",
        lambda: {"regime_label": "risk_off", "confidence": 60, "calculated_at": "2026-03-28T12:00:00Z"},
    )

    fake_cursor.push_result([
        {
            "trade_intent_id": intent_id,
            "business_id": business_id,
            "symbol": "NVDA",
            "side": "buy",
            "order_type": "limit",
            "entry_price": 100,
            "invalidation_level": 95,
            "trap_risk_score": 68,
            "confidence_score": 82,
            "desired_quantity": 40,
            "source_ref_id": "forecast-1",
            "metadata_json": {"theme_key": "ai"},
        }
    ])
    fake_cursor.push_result([
        {
            "execution_control_state_id": str(uuid4()),
            "business_id": business_id,
            "current_mode": "paper",
            "kill_switch_active": False,
        }
    ])
    fake_cursor.push_result([
        {"name": "max_trade_risk_pct", "limit_value": 0.5},
        {"name": "max_single_position_pct", "limit_value": 5.0},
        {"name": "max_open_positions", "limit_value": 20},
        {"name": "max_correlation_cluster_exposure", "limit_value": 3},
    ])
    fake_cursor.push_result([])
    fake_cursor.push_result([
        {
            "risk_check_id": risk_id,
            "trade_intent_id": intent_id,
            "business_id": business_id,
            "final_decision": "reduce",
            "portfolio_exposure_check": "pass",
            "concentration_check": "pass",
            "max_loss_check": "pass",
            "liquidity_check": "pass",
            "volatility_check": "pass",
            "broker_connectivity_check": "pass",
            "regime_check": "reduce",
            "trap_risk_check": "reduce",
            "live_gate_check": "pass",
            "adjustment_notes": "Risk-off regime and elevated trap risk reduced size.",
            "size_explanation": "Base risk budget scaled down.",
            "recommended_size": 10,
            "recommended_notional": 1000,
            "expected_max_loss": 50,
            "risk_budget_used_pct": 100,
            "created_at": "2026-03-28T12:05:00Z",
        }
    ])

    resp = client.post(f"/api/trades/intents/{intent_id}/risk-check", json={"business_id": business_id})
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_check_id"] == risk_id
    assert data["final_decision"] == "reduce"
    assert data["regime_check"] == "reduce"
    assert data["trap_risk_check"] == "reduce"


def test_mode_change_requires_live_phrase(client):
    business_id = str(uuid4())
    resp = client.post(
        "/api/trades/mode",
        json={
            "business_id": business_id,
            "target_mode": "live_enabled",
            "changed_by": "operator",
            "reason": "Ready to promote",
        },
    )
    assert resp.status_code == 400
    assert "typed confirmation phrase" in resp.json()["detail"]


def test_submit_trade_blocks_live_rollout(client, fake_cursor):
    business_id = str(uuid4())
    intent_id = str(uuid4())

    fake_cursor.push_result([
        {
            "trade_intent_id": intent_id,
            "business_id": business_id,
            "env_id": None,
            "status": "approved",
            "symbol": "NVDA",
            "side": "buy",
            "order_type": "limit",
            "limit_price": 101,
            "stop_price": 95,
        }
    ])
    fake_cursor.push_result([
        {
            "execution_control_state_id": str(uuid4()),
            "business_id": business_id,
            "current_mode": "live_enabled",
            "kill_switch_active": False,
        }
    ])
    fake_cursor.push_result([
        {
            "risk_check_id": str(uuid4()),
            "trade_intent_id": intent_id,
            "business_id": business_id,
            "final_decision": "pass",
            "recommended_size": 5,
        }
    ])

    resp = client.post(
        f"/api/trades/intents/{intent_id}/submit",
        json={
            "business_id": business_id,
            "actor": "operator",
        },
    )
    assert resp.status_code == 409
    assert "disabled for this rollout" in resp.json()["detail"]
