"""Seed deterministic data for the Trading Analytics Copilot demo.

The generated rows are realistic-shaped demo fixtures, not live market data.
Safe to re-run: market and feature rows upsert on environment/symbol/date keys,
and existing analytics runs or memos are preserved.
"""

from __future__ import annotations

import argparse
import hashlib
import math
import pathlib
import random
import sys
from datetime import date, timedelta
from typing import Any

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db import get_cursor  # noqa: E402
from app.services.trading_analytics import EXPECTED_SERIES  # noqa: E402


SOURCE = "demo_fixture:v1"
DEFAULT_ENV_SLUG = "trading"
DEFAULT_SEED = 42


def _business_days(start: date, end: date) -> list[date]:
    days: list[date] = []
    current = start
    while current <= end:
        if current.weekday() < 5:
            days.append(current)
        current += timedelta(days=1)
    return days


def _last_business_day(as_of: date) -> date:
    current = as_of
    while current.weekday() >= 5:
        current -= timedelta(days=1)
    return current


def _value_floor(value: float, floor: float) -> float:
    return max(floor, value)


def build_demo_market_rows(as_of: date | None = None, years: int = 6, seed: int = DEFAULT_SEED) -> list[dict[str, Any]]:
    """Build deterministic fixture rows for expected trading demo symbols."""
    end = _last_business_day(as_of or date.today())
    start = end - timedelta(days=int(years * 365.25))
    days = _business_days(start, end)
    rng = random.Random(seed)
    rows: list[dict[str, Any]] = []

    wti = 72.0
    brent_spread = 4.2
    gas = 3.15
    dxy = 103.0
    ust = 3.65
    vix = 18.0
    crude_inventory = 425.0
    gas_storage = 3150.0
    rig_count = 610.0

    for idx, obs_date in enumerate(days):
        year_phase = 2 * math.pi * obs_date.timetuple().tm_yday / 365.25
        long_cycle = math.sin(idx / 180.0)
        short_cycle = math.sin(idx / 23.0)

        wti_return = (
            0.00018
            + 0.0016 * math.sin(year_phase - 0.8)
            - 0.0009 * math.sin(idx / 47.0)
            + rng.gauss(0, 0.0105)
        )
        wti = _value_floor(wti * math.exp(wti_return), 34.0)
        brent_spread = _value_floor(4.0 + 1.1 * math.sin(idx / 95.0) + 0.4 * short_cycle + rng.gauss(0, 0.18), -2.0)
        brent = _value_floor(wti + brent_spread, 36.0)

        gas_return = (
            0.00005
            + 0.0038 * math.sin(year_phase + 0.35)
            + 0.0012 * long_cycle
            + rng.gauss(0, 0.022)
        )
        gas = _value_floor(gas * math.exp(gas_return), 1.35)

        dxy = _value_floor(dxy + 0.018 * math.sin(idx / 68.0) - 0.012 * wti_return * 100 + rng.gauss(0, 0.18), 82.0)
        ust = _value_floor(ust + 0.004 * math.sin(idx / 75.0) + rng.gauss(0, 0.018), 0.6)
        vix = _value_floor(17.5 + 2.8 * math.sin(idx / 41.0) - 70 * wti_return + rng.gauss(0, 1.1), 9.0)
        crude_inventory = _value_floor(425.0 + 18.0 * math.sin(year_phase + 1.8) - 0.09 * (wti - 72.0) + rng.gauss(0, 2.8), 320.0)
        gas_storage = _value_floor(3100.0 + 520.0 * math.sin(year_phase - 1.3) - 20.0 * (gas - 3.0) + rng.gauss(0, 38.0), 1200.0)
        rig_count = _value_floor(rig_count + 0.05 * (wti - 70.0) - 0.12 * (rig_count - 610.0) + rng.gauss(0, 3.5), 320.0)

        values = {
            "WTI": wti,
            "BRENT": brent,
            "HH_GAS": gas,
            "BRENT_WTI_SPREAD": brent - wti,
            "DXY_PROXY": dxy,
            "UST10Y": ust,
            "VIX": vix,
            "CRUDE_INVENTORY_PROXY": crude_inventory,
            "GAS_STORAGE_PROXY": gas_storage,
            "RIG_COUNT_PROXY": rig_count,
        }
        for symbol, value in values.items():
            meta = EXPECTED_SERIES[symbol]
            rows.append(
                {
                    "symbol": symbol,
                    "asset_class": meta["asset_class"],
                    "source": SOURCE,
                    "observation_date": obs_date,
                    "value": round(value, 6),
                    "unit": meta["unit"],
                    "series_type": meta["series_type"],
                }
            )
    return rows


