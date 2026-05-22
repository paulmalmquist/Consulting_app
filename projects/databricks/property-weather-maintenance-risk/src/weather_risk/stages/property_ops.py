"""Stage 02 — generate or ingest property operations data.

Local path: delegates to the unit-tested `synthetic_ops.generate_synthetic_property_ops`.
Spark path: a self-contained generator that writes `synthetic_*` tables. The
local generator stays the canonical, unit-tested source contract; the Spark
generator is intentionally kept structurally aligned with it.
"""
from __future__ import annotations

import random
from datetime import date, timedelta
from typing import Any

from ..config import WeatherRiskConfig
from ..synthetic_ops import generate_synthetic_property_ops

_SPARK_MARKETS = [
    ("Atlanta", "GA", "13121"),
    ("Dallas", "TX", "48113"),
    ("Tampa", "FL", "12057"),
    ("Phoenix", "AZ", "04013"),
    ("Charlotte", "NC", "37119"),
]


def run(config: WeatherRiskConfig) -> dict[str, list[dict[str, Any]]]:
    """Local generate: produce the deterministic synthetic property ops dataset."""
    return generate_synthetic_property_ops(
        property_count=config.synthetic_property_count,
        unit_count=config.synthetic_unit_count,
        random_seed=config.random_seed,
    )


