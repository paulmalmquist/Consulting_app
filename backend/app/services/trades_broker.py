"""Broker abstraction for the Winston trades surface."""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.config import IBKR_CLIENT_ID, IBKR_HOST, IBKR_LIVE_PORT, IBKR_PAPER_PORT

try:  # pragma: no cover - optional runtime dependency
    from ib_insync import Contract, IB, LimitOrder, MarketOrder, Order, StopLimitOrder, StopOrder, Stock
except Exception:  # pragma: no cover - optional runtime dependency
    Contract = object  # type: ignore[assignment]
    IB = None  # type: ignore[assignment]
    LimitOrder = MarketOrder = StopLimitOrder = StopOrder = Stock = Order = None  # type: ignore[assignment]


class BrokerService(Protocol):
    def connect(self, account_mode: str = "paper") -> bool: ...
    def is_connected(self, account_mode: str = "paper") -> bool: ...
    def get_account_summary(self, account_mode: str = "paper") -> dict[str, Any]: ...
    def get_positions(self, account_mode: str = "paper") -> list[dict[str, Any]]: ...
    def get_market_data(self, symbol: str, instrument_type: str = "stock", account_mode: str = "paper") -> dict[str, Any]: ...
    def submit_order(self, order_request: dict[str, Any], account_mode: str = "paper") -> dict[str, Any]: ...
    def cancel_order(self, broker_order_id: str, account_mode: str = "paper") -> dict[str, Any]: ...
    def get_open_orders(self, account_mode: str = "paper") -> list[dict[str, Any]]: ...
    def get_fills(self, account_mode: str = "paper") -> list[dict[str, Any]]: ...


