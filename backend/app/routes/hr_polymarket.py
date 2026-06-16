"""Read-only History Rhymes Polymarket pulse and divergence APIs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Query

from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.repository import (
    PolymarketRepository,
    PolymarketRepositoryError,
)

router = APIRouter(
    prefix="/api/hr/v1/polymarket",
    tags=["history-rhymes-polymarket"],
)

PROVENANCE = {
    "source": "polymarket_public_market_data",
    "transport": "confluent_json_event_envelope",
    "application_store": "postgres_minute_features",
    "raw_store": "confluent_and_observational_bigquery",
    "trading_enabled": False,
}


@router.get("/health")
def get_polymarket_health() -> dict[str, Any]:
    settings = PolymarketSettings.from_env()
    if not settings.enabled:
        return _empty("polymarket_disabled", status="disabled")

    row = _read(PolymarketRepository().get_health)
    if row is None:
        return _empty("polymarket_stream_status_unavailable", status="unavailable")

    as_of = row.get("updated_at")
    stale = row.get("status") != "live" or _older_than(
        row.get("connection_last_message_at"),
        settings.connection_stale_seconds,
    )
    return {
        "ok": not stale,
        "source": "polymarket",
        "as_of": _iso(as_of),
        "stale": stale,
        "null_reason": "polymarket_stream_stale" if stale else None,
        "provenance": PROVENANCE,
        "price_basis": [],
        "forecast_status": "not_applicable",
        "status": row.get("status"),
        "connection_last_message_at": _iso(
            row.get("connection_last_message_at")
        ),
        "market_last_event_at": _iso(row.get("market_last_event_at")),
        "last_discovery_at": _iso(row.get("last_discovery_at")),
        "last_reconciliation_at": _iso(row.get("last_reconciliation_at")),
        "last_snapshot_at": _iso(row.get("last_snapshot_at")),
        "reconnect_count": row.get("reconnect_count", 0),
        "subscribed_market_count": row.get("subscribed_market_count", 0),
        "last_error": row.get("last_error"),
        "items": [],
    }


@router.get("/markets")
def get_polymarket_markets(
    limit: int = Query(default=25, ge=1, le=100),
) -> dict[str, Any]:
    return _list_response(
        lambda: PolymarketRepository().list_markets(limit=limit),
        empty_reason="polymarket_markets_unavailable",
    )


@router.get("/pulse")
def get_polymarket_pulse(
    limit: int = Query(default=25, ge=1, le=100),
) -> dict[str, Any]:
    return _list_response(
        lambda: PolymarketRepository().get_pulse(limit=limit),
        empty_reason="polymarket_feature_snapshots_unavailable",
        add_status=True,
    )


@router.get("/divergence")
def get_polymarket_divergence(
    limit: int = Query(default=25, ge=1, le=100),
) -> dict[str, Any]:
    return _list_response(
        lambda: PolymarketRepository().get_divergence(limit=limit),
        empty_reason="history_rhymes_forecasts_unavailable",
        add_status=True,
    )


@router.get("/markets/{market_id}/history")
def get_polymarket_market_history(
    market_id: str,
    limit: int = Query(default=1_440, ge=1, le=10_080),
) -> dict[str, Any]:
    return _list_response(
        lambda: PolymarketRepository().get_market_history(
            market_id, limit=limit
        ),
        empty_reason="polymarket_market_history_unavailable",
    )


@router.get("/forecasts/{question_id}")
def get_polymarket_forecast(question_id: str) -> dict[str, Any]:
    settings = PolymarketSettings.from_env()
    if not settings.enabled:
        return _empty("polymarket_disabled", status="disabled")
    row = _read(lambda: PolymarketRepository().get_forecast(question_id))
    if row is None:
        return _empty("history_rhymes_forecast_not_found", status="unavailable")
    stale = row.get("forecast_status") in {"stale", "withheld"}
    return {
        "ok": not stale and row.get("p_hr") is not None,
        "source": "polymarket",
        "as_of": _iso(row.get("forecast_at")),
        "stale": stale,
        "null_reason": row.get("null_reason"),
        "provenance": {
            **PROVENANCE,
            "model_version": row.get("model_version"),
            "data_lineage": row.get("data_lineage") or {},
        },
        "price_basis": (
            [row["price_basis"]] if row.get("price_basis") else []
        ),
        "forecast_status": row.get("forecast_status"),
        "item": _serialize(row),
        "items": [],
    }


def _list_response(
    load: Callable[[], list[dict[str, Any]]],
    *,
    empty_reason: str,
    add_status: bool = False,
) -> dict[str, Any]:
    settings = PolymarketSettings.from_env()
    if not settings.enabled:
        return _empty("polymarket_disabled", status="disabled")

    rows = _read(load)
    if add_status:
        for row in rows:
            row["status"] = _item_status(row)
    as_of_values = [
        row.get("as_of") or row.get("bucket_at") or row.get("updated_at")
        for row in rows
        if (
            row.get("as_of") is not None
            or row.get("bucket_at") is not None
            or row.get("updated_at") is not None
        )
    ]
    as_of_value = max(as_of_values, default=None)
    stale = not rows or any(bool(row.get("connection_stale")) for row in rows)
    return {
        "ok": bool(rows) and not stale,
        "source": "polymarket",
        "as_of": _iso(as_of_value),
        "stale": stale,
        "null_reason": empty_reason if not rows else (
            "polymarket_stream_stale" if stale else None
        ),
        "provenance": PROVENANCE,
        "price_basis": sorted(
            {
                str(row["price_basis"])
                for row in rows
                if row.get("price_basis")
            }
        ),
        "forecast_status": sorted(
            {
                str(row["forecast_status"])
                for row in rows
                if row.get("forecast_status")
            }
        ),
        "items": [_serialize(row) for row in rows],
    }


def _item_status(row: dict[str, Any]) -> str:
    if row.get("connection_stale"):
        return "STALE"
    if row.get("ambiguity_flag") or row.get("forecast_status") == "ambiguous":
        return "AMBIGUOUS"
    if row.get("thin_liquidity_flag"):
        return "THIN"
    if row.get("forecast_status") == "unsupported":
        return "UNSUPPORTED"
    if row.get("forecast_status") in {
        "research",
        "withheld",
        "uncalibrated",
    }:
        return "RESEARCH"
    return "LIVE"


def _read(load: Callable[[], Any]) -> Any:
    try:
        return load()
    except PolymarketRepositoryError as exc:
        raise HTTPException(
            status_code=503,
            detail="Polymarket application state is unavailable",
        ) from exc


def _empty(null_reason: str, *, status: str) -> dict[str, Any]:
    return {
        "ok": False,
        "source": "polymarket",
        "as_of": None,
        "stale": True,
        "null_reason": null_reason,
        "provenance": PROVENANCE,
        "status": status,
        "price_basis": [],
        "forecast_status": "unavailable",
        "items": [],
    }


def _older_than(value: Any, seconds: int) -> bool:
    if value is None:
        return True
    if not isinstance(value, datetime):
        try:
            value = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return True
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - value).total_seconds() > seconds


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _json_value(value) for key, value in row.items()}


def _json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_value(item) for item in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "as_tuple"):
        return float(value)
    return value


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
