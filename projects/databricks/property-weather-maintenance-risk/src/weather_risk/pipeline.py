"""Local-path pipeline entrypoints — legacy-compatible import surface.

The stage logic now lives in `weather_risk.stages.*` and is orchestrated by
`weather_risk.runner.run_pipeline`. This module keeps `generate_local_outputs`
and `validate_local_contract` importable at their original paths and
signatures, because `scripts/validate_outputs.py` and the test suite depend on
them. Behavior is unchanged — these are thin delegations.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .config import DEFAULT_CONFIG, WeatherRiskConfig
from .contracts import DEMO_CAVEAT
from .runner import run_pipeline
from .synthetic_ops import generate_synthetic_property_ops

__all__ = ["generate_local_outputs", "validate_local_contract"]


def validate_local_contract() -> dict[str, Any]:
    """Validate the synthetic dataset satisfies the local contract shape.

    Unchanged from the original implementation.
    """
    dataset = generate_synthetic_property_ops()
    checks = {
        "properties": len(dataset["properties"]) == DEFAULT_CONFIG.synthetic_property_count,
        "units": len(dataset["units"]) == DEFAULT_CONFIG.synthetic_unit_count,
        "vendors": len(dataset["vendors"]) >= 8,
        "inspections": len(dataset["inspections"]) > 0,
        "work_orders": len(dataset["work_orders"]) > 0,
        "make_ready_turns": len(dataset["make_ready_turns"]) > 0,
        "resident_incidents": len(dataset["resident_incidents"]) > 0,
    }
    failed = [name for name, ok in checks.items() if not ok]
    if failed:
        raise RuntimeError(f"Local contract failed: {', '.join(failed)}")
    return {"ok": True, "checks": checks, "caveat": DEMO_CAVEAT}


def generate_local_outputs(
    out_dir: Path, config: WeatherRiskConfig = DEFAULT_CONFIG
) -> dict[str, Any]:
    """Generate the full local-contract output set into `out_dir`.

    Thin delegation to `runner.run_pipeline`; signature and return shape are
    unchanged from the original `pipeline.generate_local_outputs`.
    """
    return run_pipeline(config, out_dir=out_dir)
