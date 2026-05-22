from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from weather_risk import generate_synthetic_property_ops


def test_synthetic_property_ops_counts_and_flags() -> None:
    dataset = generate_synthetic_property_ops(property_count=25, unit_count=2500, random_seed=42)
    assert len(dataset["properties"]) == 25
    assert len(dataset["units"]) == 2500
    assert len(dataset["vendors"]) >= 8
    assert dataset["work_orders"]
    assert all(row["synthetic_data"] for rows in dataset.values() for row in rows)


def test_synthetic_generation_is_deterministic() -> None:
    a = generate_synthetic_property_ops(property_count=5, unit_count=50, random_seed=7)
    b = generate_synthetic_property_ops(property_count=5, unit_count=50, random_seed=7)
    assert a["properties"] == b["properties"]
    assert a["work_orders"] == b["work_orders"]
