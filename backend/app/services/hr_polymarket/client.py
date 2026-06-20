"""Strict public Polymarket REST client.

This adapter has no fixture fallback. Network, schema, and mapping failures are
raised to the worker so the stream can report an unavailable state.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import httpx

from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.models import DiscoveryResult, MarketDefinition


class PolymarketPayloadError(ValueError):
    """Public payload cannot be mapped without guessing."""


class PolymarketPublicClient:
    def __init__(
        self,
        settings: PolymarketSettings,
        *,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.settings = settings
        self._http = http_client or httpx.Client(timeout=20.0)

    def close(self) -> None:
        self._http.close()

    def discover_markets(
        self,
        *,
        now: datetime | None = None,
        max_pages: int = 10,
    ) -> DiscoveryResult:
        current = now or datetime.now(timezone.utc)
        cursor: str | None = None
        candidates: dict[str, MarketDefinition] = {}
        rejected: Counter[str] = Counter()
        pages_read = 0

        for _ in range(max_pages):
            params: dict[str, Any] = {
                "limit": 100,
                "closed": False,
                "order": "liquidity",
                "ascending": False,
            }
            if cursor:
                params["after_cursor"] = cursor
            response = self._http.get(
                f"{self.settings.gamma_base_url}/events/keyset",
                params=params,
            )
            response.raise_for_status()
            body = response.json()
            if not isinstance(body, dict) or not isinstance(body.get("events"), list):
                raise PolymarketPayloadError("Gamma keyset response missing events list")

            pages_read += 1
            for event in body["events"]:
                if not isinstance(event, dict):
                    rejected["invalid_event"] += 1
                    continue
                markets = event.get("markets") or []
                if not isinstance(markets, list):
                    rejected["invalid_markets"] += 1
                    continue
                for market in markets:
                    try:
                        definition = self._parse_market(event, market, current)
                    except PolymarketPayloadError as exc:
                        rejected[str(exc)] += 1
                        continue
                    candidates[definition.market_id] = definition

            cursor = body.get("next_cursor")
            if not cursor or len(candidates) >= self.settings.max_markets * 3:
                break

        selected = sorted(
            candidates.values(),
            key=lambda item: (item.liquidity_usd, item.volume_usd),
            reverse=True,
        )[: self.settings.max_markets]
        return DiscoveryResult(
            selected=selected,
            rejection_counts=dict(rejected),
            pages_read=pages_read,
        )

    def get_order_book(self, asset_id: str) -> dict[str, Any]:
        response = self._http.get(
            f"{self.settings.clob_base_url}/book",
            params={"token_id": asset_id},
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise PolymarketPayloadError("CLOB order book is not an object")
        payload.setdefault("asset_id", asset_id)
        payload.setdefault("event_type", "book")
        return payload

    def _parse_market(
        self,
        event: dict[str, Any],
        raw_market: Any,
        now: datetime,
    ) -> MarketDefinition:
        if not isinstance(raw_market, dict):
            raise PolymarketPayloadError("invalid_market")

        active = _as_bool(raw_market.get("active"), event.get("active"))
        closed = _as_bool(raw_market.get("closed"), event.get("closed"))
        accepting_orders = _as_bool(raw_market.get("acceptingOrders"), True)
        order_book = _as_bool(
            raw_market.get("enableOrderBook"), event.get("enableOrderBook")
        )
        if not active or closed or not accepting_orders or not order_book:
            raise PolymarketPayloadError("inactive_or_no_orderbook")

        end_at = _parse_datetime(raw_market.get("endDate") or event.get("endDate"))
        if end_at is None or end_at <= now:
            raise PolymarketPayloadError("expired_or_missing_end_date")

        outcomes = _json_list(raw_market.get("outcomes"), field="outcomes")
        token_ids = _json_list(
            raw_market.get("clobTokenIds") or raw_market.get("clob_token_ids"),
            field="clobTokenIds",
        )
        prices = _json_list(
            raw_market.get("outcomePrices"),
            field="outcomePrices",
            allow_empty=True,
        )
        if len(outcomes) != 2 or len(token_ids) != 2:
            raise PolymarketPayloadError("non_binary_or_missing_tokens")

        normalized_outcomes = [str(value).strip().lower() for value in outcomes]
        if set(normalized_outcomes) != {"yes", "no"}:
            raise PolymarketPayloadError("non_yes_no_market")
        yes_index = normalized_outcomes.index("yes")
        no_index = normalized_outcomes.index("no")

        liquidity = _as_float(
            raw_market.get("liquidityNum")
            or raw_market.get("liquidityClob")
            or raw_market.get("liquidity")
            or event.get("liquidityClob")
            or event.get("liquidity")
        )
        if liquidity < self.settings.min_liquidity_usd:
            raise PolymarketPayloadError("insufficient_liquidity")

        tags = _extract_tags(event, raw_market)
        if set(tags).intersection(self.settings.block_tags):
            raise PolymarketPayloadError("blocked_tag")
        if self.settings.allow_tags and not set(tags).intersection(
            self.settings.allow_tags
        ):
            raise PolymarketPayloadError("tag_not_allowed")

        market_id = str(raw_market.get("id") or "").strip()
        condition_id = str(
            raw_market.get("conditionId")
            or raw_market.get("condition_id")
            or raw_market.get("conditionID")
            or ""
        ).strip()
        question = str(raw_market.get("question") or "").strip()
        if not market_id or not condition_id or not question:
            raise PolymarketPayloadError("missing_market_identity")

        parsed_prices = [_as_float(value, none_on_invalid=True) for value in prices]
        return MarketDefinition(
            market_id=market_id,
            event_id=_optional_string(event.get("id")),
            condition_id=condition_id,
            question=question,
            slug=_optional_string(raw_market.get("slug")),
            category=_optional_string(
                raw_market.get("category") or event.get("category")
            ),
            tags=tags,
            end_at=end_at,
            resolution_source=_optional_string(
                raw_market.get("resolutionSource")
                or event.get("resolutionSource")
            ),
            yes_token_id=str(token_ids[yes_index]),
            no_token_id=str(token_ids[no_index]),
            yes_price=_list_value(parsed_prices, yes_index),
            no_price=_list_value(parsed_prices, no_index),
            liquidity_usd=liquidity,
            volume_usd=_as_float(
                raw_market.get("volumeNum")
                or raw_market.get("volume")
                or event.get("volume")
            ),
            active=active,
            closed=closed,
            accepting_orders=accepting_orders,
            enable_order_book=order_book,
            raw={"event": event, "market": raw_market},
        )


def _json_list(
    value: Any,
    *,
    field: str,
    allow_empty: bool = False,
) -> list[Any]:
    if value in (None, "") and allow_empty:
        return []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise PolymarketPayloadError(f"invalid_{field}") from exc
    if not isinstance(value, list):
        raise PolymarketPayloadError(f"invalid_{field}")
    return value


def _extract_tags(event: dict[str, Any], market: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for source in (event.get("tags"), market.get("tags")):
        if not isinstance(source, list):
            continue
        for item in source:
            if isinstance(item, dict):
                candidate = item.get("slug") or item.get("label") or item.get("name")
            else:
                candidate = item
            if candidate:
                values.append(str(candidate).strip().lower())
    return sorted(set(values))


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _as_bool(value: Any, default: Any = False) -> bool:
    if value is None:
        value = default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _as_float(value: Any, *, none_on_invalid: bool = False) -> float | None:
    if value in (None, ""):
        return None if none_on_invalid else 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return None if none_on_invalid else 0.0


def _optional_string(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return str(value)


def _list_value(values: list[float | None], index: int) -> float | None:
    return values[index] if index < len(values) else None