def build_demo_feature_rows(market_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in market_rows:
        grouped.setdefault(row["symbol"], []).append(row)

    features: list[dict[str, Any]] = []
    for symbol, rows in grouped.items():
        rows = sorted(rows, key=lambda r: r["observation_date"])
        values = [float(r["value"]) for r in rows]
        for idx, row in enumerate(rows):
            if idx > 0 and values[idx - 1] > 0 and values[idx] > 0:
                features.append(
                    {
                        "symbol": symbol,
                        "feature_name": "log_return_1d",
                        "observation_date": row["observation_date"],
                        "value": round(math.log(values[idx] / values[idx - 1]), 10),
                        "method": "deterministic_demo_fixture_log_return",
                    }
                )
            if idx >= 20:
                window = values[max(0, idx - 252):idx + 1]
                mean = sum(window) / len(window)
                variance = sum((v - mean) ** 2 for v in window) / len(window)
                std = math.sqrt(variance) or 1.0
                features.append(
                    {
                        "symbol": symbol,
                        "feature_name": "z_score_252d",
                        "observation_date": row["observation_date"],
                        "value": round((values[idx] - mean) / std, 8),
                        "method": "deterministic_demo_fixture_z_score",
                    }
                )
            if idx >= 30:
                returns: list[float] = []
                for j in range(idx - 29, idx + 1):
                    if values[j - 1] > 0 and values[j] > 0:
                        returns.append(math.log(values[j] / values[j - 1]))
                if returns:
                    mean_r = sum(returns) / len(returns)
                    variance_r = sum((r - mean_r) ** 2 for r in returns) / len(returns)
                    features.append(
                        {
                            "symbol": symbol,
                            "feature_name": "rolling_vol_30d",
                            "observation_date": row["observation_date"],
                            "value": round(math.sqrt(variance_r) * math.sqrt(252), 8),
                            "method": "deterministic_demo_fixture_volatility",
                        }
                    )
    for feature in features:
        digest = hashlib.sha256(f"{SOURCE}:{feature['symbol']}:{feature['feature_name']}:{feature['observation_date']}".encode()).hexdigest()[:16]
        feature["source_hash"] = digest
    return features


def resolve_env_id(env_id: str | None, env_slug: str, create_env: bool) -> str:
    if env_id:
        print(f"Using provided env_id={env_id}")
        return env_id
    with get_cursor() as cur:
        cur.execute("SELECT env_id::text FROM app.environments WHERE slug = %s LIMIT 1", (env_slug,))
        row = cur.fetchone()
        if row and row.get("env_id"):
            print(f"Resolved env slug '{env_slug}' to env_id={row['env_id']}")
            return row["env_id"]
        if not create_env:
            raise RuntimeError(
                f"Environment slug '{env_slug}' was not found. Re-run with --create-env to provision the canonical Trading Platform environment."
            )
        cur.execute(
            """
            INSERT INTO app.businesses (name, slug)
            VALUES ('Trading Platform', 'trading-platform')
            ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
            RETURNING business_id::text
            """
        )
        business = cur.fetchone() or {}
        cur.execute(
            """
            INSERT INTO app.environments
              (client_name, industry, industry_type, workspace_template_key, schema_name, notes, business_id, slug, auth_mode)
            VALUES
              ('Trading Platform', 'trading_platform', 'trading_platform', 'trading_platform',
               'env_trading_platform', 'Canonical trading environment for the Trading Analytics Copilot demo.',
               %s::uuid, %s, 'private')
            ON CONFLICT (slug) DO UPDATE
              SET client_name = EXCLUDED.client_name,
                  industry = EXCLUDED.industry,
                  industry_type = EXCLUDED.industry_type,
                  workspace_template_key = EXCLUDED.workspace_template_key,
                  business_id = EXCLUDED.business_id,
                  updated_at = now()
            RETURNING env_id::text
            """,
            (business["business_id"], env_slug),
        )
        created = cur.fetchone() or {}
        if not created.get("env_id"):
            raise RuntimeError("Failed to create Trading Platform environment.")
        print(f"Created/resolved env slug '{env_slug}' to env_id={created['env_id']}")
        return created["env_id"]


def upsert_market_rows(env_id: str, rows: list[dict[str, Any]]) -> int:
    with get_cursor() as cur:
        cur.executemany(
            """
            INSERT INTO public.trading_market_series
              (env_id, symbol, asset_class, source, observation_date, value, unit, series_type)
            VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, symbol, observation_date, series_type) DO UPDATE
              SET asset_class = EXCLUDED.asset_class,
                  source = EXCLUDED.source,
                  value = EXCLUDED.value,
                  unit = EXCLUDED.unit
            """,
            [
                (
                    env_id,
                    row["symbol"],
                    row["asset_class"],
                    row["source"],
                    row["observation_date"],
                    row["value"],
                    row["unit"],
                    row["series_type"],
                )
                for row in rows
            ],
        )
    return len(rows)


def upsert_feature_rows(env_id: str, rows: list[dict[str, Any]]) -> int:
    with get_cursor() as cur:
        cur.executemany(
            """
            INSERT INTO public.trading_feature_series
              (env_id, symbol, feature_name, observation_date, value, method, source_hash)
            VALUES (%s::uuid, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, symbol, feature_name, observation_date) DO UPDATE
              SET value = EXCLUDED.value,
                  method = EXCLUDED.method,
                  source_hash = EXCLUDED.source_hash
            """,
            [
                (
                    env_id,
                    row["symbol"],
                    row["feature_name"],
                    row["observation_date"],
                    row["value"],
                    row["method"],
                    row.get("source_hash"),
                )
                for row in rows
            ],
        )
    return len(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Trading Analytics Copilot demo data.")
    parser.add_argument("--env-id", default=None)
    parser.add_argument("--env-slug", default=DEFAULT_ENV_SLUG)
    parser.add_argument("--create-env", action="store_true", help="Provision the canonical Trading Platform environment if env-slug is missing.")
    parser.add_argument("--as-of", default=None, help="Inclusive fixture end date, YYYY-MM-DD. Defaults to today.")
    parser.add_argument("--years", type=int, default=6)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    as_of = date.fromisoformat(args.as_of) if args.as_of else None
    env_id = resolve_env_id(args.env_id, args.env_slug, args.create_env)
    market_rows = build_demo_market_rows(as_of=as_of, years=args.years, seed=args.seed)
    feature_rows = build_demo_feature_rows(market_rows)
    market_count = upsert_market_rows(env_id, market_rows)
    feature_count = upsert_feature_rows(env_id, feature_rows)
    symbols = sorted({row["symbol"] for row in market_rows})
    print(f"Seeded Trading Analytics Copilot demo env_id={env_id}")
    print(f"source={SOURCE}")
    print(f"market_rows={market_count} feature_rows={feature_count} symbols={','.join(symbols)}")
    print(f"date_range={market_rows[0]['observation_date']}..{market_rows[-1]['observation_date']}")
    print("Existing analytics runs and memos were preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
