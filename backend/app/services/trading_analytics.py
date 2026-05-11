"""Deterministic analytics for the Trading Analytics Copilot demo.

This module intentionally keeps the first-pass analytics transparent and
dependency-light. It reads environment-scoped fixture/live-shaped series from
Postgres, computes deterministic outputs, and returns structured unavailable
responses when data is sparse instead of inventing results.
"""

from __future__ import annotations

import json
import math
import os
import re
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import numpy as np
from psycopg.types.json import Jsonb

from app.db import get_cursor


EXPECTED_SERIES: dict[str, dict[str, str]] = {
    "WTI": {"label": "WTI crude oil", "asset_class": "commodity", "unit": "USD/bbl", "series_type": "price"},
    "BRENT": {"label": "Brent crude oil", "asset_class": "commodity", "unit": "USD/bbl", "series_type": "price"},
    "HH_GAS": {"label": "Henry Hub natural gas", "asset_class": "commodity", "unit": "USD/MMBtu", "series_type": "price"},
    "BRENT_WTI_SPREAD": {"label": "Brent-WTI spread", "asset_class": "commodity", "unit": "USD/bbl", "series_type": "spread"},
    "DXY_PROXY": {"label": "DXY proxy", "asset_class": "macro", "unit": "index", "series_type": "macro"},
    "UST10Y": {"label": "10Y yield proxy", "asset_class": "rates", "unit": "percent", "series_type": "macro"},
    "VIX": {"label": "VIX proxy", "asset_class": "volatility", "unit": "index", "series_type": "macro"},
    "CRUDE_INVENTORY_PROXY": {"label": "Crude inventory proxy", "asset_class": "fundamental", "unit": "million bbl", "series_type": "fundamental"},
    "GAS_STORAGE_PROXY": {"label": "Gas storage proxy", "asset_class": "fundamental", "unit": "bcf", "series_type": "fundamental"},
    "RIG_COUNT_PROXY": {"label": "Rig count proxy", "asset_class": "fundamental", "unit": "count", "series_type": "fundamental"},
}

CORE_ALIGNMENT_SYMBOLS = ["WTI", "BRENT", "HH_GAS", "DXY_PROXY", "UST10Y", "VIX"]
REGRESSION_FACTOR_ALIASES = {
    "DXY": "DXY_PROXY",
    "DXY_PROXY": "DXY_PROXY",
    "RATES": "UST10Y",
    "RATE": "UST10Y",
    "10Y": "UST10Y",
    "UST10Y": "UST10Y",
    "VIX": "VIX",
    "INVENTORY": "CRUDE_INVENTORY_PROXY",
    "CRUDE_INVENTORY": "CRUDE_INVENTORY_PROXY",
    "CRUDE_INVENTORY_PROXY": "CRUDE_INVENTORY_PROXY",
    "STORAGE": "GAS_STORAGE_PROXY",
    "GAS_STORAGE": "GAS_STORAGE_PROXY",
    "GAS_STORAGE_PROXY": "GAS_STORAGE_PROXY",
}