def run_spark(spark, dbutils) -> dict[str, Any]:  # pragma: no cover - Databricks runtime
    """Databricks generate: build synthetic_* tables for downstream Spark stages."""
    run_id = dbutils.jobs.taskValues.get(taskKey="setup", key="run_id", default="manual-run")
    rng = random.Random(42)
    base_date = date(2025, 1, 1)
    properties: list[dict[str, Any]] = []
    vendors: list[dict[str, Any]] = []
    units: list[dict[str, Any]] = []
    inspections: list[dict[str, Any]] = []
    work_orders: list[dict[str, Any]] = []
    turns: list[dict[str, Any]] = []
    incidents: list[dict[str, Any]] = []

    for idx in range(1, 16):
        market, state, county_fips = _SPARK_MARKETS[idx % len(_SPARK_MARKETS)]
        vendors.append(
            {
                "vendor_id": f"vendor-{idx:03d}",
                "vendor_name": f"{market} Facilities Partner {idx:02d}",
                "market": market,
                "state": state,
                "county_fips": county_fips,
                "capacity_index": round(rng.uniform(0.45, 0.98), 3),
                "synthetic_data": True,
            }
        )

    for prop_idx in range(1, 251):
        market, state, county_fips = _SPARK_MARKETS[prop_idx % len(_SPARK_MARKETS)]
        property_id = f"prop-{prop_idx:04d}"
        unit_count = 100
        year_built = rng.randint(1978, 2021)
        roof_age = max(1, 2026 - year_built - rng.randint(0, 15))
        hvac_age = max(1, rng.randint(2, 24))
        vendor = vendors[prop_idx % len(vendors)]
        weather_sensitivity = min(1.0, 0.15 + roof_age / 50 + hvac_age / 40 + rng.random() * 0.15)
        properties.append(
            {
                "property_id": property_id,
                "property_name": f"{market} Weather Ridge {prop_idx:03d}",
                "market": market,
                "state": state,
                "county_fips": county_fips,
                "unit_count": unit_count,
                "year_built": year_built,
                "roof_age_years": roof_age,
                "hvac_age_years": hvac_age,
                "flood_zone_flag": rng.random() < 0.18,
                "maintenance_staff_count": max(1, unit_count // rng.randint(80, 140)),
                "primary_vendor_id": vendor["vendor_id"],
                "weather_sensitivity": round(weather_sensitivity, 3),
                "synthetic_data": True,
            }
        )
        for unit_idx in range(1, 101):
            units.append(
                {
                    "unit_id": f"unit-{prop_idx:04d}-{unit_idx:04d}",
                    "property_id": property_id,
                    "last_inspection_score": max(50, min(100, int(rng.gauss(86 - weather_sensitivity * 16, 8)))),
                    "prior_work_order_count_12m": max(0, int(rng.gauss(3 + weather_sensitivity * 4, 2))),
                    "synthetic_data": True,
                }
            )
        for insp_idx in range(1, 17):
            score = max(50, min(100, int(rng.gauss(84 - weather_sensitivity * 16, 8))))
            inspections.append(
                {
                    "inspection_id": f"insp-{prop_idx:04d}-{insp_idx:03d}",
                    "property_id": property_id,
                    "unit_id": f"unit-{prop_idx:04d}-{rng.randint(1, 100):04d}",
                    "inspection_date": (base_date + timedelta(days=rng.randint(0, 360))).isoformat(),
                    "overall_score": score,
                    "synthetic_data": True,
                }
            )
        for wo_idx in range(1, 31):
            category = rng.choice(["hvac", "plumbing", "roof", "moisture", "electrical", "turn", "exterior"])
            opened = base_date + timedelta(days=rng.randint(0, 364))
            weather_related = rng.random() < weather_sensitivity * (
                0.42 if category in {"roof", "moisture", "hvac"} else 0.18
            )
            emergency = rng.random() < (0.12 + weather_sensitivity * 0.25 if weather_related else 0.08)
            age_days = max(1, int(rng.gauss(5 + weather_sensitivity * 12, 4)))
            assigned_vendor = rng.choice(vendors)
            sla_breached = age_days > 10 or assigned_vendor["capacity_index"] < 0.55
            wo_id = f"wo-{prop_idx:04d}-{wo_idx:04d}"
            work_orders.append(
                {
                    "work_order_id": wo_id,
                    "property_id": property_id,
                    "unit_id": f"unit-{prop_idx:04d}-{rng.randint(1, 100):04d}",
                    "opened_at": opened.isoformat(),
                    "category": category,
                    "emergency_flag": emergency,
                    "weather_related_flag": weather_related,
                    "vendor_id": assigned_vendor["vendor_id"],
                    "sla_breached_flag": sla_breached,
                    "reopened_flag": rng.random() < (0.05 + weather_sensitivity * 0.18),
                    "synthetic_data": True,
                }
            )
            if emergency or sla_breached:
                incidents.append(
                    {
                        "incident_id": f"incident-{prop_idx:04d}-{wo_idx:04d}",
                        "property_id": property_id,
                        "unit_id": f"unit-{prop_idx:04d}-{rng.randint(1, 100):04d}",
                        "incident_date": (opened + timedelta(days=1)).isoformat(),
                        "incident_type": rng.choice(["comfort", "access", "water", "safety"]),
                        "linked_work_order_id": wo_id,
                        "synthetic_data": True,
                    }
                )
        for turn_idx in range(1, 7):
            weather_delay = rng.random() < weather_sensitivity * 0.25
            vendor_delay = vendor["capacity_index"] < 0.58 and rng.random() < 0.55
            delay_days = int(weather_delay) * rng.randint(2, 12) + int(vendor_delay) * rng.randint(2, 10)
            turns.append(
                {
                    "turn_id": f"turn-{prop_idx:04d}-{turn_idx:03d}",
                    "property_id": property_id,
                    "unit_id": f"unit-{prop_idx:04d}-{rng.randint(1, 100):04d}",
                    "delay_days": delay_days,
                    "weather_delay_flag": weather_delay,
                    "vendor_delay_flag": vendor_delay,
                    "synthetic_data": True,
                }
            )

    tables = {
        "properties": properties,
        "units": units,
        "vendors": vendors,
        "inspections": inspections,
        "work_orders": work_orders,
        "make_ready_turns": turns,
        "resident_incidents": incidents,
    }
    for name, rows in tables.items():
        spark.createDataFrame(rows).write.mode("overwrite").saveAsTable(f"synthetic_{name}")
    return {
        "run_id": run_id,
        "properties": len(properties),
        "units": len(units),
        "work_orders": len(work_orders),
        "synthetic_data": True,
    }