@dataclass
class IbkrBrokerService:
    """Small ib_insync wrapper with fail-safe behavior."""

    host: str = IBKR_HOST
    paper_port: int = IBKR_PAPER_PORT
    live_port: int = IBKR_LIVE_PORT
    client_id: int = IBKR_CLIENT_ID
    _ibs: dict[str, Any] = field(default_factory=dict)
    _client_counter: itertools.count = field(default_factory=lambda: itertools.count(1))

    def _port(self, account_mode: str) -> int:
        return self.paper_port if account_mode == "paper" else self.live_port

    def _ensure_ib(self, account_mode: str) -> Any:
        if IB is None:
            raise RuntimeError("ib_insync is not installed")
        ib = self._ibs.get(account_mode)
        if ib is None:
            ib = IB()
            self._ibs[account_mode] = ib
        return ib

    def connect(self, account_mode: str = "paper") -> bool:
        try:
            ib = self._ensure_ib(account_mode)
            if ib.isConnected():
                return True
            ib.connect(
                host=self.host,
                port=self._port(account_mode),
                clientId=self.client_id + (0 if account_mode == "paper" else 1000),
                readonly=False,
                timeout=2,
            )
            return bool(ib.isConnected())
        except Exception:
            return False

    def is_connected(self, account_mode: str = "paper") -> bool:
        ib = self._ibs.get(account_mode)
        return bool(ib and ib.isConnected())

    def _build_contract(self, symbol: str, instrument_type: str, contract_json: dict[str, Any] | None = None) -> Any:
        if IB is None:
            raise RuntimeError("ib_insync is not installed")
        payload = contract_json or {}
        if payload:
            contract = Contract()
            for key, value in payload.items():
                setattr(contract, key, value)
            if not getattr(contract, "symbol", None):
                contract.symbol = symbol
            return contract
        if instrument_type in {"stock", "etf"}:
            return Stock(symbol, "SMART", "USD")
        raise RuntimeError(f"Instrument type '{instrument_type}' requires contract_json for IBKR qualification")

    def _qualify_contract(self, ib: Any, symbol: str, instrument_type: str, contract_json: dict[str, Any] | None = None) -> Any:
        contract = self._build_contract(symbol, instrument_type, contract_json)
        try:
            ib.qualifyContracts(contract)
        except Exception:
            pass
        return contract

    def get_account_summary(self, account_mode: str = "paper") -> dict[str, Any]:
        if not self.connect(account_mode):
            return {"connected": False}
        ib = self._ensure_ib(account_mode)
        summary_rows = ib.accountSummary()
        summary: dict[str, Any] = {"connected": True}
        for row in summary_rows:
            if row.tag in {"NetLiquidation", "AvailableFunds", "BuyingPower", "RealizedPnL", "UnrealizedPnL"}:
                try:
                    summary[row.tag] = float(row.value)
                except Exception:
                    summary[row.tag] = row.value
        return summary

    def get_positions(self, account_mode: str = "paper") -> list[dict[str, Any]]:
        if not self.connect(account_mode):
            return []
        ib = self._ensure_ib(account_mode)
        positions = []
        for pos in ib.positions():
            positions.append(
                {
                    "symbol": getattr(pos.contract, "symbol", None),
                    "quantity": float(pos.position),
                    "avg_cost": float(pos.avgCost),
                    "account": getattr(pos, "account", None),
                }
            )
        return positions

    def get_market_data(self, symbol: str, instrument_type: str = "stock", account_mode: str = "paper") -> dict[str, Any]:
        if not self.connect(account_mode):
            return {"connected": False}
        ib = self._ensure_ib(account_mode)
        contract = self._qualify_contract(ib, symbol, instrument_type)
        try:
            ticker = ib.reqTickers(contract)[0]
        except Exception:
            return {"connected": True, "symbol": symbol}
        market_price = getattr(ticker, "marketPrice", lambda: None)()
        last_price = getattr(ticker, "last", None)
        bid = getattr(ticker, "bid", None)
        ask = getattr(ticker, "ask", None)
        return {
            "connected": True,
            "symbol": symbol,
            "market_price": float(market_price) if market_price else (float(last_price) if last_price else None),
            "last_price": float(last_price) if last_price else None,
            "bid": float(bid) if bid else None,
            "ask": float(ask) if ask else None,
        }

    def _build_order(self, order_request: dict[str, Any]) -> Any:
        if MarketOrder is None:
            raise RuntimeError("ib_insync is not installed")
        action = {
            "buy": "BUY",
            "sell": "SELL",
            "short": "SELL",
            "cover": "BUY",
        }[order_request["side"]]
        qty = float(order_request["quantity"])
        order_type = order_request["order_type"]
        tif = order_request.get("tif") or "DAY"
        if order_type == "market":
            return MarketOrder(action, qty, tif=tif)
        if order_type == "limit":
            return LimitOrder(action, qty, float(order_request["limit_price"]), tif=tif)
        if order_type == "stop":
            return StopOrder(action, qty, float(order_request["stop_price"]), tif=tif)
        if order_type == "stop_limit":
            return StopLimitOrder(
                action,
                qty,
                float(order_request["limit_price"]),
                float(order_request["stop_price"]),
                tif=tif,
            )
        raise RuntimeError(f"Unsupported order type {order_type}")

    def submit_order(self, order_request: dict[str, Any], account_mode: str = "paper") -> dict[str, Any]:
        if not self.connect(account_mode):
            raise RuntimeError("Broker is not connected")
        ib = self._ensure_ib(account_mode)
        contract = self._qualify_contract(
            ib,
            order_request["symbol"],
            order_request.get("instrument_type", "stock"),
            order_request.get("contract_json"),
        )
        order = self._build_order(order_request)
        if not getattr(order, "orderRef", None):
            order.orderRef = order_request.get("client_id") or f"winston-{next(self._client_counter)}"
        trade = ib.placeOrder(contract, order)
        status = getattr(getattr(trade, "orderStatus", None), "status", "Submitted")
        order_id = getattr(order, "orderId", None) or getattr(getattr(trade, "order", None), "orderId", None)
        filled = getattr(getattr(trade, "orderStatus", None), "filled", 0) or 0
        avg_fill_price = getattr(getattr(trade, "orderStatus", None), "avgFillPrice", None)
        return {
            "broker_order_id": str(order_id) if order_id is not None else None,
            "status": status,
            "client_id": order.orderRef,
            "filled_quantity": float(filled),
            "avg_fill_price": float(avg_fill_price) if avg_fill_price else None,
            "raw": {
                "status": status,
                "filled": filled,
                "avgFillPrice": avg_fill_price,
            },
        }

    def cancel_order(self, broker_order_id: str, account_mode: str = "paper") -> dict[str, Any]:
        if not self.connect(account_mode):
            raise RuntimeError("Broker is not connected")
        ib = self._ensure_ib(account_mode)
        for trade in ib.trades():
            order_id = getattr(getattr(trade, "order", None), "orderId", None)
            if str(order_id) == str(broker_order_id):
                ib.cancelOrder(trade.order)
                return {"broker_order_id": str(broker_order_id), "status": "Cancelled"}
        raise RuntimeError(f"Order {broker_order_id} not found on broker")

    def get_open_orders(self, account_mode: str = "paper") -> list[dict[str, Any]]:
        if not self.connect(account_mode):
            return []
        ib = self._ensure_ib(account_mode)
        rows = []
        for trade in ib.trades():
            status = getattr(getattr(trade, "orderStatus", None), "status", "")
            if status in {"Filled", "Cancelled", "Inactive"}:
                continue
            rows.append(
                {
                    "broker_order_id": str(getattr(getattr(trade, "order", None), "orderId", "")),
                    "symbol": getattr(getattr(trade, "contract", None), "symbol", None),
                    "status": status,
                }
            )
        return rows

    def get_fills(self, account_mode: str = "paper") -> list[dict[str, Any]]:
        if not self.connect(account_mode):
            return []
        ib = self._ensure_ib(account_mode)
        rows = []
        for fill in ib.fills():
            execution = getattr(fill, "execution", None)
            contract = getattr(fill, "contract", None)
            rows.append(
                {
                    "broker_order_id": str(getattr(execution, "orderId", "")),
                    "symbol": getattr(contract, "symbol", None),
                    "side": getattr(execution, "side", None),
                    "shares": float(getattr(execution, "shares", 0) or 0),
                    "price": float(getattr(execution, "price", 0) or 0),
                }
            )
        return rows


_broker_singleton: BrokerService | None = None


def get_broker_service() -> BrokerService:
    global _broker_singleton
    if _broker_singleton is None:
        _broker_singleton = IbkrBrokerService()
    return _broker_singleton