MIN_SEASONALITY_PRIOR_YEARS = 3
MIN_CORRELATION_EXTRA_OBS = 20
MIN_REGRESSION_OBS = 120
MIN_ANALOG_OBS = 250
SUPPORTED_CAPABILITIES = [
    "seasonality",
    "rolling_correlation",
    "regression",
    "scenario",
    "analogs",
    "memo",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _date_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _coerce_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _coerce_float(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, np.generic):
        return float(value)
    return float(value)


def _round(value: Any, digits: int = 4) -> float | None:
    try:
        f = _coerce_float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    return round(f, digits)


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, np.ndarray):
        return [_json_safe(v) for v in value.tolist()]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def _unavailable(reason: str, *, warnings: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    return {
        "available": False,
        "unavailable_reason": reason,
        "warnings": warnings or [reason],
        **extra,
    }


def _normalize_symbol(symbol: str | None, default: str = "WTI") -> str:
    if not symbol:
        return default
    value = symbol.strip().upper()
    if value in EXPECTED_SERIES:
        return value
    if value in REGRESSION_FACTOR_ALIASES:
        return REGRESSION_FACTOR_ALIASES[value]
    return value


def _normalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        try:
            obs_date = _coerce_date(row["observation_date"])
            value = _coerce_float(row["value"])
        except (KeyError, TypeError, ValueError):
            continue
        normalized.append(
            {
                "symbol": str(row.get("symbol", "")).upper(),
                "asset_class": row.get("asset_class") or EXPECTED_SERIES.get(str(row.get("symbol", "")).upper(), {}).get("asset_class", "unknown"),
                "source": row.get("source") or "unknown",
                "observation_date": obs_date,
                "value": value,
                "unit": row.get("unit") or EXPECTED_SERIES.get(str(row.get("symbol", "")).upper(), {}).get("unit", ""),
                "series_type": row.get("series_type") or EXPECTED_SERIES.get(str(row.get("symbol", "")).upper(), {}).get("series_type", "value"),
            }
        )
    normalized.sort(key=lambda r: (r["symbol"], r["observation_date"]))
    return normalized


def _load_market_rows(
    env_id: str | UUID,
    symbols: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict[str, Any]]:
    clauses = ["env_id = %s"]
    params: list[Any] = [str(env_id)]
    if symbols:
        clauses.append("symbol = ANY(%s)")
        params.append([_normalize_symbol(s) for s in symbols])
    if start_date:
        clauses.append("observation_date >= %s")
        params.append(start_date)
    if end_date:
        clauses.append("observation_date <= %s")
        params.append(end_date)
    sql = f"""
        SELECT symbol, asset_class, source, observation_date, value, unit, series_type
        FROM public.trading_market_series
        WHERE {" AND ".join(clauses)}
        ORDER BY symbol, observation_date
    """
    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        return _normalize_rows(cur.fetchall())


def _load_feature_summary(env_id: str | UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*)::int AS row_count,
                   MIN(observation_date) AS min_date,
                   MAX(observation_date) AS max_date,
                   COUNT(DISTINCT feature_name)::int AS feature_count
            FROM public.trading_feature_series
            WHERE env_id = %s
            """,
            (str(env_id),),
        )
        row = cur.fetchone() or {}
    return {
        "row_count": int(row.get("row_count") or 0),
        "feature_count": int(row.get("feature_count") or 0),
        "min_date": _date_iso(row.get("min_date")),
        "max_date": _date_iso(row.get("max_date")),
    }


def _count_table(env_id: str | UUID, table: str) -> int:
    with get_cursor() as cur:
        cur.execute(f"SELECT COUNT(*)::int AS count FROM public.{table} WHERE env_id = %s", (str(env_id),))
        row = cur.fetchone() or {}
    return int(row.get("count") or 0)


def _group_by_symbol(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["symbol"]].append(row)
    return grouped


def _latest_by_symbol(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        latest[row["symbol"]] = row
    return latest


def _source_freshness(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"series_source": "unavailable", "latest_observation_date": None, "staleness_status": "unavailable"}
    latest = max(_coerce_date(r["observation_date"]) for r in rows)
    sources = sorted({str(r.get("source") or "unknown") for r in rows})
    staleness_days = max((date.today() - latest).days, 0)
    return {
        "series_source": ", ".join(sources),
        "latest_observation_date": latest.isoformat(),
        "staleness_days": staleness_days,
        "staleness_status": "fresh" if staleness_days <= 7 else "stale",
    }


def _aligned_values(
    rows: list[dict[str, Any]],
    symbols: list[str],
) -> list[dict[str, Any]]:
    grouped = _group_by_symbol(rows)
    maps: dict[str, dict[date, float]] = {
        symbol: {r["observation_date"]: r["value"] for r in grouped.get(symbol, [])}
        for symbol in symbols
    }
    if any(not values for values in maps.values()):
        return []
    common_dates = sorted(set.intersection(*(set(values.keys()) for values in maps.values())))
    return [{"date": d, **{symbol: maps[symbol][d] for symbol in symbols}} for d in common_dates]


def _returns_from_aligned(aligned: list[dict[str, Any]], symbols: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for idx in range(1, len(aligned)):
        prior = aligned[idx - 1]
        current = aligned[idx]
        item: dict[str, Any] = {"date": current["date"]}
        ok = True
        for symbol in symbols:
            a = prior.get(symbol)
            b = current.get(symbol)
            if a is None or b is None:
                ok = False
                break
            try:
                if a > 0 and b > 0:
                    item[symbol] = math.log(b / a)
                else:
                    item[symbol] = b - a
            except (ValueError, ZeroDivisionError):
                ok = False
                break
        if ok:
            out.append(item)
    return out


def _percentile(values: list[float], value: float) -> float | None:
    clean = [v for v in values if math.isfinite(v)]
    if not clean:
        return None
    return 100.0 * sum(1 for v in clean if v <= value) / len(clean)


def _quantile(values: list[float], q: float) -> float | None:
    clean = np.array([v for v in values if math.isfinite(v)], dtype=float)
    if clean.size == 0:
        return None
    return float(np.quantile(clean, q))


def record_analytics_run(
    env_id: str | UUID,
    *,
    run_type: str,
    question: str | None,
    params: dict[str, Any],
    result: dict[str, Any],
    freshness: dict[str, Any] | None = None,
    warnings: list[str] | None = None,
) -> str | None:
    """Persist a deterministic analytics run. Returns None if persistence fails."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.trading_analytics_runs
                  (env_id, run_type, question, params, result, freshness, warnings)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id::text
                """,
                (
                    str(env_id),
                    run_type,
                    question,
                    Jsonb(_json_safe(params)),
                    Jsonb(_json_safe(result)),
                    Jsonb(_json_safe(freshness or {})),
                    warnings or [],
                ),
            )
            row = cur.fetchone() or {}
            return row.get("id")
    except Exception:
        return None


def get_pipeline_health(env_id: str | UUID) -> dict[str, Any]:
    try:
        rows = _load_market_rows(env_id)
        feature_summary = _load_feature_summary(env_id)
        run_count = _count_table(env_id, "trading_analytics_runs")
        memo_count = _count_table(env_id, "trading_memos")
    except Exception as exc:
        return _unavailable(
            "Trading analytics tables are unavailable. Apply the trading analytics migration and seed the demo data.",
            env_id=str(env_id),
            layers=[
                {"name": "Bronze", "status": "unavailable", "reason": str(exc)},
                {"name": "Silver", "status": "unavailable", "reason": "Bronze data unavailable."},
                {"name": "Gold", "status": "unavailable", "reason": "Analytics tables unavailable."},
            ],
            source={"series_source": "unavailable"},
        )

    grouped = _group_by_symbol(rows)
    latest = _latest_by_symbol(rows)
    series_statuses: list[dict[str, Any]] = []
    unavailable_sources: list[dict[str, str]] = []
    today = date.today()
    for symbol, meta in EXPECTED_SERIES.items():
        symbol_rows = grouped.get(symbol, [])
        if not symbol_rows:
            unavailable_sources.append({"symbol": symbol, "reason": "No rows loaded for expected series."})
            series_statuses.append(
                {
                    "symbol": symbol,
                    "label": meta["label"],
                    "available": False,
                    "row_count": 0,
                    "missing_values": 0,
                    "date_range": {"start": None, "end": None},
                    "latest_value": None,
                    "unit": meta["unit"],
                    "source": None,
                    "staleness_status": "unavailable",
                    "unavailable_reason": "No rows loaded for expected series.",
                }
            )
            continue
        dates = [r["observation_date"] for r in symbol_rows]
        latest_row = latest[symbol]
        staleness_days = max((today - latest_row["observation_date"]).days, 0)
        series_statuses.append(
            {
                "symbol": symbol,
                "label": meta["label"],
                "available": True,
                "row_count": len(symbol_rows),
                "missing_values": 0,
                "date_range": {"start": min(dates).isoformat(), "end": max(dates).isoformat()},
                "latest_value": _round(latest_row["value"], 4),
                "unit": latest_row["unit"],
                "source": latest_row["source"],
                "staleness_days": staleness_days,
                "staleness_status": "fresh" if staleness_days <= 7 else "stale",
            }
        )

    bronze_ok = all(grouped.get(symbol) for symbol in EXPECTED_SERIES)
    aligned = _aligned_values(rows, CORE_ALIGNMENT_SYMBOLS)
    silver_ok = len(aligned) >= MIN_REGRESSION_OBS
    gold_ready = {
        "seasonality": any(len({r["observation_date"].year for r in grouped.get(symbol, [])}) >= MIN_SEASONALITY_PRIOR_YEARS + 1 for symbol in ["WTI", "BRENT", "HH_GAS"]),
        "correlation": len(_returns_from_aligned(_aligned_values(rows, ["WTI", "BRENT"]), ["WTI", "BRENT"])) >= 60 + MIN_CORRELATION_EXTRA_OBS,
        "regression": len(_returns_from_aligned(_aligned_values(rows, ["WTI", "DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"]), ["WTI", "DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"])) >= MIN_REGRESSION_OBS,
        "analogs": len(aligned) >= MIN_ANALOG_OBS,
        "memos": memo_count > 0,
    }
    gold_ok = feature_summary["row_count"] > 0 and any(gold_ready.values())
    freshness = _source_freshness(rows)

    return {
        "available": bronze_ok,
        "env_id": str(env_id),
        "source_mode": freshness.get("series_source", "unavailable"),
        "generated_at": _now_iso(),
        "freshness": freshness,
        "layers": [
            {
                "name": "Bronze",
                "definition": "Raw or seeded market/fundamental rows in trading_market_series.",
                "status": "available" if bronze_ok else "unavailable",
                "row_count": len(rows),
                "missing_values": 0,
                "unavailable_count": len(unavailable_sources),
            },
            {
                "name": "Silver",
                "definition": "Normalized aligned daily series suitable for analytics.",
                "status": "available" if silver_ok else "unavailable",
                "row_count": len(aligned),
                "aligned_symbols": CORE_ALIGNMENT_SYMBOLS,
                "unavailable_reason": None if silver_ok else "Fewer than 120 aligned observations across core series.",
            },
            {
                "name": "Gold",
                "definition": "Feature coverage plus analytics run/memo readiness.",
                "status": "available" if gold_ok else "unavailable",
                "feature_rows": feature_summary["row_count"],
                "feature_count": feature_summary["feature_count"],
                "analytics_run_count": run_count,
                "memo_count": memo_count,
                "tool_readiness": gold_ready,
            },
        ],
        "series": series_statuses,
        "market_overview": [
            {
                "symbol": symbol,
                "label": EXPECTED_SERIES[symbol]["label"],
                "value": _round(latest[symbol]["value"], 4) if symbol in latest else None,
                "unit": latest[symbol]["unit"] if symbol in latest else EXPECTED_SERIES[symbol]["unit"],
                "source": latest[symbol]["source"] if symbol in latest else None,
                "available": symbol in latest,
                "unavailable_reason": None if symbol in latest else "No rows loaded for expected series.",
            }
            for symbol in EXPECTED_SERIES
        ],
        "unavailable_sources": unavailable_sources,
        "warnings": [] if bronze_ok else ["One or more expected trading demo series are unavailable."],
    }


def get_series(
    env_id: str | UUID,
    symbols: list[str],
    start_date: date | None = None,
    end_date: date | None = None,
    latest: bool = False,
) -> dict[str, Any]:
    normalized_symbols = [_normalize_symbol(s) for s in symbols if s]
    if not normalized_symbols:
        normalized_symbols = list(EXPECTED_SERIES.keys())
    try:
        rows = _load_market_rows(env_id, normalized_symbols, start_date, end_date)
    except Exception as exc:
        return _unavailable(str(exc), env_id=str(env_id), symbols=normalized_symbols)
    grouped = _group_by_symbol(rows)
    latest_rows = _latest_by_symbol(rows)
    unavailable = [
        {"symbol": symbol, "reason": "No rows found for requested date range."}
        for symbol in normalized_symbols
        if not grouped.get(symbol)
    ]
    data_rows = rows
    if latest:
        data_rows = [latest_rows[symbol] for symbol in normalized_symbols if symbol in latest_rows]
    return {
        "available": len(data_rows) > 0,
        "env_id": str(env_id),
        "symbols": normalized_symbols,
        "rows": [
            {
                **{k: v for k, v in row.items() if k != "observation_date"},
                "observation_date": row["observation_date"].isoformat(),
            }
            for row in data_rows
        ],
        "latest_by_symbol": {
            symbol: {
                **{k: v for k, v in row.items() if k != "observation_date"},
                "observation_date": row["observation_date"].isoformat(),
            }
            for symbol, row in latest_rows.items()
        },
        "unavailable_symbols": unavailable,
        "source": _source_freshness(rows),
        "warnings": [item["reason"] for item in unavailable],
    }


def compute_seasonality(
    env_id: str | UUID,
    symbol: str,
    lookback_years: int = 5,
    *,
    persist: bool = False,
    question: str | None = None,
) -> dict[str, Any]:
    symbol = _normalize_symbol(symbol, "HH_GAS")
    try:
        rows = _load_market_rows(env_id, [symbol])
    except Exception as exc:
        result = _unavailable(str(exc), env_id=str(env_id), symbol=symbol)
        return result
    if not rows:
        result = _unavailable("No rows loaded for requested symbol.", env_id=str(env_id), symbol=symbol)
        return result
    years = sorted({r["observation_date"].year for r in rows})
    current_year = max(years)
    prior_years = [y for y in years if y < current_year][-lookback_years:]
    if len(prior_years) < MIN_SEASONALITY_PRIOR_YEARS:
        result = _unavailable(
            f"Seasonality requires at least {MIN_SEASONALITY_PRIOR_YEARS} prior years.",
            env_id=str(env_id),
            symbol=symbol,
            prior_years=prior_years,
            source=_source_freshness(rows),
        )
        if persist:
            result["run_id"] = record_analytics_run(env_id, run_type="seasonality", question=question, params={"symbol": symbol, "lookback_years": lookback_years}, result=result, freshness=result.get("source"), warnings=result.get("warnings"))
        return result

    by_doy: dict[int, list[float]] = defaultdict(list)
    for row in rows:
        if row["observation_date"].year in prior_years:
            by_doy[row["observation_date"].timetuple().tm_yday].append(row["value"])

    current_rows = [r for r in rows if r["observation_date"].year == current_year]
    chart: list[dict[str, Any]] = []
    for row in current_rows:
        doy = row["observation_date"].timetuple().tm_yday
        historical = by_doy.get(doy, [])
        chart.append(
            {
                "date": row["observation_date"].isoformat(),
                "day_of_year": doy,
                "current": _round(row["value"], 4),
                "historical_avg": _round(np.mean(historical), 4) if historical else None,
                "p10": _round(_quantile(historical, 0.10), 4),
                "p90": _round(_quantile(historical, 0.90), 4),
            }
        )

    latest_row = current_rows[-1]
    latest_doy = latest_row["observation_date"].timetuple().tm_yday
    same_window = []
    for offset in range(-2, 3):
        same_window.extend(by_doy.get(latest_doy + offset, []))
    percentile = _percentile(same_window, latest_row["value"])
    result = {
        "available": True,
        "env_id": str(env_id),
        "symbol": symbol,
        "label": EXPECTED_SERIES.get(symbol, {}).get("label", symbol),
        "lookback_years": lookback_years,
        "prior_years": prior_years,
        "current_year": current_year,
        "date_range": {"start": rows[0]["observation_date"].isoformat(), "end": rows[-1]["observation_date"].isoformat()},
        "latest": {
            "date": latest_row["observation_date"].isoformat(),
            "value": _round(latest_row["value"], 4),
            "unit": latest_row["unit"],
            "seasonal_percentile": _round(percentile, 1),
        },
        "chart": chart,
        "source": _source_freshness(rows),
        "warnings": [] if percentile is not None else ["Latest seasonal percentile unavailable for this day-of-year window."],
    }
    if persist:
        result["run_id"] = record_analytics_run(env_id, run_type="seasonality", question=question, params={"symbol": symbol, "lookback_years": lookback_years}, result=result, freshness=result.get("source"), warnings=result.get("warnings"))
    return result


def compute_rolling_correlation(
    env_id: str | UUID,
    symbol_a: str,
    symbol_b: str,
    window_days: int = 60,
    *,
    persist: bool = False,
    question: str | None = None,
) -> dict[str, Any]:
    symbol_a = _normalize_symbol(symbol_a, "WTI")
    symbol_b = _normalize_symbol(symbol_b, "BRENT")
    window_days = max(5, int(window_days))
    try:
        rows = _load_market_rows(env_id, [symbol_a, symbol_b])
    except Exception as exc:
        result = _unavailable(str(exc), env_id=str(env_id), symbol_a=symbol_a, symbol_b=symbol_b)
        return result
    aligned = _aligned_values(rows, [symbol_a, symbol_b])
    returns = _returns_from_aligned(aligned, [symbol_a, symbol_b])
    min_obs = window_days + MIN_CORRELATION_EXTRA_OBS
    if len(returns) < min_obs:
        result = _unavailable(
            f"Rolling correlation requires at least window_days + {MIN_CORRELATION_EXTRA_OBS} aligned observations.",
            env_id=str(env_id),
            symbol_a=symbol_a,
            symbol_b=symbol_b,
            window_days=window_days,
            n_obs=len(returns),
            source=_source_freshness(rows),
        )
        if persist:
            result["run_id"] = record_analytics_run(env_id, run_type="rolling_correlation", question=question, params={"symbol_a": symbol_a, "symbol_b": symbol_b, "window_days": window_days}, result=result, freshness=result.get("source"), warnings=result.get("warnings"))
        return result

    points: list[dict[str, Any]] = []
    for idx in range(window_days, len(returns) + 1):
        window = returns[idx - window_days:idx]
        x = np.array([r[symbol_a] for r in window], dtype=float)
        y = np.array([r[symbol_b] for r in window], dtype=float)
        corr = None
        if np.std(x) > 0 and np.std(y) > 0:
            corr = float(np.corrcoef(x, y)[0, 1])
        points.append({"date": returns[idx - 1]["date"].isoformat(), "correlation": _round(corr, 4)})
    corr_values = [p["correlation"] for p in points if p["correlation"] is not None]
    result = {
        "available": True,
        "env_id": str(env_id),
        "symbol_a": symbol_a,
        "symbol_b": symbol_b,
        "window_days": window_days,
        "n_obs": len(returns),
        "date_range": {"start": returns[0]["date"].isoformat(), "end": returns[-1]["date"].isoformat()},
        "chart": points,
        "stats": {
            "latest": _round(corr_values[-1], 4) if corr_values else None,
            "average": _round(np.mean(corr_values), 4) if corr_values else None,
            "min": _round(np.min(corr_values), 4) if corr_values else None,
            "max": _round(np.max(corr_values), 4) if corr_values else None,
        },
        "source": _source_freshness(rows),
        "warnings": [],
    }
    if persist:
        result["run_id"] = record_analytics_run(env_id, run_type="rolling_correlation", question=question, params={"symbol_a": symbol_a, "symbol_b": symbol_b, "window_days": window_days}, result=result, freshness=result.get("source"), warnings=result.get("warnings"))
    return result


def run_factor_regression(
    env_id: str | UUID,
    dependent_symbol: str,
    factor_symbols: list[str],
    lookback_days: int = 756,
    *,
    persist: bool = False,
    question: str | None = None,
) -> dict[str, Any]:
    dependent_symbol = _normalize_symbol(dependent_symbol, "WTI")
    normalized_factors = [_normalize_symbol(s) for s in factor_symbols]
    normalized_factors = [s for s in normalized_factors if s and s != dependent_symbol]
    if not normalized_factors:
        normalized_factors = ["DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"]
    symbols = [dependent_symbol, *normalized_factors]
    try:
        rows = _load_market_rows(env_id, symbols)
    except Exception as exc:
        result = _unavailable(str(exc), env_id=str(env_id), dependent_symbol=dependent_symbol, factor_symbols=normalized_factors)
        return result
    aligned = _aligned_values(rows, symbols)
    returns = _returns_from_aligned(aligned, symbols)
    if lookback_days > 0:
        returns = returns[-lookback_days:]
    if len(returns) < MIN_REGRESSION_OBS:
        result = _unavailable(
            f"Regression requires at least {MIN_REGRESSION_OBS} aligned observations.",
            env_id=str(env_id),
            dependent_symbol=dependent_symbol,
            factor_symbols=normalized_factors,
            n_obs=len(returns),
            source=_source_freshness(rows),
        )
        if persist:
            result["run_id"] = record_analytics_run(env_id, run_type="regression", question=question, params={"dependent_symbol": dependent_symbol, "factor_symbols": normalized_factors, "lookback_days": lookback_days}, result=result, freshness=result.get("source"), warnings=result.get("warnings"))
        return result

    y = np.array([r[dependent_symbol] for r in returns], dtype=float)
    x = np.array([[r[symbol] for symbol in normalized_factors] for r in returns], dtype=float)
    x_design = np.column_stack([np.ones(len(x)), x])
    beta, *_ = np.linalg.lstsq(x_design, y, rcond=None)
    y_hat = x_design @ beta
    ss_res = float(np.sum((y - y_hat) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r_squared = 1.0 - (ss_res / ss_tot) if ss_tot else 0.0
    warnings: list[str] = []
    if len(returns) < 180:
        warnings.append("Regression sample is near the minimum threshold; interpret coefficients cautiously.")
    corr_matrix = np.corrcoef(x, rowvar=False) if len(normalized_factors) > 1 else np.array([[1.0]])
    if len(normalized_factors) > 1:
        for i in range(len(normalized_factors)):
            for j in range(i + 1, len(normalized_factors)):
                if abs(float(corr_matrix[i, j])) > 0.9:
                    warnings.append(f"Potential multicollinearity between {normalized_factors[i]} and {normalized_factors[j]}.")
    coefficients = [
        {
            "factor": factor,
            "coefficient": _round(beta[idx + 1], 6),
            "p_value": None,
            "p_value_unavailable_reason": "statsmodels is not required for this deterministic demo; p-values are not computed.",
        }
        for idx, factor in enumerate(normalized_factors)
    ]
    result = {
        "available": True,
        "env_id": str(env_id),
        "dependent_symbol": dependent_symbol,
        "factor_symbols": normalized_factors,
        "lookback_days": lookback_days,
        "n_obs": len(returns),
        "date_range": {"start": returns[0]["date"].isoformat(), "end": returns[-1]["date"].isoformat()},
        "intercept": _round(beta[0], 6),
        "r_squared": _round(r_squared, 4),
        "coefficients": coefficients,
        "method": "numpy_lstsq_ols_on_aligned_daily_returns",
        "source": _source_freshness(rows),
        "warnings": warnings,
    }
    if persist:
        result["run_id"] = record_analytics_run(env_id, run_type="regression", question=question, params={"dependent_symbol": dependent_symbol, "factor_symbols": normalized_factors, "lookback_days": lookback_days}, result=result, freshness=result.get("source"), warnings=warnings)
    return result


def run_scenario_model(
    env_id: str | UUID,
    base_symbol: str,
    shocks: dict[str, Any],
    *,
    persist: bool = False,
    question: str | None = None,
) -> dict[str, Any]:
    base_symbol = _normalize_symbol(base_symbol, "WTI")
    try:
        rows = _load_market_rows(env_id, [base_symbol])
    except Exception as exc:
        result = _unavailable(str(exc), env_id=str(env_id), base_symbol=base_symbol)
        return result
    latest = _latest_by_symbol(rows).get(base_symbol)
    if not latest:
        result = _unavailable("No latest value found for scenario base symbol.", env_id=str(env_id), base_symbol=base_symbol, source=_source_freshness(rows))
        if persist:
            result["run_id"] = record_analytics_run(env_id, run_type="scenario", question=question, params={"base_symbol": base_symbol, "shocks": shocks}, result=result, freshness=result.get("source"), warnings=result.get("warnings"))
        return result

    clean_shocks = {
        "inventory_shock": _round(shocks.get("inventory_shock", shocks.get("inventory", 0)), 4) or 0.0,
        "dxy_shock": _round(shocks.get("dxy_shock", shocks.get("dxy", 0)), 4) or 0.0,
        "rate_shock": _round(shocks.get("rate_shock", shocks.get("rates", 0)), 4) or 0.0,
        "volatility_shock": _round(shocks.get("volatility_shock", shocks.get("vix", 0)), 4) or 0.0,
        "storage_shock": _round(shocks.get("storage_shock", shocks.get("storage", 0)), 4) or 0.0,
    }
    sensitivities = {
        "inventory_shock": {"label": "Crude inventory surprise", "unit": "million bbl", "impact_per_unit_pct": -0.08 if base_symbol != "HH_GAS" else -0.015},
        "dxy_shock": {"label": "DXY move", "unit": "pct", "impact_per_unit_pct": -0.35},
        "rate_shock": {"label": "10Y rate move", "unit": "bp", "impact_per_unit_pct": -0.015},
        "volatility_shock": {"label": "VIX shock", "unit": "index points", "impact_per_unit_pct": -0.08},
        "storage_shock": {"label": "Gas storage surprise", "unit": "bcf", "impact_per_unit_pct": -0.018 if base_symbol == "HH_GAS" else -0.004},
    }
    table: list[dict[str, Any]] = []
    total_impact = 0.0
    for key, spec in sensitivities.items():
        shock = float(clean_shocks[key])
        impact = shock * float(spec["impact_per_unit_pct"])
        total_impact += impact
        table.append(
            {
                "factor": key,
                "label": spec["label"],
                "shock": _round(shock, 4),
                "unit": spec["unit"],
                "impact_per_unit_pct": spec["impact_per_unit_pct"],
                "estimated_return_impact_pct": _round(impact, 4),
            }
        )
    pressure = "bullish" if total_impact > 0.25 else "bearish" if total_impact < -0.25 else "neutral"
    result = {
        "available": True,
        "env_id": str(env_id),
        "base_symbol": base_symbol,
        "latest_price": _round(latest["value"], 4),
        "unit": latest["unit"],
        "shocks": clean_shocks,
        "estimated_return_impact_pct": _round(total_impact, 4),
        "estimated_price_impact": _round(latest["value"] * total_impact / 100.0, 4),
        "directional_pressure": pressure,
        "sensitivity_table": table,
        "caveats": [
            "Scenario sensitivities are deterministic demo assumptions, not a production trading signal.",
            "Use this to discuss direction and magnitude with analysts before connecting live calibrated models.",
        ],
        "source": _source_freshness(rows),
        "warnings": [],
    }
    if persist:
        result["run_id"] = record_analytics_run(env_id, run_type="scenario", question=question, params={"base_symbol": base_symbol, "shocks": clean_shocks}, result=result, freshness=result.get("source"), warnings=[])
    return result


def _state_vector(aligned: list[dict[str, Any]], end_idx: int, window: int) -> dict[str, float] | None:
    if end_idx - window < 1:
        return None
    slice_rows = aligned[end_idx - window:end_idx]
    if len(slice_rows) < window:
        return None
    try:
        wti = np.array([r["WTI"] for r in slice_rows], dtype=float)
        brent = np.array([r["BRENT"] for r in slice_rows], dtype=float)
        spread = np.array([r["BRENT_WTI_SPREAD"] for r in slice_rows], dtype=float)
        inv = np.array([r["CRUDE_INVENTORY_PROXY"] for r in slice_rows], dtype=float)
        storage = np.array([r["GAS_STORAGE_PROXY"] for r in slice_rows], dtype=float)
        dxy = np.array([r["DXY_PROXY"] for r in slice_rows], dtype=float)
        rate = np.array([r["UST10Y"] for r in slice_rows], dtype=float)
        vix = np.array([r["VIX"] for r in slice_rows], dtype=float)
        returns = np.diff(np.log(wti))
    except Exception:
        return None
    spread_std = float(np.std(spread)) or 1.0
    inv_std = float(np.std(inv)) or 1.0
    storage_std = float(np.std(storage)) or 1.0
    return {
        "wti_return": float(math.log(wti[-1] / wti[0])),
        "wti_volatility": float(np.std(returns) * math.sqrt(252)),
        "brent_wti_spread_z": float((spread[-1] - np.mean(spread)) / spread_std),
        "crude_inventory_z": float((inv[-1] - np.mean(inv)) / inv_std),
        "gas_storage_z": float((storage[-1] - np.mean(storage)) / storage_std),
        "dxy_change": float(math.log(dxy[-1] / dxy[max(0, len(dxy) - 21)])),
        "rate_change": float(rate[-1] - rate[max(0, len(rate) - 21)]),
        "vix_change": float(vix[-1] - vix[max(0, len(vix) - 21)]),
        "brent_return": float(math.log(brent[-1] / brent[0])),
    }


def _similarity(current: dict[str, float], candidate: dict[str, float]) -> tuple[float, float, float]:
    keys = list(current.keys())
    a = np.array([current[k] for k in keys], dtype=float)
    b = np.array([candidate[k] for k in keys], dtype=float)
    a_norm = float(np.linalg.norm(a))
    b_norm = float(np.linalg.norm(b))
    cosine = float(np.dot(a, b) / (a_norm * b_norm)) if a_norm and b_norm else 0.0
    distance = float(np.linalg.norm(a - b))
    score = 0.7 * ((cosine + 1.0) / 2.0) + 0.3 * (1.0 / (1.0 + distance))
    return score, cosine, distance


def find_historical_analogs(
    env_id: str | UUID,
    target_symbol_or_state: str,
    lookback_days: int = 60,
    top_n: int = 5,
    *,
    persist: bool = False,
    question: str | None = None,
) -> dict[str, Any]:
    target_symbol = _normalize_symbol(target_symbol_or_state, "WTI")
    symbols = ["WTI", "BRENT", "BRENT_WTI_SPREAD", "CRUDE_INVENTORY_PROXY", "GAS_STORAGE_PROXY", "DXY_PROXY", "UST10Y", "VIX"]
    try:
        rows = _load_market_rows(env_id, symbols)
    except Exception as exc:
        result = _unavailable(str(exc), env_id=str(env_id), target_symbol=target_symbol)
        return result
    aligned = _aligned_values(rows, symbols)
    if len(aligned) < MIN_ANALOG_OBS:
        result = _unavailable(
            f"Historical analogs require at least {MIN_ANALOG_OBS} aligned observations.",
            env_id=str(env_id),
            target_symbol=target_symbol,
            n_obs=len(aligned),
            source=_source_freshness(rows),
        )
        if persist:
            result["run_id"] = record_analytics_run(env_id, run_type="analogs", question=question, params={"target_symbol": target_symbol, "lookback_days": lookback_days, "top_n": top_n}, result=result, freshness=result.get("source"), warnings=result.get("warnings"))
        return result
    lookback_days = max(20, int(lookback_days))
    current_vec = _state_vector(aligned, len(aligned), lookback_days)
    if not current_vec:
        result = _unavailable("Could not build current state vector.", env_id=str(env_id), target_symbol=target_symbol, source=_source_freshness(rows))
        if persist:
            result["run_id"] = record_analytics_run(env_id, run_type="analogs", question=question, params={"target_symbol": target_symbol, "lookback_days": lookback_days, "top_n": top_n}, result=result, freshness=result.get("source"), warnings=result.get("warnings"))
        return result
    candidates: list[dict[str, Any]] = []
    latest_start = len(aligned) - lookback_days - 30
    for end_idx in range(lookback_days, max(lookback_days, latest_start), 10):
        vec = _state_vector(aligned, end_idx, lookback_days)
        if not vec:
            continue
        score, cosine, distance = _similarity(current_vec, vec)
        diffs = {k: abs(current_vec[k] - vec[k]) for k in current_vec}
        matched = [k for k, _ in sorted(diffs.items(), key=lambda item: item[1])[:3]]
        diverged = [k for k, _ in sorted(diffs.items(), key=lambda item: item[1], reverse=True)[:3]]
        forward_return = None
        if end_idx + 30 < len(aligned):
            start_price = aligned[end_idx - 1].get(target_symbol)
            end_price = aligned[end_idx + 29].get(target_symbol)
            if start_price and end_price and start_price > 0 and end_price > 0:
                forward_return = math.log(end_price / start_price) * 100.0
        candidates.append(
            {
                "start_date": aligned[end_idx - lookback_days]["date"].isoformat(),
                "end_date": aligned[end_idx - 1]["date"].isoformat(),
                "score": _round(score, 4),
                "cosine_similarity": _round(cosine, 4),
                "distance": _round(distance, 4),
                "matching_features": matched,
                "divergent_features": diverged,
                "forward_30d_return_pct": _round(forward_return, 2),
            }
        )
    top = sorted(candidates, key=lambda item: item["score"] or 0, reverse=True)[:top_n]
    result = {
        "available": bool(top),
        "env_id": str(env_id),
        "target_symbol": target_symbol,
        "lookback_days": lookback_days,
        "n_obs": len(aligned),
        "engine_label": "demo analog engine",
        "current_state": {k: _round(v, 4) for k, v in current_vec.items()},
        "analogs": top,
        "source": _source_freshness(rows),
        "warnings": ["Demo analog logic is for interview discussion and is not a production trading recommendation."],
    }
    if not top:
        result.update(_unavailable("No historical windows could be scored.", env_id=str(env_id), target_symbol=target_symbol))
    if persist:
        result["run_id"] = record_analytics_run(env_id, run_type="analogs", question=question, params={"target_symbol": target_symbol, "lookback_days": lookback_days, "top_n": top_n}, result=result, freshness=result.get("source"), warnings=result.get("warnings"))
    return result


def _summarize_result_for_memo(payload: dict[str, Any]) -> list[str]:
    if not payload.get("available"):
        return [f"Result unavailable: {payload.get('unavailable_reason', 'No reason provided.')}"]
    if payload.get("r_squared") is not None:
        coeffs = payload.get("coefficients") or []
        top = sorted(coeffs, key=lambda c: abs(c.get("coefficient") or 0), reverse=True)[:3]
        return [
            f"Regression R2: {payload.get('r_squared')} across {payload.get('n_obs')} observations.",
            "Largest factors: " + ", ".join(f"{c.get('factor')} ({c.get('coefficient')})" for c in top),
        ]
    if payload.get("stats"):
        stats = payload["stats"]
        return [f"Latest rolling correlation: {stats.get('latest')}; average: {stats.get('average')}; range: {stats.get('min')} to {stats.get('max')}."]
    if payload.get("latest", {}).get("seasonal_percentile") is not None:
        latest = payload["latest"]
        return [f"Latest {payload.get('symbol')} value is {latest.get('value')} {latest.get('unit')} at the {latest.get('seasonal_percentile')} seasonal percentile."]
    if payload.get("estimated_return_impact_pct") is not None:
        return [f"Scenario estimates {payload.get('directional_pressure')} pressure with {payload.get('estimated_return_impact_pct')}% return impact."]
    if payload.get("analogs"):
        best = payload["analogs"][0]
        return [f"Top analog window: {best.get('start_date')} to {best.get('end_date')} with score {best.get('score')}."]
    return ["Analytics payload available; see evidence JSON for full details."]


def persist_memo(
    env_id: str | UUID,
    *,
    run_id: str | None,
    title: str,
    question: str,
    memo_md: str,
    evidence: dict[str, Any],
    confidence: str,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.trading_memos
              (env_id, run_id, title, question, memo_md, evidence, confidence)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id::text, created_at
            """,
            (str(env_id), run_id, title, question, memo_md, Jsonb(_json_safe(evidence)), confidence),
        )
        row = cur.fetchone() or {}
    return {"id": row.get("id"), "created_at": row.get("created_at")}


