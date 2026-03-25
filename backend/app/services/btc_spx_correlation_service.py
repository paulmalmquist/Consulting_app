"""BTC-SPX 30-Day Rolling Correlation Service.

Computes and persists the 30-day rolling Pearson correlation between
BTC-USD and ^GSPC daily log returns.

Data sources:
- fact_market_timeseries (existing table, additive SELECT reads only)
- public.btc_spx_correlation (new table, additive writes only)

Algorithm:
1. Fetch last 35 trading days of BTC-USD and ^GSPC close prices
2. Compute daily log returns: ln(close_t / close_{t-1})
3. Align return series on common dates
4. Compute 30-day Pearson r via numpy.corrcoef on the 30 most recent aligned pairs
5. Detect zero-crossing vs. prior row in btc_spx_correlation
6. Upsert result for today's date

Cross-vertical hooks (additive context only, no code changes to other services):
- Credit: recoupling events (r > 0) surface advisory for crypto-collateral haircuts
- Regime classifier: latest correlation feeds crypto signal breakdown
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from typing import Optional
from uuid import UUID

import numpy as np

from app.db import get_cursor


# ── Data class ────────────────────────────────────────────────────────────────


@dataclass
class BtcSpxCorrelationRow:
    correlation_id: str
    calculated_date: str          # ISO date string
    correlation_30d: float        # Pearson r, range [-1, 1]
    btc_return_30d: Optional[float]
    spx_return_30d: Optional[float]
    zero_crossing: bool
    crossing_direction: Optional[str]   # 'decoupling' | 'recoupling' | None
    data_points_used: int
    metadata: dict


# ── Regime signal text ────────────────────────────────────────────────────────


def _regime_signal_text(correlation_30d: float) -> str:
    """Return a human-readable regime signal string for the current correlation."""
    if correlation_30d > 0.15:
        return "Recoupling — BTC re-correlating with equities (risk-off confirming)"
    elif correlation_30d < -0.15:
        return "Decoupled — BTC diverging from equities (uncorrelated zone)"
    else:
        return "Neutral — BTC correlation near zero (transitional signal)"


def _crossing_direction(prior_r: Optional[float], current_r: float) -> tuple[bool, Optional[str]]:
    """Detect zero-crossing vs. prior row.

    Returns (zero_crossing: bool, direction: str | None)
      direction = 'decoupling' if positive → negative
      direction = 'recoupling' if negative → positive
    """
    if prior_r is None:
        return False, None
    if prior_r >= 0 and current_r < 0:
        return True, "decoupling"
    if prior_r < 0 and current_r >= 0:
        return True, "recoupling"
    return False, None


# ── Core computation ─────────────────────────────────────────────────────────


def compute_btc_spx_correlation(
    tenant_id: UUID | None = None,
    as_of_date: date | None = None,
) -> BtcSpxCorrelationRow:
    """Compute and upsert today's 30-day rolling BTC-SPX correlation.

    Args:
        tenant_id: Optional tenant filter (None = global/demo).
        as_of_date: Calculation date override (defaults to today).

    Returns:
        BtcSpxCorrelationRow with the computed and persisted result.
    """
    target_date = as_of_date or date.today()

    with get_cursor() as cur:
        # ── Fetch last 35 days of BTC-USD and ^GSPC closes ────────────────────
        # We fetch 35 to ensure we have 30 data points after log-return differencing
        cur.execute(
            """
            SELECT ticker, as_of_date, value AS close_price
            FROM fact_market_timeseries
            WHERE ticker IN ('BTC-USD', '^GSPC')
              AND metric = 'close'
              AND as_of_date <= %s
            ORDER BY ticker, as_of_date DESC
            LIMIT 140
            """,
            (target_date.isoformat(),),
        )
        rows = cur.fetchall()

    # ── Organise into per-ticker series ──────────────────────────────────────
    btc_prices: dict[date, float] = {}
    spx_prices: dict[date, float] = {}

    for r in rows:
        ticker = r["ticker"]
        d = r["as_of_date"] if isinstance(r["as_of_date"], date) else date.fromisoformat(str(r["as_of_date"]))
        try:
            price = float(r["close_price"])
        except (TypeError, ValueError):
            continue
        if ticker == "BTC-USD":
            btc_prices[d] = price
        elif ticker == "^GSPC":
            spx_prices[d] = price

    # Keep only the 35 most recent dates for each
    btc_sorted = sorted(btc_prices.items(), key=lambda x: x[0], reverse=True)[:35]
    spx_sorted = sorted(spx_prices.items(), key=lambda x: x[0], reverse=True)[:35]

    # ── Compute log returns ───────────────────────────────────────────────────
    def log_returns(sorted_pairs: list[tuple[date, float]]) -> dict[date, float]:
        """Compute daily log returns from sorted (desc) price pairs."""
        returns: dict[date, float] = {}
        # sorted desc: index 0 = latest
        for i in range(len(sorted_pairs) - 1):
            d_curr, p_curr = sorted_pairs[i]
            _, p_prev = sorted_pairs[i + 1]
            if p_prev > 0 and p_curr > 0:
                try:
                    returns[d_curr] = math.log(p_curr / p_prev)
                except (ValueError, ZeroDivisionError):
                    pass
        return returns

    btc_returns = log_returns(btc_sorted)
    spx_returns = log_returns(spx_sorted)

    # ── Align on common dates, take most recent 30 ───────────────────────────
    common_dates = sorted(
        set(btc_returns.keys()) & set(spx_returns.keys()),
        reverse=True,
    )[:30]

    data_points_used = len(common_dates)

    if data_points_used < 2:
        # Insufficient data — return a stub row
        correlation_30d = 0.0
        btc_cumret = None
        spx_cumret = None
    else:
        btc_arr = np.array([btc_returns[d] for d in common_dates])
        spx_arr = np.array([spx_returns[d] for d in common_dates])

        corr_matrix = np.corrcoef(btc_arr, spx_arr)
        correlation_30d = float(round(corr_matrix[0, 1], 6))

        # 30-day cumulative log return = sum of daily log returns
        btc_cumret = float(round(float(np.sum(btc_arr)), 6))
        spx_cumret = float(round(float(np.sum(spx_arr)), 6))

    # ── Fetch prior row for zero-crossing detection ───────────────────────────
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT correlation_30d
            FROM public.btc_spx_correlation
            WHERE (tenant_id = %s OR tenant_id IS NULL)
              AND calculated_date < %s
            ORDER BY calculated_date DESC
            LIMIT 1
            """,
            (str(tenant_id) if tenant_id else None, target_date.isoformat()),
        )
        prior_row = cur.fetchone()

    prior_r = float(prior_row["correlation_30d"]) if prior_row else None
    zero_crossing, crossing_direction = _crossing_direction(prior_r, correlation_30d)

    metadata: dict = {
        "regime_signal": _regime_signal_text(correlation_30d),
        "prior_correlation": prior_r,
        "common_dates_count": data_points_used,
    }

    # ── Upsert into btc_spx_correlation ──────────────────────────────────────
    import json as _json

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.btc_spx_correlation
              (tenant_id, calculated_date, correlation_30d, btc_return_30d,
               spx_return_30d, zero_crossing, crossing_direction,
               data_points_used, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (tenant_id, calculated_date)
            DO UPDATE SET
              correlation_30d  = EXCLUDED.correlation_30d,
              btc_return_30d   = EXCLUDED.btc_return_30d,
              spx_return_30d   = EXCLUDED.spx_return_30d,
              zero_crossing    = EXCLUDED.zero_crossing,
              crossing_direction = EXCLUDED.crossing_direction,
              data_points_used = EXCLUDED.data_points_used,
              metadata         = EXCLUDED.metadata
            RETURNING correlation_id
            """,
            (
                str(tenant_id) if tenant_id else None,
                target_date.isoformat(),
                correlation_30d,
                btc_cumret,
                spx_cumret,
                zero_crossing,
                crossing_direction,
                data_points_used,
                _json.dumps(metadata),
            ),
        )
        inserted = cur.fetchone()

    return BtcSpxCorrelationRow(
        correlation_id=str(inserted["correlation_id"]),
        calculated_date=target_date.isoformat(),
        correlation_30d=correlation_30d,
        btc_return_30d=btc_cumret,
        spx_return_30d=spx_cumret,
        zero_crossing=zero_crossing,
        crossing_direction=crossing_direction,
        data_points_used=data_points_used,
        metadata=metadata,
    )


# ── Read functions ────────────────────────────────────────────────────────────


def get_latest_correlation(tenant_id: UUID | None = None) -> BtcSpxCorrelationRow | None:
    """Return the most recent row from btc_spx_correlation."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT correlation_id, calculated_date, correlation_30d,
                   btc_return_30d, spx_return_30d, zero_crossing,
                   crossing_direction, data_points_used, metadata
            FROM public.btc_spx_correlation
            WHERE (tenant_id = %s OR tenant_id IS NULL)
            ORDER BY calculated_date DESC
            LIMIT 1
            """,
            (str(tenant_id) if tenant_id else None,),
        )
        row = cur.fetchone()

    if not row:
        return None
    return _row_to_dataclass(row)


def get_correlation_history(
    tenant_id: UUID | None = None,
    days: int = 180,
) -> list[BtcSpxCorrelationRow]:
    """Return up to `days` rows from btc_spx_correlation, newest first."""
    days = min(max(days, 1), 365)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT correlation_id, calculated_date, correlation_30d,
                   btc_return_30d, spx_return_30d, zero_crossing,
                   crossing_direction, data_points_used, metadata
            FROM public.btc_spx_correlation
            WHERE (tenant_id = %s OR tenant_id IS NULL)
              AND calculated_date >= CURRENT_DATE - (%s || ' days')::interval
            ORDER BY calculated_date DESC
            LIMIT 365
            """,
            (str(tenant_id) if tenant_id else None, days),
        )
        rows = cur.fetchall()

    return [_row_to_dataclass(r) for r in rows]


def _row_to_dataclass(row: dict) -> BtcSpxCorrelationRow:
    """Convert a DB result row to a BtcSpxCorrelationRow dataclass."""
    calculated_date = row["calculated_date"]
    if hasattr(calculated_date, "isoformat"):
        calculated_date = calculated_date.isoformat()
    return BtcSpxCorrelationRow(
        correlation_id=str(row["correlation_id"]),
        calculated_date=str(calculated_date),
        correlation_30d=float(row["correlation_30d"]),
        btc_return_30d=float(row["btc_return_30d"]) if row["btc_return_30d"] is not None else None,
        spx_return_30d=float(row["spx_return_30d"]) if row["spx_return_30d"] is not None else None,
        zero_crossing=bool(row["zero_crossing"]),
        crossing_direction=row.get("crossing_direction"),
        data_points_used=int(row["data_points_used"]),
        metadata=dict(row["metadata"]) if row.get("metadata") else {},
    )
