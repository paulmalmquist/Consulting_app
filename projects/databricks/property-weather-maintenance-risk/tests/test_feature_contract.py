from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from weather_risk.pipeline import generate_local_outputs, validate_local_contract


def test_local_contract_validation_passes() -> None:
    result = validate_local_contract()
    assert result["ok"] is True


def test_generated_outputs_have_required_contract(tmp_path: Path) -> None:
    result = generate_local_outputs(tmp_path)
    assert result["ok"] is True
    assert (tmp_path / "gold_property_weather_ops_features.csv").exists()
    assert (tmp_path / "gold_property_maintenance_risk_predictions.csv").exists()
    assert (tmp_path / "model_metrics.json").exists()
    assert (tmp_path / "charts" / "property_maintenance_surge_top_50.png").stat().st_size > 0