def generate_desk_memo(
    env_id: str | UUID,
    question: str,
    analytics_payload: dict[str, Any],
    *,
    run_id: str | None = None,
) -> dict[str, Any]:
    confidence = "medium" if analytics_payload.get("available") else "low"
    source = analytics_payload.get("source") or analytics_payload.get("freshness") or {}
    findings = _summarize_result_for_memo(analytics_payload)
    warnings = analytics_payload.get("warnings") or []
    if run_id is None:
        run_id = record_analytics_run(
            env_id,
            run_type="memo",
            question=question,
            params={"source_run_id": analytics_payload.get("run_id")},
            result=analytics_payload,
            freshness=source,
            warnings=warnings,
        )
    title = "Trading desk memo"
    memo_md = "\n".join(
        [
            f"# {title}",
            "",
            f"**Question asked:** {question}",
            "",
            "## Data used",
            f"- Source: {source.get('series_source', 'Unavailable')}",
            f"- Latest observation: {source.get('latest_observation_date', 'Unavailable')}",
            f"- Date range: {json.dumps(analytics_payload.get('date_range', 'Unavailable'))}",
            "",
            "## Methodology",
            f"- Deterministic tool: {analytics_payload.get('method') or analytics_payload.get('engine_label') or analytics_payload.get('run_type') or 'trading analytics service'}",
            "- AI synthesis is optional; numeric analytics come from backend tools.",
            "",
            "## Findings",
            *[f"- {line}" for line in findings],
            "",
            "## Caveats",
            *[f"- {line}" for line in (warnings or analytics_payload.get('caveats') or ['Demo fixture data; replace with governed market feeds for production use.'])],
            "",
            "## Confidence and freshness",
            f"- Confidence: {confidence}",
            f"- Freshness: {source.get('staleness_status', 'Unavailable')}",
            f"- Saved: {_now_iso()}",
        ]
    )
    persisted = persist_memo(
        env_id,
        run_id=run_id,
        title=title,
        question=question,
        memo_md=memo_md,
        evidence=analytics_payload,
        confidence=confidence,
    )
    return {
        "available": True,
        "id": persisted.get("id"),
        "run_id": run_id,
        "title": title,
        "question": question,
        "memo_md": memo_md,
        "evidence": analytics_payload,
        "confidence": confidence,
        "created_at": _json_safe(persisted.get("created_at")),
        "warnings": warnings,
    }


