"""Trading demo medallion pipeline.

Runs locally in fixture/CSV mode and can be adapted directly to Databricks.

Local:
    python docs/trading_demo/databricks_medallion_pipeline.py --mode local --output-dir .tmp/trading_demo

Databricks:
    - Upload this file as a notebook/script.
    - Set --mode spark.
    - Replace fixture generation with Auto Loader, volumes, or source connectors.
    - Enable Delta writes to Unity Catalog tables.
"""

from __future__ import annotations

import argparse
import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path
from typing import Any


SYMBOLS = {
    "WTI": ("commodity", "USD/bbl", "price"),
    "BRENT": ("commodity", "USD/bbl", "price"),
    "HH_GAS": ("commodity", "USD/MMBtu", "price"),
    "BRENT_WTI_SPREAD": ("commodity", "USD/bbl", "spread"),
    "DXY_PROXY": ("macro", "index", "macro"),
    "UST10Y": ("rates", "percent", "macro"),
    "VIX": ("volatility", "index", "macro"),
    "CRUDE_INVENTORY_PROXY": ("fundamental", "million bbl", "fundamental"),
    "GAS_STORAGE_PROXY": ("fundamental", "bcf", "fundamental"),
    "RIG_COUNT_PROXY": ("fundamental", "count", "fundamental"),
}


def business_days(start: date, end: date) -> list[date]:
    current = start
    days: list[date] = []
    while current <= end:
        if current.weekday() < 5:
            days.append(current)
        current += timedelta(days=1)
    return days


def generate_fixture_rows(as_of: date, years: int = 6, seed: int = 42) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    start = as_of - timedelta(days=int(365.25 * years))
    rows: list[dict[str, Any]] = []
    wti, gas, dxy, ust, rig = 72.0, 3.15, 103.0, 3.65, 610.0
    for idx, obs_date in enumerate(business_days(start, as_of)):
        phase = 2 * math.pi * obs_date.timetuple().tm_yday / 365.25
        wti_return = 0.00018 + 0.0016 * math.sin(phase - 0.8) + rng.gauss(0, 0.0105)
        wti = max(34.0, wti * math.exp(wti_return))
        brent = max(36.0, wti + 4.0 + 1.1 * math.sin(idx / 95.0) + rng.gauss(0, 0.18))
        gas = max(1.35, gas * math.exp(0.00005 + 0.0038 * math.sin(phase + 0.35) + rng.gauss(0, 0.022)))
        dxy = max(82.0, dxy + 0.018 * math.sin(idx / 68.0) - 0.012 * wti_return * 100 + rng.gauss(0, 0.18))
        ust = max(0.6, ust + 0.004 * math.sin(idx / 75.0) + rng.gauss(0, 0.018))
        vix = max(9.0, 17.5 + 2.8 * math.sin(idx / 41.0) - 70 * wti_return + rng.gauss(0, 1.1))
        crude_inventory = max(320.0, 425.0 + 18.0 * math.sin(phase + 1.8) - 0.09 * (wti - 72.0) + rng.gauss(0, 2.8))
        gas_storage = max(1200.0, 3100.0 + 520.0 * math.sin(phase - 1.3) - 20.0 * (gas - 3.0) + rng.gauss(0, 38.0))
        rig = max(320.0, rig + 0.05 * (wti - 70.0) - 0.12 * (rig - 610.0) + rng.gauss(0, 3.5))
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
            "RIG_COUNT_PROXY": rig,
        }
        for symbol, value in values.items():
            asset_class, unit, series_type = SYMBOLS[symbol]
            rows.append(
                {
                    "symbol": symbol,
                    "asset_class": asset_class,
                    "source": "demo_fixture:v1",
                    "observation_date": obs_date.isoformat(),
                    "value": round(value, 6),
                    "unit": unit,
                    "series_type": series_type,
                }
            )
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def local_medallion(output_dir: Path, as_of: date) -> None:
    bronze = generate_fixture_rows(as_of)
    write_csv(output_dir / "bronze_market_prices.csv", bronze)

    # Silver keeps one normalized row per symbol/date. A real job would also
    # join calendars, map vendor identifiers, and apply quality constraints.
    silver = sorted(bronze, key=lambda row: (row["observation_date"], row["symbol"]))
    write_csv(output_dir / "silver_normalized_series.csv", silver)

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in silver:
        grouped.setdefault(row["symbol"], []).append(row)
    gold: list[dict[str, Any]] = []
    for symbol, rows in grouped.items():
        values = [float(row["value"]) for row in rows]
        for idx, row in enumerate(rows):
            if idx > 0:
                gold.append(
                    {
                        "symbol": symbol,
                        "observation_date": row["observation_date"],
                        "feature_name": "log_return_1d",
                        "value": round(math.log(values[idx] / values[idx - 1]), 10),
                    }
                )
            if idx >= 20:
                window = values[max(0, idx - 252):idx + 1]
                mean = sum(window) / len(window)
                std = math.sqrt(sum((value - mean) ** 2 for value in window) / len(window)) or 1.0
                gold.append(
                    {
                        "symbol": symbol,
                        "observation_date": row["observation_date"],
                        "feature_name": "z_score_252d",
                        "value": round((values[idx] - mean) / std, 8),
                    }
                )
    write_csv(output_dir / "gold_trading_features.csv", gold)
    print(f"wrote {len(bronze)} bronze rows, {len(silver)} silver rows, {len(gold)} gold feature rows to {output_dir}")


