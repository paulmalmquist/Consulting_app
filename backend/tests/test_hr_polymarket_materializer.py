"""Feature materialization, persistence, and fail-closed API tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.events.envelope import EventEnvelope
from app.routes import hr_polymarket
from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.materializer import PolymarketFeatureMaterializer
from app.services.hr_polymarket.materializer_worker import (
    PolymarketMaterializerWorker,
)
from app.services.hr_polymarket.models import (
    MarketDefinition,
    NormalizedMarketEvent,
)
from app.services.hr_polymarket.repository import (
    PolymarketRepository,
    PolymarketRepositoryError,
)


def _settings(**overrides) -> PolymarketSettings:
    values = {
        "enabled": True,
        "gamma_base_url": "https://gamma.test",
        "clob_base_url": "https://clob.test",
        "websocket_url": "wss://ws.test",
        "max_markets": 25,
        "discovery_seconds": 900,
        "reconcile_seconds": 300,
        "feature_seconds": 60,
        "connection_stale_seconds": 30,
        "market_stale_seconds": 300,
        "min_liquidity_usd": 10.0,
        "max_spread_bps": 1200.0,
        "allow_tags": (),
        "block_tags": (),
    }
    values.update(overrides)
    return PolymarketSettings(**values)


def _market() -> MarketDefinition:
    return MarketDefinition(
        market_id="market-1",
        condition_id="condition-1",
        question="Will CPI be above 3% by December 2026?",
        end_at=datetime(2026, 12, 31, tzinfo=timezone.utc),
        yes_token_id="yes-1",
        no_token_id="no-1",
        yes_price=0.47,
        no_price=0.53,
        liquidity_usd=5000,
    )


def _event(
    event_id: str,
    event_type: str,
    payload: dict,
    *,
    observed_at: datetime,
    received_at: datetime | None = None,
    asset_id: str = "yes-1",
) -> NormalizedMarketEvent:
    return NormalizedMarketEvent(
        event_id=event_id,
        event_type=event_type,
        market_id="condition-1",
        asset_id=asset_id,
        observed_at=observed_at,
        received_at=received_at or observed_at,
        payload={"event_type": event_type, **payload},
        raw=payload,
    )


def test_book_snapshot_calculates_midpoint_depth_imbalance_and_flags():
    now = datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)
    materializer = PolymarketFeatureMaterializer(_settings())
    materializer.register_market(_market())
    materializer.apply(
        _event(
            "book-1",
            "book",
            {
                "bids": [
                    {"price": "0.48", "size": "100"},
                    {"price": "0.47", "size": "50"},
                ],
                "asks": [
                    {"price": "0.52", "size": "80"},
                    {"price": "0.53", "size": "40"},
                ],
            },
            observed_at=now,
        )
    )

    snapshot = materializer.snapshot("market-1", at=now + timedelta(seconds=5))
    assert snapshot.yes_probability == pytest.approx(0.50)
    assert snapshot.price_basis == "yes_orderbook_midpoint"
    assert snapshot.spread == pytest.approx(0.04)
    assert snapshot.spread_bps == pytest.approx(800)
    assert snapshot.bid_notional_1pt == pytest.approx(71.5)
    assert snapshot.ask_notional_1pt == pytest.approx(62.8)
    assert snapshot.book_imbalance == pytest.approx(
        (71.5 - 62.8) / (71.5 + 62.8)
    )
    assert snapshot.connection_stale is False
    assert snapshot.market_stale is False
    assert snapshot.thin_liquidity_flag is False


def test_price_change_zero_removes_level_and_duplicate_is_idempotent():
    now = datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)
    materializer = PolymarketFeatureMaterializer(_settings())
    materializer.register_market(_market())
    materializer.apply(
        _event(
            "book-1",
            "book",
            {
                "bids": [{"price": "0.48", "size": "100"}],
                "asks": [{"price": "0.52", "size": "100"}],
            },
            observed_at=now,
        )
    )
    removal = _event(
        "change-1",
        "price_change",
        {"side": "BUY", "price": "0.48", "size": "0"},
        observed_at=now + timedelta(seconds=1),
    )
    assert materializer.apply(removal) is True
    assert materializer.apply(removal) is False
    assert materializer.books["yes-1"].bids == {}


def test_out_of_order_event_is_rejected_but_reconciliation_can_replace_book():
    now = datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)
    materializer = PolymarketFeatureMaterializer(_settings())
    materializer.register_market(_market())
    materializer.apply(
        _event(
            "book-new",
            "book",
            {
                "bids": [{"price": "0.48", "size": "100"}],
                "asks": [{"price": "0.52", "size": "100"}],
            },
            observed_at=now,
        )
    )
    older = _event(
        "book-old",
        "book",
        {
            "bids": [{"price": "0.40", "size": "10"}],
            "asks": [{"price": "0.60", "size": "10"}],
        },
        observed_at=now - timedelta(minutes=1),
    )
    reconciled = older.model_copy(
        update={"event_id": "book-reconciled", "reconciled": True}
    )

    assert materializer.apply(older) is False
    assert materializer.books["yes-1"].best_bid == pytest.approx(0.48)
    assert materializer.apply(reconciled) is True
    assert materializer.books["yes-1"].best_bid == pytest.approx(0.40)


def test_connection_freshness_is_separate_from_quiet_market_freshness():
    now = datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)
    materializer = PolymarketFeatureMaterializer(_settings())
    materializer.register_market(_market())
    materializer.apply(
        _event(
            "quiet-book",
            "book",
            {
                "bids": [{"price": "0.48", "size": "100"}],
                "asks": [{"price": "0.52", "size": "100"}],
            },
            observed_at=now - timedelta(minutes=10),
            received_at=now,
        )
    )
    snapshot = materializer.snapshot("market-1", at=now)
    assert snapshot.connection_stale is False
    assert snapshot.market_stale is True
    assert snapshot.null_reason is None


def test_connection_heartbeat_keeps_quiet_market_connection_live():
    now = datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)
    materializer = PolymarketFeatureMaterializer(_settings())
    materializer.register_market(_market())
    materializer.mark_connection_heartbeat(now)

    snapshot = materializer.snapshot("market-1", at=now)

    assert snapshot.connection_stale is False
    assert snapshot.market_stale is True


def test_five_minute_probability_change_uses_prior_minute_snapshot():
    start = datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)
    materializer = PolymarketFeatureMaterializer(_settings())
    materializer.register_market(_market())
    materializer.apply(
        _event(
            "book-1",
            "book",
            {
                "bids": [{"price": "0.48", "size": "100"}],
                "asks": [{"price": "0.52", "size": "100"}],
            },
            observed_at=start,
        )
    )
    materializer.snapshot("market-1", at=start)
    materializer.apply(
        _event(
            "book-2",
            "book",
            {
                "bids": [{"price": "0.58", "size": "100"}],
                "asks": [{"price": "0.62", "size": "100"}],
            },
            observed_at=start + timedelta(minutes=5),
        )
    )
    snapshot = materializer.snapshot(
        "market-1", at=start + timedelta(minutes=5)
    )
    assert snapshot.probability_change_5m == pytest.approx(0.10)
    assert snapshot.shock_score > 0


def test_repository_uses_idempotent_minute_upsert(fake_cursor):
    repository = PolymarketRepository()
    materializer = PolymarketFeatureMaterializer(_settings())
    materializer.register_market(_market())
    snapshot = materializer.snapshot(
        "market-1", at=datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)
    )
    repository.upsert_feature(snapshot)

    sql, params = fake_cursor.queries[-1]
    assert "ON CONFLICT (market_id, bucket_at) DO UPDATE" in sql
    assert params["market_id"] == "market-1"


def test_worker_processes_envelopes_and_flushes_bucket_once():
    class FakeRepository:
        def __init__(self):
            self.markets = []
            self.features = []
            self.statuses = []

        def upsert_market(self, market):
            self.markets.append(market)

        def upsert_feature(self, snapshot):
            self.features.append(snapshot)

        def update_stream_status(self, *args, **kwargs):
            self.statuses.append((args, kwargs))

    published = []

    def publisher(topic, envelope, *, key):
        published.append((topic, envelope, key))
        return True

    repository = FakeRepository()
    worker = PolymarketMaterializerWorker(
        _settings(), repository=repository, publisher=publisher
    )
    market_envelope = EventEnvelope(
        event_type="hr.polymarket.market.discovered",
        idempotency_key="market-1",
        occurred_at=datetime.now(timezone.utc),
        payload=_market().model_dump(mode="json"),
    )
    now = datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)
    raw_event = _event(
        "book-1",
        "book",
        {
            "bids": [{"price": "0.48", "size": "100"}],
            "asks": [{"price": "0.52", "size": "100"}],
        },
        observed_at=now,
    )
    raw_envelope = EventEnvelope(
        event_type="hr.polymarket.book",
        idempotency_key="book-1",
        occurred_at=now,
        payload=raw_event.model_dump(mode="json"),
    )

    worker.process_wire(worker.settings.markets_topic, market_envelope.to_wire())
    worker.process_wire(worker.settings.raw_topic, raw_envelope.to_wire())
    assert worker.flush_minute(now) == 1
    assert worker.flush_minute(now + timedelta(seconds=30)) == 0
    assert len(repository.features) == 1
    assert published[0][0] == worker.settings.features_topic


def test_disabled_api_returns_explicit_empty_state(monkeypatch):
    monkeypatch.setenv("HR_POLYMARKET_ENABLED", "false")
    response = hr_polymarket.get_polymarket_pulse()
    assert response["ok"] is False
    assert response["stale"] is True
    assert response["null_reason"] == "polymarket_disabled"
    assert response["items"] == []


def test_stale_api_item_is_never_labeled_live(monkeypatch):
    monkeypatch.setenv("HR_POLYMARKET_ENABLED", "true")
    rows = [
        {
            "market_id": "market-1",
            "as_of": datetime.now(timezone.utc),
            "yes_probability": 0.55,
            "price_basis": "yes_orderbook_midpoint",
            "connection_stale": True,
            "market_stale": False,
            "thin_liquidity_flag": False,
            "ambiguity_flag": False,
            "forecast_status": "research",
        }
    ]
    with patch.object(PolymarketRepository, "get_pulse", return_value=rows):
        response = hr_polymarket.get_polymarket_pulse()
    assert response["stale"] is True
    assert response["items"][0]["status"] == "STALE"


def test_uncalibrated_forecast_is_labeled_research_not_live(monkeypatch):
    monkeypatch.setenv("HR_POLYMARKET_ENABLED", "true")
    rows = [
        {
            "market_id": "market-1",
            "as_of": datetime.now(timezone.utc),
            "yes_probability": 0.55,
            "price_basis": "yes_orderbook_midpoint",
            "connection_stale": False,
            "market_stale": False,
            "thin_liquidity_flag": False,
            "ambiguity_flag": False,
            "forecast_status": "uncalibrated",
        }
    ]
    with patch.object(PolymarketRepository, "get_pulse", return_value=rows):
        response = hr_polymarket.get_polymarket_pulse()
    assert response["items"][0]["status"] == "RESEARCH"
    assert response["forecast_status"] == ["uncalibrated"]


def test_database_failure_becomes_503(monkeypatch):
    monkeypatch.setenv("HR_POLYMARKET_ENABLED", "true")
    with patch.object(
        PolymarketRepository,
        "get_pulse",
        side_effect=PolymarketRepositoryError("db down"),
    ):
        with pytest.raises(HTTPException) as exc:
            hr_polymarket.get_polymarket_pulse()
    assert exc.value.status_code == 503