def list_memos(env_id: str | UUID, limit: int = 10) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id::text, run_id::text, title, question, memo_md, evidence, confidence, created_at
            FROM public.trading_memos
            WHERE env_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (str(env_id), max(1, min(limit, 50))),
        )
        rows = cur.fetchall()
    return {"available": True, "env_id": str(env_id), "memos": _json_safe(rows), "warnings": []}


def _parse_symbols_from_question(question: str) -> list[str]:
    upper = question.upper()
    symbols: list[str] = []
    alias_patterns = [
        ("HH_GAS", r"\b(NATURAL GAS|HENRY HUB|HH_GAS|GAS)\b"),
        ("WTI", r"\b(WTI|CRUDE)\b"),
        ("BRENT", r"\b(BRENT)\b"),
        ("DXY_PROXY", r"\b(DXY|DOLLAR)\b"),
        ("UST10Y", r"\b(10Y|RATES|RATE|YIELD)\b"),
        ("VIX", r"\b(VIX|VOLATILITY)\b"),
        ("CRUDE_INVENTORY_PROXY", r"\b(INVENTORY|INVENTORIES)\b"),
        ("GAS_STORAGE_PROXY", r"\b(STORAGE)\b"),
    ]
    for symbol, pattern in alias_patterns:
        if re.search(pattern, upper) and symbol not in symbols:
            symbols.append(symbol)
    return symbols


