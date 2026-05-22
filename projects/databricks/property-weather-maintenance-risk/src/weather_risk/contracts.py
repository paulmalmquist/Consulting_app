"""Output, chart, and event contracts for the pipeline.

`WeatherRiskConfig` and `DEFAULT_CONFIG` moved to `config.py`; they are
re-exported here so existing `from weather_risk.contracts import ...` imports
keep working unchanged.
"""
from __future__ import annotations

from .config import DEFAULT_CONFIG, SUPPORTED_EVENT_TYPES, WeatherRiskConfig

__all__ = [
    "DEFAULT_CONFIG",
    "DEMO_CAVEAT",
    "REQUIRED_CHARTS",
    "REQUIRED_OUTPUTS",
    "SUPPORTED_EVENT_TYPES",
    "WeatherRiskConfig",
]


DEMO_CAVEAT = "Public weather concepts and synthetic property operations data. Not HappyCo production data."

REQUIRED_CHARTS = [
    "damage_by_event_type.png",
    "actual_vs_predicted_damage.png",
    "residual_distribution.png",
    "classifier_roc_curve.png",
    "feature_importance.png",
    "damage_error_by_state.png",
    "county_risk_top_50.png",
    "monthly_damage_trend.png",
    "weather_ops_risk_by_market.png",
    "property_maintenance_surge_top_50.png",
    "inspection_failure_risk_by_asset_age.png",
    "make_ready_delay_risk_by_market.png",
]

REQUIRED_OUTPUTS = [
    "run_config.json",
    "source_status.json",
    "gold_property_weather_ops_features.csv",
    "gold_property_maintenance_risk_predictions.csv",
    "model_metrics.json",
    "artifact_manifest.json",
    "run_receipt.md",
]