def spark_medallion(catalog: str, schema: str, source_path: str | None, as_of: date) -> None:
    try:
        from pyspark.sql import SparkSession
        from pyspark.sql import functions as F
        from pyspark.sql.window import Window
    except ImportError as exc:
        raise RuntimeError("pyspark is required for --mode spark") from exc

    spark = SparkSession.builder.appName("trading-demo-medallion").getOrCreate()
    spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")

    if source_path:
        bronze_df = spark.read.option("header", True).csv(source_path)
    else:
        bronze_df = spark.createDataFrame(generate_fixture_rows(as_of))

    bronze_table = f"{catalog}.{schema}.bronze_market_prices"
    silver_table = f"{catalog}.{schema}.silver_normalized_series"
    gold_table = f"{catalog}.{schema}.semantic_trading_features"

    (
        bronze_df
        .withColumn("observation_date", F.to_date("observation_date"))
        .withColumn("value", F.col("value").cast("double"))
        .write
        .format("delta")
        .mode("overwrite")
        .partitionBy("symbol")
        .saveAsTable(bronze_table)
    )

    silver_df = (
        spark.table(bronze_table)
        .select("symbol", "asset_class", "source", "observation_date", "value", "unit", "series_type")
        .where(F.col("value").isNotNull())
    )
    silver_df.write.format("delta").mode("overwrite").partitionBy("symbol").saveAsTable(silver_table)

    w = Window.partitionBy("symbol").orderBy("observation_date")
    w252 = w.rowsBetween(-251, 0)
    features_df = (
        silver_df
        .withColumn("prior_value", F.lag("value").over(w))
        .withColumn("log_return_1d", F.log(F.col("value") / F.col("prior_value")))
        .withColumn("mean_252d", F.avg("value").over(w252))
        .withColumn("std_252d", F.stddev_pop("value").over(w252))
        .selectExpr(
            "symbol",
            "observation_date",
            "stack(2, 'log_return_1d', log_return_1d, 'z_score_252d', (value - mean_252d) / nullif(std_252d, 0)) as (feature_name, value)"
        )
        .where(F.col("value").isNotNull())
    )
    features_df.write.format("delta").mode("overwrite").partitionBy("symbol").saveAsTable(gold_table)

    # Databricks follow-ups:
    # spark.sql(f"OPTIMIZE {silver_table} ZORDER BY (observation_date)")
    # spark.sql(f"ALTER TABLE {gold_table} SET TBLPROPERTIES ('delta.enableChangeDataFeed' = true)")
    # import mlflow; mlflow.set_experiment('/Shared/trading-demo')
    print(f"wrote Delta tables: {bronze_table}, {silver_table}, {gold_table}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Trading demo medallion pipeline")
    parser.add_argument("--mode", choices=["local", "spark"], default="local")
    parser.add_argument("--output-dir", default=".tmp/trading_demo")
    parser.add_argument("--as-of", default=date.today().isoformat())
    parser.add_argument("--catalog", default="trading_demo")
    parser.add_argument("--schema", default="semantic")
    parser.add_argument("--source-path", default=None)
    args = parser.parse_args()

    as_of = date.fromisoformat(args.as_of)
    if args.mode == "local":
        local_medallion(Path(args.output_dir), as_of)
    else:
        spark_medallion(args.catalog, args.schema, args.source_path, as_of)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