def _parse_int(question: str, default: int, pattern: str) -> int:
    match = re.search(pattern, question, re.IGNORECASE)
    if not match:
        return default
    try:
        return int(match.group(1))
    except ValueError:
        return default


def ask_trading_copilot(env_id: str | UUID, question: str, analytics_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    q = question.strip()
    q_lower = q.lower()
    ai_available = bool(os.getenv("OPENAI_API_KEY") or os.getenv("AI_GATEWAY_ENABLED") == "true")
    symbols = _parse_symbols_from_question(q)

    if "memo" in q_lower or "brief" in q_lower or "summarize for trader" in q_lower:
        payload = analytics_payload
        if not payload:
            payload = run_factor_regression(
                env_id,
                "WTI",
                ["DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"],
                persist=True,
                question="Default WTI factor regression for memo.",
            )
        memo = generate_desk_memo(env_id, q, payload, run_id=payload.get("run_id"))
        return {
            "tool_used": "memo",
            "available": True,
            "result": memo,
            "warnings": memo.get("warnings", []),
            "source": payload.get("source") or {},
            "ai_available": ai_available,
            "unsupported_capabilities": [],
        }

    if "seasonality" in q_lower:
        symbol = "HH_GAS" if ("gas" in q_lower or "henry" in q_lower) else (symbols[0] if symbols else "WTI")
        years = _parse_int(q, 5, r"(\d+)\s*[- ]?year")
        result = compute_seasonality(env_id, symbol, years, persist=True, question=q)
        return {"tool_used": "seasonality", "available": bool(result.get("available")), "result": result, "warnings": result.get("warnings", []), "source": result.get("source") or {}, "ai_available": ai_available, "unsupported_capabilities": []}

    if "correlation" in q_lower or "rolling" in q_lower:
        window = _parse_int(q, 60, r"(\d+)\s*[- ]?day")
        first = symbols[0] if symbols else "WTI"
        second = symbols[1] if len(symbols) > 1 else "BRENT"
        result = compute_rolling_correlation(env_id, first, second, window, persist=True, question=q)
        return {"tool_used": "rolling_correlation", "available": bool(result.get("available")), "result": result, "warnings": result.get("warnings", []), "source": result.get("source") or {}, "ai_available": ai_available, "unsupported_capabilities": []}

    if "regression" in q_lower or "factor" in q_lower or "against" in q_lower or "explain" in q_lower:
        dependent = "WTI" if ("wti" in q_lower or "crude" in q_lower) else (symbols[0] if symbols else "WTI")
        factors = [s for s in symbols if s != dependent]
        if not factors:
            factors = ["DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"]
        result = run_factor_regression(env_id, dependent, factors, persist=True, question=q)
        return {"tool_used": "regression", "available": bool(result.get("available")), "result": result, "warnings": result.get("warnings", []), "source": result.get("source") or {}, "ai_available": ai_available, "unsupported_capabilities": []}

    if "scenario" in q_lower or "shock" in q_lower or "what if" in q_lower:
        result = run_scenario_model(env_id, symbols[0] if symbols else "WTI", {}, persist=True, question=q)
        return {"tool_used": "scenario", "available": bool(result.get("available")), "result": result, "warnings": result.get("warnings", []), "source": result.get("source") or {}, "ai_available": ai_available, "unsupported_capabilities": []}

    if "analog" in q_lower or "similar" in q_lower or "history" in q_lower or "rhyme" in q_lower:
        result = find_historical_analogs(env_id, symbols[0] if symbols else "WTI", 60, 5, persist=True, question=q)
        return {"tool_used": "analogs", "available": bool(result.get("available")), "result": result, "warnings": result.get("warnings", []), "source": result.get("source") or {}, "ai_available": ai_available, "unsupported_capabilities": []}

    result = {
        "available": False,
        "unavailable_reason": "Unsupported copilot prompt. Choose one of the supported trading analytics capabilities.",
        "supported_capabilities": SUPPORTED_CAPABILITIES,
    }
    record_analytics_run(
        env_id,
        run_type="unsupported",
        question=q,
        params={},
        result=result,
        freshness={},
        warnings=[result["unavailable_reason"]],
    )
    return {
        "tool_used": "unsupported",
        "available": False,
        "result": result,
        "warnings": [result["unavailable_reason"]],
        "source": {},
        "ai_available": ai_available,
        "unsupported_capabilities": SUPPORTED_CAPABILITIES,
    }
