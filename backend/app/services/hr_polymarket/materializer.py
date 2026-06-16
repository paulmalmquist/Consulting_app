"""In-memory order books and deterministic minute feature materialization."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.models import (
    FeatureSnapshot,
    MarketDefinition,
    NormalizedMarketEvent,
)


@dataclass
class OrderBookState:
    bids: dict[float, float] = field(default_factory=dict)
    asks: dict[float, float] = field(default_factory=dict)
    last_trade_price: float | None = None
    explicit_best_bid: float | None = None
    explicit_best_ask: float | None = None
    last_event_at: datetime | None = None
    last_received_at: datetime | None = None
    source_event_ids: deque[str] = field(default_factory=lambda: deque(maxlen=200))

    @property
    def best_bid(self) -> float | None:
        return max(self.bids) if self.bids else self.explicit_best_bid

    @property
    def best_ask(self) -> float | None:
        return min(self.asks) if self.asks else self.explicit_best_ask


class PolymarketFeatureMaterializer:
    def __init__(self, settings: PolymarketSettings) -> None:
        self.settings = settings
        self.markets: dict[str, MarketDefinition] = {}
        self.market_by_condition: dict[str, str] = {}
        self.token_to_market: dict[str, tuple[str, str]] = {}
        self.books: dict[str, OrderBookState] = defaultdict(OrderBookState)
        self.connection_last_message_at: datetime | None = None
        self.market_last_event_at: datetime | None = None
        self._seen_ids: set[str] = set()
        self._seen_order: deque[str] = deque()
        self._history: dict[str, deque[tuple[datetime, float]]] = defaultdict(
            lambda: deque(maxlen=2_000)
        )

    def register_market(self, market: MarketDefinition) -> None:
        self.markets[market.market_id] = market
        self.market_by_condition[market.condition_id] = market.market_id
        self.token_to_market[market.yes_token_id] = (market.market_id, "yes")
        self.token_to_market[market.no_token_id] = (market.market_id, "no")

    def can_resolve(self, event: NormalizedMarketEvent) -> bool:
        return self._resolve_market_id(event) is not None

    def mark_connection_heartbeat(self, received_at: datetime) -> None:
        self.connection_last_message_at = _max_time(
            self.connection_last_message_at,
            received_at,
        )

    def apply(self, event: NormalizedMarketEvent) -> bool:
        self.mark_connection_heartbeat(event.received_at)
        if event.event_id in self._seen_ids:
            return False
        self._remember(event.event_id)

        market_id = self._resolve_market_id(event)
        if market_id is None:
            return False
        market = self.markets[market_id]
        asset_id = event.asset_id
        if asset_id is None and event.event_type not in {"market_resolved", "new_market"}:
            return False

        if asset_id:
            state = self.books[asset_id]
            if (
                state.last_event_at is not None
                and event.observed_at < state.last_event_at
                and not event.reconciled
            ):
                return False
            state.last_event_at = event.observed_at
            state.last_received_at = event.received_at
            state.source_event_ids.append(event.event_id)
            self._apply_to_book(state, event)

        if event.event_type == "market_resolved":
            self.register_market(market.model_copy(update={"active": False, "closed": True}))

        self.market_last_event_at = _max_time(
            self.market_last_event_at, event.observed_at
        )
        return True

    def snapshot(
        self,
        market_id: str,
        *,
        at: datetime | None = None,
        ambiguity_flag: bool = False,
    ) -> FeatureSnapshot:
        now = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
        bucket = now.replace(second=0, microsecond=0)
        market = self.markets[market_id]
        yes_state = self.books[market.yes_token_id]
        no_state = self.books[market.no_token_id]

        yes_probability, price_basis = self._yes_probability(
            market, yes_state, no_state
        )
        best_bid = yes_state.best_bid
        best_ask = yes_state.best_ask
        midpoint = _midpoint(best_bid, best_ask)
        spread = (
            max(best_ask - best_bid, 0.0)
            if best_bid is not None and best_ask is not None
            else None
        )
        spread_bps = (
            spread / midpoint * 10_000
            if spread is not None and midpoint not in (None, 0)
            else None
        )

        bid_1 = _depth(yes_state.bids, best_bid, 0.01, side="bid")
        ask_1 = _depth(yes_state.asks, best_ask, 0.01, side="ask")
        bid_5 = _depth(yes_state.bids, best_bid, 0.05, side="bid")
        ask_5 = _depth(yes_state.asks, best_ask, 0.05, side="ask")
        depth_5 = bid_5 + ask_5
        imbalance = (
            (bid_5 - ask_5) / depth_5 if depth_5 > 0 else None
        )

        connection_stale = _is_stale(
            self.connection_last_message_at,
            now,
            self.settings.connection_stale_seconds,
        )
        market_event_at = _max_time(
            yes_state.last_event_at, no_state.last_event_at
        )
        market_stale = _is_stale(
            market_event_at,
            now,
            self.settings.market_stale_seconds,
        )
        spread_score = (
            _clamp(1.0 - spread_bps / self.settings.max_spread_bps)
            if spread_bps is not None
            else 0.0
        )
        depth_score = _clamp(depth_5 / self.settings.min_liquidity_usd)
        liquidity_confidence = 0.65 * spread_score + 0.35 * depth_score
        thin = (
            spread_bps is None
            or spread_bps > self.settings.max_spread_bps
            or depth_5 < self.settings.min_liquidity_usd
        )

        change_5m = self._change(market_id, yes_probability, bucket, minutes=5)
        change_1h = self._change(market_id, yes_probability, bucket, minutes=60)
        change_24h = self._change(
            market_id, yes_probability, bucket, minutes=24 * 60
        )
        largest_change = max(
            [
                abs(value)
                for value in (change_5m, change_1h, change_24h)
                if value is not None
            ],
            default=0.0,
        )
        shock_score = _clamp(largest_change * 10.0) * liquidity_confidence

        null_reason = None
        if connection_stale:
            null_reason = "polymarket_stream_connection_stale"
        elif yes_probability is None:
            null_reason = "polymarket_price_unavailable"

        if yes_probability is not None:
            self._record_history(market_id, bucket, yes_probability)

        return FeatureSnapshot(
            market_id=market_id,
            bucket_at=bucket,
            observed_at=market_event_at,
            connection_last_message_at=self.connection_last_message_at,
            market_last_event_at=market_event_at,
            yes_probability=yes_probability,
            price_basis=price_basis,
            last_trade_price=yes_state.last_trade_price,
            best_bid=best_bid,
            best_ask=best_ask,
            midpoint=midpoint,
            spread=spread,
            spread_bps=spread_bps,
            bid_notional_1pt=bid_1,
            ask_notional_1pt=ask_1,
            bid_notional_5pt=bid_5,
            ask_notional_5pt=ask_5,
            book_imbalance=imbalance,
            probability_change_5m=change_5m,
            probability_change_1h=change_1h,
            probability_change_24h=change_24h,
            liquidity_confidence=liquidity_confidence,
            shock_score=shock_score,
            connection_stale=connection_stale,
            market_stale=market_stale,
            thin_liquidity_flag=thin,
            ambiguity_flag=ambiguity_flag,
            null_reason=null_reason,
            source_event_ids=list(yes_state.source_event_ids)[-50:],
            provenance={
                "source": "polymarket_public_market_channel",
                "reconciled_with": "clob_rest_book",
                "price_basis": price_basis,
            },
        )

    def snapshot_all(self, *, at: datetime | None = None) -> list[FeatureSnapshot]:
        return [self.snapshot(market_id, at=at) for market_id in self.markets]

    def _resolve_market_id(self, event: NormalizedMarketEvent) -> str | None:
        if event.asset_id and event.asset_id in self.token_to_market:
            return self.token_to_market[event.asset_id][0]
        if event.market_id:
            if event.market_id in self.markets:
                return event.market_id
            return self.market_by_condition.get(event.market_id)
        return None

    def _apply_to_book(
        self, state: OrderBookState, event: NormalizedMarketEvent
    ) -> None:
        payload = event.payload
        if event.event_type == "book":
            state.bids = _levels(payload.get("bids"))
            state.asks = _levels(payload.get("asks"))
            state.explicit_best_bid = None
            state.explicit_best_ask = None
        elif event.event_type == "price_change":
            side = str(payload.get("side") or "").upper()
            levels = state.bids if side == "BUY" else state.asks
            price = _float(payload.get("price"))
            size = _float(payload.get("size"))
            if price is not None and size is not None:
                if size == 0:
                    levels.pop(price, None)
                else:
                    levels[price] = size
            state.explicit_best_bid = _float(payload.get("best_bid"))
            state.explicit_best_ask = _float(payload.get("best_ask"))
        elif event.event_type == "last_trade_price":
            state.last_trade_price = _float(payload.get("price"))
        elif event.event_type == "best_bid_ask":
            state.explicit_best_bid = _float(payload.get("best_bid"))
            state.explicit_best_ask = _float(payload.get("best_ask"))

    def _yes_probability(
        self,
        market: MarketDefinition,
        yes_state: OrderBookState,
        no_state: OrderBookState,
    ) -> tuple[float | None, str | None]:
        yes_mid = _midpoint(yes_state.best_bid, yes_state.best_ask)
        if yes_mid is not None:
            return _clamp(yes_mid), "yes_orderbook_midpoint"
        if yes_state.last_trade_price is not None:
            return _clamp(yes_state.last_trade_price), "yes_last_trade"
        no_mid = _midpoint(no_state.best_bid, no_state.best_ask)
        if no_mid is not None:
            return _clamp(1.0 - no_mid), "inverse_no_orderbook_midpoint"
        if market.yes_price is not None:
            return _clamp(market.yes_price), "gamma_outcome_price"
        return None, None

    def _change(
        self,
        market_id: str,
        current: float | None,
        bucket: datetime,
        *,
        minutes: int,
    ) -> float | None:
        if current is None:
            return None
        target = bucket - timedelta(minutes=minutes)
        prior = None
        for observed_at, probability in reversed(self._history[market_id]):
            if observed_at <= target:
                prior = probability
                break
        return current - prior if prior is not None else None

    def _record_history(
        self, market_id: str, bucket: datetime, probability: float
    ) -> None:
        history = self._history[market_id]
        if history and history[-1][0] == bucket:
            history[-1] = (bucket, probability)
        else:
            history.append((bucket, probability))

    def _remember(self, event_id: str) -> None:
        self._seen_ids.add(event_id)
        self._seen_order.append(event_id)
        while len(self._seen_order) > 50_000:
            self._seen_ids.discard(self._seen_order.popleft())


def _levels(value: Any) -> dict[float, float]:
    if not isinstance(value, list):
        return {}
    levels: dict[float, float] = {}
    for item in value:
        if not isinstance(item, dict):
            continue
        price = _float(item.get("price"))
        size = _float(item.get("size"))
        if price is not None and size is not None and size > 0:
            levels[price] = size
    return levels


def _depth(
    levels: dict[float, float],
    best: float | None,
    window: float,
    *,
    side: str,
) -> float:
    if best is None:
        return 0.0
    if side == "bid":
        selected = ((price, size) for price, size in levels.items() if price >= best - window)
    else:
        selected = ((price, size) for price, size in levels.items() if price <= best + window)
    return sum(price * size for price, size in selected)


def _midpoint(best_bid: float | None, best_ask: float | None) -> float | None:
    if best_bid is None or best_ask is None or best_ask < best_bid:
        return None
    return (best_bid + best_ask) / 2.0


def _float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clamp(value: float) -> float:
    return min(max(value, 0.0), 1.0)


def _is_stale(value: datetime | None, now: datetime, threshold_seconds: int) -> bool:
    return value is None or (now - value).total_seconds() > threshold_seconds


def _max_time(
    first: datetime | None, second: datetime | None
) -> datetime | None:
    if first is None:
        return second
    if second is None:
        return first
    return max(first, second)
