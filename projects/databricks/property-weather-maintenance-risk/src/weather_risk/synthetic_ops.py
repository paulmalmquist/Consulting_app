from __future__ import annotations

import random
from datetime import date, timedelta
from typing import Any

from .contracts import DEFAULT_CONFIG


MARKETS = [
    ("Atlanta", "GA", "13121"),
    ("Dallas", "TX", "48113"),
    ("Tampa", "FL", "12057"),
    ("Phoenix", "AZ", "04013"),
    ("Charlotte", "NC", "37119"),
    ("Denver", "CO", "08031"),
    ("Nashville", "TN", "47037"),
    ("Raleigh", "NC", "37183"),
]


def generate_synthetic_property_ops(
    *,
    property_count: int = DEFAULT_CONFIG.synthetic_property_count,
    unit_count: int = DEFAULT_CONFIG.synthetic_unit_count,
    random_seed: int = DEFAULT_CONFIG.random_seed,
) -> dict[str, list[dict[str, Any]]]:
    rng = random.Random(random_seed)
    properties: list[dict[str, Any]] = []
    units: list[dict[str, Any]] = []
    vendors: list[dict[str, Any]] = []
    inspections: list[dict[str, Any]] = []
    inspection_items: list[dict[str, Any]] = []
    work_orders: list[dict[str, Any]] = []
    make_ready_turns: list[dict[str, Any]] = []
    resident_incidents: list[dict[str, Any]] = []

    for idx in range(1, 21):
        market, state, county_fips = MARKETS[idx % len(MARKETS)]
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

    base_date = date(2025, 1, 1)
    units_per_property = max(1, unit_count // property_count)
    extra_units = unit_count % property_count

    for prop_idx in range(1, property_count + 1):
        market, state, county_fips = MARKETS[prop_idx % len(MARKETS)]
        property_id = f"prop-{prop_idx:04d}"
        property_units = units_per_property + (1 if prop_idx <= extra_units else 0)
        year_built = rng.randint(1978, 2021)
        roof_age = max(1, 2026 - year_built - rng.randint(0, 15))
        hvac_age = max(1, rng.randint(2, 24))
        primary_vendor = vendors[prop_idx % len(vendors)]
        maintenance_staff_count = max(1, property_units // rng.randint(80, 140))
        weather_sensitivity = min(1.0, 0.15 + roof_age / 50 + hvac_age / 40 + rng.random() * 0.15)

        properties.append(
            {
                "property_id": property_id,
                "property_name": f"{market} Weather Ridge {prop_idx:03d}",
                "owner": "Synthetic Multifamily Holdings",
                "market": market,
                "state": state,
                "county": f"{market} County",
                "county_fips": county_fips,
                "unit_count": property_units,
                "year_built": year_built,
                "asset_class": rng.choice(["A", "B", "C"]),
                "construction_type": rng.choice(["garden", "mid-rise", "wrap", "townhome"]),
                "roof_age_years": roof_age,
                "hvac_age_years": hvac_age,
                "flood_zone_flag": rng.random() < 0.18,
                "insurance_deductible_band": rng.choice(["low", "medium", "high"]),
                "maintenance_staff_count": maintenance_staff_count,
                "primary_vendor_id": primary_vendor["vendor_id"],
                "weather_sensitivity": round(weather_sensitivity, 3),
                "synthetic_data": True,
            }
        )

        for unit_idx in range(1, property_units + 1):
            unit_id = f"unit-{prop_idx:04d}-{unit_idx:04d}"
            prior_wo = max(0, int(rng.gauss(3 + weather_sensitivity * 4, 2)))
            emergency_prior = int(prior_wo * rng.uniform(0.08, 0.22))
            units.append(
                {
                    "unit_id": unit_id,
                    "property_id": property_id,
                    "floor": rng.randint(1, 4),
                    "bedrooms": rng.choice([0, 1, 1, 2, 2, 3]),
                    "bathrooms": rng.choice([1, 1, 2, 2, 2.5]),
                    "last_inspection_score": max(50, min(100, int(rng.gauss(86 - weather_sensitivity * 16, 8)))),
                    "last_turn_date": (base_date - timedelta(days=rng.randint(1, 720))).isoformat(),
                    "occupied_flag": rng.random() > 0.08,
                    "resident_tenure_months": rng.randint(1, 84),
                    "prior_work_order_count_12m": prior_wo,
                    "prior_emergency_work_order_count_12m": emergency_prior,
                    "synthetic_data": True,
                }
            )

        sampled_units = [unit for unit in units if unit["property_id"] == property_id][: min(24, property_units)]
        for insp_idx, unit in enumerate(sampled_units, start=1):
            score = unit["last_inspection_score"]
            inspection_id = f"insp-{prop_idx:04d}-{insp_idx:03d}"
            risk = (100 - score) / 100 + weather_sensitivity * 0.45
            inspections.append(
                {
                    "inspection_id": inspection_id,
                    "property_id": property_id,
                    "unit_id": unit["unit_id"],
                    "inspection_date": (base_date + timedelta(days=rng.randint(0, 360))).isoformat(),
                    "inspection_type": rng.choice(["annual", "storm follow-up", "make-ready", "preventive"]),
                    "overall_score": score,
                    "life_safety_flag": rng.random() < risk * 0.12,
                    "water_intrusion_flag": rng.random() < risk * 0.28,
                    "roof_issue_flag": rng.random() < risk * 0.22,
                    "hvac_issue_flag": rng.random() < risk * 0.32,
                    "electrical_issue_flag": rng.random() < risk * 0.12,
                    "mold_moisture_flag": rng.random() < risk * 0.18,
                    "photo_count": rng.randint(4, 28),
                    "notes_length": rng.randint(80, 950),
                    "synthetic_data": True,
                }
            )
            for category in ["hvac", "roof", "moisture", "life_safety"]:
                if rng.random() < risk * 0.55:
                    inspection_items.append(
                        {
                            "inspection_item_id": f"item-{inspection_id}-{category}",
                            "inspection_id": inspection_id,
                            "property_id": property_id,
                            "unit_id": unit["unit_id"],
                            "category": category,
                            "severity": rng.choice(["low", "medium", "high"]),
                            "synthetic_data": True,
                        }
                    )

        for wo_idx in range(1, max(8, property_units // 4) + 1):
            category = rng.choice(["hvac", "plumbing", "roof", "moisture", "electrical", "turn", "exterior"])
            opened = base_date + timedelta(days=rng.randint(0, 364))
            weather_related = rng.random() < weather_sensitivity * (0.42 if category in {"roof", "moisture", "hvac"} else 0.18)
            emergency = rng.random() < (0.12 + weather_sensitivity * 0.25 if weather_related else 0.08)
            age_days = max(1, int(rng.gauss(5 + weather_sensitivity * 12, 4)))
            vendor = rng.choice(vendors)
            sla_breached = age_days > 10 or vendor["capacity_index"] < 0.55
            work_orders.append(
                {
                    "work_order_id": f"wo-{prop_idx:04d}-{wo_idx:04d}",
                    "property_id": property_id,
                    "unit_id": f"unit-{prop_idx:04d}-{rng.randint(1, property_units):04d}",
                    "opened_at": opened.isoformat(),
                    "closed_at": (opened + timedelta(days=age_days)).isoformat(),
                    "category": category,
                    "priority": "emergency" if emergency else rng.choice(["standard", "urgent"]),
                    "emergency_flag": emergency,
                    "weather_related_flag": weather_related,
                    "vendor_id": vendor["vendor_id"],
                    "labor_hours": round(rng.uniform(1, 12), 2),
                    "parts_cost": round(rng.uniform(40, 2400), 2),
                    "total_cost": round(rng.uniform(120, 4500), 2),
                    "sla_breached_flag": sla_breached,
                    "reopened_flag": rng.random() < (0.05 + weather_sensitivity * 0.18),
                    "synthetic_data": True,
                }
            )
            if emergency or sla_breached:
                resident_incidents.append(
                    {
                        "incident_id": f"incident-{prop_idx:04d}-{wo_idx:04d}",
                        "property_id": property_id,
                        "unit_id": f"unit-{prop_idx:04d}-{rng.randint(1, property_units):04d}",
                        "incident_date": (opened + timedelta(days=1)).isoformat(),
                        "incident_type": rng.choice(["comfort", "access", "water", "safety"]),
                        "linked_work_order_id": f"wo-{prop_idx:04d}-{wo_idx:04d}",
                        "synthetic_data": True,
                    }
                )

        for turn_idx in range(1, max(3, property_units // 30) + 1):
            move_out = base_date + timedelta(days=rng.randint(0, 330))
            weather_delay = rng.random() < weather_sensitivity * 0.25
            vendor_delay = primary_vendor["capacity_index"] < 0.58 and rng.random() < 0.55
            inspection_rework = rng.random() < weather_sensitivity * 0.2
            delay_days = int(weather_delay) * rng.randint(2, 12) + int(vendor_delay) * rng.randint(2, 10) + int(inspection_rework) * rng.randint(1, 8)
            make_ready_turns.append(
                {
                    "turn_id": f"turn-{prop_idx:04d}-{turn_idx:03d}",
                    "property_id": property_id,
                    "unit_id": f"unit-{prop_idx:04d}-{rng.randint(1, property_units):04d}",
                    "move_out_date": move_out.isoformat(),
                    "target_ready_date": (move_out + timedelta(days=7)).isoformat(),
                    "actual_ready_date": (move_out + timedelta(days=7 + delay_days)).isoformat(),
                    "delay_days": delay_days,
                    "weather_delay_flag": weather_delay,
                    "vendor_delay_flag": vendor_delay,
                    "inspection_rework_flag": inspection_rework,
                    "synthetic_data": True,
                }
            )

    return {
        "properties": properties,
        "units": units,
        "vendors": vendors,
        "inspections": inspections,
        "inspection_items": inspection_items,
        "work_orders": work_orders,
        "make_ready_turns": make_ready_turns,
        "resident_incidents": resident_incidents,
    }
