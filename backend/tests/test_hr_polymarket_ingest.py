"""Focused tests for public Polymarket discovery and ingestion."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from unittest.mock import patch

import httpx
import pytest

from app.events.envelope import EventEnvelope
from app.events.protobuf_codec import build_confluent_conf
from app.services.hr_polymarket.client import PolymarketPublicClient
from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.models import MarketDefinition
from app.services.hr_polymarket.normalizer import (
    PolymarketNormalizationError,
    normalize_message,
)
from app.services.hr_polymarket.worker import PolymarketIngestionWorker


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
        "min_liquidity_usd": 1000.0,
        "max_spread_bps": 1200.0,
        "allow_tags": (),
        "block_tags": ("sports",),
    }
    values.update(overrides)
    return PolymarketSettings(**values)


def _market(**overrides) -> MarketDefinition:
    values = {
        "market_id": "market-1",
        "event_id": "event-1",
        "condition_id": "condition-1",
        "question": "Will CPI be above 3% by December 2026?",
        "end_at": datetime(2026, 12, 31, tzinfo=timezone.utc),
        "yes_token_id": "yes-1",
        "no_token_id": "no-1",
        "liquidity_usd": 5000.0,
    }
    values.update(overrides)
    return MarketDefinition(**values)


def test_gamma_keyset_parses_json_encoded_outcome_mapping_and_filters():
    payload = {
        "events": [
            {
                "id": "event-1",
                "active": True,
                "closed": False,
                "endDate": "2026-12-31T00:00:00Z",
                "tags": [{"slug": "economy"}],
                "markets": [
                    {
                        "id": "market-good",
                        "conditionId": "condition-good",
                        "question": "Will CPI be above 3% by December 2026?",
                        "active": True,
                        "closed": False,
                        "acceptingOrders": True,
                        "enableOrderBook": True,
                        "endDate": "2026-12-31T00:00:00Z",
                        "outcomes": '["No", "Yes"]',
                        "clobTokenIds": '["token-no", "token-yes"]',
                        "outcomePrices": '["0.62", "0.38"]',
                        "liquidityNum": "5000",
                        "volumeNum": "10000",
                    },
                    {
                        "id": "market-thin",
                        "conditionId": "condition-thin",
                        "question": "Will CPI be above 4%?",
                        "active": True,
                        "closed": False,
                        "acceptingOrders": True,
                        "enableOrderBook": True,
                        "endDate": "2026-12-31T00:00:00Z",
                        "outcomes": '["Yes", "No"]',
                        "clobTokenIds": '["thin-yes", "thin-no"]',
                        "outcomePrices": '["0.1", "0.9"]',
                        "liquidityNum": "100",
                    },
                ],
            }
        ],
        "next_cursor": "",
    }

    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=payload, request=request)
    )
    client = PolymarketPublicClient(
        _settings(), http_client=httpx.Client(transport=transport)
    )
    result = client.discover_markets(
        now=datetime(2026, 6, 14, tzinfo=timezone.utc)
    )

    assert [market.market_id for market in result.selected] == ["market-good"]
    selected = result.selected[0]
    assert selected.yes_token_id == "token-yes"
    assert selected.no_token_id == "token-no"
    assert selected.yes_price == 0.38
    assert result.rejection_counts["insufficient_liquidity"] == 1


def test_discovery_uses_keyset_after_cursor_and_closed_filter():
    requests = []
    pages = [
        {"events": [], "next_cursor": "next-page"},
        {"events": [], "next_cursor": None},
    ]

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=pages[len(requests) - 1], request=request)

    client = PolymarketPublicClient(
        _settings(),
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    result = client.discover_markets(max_pages=2)

    assert result.pages_read == 2
    assert requests[0].url.params["closed"] == "false"
    assert requests[0].url.params["order"] == "liquidity"
    assert "after_cursor" not in requests[0].url.params
    assert requests[1].url.params["after_cursor"] == "next-page"


def test_gamma_discovery_rejects_blocked_and_expired_markets():
    payload = {
        "events": [
            {
                "id": "sports-event",
                "tags": [{"slug": "sports"}],
                "markets": [
                    {
                        "id": "sports-market",
                        "conditionId": "sports-condition",
                        "question": "Will the team win?",
                        "active": True,
                        "closed": False,
                        "acceptingOrders": True,
                        "enableOrderBook": True,
                        "endDate": "2027-01-01T00:00:00Z",
                        "outcomes": '["Yes", "No"]',
                        "clobTokenIds": '["a", "b"]',
                        "liquidityNum": 5000,
                    }
                ],
            },
            {
                "id": "expired-event",
                "markets": [
                    {
                        "id": "expired-market",
                        "conditionId": "expired-condition",
                        "question": "Did this happen?",
                        "active": True,
                        "closed": False,
                        "acceptingOrders": True,
                        "enableOrderBook": True,
                        "endDate": "2025-01-01T00:00:00Z",
                        "outcomes": '["Yes", "No"]',
                        "clobTokenIds": '["c", "d"]',
                        "liquidityNum": 5000,
                    }
                ],
            },
        ],
        "next_cursor": None,
    }
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=payload, request=request)
    )
    client = PolymarketPublicClient(
        _settings(), http_client=httpx.Client(transport=transport)
    )
    result = client.discover_markets(
        now=datetime(2026, 6, 14, tzinfo=timezone.utc)
    )

    assert result.selected == []
    assert result.rejection_counts == {
        "blocked_tag": 1,
        "expired_or_missing_end_date": 1,
    }


@pytest.mark.parametrize(
    ("payload", "event_type"),
    [
        (
            {
                "event_type": "book",
                "asset_id": "yes-1",
                "market": "condition-1",
                "bids": [],
                "asks": [],
                "timestamp": "1760000000000",
            },
            "book",
        ),
        (
            {
                "event_type": "last_trade_price",
                "asset_id": "yes-1",
                "market": "condition-1",
                "price": "0.42",
                "timestamp": "1760000000000",
            },
            "last_trade_price",
        ),
        (
            {
                "event_type": "best_bid_ask",
                "asset_id": "yes-1",
                "market": "condition-1",
                "best_bid": "0.41",
                "best_ask": "0.43",
                "timestamp": "1760000000000",
            },
            "best_bid_ask",
        ),
        (
            {
                "event_type": "new_market",
                "market": "condition-1",
                "timestamp": "1760000000000",
            },
            "new_market",
        ),
        (
            {
                "event_type": "market_resolved",
                "market": "condition-1",
                "winning_outcome": "Yes",
                "timestamp": "1760000000000",
            },
            "market_resolved",
        ),
    ],
)
def test_websocket_event_types_normalize(payload, event_type):
    event = normalize_message(payload)[0]
    assert event.event_type == event_type
    assert event.market_id == "condition-1"
    assert len(event.event_id) == 64


def test_price_change_splits_asset_updates_and_preserves_zero_size_removal():
    payload = {
        "event_type": "price_change",
        "market": "condition-1",
        "timestamp": "1760000000000",
        "price_changes": [
            {
                "asset_id": "yes-1",
                "price": "0.42",
                "size": "0",
                "side": "BUY",
            },
            {
                "asset_id": "no-1",
                "price": "0.58",
                "size": "12",
                "side": "SELL",
            },
        ],
    }
    events = normalize_message(payload)
    assert [event.asset_id for event in events] == ["yes-1", "no-1"]
    assert events[0].payload["size"] == "0"


def test_invalid_message_is_rejected_for_dlq_routing():
    with pytest.raises(PolymarketNormalizationError, match="not valid JSON"):
        normalize_message("not-json")


def test_confluent_producer_config_uses_shared_sasl_contract():
    # The Polymarket workers build their librdkafka config via the shared
    # build_confluent_conf helper (app.events.protobuf_codec), so this asserts
    # the SASL_SSL contract on that single source of truth.
    with patch.dict(
        "os.environ",
        {
            "CONFLUENT_BOOTSTRAP_SERVERS": "pkc.example:9092",
            "CONFLUENT_API_KEY": "key",
            "CONFLUENT_API_SECRET": "secret",
        },
        clear=False,
    ):
        config = build_confluent_conf()

    assert config["bootstrap.servers"] == "pkc.example:9092"
    assert config["security.protocol"] == "SASL_SSL"
    assert config["sasl.username"] == "key"
    assert config["sasl.password"] == "secret"


def test_worker_subscribes_sends_heartbeat_and_publishes_raw_event():
    published: list[tuple[str, str, EventEnvelope]] = []

    def publisher(topic, envelope, *, key):
        published.append((topic, key, envelope))
        return True

    class FakeWebSocket:
        def __init__(self):
            self.sent: list[str] = []

        async def send(self, value):
            self.sent.append(value)

        async def recv(self):
            return json.dumps(
                {
                    "event_type": "book",
                    "asset_id": "yes-1",
                    "market": "condition-1",
                    "bids": [],
                    "asks": [],
                    "timestamp": "1760000000000",
                }
            )

    times = iter([0.0, 0.0, 10.1])
    worker = PolymarketIngestionWorker(
        _settings(),
        publisher=publisher,
        monotonic=lambda: next(times),
    )
    websocket = FakeWebSocket()
    asyncio.run(worker.run_session(websocket, [_market()], max_messages=1))

    subscription = json.loads(websocket.sent[0])
    assert subscription == {
        "assets_ids": ["no-1", "yes-1"],
        "type": "market",
        "custom_feature_enabled": True,
    }
    assert websocket.sent[1] == "PING"
    assert published[0][0] == worker.settings.raw_topic
    assert published[0][2].event_type == "hr.polymarket.book"


def test_worker_routes_malformed_message_to_shared_dlq():
    published: list[tuple[str, str, EventEnvelope]] = []

    def publisher(topic, envelope, *, key):
        published.append((topic, key, envelope))
        return True

    worker = PolymarketIngestionWorker(_settings(), publisher=publisher)
    worker._publish_raw_message("bad-json")

    assert published[0][0] == worker.settings.dead_letter_topic
    assert published[0][2].event_type == "hr.polymarket.dead_letter"
    assert "not valid JSON" in published[0][2].payload["reason"]


def test_worker_publishes_pong_as_connection_heartbeat():
    published: list[tuple[str, str, EventEnvelope]] = []

    def publisher(topic, envelope, *, key):
        published.append((topic, key, envelope))
        return True

    observed_at = datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)
    worker = PolymarketIngestionWorker(_settings(), publisher=publisher)
    worker._publish_heartbeat(observed_at)

    assert published == [
        (
            worker.settings.raw_topic,
            "connection",
            published[0][2],
        )
    ]
    assert published[0][2].event_type == "hr.polymarket.connection.heartbeat"
    assert published[0][2].occurred_at == observed_at


def test_reconciliation_failure_routes_to_shared_dlq():
    published: list[tuple[str, str, EventEnvelope]] = []

    def publisher(topic, envelope, *, key):
        published.append((topic, key, envelope))
        return True

    class FailingClient:
        def get_order_book(self, _asset_id):
            raise httpx.ConnectError("offline")

    worker = PolymarketIngestionWorker(
        _settings(),
        client=FailingClient(),
        publisher=publisher,
    )
    worker.reconcile_books([_market()])

    assert len(published) == 2
    assert all(item[0] == worker.settings.dead_letter_topic for item in published)
    assert all(
        item[2].payload["reason"].startswith(
            "order_book_reconciliation_failed:"
        )
        for item in published
    )
